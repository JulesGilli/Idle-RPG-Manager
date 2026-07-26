// Edge Function : titles
// Succès + titres. Calcule un instantané de stats du joueur (dérivé de l'état DB),
// en déduit les succès débloqués, et gère l'équipement d'UN titre (validé serveur :
// on ne peut équiper qu'un titre réellement débloqué). Anti-triche.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { recruitGrade } from '@shared/progression/recruit.ts';
import { masteryLevelInfo } from '@shared/progression/mastery.ts';
import { itemCraftZone } from '@shared/progression/itemZone.ts';
import {
  unlockedAchievements,
  titleUnlocked,
  isPreV2Account,
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

/**
 * Titres d'ÉVÉNEMENT encore valides du joueur (`player_event_titles`). Ils
 * accordent des stats (cf. `eventTitles.ts`) et expirent — d'où le filtre sur
 * `expires_at`, appliqué à l'horloge SERVEUR.
 */
async function activeEventTitles(
  admin: Admin,
  userId: string,
): Promise<{ title: string; stat_mult: number; expires_at: string; source: string }[]> {
  const { data } = await admin
    .from('player_event_titles')
    .select('title, stat_mult, expires_at, source')
    .eq('player_id', userId)
    .gt('expires_at', new Date().toISOString());
  return (data ?? []) as { title: string; stat_mult: number; expires_at: string; source: string }[];
}

/** Rassemble l'instantané de stats du joueur nécessaire à l'évaluation des succès. */
async function gatherStats(admin: Admin, userId: string): Promise<AchievementStats> {
  const { data: heroes } = await admin
    .from('heroes')
    .select(
      'level, class_id, bonus_hp, bonus_atk, bonus_def, bonus_speed, ' +
        'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed), ' +
        // Les 4 pièces équipées. La zone se déduit via `itemCraftZone`, qui
        // couvre AUSSI les pièces de set et les objets divins (nom sans suffixe →
        // `set_id` / `craft_cost` / `base_*`) et les DEUX arcs. Sélectionner ces
        // colonnes est indispensable : sans elles, un set ou un Divin en zone 10
        // ne validerait jamais « Paré d'étoiles ».
        'weapon:items!heroes_equipped_weapon_id_fkey(name, tier, set_id, craft_cost, base_atk_bonus, base_def_bonus, base_hp_bonus), ' +
        'armor:items!heroes_equipped_armor_id_fkey(name, tier, set_id, craft_cost, base_atk_bonus, base_def_bonus, base_hp_bonus), ' +
        'jewel:items!heroes_equipped_jewel_id_fkey(name, tier, set_id, craft_cost, base_atk_bonus, base_def_bonus, base_hp_bonus), ' +
        'relic:items!heroes_equipped_relic_id_fkey(name, tier, set_id, craft_cost, base_atk_bonus, base_def_bonus, base_hp_bonus)',
    )
    .eq('owner_id', userId);
  // deno-lint-ignore no-explicit-any
  const hs = (heroes ?? []) as any[];
  let maxHeroLevel = 1;
  let hasSGrade = false;
  let fullZone10Hero = false;
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
    // Panoplie : les QUATRE slots remplis, tous en composant de zone 10 — pièces
    // de set et objets DIVINS compris, en zone 10 d'arc 1 comme d'arc 2 (cf.
    // `itemCraftZone`, qui gère les noms sans suffixe et les deux catalogues).
    const worn = [h.weapon, h.armor, h.jewel, h.relic];
    if (worn.every((it) => it && itemCraftZone(it) === 10)) fullZone10Hero = true;
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

  // Maîtrises d'atelier : le niveau se DÉRIVE de l'XP (même fonction pure que
  // partout ailleurs), il n'est jamais stocké.
  const { data: prof } = await admin
    .from('profiles')
    .select('forge_xp, jewel_xp, relic_xp, created_at')
    .eq('id', userId)
    .maybeSingle();

  // Meilleur étage TOUTES TOURS CONFONDUES. On lisait `tower_progress`, table
  // morte depuis le passage aux tours par classe (0067) : les succès d'étage
  // étaient donc devenus inatteignables. On lit désormais les tours par poids et
  // on retient le max — la progression la plus haute du joueur, quel que soit
  // le poids et quel que soit l'arc.
  const { data: towers } = await admin
    .from('weight_tower_progress')
    .select('best_floor')
    .eq('player_id', userId);
  const towerBest = (towers ?? []).reduce(
    (max: number, r: { best_floor: number | null }) => Math.max(max, r.best_floor ?? 0),
    0,
  );

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
    forgeLevel: masteryLevelInfo((prof?.forge_xp as number | undefined) ?? 0).level,
    jewelLevel: masteryLevelInfo((prof?.jewel_xp as number | undefined) ?? 0).level,
    relicLevel: masteryLevelInfo((prof?.relic_xp as number | undefined) ?? 0).level,
    towerBestFloor: towerBest,
    fullZone10Hero,
    // Titre « Fondateur » : verdict calculé SERVEUR sur la date de création réelle
    // du compte (le client ne peut pas la falsifier).
    preV2Account: isPreV2Account(prof?.created_at as string | undefined),
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
      // Titres d'ÉVÉNEMENT encore valides (ils accordent des stats et expirent) :
      // sans eux, le titre gagné au Boss de la Semaine n'apparaissait nulle part
      // dans le profil et ne pouvait pas être équipé.
      event_titles: await activeEventTitles(admin, user.id),
      stats,
    });
  }

  // ------------------------------------------------------------------- EQUIP
  if (body.action === 'equip') {
    const title = body.title;
    if (title !== null && typeof title !== 'string') return json({ error: 'title invalide' }, 400);
    if (title !== null) {
      // Un titre est équipable s'il vient d'un SUCCÈS débloqué OU d'un ÉVÉNEMENT
      // encore valide. Les deux sont vérifiés côté serveur (anti-triche).
      const events = await activeEventTitles(admin, user.id);
      if (!events.some((e) => e.title === title)) {
        const stats = await gatherStats(admin, user.id);
        if (!titleUnlocked(title, stats)) return json({ error: 'Titre non débloqué' }, 403);
      }
    }
    await admin.from('profiles').update({ title }).eq('id', user.id);
    return json({ ok: true, title });
  }

  return json({ error: 'Action inconnue' }, 400);
});
