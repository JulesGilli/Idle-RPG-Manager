// Edge Function : titles
// Succès + titres. Calcule un instantané de stats du joueur (dérivé de l'état DB),
// en déduit les succès débloqués, et gère l'équipement d'UN titre (validé serveur :
// on ne peut équiper qu'un titre réellement débloqué). Anti-triche.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { recruitGrade } from '@shared/progression/recruit.ts';
import {
  unlockedAchievements,
  titleUnlocked,
  type AchievementStats,
} from '@shared/progression/achievements.ts';

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
type Body = { action?: unknown; title?: unknown };

/** Rassemble l'instantané de stats du joueur nécessaire à l'évaluation des succès. */
async function gatherStats(admin: Admin, userId: string): Promise<AchievementStats> {
  const { data: heroes } = await admin
    .from('heroes')
    .select(
      'level, class_id, bonus_hp, bonus_atk, bonus_def, bonus_speed, ' +
        'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed)',
    )
    .eq('owner_id', userId);
  // deno-lint-ignore no-explicit-any
  const hs = (heroes ?? []) as any[];
  let maxHeroLevel = 1;
  let hasSGrade = false;
  const classes = new Set<string>();
  for (const h of hs) {
    maxHeroLevel = Math.max(maxHeroLevel, h.level ?? 1);
    classes.add(h.class_id);
    if (h.cls) {
      const grade = recruitGrade(
        { bonus_hp: h.bonus_hp ?? 0, bonus_atk: h.bonus_atk ?? 0, bonus_def: h.bonus_def ?? 0, bonus_speed: h.bonus_speed ?? 0 },
        { id: h.class_id, ...h.cls },
      );
      if (grade === 'S') hasSGrade = true;
    }
  }

  const { data: items } = await admin
    .from('items')
    .select('item_type, upgrade_level, blessing_level')
    .eq('owner_id', userId);
  // deno-lint-ignore no-explicit-any
  const its = (items ?? []) as any[];
  const maxUpgrade = its.reduce((m, i) => Math.max(m, i.upgrade_level ?? 0), 0);
  const blessedWeapons = its.filter((i) => i.item_type === 'weapon' && (i.blessing_level ?? 0) > 0).length;

  const { data: runs } = await admin
    .from('dungeon_runs')
    .select('dungeon_type_id')
    .eq('player_id', userId)
    .eq('success', true);
  const dungeonsCleared = new Set((runs ?? []).map((r: { dungeon_type_id: string }) => r.dungeon_type_id)).size;

  const { data: arena } = await admin
    .from('arena_entries')
    .select('rank')
    .eq('player_id', userId)
    .maybeSingle();

  const { data: pantin } = await admin
    .from('pantin_runs')
    .select('best_score')
    .eq('player_id', userId)
    .maybeSingle();

  const { data: lb } = await admin
    .from('leaderboard')
    .select('max_difficulty')
    .eq('player_id', userId)
    .maybeSingle();

  return {
    heroesCount: hs.length,
    maxHeroLevel,
    hasSGrade,
    distinctClasses: classes.size,
    dungeonsCleared,
    arenaRank: (arena?.rank as number | undefined) ?? null,
    blessedWeapons,
    maxUpgrade,
    itemsCount: its.length,
    pantinBest: (pantin?.best_score as number | undefined) ?? 0,
    maxDifficulty: (lb?.max_difficulty as number | undefined) ?? 0,
  };
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

  // ------------------------------------------------------------------ STATUS
  if (body.action === 'status') {
    const stats = await gatherStats(admin, user.id);
    const { data: profile } = await admin.from('profiles').select('title').eq('id', user.id).maybeSingle();
    return json({
      unlocked: unlockedAchievements(stats),
      title: (profile?.title as string | null) ?? null,
      stats,
    });
  }

  // ------------------------------------------------------------------- EQUIP
  if (body.action === 'equip') {
    const title = body.title;
    if (title !== null && typeof title !== 'string') return json({ error: 'title invalide' }, 400);
    if (title !== null) {
      const stats = await gatherStats(admin, user.id);
      if (!titleUnlocked(title, stats)) return json({ error: 'Titre non débloqué' }, 403);
    }
    await admin.from('profiles').update({ title }).eq('id', user.id);
    return json({ ok: true, title });
  }

  return json({ error: 'Action inconnue' }, 400);
});
