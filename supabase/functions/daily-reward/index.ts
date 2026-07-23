// Edge Function : daily-reward
// Récompense journalière. Action : claim.
// - Date du jour calculée côté SERVEUR (Europe/Paris) → anti-triche d'horloge.
// - 1 réclamation / jour ; cycle de 3 jours (arme → armure → relique) ; jour
//   manqué = série remise à 1.
// - Récompenses = ÉQUIPEMENT ULTIME (jamais d'or, jamais de matériaux) : chaque
//   jour offre un lot complet (toutes les armes, toutes les armures, ou les 3
//   modèles de relique) de la ZONE LA PLUS LOIN ATTEINTE par le joueur DANS SON
//   ARC COURANT (cf. `furthestZoneOf`) — jamais une zone fixe déconnectée de sa
//   vraie progression. Les objets sont forgés ici, gratuitement.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { DAILY_RARITY, dailyStatus, kindForDay, type DailyClaimState } from '@shared/progression/daily.ts';
import {
  FORGE_BASES,
  craftItemAtRarity,
  weaponPassiveFor,
} from '@shared/progression/forge.ts';
import { RELIC_BASES, craftRelicAtRarity } from '@shared/progression/relic.ts';
import { forgeMaterialsForArc, zoneBossMaterialForArc } from '@shared/progression/arcMaterials.ts';
import { tierGearMult } from '@shared/progression/arc.ts';

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

/** Date du jour 'YYYY-MM-DD' au fuseau Europe/Paris (indépendant de l'horloge client). */
function parisToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
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

/**
 * Zone (1..10) la plus loin ATTEINTE par le joueur dans cet arc : le sort de la
 * map la plus avancée où il a nettoyé au moins un niveau. 1 si rien n'est
 * encore nettoyé (nouvel arc, ou nouveau compte) — jamais une zone au hasard.
 *
 * Trois requêtes simples plutôt qu'un embed PostgREST imbriqué (level_progress
 * → levels → maps) : moins fragile, et le volume (≤ 50 niveaux au total) rend
 * le coût négligeable.
 */
