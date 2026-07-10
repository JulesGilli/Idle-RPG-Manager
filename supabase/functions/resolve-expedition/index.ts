// Edge Function : resolve-expedition
// EXPÉDITIONS à durée fixe (nouveau système, tables expedition_types / expedition_runs).
// Actions : start / claim / cancel.
//  - start  : lance une expédition (durée = f(niveau min de l'équipe)), crée un run.
//  - claim  : une fois le temps écoulé → crédite or + XP (+ XP de compte) + loot unique.
//  - cancel : abandonne un run en cours (aucune récompense, libère les héros).
// Calcul serveur (anti-triche) ; le client ne fait que lire ses runs via RLS.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createRng } from '@shared/combat/prng.ts';
import {
  applyXpGain,
  SKILL_POINTS_PER_LEVEL,
  effectiveStats,
  heroPower,
} from '@shared/progression/formulas.ts';
import { accountXpFromHeroXp } from '@shared/progression/account.ts';
import { computeSetBonuses } from '@shared/progression/sets.ts';
import {
  computeExpeditionDuration,
  expeditionGold,
  expeditionXpPerHero,
  rollExpeditionLoot,
  type ExpeditionType,
} from '@shared/progression/expedition.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_TEAM = 4;

// deno-lint-ignore no-explicit-any
type Admin = any;
type Body = { action?: unknown; expedition_type_id?: unknown; hero_ids?: unknown; run_id?: unknown };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
function toExpeditionType(row: any): ExpeditionType {
  return {
    id: row.id,
    name: row.name,
    min_level_required: row.min_level_required,
    min_power_required: row.min_power_required ?? 0,
    duration_base_seconds: row.duration_base_seconds,
    loot_table: (row.loot_table ?? []) as ExpeditionType['loot_table'],
  };
}

// Puissance d'un héros (mêmes règles que le client) à partir de sa ligne DB.
// deno-lint-ignore no-explicit-any
function heroPowerFromRow(h: any): number {
  const cls = h.cls;
  const sum = (k: string) =>
    (h.weapon?.[k] ?? 0) + (h.armor?.[k] ?? 0) + (h.jewel?.[k] ?? 0) + (h.relic?.[k] ?? 0);
  const setB = computeSetBonuses([h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id]);
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
  return heroPower(stats);
}

/**
 * Héros indisponibles : farm en boucle (loop) OU expédition en cours.
 * Un déploiement « advance » (assauts manuels) ne réserve PAS les héros.
 */
