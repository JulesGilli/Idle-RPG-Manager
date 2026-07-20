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
import { resolveCombat } from '@shared/combat/index.ts';
import type { CombatantInput } from '@shared/combat/index.ts';
import { buildHeroSnapshot, itemCombatPassive, type HeroSnapshotInput } from '@shared/progression/heroLoan.ts';
import { computeSetBonuses } from '@shared/progression/sets.ts';
import { combatBuff, NO_COMBAT_BUFF, type GuildAlloc, type GuildCombatBuff } from '@shared/progression/guildSkills.ts';
import { isWeekend } from '@shared/progression/events.ts';
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
  'weapon:items!heroes_equipped_weapon_id_fkey(name, atk_bonus, def_bonus, hp_bonus, set_id, blessing_level, passive_type, passive_value), ' +
  'armor:items!heroes_equipped_armor_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), ' +
  'jewel:items!heroes_equipped_jewel_id_fkey(atk_bonus, def_bonus, hp_bonus, passive_type, passive_value, set_id), ' +
  'relic:items!heroes_equipped_relic_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id, passive_type, passive_value), rune:runes!heroes_rune_id_fkey(set_id)';

/** Ligne héros (DB) → ingrédients de snapshot (mêmes règles que le build normal). */
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
    jewelPassive: itemCombatPassive(h.jewel),
    weaponPassive: itemCombatPassive(h.weapon),
    relicPassive: itemCombatPassive(h.relic),
    skills: (h.skills ?? {}) as Record<string, number>,
    loadout: { activeId: h.active_skill_id ?? null, ultimateId: h.ultimate_skill_id ?? null },
    weapon: h.weapon ? { name: h.weapon.name, blessingLevel: h.weapon.blessing_level ?? 0 } : null,
    runeSetId: h.rune?.set_id ?? null,
    setIds: [h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id],
  };
}

