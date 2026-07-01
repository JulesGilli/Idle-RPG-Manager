// Edge Function : resolve-deployment
// Système maps/niveaux idle. Actions : deploy / undeploy / setmode / claim.
// Loot + matériaux exclusifs à la zone (drop rare). Calcul serveur (anti-triche).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createRng } from '@shared/combat/prng.ts';
import type { CombatantInput } from '@shared/combat/index.ts';
import { effectiveStats, applyXpGain, POINTS_PER_LEVEL } from '@shared/progression/formulas.ts';
import {
  resolveDeploymentBatch,
  fightsForElapsed,
  LOOT_CAP,
  type LevelDef,
} from '@shared/progression/deployment.ts';
import {
  rollLoot,
  rollBossItem,
  materialDropChance,
  BOSS_MATERIAL_CHANCE,
  type ItemDrop,
  type Rarity,
} from '@shared/progression/loot.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_TEAM = 5;
const MAT_ROLL_CAP = 100;

type Body = {
  action?: unknown;
  level_id?: unknown;
  hero_ids?: unknown;
  mode?: unknown;
  deployment_id?: unknown;
};

type EnemyConfig = {
  enemies: { name: string; hp: number; atk: number; def: number; speed: number }[];
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
type Admin = any;

async function buildAllies(
  admin: Admin,
  userId: string,
  heroIds: string[],
): Promise<CombatantInput[]> {
  const { data: heroes } = await admin
    .from('heroes')
    .select(
      'id, name, class_id, level, alloc_hp, alloc_atk, alloc_def, alloc_speed, ' +
        'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed), ' +
        'weapon:items!heroes_equipped_weapon_id_fkey(atk_bonus, def_bonus, hp_bonus), ' +
        'armor:items!heroes_equipped_armor_id_fkey(atk_bonus, def_bonus, hp_bonus), ' +
        'jewel:items!heroes_equipped_jewel_id_fkey(atk_bonus, def_bonus, hp_bonus), ' +
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
      { hp: cls.base_hp, atk: cls.base_atk, def: cls.base_def, speed: cls.base_speed },
      h.level,
      { atk: sum('atk_bonus'), def: sum('def_bonus'), hp: sum('hp_bonus') },
      { hp: h.alloc_hp, atk: h.alloc_atk, def: h.alloc_def, speed: h.alloc_speed },
    );
    const role = h.class_id === 'tank' || h.class_id === 'healer' ? h.class_id : 'dps';
    return { id: h.id, name: h.name, role, ...stats };
  });
}

function toLevelDefs(
  // deno-lint-ignore no-explicit-any
  rows: any[],
): { defs: LevelDef[]; ids: string[]; names: string[] } {
  const defs: LevelDef[] = [];
  const ids: string[] = [];
  const names: string[] = [];
  rows.forEach((l, i) => {
    const cfg = l.enemy_config as EnemyConfig;
    defs.push({
      index: i,
      difficulty: l.difficulty,
      isBoss: !!l.is_boss,
      enemies: cfg.enemies.map((e, k) => ({
        id: `e${i}-${k}`,
        name: e.name,
        role: 'enemy',
        hp: e.hp,
        atk: e.atk,
        def: e.def,
        speed: e.speed,
      })),
    });
    ids.push(l.id);
    names.push(l.name);
  });
  return { defs, ids, names };
}

