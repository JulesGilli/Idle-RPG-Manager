// Edge Function : admin-actions
// Commandes d'administration RÉSERVÉES à un seul joueur (ADMIN_ID), vérifié
// côté serveur. Permet de reroll les tavernes, forcer une recrue, donner de l'or
// ou des matériaux. Toute la logique de taverne réutilise /shared (déterminisme
// identique à la fonction `recruit`).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  rollTavernPool,
  hashSeed,
  recruitGrade,
  forcedTavernClasses,
  recruitQualityBonus,
  type Grade,
  type ClassBase,
} from '@shared/progression/recruit.ts';
import { normalizeCode, isValidCodeFormat, type RedeemReward } from '@shared/progression/redeem.ts';

// Seul ce joueur peut appeler ces commandes (gate serveur, pas cosmétique).
const ADMIN_ID = 'dfc646d3-f9c5-479e-8812-dca9d2265243';

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
type ClassRow = ClassBase & { name: string };

function parisDay(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

async function getEpoch(admin: Admin): Promise<number> {
  const { data } = await admin.from('app_config').select('value').eq('key', 'tavern_epoch').maybeSingle();
  return data ? parseInt(data.value, 10) || 0 : 0;
}

async function rosterSizeOf(admin: Admin, playerId: string): Promise<number> {
  const { data } = await admin.from('heroes').select('id').eq('owner_id', playerId);
  return (data ?? []).length;
}

/** Classes distinctes possédées (doit rester IDENTIQUE au calcul de recruit). */
async function ownedClassIdsOf(admin: Admin, playerId: string): Promise<string[]> {
  const { data } = await admin.from('heroes').select('class_id').eq('owner_id', playerId);
  return [...new Set((data ?? []).map((h: { class_id: string }) => h.class_id))];
}

/** Zones terminées (boss battus) — doit rester IDENTIQUE au calcul de recruit. */
async function zonesCompletedOf(admin: Admin, playerId: string): Promise<number> {
  const { data: bosses } = await admin.from('levels').select('id').eq('is_boss', true);
  const bossIds = new Set((bosses ?? []).map((l: { id: string }) => l.id));
  const { data: prog } = await admin.from('level_progress').select('level_id').eq('player_id', playerId);
  return (prog ?? []).filter((p: { level_id: string }) => bossIds.has(p.level_id)).length;
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
  if (user.id !== ADMIN_ID) return json({ error: 'Accès refusé' }, 403);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corps invalide' }, 400);
  }

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const action = body.action as string;

  // ------------------------------------------------------ REROLL DE TOUS
  if (action === 'reroll_all') {
    const epoch = (await getEpoch(admin)) + 1;
    await admin.from('app_config').upsert({ key: 'tavern_epoch', value: String(epoch) }, { onConflict: 'key' });
    // Nouveau pool → on libère tous les slots déjà engagés du jour.
    await admin.from('tavern_state').update({ claimed: [] }).gte('reroll', 0);
    return json({ ok: true, tavern_epoch: epoch });
  }

  // ------------------------------------------------- REROLL D'UN JOUEUR
  if (action === 'reroll_player') {
    const playerId = body.player_id as string;
    if (typeof playerId !== 'string') return json({ error: 'player_id requis' }, 400);
    const day = parisDay();
    const { data: ts } = await admin
      .from('tavern_state')
      .select('reroll')
      .eq('player_id', playerId)
      .maybeSingle();
    const reroll = ((ts?.reroll as number | undefined) ?? 0) + 1;
    await admin
      .from('tavern_state')
      .upsert({ player_id: playerId, day, claimed: [], reroll }, { onConflict: 'player_id' });
    return json({ ok: true, reroll });
  }

  // -------------------------------------------------- FORCER UNE RECRUE
  // Cherche un nonce (reroll) tel que le pool du joueur contienne la classe +
  // le grade demandés, puis le fixe. Le joueur verra la recrue dans sa taverne.
  if (action === 'force_recruit') {
    const playerId = body.player_id as string;
    const classId = body.class_id as string;
    const grade = body.grade as Grade;
    if (typeof playerId !== 'string' || typeof classId !== 'string' || typeof grade !== 'string') {
      return json({ error: 'player_id, class_id et grade requis' }, 400);
    }

    const { data: classesData } = await admin
      .from('hero_classes')
      .select('id, name, base_hp, base_atk, base_def, base_speed');
    const classes = (classesData ?? []) as ClassRow[];
    const cls = classes.find((c) => c.id === classId);
    if (!cls) return json({ error: 'Classe inconnue' }, 400);
    const clsMap = new Map(classes.map((c) => [c.id, c]));

    const day = parisDay();
    const epoch = await getEpoch(admin);
    const rosterSize = await rosterSizeOf(admin, playerId);
    const ownedClassIds = await ownedClassIdsOf(admin, playerId);
    const forced = forcedTavernClasses(rosterSize, ownedClassIds, classes.map((c) => c.id));
    const qualityBonus = recruitQualityBonus(await zonesCompletedOf(admin, playerId));

    let hit: { nonce: number; slot: number } | null = null;
    for (let n = 1; n <= 8000; n++) {
      const pool = rollTavernPool(hashSeed(playerId, day, epoch, n), classes, forced, qualityBonus);
      const match = pool.find(
        (c) => c.class_id === classId && recruitGrade(c.bonuses, clsMap.get(c.class_id)!) === grade,
      );
      if (match) {
        hit = { nonce: n, slot: match.slot };
        break;
      }
    }
    if (!hit) return json({ error: `Aucun ${classId} ${grade} trouvé en 8000 essais` }, 404);

    await admin
      .from('tavern_state')
      .upsert({ player_id: playerId, day, claimed: [], reroll: hit.nonce }, { onConflict: 'player_id' });
    return json({ ok: true, slot: hit.slot, tries: hit.nonce });
  }

  // ------------------------------------------------------------ DONNER OR
  if (action === 'give_gold') {
    const playerId = body.player_id as string;
    const amount = Number(body.amount);
    if (typeof playerId !== 'string' || !Number.isFinite(amount)) {
      return json({ error: 'player_id et amount requis' }, 400);
    }
    const { data: p } = await admin.from('profiles').select('gold').eq('id', playerId).single();
    if (!p) return json({ error: 'Joueur introuvable' }, 404);
    const gold = Math.max(0, (p.gold ?? 0) + Math.round(amount));
    await admin.from('profiles').update({ gold }).eq('id', playerId);
    return json({ ok: true, gold });
  }

  // ------------------------------------------------------ DONNER MATÉRIAU
  if (action === 'give_material') {
    const playerId = body.player_id as string;
    const resource = body.resource as string;
    const amount = Number(body.amount);
    if (typeof playerId !== 'string' || typeof resource !== 'string' || !Number.isFinite(amount)) {
      return json({ error: 'player_id, resource et amount requis' }, 400);
    }
    const { data: row } = await admin
      .from('player_resources')
      .select('amount')
      .eq('player_id', playerId)
      .eq('resource', resource)
      .maybeSingle();
    const next = Math.max(0, (row?.amount ?? 0) + Math.round(amount));
    await admin
      .from('player_resources')
      .upsert({ player_id: playerId, resource, amount: next }, { onConflict: 'player_id,resource' });
    return json({ ok: true, resource, amount: next });
  }

  // -------------------------------------------------- CRÉER UN CODE REDEEM
  if (action === 'create_redeem_code') {
    const raw = body.code;
    if (typeof raw !== 'string') return json({ error: 'code requis' }, 400);
    const code = normalizeCode(raw);
    if (!isValidCodeFormat(code)) {
      return json({ error: 'Code invalide (3–24 caractères alphanumériques)' }, 400);
    }
    const reward = (body.reward ?? {}) as RedeemReward;
    const hasReward =
      (reward.gold ?? 0) > 0 || (reward.materials?.length ?? 0) > 0 || reward.item === true;
    if (!hasReward) return json({ error: 'Récompense vide' }, 400);

    const maxUses =
      body.max_uses == null || body.max_uses === '' ? null : Math.max(1, Math.floor(Number(body.max_uses)));
    const expiresAt = typeof body.expires_at === 'string' && body.expires_at ? body.expires_at : null;

    await admin.from('redeem_codes').upsert(
      { code, reward, max_uses: maxUses, expires_at: expiresAt, active: true, uses: 0 },
      { onConflict: 'code' },
    );
    return json({ ok: true, code, reward, max_uses: maxUses });
  }

  return json({ error: 'Action inconnue' }, 400);
});
