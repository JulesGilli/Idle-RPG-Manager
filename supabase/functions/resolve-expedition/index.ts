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
  catchUpCapLevel,
  applyCatchUpXpGain,
} from '@shared/progression/formulas.ts';
import { accountXpFromHeroXp } from '@shared/progression/account.ts';
import { computeSetBonuses } from '@shared/progression/sets.ts';
import {
  computeExpeditionDuration,
  expeditionGold,
  expeditionLevelInfo,
  expeditionMasteryBonus,
  expeditionTotalBonus,
  expeditionSkillPoints,
  expeditionFreesHeroes,
  expeditionFullLoot,
  validateExpeditionAlloc,
  type ExpeditionAlloc,
  expeditionMasteryXpGain,
  expeditionRequiredPower,
  expeditionXpPerHero,
  rollExpeditionLoot,
  expeditionPityDue,
  lootHasRare,
  type ExpeditionType,
} from '@shared/progression/expedition.ts';
import { arcMaterialKey } from '@shared/progression/arcMaterials.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_TEAM = 4;

// deno-lint-ignore no-explicit-any
type Admin = any;
type Body = {
  action?: unknown;
  expedition_type_id?: unknown;
  hero_ids?: unknown;
  run_id?: unknown;
  alloc?: unknown;
};

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
  const setB = computeSetBonuses([h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id], h.class_id);
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
 * Héros déjà partis dans une expédition en cours — VERROUILLANTE OU NON.
 *
 * « Intendance autonome » libère un héros pour le RESTE du jeu (farm, donjon,
 * tour, arène), pas pour les expéditions elles-mêmes : un même héros ne peut pas
 * partir dans deux voyages à la fois. Sans cette distinction, il suffisait de
 * relancer en boucle avec la même escouade pour empiler autant d'expéditions
 * qu'on voulait — ce que les joueurs ont trouvé immédiatement.
 */
async function heroesOnAnyExpedition(admin: Admin, userId: string): Promise<Set<string>> {
  const busy = new Set<string>();
  const { data } = await admin
    .from('expedition_runs')
    .select('hero_ids')
    .eq('player_id', userId)
    .eq('status', 'in_progress');
  for (const r of data ?? []) for (const h of (r.hero_ids as string[]) ?? []) busy.add(h);
  return busy;
}

