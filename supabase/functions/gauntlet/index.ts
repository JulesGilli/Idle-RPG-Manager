// Edge Function : gauntlet
// LE GAUNTLET — mode de combat SANS FIN (vagues), escouade de 5 héros POSSÉDÉS.
// Tentatives illimitées ; on ne retient que la MEILLEURE vague atteinte. Cette
// meilleure vague fixe une PRODUCTION QUOTIDIENNE d'Éclat d'Éternité, l'unique
// ressource qui améliore les armes divines (renforcement à 100 %, cf. forge).
//
// Actions :
//  - state : progression + rente (per_day) + Éclat en attente d'encaissement.
//  - claim : encaisse l'Éclat produit depuis le dernier encaissement.
//  - run   : résout une course (vague 1 → défaite), met à jour le record, renvoie
//            de quoi rejouer les combats.
// Calcul serveur (anti-triche). /shared/progression/gauntlet.ts est pur/déterministe.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import type { CombatantInput } from '@shared/combat/index.ts';
import { buildHeroSnapshot, itemCombatPassive, type HeroSnapshotInput } from '@shared/progression/heroLoan.ts';
import { computeSetBonuses, equippedSetTier } from '@shared/progression/sets.ts';
import { checkTeamClasses, tooManySameClassError } from '@shared/progression/teamComposition.ts';
import {
  simulateGauntletRun,
  eternityPerDay,
  eternityClaim,
  ETERNITY_RESOURCE,
} from '@shared/progression/gauntlet.ts';
import { resourceTier } from '@shared/progression/arcMaterials.ts';
import {
  combatBuff,
  NO_COMBAT_BUFF,
  type GuildAlloc,
  type GuildCombatBuff,
} from '@shared/progression/guildSkills.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_TEAM = 5;

type Body = { action?: unknown; hero_ids?: unknown };

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

/** Buff de combat de l'arbre de guilde de l'appelant (neutre si sans guilde). */
async function guildBuff(admin: Admin, userId: string): Promise<GuildCombatBuff> {
  const { data: mem } = await admin
    .from('guild_members')
    .select('guild_id')
    .eq('player_id', userId)
    .maybeSingle();
  if (!mem?.guild_id) return NO_COMBAT_BUFF;
  const { data: g } = await admin.from('guilds').select('skill_alloc').eq('id', mem.guild_id).single();
  return combatBuff((g?.skill_alloc ?? {}) as GuildAlloc);
}

/** Arc courant du joueur (1 par défaut). Pilote le scaling des ennemis. */
async function currentArcOf(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin
    .from('player_arc')
    .select('current_arc')
    .eq('player_id', userId)
    .maybeSingle();
  return Math.max(1, (data?.current_arc as number | undefined) ?? 1);
}

/** Héros engagés dans une activité IDLE (farm 'loop' ou expédition verrouillante). */
async function engagedInActivity(admin: Admin): Promise<Set<string>> {
  const engaged = new Set<string>();
  const { data: deps } = await admin.from('deployments').select('hero_ids').eq('mode', 'loop');
  for (const r of deps ?? []) for (const h of (r.hero_ids as string[]) ?? []) engaged.add(h);
  const { data: exps } = await admin
    .from('expedition_runs')
    .select('hero_ids')
    .eq('status', 'in_progress')
    .eq('locks_heroes', true);
  for (const r of exps ?? []) for (const h of (r.hero_ids as string[]) ?? []) engaged.add(h);
  return engaged;
}

/** Crédit ATOMIQUE d'Éclat d'Éternité (RPC `add_player_resource`, `x = x + n`). */
async function addEternity(admin: Admin, userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  const { error } = await admin.rpc('add_player_resource', {
    p_player: userId,
    p_resource: ETERNITY_RESOURCE,
    p_amount: amount,
    p_tier: resourceTier(ETERNITY_RESOURCE, 1), // cross-arc → tier 1
  });
  if (error) throw error;
}

/** Ligne de progression, créée à la volée (sentinelle) si absente. */
async function ensureProgress(
  admin: Admin,
  userId: string,
): Promise<{ best_wave: number; eternity_last_claim_at: string }> {
  const nowIso = new Date().toISOString();
  await admin
    .from('gauntlet_progress')
    .upsert(
      { player_id: userId, best_wave: 0, eternity_last_claim_at: nowIso },
      { onConflict: 'player_id', ignoreDuplicates: true },
    );
  const { data } = await admin
    .from('gauntlet_progress')
    .select('best_wave, eternity_last_claim_at')
    .eq('player_id', userId)
    .single();
  return {
    best_wave: (data?.best_wave as number | undefined) ?? 0,
    eternity_last_claim_at: (data?.eternity_last_claim_at as string | undefined) ?? nowIso,
  };
}

/**
 * Encaisse l'Éclat produit depuis `eternity_last_claim_at`, au taux du `best_wave`
 * courant, et AVANCE l'ancre du temps EXACTEMENT consommé (le reliquat fractionnaire
 * est préservé — même logique anti-perte que le farm de carte). Idempotent : deux
 * appels concurrents créditent l'un puis 0 pour l'autre (temps déjà consommé).
 * Renvoie l'Éclat crédité.
 */
