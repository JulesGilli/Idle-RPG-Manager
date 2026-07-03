// Edge Function : guild-actions
// Gestion des guildes et des rôles (anti-triche : tout en service_role, tables
// SELECT-only côté client). Actions : create | join | leave | kick | set_role |
// disband. Chaque action journalise un guild_events (flux d'activité).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  canKick,
  canSetRole,
  canDisband,
  DEFAULT_MAX_MEMBERS,
  type GuildRole,
} from '@shared/progression/guild.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = {
  action?: unknown;
  name?: unknown;
  tag?: unknown;
  description?: unknown;
  emblem?: unknown;
  target_player_id?: unknown;
  role?: unknown;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
type Admin = any;

type Membership = { guild_id: string; role: GuildRole } | null;

async function membershipOf(admin: Admin, playerId: string): Promise<Membership> {
  const { data } = await admin
    .from('guild_members')
    .select('guild_id, role')
    .eq('player_id', playerId)
    .maybeSingle();
  return data ? { guild_id: data.guild_id, role: data.role as GuildRole } : null;
}

async function logEvent(
  admin: Admin,
  guildId: string,
  kind: string,
  actorId: string | null,
  message: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  await admin
    .from('guild_events')
    .insert({ guild_id: guildId, kind, actor_player_id: actorId, message, meta });
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

  // ---------------------------------------------------------------- CREATE
  if (body.action === 'create') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const tag = typeof body.tag === 'string' ? body.tag.trim().toUpperCase() : '';
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 200) : '';
    const emblem = typeof body.emblem === 'string' ? body.emblem : undefined;
    if (name.length < 3 || name.length > 24) return json({ error: 'Nom : 3 à 24 caractères' }, 400);
    if (!/^[A-Z0-9]{2,5}$/.test(tag)) return json({ error: 'Tag : 2 à 5 lettres/chiffres' }, 400);

    if (await membershipOf(admin, user.id)) return json({ error: 'Tu es déjà dans une guilde' }, 409);

    const { data: guild, error } = await admin
      .from('guilds')
      .insert({
        name,
        tag,
        description,
        founder_player_id: user.id,
        ...(emblem ? { emblem } : {}),
      })
      .select('id')
      .single();
    if (error || !guild) {
      const msg = /duplicate|unique/i.test(error?.message ?? '')
        ? 'Nom ou tag déjà pris'
        : 'Création impossible';
      return json({ error: msg }, 409);
    }
    await admin.from('guild_members').insert({ player_id: user.id, guild_id: guild.id, role: 'founder' });
    await logEvent(admin, guild.id, 'create', user.id, `${name} a été fondée`);
    return json({ guild_id: guild.id });
  }

  // ------------------------------------------------------------------ JOIN
  if (body.action === 'join') {
    const tag = typeof body.tag === 'string' ? body.tag.trim().toUpperCase() : '';
    if (!tag) return json({ error: 'tag invalide' }, 400);
    if (await membershipOf(admin, user.id)) return json({ error: 'Tu es déjà dans une guilde' }, 409);

    const { data: guild } = await admin
      .from('guilds')
      .select('id, name, max_members')
      .eq('tag', tag)
      .maybeSingle();
    if (!guild) return json({ error: 'Guilde introuvable' }, 404);

    const { count } = await admin
      .from('guild_members')
      .select('player_id', { count: 'exact', head: true })
      .eq('guild_id', guild.id);
    if ((count ?? 0) >= (guild.max_members ?? DEFAULT_MAX_MEMBERS)) {
      return json({ error: 'Guilde complète' }, 409);
    }

    await admin.from('guild_members').insert({ player_id: user.id, guild_id: guild.id, role: 'member' });
    await logEvent(admin, guild.id, 'join', user.id, `Un membre a rejoint la guilde`);
    return json({ guild_id: guild.id });
  }

  // ----------------------------------------------------------------- LEAVE
  if (body.action === 'leave') {
    const me = await membershipOf(admin, user.id);
    if (!me) return json({ error: "Tu n'es dans aucune guilde" }, 400);
    if (me.role === 'founder') {
      return json({ error: 'Un fondateur doit dissoudre la guilde (pas la quitter)' }, 400);
    }
    await admin.from('guild_members').delete().eq('player_id', user.id);
    await logEvent(admin, me.guild_id, 'leave', user.id, `Un membre a quitté la guilde`);
    return json({ ok: true });
  }

  // ------------------------------------------------------------------ KICK
  if (body.action === 'kick') {
    const targetId = body.target_player_id;
    if (typeof targetId !== 'string') return json({ error: 'target_player_id invalide' }, 400);
    const me = await membershipOf(admin, user.id);
    if (!me) return json({ error: "Tu n'es dans aucune guilde" }, 400);
    const target = await membershipOf(admin, targetId);
    if (!target || target.guild_id !== me.guild_id) {
      return json({ error: 'Membre introuvable dans ta guilde' }, 404);
    }
    if (!canKick(me.role, target.role)) return json({ error: 'Droits insuffisants' }, 403);
    await admin.from('guild_members').delete().eq('player_id', targetId);
    await logEvent(admin, me.guild_id, 'kick', user.id, `Un membre a été exclu`, { target: targetId });
    return json({ ok: true });
  }

  // -------------------------------------------------------------- SET_ROLE
  if (body.action === 'set_role') {
    const targetId = body.target_player_id;
    const role = body.role;
    if (typeof targetId !== 'string') return json({ error: 'target_player_id invalide' }, 400);
    if (role !== 'officer' && role !== 'member') return json({ error: 'Rôle invalide' }, 400);
    const me = await membershipOf(admin, user.id);
    if (!me || !canSetRole(me.role)) return json({ error: 'Réservé au fondateur' }, 403);
    const target = await membershipOf(admin, targetId);
    if (!target || target.guild_id !== me.guild_id || target.role === 'founder') {
      return json({ error: 'Cible invalide' }, 400);
    }
    await admin.from('guild_members').update({ role }).eq('player_id', targetId);
    await logEvent(admin, me.guild_id, role === 'officer' ? 'promote' : 'demote', user.id, `Rôle mis à jour : ${role}`, { target: targetId });
    return json({ ok: true });
  }

  // --------------------------------------------------------------- DISBAND
  if (body.action === 'disband') {
    const me = await membershipOf(admin, user.id);
    if (!me || !canDisband(me.role)) return json({ error: 'Réservé au fondateur' }, 403);
    // Cascade : membres, lobbies, contributions, runs, events supprimés.
    await admin.from('guilds').delete().eq('id', me.guild_id);
    return json({ ok: true });
  }

  return json({ error: 'Action inconnue' }, 400);
});
