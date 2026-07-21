// Edge Function : resolve-battlefield
// CHAMPS DE BATAILLE (Arc 2) — batailles rangées 10 contre 10.
//
// Le joueur engage JUSQU'À 10 héros (contre 5 partout ailleurs) face à une armée
// de 10. Six batailles de difficulté croissante, débloquées séquentiellement.
// Quota de 4 sorties par JOUR, toutes batailles confondues. La victoire paie en
// Poussière bénie — seule source de la matière de l'ARMURE divine.
//
// Anti-triche : combat résolu serveur, jour calculé sur l'HORLOGE SERVEUR.
// Anti multi-onglets : la sortie est RÉSERVÉE par un insert sur
// (player_id, run_day, slot) — clé primaire — AVANT tout crédit. Deux onglets
// simultanés calculent le même slot ; le second se prend un 23505 et repart
// bredouille (cf. anti-multitab-hardening).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { checkTeamClasses, tooManySameClassError, MAX_SAME_CLASS_LARGE } from '@shared/progression/teamComposition.ts';
import { resolveCombat } from '@shared/combat/resolveCombat.ts';
import type { CombatantInput } from '@shared/combat/index.ts';
import { buildHeroSnapshot, itemCombatPassive, type HeroSnapshotInput } from '@shared/progression/heroLoan.ts';
import { computeSetBonuses, equippedSetTier } from '@shared/progression/sets.ts';
import { combatBuff, NO_COMBAT_BUFF, type GuildAlloc } from '@shared/progression/guildSkills.ts';
import { EVENT_MATERIAL_TIER, divineMaterialFor } from '@shared/progression/eventMaterials.ts';
import {
  BATTLEFIELDS,
  BATTLEFIELD_ARC,
  BATTLEFIELD_DAILY_CAP,
  BATTLEFIELD_MAX_TEAM,
  battlefieldArmy,
  battlefieldBlocker,
  battlefieldById,
  battlefieldReward,
} from '@shared/progression/battlefield.ts';

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
type Body = { action?: unknown; battlefield_id?: unknown; hero_ids?: unknown };

/** Message joueur pour chaque refus (le verdict lui-même vient du module partagé). */
const BLOCK_MESSAGE: Record<string, string> = {
  arc: 'Les champs de bataille n’ouvrent qu’à l’Arc 2.',
  locked: 'Remporte la bataille précédente pour débloquer celle-ci.',
  daily_cap: 'Tu as épuisé tes sorties du jour.',
  no_heroes: 'Engage au moins un héros.',
};

const HERO_SELECT =
  'id, name, class_id, level, owner_id, alloc_hp, alloc_atk, alloc_def, alloc_speed, skills, ' +
  'active_skill_id, ultimate_skill_id, ' +
  'bonus_hp, bonus_atk, bonus_def, bonus_speed, ' +
  'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed), ' +
  'weapon:items!heroes_equipped_weapon_id_fkey(name, atk_bonus, def_bonus, hp_bonus, set_id, blessing_level, passive_type, passive_value, tier), ' +
  'armor:items!heroes_equipped_armor_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id, passive_type, passive_value, tier), ' +
  'jewel:items!heroes_equipped_jewel_id_fkey(atk_bonus, def_bonus, hp_bonus, passive_type, passive_value, set_id, tier), ' +
  'relic:items!heroes_equipped_relic_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id, passive_type, passive_value, tier), rune:runes!heroes_rune_id_fkey(set_id)';

// deno-lint-ignore no-explicit-any
function toSnapshotInput(h: any): HeroSnapshotInput {
  const cls = h.cls;
  const sum = (k: string) =>
    (h.weapon?.[k] ?? 0) + (h.armor?.[k] ?? 0) + (h.jewel?.[k] ?? 0) + (h.relic?.[k] ?? 0);
  const setIds = [h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id];
  const setB = computeSetBonuses(setIds, h.class_id, equippedSetTier([h.weapon, h.armor, h.jewel, h.relic]));
  return {
    id: h.id,
    name: h.name,
    classId: h.class_id,
    level: h.level,
    classBase: { hp: cls.base_hp, atk: cls.base_atk, def: cls.base_def, speed: cls.base_speed },
    innate: { hp: h.bonus_hp ?? 0, atk: h.bonus_atk ?? 0, def: h.bonus_def ?? 0, speed: h.bonus_speed ?? 0 },
    alloc: { hp: h.alloc_hp, atk: h.alloc_atk, def: h.alloc_def, speed: h.alloc_speed },
    equipment: { atk: sum('atk_bonus') + setB.atk, def: sum('def_bonus') + setB.def, hp: sum('hp_bonus') + setB.hp },
    jewelPassive: itemCombatPassive(h.jewel),
    weaponPassive: itemCombatPassive(h.weapon),
    relicPassive: itemCombatPassive(h.relic),
    armorPassive: itemCombatPassive(h.armor),
    weapon: h.weapon ? { name: h.weapon.name, blessingLevel: h.weapon.blessing_level ?? 0 } : null,
    runeSetId: h.rune?.set_id ?? null,
    skills: (h.skills ?? {}) as Record<string, number>,
    loadout: { activeId: h.active_skill_id ?? null, ultimateId: h.ultimate_skill_id ?? null },
    setIds,
  };
}

