// Edge Function : resolve-deployment
// Système maps/niveaux. Actions : deploy / undeploy / setmode / claim / fight.
// - mode 'loop'   : farm idle, résolu par batch au claim (aucun équipement,
//                   uniquement or/XP/matériaux — l'équipement vient de la forge).
// - mode 'advance': assauts MANUELS (action 'fight') : un combat résolu côté
//                   serveur, renvoyé au client pour être regardé.
// Calcul serveur (anti-triche).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createRng } from '@shared/combat/prng.ts';
import type { Ability, CombatantInput } from '@shared/combat/index.ts';
import { effectiveStats, applyXpGain, SKILL_POINTS_PER_LEVEL } from '@shared/progression/formulas.ts';
import { accountXpFromHeroXp } from '@shared/progression/account.ts';
import { computeSetBonuses, computeSetAbilities } from '@shared/progression/sets.ts';
import { computeAbilities, computePassives, combatRole } from '@shared/progression/skills.ts';
import {
  resolveDeploymentBatch,
  fightsForElapsed,
  FIGHT_COOLDOWN_SECONDS,
  type LevelDef,
  type DeploymentBatchResult,
} from '@shared/progression/deployment.ts';
import { materialDropChance, BOSS_MATERIAL_CHANCE } from '@shared/progression/loot.ts';
import { gemByMap, GEM_DROP_CHANCE } from '@shared/progression/jewelry.ts';

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
  abandoned?: unknown;
};

type EnemyConfig = {
  enemies: {
    name: string;
    hp: number;
    atk: number;
    def: number;
    speed: number;
    armor?: number;
    abilities?: Ability[];
  }[];
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
      'id, name, class_id, level, alloc_hp, alloc_atk, alloc_def, alloc_speed, skills, ' +
        'active_skill_id, ultimate_skill_id, ' +
        'bonus_hp, bonus_atk, bonus_def, bonus_speed, ' +
        'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed), ' +
        'weapon:items!heroes_equipped_weapon_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), ' +
        'armor:items!heroes_equipped_armor_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), ' +
        'jewel:items!heroes_equipped_jewel_id_fkey(atk_bonus, def_bonus, hp_bonus, passive_type, passive_value, set_id), ' +
        'relic:items!heroes_equipped_relic_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id)',
    )
    .in('id', heroIds)
    .eq('owner_id', userId);

  // deno-lint-ignore no-explicit-any
  return (heroes ?? []).map((h: any) => {
    const cls = h.cls;
    const sum = (k: string) =>
      (h.weapon?.[k] ?? 0) + (h.armor?.[k] ?? 0) + (h.jewel?.[k] ?? 0) + (h.relic?.[k] ?? 0);
    const setIds = [h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id];
    const setB = computeSetBonuses(setIds);
    // Base individuelle = base de classe + roll de naissance (jamais < 1).
    const stats = effectiveStats(
      {
        hp: Math.max(1, cls.base_hp + (h.bonus_hp ?? 0)),
        atk: Math.max(1, cls.base_atk + (h.bonus_atk ?? 0)),
        def: Math.max(0, cls.base_def + (h.bonus_def ?? 0)),
        speed: Math.max(1, cls.base_speed + (h.bonus_speed ?? 0)),
      },
      h.level,
      { atk: sum('atk_bonus') + setB.atk, def: sum('def_bonus') + setB.def, hp: sum('hp_bonus') + setB.hp },
      { hp: h.alloc_hp, atk: h.alloc_atk, def: h.alloc_def, speed: h.alloc_speed },
    );
    const learned = (h.skills ?? {}) as Record<string, number>;
    const loadout = { activeId: h.active_skill_id ?? null, ultimateId: h.ultimate_skill_id ?? null };
    const role = combatRole(h.class_id);
    const abilities = [...computeAbilities(h.class_id, learned, loadout), ...computeSetAbilities(setIds)];
    // Passifs de combat : bijou équipé (valeur % entiers → fraction) + compétences.
    const passives = [
      ...(h.jewel?.passive_type && (h.jewel?.passive_value ?? 0) > 0
        ? [{ type: h.jewel.passive_type, value: h.jewel.passive_value / 100 }]
        : []),
      ...computePassives(h.class_id, learned, loadout),
    ];
    return { id: h.id, name: h.name, role, ...stats, passives, abilities };
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
        armor: e.armor,
        abilities: e.abilities,
      })),
    });
    ids.push(l.id);
    names.push(l.name);
  });
  return { defs, ids, names };
}

