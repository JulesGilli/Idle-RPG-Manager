// Edge Function : arena
// Arène PvP ASYNCHRONE. Actions :
//  - set_team    : dépose/actualise l'équipe de défense (snapshot figé) ; entrée
//                  au bas de l'échelle si nouveau.
//  - challenge   : défie un joueur mieux classé (à portée) ; combat simulé serveur ;
//                  victoire = échange des rangs.
//  - claim_weekly: réclame la récompense de la semaine (rang × participants), 1×/semaine.
// Tout est calculé côté serveur (anti-triche), combats via /shared/combat.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resourceTier, arcMaterialKey } from '@shared/progression/arcMaterials.ts';
import { checkTeamClasses, tooManySameClassError } from '@shared/progression/teamComposition.ts';
import type { CombatantInput } from '@shared/combat/index.ts';
import { resolveCombat } from '@shared/combat/resolveCombat.ts';
import { buildHeroSnapshot, itemCombatPassive, type HeroSnapshotInput } from '@shared/progression/heroLoan.ts';
import { computeSetBonuses, equippedSetTier } from '@shared/progression/sets.ts';
import { heroPower } from '@shared/progression/formulas.ts';
import {
  canChallenge,
  arenaRanksAfterChallenge,
  arenaWeeklyReward,
  arenaRewardZone,
  arenaRewardEligible,
  MAX_ZONE,
  isoWeekKey,
  ARENA_MAX_TEAM,
} from '@shared/progression/arena.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = { action?: unknown; hero_ids?: unknown; defender_player_id?: unknown; kind?: unknown };

/** Rôle d'une compo d'arène : celle qui encaisse, ou celle qui part au défi. */
type TeamKind = 'defense' | 'attack';

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

/** Construit l'équipe (snapshots) d'un joueur à partir de ses héros vivants. */
async function buildTeam(admin: Admin, userId: string, heroIds: string[]): Promise<CombatantInput[]> {
  if (heroIds.length === 0) return [];
  const { data: rows } = await admin.from('heroes').select(HERO_SELECT).in('id', heroIds).eq('owner_id', userId);
  const byId = new Map<string, CombatantInput>();
  // deno-lint-ignore no-explicit-any
  for (const h of (rows ?? []) as any[]) byId.set(h.id, buildHeroSnapshot(toSnapshotInput(h)));
  return heroIds.map((id) => byId.get(id)).filter((c): c is CombatantInput => Boolean(c));
}

/**
 * Crédit d'or ATOMIQUE via le RPC `add_player_gold`. L'ancien lire-puis-écrire
 * perdait de l'or sous requêtes concurrentes — même bug et même correctif que
 * `resolve-deployment` (cf. [[anti-multitab-hardening]]).
 */
