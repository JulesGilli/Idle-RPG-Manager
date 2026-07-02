// Edge Function : resolve-dungeon-run
// Résout un DONJON multi-combats côté serveur (anti-triche) et renvoie de quoi
// rejouer le run déjà résolu. La séquence de combats, la regen inter-combat et
// le loot sont calculés par /shared/progression/dungeon.ts (pur, déterministe).
//
// Le client fournit { dungeon_type_id, hero_ids } — JAMAIS de seed. La seed est
// générée ici, la simulation exécutée en service_role, le résultat persisté dans
// dungeon_runs (le client ne peut pas y écrire), puis le loot crédité.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import type { CombatantInput } from '@shared/combat/index.ts';
import { effectiveStats } from '@shared/progression/formulas.ts';
import { computeAbilities, computePassives, combatRole } from '@shared/progression/skills.ts';
import {
  simulateDungeonRun,
  type DungeonType,
  type LootEntry,
  type DungeonFightDef,
} from '@shared/progression/dungeon.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_TEAM = 5;

type Body = { dungeon_type_id?: unknown; hero_ids?: unknown };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Construit les combattants (stats effectives + passifs bijou/relique + compétences). */
async function buildAllies(
  admin: Admin,
  userId: string,
  heroIds: string[],
): Promise<CombatantInput[]> {
  const { data: heroes } = await admin
    .from('heroes')
    .select(
      'id, name, class_id, level, alloc_hp, alloc_atk, alloc_def, alloc_speed, skills, ' +
        'bonus_hp, bonus_atk, bonus_def, bonus_speed, ' +
        'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed), ' +
        'weapon:items!heroes_equipped_weapon_id_fkey(atk_bonus, def_bonus, hp_bonus), ' +
        'armor:items!heroes_equipped_armor_id_fkey(atk_bonus, def_bonus, hp_bonus), ' +
        'jewel:items!heroes_equipped_jewel_id_fkey(atk_bonus, def_bonus, hp_bonus, passive_type, passive_value), ' +
        'relic:items!heroes_equipped_relic_id_fkey(atk_bonus, def_bonus, hp_bonus)',
    )
    .in('id', heroIds)
    .eq('owner_id', userId);

  // deno-lint-ignore no-explicit-any
  return (heroes ?? []).map((h: any) => {
    const cls = h.cls;
    const sum = (k: string) =>
      (h.weapon?.[k] ?? 0) + (h.armor?.[k] ?? 0) + (h.jewel?.[k] ?? 0) + (h.relic?.[k] ?? 0);
    const stats = effectiveStats(
      {
        hp: Math.max(1, cls.base_hp + (h.bonus_hp ?? 0)),
        atk: Math.max(1, cls.base_atk + (h.bonus_atk ?? 0)),
        def: Math.max(0, cls.base_def + (h.bonus_def ?? 0)),
        speed: Math.max(1, cls.base_speed + (h.bonus_speed ?? 0)),
      },
      h.level,
      { atk: sum('atk_bonus'), def: sum('def_bonus'), hp: sum('hp_bonus') },
      { hp: h.alloc_hp, atk: h.alloc_atk, def: h.alloc_def, speed: h.alloc_speed },
    );
    const learned = (h.skills ?? {}) as Record<string, number>;
    const role = combatRole(h.class_id);
    const abilities = computeAbilities(h.class_id, learned);
    const passives = [
      ...(h.jewel?.passive_type && (h.jewel?.passive_value ?? 0) > 0
        ? [{ type: h.jewel.passive_type, value: h.jewel.passive_value / 100 }]
        : []),
      ...computePassives(h.class_id, learned),
    ];
    return { id: h.id, name: h.name, role, ...stats, passives, abilities };
  });
}

/** Mappe une ligne `dungeon_types` (snake_case) vers le type /shared `DungeonType`. */
// deno-lint-ignore no-explicit-any
function toDungeonType(row: any): DungeonType {
  return {
    id: row.id,
    name: row.name,
    tier: row.tier,
    monsterSequence: (row.monster_sequence ?? []) as DungeonFightDef[],
    regenPctBetweenFights: Number(row.regen_pct_between_fights),
    minibossIndices: (row.miniboss_indices ?? []) as number[],
    bossIndex: row.boss_index,
    lootTableNormal: (row.loot_table_normal ?? []) as LootEntry[],
    lootTableMiniboss: (row.loot_table_miniboss ?? []) as LootEntry[],
    lootTableBoss: (row.loot_table_boss ?? []) as LootEntry[],
  };
}