async function settleEternity(
  admin: Admin,
  userId: string,
  progress: { best_wave: number; eternity_last_claim_at: string },
): Promise<number> {
  const elapsed = (Date.now() - new Date(progress.eternity_last_claim_at).getTime()) / 1000;
  const { amount, consumedSeconds } = eternityClaim(progress.best_wave, elapsed);
  if (amount <= 0) return 0;
  const newAnchorMs = new Date(progress.eternity_last_claim_at).getTime() + consumedSeconds * 1000;
  const newAnchorIso = new Date(newAnchorMs).toISOString();
  // Avance l'ancre CONDITIONNÉE à sa valeur lue (compare-and-swap) : un seul
  // encaissement concurrent passe, l'autre matche 0 ligne → pas de double crédit.
  const { data: moved } = await admin
    .from('gauntlet_progress')
    .update({ eternity_last_claim_at: newAnchorIso })
    .eq('player_id', userId)
    .eq('eternity_last_claim_at', progress.eternity_last_claim_at)
    .select('player_id');
  if (!moved || moved.length === 0) return 0;
  await addEternity(admin, userId, amount);
  return amount;
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

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const action = body.action;

  // ----------------------------------------------------------------- STATE
  if (action === 'state') {
    const progress = await ensureProgress(admin, user.id);
    const perDay = eternityPerDay(progress.best_wave);
    const elapsed = (Date.now() - new Date(progress.eternity_last_claim_at).getTime()) / 1000;
    const pending = eternityClaim(progress.best_wave, elapsed).amount;
    return json({
      best_wave: progress.best_wave,
      per_day: perDay,
      pending,
      last_claim_at: progress.eternity_last_claim_at,
    });
  }

  // ----------------------------------------------------------------- CLAIM
  if (action === 'claim') {
    const progress = await ensureProgress(admin, user.id);
    const credited = await settleEternity(admin, user.id, progress);
    return json({ credited, best_wave: progress.best_wave, per_day: eternityPerDay(progress.best_wave) });
  }

  // ------------------------------------------------------------------- RUN
  if (action === 'run') {
    const heroIds = body.hero_ids;
    if (!Array.isArray(heroIds) || heroIds.some((h) => typeof h !== 'string')) {
      return json({ error: 'hero_ids invalide' }, 400);
    }
    const unique = [...new Set(heroIds as string[])];
    if (unique.length < 1 || unique.length > MAX_TEAM) {
      return json({ error: `Entre 1 et ${MAX_TEAM} héros` }, 400);
    }

    // Héros POSSÉDÉS uniquement (pas d'emprunt au Gauntlet).
    const { data: heroes } = await admin.from('heroes').select(HERO_SELECT).in('id', unique).eq('owner_id', user.id);
    if (!heroes || heroes.length !== unique.length) {
      return json({ error: 'Héros non possédé dans l’escouade' }, 403);
    }

    // Plafond de doublons de classe (même règle que la carte/les donjons).
    {
      const check = checkTeamClasses((heroes as { class_id: string }[]).map((h) => h.class_id));
      if (!check.ok) return json({ error: tooManySameClassError(check.limit) }, 400);
    }

    // Dispo : aucun héros engagé dans une activité idle.
    const engaged = await engagedInActivity(admin);
    if (unique.some((id) => engaged.has(id))) {
      return json({ error: 'Un héros de l’escouade est déjà engagé dans une autre activité' }, 409);
    }

    const arc = await currentArcOf(admin, user.id);
    const buff = await guildBuff(admin, user.id);

    // Escouade dans l'ordre demandé, buff de guilde intégré au snapshot.
    const byId = new Map<string, CombatantInput>();
    // deno-lint-ignore no-explicit-any
    for (const h of heroes as any[]) byId.set(h.id, buildHeroSnapshot(toSnapshotInput(h), buff));
    const allies = unique.map((id) => byId.get(id)).filter((c): c is CombatantInput => Boolean(c));

    // Progression + RÈGLEMENT de la rente au taux ACTUEL avant de changer de record
    // (sinon le temps écoulé serait crédité rétroactivement au nouveau taux).
    const progress = await ensureProgress(admin, user.id);
    const banked = await settleEternity(admin, user.id, progress);

    const seed = Math.floor(Math.random() * 2_147_483_647);
    const run = simulateGauntletRun(seed, allies, progress.best_wave, arc);

    // Avancement ATOMIQUE du record (anti multi-onglets) : CAS sur best_wave.
    const advanceWon =
      run.newBestWave > progress.best_wave
        ? Boolean(
            (
              await admin
                .from('gauntlet_progress')
                .update({ best_wave: run.newBestWave, updated_at: new Date().toISOString() })
                .eq('player_id', user.id)
                .eq('best_wave', progress.best_wave)
                .select('player_id')
            ).data?.length,
          )
        : false;

    // Persistance de la course (service_role, bypass RLS).
    const { data: inserted } = await admin
      .from('gauntlet_runs')
      .insert({
        player_id: user.id,
        hero_ids: unique,
        seed,
        reached_wave: run.reachedWave,
        result: { wave_results: run.waveResults },
      })
      .select('id')
      .single();

    const bestWave = advanceWon ? run.newBestWave : progress.best_wave;
    return json({
      run_id: inserted?.id ?? null,
      seed,
      reached_wave: run.reachedWave,
      cleared_new: advanceWon ? run.clearedNew : 0,
      best_wave: bestWave,
      per_day: eternityPerDay(bestWave),
      banked_eternity: banked, // Éclat encaissé au passage (règlement de la rente)
      wave_results: run.waveResults,
    });
  }

  return json({ error: 'Action inconnue' }, 400);
});