async function addGold(admin: Admin, userId: string, gold: number): Promise<void> {
  if (!gold || gold <= 0) return;
  const { error } = await admin.rpc('add_player_gold', { p_player: userId, p_amount: gold });
  if (error) throw error;
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
 * Crédit de ressources ATOMIQUE (`amount = amount + n` en base, RPC
 * `add_player_resource`). C'était un lire-puis-upsert : deux crédits
 * concurrents — deux onglets, une reprise d’appli sur mobile, ou simplement
 * deux activités résolues en parallèle — et le second écrasait le premier.
 * C'est le bug qui a fait perdre son butin à un joueur sur le farm de carte.
 *
 * Le TIER de stockage se décide par clé (`resourceTier`) : les ressources
 * mutualisées entre arcs (plume d'appel, larme astrale) vivent au tier 1.
 */
async function addResources(
  admin: Admin,
  userId: string,
  materials: { key: string; qty: number }[],
  tier = 1,
): Promise<void> {
  for (const { key, qty } of materials) {
    if (!key || qty <= 0) continue;
    const { error } = await admin.rpc('add_player_resource', {
      p_player: userId,
      p_resource: key,
      p_amount: qty,
      p_tier: resourceTier(key, tier),
    });
    if (error) throw error;
  }
}

function parisWeek(): string {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return isoWeekKey(day);
}

/**
 * Zone atteinte par un joueur = plus haute `maps.sort` dont il a fini un niveau
 * DANS L'ARC demandé.
 *
 * Le filtre d'arc est indispensable pour le butin par joueur : sans lui, un
 * joueur d'arc 2 encore en zone 4 remonterait à la zone 10 (ses niveaux d'arc 1
 * terminés), et toucherait un matériau de fin de jeu qu'il ne peut pas encore
 * utiliser. `arc = 0` → toutes les progressions confondues (repli historique,
 * pour la zone du leader figée à la clôture).
 */
async function zoneOfPlayer(admin: Admin, playerId: string, arc = 0): Promise<number> {
  // Trois requêtes simples plutôt qu'un embed PostgREST : la zone détermine le
  // butin, on ne veut pas qu'un nom de relation qui change la fasse retomber à 1.
  let progQ = admin.from('level_progress').select('level_id').eq('player_id', playerId);
  if (arc > 0) progQ = progQ.eq('arc', arc);
  const { data: prog } = await progQ;
  const levelIds = ((prog ?? []) as { level_id: string }[]).map((r) => r.level_id);
  if (levelIds.length === 0) return 1;

  const { data: lvls } = await admin.from('levels').select('map_id').in('id', levelIds);
  const mapIds = [...new Set(((lvls ?? []) as { map_id: string }[]).map((r) => r.map_id))];
  if (mapIds.length === 0) return 1;

  const { data: mps } = await admin.from('maps').select('sort').in('id', mapIds);
  let zone = 1;
  for (const m of (mps ?? []) as { sort: number }[]) zone = Math.max(zone, m.sort ?? 1);
  return zone;
}

/** Matériau de farm par zone (`maps.sort` → `maps.resource`). */
async function zoneResources(admin: Admin): Promise<Map<number, string>> {
  const { data } = await admin.from('maps').select('sort, resource').order('sort');
  const out = new Map<number, string>();
  for (const m of (data ?? []) as { sort: number; resource: string }[]) out.set(m.sort, m.resource);
  return out;
}

/**
 * Clôture la semaine écoulée si nécessaire : fige le classement dans
 * `arena_week_results`, puis remet le classement à zéro pour la semaine en cours.
 *
 * Déclenché paresseusement par le PREMIER joueur qui touche l'arène après le
 * changement de semaine — il n'y a pas de tâche planifiée côté serveur. L'insert
 * est idempotent (`ignoreDuplicates` sur la PK (week, player_id)) : deux joueurs
 * simultanés ne peuvent pas dupliquer la photo.
 */
async function closeWeekIfNeeded(admin: Admin, week: string): Promise<void> {
  const { data: stale } = await admin
    .from('arena_entries')
    .select('player_id, rank, wins, losses, active_week')
    .neq('active_week', week);
  const rows = (stale ?? []) as {
    player_id: string;
    rank: number;
    wins: number;
    losses: number;
    active_week: string;
  }[];
  if (rows.length === 0) return;

  // La zone de référence est celle du 1er de CETTE semaine-là, figée maintenant.
  const leader = rows.reduce((best, r) => (r.rank < best.rank ? r : best), rows[0]!);
  const leaderZone = await zoneOfPlayer(admin, leader.player_id);

  const byWeek = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byWeek.get(r.active_week) ?? [];
    arr.push(r);
    byWeek.set(r.active_week, arr);
  }
  for (const [wk, entries] of byWeek) {
    await admin.from('arena_week_results').upsert(
      entries.map((r) => ({
        week: wk,
        player_id: r.player_id,
        rank: r.rank,
        participants: entries.length,
        wins: r.wins ?? 0,
        losses: r.losses ?? 0,
        leader_zone: leaderZone,
      })),
      { onConflict: 'week,player_id', ignoreDuplicates: true },
    );
  }

  // Nouvelle semaine : compteurs de combats remis à zéro, le classement repart.
  for (const r of rows) {
    await admin
      .from('arena_entries')
      .update({ wins: 0, losses: 0, active_week: week })
      .eq('player_id', r.player_id)
      .eq('active_week', r.active_week);
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

  // Toute action d'arène clôture d'abord la semaine écoulée si elle traîne : la
  // photo du classement doit exister avant qu'on puisse la réclamer.
  await closeWeekIfNeeded(admin, parisWeek());

  // ------------------------------------------------------------------ STATE
  // Ce que le joueur possède EN PROPRE dans l'arène. La vue publique
  // `arena_ladder` ne peut pas servir ici : elle n'expose pas (et ne doit pas
  // exposer) la compo d'ATTAQUE, qui est une information privée.
  if (action === 'state') {
    const { data: row } = await admin
      .from('arena_entries')
      .select('rank, power, wins, losses, team_hero_ids, attack_hero_ids')
      .eq('player_id', user.id)
      .maybeSingle();
    return json({
      in_arena: Boolean(row),
      rank: row?.rank ?? null,
      power: row?.power ?? 0,
      wins: row?.wins ?? 0,
      losses: row?.losses ?? 0,
      team_hero_ids: (row?.team_hero_ids as string[]) ?? [],
      attack_hero_ids: (row?.attack_hero_ids as string[]) ?? [],
    });
  }

  // --------------------------------------------------------------- SET TEAM
  if (action === 'set_team') {
    // `kind` absent → défense : c'était le seul rôle avant l'équipe d'attaque,
    // et les anciens clients continuent d'envoyer un corps sans ce champ.
    const kind: TeamKind = body.kind === 'attack' ? 'attack' : 'defense';
    const heroIds = body.hero_ids;
    if (!Array.isArray(heroIds) || heroIds.some((h) => typeof h !== 'string')) {
      return json({ error: 'hero_ids invalide' }, 400);
    }
    const unique = [...new Set(heroIds as string[])];
    // L'attaque accepte le VIDE : c'est ainsi qu'on revient au repli « j'attaque
    // avec ma défense ». La défense, elle, est l'acte d'entrée dans l'arène.
    if (kind === 'defense' && unique.length < 1) {
      return json({ error: `Entre 1 et ${ARENA_MAX_TEAM} héros` }, 400);
    }
    if (unique.length > ARENA_MAX_TEAM) {
      return json({ error: `Entre 1 et ${ARENA_MAX_TEAM} héros` }, 400);
    }
    // Plafond de doublons de classe, contrôlé à l'ENREGISTREMENT de la compo et
    // non au combat : une équipe sauvegardée AVANT la règle resterait sinon
    // injouable en défense comme en attaque, sans que son propriétaire puisse
    // rien y faire tant qu'il n'y revient pas. Elle se régularise à la
    // prochaine sauvegarde.
    {
      const { data: classRows } = await admin
        .from('heroes')
        .select('class_id')
        .in('id', unique)
        .eq('owner_id', user.id);
      const check = checkTeamClasses((classRows ?? []).map((r: { class_id: string }) => r.class_id));
      if (!check.ok) return json({ error: tooManySameClassError(check.limit) }, 400);
    }

    const team = await buildTeam(admin, user.id, unique);
    if (team.length !== unique.length) return json({ error: 'Héros non possédés' }, 403);

    // ---------------------------------------------------------- ATTAQUE
    // Pas de snapshot, pas de puissance : contrairement à la défense (photo
    // figée qu'un adversaire affronte à tout moment), la compo d'attaque est
    // reconstruite À CHAQUE défi depuis les héros vivants — un équipement
    // amélioré profite donc immédiatement au prochain défi.
    //
    // Elle n'ouvre pas non plus l'entrée dans l'échelle : sans défense déposée,
    // on n'a ni rang d'où défier ni place à défendre.
    if (kind === 'attack') {
      const { data: entry } = await admin
        .from('arena_entries')
        .select('player_id')
        .eq('player_id', user.id)
        .maybeSingle();
      if (!entry) return json({ error: 'Dépose d’abord une équipe de défense' }, 400);
      await admin
        .from('arena_entries')
        .update({ attack_hero_ids: unique, updated_at: new Date().toISOString() })
        .eq('player_id', user.id);
      return json({ ok: true, attack_hero_ids: unique });
    }

    const power = team.reduce((s, c) => s + heroPower(c), 0);
    const week = parisWeek();
    const { data: existing } = await admin
      .from('arena_entries')
      .select('player_id')
      .eq('player_id', user.id)
      .maybeSingle();

    if (existing) {
      await admin
        .from('arena_entries')
        .update({
          team_hero_ids: unique,
          team_snapshot: team,
          power,
          active_week: week,
          updated_at: new Date().toISOString(),
        })
        .eq('player_id', user.id);
      return json({ ok: true, power });
    }

    const { data: last } = await admin
      .from('arena_entries')
      .select('rank')
      .order('rank', { ascending: false })
      .limit(1)
      .maybeSingle();
    const rank = (last?.rank ?? 0) + 1;
    await admin.from('arena_entries').insert({
      player_id: user.id,
      rank,
      team_hero_ids: unique,
      team_snapshot: team,
      power,
      active_week: week,
    });
    return json({ ok: true, rank, power });
  }

  // -------------------------------------------------------------- CHALLENGE
  if (action === 'challenge') {
    const defenderId = body.defender_player_id;
    if (typeof defenderId !== 'string') return json({ error: 'defender_player_id invalide' }, 400);
    if (defenderId === user.id) return json({ error: 'Tu ne peux pas te défier toi-même' }, 400);

    const { data: me } = await admin
      .from('arena_entries')
      .select('rank, team_hero_ids, attack_hero_ids')
      .eq('player_id', user.id)
      .maybeSingle();
    if (!me) return json({ error: 'Dépose d’abord une équipe de défense' }, 400);

    const { data: def } = await admin
      .from('arena_entries')
      .select('rank, team_snapshot')
      .eq('player_id', defenderId)
      .maybeSingle();
    if (!def) return json({ error: 'Adversaire introuvable' }, 404);

    // Refonte PvP : tout le monde peut défier tout le monde, sans cooldown. Seule
    // limite, ne pas se défier soi-même (déjà écarté plus haut par l'id).
    if (!canChallenge(me.rank, def.rank)) {
      return json({ error: 'Adversaire invalide' }, 400);
    }

    // L'ATTAQUE prime, la défense sert de repli. Un joueur qui n'a jamais
    // touché à sa compo d'attaque (ou qui l'a vidée pour revenir en arrière)
    // part donc avec sa défense — le comportement d'avant la séparation.
    const attackIds = (me.attack_hero_ids as string[] | null) ?? [];
    const rosterIds = attackIds.length > 0 ? attackIds : ((me.team_hero_ids as string[]) ?? []);
    const attackers = await buildTeam(admin, user.id, rosterIds);
    if (attackers.length === 0) {
      return json({ error: 'Reconfigure ton équipe d’arène' }, 400);
    }
    // Défenseur : snapshot figé, réétiqueté côté ennemi (ids uniques pour le replay).
    const defenders = ((def.team_snapshot as CombatantInput[]) ?? []).map((c, i) => ({
      ...c,
      id: `foe-${i}-${c.id}`,
    }));
    if (defenders.length === 0) return json({ error: 'Adversaire sans équipe' }, 400);

    const seed = Math.floor(Math.random() * 2_147_483_647);
    const combat = resolveCombat({ allies: attackers, enemies: defenders, seed });
    const win = combat.result === 'win';

    const week = parisWeek();
    const nowIso = new Date().toISOString();
    const myOldRank = me.rank as number;
    const defOldRank = def.rank as number;
    // On ne GRIMPE qu'en battant mieux classé ; battre plus bas ou perdre ne
    // touche à aucun rang (cf. `arenaRanksAfterChallenge`).
    const ranks = arenaRanksAfterChallenge(myOldRank, defOldRank, win);

    // Compteurs.
    const { data: meRow } = await admin.from('arena_entries').select('wins, losses').eq('player_id', user.id).single();
    const { data: defRow } = await admin.from('arena_entries').select('wins, losses').eq('player_id', defenderId).single();

    await admin
      .from('arena_entries')
      .update({
        rank: ranks.challenger,
        wins: (meRow?.wins ?? 0) + (win ? 1 : 0),
        losses: (meRow?.losses ?? 0) + (win ? 0 : 1),
        // Timestamp INFORMATIF (plus de cooldown) — lu par le panneau admin.
        last_challenge_at: nowIso,
        active_week: week,
        updated_at: nowIso,
      })
      .eq('player_id', user.id);
    await admin
      .from('arena_entries')
      .update({
        rank: ranks.defender,
        wins: (defRow?.wins ?? 0) + (win ? 0 : 1),
        losses: (defRow?.losses ?? 0) + (win ? 1 : 0),
      })
      .eq('player_id', defenderId);

    return json({
      result: combat.result,
      win,
      new_rank: ranks.challenger,
      combat: {
        rounds: combat.rounds,
        events: combat.events,
        final_state: combat.finalState,
        result: combat.result,
      },
    });
  }

  // ----------------------------------------------------------- CLAIM WEEKLY
  if (action === 'claim_weekly') {
    // On paie le classement FIGÉ d'une semaine écoulée, jamais celui en cours :
    // sinon s'inscrire suffisait à encaisser immédiatement la 1re place.
    const week = parisWeek();
    const { data: pending } = await admin
      .from('arena_week_results')
      .select('week, rank, participants, wins, losses, leader_zone')
      .eq('player_id', user.id)
      .is('claimed_at', null)
      .neq('week', week)
      .order('week', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!pending) {
      return json(
        { error: 'Aucune récompense en attente — le classement se solde en fin de semaine.', already_claimed: true },
        409,
      );
    }
    if (!arenaRewardEligible(pending.wins as number, pending.losses as number)) {
      return json(
        { error: 'Il faut avoir livré au moins un combat d’arène dans la semaine pour être récompensé.' },
        403,
      );
    }

    // Zone de référence = celle du RÉCLAMANT, +1, dans SON arc courant — et non
    // plus celle du leader. Un joueur zone 4 arc 2 reçoit ainsi du zone 5 arc 2,
    // « toujours la zone au-dessus de sa progression », à sa portée. `leader_zone`
    // reste stocké mais ne pilote plus le butin.
    const tier = await currentArcOf(admin, user.id);
    const playerZone = await zoneOfPlayer(admin, user.id, tier);
    const zone = arenaRewardZone(playerZone);
    const resources = await zoneResources(admin);
    // maps.resource porte la clé d'ARC 1 : on la traduit vers le jumeau de l'arc
    // du joueur (`arcMaterialKey`), sinon un joueur d'arc 2 recevait une ressource
    // d'arc 1 qu'aucune de ses recettes ne consomme — même piège que les autres
    // activités déjà corrigées.
    const baseResource = resources.get(zone) ?? resources.get(MAX_ZONE)!;
    const zoneResource = arcMaterialKey(baseResource, tier);
    const reward = arenaWeeklyReward(
      pending.rank as number,
      pending.participants as number,
      zoneResource,
    );

    // Marquage AVANT crédit, conditionné à claimed_at encore nul : deux onglets
    // simultanés ne peuvent pas encaisser deux fois (même garde que le reste du jeu).
    const { data: claimed } = await admin
      .from('arena_week_results')
      .update({ claimed_at: new Date().toISOString() })
      .eq('player_id', user.id)
      .eq('week', pending.week)
      .is('claimed_at', null)
      .select('week');
    if (!claimed || claimed.length === 0) {
      return json({ error: 'Récompense déjà réclamée', already_claimed: true }, 409);
    }

    await addGold(admin, user.id, reward.gold);
    await addResources(admin, user.id, reward.materials, tier);
    await admin.from('arena_entries').update({ last_reward_week: pending.week }).eq('player_id', user.id);

    return json({
      ok: true,
      reward,
      rank: pending.rank,
      participants: pending.participants,
      week: pending.week,
      zone,
    });
  }

  return json({ error: 'Action inconnue' }, 400);
});
