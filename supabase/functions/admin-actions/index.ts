// Edge Function : admin-actions
// Commandes d'administration RÉSERVÉES aux joueurs listés dans
// `app_config.admin_ids`, vérifié côté serveur. Permet de reroll les tavernes,
// forcer une recrue, donner de l'or ou des matériaux. Toute la logique de
// taverne réutilise /shared (déterminisme identique à la fonction `recruit`).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  rollTavernPool,
  hashSeed,
  recruitGrade,
  forcedTavernClasses,
  recruitQualityBonus,
  tavernDayKey,
  type Grade,
  type ClassBase,
} from '@shared/progression/recruit.ts';
import { normalizeCode, isValidCodeFormat, type RedeemReward } from '@shared/progression/redeem.ts';
import {
  getBase,
  getMaterialTier,
  craftItemAtRarity,
  weaponPassiveFor,
  zoneBossMaterial,
  effectiveBonus,
  UPGRADE_MAX,
} from '@shared/progression/forge.ts';
import { getRelicBase, craftRelicAtRarity } from '@shared/progression/relic.ts';
import { getGem, craftJewelAtRarity, refinedJewelPct } from '@shared/progression/jewelry.ts';
import { setPieceById, craftSetPieceStats, SETS } from '@shared/progression/sets.ts';
import { BLESSING_MAX } from '@shared/progression/blessing.ts';
import type { Rarity } from '@shared/progression/loot.ts';
import { applyXpGain, SKILL_POINTS_PER_LEVEL } from '@shared/progression/formulas.ts';
import { accountXpFromHeroXp } from '@shared/progression/account.ts';

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