/**
 * Héros indisponibles pour le RESTE du jeu : farm en boucle (loop) ou expédition
 * VERROUILLANTE. Un déploiement « advance » (assauts manuels) ne réserve pas.
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
    .eq('status', 'in_progress')
    .eq('locks_heroes', true);
  for (const r of exps ?? []) for (const h of (r.hero_ids as string[]) ?? []) engaged.add(h);
  return engaged;
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
async function addResources(
  admin: Admin,
  userId: string,
  resources: Record<string, number>,
  tier = 1,
): Promise<void> {
  for (const [resource, add] of Object.entries(resources)) {
    if (add <= 0) continue;
    const { data: row } = await admin
      .from('player_resources')
      .select('amount')
      .eq('player_id', userId)
      .eq('resource', resource)
      .eq('tier', tier)
      .maybeSingle();
    await admin
      .from('player_resources')
      .upsert(
        { player_id: userId, resource, amount: (row?.amount ?? 0) + add, tier },
        { onConflict: 'player_id,resource,tier' },
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
  if (action !== 'start' && action !== 'claim' && action !== 'cancel' && action !== 'set_skills') {
    return json({ error: 'Action inconnue' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ----------------------------------------------------------- SET SKILLS
  // Enregistre l'allocation COMPLÈTE de l'arbre d'expédition.
  //
  // État absolu et non delta, contrairement à l'arbre des héros : ici les points
  // se REPRENNENT librement (aucun coût de reset), donc « poser » et « retirer »
  // sont la même opération. Le budget est recalculé serveur depuis l'XP réelle —
  // le client ne décide ni de son niveau ni de ses points.
  if (action === 'set_skills') {
    const raw = body.alloc;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return json({ error: 'alloc invalide' }, 400);
    }
    const alloc: ExpeditionAlloc = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v !== 'number') return json({ error: 'alloc invalide' }, 400);
      // Un rang à 0 est une absence, pas une donnée : on ne le stocke pas.
      if (v !== 0) alloc[k] = v;
    }

    const { data: prof } = await admin
      .from('profiles')
      .select('expedition_xp')
      .eq('id', user.id)
      .single();
    const level = expeditionLevelInfo((prof?.expedition_xp as number | undefined) ?? 0).level;

    const check = validateExpeditionAlloc(alloc, level);
    if (!check.ok) return json({ error: check.reason ?? 'Allocation invalide' }, 400);

    const { error: upErr } = await admin
      .from('profiles')
      .update({ expedition_skills: alloc })
      .eq('id', user.id);
    if (upErr) return json({ error: upErr.message }, 500);

    return json({ ok: true, alloc, points: expeditionSkillPoints(level), level });
  }

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
        'id, class_id, level, alloc_hp, alloc_atk, alloc_def, alloc_speed, bonus_hp, bonus_atk, bonus_def, bonus_speed, ' +
          'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed), ' +
          'weapon:items!heroes_equipped_weapon_id_fkey(name, atk_bonus, def_bonus, hp_bonus, set_id, blessing_level), ' +
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
    // Scalé par l'arc courant (New Game+) : un arc plus dur exige une escouade plus forte.
    const arc = await currentArcOf(admin, user.id);
    const requiredPower = expeditionRequiredPower(type, arc);
    const teamPower = heroes.reduce((s: number, h: unknown) => s + heroPowerFromRow(h), 0);
    if (teamPower < requiredPower) {
      return json(
        { error: `Puissance d'équipe ${requiredPower} minimum requise (actuelle : ${teamPower})` },
        400,
      );
    }

    // Arbre du joueur : il décide À LA FOIS de la durée et du fait que les héros
    // soient immobilisés. Lu AVANT le contrôle de disponibilité, qui en dépend.
    const { data: prof } = await admin
      .from('profiles')
      // `expedition_skills` : sans lui, l'arbre serait ignoré au calcul de durée.
      .select('expedition_xp, expedition_skills')
      .eq('id', user.id)
      .single();
    const masteryLevel = expeditionLevelInfo((prof?.expedition_xp as number | undefined) ?? 0).level;
    const alloc = (prof?.expedition_skills ?? {}) as ExpeditionAlloc;

    const freesHeroes = expeditionFreesHeroes(alloc);

    // TOUJOURS : un héros ne part pas dans deux expéditions à la fois, même
    // libéré par « Intendance autonome ». Cette règle ne dépend d'aucun palier —
    // sans elle, relancer en boucle avec la même escouade empile les voyages.
    const alreadyAway = await heroesOnAnyExpedition(admin, user.id);
    if (unique.some((h) => alreadyAway.has(h))) {
      return json({ error: 'Un héros est déjà parti en expédition' }, 409);
    }

    // « Intendance autonome » : tant qu'elle n'est pas prise, une expédition
    // MOBILISE son escouade — il faut donc des héros libres du RESTE du jeu.
    if (!freesHeroes) {
      const engaged = await engagedHeroes(admin, user.id);
      if (unique.some((h) => engaged.has(h))) {
        return json({ error: 'Un héros est déjà engagé (déploiement ou expédition)' }, 409);
      }
    }

    const durationSec = computeExpeditionDuration(type, teamPower, masteryLevel, alloc, arc);
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
        // Figé À LA CRÉATION : débloquer « Intendance autonome » plus tard ne
        // doit pas libérer rétroactivement une escouade déjà partie.
        locks_heroes: !freesHeroes,
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

  // Or + XP de maîtrise d'expédition → profil.
  const { data: profile } = await admin
    .from('profiles')
    // `expedition_skills` : l'arbre amplifie la chance ET la quantité du butin.
    .select('gold, account_xp, expedition_xp, expedition_skills')
    .eq('id', user.id)
    .single();

  // Le niveau de maîtrise AVANT gain pilote les bonus de loot de cette réclamation.
  const masteryBefore = expeditionLevelInfo((profile?.expedition_xp as number | undefined) ?? 0).level;
  const rng = createRng((run.seed ^ 0x5deece66d) >>> 0);

  // PITIÉ : compteur d'expéditions consécutives sans ressource rare, par type.
  // Lu AVANT le tirage — c'est lui qui décide si celui-ci est garanti.
  const { data: pityRow } = await admin
    .from('expedition_pity')
    .select('misses')
    .eq('player_id', user.id)
    .eq('expedition_type_id', type.id)
    .maybeSingle();
  const misses = (pityRow?.misses as number | undefined) ?? 0;
  const guaranteeRare = expeditionPityDue(misses);

  const claimAlloc = (profile?.expedition_skills ?? {}) as ExpeditionAlloc;
  const loot = rollExpeditionLoot(type, rng, expeditionTotalBonus(masteryBefore, claimAlloc), {
    guaranteeRare,
    // Palier « Inventaire complet » : au moins un exemplaire de chaque matériau.
    guaranteeAll: expeditionFullLoot(claimAlloc),
  });

  // Remis à zéro dès qu'une rare tombe (garantie ou non), incrémenté sinon.
  await admin.from('expedition_pity').upsert(
    {
      player_id: user.id,
      expedition_type_id: type.id,
      misses: lootHasRare(type, loot) ? 0 : misses + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'player_id,expedition_type_id' },
  );

  // XP → chaque héros encore possédé (+ points de compétence).
  const levelUps: { hero_id: string; levels: number }[] = [];
  let ownedCount = 0;
  if (xpPerHero > 0) {
    // Plafond de rattrapage : niveau du 5e héros le plus haut du ROSTER complet
    // (pas seulement des partants). Une seule requête, hors de la boucle.
    const { data: roster } = await admin.from('heroes').select('level').eq('owner_id', user.id);
    const capLevel = catchUpCapLevel(
      ((roster ?? []) as { level: number | null }[]).map((h) => h.level ?? 0),
    );
    const { data: heroes } = await admin
      .from('heroes')
      .select('id, level, xp, skill_points')
      .in('id', run.hero_ids as string[])
      .eq('owner_id', user.id);
    for (const h of heroes ?? []) {
      ownedCount += 1;
      // Réévalué à chaque niveau : le bonus cesse pile au plafond (cf. carte).
      const gain = applyCatchUpXpGain(h.level, h.xp, xpPerHero, capLevel);
      const update: Record<string, number> = { level: gain.level, xp: gain.xp };
      if (gain.levelsGained > 0) {
        update.skill_points = (h.skill_points ?? 0) + gain.levelsGained * SKILL_POINTS_PER_LEVEL;
        levelUps.push({ hero_id: h.id, levels: gain.levelsGained });
      }
      await admin.from('heroes').update(update).eq('id', h.id);
    }
  }

  // Or + XP de compte (10 % de l'XP totale des héros) + XP de maîtrise d'expédition.
  const masteryXpGain = expeditionMasteryXpGain(type);
  await admin
    .from('profiles')
    .update({
      gold: (profile?.gold ?? 0) + gold,
      account_xp: (profile?.account_xp ?? 0) + accountXpFromHeroXp(xpPerHero * ownedCount),
      expedition_xp: ((profile?.expedition_xp as number | undefined) ?? 0) + masteryXpGain,
    })
    .eq('id', user.id);

  // Loot unique → ressources, estampillées au tier de l'arc courant (New Game+).
  //
  // Les tables de butin (`expedition_types.loot_table`) portent les clés d'ARC 1 :
  // on les traduit vers le jumeau de l'arc courant, exactement comme le farm de
  // carte. Une expédition rejouée en arc 2 rapporte donc de la Sève corrompue et
  // non de la Sève primordiale — et ce sont ces jumeaux que réclament les
  // recettes de pièces de set d'arc 2.
  const arc = await currentArcOf(admin, user.id);
  const arcLoot: Record<string, number> = {};
  for (const [key, qty] of Object.entries(loot)) {
    const k = arcMaterialKey(key, arc);
    arcLoot[k] = (arcLoot[k] ?? 0) + qty;
  }
  await addResources(admin, user.id, arcLoot, arc);

  // (Le run a déjà été clôturé atomiquement au début du CLAIM — plus de second
  // update de statut, qui serait redondant.)

  return json({
    rewards: {
      gold,
      xp_per_hero: xpPerHero,
      loot: Object.entries(loot).map(([resource, amount]) => ({ resource, amount })),
      level_ups: levelUps,
      expedition_xp: masteryXpGain,
    },
  });
});