/** Buff de combat de l'arbre de guilde de l'appelant (neutre si sans guilde). */
async function guildBuffOf(admin: Admin, userId: string) {
  const { data: mem } = await admin.from('guild_members').select('guild_id').eq('player_id', userId).maybeSingle();
  if (!mem?.guild_id) return NO_COMBAT_BUFF;
  const { data: g } = await admin.from('guilds').select('skill_alloc').eq('id', mem.guild_id).single();
  return combatBuff((g?.skill_alloc ?? {}) as GuildAlloc);
}

async function buildTeam(
  admin: Admin,
  userId: string,
  heroIds: string[],
): Promise<CombatantInput[]> {
  const { data: rows } = await admin.from('heroes').select(HERO_SELECT).in('id', heroIds).eq('owner_id', userId);
  const buff = await guildBuffOf(admin, userId);
  const byId = new Map<string, CombatantInput>();
  // deno-lint-ignore no-explicit-any
  for (const h of (rows ?? []) as any[]) byId.set(h.id, buildHeroSnapshot(toSnapshotInput(h), buff));
  return heroIds.map((id) => byId.get(id)).filter((c): c is CombatantInput => Boolean(c));
}

/** Arc courant du joueur (1 par défaut). */
async function currentArcOf(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin
    .from('player_arc')
    .select('current_arc')
    .eq('player_id', userId)
    .maybeSingle();
  return Math.max(1, (data?.current_arc as number | undefined) ?? 1);
}

