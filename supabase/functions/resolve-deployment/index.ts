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
import {
  effectiveStats,
  applyXpGain,
  SKILL_POINTS_PER_LEVEL,
  catchUpCapLevel,
  applyCatchUpXpGain,
} from '@shared/progression/formulas.ts';
import { accountXpFromHeroXp } from '@shared/progression/account.ts';
import { computeSetBonuses, computeSetAbilities, equippedSetTier } from '@shared/progression/sets.ts';
import {
  computeAbilities,
  computePassives,
  combatRole,
  classHealMult,
} from '@shared/progression/skills.ts';
import { classDamageBase } from '@shared/progression/damageTypes.ts';
import { weaponCombatAmp, itemCombatPassive } from '@shared/progression/heroLoan.ts';
import { runeAbilities } from '@shared/progression/runes.ts';
import {
  resolveDeploymentBatch,
  fightsForElapsed,
  FIGHT_COOLDOWN_SECONDS,
  type LevelDef,
  type DeploymentBatchResult,
} from '@shared/progression/deployment.ts';
import { materialDropChance, BOSS_MATERIAL_CHANCE } from '@shared/progression/loot.ts';
import { GEM_DROP_CHANCE } from '@shared/progression/jewelry.ts';
import { arcMaterialKey, gemByMapForArc } from '@shared/progression/arcMaterials.ts';
import { BORROW_LIMIT_PER_TEAM, BORROW_MAP_FIGHTS_PER_DAY } from '@shared/progression/garrison.ts';
import {
  combatBuff,
  gainBuff,
  applyCombatBuff,
  type GuildAlloc,
  type GuildCombatBuff,
} from '@shared/progression/guildSkills.ts';
import { activeEvent, parseEventConfig, type ActiveEvent } from '@shared/progression/events.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_TEAM = 5;
const MAT_ROLL_CAP = 100;

/** Guilde de l'appelant (ou null s'il n'en a pas). */
async function guildIdOf(admin: Admin, userId: string): Promise<string | null> {
  const { data } = await admin
    .from('guild_members')
    .select('guild_id')
    .eq('player_id', userId)
    .maybeSingle();
  return data?.guild_id ?? null;
}

/** Buffs de l'arbre de guilde de l'appelant (combat + gains). Neutre si sans guilde. */
async function guildBuffsOf(
  admin: Admin,
  userId: string,
): Promise<{ combat: GuildCombatBuff; gain: { xp: number; gold: number } }> {
  const guildId = await guildIdOf(admin, userId);
  if (!guildId) return { combat: combatBuff({}), gain: gainBuff({}) };
  const { data: g } = await admin.from('guilds').select('skill_alloc').eq('id', guildId).single();
  const alloc = (g?.skill_alloc ?? {}) as GuildAlloc;
  return { combat: combatBuff(alloc), gain: gainBuff(alloc) };
}

/** Applique le buff de gains de guilde (or/XP) à un résultat de batch (mute). */
function buffBatchGains(batch: DeploymentBatchResult, gain: { xp: number; gold: number }): void {
  batch.gold = Math.round(batch.gold * (1 + gain.gold));
  batch.xpPerHero = Math.round(batch.xpPerHero * (1 + gain.xp));
}

/**
 * Événement actif à l'HORLOGE SERVEUR (Date.now() côté Deno). Lit la config dans
 * `app_config` — toute clé absente retombe sur les défauts. Le week-end active le
 * bonus de carte (double XP/or/butin) ; en semaine l'événement est neutre ici
 * (le boss vit dans sa propre fonction).
 */
async function activeMapEvent(admin: Admin): Promise<ActiveEvent> {
  const { data } = await admin
    .from('app_config')
    .select('key, value')
    .in('key', [
      'event_enabled',
      'event_weekend_xp_mult',
      'event_weekend_gold_mult',
      'event_weekend_drop_mult',
    ]);
  const raw: Record<string, string> = {};
  for (const row of (data ?? []) as { key: string; value: string }[]) raw[row.key] = row.value;
  return activeEvent(Date.now(), parseEventConfig(raw));
}

/** Applique le bonus d'événement de carte à l'XP/or d'un batch (mute). */
function buffBatchEvent(batch: DeploymentBatchResult, ev: ActiveEvent): void {
  if (ev.xpMult !== 1) batch.xpPerHero = Math.round(batch.xpPerHero * ev.xpMult);
  if (ev.goldMult !== 1) batch.gold = Math.round(batch.gold * ev.goldMult);
}

/** Multiplie le butin (matériaux/gemmes) par le bonus d'événement. Renvoie une copie. */
function buffResourcesEvent(
  resources: Record<string, number>,
  ev: ActiveEvent,
): Record<string, number> {
  if (ev.dropMult === 1) return resources;
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(resources)) out[id] = Math.round(n * ev.dropMult);
  return out;
}

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

