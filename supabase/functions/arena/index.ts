// Edge Function : arena
// Arène PvP ASYNCHRONE. Actions :
//  - set_team    : dépose/actualise l'équipe de défense (snapshot figé) ; entrée
//                  au bas de l'échelle si nouveau.
//  - challenge   : défie un joueur mieux classé (à portée) ; combat simulé serveur ;
//                  victoire = échange des rangs.
//  - claim_weekly: réclame la récompense de la semaine (rang × participants), 1×/semaine.
// Tout est calculé côté serveur (anti-triche), combats via /shared/combat.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import type { CombatantInput } from '@shared/combat/index.ts';
import { resolveCombat } from '@shared/combat/resolveCombat.ts';
import { buildHeroSnapshot, type HeroSnapshotInput } from '@shared/progression/heroLoan.ts';
import { computeSetBonuses } from '@shared/progression/sets.ts';
import { heroPower } from '@shared/progression/formulas.ts';
import {
  canChallenge,
  arenaChallengeCooldownRemaining,
  arenaWeeklyReward,
  isoWeekKey,
  ARENA_MAX_TEAM,
} from '@shared/progression/arena.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = { action?: unknown; hero_ids?: unknown; defender_player_id?: unknown };

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
  'weapon:items!heroes_equipped_weapon_id_fkey(name, atk_bonus, def_bonus, hp_bonus, set_id, blessing_level), ' +
  'armor:items!heroes_equipped_armor_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), ' +
  'jewel:items!heroes_equipped_jewel_id_fkey(atk_bonus, def_bonus, hp_bonus, passive_type, passive_value, set_id), ' +
  'relic:items!heroes_equipped_relic_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id)';

