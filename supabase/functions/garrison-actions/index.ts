// Edge Function : garrison-actions
// Garnison de guilde. Actions :
//  - deposit  : le membre dépose UN de ses héros (snapshot figé). Remplace le
//               précédent le cas échéant (et réconcilie l'ancien).
//  - withdraw : retire le héros de la garnison ; RÉCONCILIE les déploiements des
//               AUTRES membres qui l'utilisent en farm (retrait du héros du
//               groupe ; suppression du groupe s'il devient vide).
//
// Le héros du propriétaire n'est jamais bloqué : le snapshot est une copie
// lecture seule (même modèle que hero_loans). Calcul serveur (anti-triche).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { buildHeroSnapshot, type HeroSnapshotInput } from '@shared/progression/heroLoan.ts';
import { computeSetBonuses } from '@shared/progression/sets.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = { action?: unknown; hero_id?: unknown };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
type Admin = any;

const HERO_SELECT =
  'id, name, class_id, level, owner_id, alloc_hp, alloc_atk, alloc_def, alloc_speed, skills, ' +
  'active_skill_id, ultimate_skill_id, ' +
  'bonus_hp, bonus_atk, bonus_def, bonus_speed, ' +
  'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed), ' +
  'weapon:items!heroes_equipped_weapon_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), ' +
  'armor:items!heroes_equipped_armor_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id), ' +
  'jewel:items!heroes_equipped_jewel_id_fkey(atk_bonus, def_bonus, hp_bonus, passive_type, passive_value, set_id), ' +
  'relic:items!heroes_equipped_relic_id_fkey(atk_bonus, def_bonus, hp_bonus, set_id)';

/** Ligne héros (DB) → ingrédients de snapshot (mêmes règles que le build normal). */
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

/** Guilde de l'appelant (ou null s'il n'en a pas). */
async function guildIdOf(admin: Admin, userId: string): Promise<string | null> {
  const { data } = await admin
    .from('guild_members')
    .select('guild_id')
    .eq('player_id', userId)
    .maybeSingle();
  return data?.guild_id ?? null;
}

/**
 * Retire un héros emprunté des déploiements des AUTRES joueurs (réconciliation du
 * farm auto). Ne touche JAMAIS les déploiements du propriétaire (utiliser son
 * propre héros n'est pas un emprunt). Renvoie le nombre de groupes affectés.
 */
async function reconcileWithdraw(admin: Admin, heroId: string, ownerId: string): Promise<number> {
  const { data: deps } = await admin
    .from('deployments')
    .select('id, player_id, hero_ids')
    .contains('hero_ids', [heroId]);
  let affected = 0;
  for (const dep of deps ?? []) {
    if (dep.player_id === ownerId) continue;
    const remaining = (dep.hero_ids as string[]).filter((h) => h !== heroId);
    if (remaining.length === 0) {
      await admin.from('deployments').delete().eq('id', dep.id);
    } else {
      await admin.from('deployments').update({ hero_ids: remaining }).eq('id', dep.id);
    }
    affected += 1;
  }
  return affected;
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
    return json({ error: 'Corps invalide' }, 400);
  }
  const action = body.action;

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const guildId = await guildIdOf(admin, user.id);
  if (!guildId) return json({ error: 'Tu dois être dans une guilde' }, 403);

  // -------------------------------------------------------------- DEPOSIT
  if (action === 'deposit') {
    const heroId = body.hero_id;
    if (typeof heroId !== 'string') return json({ error: 'hero_id invalide' }, 400);

    const { data: h } = await admin
      .from('heroes')
      .select(HERO_SELECT)
      .eq('id', heroId)
      .eq('owner_id', user.id)
      .maybeSingle();
    if (!h) return json({ error: 'Héros introuvable' }, 404);

    const snapshot = buildHeroSnapshot(toSnapshotInput(h));

    // Remplacement : si un AUTRE héros est déjà déposé, le réconcilier d'abord
    // (les emprunteurs cessent de l'utiliser).
    const { data: existing } = await admin
      .from('guild_garrison')
      .select('hero_id')
      .eq('owner_player_id', user.id)
      .maybeSingle();
    if (existing && existing.hero_id !== heroId) {
      await reconcileWithdraw(admin, existing.hero_id, user.id);
    }

    await admin.from('guild_garrison').upsert(
      {
        guild_id: guildId,
        owner_player_id: user.id,
        hero_id: heroId,
        hero_snapshot: snapshot,
        hero_name: h.name,
        hero_class_id: h.class_id,
        hero_level: h.level,
      },
      { onConflict: 'owner_player_id' },
    );

    await admin.from('guild_events').insert({
      guild_id: guildId,
      kind: 'garrison',
      actor_player_id: user.id,
      message: `${h.name} rejoint la garnison`,
    });

    return json({ ok: true });
  }

  // ------------------------------------------------------------- WITHDRAW
  if (action === 'withdraw') {
    const { data: existing } = await admin
      .from('guild_garrison')
      .select('hero_id, hero_name')
      .eq('owner_player_id', user.id)
      .maybeSingle();
    if (!existing) return json({ ok: true, reconciled: 0 });

    const reconciled = await reconcileWithdraw(admin, existing.hero_id, user.id);
    await admin.from('guild_garrison').delete().eq('owner_player_id', user.id);

    await admin.from('guild_events').insert({
      guild_id: guildId,
      kind: 'garrison',
      actor_player_id: user.id,
      message: `${existing.hero_name} quitte la garnison`,
    });

    return json({ ok: true, reconciled });
  }

  return json({ error: 'Action inconnue' }, 400);
});
