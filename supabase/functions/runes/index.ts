// Edge Function : runes
// Éveil des héros + Runes (end-game). Actions :
//  - awaken : éveille un héros S niveau max (débloque son slot de rune).
//  - craft  : sacrifie 2 pièces d'un set (à effet 2-pièces) + mats rares → 1 rune.
//  - equip  : pose/retire une rune sur un héros éveillé (1 rune par héros).
// Calcul & validation serveur (anti-triche).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { recruitGrade } from '@shared/progression/recruit.ts';
import { canAwaken, isRuneSet, AWAKEN_COST, RUNE_CRAFT_COST } from '@shared/progression/runes.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
type Admin = any;
type Body = { action?: unknown; hero_id?: unknown; set_id?: unknown; rune_id?: unknown };

async function currentArcOf(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin.from('player_arc').select('current_arc').eq('player_id', userId).maybeSingle();
  return Math.max(1, (data?.current_arc as number | undefined) ?? 1);
}

/** Vérifie or + 1 matériau (au tier indiqué). Retourne l'or courant ou une erreur. */
async function checkCost(
  admin: Admin,
  userId: string,
  cost: { gold: number; material: { key: string; qty: number } },
  tier: number,
): Promise<{ gold: number; have: number } | { error: string }> {
  const { data: profile } = await admin.from('profiles').select('gold').eq('id', userId).single();
  const gold = profile?.gold ?? 0;
  if (gold < cost.gold) return { error: 'Or insuffisant' };
  const { data: row } = await admin
    .from('player_resources')
    .select('amount')
    .eq('player_id', userId)
    .eq('tier', tier)
    .eq('resource', cost.material.key)
    .maybeSingle();
  const have = (row?.amount as number | undefined) ?? 0;
  if (have < cost.material.qty) return { error: `Matériau insuffisant : ${cost.material.key}` };
  return { gold, have };
}

async function consumeCost(
  admin: Admin,
  userId: string,
  cost: { gold: number; material: { key: string; qty: number } },
  gold: number,
  have: number,
  tier: number,
): Promise<void> {
  await admin.from('profiles').update({ gold: gold - cost.gold }).eq('id', userId);
  await admin
    .from('player_resources')
    .update({ amount: have - cost.material.qty })
    .eq('player_id', userId)
    .eq('tier', tier)
    .eq('resource', cost.material.key);
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

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: 'Corps invalide' }, 400);
  }

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const arc = await currentArcOf(admin, user.id);

  // ------------------------------------------------------------------ AWAKEN
  if (body.action === 'awaken') {
    if (typeof body.hero_id !== 'string') return json({ error: 'hero_id invalide' }, 400);
    const { data: hero } = await admin
      .from('heroes')
      .select(
        'id, level, awakened, class_id, bonus_hp, bonus_atk, bonus_def, bonus_speed, ' +
          'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed)',
      )
      .eq('id', body.hero_id)
      .eq('owner_id', user.id)
      .maybeSingle();
    if (!hero) return json({ error: 'Héros non possédé' }, 403);
    const cls = hero.cls;
    const grade = cls
      ? recruitGrade(
          { bonus_hp: hero.bonus_hp ?? 0, bonus_atk: hero.bonus_atk ?? 0, bonus_def: hero.bonus_def ?? 0, bonus_speed: hero.bonus_speed ?? 0 },
          { id: hero.class_id, ...cls },
        )
      : 'D';
    if (!canAwaken(grade, hero.level ?? 1, hero.awakened ?? false)) {
      return json({ error: 'Éveil réservé aux héros de grade S au niveau maximum' }, 400);
    }
    const cost = await checkCost(admin, user.id, AWAKEN_COST, arc);
    if ('error' in cost) return json({ error: cost.error }, 400);
    await consumeCost(admin, user.id, AWAKEN_COST, cost.gold, cost.have, arc);
    await admin.from('heroes').update({ awakened: true }).eq('id', hero.id).eq('owner_id', user.id);
    return json({ ok: true, awakened: true });
  }

  // ------------------------------------------------------------------- CRAFT
  if (body.action === 'craft') {
    if (typeof body.set_id !== 'string' || !isRuneSet(body.set_id)) {
      return json({ error: 'Set non extractible en rune' }, 400);
    }
    // Sacrifie 2 pièces du set (la panoplie complète des sets 2-pièces).
    const { data: pieces } = await admin
      .from('items')
      .select('id')
      .eq('owner_id', user.id)
      .eq('set_id', body.set_id)
      .limit(2);
    if (!pieces || pieces.length < 2) {
      return json({ error: 'Il te faut les 2 pièces du set pour en extraire une rune' }, 400);
    }
    const cost = await checkCost(admin, user.id, RUNE_CRAFT_COST, arc);
    if ('error' in cost) return json({ error: cost.error }, 400);

    await consumeCost(admin, user.id, RUNE_CRAFT_COST, cost.gold, cost.have, arc);
    await admin.from('items').delete().in('id', pieces.map((p: { id: string }) => p.id));
    const { data: rune } = await admin
      .from('runes')
      .insert({ owner_id: user.id, set_id: body.set_id })
      .select('id, set_id')
      .single();
    return json({ ok: true, rune });
  }

  // ------------------------------------------------------------------- EQUIP
  if (body.action === 'equip') {
    if (typeof body.hero_id !== 'string') return json({ error: 'hero_id invalide' }, 400);
    const runeId = body.rune_id ?? null;
    if (runeId !== null && typeof runeId !== 'string') return json({ error: 'rune_id invalide' }, 400);

    const { data: hero } = await admin
      .from('heroes')
      .select('id, awakened')
      .eq('id', body.hero_id)
      .eq('owner_id', user.id)
      .maybeSingle();
    if (!hero) return json({ error: 'Héros non possédé' }, 403);
    if (!hero.awakened) return json({ error: 'Héros non éveillé — pas de slot de rune' }, 400);

    if (runeId !== null) {
      const { data: rune } = await admin
        .from('runes')
        .select('id')
        .eq('id', runeId)
        .eq('owner_id', user.id)
        .maybeSingle();
      if (!rune) return json({ error: 'Rune introuvable' }, 404);
      // Une rune ne peut être portée que par UN héros : on la retire d'un éventuel autre.
      await admin.from('heroes').update({ rune_id: null }).eq('owner_id', user.id).eq('rune_id', runeId);
    }
    await admin.from('heroes').update({ rune_id: runeId }).eq('id', hero.id).eq('owner_id', user.id);
    return json({ ok: true, rune_id: runeId });
  }

  return json({ error: 'Action inconnue' }, 400);
});
