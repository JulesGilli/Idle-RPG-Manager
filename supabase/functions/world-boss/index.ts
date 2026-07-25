// Edge Function : world-boss — BOSS DE LA SEMAINE (communautaire, immortel).
//
// En semaine (lun→ven), un boss COMMUNAUTAIRE et IMMORTEL. Chaque joueur le frappe
// UNE FOIS PAR JOUR (vrai combat serveur, seed serveur). Sa contribution = dégâts
// infligés au « sac de frappe » = maxHp effectif − PV restants. Tous les dégâts
// s'additionnent (`total_damage`) : chaque PALIER franchi débloque une récompense
// d'or pour TOUS les contributeurs (action `claim`). En fin de semaine (bascule de
// la clé de semaine ISO), le classement individuel distribue de l'or au top 10 + un
// TITRE éphémère au 1er (+5 % ATK). Création + finalisation LAZY (aucun cron).
//
// Anti-triche : combat résolu côté serveur, horloge serveur ; le client n'envoie que
// ses hero_ids (héros possédés). Seule cette fonction (service_role) écrit.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resourceTier } from '@shared/progression/arcMaterials.ts';
import { resolveCombat } from '@shared/combat/index.ts';
import type { CombatantInput } from '@shared/combat/index.ts';
import { buildHeroSnapshot, itemCombatPassive, type HeroSnapshotInput } from '@shared/progression/heroLoan.ts';
import { computeSetBonuses, equippedSetTier } from '@shared/progression/sets.ts';
import { combatBuff, NO_COMBAT_BUFF, type GuildAlloc, type GuildCombatBuff } from '@shared/progression/guildSkills.ts';
import { isWeekend, parisWeekday } from '@shared/progression/events.ts';
import { checkTeamClasses, tooManySameClassError } from '@shared/progression/teamComposition.ts';
import {
  EVENT_MATERIALS,
  EVENT_MATERIAL_TIER,
  eventRankMaterialQty,
} from '@shared/progression/eventMaterials.ts';
import {
  isoWeekKey,
  parisDayKey,
  weekEndsAt,
  worldBossName,
  worldBossFightCombatant,
  tiersUnlocked,
  rankReward,
  WORLD_BOSS_TITLE,
  WORLD_BOSS_TITLE_ATK_MULT,
  type WorldBossTier,
  type WorldBossReward,
} from '@shared/progression/worldBoss.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_TEAM = 5;
/** Durée du titre du 1er : ~2 semaines (couvre toute la semaine suivante). */
const TITLE_TTL_MS = 14 * 86_400_000;

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
  'active_skill_id, ultimate_skill_id, ' +
  'bonus_hp, bonus_atk, bonus_def, bonus_speed, ' +
  'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed), ' +
  'weapon:items!heroes_equipped_weapon_id_fkey(name, atk_bonus, def_bonus, hp_bonus, set_id, blessing_level, passive_type, passive_value, tier), ' +
  'armor:items!heroes_equipped_armor_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id, passive_type, passive_value, tier), ' +
  'jewel:items!heroes_equipped_jewel_id_fkey(atk_bonus, def_bonus, hp_bonus, passive_type, passive_value, set_id, tier), ' +
  'relic:items!heroes_equipped_relic_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id, passive_type, passive_value, tier), rune:runes!heroes_rune_id_fkey(set_id)';

