// Edge Function : recruit
// Taverne (au Village) : pool QUOTIDIEN de 8 recrues (renouvelé à 22 h,
// heure de Paris), choix par slot, et renvoi de héros (gestion d'effectif,
// max 5). Pool déterministe (joueur, jour) + rolls CÔTÉ SERVEUR (anti-triche).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  MAX_ROSTER,
  TAVERN_SIZE,
  recruitCost,
  recruitGrade,
  rollTavernPool,
  forcedTavernClasses,
  recruitQualityBonus,
  maxRosterFor,
  countDungeonClears,
  type DungeonClearRow,
  hashSeed,
  tavernDayKey,
  tavernResetsAt,
  tavernRerollCost,
  parisDateKey,
  TAVERN_REROLL_CURRENCY,
  type ClassBase,
} from '@shared/progression/recruit.ts';
import { heroPower } from '@shared/progression/formulas.ts';
import { resourceTier } from '@shared/progression/arcMaterials.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = {
  action?: unknown;
  slot?: unknown;
  hero_id?: unknown;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
type Admin = any;

// deno-lint-ignore no-explicit-any
type ClassRow = ClassBase & { name: string };

/**
 * Clé de période de la taverne — renouvellement à 22 h (Paris). Vient du module
 * PARTAGÉ : `admin-actions` s'en sert aussi, et les deux doivent produire la même
 * clé, sinon l'outillage admin calcule un pool différent de celui du joueur.
 */
function parisDay(): string {
  return tavernDayKey(Date.now());
}

async function rosterSizeOf(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin.from('heroes').select('id').eq('owner_id', userId);
  return (data ?? []).length;
}

/**
 * Nombre de donjons DISTINCTS terminés (1re fois) par le joueur — chaque donjon
 * réussi débloque un slot d'effectif (V2). Dérivé de dungeon_runs (success=true),
 * dédupliqué par COUPLE (arc, donjon) : aucune table dédiée nécessaire.
 */
async function dungeonsClearedOf(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin
    .from('dungeon_runs')
    .select('dungeon_type_id, arc')
    .eq('player_id', userId)
    .eq('success', true);
  // Décompte PAR ARC : cf. countDungeonClears (logique partagée et testée).
  return countDungeonClears((data ?? []) as DungeonClearRow[]);
}

/** Classes distinctes déjà possédées par le joueur (pour la garantie « une de chaque »). */
async function ownedClassIdsOf(admin: Admin, userId: string): Promise<string[]> {
  const { data } = await admin.from('heroes').select('class_id').eq('owner_id', userId);
  return [...new Set((data ?? []).map((h: { class_id: string }) => h.class_id))];
}

/** Zones terminées = nombre de boss (dernier niveau de zone) vaincus. */
async function zonesCompletedOf(admin: Admin, userId: string): Promise<number> {
  const { data: bosses } = await admin.from('levels').select('id').eq('is_boss', true);
  const bossIds = new Set((bosses ?? []).map((l: { id: string }) => l.id));
  const { data: prog } = await admin
    .from('level_progress')
    .select('level_id')
    .eq('player_id', userId);
  return (prog ?? []).filter((p: { level_id: string }) => bossIds.has(p.level_id)).length;
}

async function fetchClasses(admin: Admin): Promise<ClassRow[]> {
  const { data } = await admin
    .from('hero_classes')
    .select('id, name, base_hp, base_atk, base_def, base_speed')
    .order('id');
  return (data ?? []) as ClassRow[];
}

async function claimedSlots(admin: Admin, userId: string, day: string): Promise<number[]> {
  const { data } = await admin
    .from('tavern_state')
    .select('day, claimed')
    .eq('player_id', userId)
    .maybeSingle();
  return data && data.day === day ? (data.claimed as number[]) : [];
}