/** Crédite des matériaux au joueur (upsert sur player_resources). */
async function addResources(
  admin: Admin,
  userId: string,
  resources: Record<string, number>,
): Promise<void> {
  for (const [resource, add] of Object.entries(resources)) {
    if (add <= 0) continue;
    const { data: row } = await admin
      .from('player_resources')
      .select('amount')
      .eq('player_id', userId)
      .eq('resource', resource)
      .maybeSingle();
    await admin
      .from('player_resources')
      .upsert(
        { player_id: userId, resource, amount: (row?.amount ?? 0) + add },
        { onConflict: 'player_id,resource' },
      );
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey)
    return json({ error: 'Config serveur manquante' }, 500);

  // --- Auth : identifier l'appelant via son JWT ---
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Non authentifié' }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Session invalide' }, 401);

  // --- Validation de l'intention ---
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: 'Corps de requête invalide' }, 400);
  }
  const dungeonTypeId = body.dungeon_type_id;
  const heroIds = body.hero_ids;
  if (typeof dungeonTypeId !== 'string') return json({ error: 'dungeon_type_id invalide' }, 400);
  if (!Array.isArray(heroIds) || heroIds.some((h) => typeof h !== 'string')) {
    return json({ error: 'hero_ids invalide' }, 400);
  }
  const unique = [...new Set(heroIds as string[])];
  if (unique.length < 1 || unique.length > MAX_TEAM) {
    return json({ error: `Entre 1 et ${MAX_TEAM} héros` }, 400);
  }

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // --- Ownership : tous les héros appartiennent à l'appelant ---
  const { data: owned } = await admin
    .from('heroes')
    .select('id')
    .in('id', unique)
    .eq('owner_id', user.id);
  if (!owned || owned.length !== unique.length) {
    return json({ error: 'Héros introuvables ou non possédés' }, 403);
  }

  // --- Verrou d'activité : aucun héros déjà engagé (farm/déploiement ou expédition) ---
  const { data: deps } = await admin
    .from('deployments')
    .select('hero_ids')
    .eq('player_id', user.id);
  const { data: exps } = await admin
    .from('expeditions')
    .select('hero_ids')
    .eq('player_id', user.id);
  const busy = new Set<string>();
  for (const row of [...(deps ?? []), ...(exps ?? [])]) {
    for (const h of (row.hero_ids as string[]) ?? []) busy.add(h);
  }
  if (unique.some((h) => busy.has(h))) {
    return json({ error: 'Un héros est déjà engagé dans une autre activité' }, 409);
  }

  // --- Chargement du type de donjon ---
  const { data: dungeonRow, error: dungeonError } = await admin
    .from('dungeon_types')
    .select('*')
    .eq('id', dungeonTypeId)
    .single();
  if (dungeonError || !dungeonRow) return json({ error: 'Donjon introuvable' }, 404);
  const dungeon = toDungeonType(dungeonRow);
  if (dungeon.monsterSequence.length === 0) {
    return json({ error: 'Donjon mal configuré (séquence vide)' }, 400);
  }

  // --- Construction de l'escouade ---
  const squad = await buildAllies(admin, user.id, unique);
  if (squad.length === 0) return json({ error: 'Escouade invalide' }, 400);

  // --- Seed SERVEUR (jamais fournie par le client) + simulation pure ---
  const seed = Math.floor(Math.random() * 2_147_483_647);
  const run = simulateDungeonRun(seed, squad, dungeon);

  // --- Crédit des matériaux (loot complet ou partiel) ---
  const lootMap: Record<string, number> = {};
  for (const drop of run.lootRolled) lootMap[drop.resource] = drop.amount;
  await addResources(admin, user.id, lootMap);

  // --- Persistance du run (service_role, bypass RLS — le client ne peut pas écrire) ---
  const { data: inserted, error: runError } = await admin
    .from('dungeon_runs')
    .insert({
      player_id: user.id,
      dungeon_type_id: dungeon.id,
      hero_ids: unique,
      seed,
      result: { fight_results: run.fightResults, loot: run.lootRolled },
      success: run.success,
      reached_index: run.reachedIndex,
    })
    .select('id')
    .single();
  if (runError) return json({ error: "Échec de l'enregistrement du run" }, 500);

  // --- Réponse : uniquement de quoi REJOUER le run déjà résolu ---
  return json({
    run_id: inserted?.id ?? null,
    success: run.success,
    reached_index: run.reachedIndex,
    seed,
    dungeon: { id: dungeon.id, name: dungeon.name, tier: dungeon.tier },
    fight_results: run.fightResults,
    loot: run.lootRolled,
  });
});