/** Date du jour 'YYYY-MM-DD' au fuseau Europe/Paris (indépendant de l'horloge client). */
function parisToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Parmi `heroIds`, ceux qui NE sont PAS possédés par `userId` = renforts empruntés. */
async function borrowedIdsOf(admin: Admin, userId: string, heroIds: string[]): Promise<string[]> {
  if (heroIds.length === 0) return [];
  const { data } = await admin
    .from('heroes')
    .select('id')
    .eq('owner_id', userId)
    .in('id', heroIds);
  const owned = new Set((data ?? []).map((r: { id: string }) => r.id));
  return heroIds.filter((id) => !owned.has(id));
}

/** Combats de carte déjà consommés aujourd'hui par un héros emprunté (0 si aucun). */
async function mapFightsUsedToday(
  admin: Admin,
  borrowerId: string,
  heroId: string,
  today: string,
): Promise<number> {
  const { data } = await admin
    .from('garrison_borrow_usage')
    .select('map_fights')
    .eq('borrower_player_id', borrowerId)
    .eq('hero_id', heroId)
    .eq('usage_date', today)
    .maybeSingle();
  return (data?.map_fights as number | undefined) ?? 0;
}

/**
 * Ajoute `n` combats de carte au compteur du jour d'un héros emprunté, de façon
 * ATOMIQUE (RPC increment_borrow_usage : upsert-incrément par colonne). Carte ET
 * donjon partagent la même ligne garrison_borrow_usage ; un read-modify-write
 * réécrivant les deux colonnes ferait perdre les incréments donjon (→ cap donjon
 * contournable, comme observé : dungeon_runs remis à 0 par les combats de carte).
 */
