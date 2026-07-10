// Edge Function : resolve-arc-boss
// BOSS D'ARC : rencontre spéciale qui clôt un arc. La vaincre débloque l'arc
// suivant + son tier de matériaux (ligne player_arc_progress). Réutilise le
// moteur de donjon (simulateDungeonRun) ; calcul 100 % serveur (anti-triche).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import type { CombatantInput } from '@shared/combat/index.ts';
import { buildHeroSnapshot, type HeroSnapshotInput } from '@shared/progression/heroLoan.ts';
import { computeSetBonuses } from '@shared/progression/sets.ts';
import {
  combatBuff,
  NO_COMBAT_BUFF,
  type GuildAlloc,
  type GuildCombatBuff,
} from '@shared/progression/guildSkills.ts';
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

type Body = { arc_boss_id?: unknown; hero_ids?: unknown };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Buff de combat de l'arbre de guilde de l'appelant (neutre si sans guilde). */
async function arcGuildBuff(admin: Admin, userId: string): Promise<GuildCombatBuff> {
  const { data: mem } = await admin
    .from('guild_members')
    .select('guild_id')
    .eq('player_id', userId)
    .maybeSingle();
  if (!mem?.guild_id) return NO_COMBAT_BUFF;
  const { data: g } = await admin.from('guilds').select('skill_alloc').eq('id', mem.guild_id).single();
  return combatBuff((g?.skill_alloc ?? {}) as GuildAlloc);
}

const HERO_SELECT =
  'id, name, class_id, level, owner_id, alloc_hp, alloc_atk, alloc_def, alloc_speed, skills, ' +
  'active_skill_id, ultimate_skill_id, ' +
  'bonus_hp, bonus_atk, bonus_def, bonus_speed, ' +
  'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed), ' +
  'weapon:items!heroes_equipped_weapon_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), ' +
  'armor:items!heroes_equipped_armor_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), ' +
  'jewel:items!heroes_equipped_jewel_id_fkey(atk_bonus, def_bonus, hp_bonus, passive_type, passive_value, set_id), ' +
  'relic:items!heroes_equipped_relic_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id)';

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
    loadout: { activeId: h.active_skill_id ?? null, ultimateId: h.ultimate_skill_id ?? null },
    setIds: [h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id],
  };
}

/** Héros engagés dans une activité idle (farm 'loop' ou expédition en cours). */
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
  const arcBossId = body.arc_boss_id;
  const heroIds = body.hero_ids;
  if (typeof arcBossId !== 'string') return json({ error: 'arc_boss_id invalide' }, 400);
  if (!Array.isArray(heroIds) || heroIds.some((h) => typeof h !== 'string')) {
    return json({ error: 'hero_ids invalide' }, 400);
  }
  const unique = [...new Set(heroIds as string[])];
  if (unique.length < 1 || unique.length > MAX_TEAM) {
    return json({ error: `Entre 1 et ${MAX_TEAM} héros` }, 400);
  }

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // --- Boss d'arc ---
  const { data: bossRow, error: bossErr } = await admin
    .from('arc_bosses')
    .select('*')
    .eq('id', arcBossId)
    .single();
  if (bossErr || !bossRow) return json({ error: "Boss d'arc introuvable" }, 404);

  // Déjà vaincu ? (le gate est à sens unique)
  const { data: already } = await admin
    .from('player_arc_progress')
    .select('gate_boss_id')
    .eq('player_id', user.id)
    .eq('gate_boss_id', arcBossId)
    .maybeSingle();
  if (already) return json({ error: 'Boss d’arc déjà vaincu' }, 409);

  // Arc « prêt » : la dernière zone de l'arc doit être terminée.
  if (bossRow.required_level_id) {
    const { data: prog } = await admin
      .from('level_progress')
      .select('level_id')
      .eq('player_id', user.id)
      .eq('level_id', bossRow.required_level_id)
      .maybeSingle();
    if (!prog) {
      return json({ error: "Termine d'abord toutes les zones de l'arc" }, 403);
    }
  }

  const boss = toDungeonType(bossRow);
  if (boss.monsterSequence.length === 0) {
    return json({ error: "Boss d'arc mal configuré (séquence vide)" }, 400);
  }

  // --- Héros possédés et disponibles ---
  const { data: heroRows } = await admin
    .from('heroes')
    .select(HERO_SELECT)
    .in('id', unique)
    .eq('owner_id', user.id);
  if (!heroRows || heroRows.length !== unique.length) {
    return json({ error: 'Héros introuvables ou non possédés' }, 404);
  }
  const engaged = await engagedInActivity(admin);
  for (const h of heroRows) {
    if (engaged.has(h.id)) {
      return json({ error: 'Un héros est déjà engagé dans une autre activité' }, 409);
    }
  }

  // --- Escouade + simulation serveur (buff de guilde appliqué, hors arène) ---
  const guildBuff = await arcGuildBuff(admin, user.id);
  const snapshotById = new Map<string, CombatantInput>(
    // deno-lint-ignore no-explicit-any
    (heroRows as any[]).map((h) => [h.id, buildHeroSnapshot(toSnapshotInput(h), guildBuff)]),
  );
  const squad: CombatantInput[] = unique.map((id) => snapshotById.get(id)!);
  const seed = Math.floor(Math.random() * 2_147_483_647);
  const run = simulateDungeonRun(seed, squad, boss);

  // --- Victoire : débloque l'arc suivant + crédite le butin ---
  // GATE ATOMIQUE (anti multi-onglets) : on INSÈRE la ligne de progression
  // (contrainte unique player_id,gate_boss_id) au lieu d'un upsert idempotent.
  // Une seule requête réussit l'insert ; une seconde en parallèle échoue sur la
  // contrainte → le butin one-shot de ce boss n'est crédité qu'une fois.
  let gateWon = false;
  if (run.success) {
    const { error: gateErr } = await admin
      .from('player_arc_progress')
      .insert({ player_id: user.id, gate_boss_id: arcBossId });
    gateWon = !gateErr;
    if (gateWon) {
      const lootMap: Record<string, number> = {};
      for (const drop of run.lootRolled) lootMap[drop.resource] = drop.amount;
      await addResources(admin, user.id, lootMap);
    }
  }

  return json({
    success: run.success,
    reached_index: run.reachedIndex,
    seed,
    arc_boss: { id: boss.id, name: boss.name, unlocks_tier: bossRow.unlocks_tier },
    fight_results: run.fightResults,
    loot: gateWon ? run.lootRolled : [],
  });
});