async function engagedHeroes(admin: Admin, userId: string): Promise<Set<string>> {
  const engaged = new Set<string>();
  const { data: deps } = await admin
    .from('deployments')
    .select('hero_ids, mode')
    .eq('player_id', userId)
    .eq('mode', 'loop');
  for (const r of deps ?? []) for (const h of (r.hero_ids as string[]) ?? []) engaged.add(h);
  const { data: exps } = await admin
    .from('expedition_runs')
    .select('hero_ids')
    .eq('player_id', userId)
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'Configuration serveur manquante' }, 500);
  }

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
  const action = body.action;
  if (action !== 'start' && action !== 'claim' && action !== 'cancel') {
    return json({ error: 'Action inconnue' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ---------------------------------------------------------------- START
  if (action === 'start') {
    const typeId = body.expedition_type_id;
    const heroIds = body.hero_ids;
    if (typeof typeId !== 'string') return json({ error: 'expedition_type_id invalide' }, 400);
    if (!Array.isArray(heroIds) || heroIds.some((h) => typeof h !== 'string')) {
      return json({ error: 'hero_ids invalide' }, 400);
    }
    const unique = [...new Set(heroIds as string[])];
    if (unique.length < 1 || unique.length > MAX_TEAM) {
      return json({ error: `Assigne entre 1 et ${MAX_TEAM} héros` }, 400);
    }

    const { data: heroes } = await admin
      .from('heroes')
      .select(
        'id, level, alloc_hp, alloc_atk, alloc_def, alloc_speed, bonus_hp, bonus_atk, bonus_def, bonus_speed, ' +
          'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed), ' +
          'weapon:items!heroes_equipped_weapon_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), ' +
          'armor:items!heroes_equipped_armor_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), ' +
          'jewel:items!heroes_equipped_jewel_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), ' +
          'relic:items!heroes_equipped_relic_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id)',
      )
      .in('id', unique)
      .eq('owner_id', user.id);
    if (!heroes || heroes.length !== unique.length) {
      return json({ error: 'Héros introuvables ou non possédés' }, 403);
    }

    const { data: typeRow } = await admin
      .from('expedition_types')
      .select('*')
      .eq('id', typeId)
      .single();
    if (!typeRow) return json({ error: 'Expédition introuvable' }, 404);
    const type = toExpeditionType(typeRow);

    const teamMinLevel = Math.min(...heroes.map((h: { level: number }) => h.level));
    if (teamMinLevel < type.min_level_required) {
      return json({ error: `Niveau ${type.min_level_required} minimum requis` }, 400);
    }

    // Seuil de PUISSANCE d'équipe (somme des puissances des héros) — anti-triche.
    const teamPower = heroes.reduce((s: number, h: unknown) => s + heroPowerFromRow(h), 0);
    if (teamPower < type.min_power_required) {
      return json(
        { error: `Puissance d'équipe ${type.min_power_required} minimum requise (actuelle : ${teamPower})` },
        400,
      );
    }

    const engaged = await engagedHeroes(admin, user.id);
    if (unique.some((h) => engaged.has(h))) {
      return json({ error: 'Un héros est déjà engagé (déploiement ou expédition)' }, 409);
    }

    const durationSec = computeExpeditionDuration(type, teamMinLevel);
    const nowMs = Date.now();
    const endsAt = new Date(nowMs + durationSec * 1000).toISOString();
    const seed = Math.floor(Math.random() * 2_147_483_647);

    const { data: run, error } = await admin
      .from('expedition_runs')
      .insert({
        player_id: user.id,
        expedition_type_id: type.id,
        hero_ids: unique,
        seed,
        started_at: new Date(nowMs).toISOString(),
        ends_at: endsAt,
        status: 'in_progress',
      })
      .select()
      .single();
    if (error) return json({ error: "Impossible de démarrer l'expédition" }, 500);

    return json({ run });
  }

  // Charge le run visé (claim / cancel).
  const runId = body.run_id;
  if (typeof runId !== 'string') return json({ error: 'run_id invalide' }, 400);
  const { data: run } = await admin
    .from('expedition_runs')
    .select('*')
    .eq('id', runId)
    .eq('player_id', user.id)
    .single();
  if (!run) return json({ error: 'Expédition introuvable' }, 404);
  if (run.status !== 'in_progress') return json({ error: 'Expédition déjà terminée' }, 409);

  // ---------------------------------------------------------------- CANCEL
  if (action === 'cancel') {
    await admin.from('expedition_runs').delete().eq('id', runId).eq('player_id', user.id);
    return json({ cancelled: true });
  }

  // ---------------------------------------------------------------- CLAIM
  if (Date.now() < new Date(run.ends_at).getTime()) {
    return json({ error: "L'expédition n'est pas terminée" }, 409);
  }

  // RÉCLAMATION ATOMIQUE (anti multi-onglets) : on flippe status in_progress →
  // claimed en une requête conditionnelle AVANT tout crédit. Deux onglets qui
  // réclament le même run en parallèle : un seul UPDATE affecte 1 ligne (Postgres
  // sérialise la ligne), l'autre voit status déjà 'claimed' → 0 ligne → 409.
  const { data: claimedRun } = await admin
    .from('expedition_runs')
    .update({ status: 'claimed', claimed_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('player_id', user.id)
    .eq('status', 'in_progress')
    .select('id');
  if (!claimedRun || claimedRun.length === 0) {
    return json({ error: 'Expédition déjà réclamée' }, 409);
  }

  const { data: typeRow } = await admin
    .from('expedition_types')
    .select('*')
    .eq('id', run.expedition_type_id)
    .single();
  if (!typeRow) return json({ error: 'Expédition introuvable' }, 404);
  const type = toExpeditionType(typeRow);

  const gold = expeditionGold(type);
  const xpPerHero = expeditionXpPerHero(type);
  const rng = createRng((run.seed ^ 0x5deece66d) >>> 0);
  const loot = rollExpeditionLoot(type, rng);

  // Or → profil.
  const { data: profile } = await admin
    .from('profiles')
    .select('gold, account_xp')
    .eq('id', user.id)
    .single();

  // XP → chaque héros encore possédé (+ points de compétence).
  const levelUps: { hero_id: string; levels: number }[] = [];
  let ownedCount = 0;
  if (xpPerHero > 0) {
    const { data: heroes } = await admin
      .from('heroes')
      .select('id, level, xp, skill_points')
      .in('id', run.hero_ids as string[])
      .eq('owner_id', user.id);
    for (const h of heroes ?? []) {
      ownedCount += 1;
      const gain = applyXpGain(h.level, h.xp, xpPerHero);
      const update: Record<string, number> = { level: gain.level, xp: gain.xp };
      if (gain.levelsGained > 0) {
        update.skill_points = (h.skill_points ?? 0) + gain.levelsGained * SKILL_POINTS_PER_LEVEL;
        levelUps.push({ hero_id: h.id, levels: gain.levelsGained });
      }
      await admin.from('heroes').update(update).eq('id', h.id);
    }
  }

  // Or + XP de compte (10 % de l'XP totale des héros).
  await admin
    .from('profiles')
    .update({
      gold: (profile?.gold ?? 0) + gold,
      account_xp: (profile?.account_xp ?? 0) + accountXpFromHeroXp(xpPerHero * ownedCount),
    })
    .eq('id', user.id);

  // Loot unique → ressources.
  await addResources(admin, user.id, loot);

  // (Le run a déjà été clôturé atomiquement au début du CLAIM — plus de second
  // update de statut, qui serait redondant.)

  return json({
    rewards: {
      gold,
      xp_per_hero: xpPerHero,
      loot: Object.entries(loot).map(([resource, amount]) => ({ resource, amount })),
      level_ups: levelUps,
    },
  });
});
