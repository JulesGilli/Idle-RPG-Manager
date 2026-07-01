// Edge Function : resolve-expedition
// Gère le farm passif ("expéditions"). Actions : start / status / claim / stop.
// L'accumulation (or, XP, loot) est calculée CÔTÉ SERVEUR à partir du temps
// écoulé depuis last_claimed_at. Le client ne peut ni écrire l'expédition, ni
// modifier son or (grant colonne). Toute la logique vit dans /shared.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createRng } from '@shared/combat/prng.ts';
import { applyXpGain } from '@shared/progression/formulas.ts';
import { computeAccrual } from '@shared/progression/idle.ts';
import { rollLoot } from '@shared/progression/loot.ts';
import type { ItemDrop } from '@shared/progression/loot.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_TEAM = 4;

type Body = { action?: unknown; dungeon_id?: unknown; hero_ids?: unknown };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function elapsedSeconds(lastClaimedAt: string): number {
  return (Date.now() - new Date(lastClaimedAt).getTime()) / 1000;
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
  if (action !== 'start' && action !== 'status' && action !== 'claim' && action !== 'stop') {
    return json({ error: 'Action inconnue' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ---------------------------------------------------------------- START
  if (action === 'start') {
    const dungeonId = body.dungeon_id;
    const heroIds = body.hero_ids;
    if (typeof dungeonId !== 'string') return json({ error: 'dungeon_id invalide' }, 400);
    if (!Array.isArray(heroIds) || heroIds.some((h) => typeof h !== 'string')) {
      return json({ error: 'hero_ids invalide' }, 400);
    }
    const unique = [...new Set(heroIds as string[])];
    if (unique.length < 1 || unique.length > MAX_TEAM) {
      return json({ error: `Assigne entre 1 et ${MAX_TEAM} héros` }, 400);
    }

    const { data: owned } = await admin
      .from('heroes')
      .select('id')
      .in('id', unique)
      .eq('owner_id', user.id);
    if (!owned || owned.length !== unique.length) {
      return json({ error: 'Héros introuvables ou non possédés' }, 403);
    }

    const { data: dungeon } = await admin
      .from('dungeons')
      .select('id')
      .eq('id', dungeonId)
      .single();
    if (!dungeon) return json({ error: 'Donjon introuvable' }, 404);

    const nowIso = new Date().toISOString();
    const { data: expedition, error } = await admin
      .from('expeditions')
      .upsert({
        player_id: user.id,
        dungeon_id: dungeonId,
        hero_ids: unique,
        started_at: nowIso,
        last_claimed_at: nowIso,
      })
      .select()
      .single();
    if (error) return json({ error: "Impossible de démarrer l'expédition" }, 500);

    return json({ expedition });
  }

  // ---------------------------------------------------------------- STOP
  if (action === 'stop') {
    await admin.from('expeditions').delete().eq('player_id', user.id);
    return json({ expedition: null });
  }

  // Pour status/claim : charger l'expédition + la difficulté du donjon.
  const { data: expedition } = await admin
    .from('expeditions')
    .select('player_id, dungeon_id, hero_ids, started_at, last_claimed_at')
    .eq('player_id', user.id)
    .single();

  if (!expedition) return json({ expedition: null });

  const { data: dungeon } = await admin
    .from('dungeons')
    .select('id, name, difficulty')
    .eq('id', expedition.dungeon_id)
    .single();
  if (!dungeon) return json({ error: 'Donjon introuvable' }, 404);

  // ---------------------------------------------------------------- STATUS
  if (action === 'status') {
    const preview = computeAccrual(dungeon.difficulty, elapsedSeconds(expedition.last_claimed_at));
    return json({ expedition, dungeon_name: dungeon.name, preview });
  }

  // ---------------------------------------------------------------- CLAIM
  const accrual = computeAccrual(dungeon.difficulty, elapsedSeconds(expedition.last_claimed_at));

  // Or → profil.
  if (accrual.gold > 0) {
    const { data: profile } = await admin
      .from('profiles')
      .select('gold')
      .eq('id', user.id)
      .single();
    const currentGold = profile?.gold ?? 0;
    await admin
      .from('profiles')
      .update({ gold: currentGold + accrual.gold })
      .eq('id', user.id);
  }

  // XP → chaque héros encore possédé.
  const levelUps: { hero_id: string; levels: number }[] = [];
  if (accrual.xpPerHero > 0) {
    const { data: heroes } = await admin
      .from('heroes')
      .select('id, level, xp')
      .in('id', expedition.hero_ids)
      .eq('owner_id', user.id);
    for (const h of heroes ?? []) {
      const gain = applyXpGain(h.level, h.xp, accrual.xpPerHero);
      await admin.from('heroes').update({ level: gain.level, xp: gain.xp }).eq('id', h.id);
      if (gain.levelsGained > 0) levelUps.push({ hero_id: h.id, levels: gain.levelsGained });
    }
  }

  // Loot.
  const items: ItemDrop[] = [];
  if (accrual.lootRolls > 0) {
    const rng = createRng(Math.floor(Math.random() * 2_147_483_647));
    for (let i = 0; i < accrual.lootRolls; i++) {
      const drop = rollLoot(dungeon.difficulty, rng);
      if (drop) {
        await admin.from('items').insert({ owner_id: user.id, ...drop });
        items.push(drop);
      }
    }
  }

  // Reset du chrono.
  const nowIso = new Date().toISOString();
  await admin.from('expeditions').update({ last_claimed_at: nowIso }).eq('player_id', user.id);

  // Feed narratif.
  const feed: string[] = [];
  if (accrual.adventures > 0) {
    feed.push(`Ton équipe a mené ${accrual.adventures} aventure(s) dans ${dungeon.name}.`);
  } else {
    feed.push(`Ton équipe patrouille dans ${dungeon.name}…`);
  }
  if (accrual.gold > 0) feed.push(`💰 ${accrual.gold} or récolté.`);
  if (accrual.xpPerHero > 0) feed.push(`✨ +${accrual.xpPerHero} XP par héros.`);
  for (const item of items) feed.push(`🎁 Butin : ${item.name}.`);
  if (accrual.capped) feed.push('⚠ Plafond hors-ligne (8 h) atteint — réclame plus souvent !');

  return json({
    expedition: { ...expedition, last_claimed_at: nowIso },
    dungeon_name: dungeon.name,
    rewards: {
      gold: accrual.gold,
      xp_per_hero: accrual.xpPerHero,
      adventures: accrual.adventures,
      capped: accrual.capped,
      items,
      level_ups: levelUps,
    },
    feed,
  });
});