/** Ligne héros (DB) → ingrédients de snapshot (mêmes règles que le build normal). */
// deno-lint-ignore no-explicit-any
function toSnapshotInput(h: any): HeroSnapshotInput {
  const cls = h.cls;
  const sum = (k: string) =>
    (h.weapon?.[k] ?? 0) + (h.armor?.[k] ?? 0) + (h.jewel?.[k] ?? 0) + (h.relic?.[k] ?? 0);
  const setB = computeSetBonuses([h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id], h.class_id, equippedSetTier([h.weapon, h.armor, h.jewel, h.relic]));
  return {
    id: h.id,
    name: h.name,
    classId: h.class_id,
    level: h.level,
    classBase: { hp: cls.base_hp, atk: cls.base_atk, def: cls.base_def, speed: cls.base_speed },
    innate: { hp: h.bonus_hp ?? 0, atk: h.bonus_atk ?? 0, def: h.bonus_def ?? 0, speed: h.bonus_speed ?? 0 },
    alloc: { hp: h.alloc_hp, atk: h.alloc_atk, def: h.alloc_def, speed: h.alloc_speed },
    equipment: { atk: sum('atk_bonus') + setB.atk, def: sum('def_bonus') + setB.def, hp: sum('hp_bonus') + setB.hp },
    jewelPassive: itemCombatPassive(h.jewel),
    weaponPassive: itemCombatPassive(h.weapon),
    relicPassive: itemCombatPassive(h.relic),
    armorPassive: itemCombatPassive(h.armor),
    skills: (h.skills ?? {}) as Record<string, number>,
    loadout: { activeId: h.active_skill_id ?? null, ultimateId: h.ultimate_skill_id ?? null },
    weapon: h.weapon ? { name: h.weapon.name, blessingLevel: h.weapon.blessing_level ?? 0 } : null,
    runeSetId: h.rune?.set_id ?? null,
    setIds: [h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id],
  };
}

/** Crédite `n` unités d'une ressource à un `tier` donné (incrément atomique). */
async function addResourceAt(
  admin: Admin,
  userId: string,
  resource: string,
  n: number,
  tier: number,
): Promise<void> {
  if (n <= 0) return;
  // ATOMIQUE (`amount = amount + n` en base). C'était un lire-puis-upsert, et
  // c'est ici qu'il était le plus dangereux : les récompenses du boss hebdo sont
  // distribuées à TOUS les participants dans une même boucle — deux crédits qui
  // se croisent et l'un des deux disparaît.
  //
  // `resourceTier` : la larme astrale est mutualisée entre arcs (tier 1), les
  // matériaux d'event gardent le tier qu'on leur passe.
  const { error } = await admin.rpc('add_player_resource', {
    p_player: userId,
    p_resource: resource,
    p_amount: n,
    p_tier: resourceTier(resource, tier),
  });
  if (error) throw error;
}

/** Crédite N larmes astrales (resource `larme_astrale`, tier 1) au joueur. */
async function addTears(admin: Admin, userId: string, n: number): Promise<void> {
  await addResourceAt(admin, userId, 'larme_astrale', n, 1);
}

/** Buff de combat de l'arbre de guilde de l'appelant (neutre si sans guilde). */
async function guildBuffOf(admin: Admin, userId: string): Promise<GuildCombatBuff> {
  const { data: mem } = await admin.from('guild_members').select('guild_id').eq('player_id', userId).maybeSingle();
  if (!mem?.guild_id) return NO_COMBAT_BUFF;
  const { data: g } = await admin.from('guilds').select('skill_alloc').eq('id', mem.guild_id).single();
  return combatBuff((g?.skill_alloc ?? {}) as GuildAlloc);
}

/** Paliers communs (config réutilisée chaque semaine), triés par seuil croissant. */
async function tierDefs(admin: Admin): Promise<WorldBossTier[]> {
  const { data } = await admin.from('world_boss_tier_defs').select('idx, threshold, reward').order('idx');
  return (data ?? []).map((t: { idx: number; threshold: number; reward: WorldBossReward }) => ({
    idx: t.idx,
    threshold: Number(t.threshold),
    reward: t.reward ?? {},
  }));
}

/** Somme des dégâts par joueur sur l'event (pour le classement + « mes dégâts »). */
async function perPlayerDamage(admin: Admin, eventId: string): Promise<Map<string, number>> {
  const { data } = await admin.from('world_boss_hits').select('player_id, damage').eq('event_id', eventId);
  const byPlayer = new Map<string, number>();
  for (const h of data ?? []) {
    const pid = h.player_id as string;
    byPlayer.set(pid, (byPlayer.get(pid) ?? 0) + Number(h.damage ?? 0));
  }
  return byPlayer;
}

