// Edge Function : resolve-tower
// Résout une montée de LA TOUR côté serveur (anti-triche) et renvoie de quoi
// rejouer les combats. Activité SOLO : un seul héros POSSÉDÉ (pas d'emprunt).
// La montée démarre au-dessus du meilleur étage atteint (tower_progress) : chaque
// étage ne rapporte ses matériaux de base qu'une seule fois. Difficulté et loot
// calculés par /shared/progression/tower.ts (pur, déterministe).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import type { CombatantInput } from '@shared/combat/index.ts';
import { buildHeroSnapshot, type HeroSnapshotInput } from '@shared/progression/heroLoan.ts';
import { computeSetBonuses } from '@shared/progression/sets.ts';
import { simulateTowerClimb, TOWER_MAX_FLOOR, TOWER_CLASSES } from '@shared/progression/tower.ts';
import { isReleased } from '@shared/progression/release.ts';
import {
  combatBuff,
  NO_COMBAT_BUFF,
  type GuildAlloc,
  type GuildCombatBuff,
} from '@shared/progression/guildSkills.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = { hero_id?: unknown };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/** La refonte des Tours (V1.1) est-elle sortie ? Horloge SERVEUR (anti-triche). */
async function towerReleased(admin: Admin): Promise<boolean> {
  const { data } = await admin.from('app_config').select('value').eq('key', 'release_at').maybeSingle();
  return isReleased((data?.value as string | null) ?? null, Date.now());
}

/** Buff de combat de l'arbre de guilde de l'appelant (neutre si sans guilde). */
async function towerGuildBuff(admin: Admin, userId: string): Promise<GuildCombatBuff> {
  const { data: mem } = await admin
    .from('guild_members')
    .select('guild_id')
    .eq('player_id', userId)
    .maybeSingle();
  if (!mem?.guild_id) return NO_COMBAT_BUFF;
  const { data: g } = await admin.from('guilds').select('skill_alloc').eq('id', mem.guild_id).single();
  return combatBuff((g?.skill_alloc ?? {}) as GuildAlloc);
}

const HERO_SELECT =
  'id, name, class_id, level, owner_id, alloc_hp, alloc_atk, alloc_def, alloc_speed, skills, ' +
  'active_skill_id, ultimate_skill_id, ' +
  'bonus_hp, bonus_atk, bonus_def, bonus_speed, ' +
  'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed), ' +
  'weapon:items!heroes_equipped_weapon_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), ' +
  'armor:items!heroes_equipped_armor_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), ' +
  'jewel:items!heroes_equipped_jewel_id_fkey(atk_bonus, def_bonus, hp_bonus, passive_type, passive_value, set_id), ' +
  'relic:items!heroes_equipped_relic_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id)';

// deno-lint-ignore no-explicit-any
function toSnapshotInput(h: any): HeroSnapshotInput {
  const cls = h.cls;
  const sum = (k: string) =>
    (h.weapon?.[k] ?? 0) + (h.armor?.[k] ?? 0) + (h.jewel?.[k] ?? 0) + (h.relic?.[k] ?? 0);
  const setB = computeSetBonuses([h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id]);
  return {
    id: h.id,
    name: h.name,
    classId: h.class_id,
    level: h.level,
    classBase: { hp: cls.base_hp, atk: cls.base_atk, def: cls.base_def, speed: cls.base_speed },
    innate: { hp: h.bonus_hp ?? 0, atk: h.bonus_atk ?? 0, def: h.bonus_def ?? 0, speed: h.bonus_speed ?? 0 },
    alloc: { hp: h.alloc_hp, atk: h.alloc_atk, def: h.alloc_def, speed: h.alloc_speed },
    equipment: { atk: sum('atk_bonus') + setB.atk, def: sum('def_bonus') + setB.def, hp: sum('hp_bonus') + setB.hp },
    jewelPassive:
      h.jewel?.passive_type && (h.jewel?.passive_value ?? 0) > 0
        ? { type: h.jewel.passive_type, value: h.jewel.passive_value / 100 }
        : null,
    skills: (h.skills ?? {}) as Record<string, number>,
    loadout: { activeId: h.active_skill_id ?? null, ultimateId: h.ultimate_skill_id ?? null },
    setIds: [h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id],
  };
}

/** Héros engagés dans une activité IDLE (farm 'loop' ou expédition en cours). */
async function engagedInActivity(admin: Admin): Promise<Set<string>> {
  const engaged = new Set<string>();
  const { data: deps } = await admin.from('deployments').select('hero_ids').eq('mode', 'loop');
  for (const r of deps ?? []) for (const h of (r.hero_ids as string[]) ?? []) engaged.add(h);
  const { data: exps } = await admin
    .from('expedition_runs')
    .select('hero_ids')
    .eq('status', 'in_progress');
  for (const r of exps ?? []) for (const h of (r.hero_ids as string[]) ?? []) engaged.add(h);
  return engaged;
}