// deno-lint-ignore no-explicit-any
function toSnapshotInput(h: any): HeroSnapshotInput {
  const cls = h.cls;
  const sum = (k: string) =>
    (h.weapon?.[k] ?? 0) + (h.armor?.[k] ?? 0) + (h.jewel?.[k] ?? 0) + (h.relic?.[k] ?? 0);
  const setB = computeSetBonuses([h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id], h.class_id);
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
    weapon: h.weapon ? { name: h.weapon.name, blessingLevel: h.weapon.blessing_level ?? 0 } : null,
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

async function addGold(admin: Admin, userId: string, gold: number): Promise<void> {
  if (!gold || gold <= 0) return;
  const { data } = await admin.from('profiles').select('gold').eq('id', userId).single();
  await admin.from('profiles').update({ gold: (data?.gold ?? 0) + gold }).eq('id', userId);
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

async function addResources(
  admin: Admin,
  userId: string,
  materials: { key: string; qty: number }[],
  tier = 1,
): Promise<void> {
  for (const { key, qty } of materials) {
    if (!key || qty <= 0) continue;
    const { data: row } = await admin
      .from('player_resources')
      .select('amount')
      .eq('player_id', userId)
      .eq('resource', key)
      .eq('tier', tier)
      .maybeSingle();
    await admin
      .from('player_resources')
      .upsert(
        { player_id: userId, resource: key, amount: (row?.amount ?? 0) + qty, tier },
        { onConflict: 'player_id,resource,tier' },
      );
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

  // --------------------------------------------------------------- SET TEAM
  if (action === 'set_team') {
    const heroIds = body.hero_ids;
    if (!Array.isArray(heroIds) || heroIds.some((h) => typeof h !== 'string')) {
      return json({ error: 'hero_ids invalide' }, 400);
    }
    const unique = [...new Set(heroIds as string[])];
    if (unique.length < 1 || unique.length > ARENA_MAX_TEAM) {
      return json({ error: `Entre 1 et ${ARENA_MAX_TEAM} héros` }, 400);
    }
    const team = await buildTeam(admin, user.id, unique);
    if (team.length !== unique.length) return json({ error: 'Héros non possédés' }, 403);

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
      .select('rank, team_hero_ids, last_challenge_at')
      .eq('player_id', user.id)
      .maybeSingle();
    if (!me) return json({ error: 'Dépose d’abord une équipe de défense' }, 400);

    const { data: def } = await admin
      .from('arena_entries')
      .select('rank, team_snapshot')
      .eq('player_id', defenderId)
      .maybeSingle();
    if (!def) return json({ error: 'Adversaire introuvable' }, 404);

    if (!canChallenge(me.rank, def.rank)) {
      return json({ error: 'Tu ne peux défier qu’un joueur juste au-dessus de toi' }, 400);
    }
    const cd = arenaChallengeCooldownRemaining(
      me.last_challenge_at ? new Date(me.last_challenge_at).getTime() : null,
      Date.now(),
    );
    if (cd > 0) {
      return json({ error: `Arène en repos — réessaie dans ${Math.ceil(cd / 60)} min` }, 429);
    }

    // RÉSERVATION ATOMIQUE (anti multi-onglets) : le check de cooldown ci-dessus
    // est sujet à une race — deux défis lancés en parallèle passeraient tous deux
    // et fausseraient le classement. On s'approprie donc le tour par un
    // compare-and-swap EXACT sur last_challenge_at (la valeur qu'on vient de lire,
    // ou NULL au premier défi) : un seul UPDATE passe, l'autre matche 0 ligne.
    const challengeNowIso = new Date().toISOString();
    let reserveQ = admin
      .from('arena_entries')
      .update({ last_challenge_at: challengeNowIso })
      .eq('player_id', user.id);
    reserveQ = me.last_challenge_at
      ? reserveQ.eq('last_challenge_at', me.last_challenge_at)
      : reserveQ.is('last_challenge_at', null);
    const { data: reserved } = await reserveQ.select('player_id');
    if (!reserved || reserved.length === 0) {
      return json({ error: 'Arène en repos — réessaie dans un instant' }, 429);
    }

    const attackers = await buildTeam(admin, user.id, (me.team_hero_ids as string[]) ?? []);
    if (attackers.length === 0) {
      return json({ error: 'Reconfigure ton équipe de défense' }, 400);
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

    // Compteurs.
    const { data: meRow } = await admin.from('arena_entries').select('wins, losses').eq('player_id', user.id).single();
    const { data: defRow } = await admin.from('arena_entries').select('wins, losses').eq('player_id', defenderId).single();

    await admin
      .from('arena_entries')
      .update({
        rank: win ? defOldRank : myOldRank,
        wins: (meRow?.wins ?? 0) + (win ? 1 : 0),
        losses: (meRow?.losses ?? 0) + (win ? 0 : 1),
        last_challenge_at: nowIso,
        active_week: week,
        updated_at: nowIso,
      })
      .eq('player_id', user.id);
    await admin
      .from('arena_entries')
      .update({
        rank: win ? myOldRank : defOldRank,
        wins: (defRow?.wins ?? 0) + (win ? 0 : 1),
        losses: (defRow?.losses ?? 0) + (win ? 1 : 0),
      })
      .eq('player_id', defenderId);

    return json({
      result: combat.result,
      win,
      new_rank: win ? defOldRank : myOldRank,
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
    const { data: me } = await admin
      .from('arena_entries')
      .select('rank, last_reward_week')
      .eq('player_id', user.id)
      .maybeSingle();
    if (!me) return json({ error: 'Rejoins l’arène d’abord' }, 400);

    const week = parisWeek();
    if (me.last_reward_week === week) {
      return json({ error: 'Récompense d’arène déjà réclamée cette semaine', already_claimed: true }, 409);
    }

    const { count } = await admin
      .from('arena_entries')
      .select('player_id', { count: 'exact', head: true })
      .eq('active_week', week);
    const participants = count ?? 1;
    const reward = arenaWeeklyReward(me.rank as number, participants);

    const tier = await currentArcOf(admin, user.id);
    await addGold(admin, user.id, reward.gold);
    await addResources(admin, user.id, reward.materials, tier);
    await admin.from('arena_entries').update({ last_reward_week: week }).eq('player_id', user.id);

    return json({ ok: true, reward, rank: me.rank, participants });
  }

  return json({ error: 'Action inconnue' }, 400);
});