type DeploymentContext = {
  mapRow: { id: string; resource: string; boss_resource: string };
  defs: LevelDef[];
  ids: string[];
  names: string[];
  startIndex: number;
  allies: CombatantInput[];
};

/** Charge la map, les niveaux et l'équipe d'un déploiement. */
async function loadContext(
  admin: Admin,
  userId: string,
  // deno-lint-ignore no-explicit-any
  dep: any,
): Promise<DeploymentContext | null> {
  const { data: curLevel } = await admin
    .from('levels')
    .select('id, map_id, level_index')
    .eq('id', dep.level_id)
    .single();
  if (!curLevel) return null;

  const { data: mapRow } = await admin
    .from('maps')
    .select('id, resource, boss_resource')
    .eq('id', curLevel.map_id)
    .single();
  if (!mapRow) return null;

  const { data: mapLevels } = await admin
    .from('levels')
    .select('id, name, level_index, difficulty, is_boss, enemy_config')
    .eq('map_id', curLevel.map_id)
    .order('level_index', { ascending: true });
  if (!mapLevels || mapLevels.length === 0) return null;

  const { defs, ids, names } = toLevelDefs(mapLevels);
  const allies = await buildAllies(admin, userId, dep.hero_ids as string[]);
  if (allies.length === 0) return null;

  return { mapRow, defs, ids, names, startIndex: curLevel.level_index - 1, allies };
}

type SettleResult = {
  levelUps: { hero_id: string; levels: number }[];
  resources: Record<string, number>;
  blocked: boolean;
  endLevelName: string;
};

/** Tire les matériaux/gemmes d'un batch (déterministe pour un seed donné). */
function rollBatchResources(
  ctx: DeploymentContext,
  batch: DeploymentBatchResult,
  seed: number,
): Record<string, number> {
  const rng = createRng((seed ^ 0x9e3779b9) >>> 0);
  const resources: Record<string, number> = {};
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
  if (matDrops > 0) resources[ctx.mapRow.resource] = matDrops;
  if (bossMat > 0)
    resources[ctx.mapRow.boss_resource] = (resources[ctx.mapRow.boss_resource] ?? 0) + bossMat;
  const gem = gemByMap(ctx.mapRow.id);
  if (gem) {
    let gemDrops = 0;
    for (let b = 0; b < batch.bossWins; b++) {
      if (rng.next() < GEM_DROP_CHANCE) gemDrops += 1;
    }
    if (gemDrops > 0) resources[gem.id] = (resources[gem.id] ?? 0) + gemDrops;
  }
  return resources;
}

/** Applique l'XP d'un batch aux héros du groupe (+ XP de compte). Renvoie les level-ups. */
async function applyXp(
  admin: Admin,
  userId: string,
  heroIds: string[],
  xpPerHero: number,
): Promise<{ hero_id: string; levels: number }[]> {
  const levelUps: { hero_id: string; levels: number }[] = [];
  if (xpPerHero <= 0) return levelUps;
  const { data: groupHeroes } = await admin
    .from('heroes')
    .select('id, level, xp, skill_points')
    .in('id', heroIds)
    .eq('owner_id', userId);
  let ownedCount = 0;
  for (const h of groupHeroes ?? []) {
    ownedCount += 1;
    const gain = applyXpGain(h.level, h.xp, xpPerHero);
    const update: Record<string, number> = { level: gain.level, xp: gain.xp };
    if (gain.levelsGained > 0) {
      update.skill_points = (h.skill_points ?? 0) + gain.levelsGained * SKILL_POINTS_PER_LEVEL;
      levelUps.push({ hero_id: h.id, levels: gain.levelsGained });
    }
    await admin.from('heroes').update(update).eq('id', h.id);
  }
  await addAccountXp(admin, userId, accountXpFromHeroXp(xpPerHero * ownedCount));
  return levelUps;
}

/**
 * Applique le résultat d'un batch : XP/level-ups, matériaux, progression des
 * niveaux et mise à jour de la ligne deployment. L'or et les ressources sont
 * retournés au caller (écriture groupée). Utilisé par le mode BOUCLE (claim).
 */