/** Jour courant (heure de Paris) — clé de renouvellement du quota à minuit. */
function parisDay(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

/** Sorties du jour + plus haut palier vaincu (les deux états qui pilotent l'écran). */
async function progressOf(
  admin: Admin,
  userId: string,
  today: string,
): Promise<{ usedToday: number; highestCleared: number; usedSlots: number[] }> {
  const { data: todayRows } = await admin
    .from('battlefield_runs')
    .select('slot')
    .eq('player_id', userId)
    .eq('run_day', today);
  const { data: bestRow } = await admin
    .from('battlefield_runs')
    .select('battlefield_idx')
    .eq('player_id', userId)
    .eq('won', true)
    .order('battlefield_idx', { ascending: false })
    .limit(1)
    .maybeSingle();
  const usedSlots = ((todayRows ?? []) as { slot: number }[]).map((r) => r.slot);
  return {
    usedToday: usedSlots.length,
    highestCleared: (bestRow?.battlefield_idx as number | undefined) ?? 0,
    usedSlots,
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
  const today = parisDay();

  // ------------------------------------------------------------------ STATUS
  if (body.action === 'status') {
    const arc = await currentArcOf(admin, user.id);
    const { usedToday, highestCleared } = await progressOf(admin, user.id, today);
    return json({
      arc,
      used_today: usedToday,
      daily_cap: BATTLEFIELD_DAILY_CAP,
      highest_cleared: highestCleared,
      max_team: BATTLEFIELD_MAX_TEAM,
      battlefields: BATTLEFIELDS.map((b) => ({
        id: b.id,
        idx: b.idx,
        name: b.name,
        flavor: b.flavor,
        dust: b.dust,
        gold: b.gold,
        unlocked: b.idx <= highestCleared + 1,
        cleared: b.idx <= highestCleared,
      })),
    });
  }

  // --------------------------------------------------------------------- RUN
  if (body.action === 'run') {
    const def = typeof body.battlefield_id === 'string' ? battlefieldById(body.battlefield_id) : undefined;
    if (!def) return json({ error: 'Champ de bataille inconnu' }, 400);

    const heroIds = body.hero_ids;
    if (!Array.isArray(heroIds) || heroIds.some((h) => typeof h !== 'string')) {
      return json({ error: 'hero_ids invalide' }, 400);
    }
    const unique = [...new Set(heroIds as string[])];
    if (unique.length > BATTLEFIELD_MAX_TEAM) {
      return json({ error: `${BATTLEFIELD_MAX_TEAM} héros au maximum` }, 400);
    }

    // Plafond de doublons de classe DOUBLÉ ici : l'équipe fait 10 héros, garder
    // 2 imposerait au moins cinq classes distinctes. Contrôlé avant la
    // réservation de la sortie, comme le reste des refus.
    {
      const { data: classRows } = await admin
        .from('heroes')
        .select('class_id')
        .in('id', unique)
        .eq('owner_id', user.id);
      const check = checkTeamClasses(
        (classRows ?? []).map((r: { class_id: string }) => r.class_id),
        MAX_SAME_CLASS_LARGE,
      );
      if (!check.ok) return json({ error: tooManySameClassError(check.limit) }, 400);
    }

    const arc = await currentArcOf(admin, user.id);
    const { usedToday, highestCleared, usedSlots } = await progressOf(admin, user.id, today);

    // Verdict PARTAGÉ avec le front : même règle des deux côtés, pas de divergence.
    const block = battlefieldBlocker({
      arc,
      idx: def.idx,
      highestCleared,
      usedToday,
      teamSize: unique.length,
    });
    if (block) {
      return json(
        { error: BLOCK_MESSAGE[block] ?? 'Bataille indisponible', block, used_today: usedToday },
        block === 'arc' ? 403 : 409,
      );
    }

    // L'équipe est bâtie AVANT la réservation : un héros non possédé doit
    // échouer sans consommer une sortie.
    const team = await buildTeam(admin, user.id, unique);
    if (team.length !== unique.length) return json({ error: 'Héros non possédés' }, 403);

    // --- RÉSERVATION ATOMIQUE de la sortie (anti multi-onglets) ---
    // Premier slot libre de la journée ; la clé primaire (player_id, run_day, slot)
    // tranche les courses. On insère AVANT de résoudre : une sortie réservée puis
    // perdue vaut mieux qu'un butin crédité deux fois.
    const taken = new Set(usedSlots);
    let slot = 0;
    for (let s = 1; s <= BATTLEFIELD_DAILY_CAP; s++) {
      if (!taken.has(s)) {
        slot = s;
        break;
      }
    }
    if (slot === 0) return json({ error: BLOCK_MESSAGE.daily_cap, block: 'daily_cap' }, 409);

    const combat = resolveCombat({
      allies: team,
      enemies: battlefieldArmy(def, arc),
      seed: Math.floor(Math.random() * 2_147_483_647),
    });
    const won = combat.result === 'win';
    const reward = battlefieldReward(def, won);

    const { error: reserveError } = await admin.from('battlefield_runs').insert({
      player_id: user.id,
      run_day: today,
      slot,
      battlefield_id: def.id,
      battlefield_idx: def.idx,
      won,
      dust: reward.dust,
      gold: reward.gold,
    });
    // 23505 = un autre onglet a pris le slot en même temps : on ne crédite rien.
    if (reserveError) {
      return json({ error: BLOCK_MESSAGE.daily_cap, block: 'daily_cap' }, 409);
    }

    // --- Crédit du butin (après réservation réussie, donc au plus une fois) ---
    if (reward.dust > 0) {
      await admin.rpc('add_player_resource', {
        p_player: user.id,
        p_resource: divineMaterialFor('armor').key, // poussiere_benie
        p_amount: reward.dust,
        p_tier: EVENT_MATERIAL_TIER,
      });
    }
    if (reward.gold > 0) {
      await admin.rpc('add_player_gold', { p_player: user.id, p_amount: reward.gold });
    }

    return json({
      won,
      reward,
      used_today: usedToday + 1,
      daily_cap: BATTLEFIELD_DAILY_CAP,
      highest_cleared: won ? Math.max(highestCleared, def.idx) : highestCleared,
      combat: {
        rounds: combat.rounds,
        events: combat.events,
        final_state: combat.finalState,
        result: combat.result,
      },
    });
  }

  return json({ error: 'Action inconnue' }, 400);
});