// deno-lint-ignore no-explicit-any
function itemInsert(userId: string, drop: ItemDrop): any {
  return {
    owner_id: userId,
    item_type: drop.item_type,
    name: drop.name,
    rarity: drop.rarity,
    weight: drop.weight,
    tier: drop.tier,
    atk_bonus: drop.atk_bonus,
    def_bonus: drop.def_bonus,
    hp_bonus: drop.hp_bonus,
    base_atk_bonus: drop.atk_bonus,
    base_def_bonus: drop.def_bonus,
    base_hp_bonus: drop.hp_bonus,
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
    return json({ error: 'Corps invalide' }, 400);
  }
  const action = body.action;

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  if (action === 'deploy') {
    const levelId = body.level_id;
    const heroIds = body.hero_ids;
    const mode = body.mode === 'loop' ? 'loop' : 'advance';
    if (typeof levelId !== 'string') return json({ error: 'level_id invalide' }, 400);
    if (!Array.isArray(heroIds) || heroIds.some((h) => typeof h !== 'string')) {
      return json({ error: 'hero_ids invalide' }, 400);
    }
    const unique = [...new Set(heroIds as string[])];
    if (unique.length < 1 || unique.length > MAX_TEAM) {
      return json({ error: `Entre 1 et ${MAX_TEAM} héros` }, 400);
    }

    const { data: owned } = await admin
      .from('heroes')
      .select('id')
      .in('id', unique)
      .eq('owner_id', user.id);
    if (!owned || owned.length !== unique.length) return json({ error: 'Héros non possédés' }, 403);

    const { data: level } = await admin
      .from('levels')
      .select('id, map_id, level_index')
      .eq('id', levelId)
      .single();
    if (!level) return json({ error: 'Niveau introuvable' }, 404);

    if (level.level_index > 1) {
      const { data: prev } = await admin
        .from('levels')
        .select('id')
        .eq('map_id', level.map_id)
        .eq('level_index', level.level_index - 1)
        .single();
      const { data: cleared } = await admin
        .from('level_progress')
        .select('level_id')
        .eq('player_id', user.id)
        .eq('level_id', prev?.id ?? '')
        .maybeSingle();
      if (!cleared) return json({ error: 'Niveau verrouillé' }, 403);
    }

    const { data: existing } = await admin
      .from('deployments')
      .select('id, hero_ids')
      .eq('player_id', user.id);
    for (const dep of existing ?? []) {
      const remaining = (dep.hero_ids as string[]).filter((h) => !unique.includes(h));
      if (remaining.length === 0) {
        await admin.from('deployments').delete().eq('id', dep.id);
      } else if (remaining.length !== dep.hero_ids.length) {
        await admin.from('deployments').update({ hero_ids: remaining }).eq('id', dep.id);
      }
    }

    const nowIso = new Date().toISOString();
    await admin.from('deployments').insert({
      player_id: user.id,
      level_id: levelId,
      hero_ids: unique,
      mode,
      last_resolved_at: nowIso,
    });
    return json({ ok: true });
  }

  if (action === 'undeploy') {
    if (typeof body.deployment_id !== 'string')
      return json({ error: 'deployment_id invalide' }, 400);
    await admin.from('deployments').delete().eq('id', body.deployment_id).eq('player_id', user.id);
    return json({ ok: true });
  }

  if (action === 'setmode') {
    if (typeof body.deployment_id !== 'string')
      return json({ error: 'deployment_id invalide' }, 400);
    const mode = body.mode === 'loop' ? 'loop' : 'advance';
    await admin
      .from('deployments')
      .update({ mode })
      .eq('id', body.deployment_id)
      .eq('player_id', user.id);
    return json({ ok: true });
  }

  if (action !== 'claim') return json({ error: 'Action inconnue' }, 400);

  const { data: deployments } = await admin
    .from('deployments')
    .select('id, level_id, hero_ids, mode, last_resolved_at, clears_count')
    .eq('player_id', user.id);

  if (!deployments || deployments.length === 0) return json({ results: [], totals: null });

  let totalGold = 0;
  const resAccum: Record<string, number> = {};
  // deno-lint-ignore no-explicit-any
  const results: any[] = [];

  for (const dep of deployments) {
    const { data: curLevel } = await admin
      .from('levels')
      .select('id, map_id, level_index')
      .eq('id', dep.level_id)
      .single();
    if (!curLevel) continue;

    const { data: mapRow } = await admin
      .from('maps')
      .select('theme, resource, boss_resource, max_rarity')
      .eq('id', curLevel.map_id)
      .single();
    if (!mapRow) continue;
    const theme = mapRow.theme as string;
    const maxRarity = mapRow.max_rarity as Rarity;

    const { data: mapLevels } = await admin
      .from('levels')
      .select('id, name, level_index, difficulty, is_boss, enemy_config')
      .eq('map_id', curLevel.map_id)
      .order('level_index', { ascending: true });
    if (!mapLevels || mapLevels.length === 0) continue;

    const { defs, ids, names } = toLevelDefs(mapLevels);
    const startIndex = curLevel.level_index - 1;

    const allies = await buildAllies(admin, user.id, dep.hero_ids as string[]);
    if (allies.length === 0) continue;

    const elapsed = (Date.now() - new Date(dep.last_resolved_at).getTime()) / 1000;
    const fights = fightsForElapsed(elapsed);
    if (fights === 0) continue;
    const seed = Math.floor(Math.random() * 2_147_483_647);

    const batch = resolveDeploymentBatch({
      allies,
      levels: defs,
      startIndex,
      mode: dep.mode === 'loop' ? 'loop' : 'advance',
      fights,
      seed,
    });

    const levelUps: { hero_id: string; levels: number }[] = [];
    if (batch.xpPerHero > 0) {
      const { data: groupHeroes } = await admin
        .from('heroes')
        .select('id, level, xp, stat_points')
        .in('id', dep.hero_ids as string[])
        .eq('owner_id', user.id);
      for (const h of groupHeroes ?? []) {
        const gain = applyXpGain(h.level, h.xp, batch.xpPerHero);
        const update: Record<string, number> = { level: gain.level, xp: gain.xp };
        if (gain.levelsGained > 0) {
          update.stat_points = (h.stat_points ?? 0) + gain.levelsGained * POINTS_PER_LEVEL;
          levelUps.push({ hero_id: h.id, levels: gain.levelsGained });
        }
        await admin.from('heroes').update(update).eq('id', h.id);
      }
    }

    totalGold += batch.gold;

    const rng = createRng((seed ^ 0x9e3779b9) >>> 0);

    // Loot d'équipement.
    // L'équipement ne tombe QUE sur les boss (2 chances par victoire de boss).
    const items: ItemDrop[] = [];
    const lootRolls = Math.min(batch.bossWins * 2, LOOT_CAP);
    for (let i = 0; i < lootRolls; i++) {
      const drop = rollLoot(batch.lootDifficulty, theme, maxRarity, rng);
      if (drop) {
        await admin.from('items').insert(itemInsert(user.id, drop));
        items.push(drop);
      }
    }
    for (let b = 0; b < batch.bossWins; b++) {
      const bossItem = rollBossItem(batch.lootDifficulty, theme, rng);
      if (bossItem) {
        await admin.from('items').insert(itemInsert(user.id, bossItem));
        items.push(bossItem);
      }
    }

    // Matériaux de zone (drop rare) + composant de boss.
    let matDrops = 0;
    const matRolls = Math.min(batch.wins, MAT_ROLL_CAP);
    const matChance = materialDropChance(batch.lootDifficulty);
    for (let i = 0; i < matRolls; i++) {
      if (rng.next() < matChance) matDrops += 1;
    }
    let bossMat = 0;
    for (let b = 0; b < batch.bossWins; b++) {
      if (rng.next() < BOSS_MATERIAL_CHANCE) bossMat += 1;
    }
    if (matDrops > 0) resAccum[mapRow.resource] = (resAccum[mapRow.resource] ?? 0) + matDrops;
    if (bossMat > 0)
      resAccum[mapRow.boss_resource] = (resAccum[mapRow.boss_resource] ?? 0) + bossMat;

    for (const idx of batch.clearedIndices) {
      const lid = ids[idx];
      if (lid) {
        await admin
          .from('level_progress')
          .upsert({ player_id: user.id, level_id: lid }, { onConflict: 'player_id,level_id' });
      }
    }

    const nowIso = new Date().toISOString();
    const endLevelId = ids[batch.endIndex] ?? dep.level_id;
    const sameLevel = endLevelId === dep.level_id;
    const clearsCount = sameLevel ? (dep.clears_count ?? 0) + batch.wins : 0;
    const blocked = batch.wins === 0 && batch.losses > 0;
    const lastCombat = batch.lastCombat
      ? {
          rounds: batch.lastCombat.rounds,
          events: batch.lastCombat.events,
          final_state: batch.lastCombat.finalState,
          result: batch.lastCombat.result,
        }
      : null;
    await admin
      .from('deployments')
      .update({
        level_id: endLevelId,
        last_resolved_at: nowIso,
        last_combat: lastCombat,
        last_wins: batch.wins,
        last_losses: batch.losses,
        last_fights: batch.fights,
        blocked,
        clears_count: clearsCount,
      })
      .eq('id', dep.id);

    results.push({
      deployment_id: dep.id,
      level_name: names[batch.endIndex] ?? '',
      wins: batch.wins,
      losses: batch.losses,
      xp_per_hero: batch.xpPerHero,
      gold: batch.gold,
      items,
      level_ups: levelUps,
      advanced: batch.endIndex - batch.startIndex,
      blocked,
    });
  }

  if (totalGold > 0) {
    const { data: profile } = await admin
      .from('profiles')
      .select('gold')
      .eq('id', user.id)
      .single();
    await admin
      .from('profiles')
      .update({ gold: (profile?.gold ?? 0) + totalGold })
      .eq('id', user.id);
  }

  for (const [resource, add] of Object.entries(resAccum)) {
    if (add <= 0) continue;
    const { data: row } = await admin
      .from('player_resources')
      .select('amount')
      .eq('player_id', user.id)
      .eq('resource', resource)
      .maybeSingle();
    await admin
      .from('player_resources')
      .upsert(
        { player_id: user.id, resource, amount: (row?.amount ?? 0) + add },
        { onConflict: 'player_id,resource' },
      );
  }

  return json({ results, totals: { gold: totalGold, resources: resAccum } });
});