/** État de taverne du joueur pour la période COURANTE (ligne périmée = état neuf). */
async function tavernStateOf(
  admin: Admin,
  userId: string,
  day: string,
): Promise<{ claimed: number[]; reroll: number; paidRerolls: number }> {
  const { data } = await admin
    .from('tavern_state')
    .select('day, claimed, reroll, paid_rerolls, paid_rerolls_day')
    .eq('player_id', userId)
    .maybeSingle();
  // Trois horloges distinctes, volontairement :
  //  · `reroll` est un nonce de seed CUMULATIF — jamais réinitialisé, sinon le
  //    pool de demain reprendrait un seed déjà vu ;
  //  · `claimed` suit la PÉRIODE du pool (22 h → 22 h) ;
  //  · `paid_rerolls` suit la JOURNÉE CIVILE (minuit → minuit), car le prix doit
  //    retomber à 1 à minuit et non au renouvellement des recrues.
  const fresh = !data || data.day !== day;
  const today = parisDateKey(Date.now());
  const sameDay = Boolean(data) && data.paid_rerolls_day === today;
  return {
    claimed: fresh ? [] : ((data.claimed as number[]) ?? []),
    reroll: (data?.reroll as number | undefined) ?? 0,
    paidRerolls: sameDay ? ((data.paid_rerolls as number | undefined) ?? 0) : 0,
  };
}

/**
 * Construit la réponse « pool » complète. Partagée par les actions `pool` et
 * `reroll` : les deux DOIVENT renvoyer exactement la même forme, sinon le front
 * doit gérer deux schémas pour le même écran.
 */
async function buildPool(admin: Admin, userId: string): Promise<Record<string, unknown>> {
  const day = parisDay();
  const classes = await fetchClasses(admin);
  if (classes.length === 0) throw new Error('Aucune classe');
  const rosterSize = await rosterSizeOf(admin, userId);
  const state = await tavernStateOf(admin, userId, day);

  const clsMap = new Map(classes.map((c) => [c.id, c]));
  const ownedClassIds = await ownedClassIdsOf(admin, userId);
  const forced = forcedTavernClasses(rosterSize, ownedClassIds, classes.map((c) => c.id));
  const zonesCompleted = await zonesCompletedOf(admin, userId);
  const qualityBonus = recruitQualityBonus(zonesCompleted);
  const pool = rollTavernPool(await tavernSeed(admin, userId, day), classes, forced, qualityBonus);
  const candidates = pool.map((c) => {
    const cls = clsMap.get(c.class_id)!;
    return {
      slot: c.slot,
      class_id: c.class_id,
      class_name: cls.name,
      name: c.name,
      grade: recruitGrade(c.bonuses, cls),
      bonuses: c.bonuses,
      stats: {
        hp: Math.max(1, cls.base_hp + c.bonuses.bonus_hp),
        atk: Math.max(1, cls.base_atk + c.bonuses.bonus_atk),
        def: Math.max(0, cls.base_def + c.bonuses.bonus_def),
        speed: Math.max(1, cls.base_speed + c.bonuses.bonus_speed),
      },
      claimed: state.claimed.includes(c.slot),
    };
  });

  // `tavern_state` n'a aucune policy RLS : le front ne peut rien y lire. Le coût
  // du reroll et le solde de plumes doivent donc voyager DANS cette réponse.
  const tier = await currentArcOf(admin, userId);
  return {
    day,
    // Échéance du prochain renouvellement + heure SERVEUR : le compte à rebours
    // ne doit pas dépendre de l'horloge ni du fuseau du navigateur.
    resets_at: tavernResetsAt(Date.now()),
    server_now: new Date().toISOString(),
    candidates,
    cost: recruitCost(rosterSize),
    roster_size: rosterSize,
    max_roster: maxRosterFor(await dungeonsClearedOf(admin, userId)),
    zones_completed: zonesCompleted,
    quality_bonus: qualityBonus,
    reroll_cost: tavernRerollCost(state.paidRerolls),
    reroll_currency: TAVERN_REROLL_CURRENCY,
    rerolls_today: state.paidRerolls,
    feathers: await resourceAmount(admin, userId, TAVERN_REROLL_CURRENCY, tier),
  };
}

/** Arc courant du joueur (1 par défaut) — détermine le `tier` des ressources. */
async function currentArcOf(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin
    .from('player_arc')
    .select('current_arc')
    .eq('player_id', userId)
    .maybeSingle();
  return Math.max(1, (data?.current_arc as number | undefined) ?? 1);
}

/** Solde d'une ressource au tier courant. */
async function resourceAmount(
  admin: Admin,
  userId: string,
  resource: string,
  tier: number,
): Promise<number> {
  const { data } = await admin
    .from('player_resources')
    .select('amount')
    .eq('player_id', userId)
    .eq('resource', resource)
    .eq('tier', resourceTier(resource, tier))
    .maybeSingle();
  return (data?.amount as number | undefined) ?? 0;
}