/** Classement top N (somme des dégâts), joint aux noms d'affichage. */
async function leaderboard(admin: Admin, eventId: string, limit = 20) {
  const byPlayer = await perPlayerDamage(admin, eventId);
  const top = [...byPlayer.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  if (top.length === 0) return [];
  const { data: profs } = await admin.from('profiles').select('id, display_name').in('id', top.map(([pid]) => pid));
  const names = new Map<string, string>();
  for (const p of profs ?? []) names.set(p.id as string, (p.display_name as string) ?? 'Joueur');
  return top.map(([pid, damage], i) => ({ rank: i + 1, player_id: pid, name: names.get(pid) ?? 'Joueur', damage }));
}

/**
 * Finalise un event dont la course est terminée (week-end atteint ou semaine
 * dépassée) : fige le classement, ÉCRIT LES RÉCOMPENSES DE RANG EN ATTENTE
 * (or + larmes + Éclat sacré, table `world_boss_rank_rewards`), attribue le titre
 * au 1er, passe le statut à 'ended'. Idempotent via le garde sur status='active'
 * (une seule finalisation gagne la course).
 *
 * Les récompenses ne sont PLUS créditées ici : elles étaient poussées en silence
 * et les joueurs ne voyaient jamais rien arriver (bug remonté — « on ne reçoit
 * pas les ressources d'armure divine »). Le joueur les réclame désormais via le
 * bouton dédié (action `claim_rank`), disponible dès que le boss a disparu.
 */
async function finalizeEvent(admin: Admin, event: Record<string, unknown>): Promise<void> {
  const nowIso = new Date().toISOString();
  // Garde d'unicité : on ne finalise que si on gagne la transition active→ended.
  const { data: claimed } = await admin
    .from('world_boss_events')
    .update({ status: 'ended', ended_at: nowIso })
    .eq('id', event.id as string)
    .eq('status', 'active')
    .select('id');
  if (!claimed || claimed.length === 0) return; // déjà finalisé par un autre appel

  const board = await leaderboard(admin, event.id as string, 10);
  for (const row of board) {
    const rr = rankReward(row.rank);
    // Éclat sacré (Forge Sacrée, armure divine) : dégressif top 10. Se gagne dès
    // l'Arc 1 et s'accumule en attendant l'ouverture de l'Arc 2.
    const eclat = eventRankMaterialQty(row.rank);
    // `onConflict … ignoreDuplicates` : une re-finalisation concurrente ne double
    // jamais une ligne (PK event+joueur).
    await admin.from('world_boss_rank_rewards').upsert(
      {
        event_id: event.id as string,
        player_id: row.player_id,
        week_key: (event.week_key as string) ?? '',
        boss_name: (event.boss_name as string) ?? '',
        rank: row.rank,
        gold: rr.gold,
        tears: rr.tears,
        eclat,
      },
      { onConflict: 'event_id,player_id', ignoreDuplicates: true },
    );
    // Le TITRE reste attribué immédiatement : c'est un statut, pas une ressource.
    if (rr.title) {
      await admin.from('player_event_titles').upsert(
        {
          player_id: row.player_id,
          title: WORLD_BOSS_TITLE,
          stat_mult: WORLD_BOSS_TITLE_ATK_MULT,
          source: 'world_boss',
          granted_at: nowIso,
          expires_at: new Date(Date.now() + TITLE_TTL_MS).toISOString(),
        },
        { onConflict: 'player_id' },
      );
    }
  }
}

/**
 * CYCLE DE LA SEMAINE (tout est LAZY, aucun cron) :
 *  - lundi→vendredi : boss actif, frappable ;
 *  - SAMEDI : la course est finie → finalisation (classement figé, récompenses de
 *    rang mises en attente). Le boss DISPARAÎT — c'est la fenêtre où le bouton
 *    « récompenses de classement » s'active ;
 *  - DIMANCHE : RESET — le boss de la semaine suivante apparaît (frappable lundi).
 *
 * Renvoie l'event actif (ou null le samedi, phase récompenses).
 */
async function ensureEvent(admin: Admin): Promise<Record<string, unknown> | null> {
  const now = Date.now();
  const wk = isoWeekKey(now);
  const { data: active } = await admin.from('world_boss_events').select('*').eq('status', 'active').maybeSingle();

  if (active) {
    const evKey = active.week_key as string;
    // Event d'une semaine FUTURE : créé dimanche pour la semaine qui s'ouvre
    // (les clés ISO `YYYY-Www` se comparent lexicographiquement). Actif tel quel.
    if (evKey > wk) return active as Record<string, unknown>;
    // Semaine courante, encore en phase de combat (lun→ven) : actif tel quel.
    if (evKey === wk && !isWeekend(now)) return active as Record<string, unknown>;
    // Week-end atteint (la course de SA semaine est finie) ou semaine dépassée
    // (personne n'a appelé pendant le week-end) : finalisation.
    await finalizeEvent(admin, active as Record<string, unknown>);
  }

  const day = parisWeekday(now); // 0 = dimanche … 6 = samedi (cf. events.ts)
  // SAMEDI : pas de boss — phase « récompenses de classement ».
  if (day === 6) return null;
  // DIMANCHE : reset dominical — on crée l'event de la semaine SUIVANTE (l'ancre
  // +3 jours tombe en plein milieu de cette semaine-là, robuste au DST).
  const refMs = day === 0 ? now + 3 * 86_400_000 : now;
  const key = isoWeekKey(refMs);

  // Création idempotente (conflit d'unicité sur week_key → on relit).
  const { data: created, error } = await admin
    .from('world_boss_events')
    .insert({
      week_key: key,
      boss_name: worldBossName(key),
      boss_combatant: worldBossFightCombatant(key),
      ends_at: weekEndsAt(refMs),
    })
    .select('*')
    .maybeSingle();
  if (created) return created as Record<string, unknown>;
  if (error) {
    const { data: fresh } = await admin
      .from('world_boss_events')
      .select('*')
      .eq('week_key', key)
      .eq('status', 'active')
      .maybeSingle();
    return (fresh as Record<string, unknown> | null) ?? null;
  }
  return null;
}

/** Dernier event TERMINÉ (les paliers communs y restent réclamables). */
async function latestEndedEvent(admin: Admin): Promise<Record<string, unknown> | null> {
  const { data } = await admin
    .from('world_boss_events')
    .select('*')
    .eq('status', 'ended')
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

/** Somme des dégâts d'UN joueur sur un event (léger — pas toute la table des hits). */
async function myDamageOf(admin: Admin, eventId: string, userId: string): Promise<number> {
  const { data } = await admin
    .from('world_boss_hits')
    .select('damage')
    .eq('event_id', eventId)
    .eq('player_id', userId);
  return (data ?? []).reduce((s: number, h: { damage: number }) => s + Number(h.damage ?? 0), 0);
}

/**
 * Paliers COMMUNS réclamables par le joueur sur un event (actif OU terminé).
 * La finalisation du samedi ne doit pas faire perdre les paliers non réclamés :
 * on continue de les servir sur le dernier event terminé.
 */
async function claimableCommonTiers(
  admin: Admin,
  userId: string,
  ev: Record<string, unknown>,
  defs: WorldBossTier[],
): Promise<WorldBossTier[]> {
  const eventId = ev.id as string;
  const unlocked = tiersUnlocked(Number(ev.total_damage), defs);
  const myDamage = await myDamageOf(admin, eventId, userId);
  if (myDamage <= 0) return [];
  const { data: myClaims } = await admin
    .from('world_boss_tier_claims')
    .select('tier_idx')
    .eq('event_id', eventId)
    .eq('player_id', userId);
  const claimedIdx = new Set((myClaims ?? []).map((c: { tier_idx: number }) => c.tier_idx));
  return defs.filter((t) => t.idx <= unlocked && !claimedIdx.has(t.idx));
}

/** Récompenses de CLASSEMENT en attente de réclamation (toutes semaines confondues). */
async function pendingRankRewards(admin: Admin, userId: string) {
  const { data } = await admin
    .from('world_boss_rank_rewards')
    .select('event_id, week_key, boss_name, rank, gold, tears, eclat')
    .eq('player_id', userId)
    .is('claimed_at', null)
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as {
    event_id: string;
    week_key: string;
    boss_name: string;
    rank: number;
    gold: number;
    tears: number;
    eclat: number;
  }[];
  return {
    count: rows.length,
    gold: rows.reduce((s, r) => s + Number(r.gold ?? 0), 0),
    tears: rows.reduce((s, r) => s + Number(r.tears ?? 0), 0),
    eclat: rows.reduce((s, r) => s + Number(r.eclat ?? 0), 0),
    rows,
  };
}

/** Réponse `state` : event, jauge, paliers, mes dégâts/frappe/titre, classement,
 *  récompenses de classement EN ATTENTE (gommette + bouton côté front). */
async function buildState(admin: Admin, userId: string, event: Record<string, unknown> | null) {
  const defs = await tierDefs(admin);
  const weekday = !isWeekend(Date.now());
  const rankPending = await pendingRankRewards(admin, userId);

  // Paliers communs réclamables : sur l'event ACTIF et sur le DERNIER TERMINÉ —
  // la finalisation du samedi ne doit pas faire perdre les paliers non réclamés.
  const ended = await latestEndedEvent(admin);
  let claimableGold = 0;
  let claimableTears = 0;
  // (un event 'active' et un 'ended' ne partagent jamais le même id)
  for (const ev of [event, ended].filter(Boolean) as Record<string, unknown>[]) {
    const tiers = await claimableCommonTiers(admin, userId, ev, defs);
    claimableGold += tiers.reduce((s, t) => s + (t.reward.gold ?? 0), 0);
    claimableTears += tiers.reduce((s, t) => s + (t.reward.tears ?? 0), 0);
  }

  const { data: myTitle } = await admin
    .from('player_event_titles')
    .select('title, stat_mult, expires_at')
    .eq('player_id', userId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!event) {
    // SAMEDI : le boss est tombé — phase récompenses. Le classement FINAL de la
    // semaine reste affiché (dernier event terminé).
    return {
      active: false,
      hittable: false,
      weekday,
      tiers: defs,
      claimable_gold: claimableGold,
      claimable_tears: claimableTears,
      rank_rewards_pending: rankPending,
      my_title: myTitle ?? null,
      last_boss_name: (ended?.boss_name as string) ?? null,
      leaderboard: ended ? await leaderboard(admin, ended.id as string, 20) : [],
      server_now: new Date().toISOString(),
    };
  }

  const eventId = event.id as string;
  const total = Number(event.total_damage);
  const unlocked = Math.max(Number(event.tiers_unlocked), tiersUnlocked(total, defs));
  const day = parisDayKey(Date.now());

  const byPlayer = await perPlayerDamage(admin, eventId);
  const myDamage = byPlayer.get(userId) ?? 0;

  const { data: myHitToday } = await admin
    .from('world_boss_hits')
    .select('damage')
    .eq('event_id', eventId)
    .eq('player_id', userId)
    .eq('hit_day', day)
    .maybeSingle();

  return {
    active: true,
    boss_name: event.boss_name,
    total_damage: total,
    tiers: defs,
    tiers_unlocked: unlocked,
    hittable: weekday,
    weekday,
    already_hit_today: Boolean(myHitToday),
    my_damage: myDamage,
    my_today_damage: myHitToday ? Number(myHitToday.damage) : 0,
    claimable_gold: claimableGold,
    claimable_tears: claimableTears,
    rank_rewards_pending: rankPending,
    my_title: myTitle ?? null,
    ends_at: event.ends_at,
    leaderboard: await leaderboard(admin, eventId, 20),
    server_now: new Date().toISOString(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Config serveur manquante' }, 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Non authentifié' }, 401);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'Session invalide' }, 401);

  let body: { action?: unknown; hero_ids?: unknown };
  try {
    body = (await req.json()) as { action?: unknown; hero_ids?: unknown };
  } catch {
    return json({ error: 'Corps de requête invalide' }, 400);
  }
  const action = body.action ?? 'state';

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const event = await ensureEvent(admin);

  // -------------------------------------------------------------------- STATE
  if (action === 'state') {
    return json(await buildState(admin, user.id, event));
  }

  // -------------------------------------------------------------- LEADERBOARD
  if (action === 'leaderboard') {
    if (!event) return json({ rows: [] });
    return json({ rows: await leaderboard(admin, event.id as string, 50) });
  }

  // ---------------------------------------------------------------------- HIT
  if (action === 'hit') {
    if (!event) return json({ error: 'Aucun boss actif' }, 409);
    if (isWeekend(Date.now())) {
      return json({ error: 'Le boss n’est frappable qu’en semaine (lun→ven).' }, 409);
    }

    const heroIds = body.hero_ids;
    if (!Array.isArray(heroIds) || heroIds.some((h) => typeof h !== 'string')) {
      return json({ error: 'hero_ids invalide' }, 400);
    }
    const unique = [...new Set(heroIds as string[])];
    if (unique.length < 1 || unique.length > MAX_TEAM) return json({ error: `Entre 1 et ${MAX_TEAM} héros` }, 400);

    // Plafond de doublons de classe. Contrôlé AVANT l'insertion de la frappe du
    // jour : refuser après consommerait l'unique frappe quotidienne du joueur
    // pour une équipe qui n'a jamais combattu.
    {
      const { data: classRows } = await admin
        .from('heroes')
        .select('class_id')
        .in('id', unique)
        .eq('owner_id', user.id);
      const check = checkTeamClasses((classRows ?? []).map((r: { class_id: string }) => r.class_id));
      if (!check.ok) return json({ error: tooManySameClassError(check.limit) }, 400);
    }

    // Unicité 1 frappe/jour : on insère d'abord la ligne du jour (damage 0). Conflit
    // sur la PK (event, joueur, jour) = déjà frappé aujourd'hui.
    const day = parisDayKey(Date.now());
    const { error: dupErr } = await admin
      .from('world_boss_hits')
      .insert({ event_id: event.id as string, player_id: user.id, hit_day: day, damage: 0 });
    if (dupErr) return json({ error: 'Tu as déjà frappé le boss aujourd’hui. Reviens demain !' }, 409);

    // Escouade : héros POSSÉDÉS uniquement (build live + buff de guilde).
    const { data: ownedRows } = await admin.from('heroes').select(HERO_SELECT).in('id', unique).eq('owner_id', user.id);
    if (!ownedRows || ownedRows.length === 0) return json({ error: 'Aucun héros valide' }, 400);
    const buff = await guildBuffOf(admin, user.id);
    const snapshotById = new Map<string, CombatantInput>();
    // deno-lint-ignore no-explicit-any
    for (const h of ownedRows as any[]) snapshotById.set(h.id, buildHeroSnapshot(toSnapshotInput(h), buff));
    const squad = unique.map((id) => snapshotById.get(id)).filter((c): c is CombatantInput => Boolean(c));

    // Combat serveur contre le sac de frappe (celui figé dans l'event, seed serveur).
    const boss = event.boss_combatant as CombatantInput;
    const seed = Math.floor(Math.random() * 2_147_483_647);
    const combat = resolveCombat({ allies: squad, enemies: [boss], seed });
    const bossFinal = combat.finalState.find((f) => f.id === boss.id);
    const damage = Math.max(0, (bossFinal?.maxHp ?? 0) - (bossFinal?.hp ?? 0));

    // Crédite la frappe du jour (met à jour la ligne qu'on vient d'insérer).
    await admin
      .from('world_boss_hits')
      .update({ damage })
      .eq('event_id', event.id as string)
      .eq('player_id', user.id)
      .eq('hit_day', day);

    // Cumule au total collectif de façon ATOMIQUE (RPC increment).
    const { data: newTotalRaw } = await admin.rpc('increment_world_boss_damage', {
      p_event_id: event.id as string,
      p_amount: damage,
    });
    const newTotal = Number(newTotalRaw ?? Number(event.total_damage) + damage);

    // Met à jour le compteur de paliers franchis (paiement différé via `claim`).
    const defs = await tierDefs(admin);
    const unlocked = tiersUnlocked(newTotal, defs);
    if (unlocked > Number(event.tiers_unlocked)) {
      await admin.from('world_boss_events').update({ tiers_unlocked: unlocked }).eq('id', event.id as string);
    }

    return json({
      combat: { rounds: combat.rounds, result: combat.result, events: combat.events, final_state: combat.finalState },
      damage,
      total_damage: newTotal,
      tiers_unlocked: unlocked,
    });
  }

  // -------------------------------------------------------------------- CLAIM
  // Paliers COMMUNS : réclamables sur l'event ACTIF et sur le DERNIER TERMINÉ
  // (la finalisation du samedi ne fait pas perdre les paliers non réclamés).
  if (action === 'claim') {
    const defs = await tierDefs(admin);
    const ended = await latestEndedEvent(admin);
    const events = [event, ended].filter(Boolean) as Record<string, unknown>[];
    if (events.length === 0) return json({ gold: 0, tears: 0, claimed: [] });

    let gold = 0;
    let tears = 0;
    const claimedNow: number[] = [];
    for (const ev of events) {
      const eventId = ev.id as string;
      const toClaim = await claimableCommonTiers(admin, user.id, ev, defs);
      for (const t of toClaim) {
        // Insertion de la réclamation d'abord (garde anti double-crédit multi-onglets).
        const { error: claimErr } = await admin
          .from('world_boss_tier_claims')
          .insert({ event_id: eventId, player_id: user.id, tier_idx: t.idx });
        if (claimErr) continue; // déjà réclamé en parallèle
        gold += t.reward.gold ?? 0;
        tears += t.reward.tears ?? 0;
        claimedNow.push(t.idx);
      }
    }
    if (gold > 0) await admin.rpc('add_player_gold', { p_player: user.id, p_amount: gold });
    if (tears > 0) await addTears(admin, user.id, tears);
    return json({ gold, tears, claimed: claimedNow });
  }

  // --------------------------------------------------------------- CLAIM RANK
  // Récompenses de CLASSEMENT (or + larmes + Éclat sacré) mises en attente à la
  // finalisation du week-end. CAS ligne à ligne (claimed_at NULL → maintenant) :
  // deux onglets qui réclament en parallèle ne créditent jamais deux fois.
  if (action === 'claim_rank') {
    const pending = await pendingRankRewards(admin, user.id);
    if (pending.count === 0) return json({ gold: 0, tears: 0, eclat: 0, claimed: [] });

    const eclatSacre = EVENT_MATERIALS.world_boss; // Éclat sacré → armure divine
    const nowIso = new Date().toISOString();
    let gold = 0;
    let tears = 0;
    let eclat = 0;
    const claimedNow: typeof pending.rows = [];
    for (const row of pending.rows) {
      const { data: won } = await admin
        .from('world_boss_rank_rewards')
        .update({ claimed_at: nowIso })
        .eq('event_id', row.event_id)
        .eq('player_id', user.id)
        .is('claimed_at', null)
        .select('event_id');
      if (!won || won.length === 0) continue; // déjà réclamé en parallèle
      gold += Number(row.gold ?? 0);
      tears += Number(row.tears ?? 0);
      eclat += Number(row.eclat ?? 0);
      claimedNow.push(row);
    }
    if (gold > 0) await admin.rpc('add_player_gold', { p_player: user.id, p_amount: gold });
    if (tears > 0) await addTears(admin, user.id, tears);
    if (eclat > 0) await addResourceAt(admin, user.id, eclatSacre.key, eclat, EVENT_MATERIAL_TIER);
    return json({ gold, tears, eclat, claimed: claimedNow });
  }

  return json({ error: 'Action inconnue' }, 400);
});