/** Entier borné, tolérant à une saisie absente ou farfelue venant du panneau. */
function clampInt(v: unknown, lo: number, hi: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/** Doit rester STRICTEMENT identique à `recruit` : même clé, même pool. */
function parisDay(): string {
  return tavernDayKey(Date.now());
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

/** Arc courant du joueur (1 par défaut). Pilote le tier de loot + le scaling. */
async function currentArcOf(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin
    .from('player_arc')
    .select('current_arc')
    .eq('player_id', userId)
    .maybeSingle();
  return Math.max(1, (data?.current_arc as number | undefined) ?? 1);
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

  const admin: Admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: adminCfg } = await admin.from('app_config').select('value').eq('key', 'admin_ids').maybeSingle();
  const adminIds: string[] = JSON.parse(adminCfg?.value ?? '[]');
  if (!adminIds.includes(user.id)) return json({ error: 'Accès refusé' }, 403);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corps invalide' }, 400);
  }

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
    const tier = await currentArcOf(admin, playerId);
    const { data: row } = await admin
      .from('player_resources')
      .select('amount')
      .eq('player_id', playerId)
      .eq('resource', resource)
      .eq('tier', tier)
      .maybeSingle();
    const next = Math.max(0, (row?.amount ?? 0) + Math.round(amount));
    await admin
      .from('player_resources')
      .upsert({ player_id: playerId, resource, amount: next, tier }, { onConflict: 'player_id,resource,tier' });
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

  // ------------------------------------------------------ OFFRIR UN OBJET
  // Donne un objet au joueur : arme/armure (forge), relique OU bijou, selon `kind`.
  // Toujours : composant de zone (material_id) × rareté imposée.
  //   kind 'forge' (défaut) → base_id (modèle d'arme/armure)
  //   kind 'relic'          → relic_base_id (modèle de relique)
  //   kind 'jewel'          → gem_id (gemme = type de passif)
  // ---------------------------------------------------------- LISTE JOUEURS
  // La RLS de `profiles` est « select own » : le client ne peut voir personne
  // d'autre. Cette action est donc le SEUL moyen d'obtenir un annuaire complet
  // (hors ligne compris), avec de quoi trier sans ouvrir chaque fiche.
  if (action === 'list_players') {
    const { data: profs } = await admin
      .from('profiles')
      .select('id, display_name, gold, account_xp, created_at, title')
      .order('account_xp', { ascending: false });
    const players = (profs ?? []) as Record<string, unknown>[];
    const ids = players.map((p) => p.id as string);

    // Agrégats en 3 requêtes groupées plutôt qu'en N+1 par joueur : le panneau
    // doit rester utilisable avec quelques centaines de comptes.
    const [{ data: heroes }, { data: items }, { data: arcs }] = await Promise.all([
      admin.from('heroes').select('owner_id, level').in('owner_id', ids),
      admin.from('items').select('owner_id').in('owner_id', ids),
      admin.from('player_arc').select('player_id, current_arc').in('player_id', ids),
    ]);
    const heroCount = new Map<string, number>();
    const heroMax = new Map<string, number>();
    for (const h of (heroes ?? []) as { owner_id: string; level: number }[]) {
      heroCount.set(h.owner_id, (heroCount.get(h.owner_id) ?? 0) + 1);
      heroMax.set(h.owner_id, Math.max(heroMax.get(h.owner_id) ?? 0, h.level));
    }
    const itemCount = new Map<string, number>();
    for (const i of (items ?? []) as { owner_id: string }[]) {
      itemCount.set(i.owner_id, (itemCount.get(i.owner_id) ?? 0) + 1);
    }
    const arcOf = new Map<string, number>();
    for (const a of (arcs ?? []) as { player_id: string; current_arc: number }[]) {
      arcOf.set(a.player_id, a.current_arc);
    }

    return json({
      players: players.map((p) => ({
        id: p.id,
        display_name: p.display_name,
        title: p.title,
        gold: p.gold,
        account_xp: p.account_xp,
        created_at: p.created_at,
        heroes: heroCount.get(p.id as string) ?? 0,
        max_level: heroMax.get(p.id as string) ?? 0,
        items: itemCount.get(p.id as string) ?? 0,
        arc: arcOf.get(p.id as string) ?? 1,
      })),
    });
  }

  // ------------------------------------------------------- FICHE D'UN JOUEUR
  // Roster complet + équipement porté + inventaire + ressources + progression.
  if (action === 'inspect_player') {
    const playerId = body.player_id as string;
    if (typeof playerId !== 'string') return json({ error: 'player_id requis' }, 400);

    const [prof, heroesRes, itemsRes, resRes, arcRes, lvlRes, runsRes] = await Promise.all([
      admin.from('profiles').select('id, display_name, gold, account_xp, title, created_at').eq('id', playerId).maybeSingle(),
      admin
        .from('heroes')
        .select(
          'id, name, class_id, level, xp, awakened, skill_points, stat_points, skills, rune_id, ' +
            'bonus_hp, bonus_atk, bonus_def, bonus_speed, alloc_hp, alloc_atk, alloc_def, alloc_speed, ' +
            'equipped_weapon_id, equipped_armor_id, equipped_jewel_id, equipped_relic_id',
        )
        .eq('owner_id', playerId)
        .order('level', { ascending: false }),
      admin
        .from('items')
        .select(
          'id, name, item_type, rarity, weight, tier, upgrade_level, blessing_level, set_id, ' +
            'atk_bonus, def_bonus, hp_bonus, passive_type, passive_value, locked',
        )
        .eq('owner_id', playerId),
      admin.from('player_resources').select('resource, amount, tier').eq('player_id', playerId),
      admin.from('player_arc').select('current_arc, max_arc').eq('player_id', playerId).maybeSingle(),
      admin.from('level_progress').select('level_id').eq('player_id', playerId),
      admin.from('dungeon_runs').select('dungeon_type_id, success').eq('player_id', playerId),
    ]);

    if (!prof.data) return json({ error: 'Joueur introuvable' }, 404);

    // Équipement résolu ICI : le panneau reçoit des héros déjà « montés », il n'a
    // pas à recroiser les 4 ids avec l'inventaire pour afficher une fiche.
    const itemsById = new Map(
      ((itemsRes.data ?? []) as Record<string, unknown>[]).map((i) => [i.id as string, i]),
    );
    const heroes = ((heroesRes.data ?? []) as Record<string, unknown>[]).map((h) => ({
      ...h,
      weapon: itemsById.get(h.equipped_weapon_id as string) ?? null,
      armor: itemsById.get(h.equipped_armor_id as string) ?? null,
      jewel: itemsById.get(h.equipped_jewel_id as string) ?? null,
      relic: itemsById.get(h.equipped_relic_id as string) ?? null,
    }));

    const clearedDungeons = new Set(
      ((runsRes.data ?? []) as { dungeon_type_id: string; success: boolean }[])
        .filter((r) => r.success)
        .map((r) => r.dungeon_type_id),
    );

    return json({
      profile: prof.data,
      heroes,
      items: itemsRes.data ?? [],
      resources: resRes.data ?? [],
      arc: arcRes.data ?? { current_arc: 1, max_arc: 1 },
      levels_cleared: (lvlRes.data ?? []).length,
      dungeons_cleared: clearedDungeons.size,
    });
  }

  if (action === 'give_item') {
    const playerId = body.player_id as string;
    const kind = (body.kind as string) ?? 'forge';
    const materialId = body.material_id as string;
    const rarity = (body.rarity as Rarity) ?? 'ultimate';
    if (typeof playerId !== 'string' || typeof materialId !== 'string') {
      return json({ error: 'player_id et material_id requis' }, 400);
    }
    const mat = getMaterialTier(materialId);
    if (!mat) return json({ error: 'Composant (zone) inconnu' }, 400);

    let row: {
      item_type: string;
      name: string;
      rarity: Rarity;
      weight: string | null;
      atk_bonus: number;
      def_bonus: number;
      hp_bonus: number;
      passive_type: string | null;
      passive_value: number;
      set_id?: string | null;
    };

    if (kind === 'set') {
      // Pièce de SET : rareté toujours `ultimate` et stats propres (×1.6), donc
      // ni `rarity` ni `base_id` ne s'appliquent. C'est le seul `kind` qui écrit
      // `set_id` — sans lui, la pièce ne compte pas pour le bonus d'ensemble et
      // l'objet offert n'aurait aucun intérêt.
      const piece = setPieceById(body.set_piece_id as string);
      if (!piece) return json({ error: 'Pièce de set inconnue' }, 400);
      const set = SETS.find((s) => s.id === piece.setId);
      const stats = craftSetPieceStats(piece, mat);
      row = {
        item_type: piece.slot,
        name: `${piece.label} (${set?.name ?? 'Set'})`,
        rarity: 'ultimate',
        weight: piece.weight,
        atk_bonus: stats.atk,
        def_bonus: stats.def,
        hp_bonus: stats.hp,
        passive_type: null,
        passive_value: 0,
        set_id: piece.setId,
      };
    } else if (kind === 'relic') {
      const rb = getRelicBase(body.relic_base_id as string);
      if (!rb) return json({ error: 'Modèle de relique inconnu' }, 400);
      // Objet OCTROYÉ : personne n'a choisi d'essence, on prête celle du boss de
      // la zone du composant (même règle que la récompense quotidienne).
      const c = craftRelicAtRarity(rb, mat, zoneBossMaterial(mat.zone), rarity);
      row = { item_type: c.item_type, name: c.name, rarity: c.rarity, weight: c.weight, atk_bonus: c.atk_bonus, def_bonus: c.def_bonus, hp_bonus: c.hp_bonus, passive_type: null, passive_value: 0 };
    } else if (kind === 'jewel') {
      const gem = getGem(body.gem_id as string);
      if (!gem) return json({ error: 'Gemme inconnue' }, 400);
      const c = craftJewelAtRarity(mat, gem, rarity);
      row = { item_type: c.item_type, name: c.name, rarity: c.rarity, weight: c.weight, atk_bonus: 0, def_bonus: 0, hp_bonus: 0, passive_type: c.passive_type, passive_value: c.passive_value };
    } else {
      const base = getBase(body.base_id as string);
      if (!base) return json({ error: "Modèle d'arme/armure inconnu" }, 400);
      // Deux écarts avec la forge réelle sont corrigés ici :
      //  1. PAS d'essence de boss imposée. Elle injectait les stats du thème du
      //     boss de zone — un arc de zone 6 repartait avec +25 DEF, ce que jamais
      //     un joueur n'obtient en forgeant sans essence.
      //  2. La stat SECONDAIRE du modèle (Arc → crit, Dague → esquive) était
      //     purement oubliée : les armes octroyées n'avaient aucun passif.
      const c = craftItemAtRarity(base, mat, null, rarity);
      const wp = weaponPassiveFor(base, mat);
      row = {
        item_type: c.item_type,
        name: c.name,
        rarity: c.rarity,
        weight: c.weight,
        atk_bonus: c.atk_bonus,
        def_bonus: c.def_bonus,
        hp_bonus: c.hp_bonus,
        passive_type: wp?.type ?? null,
        passive_value: wp?.pct ?? 0,
      };
    }

    // --- Amélioration & bénédiction, appliquées comme la forge le ferait ---
    // Les colonnes `base_*` gardent les stats NUES ; `atk/def/hp_bonus` portent la
    // valeur améliorée. Écrire la même valeur dans les deux (ce que faisait
    // l'ancienne version) donnerait un objet dont le +N est décoratif, et que le
    // studio d'amélioration recalculerait de travers au prochain renfort.
    const upgrade = clampInt(body.upgrade_level, 0, UPGRADE_MAX);
    // Une bénédiction ne peut jamais dépasser le niveau de renfort (`validateBless`)
    // et ne concerne que les armes : on borne ici plutôt que de créer un objet
    // que l'Oratoire refuserait ensuite de retoucher.
    const blessing =
      row.item_type === 'weapon' ? clampInt(body.blessing_level, 0, Math.min(BLESSING_MAX, upgrade)) : 0;

    const isJewel = row.item_type === 'jewel';
    const gemForRefine = isJewel ? getGem(body.gem_id as string) : null;

    const tier = await currentArcOf(admin, playerId);
    const { data: item, error: itemErr } = await admin
      .from('items')
      .insert({
        owner_id: playerId,
        item_type: row.item_type,
        name: row.name,
        rarity: row.rarity,
        weight: row.weight,
        tier,
        set_id: row.set_id ?? null,
        upgrade_level: upgrade,
        blessing_level: blessing,
        // Un bijou n'a pas de stats brutes : son « renfort » est un RAFFINAGE qui
        // pousse le passif, d'où une formule distincte de `effectiveBonus`.
        atk_bonus: effectiveBonus(row.atk_bonus, upgrade),
        def_bonus: effectiveBonus(row.def_bonus, upgrade),
        hp_bonus: effectiveBonus(row.hp_bonus, upgrade),
        base_atk_bonus: row.atk_bonus,
        base_def_bonus: row.def_bonus,
        base_hp_bonus: row.hp_bonus,
        passive_type: row.passive_type,
        passive_value:
          isJewel && gemForRefine
            ? refinedJewelPct(row.passive_value, upgrade, gemForRefine)
            : row.passive_value,
        base_passive_value: row.passive_value,
      })
      .select()
      .single();
    if (itemErr) return json({ error: `Insert refusé : ${itemErr.message}` }, 400);
    return json({ ok: true, item });
  }

  // ------------------------------------------------------------ DONNER XP
  // Crédite `amount` d'XP à CHAQUE héros du joueur (level-ups + points de
  // compétence) et l'XP de compte correspondante.
  if (action === 'give_xp') {
    const playerId = body.player_id as string;
    const amount = Math.max(0, Math.floor(Number(body.amount)));
    if (typeof playerId !== 'string' || amount <= 0) {
      return json({ error: 'player_id et amount (>0) requis' }, 400);
    }
    const { data: heroes } = await admin
      .from('heroes')
      .select('id, level, xp, skill_points')
      .eq('owner_id', playerId);
    let levelsGained = 0;
    for (const h of heroes ?? []) {
      const gain = applyXpGain(h.level, h.xp, amount);
      const update: Record<string, number> = { level: gain.level, xp: gain.xp };
      if (gain.levelsGained > 0) {
        update.skill_points = (h.skill_points ?? 0) + gain.levelsGained * SKILL_POINTS_PER_LEVEL;
        levelsGained += gain.levelsGained;
      }
      await admin.from('heroes').update(update).eq('id', h.id);
    }
    const share = accountXpFromHeroXp(amount * (heroes?.length ?? 0));
    if (share > 0) {
      const { data: p } = await admin.from('profiles').select('account_xp').eq('id', playerId).single();
      await admin.from('profiles').update({ account_xp: (p?.account_xp ?? 0) + share }).eq('id', playerId);
    }
    return json({ ok: true, heroes: heroes?.length ?? 0, levels_gained: levelsGained, account_xp_added: share });
  }

  // -------------------------------------------------- DÉBLOQUER / POSER UN ARC
  // Débloque ET saute sur un arc POUR UN SEUL JOUEUR : current_arc = arc,
  // max_arc = max(existant, arc). Cible = player_id ou l'appelant.
  //
  // N'OUVRE PLUS L'ARC POUR LE SERVEUR. Cette action le faisait — un simple clic
  // sur « Arc 2 » dans le panneau, présenté comme une action de test individuelle,
  // ouvrait l'arc pour TOUT LE MONDE et court-circuitait l'event de boss d'arc,
  // qui est la seule façon prévue de l'ouvrir (`arc-event` → `defeat()`). C'est
  // arrivé en production : arc 2 s'est retrouvé ouvert avec `opened_at` à null,
  // signature de cet upsert-ci, alors qu'aucun event n'avait jamais eu lieu.
  //
  // L'ouverture mondiale est désormais une action SÉPARÉE et explicite
  // (`open_arc`), pour qu'on ne puisse plus la déclencher sans l'avoir voulu.
  if (action === 'set_arc') {
    const playerId = typeof body.player_id === 'string' ? body.player_id : user.id;
    const arc = Number(body.arc);
    if (!Number.isInteger(arc) || arc < 1) return json({ error: 'arc invalide' }, 400);

    const { data: existing } = await admin
      .from('player_arc')
      .select('max_arc')
      .eq('player_id', playerId)
      .maybeSingle();
    const maxArc = Math.max((existing?.max_arc as number | undefined) ?? 1, arc);

    const { data: row } = await admin
      .from('player_arc')
      .upsert(
        { player_id: playerId, current_arc: arc, max_arc: maxArc },
        { onConflict: 'player_id' },
      )
      .select('current_arc, max_arc')
      .single();

    return json({ ok: true, player_arc: row });
  }

  // ------------------------------------------- OUVRIR / FERMER UN ARC (MONDE)
  // Action explicite et volontairement distincte de `set_arc` : elle touche TOUS
  // les joueurs. `opened_at` n'est posé qu'à l'ouverture, et sert de trace — une
  // ouverture légitime par l'event de boss d'arc le renseigne aussi, un arc
  // ouvert avec `opened_at` à null trahit donc une intervention manuelle.
  if (action === 'open_arc') {
    const arc = Number(body.arc);
    const opened = body.opened !== false;
    if (!Number.isInteger(arc) || arc < 1) return json({ error: 'arc invalide' }, 400);
    if (arc === 1 && !opened) return json({ error: "L'arc 1 ne peut pas être fermé" }, 400);

    const { error: err } = await admin.from('arc_world').upsert(
      { arc, opened, opened_at: opened ? new Date().toISOString() : null },
      { onConflict: 'arc' },
    );
    if (err) return json({ error: err.message }, 400);
    return json({ ok: true, arc, opened });
  }

  return json({ error: 'Action inconnue' }, 400);
});