/**
 * Débite une ressource en COMPARE-AND-SWAP : l'update ne passe que si le solde
 * vaut encore ce qu'on a lu. Deux onglets qui rerollent en même temps ne peuvent
 * donc pas payer une seule fois — le second voit son update ne toucher aucune
 * ligne et repart en erreur. Retourne false si la course est perdue.
 */
async function spendResourceCas(
  admin: Admin,
  userId: string,
  resource: string,
  tier: number,
  expected: number,
  cost: number,
): Promise<boolean> {
  const { data } = await admin
    .from('player_resources')
    .update({ amount: expected - cost })
    .eq('player_id', userId)
    .eq('resource', resource)
    .eq('tier', resourceTier(resource, tier))
    .eq('amount', expected)
    .select('amount');
  return Array.isArray(data) && data.length > 0;
}

/**
 * Seed du pool de taverne : (joueur, jour) + epoch GLOBAL (reroll de tous) +
 * nonce PAR JOUEUR (reroll ciblé / recrue forcée). Bumper l'un ou l'autre change
 * le pool sans casser le déterminisme. Doit rester IDENTIQUE à admin-actions.
 */
async function tavernSeed(admin: Admin, userId: string, day: string): Promise<number> {
  const { data: cfg } = await admin
    .from('app_config')
    .select('value')
    .eq('key', 'tavern_epoch')
    .maybeSingle();
  const epoch = cfg ? parseInt(cfg.value, 10) || 0 : 0;
  const { data: ts } = await admin
    .from('tavern_state')
    .select('reroll')
    .eq('player_id', userId)
    .maybeSingle();
  const reroll = (ts?.reroll as number | undefined) ?? 0;
  return hashSeed(userId, day, epoch, reroll);
}

/**
 * Retire un héros de TOUTES les compositions stockées en `uuid[]` (déploiements de
 * farm/carte, inscription au raid de guilde, contributions de lobby, compositions
 * sauvegardées). Un tableau n'a pas de FK cascade : sans ce nettoyage, l'ID reste
 * « fantôme » et occupe un slot (arène/raid/farm bloqués). L'arène a son propre
 * traitement (snapshot + puissance à recalculer) et n'est PAS incluse ici.
 * Supprime la ligne quand elle devient vide (déploiements/inscription).
 */
