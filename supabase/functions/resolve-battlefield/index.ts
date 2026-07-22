// Edge Function : resolve-battlefield
// CHAMPS DE BATAILLE (Arc 2) — batailles rangées 10 contre 10.
//
// Le joueur engage JUSQU'À 10 héros (contre 5 partout ailleurs) face à une armée
// de 10. Six batailles de difficulté croissante, débloquées séquentiellement.
// Chaque bataille a son PROPRE cooldown de `BATTLEFIELD_COOLDOWN_HOURS` (comme
// les donjons) — pas de quota quotidien global. La victoire paie une Poussière
// bénie FIXE — seule source de la matière de l'ARME divine.
//
// Anti-triche : combat résolu serveur, cooldown calculé sur l'HORLOGE SERVEUR.
// Anti multi-onglets / anti double-crédit : la tentative est RÉSERVÉE par le RPC
// atomique `try_start_battlefield` (compare-and-swap sur `last_run_at`) AVANT
// tout crédit — deux onglets simultanés ne peuvent pas tous les deux gagner
// la réservation.

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
  BATTLEFIELD_COOLDOWN_HOURS,
  BATTLEFIELD_DUST_REWARD,
  BATTLEFIELD_MAX_TEAM,
  battlefieldArmy,
  battlefieldBlocker,
  battlefieldById,
  battlefieldCooldownRemainingMs,
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
  cooldown: 'Cette bataille est encore en cooldown.',
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

/** Plus haut palier vaincu (déblocage séquentiel). */
async function highestClearedOf(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin
    .from('battlefield_progress')
    .select('highest_cleared')
    .eq('player_id', userId)
    .maybeSingle();
  return (data?.highest_cleared as number | undefined) ?? 0;
}

/** Dernière tentative par bataille (id → epoch ms), pour calculer le cooldown de CHACUNE. */
async function lastRunAtByBattlefield(admin: Admin, userId: string): Promise<Map<string, number>> {
  const { data } = await admin
    .from('battlefield_cooldowns')
    .select('battlefield_id, last_run_at')
    .eq('player_id', userId);
  const map = new Map<string, number>();
  for (const r of (data ?? []) as { battlefield_id: string; last_run_at: string }[]) {
    map.set(r.battlefield_id, Date.parse(r.last_run_at));
  }
  return map;
}

/** Dernière tentative sur CETTE bataille précise (epoch ms, null si jamais tentée). */
async function lastRunAtOf(admin: Admin, userId: string, battlefieldId: string): Promise<number | null> {
  const { data } = await admin
    .from('battlefield_cooldowns')
    .select('last_run_at')
    .eq('player_id', userId)
    .eq('battlefield_id', battlefieldId)
    .maybeSingle();
  return data?.last_run_at ? Date.parse(data.last_run_at as string) : null;
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
    const arc = await currentArcOf(admin, user.id);
    const highestCleared = await highestClearedOf(admin, user.id);
    const lastRunAt = await lastRunAtByBattlefield(admin, user.id);
    const now = Date.now();
    return json({
      arc,
      cooldown_hours: BATTLEFIELD_COOLDOWN_HOURS,
      dust_reward: BATTLEFIELD_DUST_REWARD,
      highest_cleared: highestCleared,
      max_team: BATTLEFIELD_MAX_TEAM,
      battlefields: BATTLEFIELDS.map((b) => ({
        id: b.id,
        idx: b.idx,
        name: b.name,
        flavor: b.flavor,
        gold: b.gold,
        unlocked: b.idx <= highestCleared + 1,
        cleared: b.idx <= highestCleared,
        cooldown_remaining_ms: battlefieldCooldownRemainingMs(lastRunAt.get(b.id) ?? null, now),
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
    const highestCleared = await highestClearedOf(admin, user.id);
    const lastRunAt = await lastRunAtOf(admin, user.id, def.id);
    const onCooldown = battlefieldCooldownRemainingMs(lastRunAt, Date.now()) > 0;

    // Verdict PARTAGÉ avec le front : même règle des deux côtés, pas de divergence.
    const block = battlefieldBlocker({
      arc,
      idx: def.idx,
      highestCleared,
      onCooldown,
      teamSize: unique.length,
    });
    if (block) {
      return json({ error: BLOCK_MESSAGE[block] ?? 'Bataille indisponible', block }, block === 'arc' ? 403 : 409);
    }

    // L'équipe est bâtie AVANT la réservation : un héros non possédé doit
    // échouer sans consommer le cooldown.
    const team = await buildTeam(admin, user.id, unique);
    if (team.length !== unique.length) return json({ error: 'Héros non possédés' }, 403);

    // --- RÉSERVATION ATOMIQUE de la tentative (anti multi-onglets) ---
    // `try_start_battlefield` ne met `last_run_at` à jour QUE si le cooldown de
    // CETTE bataille est expiré (compare-and-swap côté SQL) — deux onglets
    // simultanés ne peuvent pas tous les deux gagner la réservation.
    const { data: started, error: startError } = await admin.rpc('try_start_battlefield', {
      p_player: user.id,
      p_battlefield_id: def.id,
      p_cooldown_hours: BATTLEFIELD_COOLDOWN_HOURS,
    });
    if (startError || !started) {
      return json({ error: BLOCK_MESSAGE.cooldown, block: 'cooldown' }, 409);
    }

    const combat = resolveCombat({
      allies: team,
      enemies: battlefieldArmy(def, arc),
      seed: Math.floor(Math.random() * 2_147_483_647),
    });
    const won = combat.result === 'win';
    const reward = battlefieldReward(def, won);

    // --- Crédit du butin (après réservation réussie, donc au plus une fois) ---
    if (reward.dust > 0) {
      await admin.rpc('add_player_resource', {
        p_player: user.id,
        p_resource: divineMaterialFor('weapon').key, // poussiere_benie
        p_amount: reward.dust,
        p_tier: EVENT_MATERIAL_TIER,
      });
    }
    if (reward.gold > 0) {
      await admin.rpc('add_player_gold', { p_player: user.id, p_amount: reward.gold });
    }
    if (won) {
      await admin.rpc('bump_battlefield_progress', { p_player: user.id, p_idx: def.idx });
    }

    return json({
      won,
      reward,
      // Le cooldown s'applique que la bataille soit gagnée OU perdue.
      cooldown_remaining_ms: BATTLEFIELD_COOLDOWN_HOURS * 3_600_000,
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