async function bumpMapFights(
  admin: Admin,
  borrowerId: string,
  heroId: string,
  today: string,
  n: number,
): Promise<void> {
  if (n <= 0) return;
  await admin.rpc('increment_borrow_usage', {
    p_borrower: borrowerId,
    p_hero: heroId,
    p_date: today,
    p_dungeon: 0,
    p_map: n,
  });
}

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
        'weapon:items!heroes_equipped_weapon_id_fkey(name, atk_bonus, def_bonus, hp_bonus, set_id, blessing_level, passive_type, passive_value, tier), ' +
        'armor:items!heroes_equipped_armor_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id, passive_type, passive_value, tier), ' +
        'jewel:items!heroes_equipped_jewel_id_fkey(atk_bonus, def_bonus, hp_bonus, passive_type, passive_value, set_id, tier), ' +
        'relic:items!heroes_equipped_relic_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id, passive_type, passive_value, tier), rune:runes!heroes_rune_id_fkey(set_id)',
    )
    .in('id', heroIds)
    .eq('owner_id', userId);

  // deno-lint-ignore no-explicit-any
  const ownedCombatants: CombatantInput[] = (heroes ?? []).map((h: any) => {
    const cls = h.cls;
    const sum = (k: string) =>
      (h.weapon?.[k] ?? 0) + (h.armor?.[k] ?? 0) + (h.jewel?.[k] ?? 0) + (h.relic?.[k] ?? 0);
    const setIds = [h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id];
    const setB = computeSetBonuses(setIds, h.class_id, equippedSetTier([h.weapon, h.armor, h.jewel, h.relic]));
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
    const abilities = [
      ...computeAbilities(h.class_id, learned, loadout),
      ...computeSetAbilities(setIds, h.class_id),
      ...runeAbilities(h.rune?.set_id ?? null),
    ];
    // Passifs de combat : bijou + ARME équipés (stat secondaire des modèles qui
    // en portent une : Arc → crit, Dague → esquive) + compétences.
    const passives = [
      ...[itemCombatPassive(h.jewel), itemCombatPassive(h.weapon), itemCombatPassive(h.relic), itemCombatPassive(h.armor)].filter(
        (p) => p !== null,
      ),
      ...computePassives(h.class_id, learned, loadout),
    ];
    // Amplificateur de type porté par l'arme (bénédiction incluse).
    const wAmp = weaponCombatAmp(
      h.weapon ? { name: h.weapon.name, blessingLevel: h.weapon.blessing_level ?? 0 } : null,
    );
    return {
      id: h.id,
      name: h.name,
      role,
      basicType: classDamageBase(h.class_id),
      // Équilibrage des soins par classe. Cette fonction est la SEULE à
      // construire ses combattants à la main plutôt que via `buildHeroSnapshot` :
      // sans cette ligne, le nerf des soins n'aurait aucun effet sur le farm de
      // carte — l'activité la plus jouée du jeu.
      healMult: classHealMult(h.class_id),
      ...stats,
      ...(wAmp.dmgAmp ? { dmgAmp: wAmp.dmgAmp } : {}),
      passives,
      abilities: [...abilities, ...wAmp.healAbilities],
    };
  });

  // Héros empruntés (garnison de la guilde) : snapshot figé, chargé tel quel.
  const ownedIds = new Set(ownedCombatants.map((c) => c.id));
  const borrowedIds = heroIds.filter((id) => !ownedIds.has(id));
  const borrowedCombatants: CombatantInput[] = [];
  if (borrowedIds.length > 0) {
    const guildId = await guildIdOf(admin, userId);
    if (guildId) {
      const { data: rows } = await admin
        .from('guild_garrison')
        .select('hero_id, hero_snapshot')
        .eq('guild_id', guildId)
        .in('hero_id', borrowedIds);
      for (const r of rows ?? []) borrowedCombatants.push(r.hero_snapshot as CombatantInput);
    }
  }

  // Buff de guilde (hors arène) appliqué à TOUTE l'escouade (héros propres + emprunts).
  const { combat } = await guildBuffsOf(admin, userId);
  // Ordre stable = ordre demandé.
  const byId = new Map<string, CombatantInput>();
  for (const c of [...ownedCombatants, ...borrowedCombatants]) byId.set(c.id, applyCombatBuff(c, combat));
  return heroIds
    .map((id) => byId.get(id))
    .filter((c): c is CombatantInput => Boolean(c));
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
  /**
   * Arc du déploiement. Les zones sont REJOUÉES d'un arc à l'autre, mais elles
   * n'y lâchent pas les mêmes matériaux : `maps.resource` porte la clé d'arc 1,
   * qu'on traduit en son jumeau d'arc via `arcMaterialKey`.
   */
  arc: number;
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

  return {
    mapRow,
    defs,
    ids,
    names,
    startIndex: curLevel.level_index - 1,
    allies,
    arc: (dep.arc as number | undefined) ?? 1,
  };
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
  // Le matériau BASIQUE de zone ne tombe QUE sur les niveaux 1-4 (victoires
  // hors-boss). Le niveau 5 (boss) ne lâche que composant de boss + gemme.
  const nonBossWins = Math.max(0, batch.wins - batch.bossWins);
  let matDrops = 0;
  const matRolls = Math.min(nonBossWins, MAT_ROLL_CAP);
  const matChance = materialDropChance(batch.lootDifficulty);
  for (let i = 0; i < matRolls; i++) {
    if (rng.next() < matChance) matDrops += 1;
  }
  let bossMat = 0;
  for (let b = 0; b < batch.bossWins; b++) {
    if (rng.next() < BOSS_MATERIAL_CHANCE) bossMat += 1;
  }
  // Les clés stockées en base (`maps.resource`) sont celles de l'ARC 1 : on les
  // traduit vers le jumeau de l'arc courant. Une zone rejouée en arc 2 lâche donc
  // de l'Écorce pétrifiée, pas de l'Écorce.
  const farmKey = arcMaterialKey(ctx.mapRow.resource, ctx.arc);
  const bossKey = arcMaterialKey(ctx.mapRow.boss_resource, ctx.arc);
  if (matDrops > 0) resources[farmKey] = matDrops;
  if (bossMat > 0) resources[bossKey] = (resources[bossKey] ?? 0) + bossMat;
  const gem = gemByMapForArc(ctx.mapRow.id, ctx.arc);
  if (gem) {
    let gemDrops = 0;
    for (let b = 0; b < batch.bossWins; b++) {
      if (rng.next() < GEM_DROP_CHANCE) gemDrops += 1;
    }
    if (gemDrops > 0) resources[gem.id] = (resources[gem.id] ?? 0) + gemDrops;
  }
  return resources;
}

/**
 * Niveaux de TOUS les héros possédés par le joueur. Nécessaire au rattrapage :
 * le plafond est le 5e niveau le plus haut du ROSTER, pas du groupe engagé.
 */