async function furthestZoneOf(admin: Admin, userId: string, arc: number): Promise<number> {
  const { data: cleared } = await admin
    .from('level_progress')
    .select('level_id')
    .eq('player_id', userId)
    .eq('arc', arc);
  const levelIds = (cleared ?? []).map((r: { level_id: string }) => r.level_id);
  if (levelIds.length === 0) return 1;

  const { data: levels } = await admin.from('levels').select('map_id').in('id', levelIds);
  const mapIds = [...new Set((levels ?? []).map((l: { map_id: string }) => l.map_id as string))];
  if (mapIds.length === 0) return 1;

  const { data: maps } = await admin.from('maps').select('sort').in('id', mapIds);
  const sorts = (maps ?? []).map((m: { sort: number | null }) => m.sort ?? 1);
  return Math.max(1, ...sorts);
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

  const today = parisToday();
  const { data: claim } = await admin
    .from('daily_claims')
    .select('last_claim_date, day_index')
    .eq('player_id', user.id)
    .maybeSingle();

  const state: DailyClaimState = {
    lastClaimDate: (claim?.last_claim_date as string | null) ?? null,
    dayIndex: (claim?.day_index as number | null) ?? 0,
  };
  const status = dailyStatus(state, today);
  if (!status.canClaim) {
    return json({ error: 'Récompense déjà réclamée aujourd’hui', already_claimed: true }, 409);
  }

  const kind = kindForDay(status.day);

  // RÉCLAMATION ATOMIQUE (anti multi-onglets) : le check canClaim ci-dessus est
  // sujet à une race (2 onglets lisent « pas encore réclamé » puis créditent
  // tous les deux). On s'approprie donc la journée par un compare-and-swap : on
  // s'assure d'abord qu'une ligne existe (sentinelle, sans toucher l'existante),
  // puis on avance last_claim_date → today UNIQUEMENT si sa valeur est < today.
  // Postgres sérialise la ligne : un seul UPDATE passe, l'autre matche 0 ligne.
  await admin.from('daily_claims').upsert(
    { player_id: user.id, last_claim_date: '1970-01-01', day_index: 0 },
    { onConflict: 'player_id', ignoreDuplicates: true },
  );
  const { data: claimed } = await admin
    .from('daily_claims')
    .update({ last_claim_date: today, day_index: status.day, updated_at: new Date().toISOString() })
    .eq('player_id', user.id)
    .lt('last_claim_date', today)
    .select('player_id');
  if (!claimed || claimed.length === 0) {
    return json({ error: 'Récompense déjà réclamée aujourd’hui', already_claimed: true }, 409);
  }

  // Crédit au tier de l'arc courant du joueur (chaque arc = une pile distincte),
  // sur la zone la plus loin ATTEINTE dans CET arc — sa vraie progression.
  const tier = await currentArcOf(admin, user.id);
  const tm = tierGearMult(tier);
  const zone = await furthestZoneOf(admin, user.id, tier);
  const mat = forgeMaterialsForArc(tier).find((m) => m.zone === zone);

  // deno-lint-ignore no-explicit-any
  const grantedItems: any[] = [];
  if (mat) {
    // Objet OFFERT : le joueur n'a choisi aucune essence, donc on lui prête
    // celle du boss de CETTE zone dans CET arc — sinon le cadeau sortirait sans
    // aucune stat secondaire (zones 1-3 : il n'y a pas de boss, et c'est normal).
    const boss = zoneBossMaterialForArc(zone, tier);

    if (kind === 'relic') {
      for (const base of RELIC_BASES) {
        const it = craftRelicAtRarity(base, mat, boss, DAILY_RARITY);
        const { data } = await admin
          .from('items')
          .insert({
            owner_id: user.id,
            item_type: it.item_type,
            name: it.name,
            rarity: it.rarity,
            weight: it.weight,
            tier,
            atk_bonus: Math.round(it.atk_bonus * tm),
            def_bonus: Math.round(it.def_bonus * tm),
            hp_bonus: Math.round(it.hp_bonus * tm),
            base_atk_bonus: Math.round(it.atk_bonus * tm),
            base_def_bonus: Math.round(it.def_bonus * tm),
            base_hp_bonus: Math.round(it.hp_bonus * tm),
          })
          .select()
          .single();
        if (data) grantedItems.push(data);
      }
    } else {
      const bases = FORGE_BASES.filter((b) => b.itemType === kind);
      for (const base of bases) {
        const it = craftItemAtRarity(base, mat, boss, DAILY_RARITY);
        // Passif du modèle (Arc → critique, Dague → esquive) : sans ça, l'Arc et
        // la Dague offerts seraient des versions amputées de ceux de la forge.
        const wp = weaponPassiveFor(base, mat);
        const { data } = await admin
          .from('items')
          .insert({
            owner_id: user.id,
            item_type: it.item_type,
            name: it.name,
            rarity: it.rarity,
            weight: it.weight,
            tier,
            // Mise à l'échelle de l'ARC, comme tout équipement forgé. Sans elle, le
            // cadeau quotidien restait à l'échelle de l'arc 1 (×1) alors que le reste
            // du stuff d'arc 2 est ×16 : une récompense sans aucune valeur.
            atk_bonus: Math.round(it.atk_bonus * tm),
            def_bonus: Math.round(it.def_bonus * tm),
            hp_bonus: Math.round(it.hp_bonus * tm),
            base_atk_bonus: Math.round(it.atk_bonus * tm),
            base_def_bonus: Math.round(it.def_bonus * tm),
            base_hp_bonus: Math.round(it.hp_bonus * tm),
            ...(wp ? { passive_type: wp.type, passive_value: wp.pct, base_passive_value: wp.pct } : {}),
          })
          .select()
          .single();
        if (data) grantedItems.push(data);
      }
    }
  }

  // (La réclamation a déjà été persistée atomiquement par le compare-and-swap
  // ci-dessus — plus d'upsert final, qui rouvrirait la fenêtre de double crédit.)

  return json({
    ok: true,
    day: status.day,
    kind,
    zone,
    items: grantedItems,
  });
});