async function removeHeroFromArrayTables(admin: Admin, userId: string, heroId: string) {
  // Déploiements (farm/carte) : ligne par groupe, supprimée si vide.
  const { data: deployments } = await admin
    .from('deployments')
    .select('id, hero_ids')
    .eq('player_id', userId);
  for (const dep of deployments ?? []) {
    const ids = (dep.hero_ids as string[]) ?? [];
    if (!ids.includes(heroId)) continue;
    const remaining = ids.filter((h) => h !== heroId);
    if (remaining.length === 0) {
      await admin.from('deployments').delete().eq('id', dep.id);
    } else {
      await admin.from('deployments').update({ hero_ids: remaining }).eq('id', dep.id);
    }
  }

  // Inscription persistante au raid de guilde (max 2 héros) : ligne supprimée si vide.
  const { data: enroll } = await admin
    .from('guild_raid_enrollments')
    .select('hero_ids')
    .eq('player_id', userId)
    .maybeSingle();
  if (enroll && ((enroll.hero_ids as string[]) ?? []).includes(heroId)) {
    const remaining = ((enroll.hero_ids as string[]) ?? []).filter((h) => h !== heroId);
    if (remaining.length === 0) {
      await admin.from('guild_raid_enrollments').delete().eq('player_id', userId);
    } else {
      await admin
        .from('guild_raid_enrollments')
        .update({ hero_ids: remaining, updated_at: new Date().toISOString() })
        .eq('player_id', userId);
    }
  }

  // Contributions à un lobby de raid ouvert (héros engagés dans un raid en cours).
  const { data: contribs } = await admin
    .from('guild_raid_contributions')
    .select('lobby_id, hero_ids')
    .eq('player_id', userId);
  for (const c of contribs ?? []) {
    const ids = (c.hero_ids as string[]) ?? [];
    if (!ids.includes(heroId)) continue;
    const remaining = ids.filter((h) => h !== heroId);
    if (remaining.length === 0) {
      await admin
        .from('guild_raid_contributions')
        .delete()
        .eq('lobby_id', c.lobby_id)
        .eq('player_id', userId);
    } else {
      await admin
        .from('guild_raid_contributions')
        .update({ hero_ids: remaining })
        .eq('lobby_id', c.lobby_id)
        .eq('player_id', userId);
    }
  }

  // Compositions sauvegardées (team_presets) : on retire juste l'ID (ligne gardée).
  const { data: presets } = await admin
    .from('team_presets')
    .select('id, hero_ids')
    .eq('owner_id', userId);
  for (const p of presets ?? []) {
    const ids = (p.hero_ids as string[]) ?? [];
    if (!ids.includes(heroId)) continue;
    await admin
      .from('team_presets')
      .update({ hero_ids: ids.filter((h) => h !== heroId) })
      .eq('id', p.id);
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

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ----------------------------------------------------------------- POOL
  // Renvoie les 8 recrues du jour, avec grade/stats et l'état "engagé".
  if (body.action === 'pool') {
    return json(await buildPool(admin, user.id));
  }

  // --------------------------------------------------------------- REROLL
  // Reroll MANUEL du pool, payé en plumes d'appel (1, puis 2, puis 3… dans la
  // même période). Bumper le nonce `reroll` suffit à changer le seed ; `claimed`
  // est purgé parce que les slots du nouveau pool n'ont plus rien à voir avec
  // ceux de l'ancien — sans ça, un slot déjà recruté resterait bloqué sur une
  // recrue entièrement différente. Ça n'offre aucune recrue gratuite : recruter
  // coûte de l'or à part, au tarif de l'effectif courant.
  if (body.action === 'reroll') {
    const day = parisDay();
    const state = await tavernStateOf(admin, user.id, day);
    const cost = tavernRerollCost(state.paidRerolls);
    const tier = await currentArcOf(admin, user.id);
    const have = await resourceAmount(admin, user.id, TAVERN_REROLL_CURRENCY, tier);

    if (have < cost) {
      return json(
        {
          error: `Il te faut ${cost} plume${cost > 1 ? 's' : ''} d'appel (tu en as ${have}). Termine un donjon pour en gagner une.`,
          needed: cost,
          have,
        },
        400,
      );
    }

    if (!(await spendResourceCas(admin, user.id, TAVERN_REROLL_CURRENCY, tier, have, cost))) {
      return json({ error: 'Reroll déjà en cours dans un autre onglet — recharge la page.' }, 409);
    }

    const { error: stateErr } = await admin.from('tavern_state').upsert(
      {
        player_id: user.id,
        day,
        claimed: [],
        reroll: state.reroll + 1,
        paid_rerolls: state.paidRerolls + 1,
        // Estampille la journée civile : c'est elle qui fera repartir le compteur
        // à minuit, indépendamment de la période du pool.
        paid_rerolls_day: parisDateKey(Date.now()),
      },
      { onConflict: 'player_id' },
    );
    if (stateErr) {
      // Les plumes sont déjà parties : on les rend plutôt que de les perdre pour
      // un pool qui n'a pas tourné. Le joueur ne doit jamais payer dans le vide.
      await admin
        .from('player_resources')
        .update({ amount: have })
        .eq('player_id', user.id)
        .eq('resource', TAVERN_REROLL_CURRENCY)
        .eq('tier', resourceTier(TAVERN_REROLL_CURRENCY, tier));
      return json({ error: 'Reroll impossible pour le moment — plumes non débitées.' }, 500);
    }

    return json(await buildPool(admin, user.id));
  }

  // -------------------------------------------------------------- RECRUIT
  // Engage la recrue du slot choisi dans le pool du jour.
  if (body.action === 'recruit') {
    const slot = body.slot;
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= TAVERN_SIZE) {
      return json({ error: 'slot invalide' }, 400);
    }

    const day = parisDay();
    const rosterSize = await rosterSizeOf(admin, user.id);
    const maxRoster = maxRosterFor(await dungeonsClearedOf(admin, user.id));
    if (rosterSize >= maxRoster) {
      return json(
        {
          error:
            maxRoster < MAX_ROSTER
              ? `Effectif complet (${maxRoster}) — termine un donjon pour débloquer un slot`
              : `Effectif complet (${maxRoster} max) — renvoie un héros`,
        },
        400,
      );
    }

    const claimed = await claimedSlots(admin, user.id, day);
    if (claimed.includes(slot)) return json({ error: 'Recrue déjà engagée aujourd’hui' }, 400);

    const cost = recruitCost(rosterSize);
    const { data: profile } = await admin
      .from('profiles')
      .select('gold')
      .eq('id', user.id)
      .single();
    const gold = profile?.gold ?? 0;
    if (gold < cost) return json({ error: `Or insuffisant (${cost} requis)` }, 400);

    const classes = await fetchClasses(admin);
    if (classes.length === 0) return json({ error: 'Aucune classe' }, 500);
    const ownedClassIds = await ownedClassIdsOf(admin, user.id);
    const forced = forcedTavernClasses(rosterSize, ownedClassIds, classes.map((c) => c.id));
    const qualityBonus = recruitQualityBonus(await zonesCompletedOf(admin, user.id));
    const cand = rollTavernPool(await tavernSeed(admin, user.id, day), classes, forced, qualityBonus)[slot];
    if (!cand) return json({ error: 'Recrue introuvable' }, 400);

    await admin
      .from('profiles')
      .update({ gold: gold - cost })
      .eq('id', user.id);

    const { data: hero } = await admin
      .from('heroes')
      .insert({
        owner_id: user.id,
        class_id: cand.class_id,
        name: cand.name,
        ...cand.bonuses,
      })
      .select('id, name, class_id, bonus_hp, bonus_atk, bonus_def, bonus_speed')
      .single();

    await admin
      .from('tavern_state')
      .upsert({ player_id: user.id, day, claimed: [...claimed, slot] }, { onConflict: 'player_id' });

    return json({ hero, cost });
  }

  // -------------------------------------------------------------- DISMISS
  if (body.action === 'dismiss') {
    if (typeof body.hero_id !== 'string') return json({ error: 'hero_id invalide' }, 400);

    const { data: roster } = await admin.from('heroes').select('id').eq('owner_id', user.id);
    if (!roster || roster.length <= 1) {
      return json({ error: 'Impossible de renvoyer ton dernier héros' }, 400);
    }
    if (!roster.some((h: { id: string }) => h.id === body.hero_id)) {
      return json({ error: 'Héros non possédé' }, 403);
    }

    // Retire aussi le héros de l'ÉQUIPE D'ARÈNE (sinon la compo PvP reste bloquée
    // sur un héros supprimé). On filtre team_hero_ids ET team_snapshot, et on
    // recalcule la puissance depuis les héros restants.
    const { data: arena } = await admin
      .from('arena_entries')
      .select('team_hero_ids, team_snapshot')
      .eq('player_id', user.id)
      .maybeSingle();
    if (arena && ((arena.team_hero_ids as string[]) ?? []).includes(body.hero_id)) {
      const teamHeroIds = ((arena.team_hero_ids as string[]) ?? []).filter((h) => h !== body.hero_id);
      // deno-lint-ignore no-explicit-any
      const snapshot = (((arena.team_snapshot as any[]) ?? []) as any[]).filter(
        (c) => c?.id !== body.hero_id,
      );
      const power = snapshot.reduce((s: number, c: { atk: number; def: number; hp: number; speed: number }) => s + heroPower(c), 0);
      await admin
        .from('arena_entries')
        .update({
          team_hero_ids: teamHeroIds,
          team_snapshot: snapshot,
          power,
          updated_at: new Date().toISOString(),
        })
        .eq('player_id', user.id);
    }

    // Retire le héros de TOUTES les autres compos stockées en tableau (pas de FK
    // cascade sur un uuid[] → il faut nettoyer à la main, sinon il reste « fantôme »
    // et bloque un slot). Les tables à FK cascade (guild_garrison, hero_loans,
    // garrison_borrow_usage, class_tower_progress…) se nettoient toutes seules.
    await removeHeroFromArrayTables(admin, user.id, body.hero_id);

    // Les objets équipés restent dans l'inventaire (aucune FK item → héros).
    await admin.from('heroes').delete().eq('id', body.hero_id).eq('owner_id', user.id);
    return json({ ok: true });
  }

  return json({ error: 'Action inconnue' }, 400);
});
