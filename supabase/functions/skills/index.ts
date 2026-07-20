// Edge Function : skills
// Bibliothèque du Savoir — dépense d'un point de compétence dans l'arbre de la
// classe du héros. Validation config-aware CÔTÉ SERVEUR (anti-triche : la table
// heroes est SELECT-only pour le client, toute mutation passe ici).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  validateLearn,
  validateSelect,
  allNodes,
  applySkillDelta,
  type LearnedSkills,
  type SkillDelta,
} from '@shared/progression/skills.ts';
import { recruitGrade } from '@shared/progression/recruit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = {
  action?: unknown;
  hero_id?: unknown;
  node_id?: unknown;
  delta?: unknown;
  slot?: unknown;
};

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

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ------------------------------------------------------------------- LEARN
  if (body.action === 'learn') {
    if (typeof body.hero_id !== 'string') return json({ error: 'hero_id invalide' }, 400);
    if (typeof body.node_id !== 'string') return json({ error: 'node_id invalide' }, 400);

    const { data: hero } = await admin
      .from('heroes')
      .select(
        'id, class_id, skill_points, skills, active_skill_id, ultimate_skill_id, ' +
          'bonus_hp, bonus_atk, bonus_def, bonus_speed, ' +
          'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed)',
      )
      .eq('id', body.hero_id)
      .eq('owner_id', user.id)
      .maybeSingle();
    if (!hero) return json({ error: 'Héros non possédé' }, 403);

    if ((hero.skill_points ?? 0) <= 0) return json({ error: 'Aucun point de compétence' }, 400);

    // Grade (rareté) recalculé serveur depuis les bonus de naissance → plafonne le
    // nombre de compétences distinctes (V2). Anti-triche : jamais fait côté client.
    const cls = hero.cls as
      | { base_hp: number; base_atk: number; base_def: number; base_speed: number }
      | null;
    const grade = cls
      ? recruitGrade(
          {
            bonus_hp: hero.bonus_hp ?? 0,
            bonus_atk: hero.bonus_atk ?? 0,
            bonus_def: hero.bonus_def ?? 0,
            bonus_speed: hero.bonus_speed ?? 0,
          },
          { id: hero.class_id, ...cls },
        )
      : undefined;

    const learned = (hero.skills ?? {}) as LearnedSkills;
    const check = validateLearn(hero.class_id, learned, body.node_id, grade);
    if (!check.ok) return json({ error: check.reason ?? 'Achat impossible' }, 400);

    const nextSkills: LearnedSkills = {
      ...learned,
      [body.node_id]: (learned[body.node_id] ?? 0) + 1,
    };

    // Auto-équipe le premier actif/ultime appris pour que le héros ait toujours
    // un actif + un ultime prêts sans passer par un choix manuel.
    const node = allNodes(hero.class_id).find((n) => n.id === body.node_id);
    const patch: Record<string, unknown> = {
      skills: nextSkills,
      skill_points: hero.skill_points - 1,
    };
    if (node?.slot === 'active' && !hero.active_skill_id) patch.active_skill_id = body.node_id;
    if (node?.slot === 'ultimate' && !hero.ultimate_skill_id) patch.ultimate_skill_id = body.node_id;

    await admin.from('heroes').update(patch).eq('id', hero.id).eq('owner_id', user.id);

    return json({ ok: true, skills: nextSkills, skill_points: hero.skill_points - 1 });
  }

  // ------------------------------------------------------------- LEARN BATCH
  // Mode ÉDITION : le joueur place tous ses points en local, on valide en UN
  // appel. Le client envoie un DELTA (nœud → rangs ajoutés) et jamais son état
  // absolu : sinon un onglet périmé écraserait des points gagnés entre-temps, et
  // un client malveillant s'inventerait des rangs.
  if (body.action === 'learn_batch') {
    if (typeof body.hero_id !== 'string') return json({ error: 'hero_id invalide' }, 400);
    const delta = body.delta as Record<string, unknown> | undefined;
    if (!delta || typeof delta !== 'object' || Array.isArray(delta)) {
      return json({ error: 'delta invalide' }, 400);
    }
    const clean: SkillDelta = {};
    for (const [k, v] of Object.entries(delta)) {
      if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
        return json({ error: 'delta invalide' }, 400);
      }
      clean[k] = v;
    }

    const { data: hero } = await admin
      .from('heroes')
      .select(
        'id, class_id, skill_points, skills, active_skill_id, ultimate_skill_id, ' +
          'bonus_hp, bonus_atk, bonus_def, bonus_speed, ' +
          'cls:hero_classes!heroes_class_id_fkey(base_hp, base_atk, base_def, base_speed)',
      )
      .eq('id', body.hero_id)
      .eq('owner_id', user.id)
      .maybeSingle();
    if (!hero) return json({ error: 'Héros non possédé' }, 403);

    const cls = hero.cls as
      | { base_hp: number; base_atk: number; base_def: number; base_speed: number }
      | null;
    const grade = cls
      ? recruitGrade(
          {
            bonus_hp: hero.bonus_hp ?? 0,
            bonus_atk: hero.bonus_atk ?? 0,
            bonus_def: hero.bonus_def ?? 0,
            bonus_speed: hero.bonus_speed ?? 0,
          },
          { id: hero.class_id, ...cls },
        )
      : undefined;

    const learned = (hero.skills ?? {}) as LearnedSkills;
    const points = hero.skill_points ?? 0;
    // Rejoué rang par rang depuis l'état SERVEUR, avec les règles unitaires.
    const applied = applySkillDelta(hero.class_id, learned, clean, points, grade);
    if (!applied.ok) return json({ error: applied.reason }, 400);

    const patch: Record<string, unknown> = {
      skills: applied.skills,
      skill_points: points - applied.spent,
    };
    // Même auto-équipement qu'à l'unité : le premier actif/ultime appris du lot
    // remplit le slot s'il est vide.
    for (const nodeId of Object.keys(clean)) {
      const node = allNodes(hero.class_id).find((n) => n.id === nodeId);
      if (node?.slot === 'active' && !hero.active_skill_id && !patch.active_skill_id) {
        patch.active_skill_id = nodeId;
      }
      if (node?.slot === 'ultimate' && !hero.ultimate_skill_id && !patch.ultimate_skill_id) {
        patch.ultimate_skill_id = nodeId;
      }
    }

    // Garde de concurrence : on n'écrit QUE si le solde de points n'a pas bougé
    // depuis la lecture. Deux onglets qui valident en même temps dépenseraient
    // sinon deux fois le même budget. `select` + longueur pour savoir si la
    // ligne a bien été touchée — l'update ne remontait aucune erreur jusqu'ici.
    const { data: updated, error: upErr } = await admin
      .from('heroes')
      .update(patch)
      .eq('id', hero.id)
      .eq('owner_id', user.id)
      .eq('skill_points', points)
      .select('id');
    if (upErr) return json({ error: upErr.message }, 500);
    if (!updated || updated.length === 0) {
      return json(
        { error: 'Tes points ont changé entre-temps — recharge et recommence.' },
        409,
      );
    }

    return json({ ok: true, skills: applied.skills, skill_points: points - applied.spent });
  }

  // ------------------------------------------------------------------ SELECT
  // Équipe l'actif OU l'ultime à activer (un seul de chaque). Le nœud doit être
  // appris et du bon slot (validé côté serveur).
  if (body.action === 'select') {
    if (typeof body.hero_id !== 'string') return json({ error: 'hero_id invalide' }, 400);
    if (body.slot !== 'active' && body.slot !== 'ultimate')
      return json({ error: 'slot invalide' }, 400);
    if (typeof body.node_id !== 'string' && body.node_id !== null)
      return json({ error: 'node_id invalide' }, 400);

    const { data: hero } = await admin
      .from('heroes')
      .select('id, class_id, skills')
      .eq('id', body.hero_id)
      .eq('owner_id', user.id)
      .maybeSingle();
    if (!hero) return json({ error: 'Héros non possédé' }, 403);

    const learned = (hero.skills ?? {}) as LearnedSkills;
    const nodeId = (body.node_id ?? null) as string | null;
    const check = validateSelect(hero.class_id, learned, body.slot, nodeId);
    if (!check.ok) return json({ error: check.reason ?? 'Équipement impossible' }, 400);

    const column = body.slot === 'active' ? 'active_skill_id' : 'ultimate_skill_id';
    await admin
      .from('heroes')
      .update({ [column]: nodeId })
      .eq('id', hero.id)
      .eq('owner_id', user.id);

    return json({ ok: true, slot: body.slot, node_id: nodeId });
  }

  return json({ error: 'Action inconnue' }, 400);
});
