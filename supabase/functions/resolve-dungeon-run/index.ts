// Edge Function : resolve-dungeon-run
// Résout un DONJON multi-combats côté serveur (anti-triche) et renvoie de quoi
// rejouer le run déjà résolu. La séquence de combats, la regen inter-combat et
// le loot sont calculés par /shared/progression/dungeon.ts (pur, déterministe).
//
// Supporte l'EMPRUNT de héros (hero sharing) : un hero_id non possédé par
// l'appelant est utilisé via un SNAPSHOT figé (buildHeroSnapshot) et journalisé
// dans hero_loans. Le héros du propriétaire n'est jamais modifié.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import type { CombatantInput } from '@shared/combat/index.ts';
import { buildHeroSnapshot, type HeroSnapshotInput } from '@shared/progression/heroLoan.ts';
import { computeSetBonuses } from '@shared/progression/sets.ts';
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

const HERO_SELECT =
  'id, name, class_id, level, owner_id, alloc_hp, alloc_atk, alloc_def, alloc_speed, skills, ' +
  'bonus_hp, bonus_atk, bonus_def, bonus_speed, ' +
  'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed), ' +
  'weapon:items!heroes_equipped_weapon_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), ' +
  'armor:items!heroes_equipped_armor_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), ' +
  'jewel:items!heroes_equipped_jewel_id_fkey(atk_bonus, def_bonus, hp_bonus, passive_type, passive_value, set_id), ' +
  'relic:items!heroes_equipped_relic_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id)';

/** Ligne héros (DB) → ingrédients de snapshot (mêmes règles que le build normal). */
// deno-lint-ignore no-explicit-any
function toSnapshotInput(h: any): HeroSnapshotInput {
  const cls = h.cls;
  const sum = (k: string) =>
    (h.weapon?.[k] ?? 0) + (h.armor?.[k] ?? 0) + (h.jewel?.[k] ?? 0) + (h.relic?.[k] ?? 0);
  const setB = computeSetBonuses([h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id]);
  return {
    id: h.id,
    name: h.name,
    classId: h.class_id,
    level: h.level,
    classBase: { hp: cls.base_hp, atk: cls.base_atk, def: cls.base_def, speed: cls.base_speed },
    innate: { hp: h.bonus_hp ?? 0, atk: h.bonus_atk ?? 0, def: h.bonus_def ?? 0, speed: h.bonus_speed ?? 0 },
    alloc: { hp: h.alloc_hp, atk: h.alloc_atk, def: h.alloc_def, speed: h.alloc_speed },
    equipment: { atk: sum('atk_bonus') + setB.atk, def: sum('def_bonus') + setB.def, hp: sum('hp_bonus') + setB.hp },
    jewelPassive:
      h.jewel?.passive_type && (h.jewel?.passive_value ?? 0) > 0
        ? { type: h.jewel.passive_type, value: h.jewel.passive_value / 100 }
        : null,
    skills: (h.skills ?? {}) as Record<string, number>,
  };
}

/** Ensemble des héros engagés dans une activité IDLE (farm 'loop' ou expédition en cours).
 *  Les déploiements 'advance' (assauts manuels) ne réservent PAS les héros. */
async function engagedInActivity(admin: Admin): Promise<Set<string>> {
  const engaged = new Set<string>();
  const { data: deps } = await admin.from('deployments').select('hero_ids').eq('mode', 'loop');
  for (const r of deps ?? []) for (const h of (r.hero_ids as string[]) ?? []) engaged.add(h);
  const { data: exps } = await admin
    .from('expedition_runs')
    .select('hero_ids')
    .eq('status', 'in_progress');
  for (const r of exps ?? []) for (const h of (r.hero_ids as string[]) ?? []) engaged.add(h);
  return engaged;
}

/** Héros déjà empruntés (prêt actif) — pour empêcher le double-emprunt. */
async function activeLoanHeroIds(admin: Admin): Promise<Set<string>> {
  const { data } = await admin
    .from('hero_loans')
    .select('hero_id')
    .gt('expires_at', new Date().toISOString());
  return new Set((data ?? []).map((r: { hero_id: string }) => r.hero_id));
}

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey)
    return json({ error: 'Config serveur manquante' }, 500);

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

  // --- Chargement de TOUS les héros demandés (possédés OU empruntés) ---
  const { data: heroRows } = await admin.from('heroes').select(HERO_SELECT).in('id', unique);
  if (!heroRows || heroRows.length !== unique.length) {
    return json({ error: 'Héros introuvables' }, 404);
  }

  // --- Dispo : aucun héros engagé ailleurs ; emprunts vérifiés (hero sharing check) ---
  const engaged = await engagedInActivity(admin);
  const loanedOut = await activeLoanHeroIds(admin);
  // deno-lint-ignore no-explicit-any
  const borrowed = (heroRows as any[]).filter((h) => h.owner_id !== user.id);
  for (const h of heroRows) {
    if (engaged.has(h.id)) {
      // Vrai pour un héros à soi occupé, comme pour un héros emprunté occupé chez son proprio.
      return json({ error: 'Un héros est déjà engagé dans une autre activité' }, 409);
    }
    // TODO: hero sharing check — restreindre aux amis/guilde quand la notion existera.
    if (h.owner_id !== user.id && loanedOut.has(h.id)) {
      return json({ error: 'Un héros emprunté est déjà prêté à quelqu’un d’autre' }, 409);
    }
  }

  // Donjon.
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

  // --- Escouade : chemin UNIQUE via buildHeroSnapshot (héros normaux ET empruntés) ---
  // deno-lint-ignore no-explicit-any
  const snapshotById = new Map<string, CombatantInput>(
    (heroRows as any[]).map((h) => [h.id, buildHeroSnapshot(toSnapshotInput(h))]),
  );
  // Ordre stable = ordre demandé.
  const squad: CombatantInput[] = unique.map((id) => snapshotById.get(id)!);

  // --- Seed SERVEUR + simulation pure ---
  const seed = Math.floor(Math.random() * 2_147_483_647);
  const run = simulateDungeonRun(seed, squad, dungeon);

  // --- Crédit du loot (complet ou partiel) ---
  const lootMap: Record<string, number> = {};
  for (const drop of run.lootRolled) lootMap[drop.resource] = drop.amount;
  await addResources(admin, user.id, lootMap);

  // --- Persistance du run (service_role, bypass RLS) ---
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

  // --- Journalisation des emprunts (donjon = instantané → prêt one-shot) ---
  // deno-lint-ignore no-explicit-any
  for (const h of borrowed as any[]) {
    await admin.from('hero_loans').insert({
      owner_player_id: h.owner_id,
      hero_id: h.id,
      borrower_player_id: user.id,
      hero_snapshot: snapshotById.get(h.id),
      activity_type: 'dungeon',
      activity_id: inserted?.id ?? null,
      // Donjon résolu dans la requête → le prêt n'a pas de durée persistante.
      expires_at: new Date().toISOString(),
    });
  }

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
