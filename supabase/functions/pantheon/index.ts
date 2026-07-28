// Edge Function : pantheon
// Le Panthéon (Arc 2) — PvP par 5 équipes de 3. Actions :
//   - state     : mon entrée (rang, compos, compteurs) + éligibilité.
//   - set_teams : dépose/actualise mes 5 équipes (snapshots figés en défense).
//   - challenge : défie un joueur ; les 5 équipes s'affrontent en série,
//                 majorité (3/5) gagne. On grimpe en battant mieux classé.
// Tout est calculé côté serveur (anti-triche), combats via /shared/combat.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import type { CombatantInput } from '@shared/combat/index.ts';
import { resolveCombat } from '@shared/combat/resolveCombat.ts';
import { buildHeroSnapshot, itemCombatPassive, type HeroSnapshotInput } from '@shared/progression/heroLoan.ts';
import { computeSetBonuses, equippedSetTier } from '@shared/progression/sets.ts';
import { heroPower } from '@shared/progression/formulas.ts';
import { checkTeamClasses, tooManySameClassError } from '@shared/progression/teamComposition.ts';
import { arenaRanksAfterChallenge } from '@shared/progression/arena.ts';
import {
  validatePantheonTeams,
  pantheonAllHeroes,
  pantheonSeriesWin,
  PANTHEON_TEAMS,
  PANTHEON_TEAM_SIZE,
  PANTHEON_ROSTER,
  PANTHEON_MIN_ARC,
} from '@shared/progression/pantheon.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// deno-lint-ignore no-explicit-any
type Admin = any;
type Body = { action?: unknown; teams?: unknown; defender_player_id?: unknown };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

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
  const setB = computeSetBonuses(
    [h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id],
    h.class_id,
    equippedSetTier([h.weapon, h.armor, h.jewel, h.relic]),
  );
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

/** Snapshots (live) d'une liste d'ids POSSÉDÉS, dans l'ordre demandé. */
async function buildTeam(admin: Admin, userId: string, heroIds: string[]): Promise<CombatantInput[]> {
  if (heroIds.length === 0) return [];
  const { data: rows } = await admin.from('heroes').select(HERO_SELECT).in('id', heroIds).eq('owner_id', userId);
  const byId = new Map<string, CombatantInput>();
  // deno-lint-ignore no-explicit-any
  for (const h of (rows ?? []) as any[]) byId.set(h.id, buildHeroSnapshot(toSnapshotInput(h)));
  return heroIds.map((id) => byId.get(id)).filter((c): c is CombatantInput => Boolean(c));
}

/** Arc le plus haut débloqué (commande l'accès au bâtiment). */
async function maxArcOf(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin.from('player_arc').select('max_arc').eq('player_id', userId).maybeSingle();
  return Math.max(1, (data?.max_arc as number | undefined) ?? 1);
}

/** Nombre de héros possédés (pour savoir si on peut aligner 15). */
async function heroCountOf(admin: Admin, userId: string): Promise<number> {
  const { count } = await admin
    .from('heroes')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId);
  return count ?? 0;
}