async function settleBatch(
  admin: Admin,
  userId: string,
  // deno-lint-ignore no-explicit-any
  dep: any,
  ctx: DeploymentContext,
  batch: DeploymentBatchResult,
  seed: number,
): Promise<SettleResult> {
  const levelUps = await applyXp(admin, userId, dep.hero_ids as string[], batch.xpPerHero);
  const resources = rollBatchResources(ctx, batch, seed);

  for (const idx of batch.clearedIndices) {
    const lid = ctx.ids[idx];
    if (lid) {
      await admin
        .from('level_progress')
        .upsert({ player_id: userId, level_id: lid }, { onConflict: 'player_id,level_id' });
    }
  }

  const nowIso = new Date().toISOString();
  const endLevelId = ctx.ids[batch.endIndex] ?? dep.level_id;
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

  return { levelUps, resources, blocked, endLevelName: ctx.names[batch.endIndex] ?? '' };
}

async function addGold(admin: Admin, userId: string, gold: number): Promise<void> {
  if (gold <= 0) return;
  const { data: profile } = await admin.from('profiles').select('gold').eq('id', userId).single();
  await admin
    .from('profiles')
    .update({ gold: (profile?.gold ?? 0) + gold })
    .eq('id', userId);
}

async function addAccountXp(admin: Admin, userId: string, xp: number): Promise<void> {
  if (xp <= 0) return;
  const { data: profile } = await admin
    .from('profiles')
    .select('account_xp')
    .eq('id', userId)
    .single();
  await admin
    .from('profiles')
    .update({ account_xp: (profile?.account_xp ?? 0) + xp })
    .eq('id', userId);
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

    // Exclusivité des activités IDLE : un héros en expédition ne peut pas être mis
    // en farm 'loop' (double idle). Le mode 'advance' (manuel) reste libre.
    if (mode === 'loop') {
      const { data: activeExp } = await admin
        .from('expedition_runs')
        .select('hero_ids')
        .eq('player_id', user.id)
        .eq('status', 'in_progress');
      const onExpedition = new Set<string>();
      for (const r of activeExp ?? []) for (const h of (r.hero_ids as string[]) ?? []) onExpedition.add(h);
      if (unique.some((h) => onExpedition.has(h))) {
        return json({ error: 'Un héros est en expédition' }, 409);
      }
    }

    const { data: level } = await admin
      .from('levels')
      .select('id, map_id, level_index')
      .eq('id', levelId)
      .single();
    if (!level) return json({ error: 'Niveau introuvable' }, 404);

    if (level.level_index > 1) {
      // Verrou intra-zone : le niveau précédent de la même zone doit être terminé.
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
    } else {
      // Verrou de zone : le niveau 1 exige que la ZONE PRÉCÉDENTE (sort-1) soit
      // entièrement terminée (son boss = dernier niveau vaincu).
      const { data: curMap } = await admin
        .from('maps')
        .select('id, sort')
        .eq('id', level.map_id)
        .single();
      if (curMap && curMap.sort > 1) {
        const { data: prevMap } = await admin
          .from('maps')
          .select('id')
          .eq('sort', curMap.sort - 1)
          .maybeSingle();
        if (prevMap) {
          const { data: prevLevels } = await admin
            .from('levels')
            .select('id')
            .eq('map_id', prevMap.id)
            .order('level_index', { ascending: false })
            .limit(1);
          const prevBoss = prevLevels?.[0];
          if (prevBoss) {
            const { data: prevCleared } = await admin
              .from('level_progress')
              .select('level_id')
              .eq('player_id', user.id)
              .eq('level_id', prevBoss.id)
              .maybeSingle();
            if (!prevCleared) {
              return json({ error: "Termine la zone précédente d'abord" }, 403);
            }
          }
        }
      }
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

    // En mode 'advance', on antidate du cooldown pour permettre un premier
    // assaut immédiat.
    const startAt =
      mode === 'advance' ? new Date(Date.now() - FIGHT_COOLDOWN_SECONDS * 1000) : new Date();
    await admin.from('deployments').insert({
      player_id: user.id,
      level_id: levelId,
      hero_ids: unique,
      mode,
      last_resolved_at: startAt.toISOString(),
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
    // Repart d'un compteur propre : pas d'idle hérité en passant en 'loop',
    // premier assaut immédiat en passant en 'advance'.
    const resetAt =
      mode === 'advance' ? new Date(Date.now() - FIGHT_COOLDOWN_SECONDS * 1000) : new Date();
    await admin
      .from('deployments')
      .update({ mode, last_resolved_at: resetAt.toISOString() })
      .eq('id', body.deployment_id)
      .eq('player_id', user.id);
    return json({ ok: true });
  }

  // ---------------------------------------------------------------- FIGHT
  // Assaut manuel (mode 'advance') : UN combat résolu, renvoyé au client
  // pour être regardé en entier.
  if (action === 'fight') {
    if (typeof body.deployment_id !== 'string')
      return json({ error: 'deployment_id invalide' }, 400);

    const { data: dep } = await admin
      .from('deployments')
      .select('id, level_id, hero_ids, mode, last_resolved_at, clears_count')
      .eq('id', body.deployment_id)
      .eq('player_id', user.id)
      .single();
    if (!dep) return json({ error: 'Déploiement introuvable' }, 404);
    if (dep.mode !== 'advance') {
      return json({ error: 'Ce groupe farme en boucle — passe-le en mode ➡ Avancer' }, 400);
    }

    const elapsed = (Date.now() - new Date(dep.last_resolved_at).getTime()) / 1000;
    if (elapsed < FIGHT_COOLDOWN_SECONDS) {
      const wait = Math.ceil(FIGHT_COOLDOWN_SECONDS - elapsed);
      return json({ error: `L'équipe se repositionne — réessaie dans ${wait} s` }, 429);
    }

    const ctx = await loadContext(admin, user.id, dep);
    if (!ctx) return json({ error: 'Déploiement invalide' }, 400);

    const seed = Math.floor(Math.random() * 2_147_483_647);
    const batch = resolveDeploymentBatch({
      allies: ctx.allies,
      levels: ctx.defs,
      startIndex: ctx.startIndex,
      mode: 'advance',
      fights: 1,
      seed,
    });
    if (!batch.lastCombat) return json({ error: 'Combat impossible sur ce niveau' }, 400);

    // On NE valide RIEN maintenant : la victoire n'est appliquée qu'à la
    // confirmation (action 'resolve_fight'). Abandonner = défaite, pas de
    // déblocage. On stocke le résultat calculé et on démarre le cooldown
    // (empêche le farm de seeds en abandonnant les défaites).
    const resources = rollBatchResources(ctx, batch, seed);
    const lastCombat = {
      rounds: batch.lastCombat.rounds,
      events: batch.lastCombat.events,
      final_state: batch.lastCombat.finalState,
      result: batch.lastCombat.result,
    };
    const pending = {
      result: batch.lastCombat.result,
      cleared_level_ids: batch.clearedIndices
        .map((idx) => ctx.ids[idx])
        .filter((x): x is string => Boolean(x)),
      end_level_id: ctx.ids[batch.endIndex] ?? dep.level_id,
      end_level_name: ctx.names[batch.endIndex] ?? '',
      start_level_id: dep.level_id,
      clears_base: dep.clears_count ?? 0,
      xp_per_hero: batch.xpPerHero,
      gold: batch.gold,
      resources,
      wins: batch.wins,
      losses: batch.losses,
      fights: batch.fights,
      last_combat: lastCombat,
    };
    await admin
      .from('deployments')
      .update({ pending_fight: pending, last_resolved_at: new Date().toISOString() })
      .eq('id', dep.id);

    return json({
      result: batch.lastCombat.result,
      pending: true,
      combat: lastCombat,
      rewards: {
        xp_per_hero: batch.xpPerHero,
        gold: batch.gold,
        level_ups: [],
        resources,
        advanced: batch.endIndex - batch.startIndex,
        level_name: ctx.names[batch.endIndex] ?? '',
      },
    });
  }

  // ------------------------------------------------- RESOLVE FIGHT (confirm/abandon)
  // Confirme un assaut regardé jusqu'au bout (victoire appliquée) ou l'abandonne
  // (enregistré perdant, aucun déblocage). Sans ceci, une victoire calculée mais
  // abandonnée resterait acquise.
  if (action === 'resolve_fight') {
    if (typeof body.deployment_id !== 'string')
      return json({ error: 'deployment_id invalide' }, 400);
    const abandoned = body.abandoned === true;

    const { data: dep } = await admin
      .from('deployments')
      .select('id, level_id, hero_ids, clears_count, pending_fight')
      .eq('id', body.deployment_id)
      .eq('player_id', user.id)
      .single();
    if (!dep) return json({ error: 'Déploiement introuvable' }, 404);
    // deno-lint-ignore no-explicit-any
    const p = dep.pending_fight as any;
    if (!p) return json({ ok: true, applied: false });

    const isWin = p.result === 'win' && !abandoned;
    if (!isWin) {
      // Abandon d'un combat gagnable OU vraie défaite → enregistré perdant.
      await admin
        .from('deployments')
        .update({
          pending_fight: null,
          last_combat: p.last_combat ?? null,
          last_wins: 0,
          last_losses: 1,
          last_fights: 1,
          blocked: p.result === 'loss',
        })
        .eq('id', dep.id);
      return json({ ok: true, applied: false, abandoned });
    }

    // Victoire confirmée : on applique tout (XP, or, matériaux, déblocage, avance).
    const levelUps = await applyXp(admin, user.id, dep.hero_ids as string[], p.xp_per_hero ?? 0);
    await addGold(admin, user.id, p.gold ?? 0);
    await addResources(admin, user.id, (p.resources ?? {}) as Record<string, number>);
    for (const lid of (p.cleared_level_ids ?? []) as string[]) {
      await admin
        .from('level_progress')
        .upsert({ player_id: user.id, level_id: lid }, { onConflict: 'player_id,level_id' });
    }
    const sameLevel = p.end_level_id === p.start_level_id;
    const clearsCount = sameLevel ? (p.clears_base ?? 0) + (p.wins ?? 0) : 0;
    await admin
      .from('deployments')
      .update({
        pending_fight: null,
        level_id: p.end_level_id ?? dep.level_id,
        last_combat: p.last_combat ?? null,
        last_wins: p.wins ?? 0,
        last_losses: p.losses ?? 0,
        last_fights: p.fights ?? 1,
        blocked: false,
        clears_count: clearsCount,
      })
      .eq('id', dep.id);

    return json({
      ok: true,
      applied: true,
      rewards: {
        xp_per_hero: p.xp_per_hero ?? 0,
        gold: p.gold ?? 0,
        level_ups: levelUps,
        resources: p.resources ?? {},
        advanced: 0,
        level_name: p.end_level_name ?? '',
      },
    });
  }

  // ---------------------------------------------------------------- CLAIM
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
    // Les groupes en mode 'advance' ne combattent QUE via l'action 'fight'
    // (le joueur regarde ses combats) — seuls les groupes 'loop' farment idle.
    if (dep.mode !== 'loop') continue;

    const ctx = await loadContext(admin, user.id, dep);
    if (!ctx) continue;

    const elapsed = (Date.now() - new Date(dep.last_resolved_at).getTime()) / 1000;
    const fights = fightsForElapsed(elapsed);
    if (fights === 0) continue;
    const seed = Math.floor(Math.random() * 2_147_483_647);

    const batch = resolveDeploymentBatch({
      allies: ctx.allies,
      levels: ctx.defs,
      startIndex: ctx.startIndex,
      mode: 'loop',
      fights,
      seed,
    });

    const settled = await settleBatch(admin, user.id, dep, ctx, batch, seed);
    totalGold += batch.gold;
    for (const [res, amt] of Object.entries(settled.resources)) {
      resAccum[res] = (resAccum[res] ?? 0) + amt;
    }

    results.push({
      deployment_id: dep.id,
      level_name: settled.endLevelName,
      wins: batch.wins,
      losses: batch.losses,
      xp_per_hero: batch.xpPerHero,
      gold: batch.gold,
      level_ups: settled.levelUps,
      advanced: batch.endIndex - batch.startIndex,
      blocked: settled.blocked,
    });
  }

  await addGold(admin, user.id, totalGold);
  await addResources(admin, user.id, resAccum);

  return json({ results, totals: { gold: totalGold, resources: resAccum } });
});