/** Crédite `n` unités d'une ressource à un `tier` donné (upsert additif). */
async function addResourceAt(
  admin: Admin,
  userId: string,
  resource: string,
  n: number,
  tier: number,
): Promise<void> {
  if (n <= 0) return;
  const { data: row } = await admin
    .from('player_resources')
    .select('amount')
    .eq('player_id', userId)
    .eq('resource', resource)
    .eq('tier', tier)
    .maybeSingle();
  await admin.from('player_resources').upsert(
    { player_id: userId, resource, amount: Number(row?.amount ?? 0) + n, tier },
    { onConflict: 'player_id,resource,tier' },
  );
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
 * Finalise un event dont la semaine est écoulée : fige le classement, crédite l'or
 * du top 10, attribue le titre au 1er, passe le statut à 'ended'. Idempotent via le
 * garde sur status='active' (une seule finalisation gagne la course).
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
  const eclatSacre = EVENT_MATERIALS.world_boss; // Éclat sacré → relique divine
  for (const row of board) {
    const rr = rankReward(row.rank);
    if (rr.gold > 0) await admin.rpc('add_player_gold', { p_player: row.player_id, p_amount: rr.gold });
    if (rr.tears > 0) await addTears(admin, row.player_id, rr.tears);
    // Matériau d'event (Forge Sacrée) : dégressif top 10, stocké au tier Arc 2.
    // Se gagne même en Arc 1 et s'accumule jusqu'à l'ouverture de l'Arc 2.
    const eclat = eventRankMaterialQty(row.rank);
    if (eclat > 0) {
      await addResourceAt(admin, row.player_id, eclatSacre.key, eclat, EVENT_MATERIAL_TIER);
    }
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
 * Garantit l'event ACTIF de la semaine courante : finalise d'abord tout event actif
 * d'une semaine passée, puis crée celui de la semaine si besoin. Renvoie l'event actif.
 */
async function ensureEvent(admin: Admin): Promise<Record<string, unknown> | null> {
  const wk = isoWeekKey(Date.now());
  const { data: active } = await admin.from('world_boss_events').select('*').eq('status', 'active').maybeSingle();

  if (active && active.week_key !== wk) {
    await finalizeEvent(admin, active as Record<string, unknown>);
  } else if (active) {
    return active as Record<string, unknown>;
  }

  // Crée l'event de la semaine courante (idempotent : conflit d'unicité → on relit).
  const { data: created, error } = await admin
    .from('world_boss_events')
    .insert({
      week_key: wk,
      boss_name: worldBossName(wk),
      boss_combatant: worldBossFightCombatant(wk),
      ends_at: weekEndsAt(Date.now()),
    })
    .select('*')
    .maybeSingle();
  if (created) return created as Record<string, unknown>;
  if (error) {
    const { data: fresh } = await admin
      .from('world_boss_events')
      .select('*')
      .eq('week_key', wk)
      .maybeSingle();
    return (fresh as Record<string, unknown> | null) ?? null;
  }
  return null;
}

/** Réponse `state` : event, jauge, paliers, mes dégâts/frappe/titre, classement. */
async function buildState(admin: Admin, userId: string, event: Record<string, unknown> | null) {
  const defs = await tierDefs(admin);
  if (!event) {
    return { active: false, hittable: false, weekday: !isWeekend(Date.now()), tiers: defs, server_now: new Date().toISOString() };
  }
  const eventId = event.id as string;
  const total = Number(event.total_damage);
  const unlocked = Math.max(Number(event.tiers_unlocked), tiersUnlocked(total, defs));
  const weekday = !isWeekend(Date.now());
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

  const { data: myClaims } = await admin
    .from('world_boss_tier_claims')
    .select('tier_idx')
    .eq('event_id', eventId)
    .eq('player_id', userId);
  const claimedIdx = new Set((myClaims ?? []).map((c: { tier_idx: number }) => c.tier_idx));
  const claimableTiers = defs.filter((t) => t.idx <= unlocked && !claimedIdx.has(t.idx) && myDamage > 0);
  const claimableGold = claimableTiers.reduce((s, t) => s + (t.reward.gold ?? 0), 0);
  const claimableTears = claimableTiers.reduce((s, t) => s + (t.reward.tears ?? 0), 0);

  const { data: myTitle } = await admin
    .from('player_event_titles')
    .select('title, stat_mult, expires_at')
    .eq('player_id', userId)
    .gt('expires_at', new Date().toISOString())
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
    claimed_tiers: [...claimedIdx],
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
  if (action === 'claim') {
    if (!event) return json({ error: 'Aucun boss actif' }, 409);
    const eventId = event.id as string;
    const defs = await tierDefs(admin);
    const total = Number(event.total_damage);
    const unlocked = tiersUnlocked(total, defs);

    // Contributeur = a frappé au moins une fois cet event.
    const { data: anyHit } = await admin
      .from('world_boss_hits')
      .select('hit_day')
      .eq('event_id', eventId)
      .eq('player_id', user.id)
      .limit(1)
      .maybeSingle();
    if (!anyHit) return json({ error: 'Frappe le boss au moins une fois pour réclamer les paliers.' }, 403);

    const { data: myClaims } = await admin
      .from('world_boss_tier_claims')
      .select('tier_idx')
      .eq('event_id', eventId)
      .eq('player_id', user.id);
    const claimedIdx = new Set((myClaims ?? []).map((c: { tier_idx: number }) => c.tier_idx));

    const toClaim = defs.filter((t) => t.idx <= unlocked && !claimedIdx.has(t.idx));
    if (toClaim.length === 0) return json({ gold: 0, claimed: [] });

    let gold = 0;
    let tears = 0;
    const claimedNow: number[] = [];
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
    if (gold > 0) await admin.rpc('add_player_gold', { p_player: user.id, p_amount: gold });
    if (tears > 0) await addTears(admin, user.id, tears);
    return json({ gold, tears, claimed: claimedNow });
  }

  return json({ error: 'Action inconnue' }, 400);
});