async function rosterLevels(admin: Admin, userId: string): Promise<number[]> {
  const { data } = await admin.from('heroes').select('level').eq('owner_id', userId);
  return ((data ?? []) as { level: number | null }[]).map((h) => h.level ?? 0);
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
  // Plafond de rattrapage : niveau du 5e héros le plus haut du joueur. Une SEULE
  // requête, hors de la boucle — le plafond est le même pour tout le groupe.
  const capLevel = catchUpCapLevel(await rosterLevels(admin, userId));
  const { data: groupHeroes } = await admin
    .from('heroes')
    .select('id, level, xp, skill_points')
    .in('id', heroIds)
    .eq('owner_id', userId);
  let ownedCount = 0;
  for (const h of groupHeroes ?? []) {
    ownedCount += 1;
    // Le multiplicateur est réévalué à CHAQUE niveau franchi : sur un gros lot
    // accumulé, un héros très en retard s'arrête net au plafond au lieu de le
    // dépasser d'un bond.
    const gain = applyCatchUpXpGain(h.level, h.xp, xpPerHero, capLevel);
    const update: Record<string, number> = { level: gain.level, xp: gain.xp };
    if (gain.levelsGained > 0) {
      update.skill_points = (h.skill_points ?? 0) + gain.levelsGained * SKILL_POINTS_PER_LEVEL;
      levelUps.push({ hero_id: h.id, levels: gain.levelsGained });
    }
    await admin.from('heroes').update(update).eq('id', h.id);
  }
  // XP de COMPTE calculée sur l'XP de base, sans le rattrapage : c'est un coup de
  // pouce aux héros en retard, pas un accélérateur de progression de compte.
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
  ev: ActiveEvent,
): Promise<SettleResult> {
  // Bonus d'événement (week-end) : XP/or déjà appliqués sur `batch` par le caller
  // avant l'XP ; ici on multiplie le butin tiré.
  const levelUps = await applyXp(admin, userId, dep.hero_ids as string[], batch.xpPerHero);
  const resources = buffResourcesEvent(rollBatchResources(ctx, batch, seed), ev);

  for (const idx of batch.clearedIndices) {
    const lid = ctx.ids[idx];
    if (lid) {
      await admin
        .from('level_progress')
        .upsert(
          { player_id: userId, level_id: lid, arc: dep.arc ?? 1 },
          { onConflict: 'player_id,level_id,arc' },
        );
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

/**
 * Règle le farm idle EN ATTENTE d'UN groupe en boucle : simule les combats
 * accumulés, applique XP / butin / progression, et rend la ligne de résultat.
 *
 * Extrait de l'action `claim` pour être réutilisable par `setmode` : changer de
 * mode réécrit `last_resolved_at` (l'ancre qui mesure le temps accumulé), donc
 * SANS ce règlement préalable tout le farm en attente serait purement perdu.
 *
 * Renvoie `null` quand il n'y avait rien à régler : mode non-'loop', contexte
 * invalide, 0 combat accumulé, renfort emprunté épuisé, ou fenêtre idle déjà
 * prise par un autre onglet (compare-and-swap perdu). Cette garde rend l'appel
 * IDEMPOTENT : régler deux fois de suite ne crédite jamais deux fois.
 *
 * L'OR n'est PAS crédité ici — l'appelant l'agrège et appelle `addGold` une fois.
 */
async function settleLoopDeployment(
  admin: Admin,
  userId: string,
  // deno-lint-ignore no-explicit-any
  dep: any,
  ev: ActiveEvent,
  // deno-lint-ignore no-explicit-any
): Promise<{ gold: number; resources: Record<string, number>; result: any } | null> {
  // Les groupes en mode 'advance' ne combattent QUE via l'action 'fight'
  // (le joueur regarde ses combats) — seuls les groupes 'loop' farment idle.
  if (dep.mode !== 'loop') return null;

  const ctx = await loadContext(admin, userId, dep);
  if (!ctx) return null;

  const elapsed = (Date.now() - new Date(dep.last_resolved_at).getTime()) / 1000;
  let fights = fightsForElapsed(elapsed);
  if (fights === 0) return null;

  // Bridage anti-carry : un renfort emprunté ne farme que 5 combats de carte/jour.
  // Plafonne le batch au reliquat ; épuisé → le groupe attend (temps non consommé).
  const borrowed = await borrowedIdsOf(admin, userId, dep.hero_ids as string[]);
  const today = parisToday();
  if (borrowed.length > 0) {
    let remaining = BORROW_MAP_FIGHTS_PER_DAY;
    for (const heroId of borrowed) {
      remaining = Math.min(
        remaining,
        BORROW_MAP_FIGHTS_PER_DAY - (await mapFightsUsedToday(admin, userId, heroId, today)),
      );
    }
    if (remaining <= 0) return null;
    fights = Math.min(fights, remaining);
  }

  // RÉSERVATION ATOMIQUE (anti multi-onglets) : on s'approprie la fenêtre idle
  // en avançant last_resolved_at à maintenant, CONDITIONNÉ à ce qu'il vaille
  // encore la valeur qu'on vient de lire (compare-and-swap). Deux appels
  // concurrents lisent le même last_resolved_at ; un SEUL UPDATE passe (Postgres
  // sérialise la ligne), l'autre matche 0 ligne et abandonne. Les gains idle ne
  // sont donc crédités qu'une fois, quel que soit le nombre d'onglets.
  const { data: reserved } = await admin
    .from('deployments')
    .update({ last_resolved_at: new Date().toISOString() })
    .eq('id', dep.id)
    .eq('last_resolved_at', dep.last_resolved_at)
    .select('id');
  if (!reserved || reserved.length === 0) return null;

  const seed = Math.floor(Math.random() * 2_147_483_647);

  const batch = resolveDeploymentBatch({
    allies: ctx.allies,
    levels: ctx.defs,
    startIndex: ctx.startIndex,
    mode: 'loop',
    fights,
    seed,
    arc: dep.arc ?? 1,
  });
  // Buff de gains de guilde (or/XP) — hors arène.
  buffBatchGains(batch, (await guildBuffsOf(admin, userId)).gain);
  // Bonus d'événement de carte (week-end : double XP/or/butin).
  buffBatchEvent(batch, ev);

  const settled = await settleBatch(admin, userId, dep, ctx, batch, seed, ev);
  // Consomme les combats de carte du jour pour chaque renfort emprunté.
  for (const heroId of borrowed) {
    await bumpMapFights(admin, userId, heroId, today, batch.fights);
  }
  // Crédit AU TIER du déploiement : chaque farm idle dépose dans le tier de SON
  // arc (des déploiements d'arcs différents ne se mélangent pas de pile).
  await addResources(admin, userId, settled.resources, dep.arc ?? 1);

  return {
    gold: batch.gold,
    resources: settled.resources,
    result: {
      deployment_id: dep.id,
      level_name: settled.endLevelName,
      wins: batch.wins,
      losses: batch.losses,
      xp_per_hero: batch.xpPerHero,
      gold: batch.gold,
      level_ups: settled.levelUps,
      advanced: batch.endIndex - batch.startIndex,
      blocked: settled.blocked,
    },
  };
}

/**
 * Crédit d'or ATOMIQUE via le RPC `add_player_gold` (`gold = gold + amount` en
 * une seule instruction SQL). L'ancienne version lisait `profiles.gold` puis
 * réécrivait la somme — un lost update en cas de requêtes concurrentes (deux
 * `claim` qui se chevauchent, ex. tap mobile en double + reprise d'app en
 * arrière-plan) : chacune valide bien SES combats (protégés par CAS sur
 * `last_resolved_at`), mais l'or de la première pouvait être écrasé par
 * l'écriture de la seconde, partie d'un solde encore périmé — un joueur voyait
 * ses victoires comptées sans jamais toucher l'or correspondant.
 */
async function addGold(admin: Admin, userId: string, gold: number): Promise<void> {
  if (gold <= 0) return;
  const { error } = await admin.rpc('add_player_gold', { p_player: userId, p_amount: gold });
  if (error) throw error;
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

/** Arc courant du joueur (1 par défaut). Pilote le tier de loot + le scaling. */
async function currentArcOf(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin
    .from('player_arc')
    .select('current_arc')
    .eq('player_id', userId)
    .maybeSingle();
  return Math.max(1, (data?.current_arc as number | undefined) ?? 1);
}

/**
 * Crédite des ressources au joueur AU TIER indiqué (= arc). Chaque tier est une
 * pile distincte : `(player_id, resource, tier)`. `tier` défaut 1 (arc de base).
 */
/**
 * Crédit de ressources ATOMIQUE via le RPC `add_player_resource` — même motif
 * et même raison que `addGold` ci-dessus : l'ancien lire-puis-upsert perdait
 * du butin sous requêtes concurrentes (mobile : double tap, reprise d'app).
 */
async function addResources(
  admin: Admin,
  userId: string,
  resources: Record<string, number>,
  tier = 1,
): Promise<void> {
  for (const [resource, add] of Object.entries(resources)) {
    if (add <= 0) continue;
    const { error } = await admin.rpc('add_player_resource', {
      p_player: userId,
      p_resource: resource,
      p_amount: add,
      p_tier: tier,
    });
    if (error) throw error;
  }
}

/**
 * Ancre du cooldown d'assaut MANUEL au niveau du JOUEUR (colonne
 * profiles.last_map_fight_at) — survit aux redeploy/undeploy/toggle, donc
 * inviolable. Renvoie l'ISO à stocker dans `last_resolved_at` d'un déploiement
 * 'advance' : si le joueur n'a pas combattu manuellement depuis ≥ le cooldown, le
 * premier assaut est IMMÉDIAT ; sinon il attend le reste du cooldown.
 */
async function advanceAnchorIso(admin: Admin, userId: string): Promise<string> {
  const { data } = await admin
    .from('profiles')
    .select('last_map_fight_at')
    .eq('id', userId)
    .single();
  const last = data?.last_map_fight_at ? new Date(data.last_map_fight_at).getTime() : 0;
  const floor = Date.now() - FIGHT_COOLDOWN_SECONDS * 1000;
  // last > 0 : conserve le vrai dernier combat (attente correcte). Sinon plancher
  // « il y a un cooldown » → premier assaut immédiat.
  return new Date(last > 0 ? last : floor).toISOString();
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
    const ownedIds = new Set((owned ?? []).map((o: { id: string }) => o.id));
    // Les héros non possédés doivent être des renforts empruntés à la garnison de
    // la guilde (au plus BORROW_LIMIT_PER_TEAM par équipe).
    const borrowedIds = unique.filter((id) => !ownedIds.has(id));
    if (borrowedIds.length > BORROW_LIMIT_PER_TEAM) {
      return json({ error: `Un seul héros emprunté par équipe` }, 400);
    }
    if (borrowedIds.length > 0) {
      const guildId = await guildIdOf(admin, user.id);
      if (!guildId) return json({ error: 'Renfort de guilde impossible hors guilde' }, 403);
      const { data: grows } = await admin
        .from('guild_garrison')
        .select('hero_id')
        .eq('guild_id', guildId)
        .in('hero_id', borrowedIds);
      const okBorrowed = new Set((grows ?? []).map((r: { hero_id: string }) => r.hero_id));
      if (borrowedIds.some((id) => !okBorrowed.has(id))) {
        return json({ error: 'Héros emprunté indisponible' }, 403);
      }
    }

    // Exclusivité des activités IDLE : un héros parti en expédition VERROUILLANTE
    // ne peut pas être mis en farm 'loop'. Les runs lancés avec « Intendance
    // autonome » (locks_heroes = false) laissent leurs héros libres.
    if (mode === 'loop') {
      const { data: activeExp } = await admin
        .from('expedition_runs')
        .select('hero_ids')
        .eq('player_id', user.id)
        .eq('status', 'in_progress')
        .eq('locks_heroes', true);
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

    // Arc courant : on crée le déploiement DANS cet arc (le gating et la progression
    // se lisent/écrivent sur ce même arc).
    const arc = await currentArcOf(admin, user.id);

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
        .eq('arc', arc)
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
              .eq('arc', arc)
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

    // 'advance' (manuel) : premier assaut IMMÉDIAT via l'ancre joueur (inviolable —
    // survit au redeploy/undeploy/toggle). 'loop' (idle) : démarre maintenant, pas
    // de combat gratuit. Impossible de farmer en redéployant : l'ancre est au niveau
    // du joueur, pas de la ligne de déploiement.
    const startAtIso =
      mode === 'advance' ? await advanceAnchorIso(admin, user.id) : new Date().toISOString();
    await admin.from('deployments').insert({
      player_id: user.id,
      level_id: levelId,
      hero_ids: unique,
      mode,
      last_resolved_at: startAtIso,
      arc,
    });
    return json({ ok: true });
  }

  if (action === 'undeploy') {
    if (typeof body.deployment_id !== 'string')
      return json({ error: 'deployment_id invalide' }, 400);

    // Retirer un groupe SUPPRIME sa ligne, donc son farm idle en attente avec elle.
    // Même règle que `setmode` : on règle d'abord (idempotent), puis on supprime.
    // Le bouton « Replis » encaisse déjà côté client ; ceci couvre tous les autres
    // chemins (autre onglet, appel direct) pour qu'aucun gain ne soit jamais perdu.
    const { data: toRemove } = await admin
      .from('deployments')
      .select('id, level_id, hero_ids, mode, last_resolved_at, clears_count, arc')
      .eq('id', body.deployment_id)
      .eq('player_id', user.id)
      .single();
    // deno-lint-ignore no-explicit-any
    let banked: any = null;
    if (toRemove?.mode === 'loop') {
      const settled = await settleLoopDeployment(admin, user.id, toRemove, await activeMapEvent(admin));
      if (settled) {
        await addGold(admin, user.id, settled.gold);
        banked = settled.result;
      }
    }

    await admin.from('deployments').delete().eq('id', body.deployment_id).eq('player_id', user.id);
    return json({ ok: true, banked });
  }

  if (action === 'setmode') {
    if (typeof body.deployment_id !== 'string')
      return json({ error: 'deployment_id invalide' }, 400);
    const mode = body.mode === 'loop' ? 'loop' : 'advance';

    // Le changement de mode RÉÉCRIT `last_resolved_at`, l'ancre qui mesure le farm
    // idle accumulé. On RÈGLE donc d'abord le farm en attente du groupe, sinon il
    // serait purement perdu (bug remonté par les joueurs). Le règlement est
    // idempotent (compare-and-swap) : si le client vient déjà d'encaisser, il ne
    // trouve plus rien et ne crédite rien deux fois.
    const { data: current } = await admin
      .from('deployments')
      .select('id, level_id, hero_ids, mode, last_resolved_at, clears_count, arc')
      .eq('id', body.deployment_id)
      .eq('player_id', user.id)
      .single();
    if (!current) return json({ error: 'Déploiement introuvable' }, 404);

    // deno-lint-ignore no-explicit-any
    let banked: any = null;
    if (current.mode === 'loop') {
      const settled = await settleLoopDeployment(admin, user.id, current, await activeMapEvent(admin));
      if (settled) {
        await addGold(admin, user.id, settled.gold);
        banked = settled.result;
      }
    }

    // 'advance' : ancre joueur (premier assaut immédiat si pas de combat récent,
    // sinon reste du cooldown). 'loop' : idle démarre maintenant. Toggler ne rend
    // aucun combat gratuit car l'ancre est au niveau du joueur, pas du déploiement.
    const resetIso =
      mode === 'advance' ? await advanceAnchorIso(admin, user.id) : new Date().toISOString();
    await admin
      .from('deployments')
      .update({ mode, last_resolved_at: resetIso })
      .eq('id', body.deployment_id)
      .eq('player_id', user.id);
    // `banked` = ce qui a été encaissé au passage (null si rien).
    return json({ ok: true, banked });
  }

  // ---------------------------------------------------------------- FIGHT
  // Assaut manuel (mode 'advance') : UN combat résolu, renvoyé au client
  // pour être regardé en entier.
  if (action === 'fight') {
    if (typeof body.deployment_id !== 'string')
      return json({ error: 'deployment_id invalide' }, 400);

    const { data: dep } = await admin
      .from('deployments')
      .select('id, level_id, hero_ids, mode, last_resolved_at, clears_count, arc')
      .eq('id', body.deployment_id)
      .eq('player_id', user.id)
      .single();
    if (!dep) return json({ error: 'Déploiement introuvable' }, 404);
    if (dep.mode !== 'advance') {
      return json({ error: 'Ce groupe farme en boucle — passe-le en mode ➡ Avancer' }, 400);
    }

    // Cooldown autoritatif : horloge SERVEUR uniquement (Date.now() du serveur vs
    // last_resolved_at stocké en base). Aucune valeur de temps venue du client
    // n'entre ici — la vitesse de replay ou un appel direct ne le contournent pas.
    const elapsed = (Date.now() - new Date(dep.last_resolved_at).getTime()) / 1000;
    if (elapsed < FIGHT_COOLDOWN_SECONDS) {
      const wait = Math.ceil(FIGHT_COOLDOWN_SECONDS - elapsed);
      return json({ error: `L'équipe se repositionne — réessaie dans ${wait} s`, retry_after: wait }, 429);
    }

    const ctx = await loadContext(admin, user.id, dep);
    if (!ctx) return json({ error: 'Déploiement invalide' }, 400);

    // Bridage anti-carry : un renfort emprunté = 5 combats de carte / jour max.
    const fightBorrowed = await borrowedIdsOf(admin, user.id, dep.hero_ids as string[]);
    const fightToday = parisToday();
    for (const heroId of fightBorrowed) {
      if ((await mapFightsUsedToday(admin, user.id, heroId, fightToday)) >= BORROW_MAP_FIGHTS_PER_DAY) {
        return json(
          {
            error: `Ce renfort emprunté a épuisé ses ${BORROW_MAP_FIGHTS_PER_DAY} combats de carte du jour — retire-le pour continuer.`,
          },
          429,
        );
      }
    }

    // RÉSERVATION ATOMIQUE (anti multi-onglets) : on avance last_resolved_at à
    // maintenant UNIQUEMENT si le cooldown est écoulé, en une seule requête
    // conditionnelle (compare-and-swap). Deux onglets qui tirent en même temps
    // lisent le même last_resolved_at, mais un SEUL UPDATE passe (Postgres
    // sérialise la ligne) : l'autre matche 0 ligne → 429. Impossible de doubler
    // les combats/récompenses en ouvrant plusieurs onglets.
    const reserveCutoffIso = new Date(Date.now() - FIGHT_COOLDOWN_SECONDS * 1000).toISOString();
    const { data: reserved } = await admin
      .from('deployments')
      .update({ last_resolved_at: new Date().toISOString() })
      .eq('id', dep.id)
      .eq('player_id', user.id)
      .lte('last_resolved_at', reserveCutoffIso)
      .select('id');
    if (!reserved || reserved.length === 0) {
      return json(
        {
          error: `L'équipe se repositionne — réessaie dans ${FIGHT_COOLDOWN_SECONDS} s`,
          retry_after: FIGHT_COOLDOWN_SECONDS,
        },
        429,
      );
    }

    // Ancre le cooldown au niveau JOUEUR : le joueur vient de combattre manuellement,
    // donc un redeploy/undeploy/toggle ne pourra pas rendre un combat gratuit.
    await admin
      .from('profiles')
      .update({ last_map_fight_at: new Date().toISOString() })
      .eq('id', user.id);

    const seed = Math.floor(Math.random() * 2_147_483_647);
    const batch = resolveDeploymentBatch({
      allies: ctx.allies,
      levels: ctx.defs,
      startIndex: ctx.startIndex,
      mode: 'advance',
      fights: 1,
      seed,
      arc: dep.arc ?? 1,
    });
    if (!batch.lastCombat) return json({ error: 'Combat impossible sur ce niveau' }, 400);
    // Buff de gains de guilde (or/XP) — hors arène.
    buffBatchGains(batch, (await guildBuffsOf(admin, user.id)).gain);
    // Bonus d'événement de carte (week-end : double XP/or/butin).
    const mapEvent = await activeMapEvent(admin);
    buffBatchEvent(batch, mapEvent);

    // Le combat a eu lieu (gagné/perdu/abandonné plus tard) → consomme 1 combat carte.
    for (const heroId of fightBorrowed) await bumpMapFights(admin, user.id, heroId, fightToday, 1);

    // On NE valide RIEN maintenant : la victoire n'est appliquée qu'à la
    // confirmation (action 'resolve_fight'). Abandonner = défaite, pas de
    // déblocage. On stocke le résultat calculé et on démarre le cooldown
    // (empêche le farm de seeds en abandonnant les défaites).
    const resources = buffResourcesEvent(rollBatchResources(ctx, batch, seed), mapEvent);
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
      .select('id, level_id, hero_ids, clears_count, pending_fight, arc')
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
      // Consommation ATOMIQUE : conditionnée à pending_fight NON null, pour rester
      // cohérent avec la branche victoire (une seule requête gagne le flip).
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
        .eq('id', dep.id)
        .not('pending_fight', 'is', null);
      return json({ ok: true, applied: false, abandoned });
    }

    // Victoire confirmée. CONSOMMATION ATOMIQUE DU PENDING (anti multi-onglets) :
    // on flippe pending_fight → null en une requête conditionnée à « pending_fight
    // NON null ». Deux onglets qui confirment le même combat en parallèle : un
    // seul UPDATE affecte 1 ligne (Postgres sérialise la ligne, le second voit
    // pending déjà null → 0 ligne). On ne crédite les récompenses (XP/or/matériaux)
    // QU'APRÈS avoir gagné ce flip → impossible de doubler en ouvrant des onglets.
    const sameLevel = p.end_level_id === p.start_level_id;
    const clearsCount = sameLevel ? (p.clears_base ?? 0) + (p.wins ?? 0) : 0;
    const { data: claimedWin } = await admin
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
      .eq('id', dep.id)
      .not('pending_fight', 'is', null)
      .select('id');
    if (!claimedWin || claimedWin.length === 0) {
      // Un autre onglet a déjà confirmé ce combat → aucune récompense en double.
      return json({ ok: true, applied: false });
    }

    // On a remporté le flip : on applique tout (XP, or, matériaux, déblocage).
    const levelUps = await applyXp(admin, user.id, dep.hero_ids as string[], p.xp_per_hero ?? 0);
    await addGold(admin, user.id, p.gold ?? 0);
    await addResources(admin, user.id, (p.resources ?? {}) as Record<string, number>, dep.arc ?? 1);
    for (const lid of (p.cleared_level_ids ?? []) as string[]) {
      await admin
        .from('level_progress')
        .upsert(
          { player_id: user.id, level_id: lid, arc: dep.arc ?? 1 },
          { onConflict: 'player_id,level_id,arc' },
        );
    }

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

  // `deployment_id` optionnel : encaisser UN SEUL groupe (bouton « Récupérer »/
  // « Replis » d'un groupe précis). Absent → encaisse tous les groupes en boucle
  // (rétrocompat). Sans ce ciblage, récupérer un groupe encaissait aussi les autres.
  const claimScopeId = typeof body.deployment_id === 'string' ? body.deployment_id : null;

  let depQuery = admin
    .from('deployments')
    .select('id, level_id, hero_ids, mode, last_resolved_at, clears_count, arc')
    .eq('player_id', user.id);
  if (claimScopeId) depQuery = depQuery.eq('id', claimScopeId);
  const { data: deployments } = await depQuery;

  if (!deployments || deployments.length === 0) return json({ results: [], totals: null });

  let totalGold = 0;
  const resAccum: Record<string, number> = {};
  // deno-lint-ignore no-explicit-any
  const results: any[] = [];
  // Événement lu une fois pour tout le claim (constant sur la durée de la requête).
  const mapEvent = await activeMapEvent(admin);

  for (const dep of deployments) {
    const settled = await settleLoopDeployment(admin, user.id, dep, mapEvent);
    if (!settled) continue; // rien à régler (cf. gardes de settleLoopDeployment)
    totalGold += settled.gold;
    for (const [res, amt] of Object.entries(settled.resources)) {
      resAccum[res] = (resAccum[res] ?? 0) + amt;
    }
    results.push(settled.result);
  }

  await addGold(admin, user.id, totalGold);
  // (ressources déjà créditées par déploiement, au tier de chaque arc — cf. boucle)

  return json({ results, totals: { gold: totalGold, resources: resAccum } });
});
