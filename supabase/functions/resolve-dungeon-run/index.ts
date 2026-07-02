// Edge Function : resolve-dungeon-run
// Reçoit { dungeon_id, hero_ids } d'un client authentifié, résout le combat
// CÔTÉ SERVEUR (jamais côté client), écrit la progression en service_role
// (bypass RLS) et renvoie le log + les récompenses.
//
// Toute la logique de calcul vit dans /shared (fonctions pures testées).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resolveCombat, createRng } from '@shared/combat/index.ts';
import type { CombatantInput } from '@shared/combat/index.ts';
import { effectiveStats, applyXpGain, xpRewardForDungeon } from '@shared/progression/formulas.ts';
import { computeAbilities, computePassives, combatRole } from '@shared/progression/skills.ts';
import { rollLoot } from '@shared/progression/loot.ts';
import type { ItemDrop } from '@shared/progression/loot.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TEAM_SIZE = 2;

type Body = { dungeon_id?: unknown; hero_ids?: unknown };
type EnemyConfig = { enemies: { name: string; hp: number; atk: number; def: number; speed: number }[] };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

  // --- Auth : identifier l'appelant via son JWT ---
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

  // --- Validation de l'intention ---
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: 'Corps de requête invalide' }, 400);
  }

  const dungeonId = body.dungeon_id;
  const heroIds = body.hero_ids;
  if (typeof dungeonId !== 'string') return json({ error: 'dungeon_id invalide' }, 400);
  if (!Array.isArray(heroIds) || heroIds.some((h) => typeof h !== 'string')) {
    return json({ error: 'hero_ids invalide' }, 400);
  }
  const uniqueHeroIds = [...new Set(heroIds as string[])];
  if (uniqueHeroIds.length !== TEAM_SIZE) {
    return json({ error: `L'équipe doit compter exactement ${TEAM_SIZE} héros distincts` }, 400);
  }

  // --- Client privilégié (service_role) : lecture/écriture bypass RLS ---
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Héros du joueur (ownership vérifié par le filtre owner_id).
  const { data: heroes, error: heroesError } = await admin
    .from('heroes')
    .select(
      'id, name, class_id, level, xp, skills, ' +
        'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed), ' +
        'weapon:items!heroes_equipped_weapon_id_fkey(atk_bonus, def_bonus, hp_bonus), ' +
        'armor:items!heroes_equipped_armor_id_fkey(atk_bonus, def_bonus, hp_bonus)',
    )
    .in('id', uniqueHeroIds)
    .eq('owner_id', user.id);

  if (heroesError) return json({ error: 'Erreur de lecture des héros' }, 500);
  if (!heroes || heroes.length !== TEAM_SIZE) {
    return json({ error: 'Héros introuvables ou non possédés' }, 403);
  }

  // Donjon.
  const { data: dungeon, error: dungeonError } = await admin
    .from('dungeons')
    .select('id, name, difficulty, enemy_config')
    .eq('id', dungeonId)
    .single();
  if (dungeonError || !dungeon) return json({ error: 'Donjon introuvable' }, 404);

  // --- Construction des combattants ---
  const allies: CombatantInput[] = heroes.map((h) => {
    const cls = h.cls as unknown as { base_hp: number; base_atk: number; base_def: number; base_speed: number };
    const weapon = (h.weapon ?? null) as { atk_bonus: number; def_bonus: number; hp_bonus: number } | null;
    const armor = (h.armor ?? null) as { atk_bonus: number; def_bonus: number; hp_bonus: number } | null;
    const bonuses = {
      atk: (weapon?.atk_bonus ?? 0) + (armor?.atk_bonus ?? 0),
      def: (weapon?.def_bonus ?? 0) + (armor?.def_bonus ?? 0),
      hp: (weapon?.hp_bonus ?? 0) + (armor?.hp_bonus ?? 0),
    };
    const stats = effectiveStats(
      { hp: cls.base_hp, atk: cls.base_atk, def: cls.base_def, speed: cls.base_speed },
      h.level,
      bonuses,
    );
    const learned = (h.skills ?? {}) as Record<string, number>;
    const role = combatRole(h.class_id);
    const abilities = computeAbilities(h.class_id, learned);
    const passives = computePassives(h.class_id, learned);
    return { id: h.id, name: h.name, role, ...stats, abilities, passives };
  });

  const enemyConfig = dungeon.enemy_config as unknown as EnemyConfig;
  const enemies: CombatantInput[] = enemyConfig.enemies.map((e, i) => ({
    id: `enemy-${i}`,
    name: e.name,
    role: 'enemy',
    hp: e.hp,
    atk: e.atk,
    def: e.def,
    speed: e.speed,
  }));

  // --- Résolution du combat (seedée) ---
  const seed = Math.floor(Math.random() * 2_147_483_647);
  const combat = resolveCombat({ allies, enemies, seed });

  // --- Récompenses (uniquement en cas de victoire) ---
  let rewards: { xp: number; items: ItemDrop[]; level_ups: { hero_id: string; levels: number }[] } | null =
    null;

  if (combat.result === 'win') {
    const xp = xpRewardForDungeon(dungeon.difficulty);
    const lootRng = createRng((seed ^ 0x9e3779b9) >>> 0);
    const drop = rollLoot(dungeon.difficulty, lootRng);
    const levelUps: { hero_id: string; levels: number }[] = [];

    for (const h of heroes) {
      const gain = applyXpGain(h.level, h.xp, xp);
      await admin.from('heroes').update({ level: gain.level, xp: gain.xp }).eq('id', h.id);
      if (gain.levelsGained > 0) levelUps.push({ hero_id: h.id, levels: gain.levelsGained });
    }

    const items: ItemDrop[] = [];
    if (drop) {
      const { data: inserted } = await admin
        .from('items')
        .insert({ owner_id: user.id, ...drop })
        .select()
        .single();
      if (inserted) items.push(drop);
    }

    rewards = { xp, items, level_ups: levelUps };
  }

  // --- Persistance du run ---
  const combatLog = {
    rounds: combat.rounds,
    events: combat.events,
    final_state: combat.finalState,
  };

  const { error: runError } = await admin.from('dungeon_runs').insert({
    player_id: user.id,
    dungeon_id: dungeon.id,
    hero_ids: uniqueHeroIds,
    result: combat.result,
    seed,
    combat_log: combatLog,
    rewards,
  });
  if (runError) return json({ error: "Échec de l'enregistrement du run" }, 500);

  return json({
    result: combat.result,
    seed,
    rounds: combat.rounds,
    events: combat.events,
    final_state: combat.finalState,
    rewards,
  });
});