function parisWeek(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** État privé du joueur dans le Panthéon. */
async function stateOf(admin: Admin, userId: string) {
  const [arc, heroesCount, entry] = await Promise.all([
    maxArcOf(admin, userId),
    heroCountOf(admin, userId),
    admin.from('pantheon_entries').select('rank, power, wins, losses, teams').eq('player_id', userId).maybeSingle(),
  ]);
  const row = entry.data;
  return {
    unlocked: arc >= PANTHEON_MIN_ARC,
    min_arc: PANTHEON_MIN_ARC,
    teams_required: PANTHEON_TEAMS,
    team_size: PANTHEON_TEAM_SIZE,
    roster_required: PANTHEON_ROSTER,
    heroes_count: heroesCount,
    in_pantheon: Boolean(row),
    rank: row?.rank ?? null,
    power: row?.power ?? 0,
    wins: row?.wins ?? 0,
    losses: row?.losses ?? 0,
    teams: (row?.teams as string[][]) ?? [],
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

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: 'Corps invalide' }, 400);
  }
  const action = body.action;
  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ------------------------------------------------------------------ STATE
  if (action === 'state') {
    return json(await stateOf(admin, user.id));
  }

  // -------------------------------------------------------------- SET TEAMS
  if (action === 'set_teams') {
    if ((await maxArcOf(admin, user.id)) < PANTHEON_MIN_ARC) {
      return json({ error: `Le Panthéon se débloque en Arc ${PANTHEON_MIN_ARC}.` }, 403);
    }
    const teams = body.teams;
    const structural = validatePantheonTeams(teams as (string[] | null)[]);
    if (!structural.ok) return json({ error: structural.reason }, 400);
    const teamsArr = teams as string[][];
    const allIds = pantheonAllHeroes(teamsArr);

    // Tous les héros doivent être POSSÉDÉS ; on charge en bloc pour vérifier la
    // possession ET le plafond de doublons de classe PAR équipe.
    const { data: rows } = await admin
      .from('heroes')
      .select('id, class_id')
      .in('id', allIds)
      .eq('owner_id', user.id);
    const owned = new Map((rows ?? []).map((r: { id: string; class_id: string }) => [r.id, r.class_id]));
    if (owned.size !== PANTHEON_ROSTER) return json({ error: 'Héros non possédés' }, 403);
    for (let i = 0; i < teamsArr.length; i++) {
      const check = checkTeamClasses(teamsArr[i]!.map((id) => owned.get(id)!));
      if (!check.ok) return json({ error: `Équipe ${i + 1} : ${tooManySameClassError(check.limit)}` }, 400);
    }

    // Snapshots figés des 5 équipes (défense), + puissance totale.
    const snapshots: CombatantInput[][] = [];
    let power = 0;
    for (const team of teamsArr) {
      const built = await buildTeam(admin, user.id, team);
      if (built.length !== PANTHEON_TEAM_SIZE) return json({ error: 'Héros introuvables' }, 404);
      snapshots.push(built);
      power += built.reduce((s, c) => s + heroPower(c), 0);
    }

    const week = parisWeek();
    const { data: existing } = await admin
      .from('pantheon_entries')
      .select('player_id')
      .eq('player_id', user.id)
      .maybeSingle();

    if (existing) {
      await admin
        .from('pantheon_entries')
        .update({ teams: teamsArr, teams_snapshot: snapshots, power, active_week: week, updated_at: new Date().toISOString() })
        .eq('player_id', user.id);
      return json({ ok: true, power });
    }

    const { data: last } = await admin
      .from('pantheon_entries')
      .select('rank')
      .order('rank', { ascending: false })
      .limit(1)
      .maybeSingle();
    const rank = (last?.rank ?? 0) + 1;
    await admin.from('pantheon_entries').insert({
      player_id: user.id,
      rank,
      teams: teamsArr,
      teams_snapshot: snapshots,
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
      .from('pantheon_entries')
      .select('rank, teams')
      .eq('player_id', user.id)
      .maybeSingle();
    if (!me) return json({ error: 'Dépose d’abord tes 5 équipes' }, 400);

    const { data: def } = await admin
      .from('pantheon_entries')
      .select('rank, teams_snapshot')
      .eq('player_id', defenderId)
      .maybeSingle();
    if (!def) return json({ error: 'Adversaire introuvable' }, 404);
    if (me.rank === def.rank) return json({ error: 'Adversaire invalide' }, 400);

    const myTeams = (me.teams as string[][]) ?? [];
    const defSnaps = (def.teams_snapshot as CombatantInput[][]) ?? [];
    if (myTeams.length !== PANTHEON_TEAMS || defSnaps.length !== PANTHEON_TEAMS) {
      return json({ error: 'Compositions incomplètes — reconfigure tes équipes.' }, 400);
    }

    // Les 5 manches : équipe i (live) contre équipe i figée du défenseur.
    const matchWins: boolean[] = [];
    // deno-lint-ignore no-explicit-any
    const matches: any[] = [];
    for (let i = 0; i < PANTHEON_TEAMS; i++) {
      const attackers = await buildTeam(admin, user.id, myTeams[i]!);
      if (attackers.length === 0) return json({ error: `Équipe ${i + 1} invalide` }, 400);
      const defenders = (defSnaps[i] ?? []).map((c, k) => ({ ...c, id: `foe-${i}-${k}-${c.id}` }));
      if (defenders.length === 0) return json({ error: 'Adversaire sans équipe' }, 400);
      const seed = Math.floor(Math.random() * 2_147_483_647);
      const combat = resolveCombat({ allies: attackers, enemies: defenders, seed });
      const win = combat.result === 'win';
      matchWins.push(win);
      matches.push({
        index: i,
        win,
        combat: { rounds: combat.rounds, events: combat.events, final_state: combat.finalState, result: combat.result },
      });
    }

    const seriesWin = pantheonSeriesWin(matchWins);
    const winsCount = matchWins.filter(Boolean).length;

    const nowIso = new Date().toISOString();
    const week = parisWeek();
    const myOldRank = me.rank as number;
    const defOldRank = def.rank as number;
    const ranks = arenaRanksAfterChallenge(myOldRank, defOldRank, seriesWin);

    const { data: meRow } = await admin.from('pantheon_entries').select('wins, losses').eq('player_id', user.id).single();
    const { data: defRow } = await admin.from('pantheon_entries').select('wins, losses').eq('player_id', defenderId).single();

    await admin
      .from('pantheon_entries')
      .update({
        rank: ranks.challenger,
        wins: (meRow?.wins ?? 0) + (seriesWin ? 1 : 0),
        losses: (meRow?.losses ?? 0) + (seriesWin ? 0 : 1),
        last_challenge_at: nowIso,
        active_week: week,
        updated_at: nowIso,
      })
      .eq('player_id', user.id);
    await admin
      .from('pantheon_entries')
      .update({
        rank: ranks.defender,
        wins: (defRow?.wins ?? 0) + (seriesWin ? 0 : 1),
        losses: (defRow?.losses ?? 0) + (seriesWin ? 1 : 0),
      })
      .eq('player_id', defenderId);

    return json({
      win: seriesWin,
      score: { attacker: winsCount, defender: PANTHEON_TEAMS - winsCount },
      new_rank: ranks.challenger,
      matches,
    });
  }

  return json({ error: 'Action inconnue' }, 400);
});