async function addResources(
  admin: Admin,
  userId: string,
  resources: Record<string, number>,
): Promise<void> {
  for (const [resource, add] of Object.entries(resources)) {
    if (add <= 0) continue;
    const { data: row } = await admin
      .from('player_resources')
      .select('amount')
      .eq('player_id', userId)
      .eq('resource', resource)
      .maybeSingle();
    await admin
      .from('player_resources')
      .upsert(
        { player_id: userId, resource, amount: (row?.amount ?? 0) + add },
        { onConflict: 'player_id,resource' },
      );
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
    return json({ error: 'Corps de requête invalide' }, 400);
  }
  if (typeof body.hero_id !== 'string') return json({ error: 'hero_id invalide' }, 400);

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // --- Verrou de sortie (V1.1) : les Tours par classe ne sont pas jouables avant
  // l'heure de sortie. Vérifié CÔTÉ SERVEUR (impossible d'anticiper en trichant l'horloge). ---
  if (!(await towerReleased(admin))) {
    return json({ error: 'La refonte des Tours arrive bientôt — reviens à la sortie de la V1.1.' }, 403);
  }

  // --- Héros : possédé par l'appelant (la Tour est solo, pas d'emprunt) ---
  const { data: hero } = await admin
    .from('heroes')
    .select(HERO_SELECT)
    .eq('id', body.hero_id)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!hero) return json({ error: 'Héros non possédé' }, 403);

  // Chaque classe a SA tour : la progression est indexée sur la classe du héros.
  const classId = hero.class_id as string;
  if (!TOWER_CLASSES.includes(classId as (typeof TOWER_CLASSES)[number])) {
    return json({ error: 'Classe sans tour dédiée' }, 400);
  }

  // --- Dispo : le héros ne doit pas être engagé dans une activité idle ---
  const engaged = await engagedInActivity(admin);
  if (engaged.has(hero.id)) {
    return json({ error: 'Ce héros est déjà engagé dans une autre activité' }, 409);
  }

  // --- Progression de LA TOUR DE CETTE CLASSE : on repart au-dessus du meilleur étage ---
  const { data: progress } = await admin
    .from('class_tower_progress')
    .select('best_floor')
    .eq('player_id', user.id)
    .eq('class_id', classId)
    .maybeSingle();
  const bestFloor = progress?.best_floor ?? 0;
  if (bestFloor >= TOWER_MAX_FLOOR) {
    return json({ error: 'Tu as déjà atteint le sommet de cette tour', best_floor: bestFloor }, 409);
  }
  const fromFloor = bestFloor + 1;

  // --- Snapshot combat (intègre le loadout actif/ultime + buff de guilde) + seed ---
  const combatant: CombatantInput = buildHeroSnapshot(toSnapshotInput(hero), await towerGuildBuff(admin, user.id));
  const seed = Math.floor(Math.random() * 2_147_483_647);
  const run = simulateTowerClimb(seed, combatant, fromFloor);

  // --- Avancement ATOMIQUE du meilleur étage (anti multi-onglets) ---
  // Deux runs concurrents partent tous deux de bestFloor et franchissent les
  // mêmes étages : sans garde, leurs butins se chevauchent et se cumulent. On
  // avance donc best_floor par un compare-and-swap EXACT (best_floor = la valeur
  // qu'on a lue) : on s'assure d'abord qu'une ligne existe (sentinelle), puis un
  // SEUL UPDATE passe. Le crédit du butin n'a lieu QUE si l'on a remporté l'avance
  // — le run perdant est ignoré (best_floor a bougé), donc aucun double crédit.
  const newBest = Math.max(bestFloor, run.reachedFloor);
  await admin.from('class_tower_progress').upsert(
    { player_id: user.id, class_id: classId, best_floor: 0 },
    { onConflict: 'player_id,class_id', ignoreDuplicates: true },
  );
  const { data: advanced } = await admin
    .from('class_tower_progress')
    .update({ best_floor: newBest, updated_at: new Date().toISOString() })
    .eq('player_id', user.id)
    .eq('class_id', classId)
    .eq('best_floor', bestFloor)
    .select('player_id');
  const advanceWon = Boolean(advanced && advanced.length > 0);

  // --- Crédit des matériaux (uniquement si on a remporté l'avance atomique) ---
  const lootMap: Record<string, number> = {};
  if (advanceWon) {
    for (const drop of run.loot) lootMap[drop.resource] = drop.amount;
    await addResources(admin, user.id, lootMap);
  }

  // --- Persistance de la montée (service_role, bypass RLS) ---
  const { data: inserted } = await admin
    .from('tower_runs')
    .insert({
      player_id: user.id,
      hero_id: hero.id,
      seed,
      from_floor: run.fromFloor,
      reached_floor: run.reachedFloor,
      result: { fight_results: run.fightResults, loot: run.loot },
    })
    .select('id')
    .single();

  return json({
    run_id: inserted?.id ?? null,
    hero_id: hero.id,
    class_id: classId,
    seed,
    from_floor: run.fromFloor,
    reached_floor: run.reachedFloor,
    cleared_new: run.clearedNew,
    topped_out: run.toppedOut,
    // Si on a perdu la course atomique (autre onglet), on n'a rien crédité :
    // on renvoie l'état réel (butin vide, best_floor inchangé côté appelant).
    best_floor: advanceWon ? newBest : bestFloor,
    max_floor: TOWER_MAX_FLOOR,
    fight_results: run.fightResults,
    loot: advanceWon ? run.loot : [],
  });
});
