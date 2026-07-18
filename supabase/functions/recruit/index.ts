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
  hashSeed,
  tavernDayKey,
  tavernResetsAt,
  type ClassBase,
} from '@shared/progression/recruit.ts';
import { heroPower } from '@shared/progression/formulas.ts';

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
 * dédupliqué par dungeon_type_id : aucune table dédiée nécessaire.
 */
async function dungeonsClearedOf(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin
    .from('dungeon_runs')
    .select('dungeon_type_id')
    .eq('player_id', userId)
    .eq('success', true);
  return new Set((data ?? []).map((r: { dungeon_type_id: string }) => r.dungeon_type_id)).size;
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
    const day = parisDay();
    const classes = await fetchClasses(admin);
    if (classes.length === 0) return json({ error: 'Aucune classe' }, 500);
    const rosterSize = await rosterSizeOf(admin, user.id);
    const claimed = await claimedSlots(admin, user.id, day);

    const clsMap = new Map(classes.map((c) => [c.id, c]));
    const ownedClassIds = await ownedClassIdsOf(admin, user.id);
    const forced = forcedTavernClasses(rosterSize, ownedClassIds, classes.map((c) => c.id));
    const zonesCompleted = await zonesCompletedOf(admin, user.id);
    const qualityBonus = recruitQualityBonus(zonesCompleted);
    const pool = rollTavernPool(await tavernSeed(admin, user.id, day), classes, forced, qualityBonus);
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
        claimed: claimed.includes(c.slot),
      };
    });

    return json({
      day,
      // Échéance du prochain renouvellement + heure SERVEUR : le compte à rebours
      // ne doit pas dépendre de l'horloge ni du fuseau du navigateur.
      resets_at: tavernResetsAt(Date.now()),
      server_now: new Date().toISOString(),
      candidates,
      cost: recruitCost(rosterSize),
      roster_size: rosterSize,
      max_roster: maxRosterFor(await dungeonsClearedOf(admin, user.id)),
      zones_completed: zonesCompleted,
      quality_bonus: qualityBonus,
    });
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
