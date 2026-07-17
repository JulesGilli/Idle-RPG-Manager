// Edge Function : world-boss — BOSS DE LA SEMAINE (communautaire, immortel).
//
// ⚠️ SCAFFOLD — à finir (Jules, ce soir). Ce qui est FAIT :
//   - CORS + auth (JWT → user).
//   - action `state`    : renvoie l'event actif + progression paliers + ma frappe.
//   - action `leaderboard` : top 20 des dégâts (world_boss_hits joint aux noms).
// Ce qui reste (cherche les `TODO`) :
//   - action `hit` : résoudre le VRAI combat serveur et cumuler les dégâts
//     (le squelette gère déjà l'unicité 1 frappe/semaine + le CAS sur total_damage
//     + le déblocage des paliers ; il manque le calcul des dégâts et le payout).
//   - finalisation hebdo (cron) : figer le classement → attribuer player_event_titles.
//
// S'inspire de `arc-event` (même moteur de combat, même snapshot héros). La grosse
// différence : boss IMMORTEL (pas de pool de PV, on cumule `total_damage`) et
// UNE seule frappe par joueur et par event (PK world_boss_hits sans jour).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// deno-lint-ignore no-explicit-any
type Admin = any;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Event actif (ou null). Lazy-end si la semaine est écoulée. TODO: brancher la finalisation. */
async function activeEvent(admin: Admin) {
  const { data } = await admin
    .from('world_boss_events')
    .select('*')
    .eq('status', 'active')
    .maybeSingle();
  return data ?? null;
}

/** Paliers communs (config réutilisée chaque semaine), triés par seuil croissant. */
async function tierDefs(admin: Admin): Promise<{ idx: number; threshold: number; reward: unknown }[]> {
  const { data } = await admin
    .from('world_boss_tier_defs')
    .select('idx, threshold, reward')
    .order('idx', { ascending: true });
  return (data ?? []) as { idx: number; threshold: number; reward: unknown }[];
}

/** Classement : top 20 contributeurs de l'event, avec nom d'affichage. */
async function leaderboard(admin: Admin, eventId: string) {
  const { data } = await admin
    .from('world_boss_hits')
    .select('player_id, damage, profiles(display_name)')
    .eq('event_id', eventId)
    .order('damage', { ascending: false })
    .limit(20);
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((r: any, i: number) => ({
    rank: i + 1,
    player_id: r.player_id,
    name: r.profiles?.display_name ?? '—',
    damage: r.damage as number,
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') ?? '';
  const admin: Admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  const {
    data: { user },
  } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!user) return json({ error: 'Non authentifié' }, 401);

  const body = (await req.json().catch(() => ({}))) as { action?: string; hero_ids?: string[] };
  const action = body.action ?? 'state';

  const event = await activeEvent(admin);

  // ---------------------------------------------------------------- STATE
  if (action === 'state') {
    if (!event) return json({ active: false });
    const tiers = await tierDefs(admin);
    const { data: myHit } = await admin
      .from('world_boss_hits')
      .select('damage, created_at')
      .eq('event_id', event.id)
      .eq('player_id', user.id)
      .maybeSingle();
    return json({
      active: true,
      boss_name: event.boss_name,
      total_damage: event.total_damage,
      tiers_unlocked: event.tiers_unlocked,
      tiers,
      ends_at: event.ends_at,
      already_hit: Boolean(myHit),
      my_damage: myHit?.damage ?? 0,
    });
  }

  // ---------------------------------------------------------------- LEADERBOARD
  if (action === 'leaderboard') {
    if (!event) return json({ rows: [] });
    return json({ rows: await leaderboard(admin, event.id) });
  }

  // ---------------------------------------------------------------- HIT
  if (action === 'hit') {
    if (!event) return json({ error: 'Aucun boss actif' }, 400);

    // Unicité : 1 frappe / semaine / joueur. On insère d'abord la ligne (damage 0) ;
    // un conflit sur la PK (event_id, player_id) = déjà frappé cette semaine.
    const { error: dupErr } = await admin
      .from('world_boss_hits')
      .insert({ event_id: event.id, player_id: user.id, damage: 0 });
    if (dupErr) return json({ error: 'Tu as déjà frappé le boss cette semaine.' }, 409);

    // TODO(Jules): résoudre le VRAI combat serveur ici (comme arc-event) :
    //   1. charger les héros de `body.hero_ids` (possédés uniquement), snapshot,
    //      buffs de guilde ;
    //   2. bâtir le boss depuis event.monster_sequence ;
    //   3. resolveCombat(...) → damage = dégâts infligés au boss immortel.
    const damage = 0; // ← remplacer par les dégâts calculés

    // Crédite la frappe (met à jour la ligne qu'on vient d'insérer).
    await admin
      .from('world_boss_hits')
      .update({ damage })
      .eq('event_id', event.id)
      .eq('player_id', user.id);

    // Cumule au total collectif de façon ATOMIQUE (increment côté DB pour éviter
    // les pertes en concurrence). TODO: créer une RPC `increment_world_boss_damage`
    // (add), sur le modèle du CAS de arc-event, plutôt que ce read-modify-write.
    const newTotal = (event.total_damage as number) + damage;
    await admin.from('world_boss_events').update({ total_damage: newTotal }).eq('id', event.id);

    // Débloque les paliers communs franchis par ce nouveau total.
    const tiers = await tierDefs(admin);
    const unlocked = tiers.filter((t) => newTotal >= t.threshold).length;
    const newlyUnlocked = unlocked - (event.tiers_unlocked as number);
    if (newlyUnlocked > 0) {
      await admin.from('world_boss_events').update({ tiers_unlocked: unlocked }).eq('id', event.id);
      // TODO(Jules): payer les récompenses des paliers `newlyUnlocked` à TOUS les
      // contributeurs (crédit ressources/or via addResources/addGold).
    }

    return json({ damage, total_damage: newTotal, tiers_unlocked: unlocked });
  }

  return json({ error: 'Action inconnue' }, 400);
});
