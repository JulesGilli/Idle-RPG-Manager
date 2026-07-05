// Edge Function : recruit
// Taverne (au Village) : pool QUOTIDIEN de 8 recrues (renouvelé à minuit,
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
  hashSeed,
  type ClassBase,
} from '@shared/progression/recruit.ts';

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

/** Jour courant (heure de Paris) — clé de renouvellement à minuit. */
function parisDay(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

async function rosterSizeOf(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin.from('heroes').select('id').eq('owner_id', userId);
  return (data ?? []).length;
}

async function fetchClasses(admin: Admin): Promise<ClassRow[]> {
  const { data } = await admin
    .from('hero_classes')
    .select('id, name, base_hp, base_atk, base_def, base_speed');
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
    const pool = rollTavernPool(hashSeed(user.id, day), classes, forcedTavernClasses(rosterSize));
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
      candidates,
      cost: recruitCost(rosterSize),
      roster_size: rosterSize,
      max_roster: MAX_ROSTER,
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
    if (rosterSize >= MAX_ROSTER) {
      return json({ error: `Effectif complet (${MAX_ROSTER} max) — renvoie un héros` }, 400);
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
    const cand = rollTavernPool(hashSeed(user.id, day), classes, forcedTavernClasses(rosterSize))[slot];
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

    // Retire le héros de ses déploiements (supprime le groupe s'il est vide).
    const { data: deployments } = await admin
      .from('deployments')
      .select('id, hero_ids')
      .eq('player_id', user.id);
    for (const dep of deployments ?? []) {
      const ids = dep.hero_ids as string[];
      if (!ids.includes(body.hero_id)) continue;
      const remaining = ids.filter((h) => h !== body.hero_id);
      if (remaining.length === 0) {
        await admin.from('deployments').delete().eq('id', dep.id);
      } else {
        await admin.from('deployments').update({ hero_ids: remaining }).eq('id', dep.id);
      }
    }

    // Les objets équipés restent dans l'inventaire (aucune FK item → héros).
    await admin.from('heroes').delete().eq('id', body.hero_id).eq('owner_id', user.id);
    return json({ ok: true });
  }

  return json({ error: 'Action inconnue' }, 400);
});
