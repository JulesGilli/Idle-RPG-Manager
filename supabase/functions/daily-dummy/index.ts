// Edge Function : daily-dummy
// Activité journalière « Pantin d'entraînement ». L'équipe tape un mannequin qui
// ne riposte jamais pendant 50 tours ; le SCORE = total des dégâts infligés,
// converti en or (1×/jour). Calcul serveur (anti-triche), gate atomique CAS
// sur last_day (anti multi-onglets — cf. anti-multitab-hardening).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resolveCombat } from '@shared/combat/resolveCombat.ts';
import type { CombatantInput } from '@shared/combat/index.ts';
import { buildHeroSnapshot, type HeroSnapshotInput } from '@shared/progression/heroLoan.ts';
import { computeSetBonuses } from '@shared/progression/sets.ts';
import { buildPantin, pantinScore, pantinReward, PANTIN_ROUNDS } from '@shared/progression/pantin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PANTIN_MAX_TEAM = 5;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
type Admin = any;
type Body = { action?: unknown; hero_ids?: unknown };

const HERO_SELECT =
  'id, name, class_id, level, owner_id, alloc_hp, alloc_atk, alloc_def, alloc_speed, skills, ' +
  'active_skill_id, ultimate_skill_id, ' +
  'bonus_hp, bonus_atk, bonus_def, bonus_speed, ' +
  'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed), ' +
  'weapon:items!heroes_equipped_weapon_id_fkey(name, atk_bonus, def_bonus, hp_bonus, set_id, blessing_level), ' +
  'armor:items!heroes_equipped_armor_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), ' +
  'jewel:items!heroes_equipped_jewel_id_fkey(atk_bonus, def_bonus, hp_bonus, passive_type, passive_value, set_id), ' +
  'relic:items!heroes_equipped_relic_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), rune:runes!heroes_rune_id_fkey(set_id)';

// deno-lint-ignore no-explicit-any
function toSnapshotInput(h: any): HeroSnapshotInput {
  const cls = h.cls;
  const sum = (k: string) =>
    (h.weapon?.[k] ?? 0) + (h.armor?.[k] ?? 0) + (h.jewel?.[k] ?? 0) + (h.relic?.[k] ?? 0);
  const setIds = [h.weapon?.set_id, h.armor?.set_id, h.jewel?.set_id, h.relic?.set_id];
  const setB = computeSetBonuses(setIds, h.class_id);
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
    weapon: h.weapon ? { name: h.weapon.name, blessingLevel: h.weapon.blessing_level ?? 0 } : null,
    runeSetId: h.rune?.set_id ?? null,
    skills: (h.skills ?? {}) as Record<string, number>,
    loadout: { activeId: h.active_skill_id ?? null, ultimateId: h.ultimate_skill_id ?? null },
    setIds,
  };
}

async function buildTeam(admin: Admin, userId: string, heroIds: string[]): Promise<CombatantInput[]> {
  const { data: rows } = await admin.from('heroes').select(HERO_SELECT).in('id', heroIds).eq('owner_id', userId);
  const byId = new Map<string, CombatantInput>();
  // deno-lint-ignore no-explicit-any
  for (const h of (rows ?? []) as any[]) byId.set(h.id, buildHeroSnapshot(toSnapshotInput(h)));
  return heroIds.map((id) => byId.get(id)).filter((c): c is CombatantInput => Boolean(c));
}

/** Jour courant (heure de Paris) — clé de renouvellement à minuit. */
function parisDay(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
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
    const { data: row } = await admin
      .from('pantin_runs')
      .select('last_day, best_score')
      .eq('player_id', user.id)
      .maybeSingle();
    return json({
      done_today: row?.last_day === today,
      best_score: row?.best_score ?? 0,
      rounds: PANTIN_ROUNDS,
    });
  }

  // --------------------------------------------------------------------- RUN
  if (body.action === 'run') {
    const heroIds = body.hero_ids;
    if (!Array.isArray(heroIds) || heroIds.some((h) => typeof h !== 'string')) {
      return json({ error: 'hero_ids invalide' }, 400);
    }
    const unique = [...new Set(heroIds as string[])];
    if (unique.length < 1 || unique.length > PANTIN_MAX_TEAM) {
      return json({ error: `Entre 1 et ${PANTIN_MAX_TEAM} héros` }, 400);
    }

    // Gate 1×/jour + réservation ATOMIQUE (CAS sur last_day) avant tout crédit.
    await admin
      .from('pantin_runs')
      .upsert({ player_id: user.id }, { onConflict: 'player_id', ignoreDuplicates: true });
    const { data: row } = await admin
      .from('pantin_runs')
      .select('last_day, best_score')
      .eq('player_id', user.id)
      .maybeSingle();
    if (row?.last_day === today) {
      return json({ error: 'Pantin déjà frappé aujourd’hui', done_today: true }, 409);
    }
    let reserveQ = admin
      .from('pantin_runs')
      .update({ last_day: today, updated_at: new Date().toISOString() })
      .eq('player_id', user.id);
    reserveQ = row?.last_day ? reserveQ.eq('last_day', row.last_day) : reserveQ.is('last_day', null);
    const { data: reserved } = await reserveQ.select('player_id');
    if (!reserved || reserved.length === 0) {
      return json({ error: 'Pantin déjà frappé aujourd’hui', done_today: true }, 409);
    }

    const team = await buildTeam(admin, user.id, unique);
    if (team.length !== unique.length) return json({ error: 'Héros non possédés' }, 403);

    const seed = Math.floor(Math.random() * 2_147_483_647);
    const combat = resolveCombat({ allies: team, enemies: [buildPantin()], seed, maxRounds: PANTIN_ROUNDS });
    const score = pantinScore(combat.finalState);
    const reward = pantinReward(score);

    // Crédit de l'or + mise à jour du meilleur score.
    const { data: profile } = await admin.from('profiles').select('gold').eq('id', user.id).single();
    await admin.from('profiles').update({ gold: (profile?.gold ?? 0) + reward.gold }).eq('id', user.id);
    const best = Math.max(row?.best_score ?? 0, score);
    await admin.from('pantin_runs').update({ best_score: best }).eq('player_id', user.id);

    return json({
      score,
      best_score: best,
      reward,
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
