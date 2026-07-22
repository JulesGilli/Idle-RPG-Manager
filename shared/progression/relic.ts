/**
 * Reliques : équipement du slot `relic`. Recette HOMOGÈNE avec la forge — on
 * choisit un modèle (biais de stats) ET un composant de zone (comme une arme),
 * auquel s'ajoutent les matériaux de DONJON (fragments + sceau). Le composant
 * de zone fixe la PUISSANCE (magnitude × tier), la rareté module de −20 % à
 * +35 %. Forte composante PV via le biais. Pur et déterministe (partagé front
 * + Edge Function) ; seule la rareté est tirée.
 */
import { arcMaterialKey } from './arcMaterials.ts';
import { RARITY_MULT, RARITY_ORDER, type Rarity } from './loot.ts';
import {
  CRAFT_RARITY_WEIGHTS,
  secondaryStatPct,
  type Recipe,
  type ForgeMaterialTheme,
  type BossMaterial,
} from './forge.ts';
import {
  MAX_MASTERY_LEVEL,
  AUTO_UNLOCK_LEVEL,
  autoUnlocked,
  masteryLevelInfo,
  masteryXpGain,
  craftRarityWeights,
  type MasteryLevelInfo,
} from './mastery.ts';
import type { Rng } from '../combat/prng.ts';

/** Stat dominante d'un modèle de relique. */
export type RelicStat = 'atk' | 'def' | 'hp';

/** Libellé court d'une stat de relique. */
export const RELIC_STAT_LABEL: Record<RelicStat, string> = { atk: 'ATK', def: 'DEF', hp: 'PV' };

/**
 * Un modèle de relique : objet FOCALISÉ sur une seule stat (à la façon d'une arme
 * qui ne donne que de l'ATK). La puissance vient du composant de zone.
 */
export type RelicBase = {
  id: string;
  label: string;
  icon: string;
  primary: RelicStat;
};

export const RELIC_BASES: RelicBase[] = [
  { id: 'talisman_vigueur', label: 'Talisman de Vigueur', icon: '🩸', primary: 'hp' },
  { id: 'idole_guerre', label: 'Idole de Guerre', icon: '⚔️', primary: 'atk' },
  { id: 'egide_ancestrale', label: 'Égide Ancestrale', icon: '🛡️', primary: 'def' },
];

/**
 * Prime de puissance d'une relique par rapport à une arme/armure de même composant.
 * Modérée : la relique est un peu au-dessus (elle coûte des matériaux de donjon),
 * mais reste alignée sur une bonne arme — plus le cumul ATK+DEF+PV d'avant.
 */
const RELIC_MAGNITUDE_MULT = 1.35;

/**
 * Fragments de relique exigés — croissent avec la PUISSANCE de la relique (donc
 * avec la zone du composant). Plus la relique visée est forte, plus il faut de
 * fragments : un incitatif direct à farmer des donjons de plus en plus durs, qui
 * lâchent davantage de fragments. Barème : 5 au départ (zone 1), +2 par zone.
 */
export function relicFragmentQty(mat: ForgeMaterialTheme): number {
  const zoneIndex = (mat.craftTier - 1) * 10 + mat.zone;
  return 3 + zoneIndex * 2;
}

/**
 * Sceau de donjon exigé : TOUJOURS 1, quel que soit l'arc.
 *
 * Il valait `mat.craftTier`, soit 2 en arc 2 — puis 5 une fois passé par
 * `forgeCostMult`. Or le sceau est un butin de donjon rare à cadence FIXE : son
 * robinet n'a pas été multiplié par l'arc, contrairement au farm de zone. Le
 * coût ne rendait donc pas la relique « plus chère », il la rendait bloquante.
 * (Il est aussi exempté du multiplicateur d'arc, cf. `ARC_COST_EXEMPT`.)
 */
export function relicSealQty(_mat: ForgeMaterialTheme): number {
  return 1;
}

/** Matériaux de donjon exigés par une relique donnée (touche « relique »). */
/**
 * @param arc arc du craft. Les donjons se rejouent d'un arc à l'autre et y
 *   lâchent leurs JUMEAUX : une relique d'arc 2 doit donc se payer en butin de
 *   donjon d'arc 2, sinon elle se craftait avec les fragments d'arc 1 que le
 *   joueur ne récolte plus.
 */
export function relicDungeonMaterials(
  mat: ForgeMaterialTheme,
  arc = 1,
): { key: string; qty: number }[] {
  return [
    { key: arcMaterialKey('fragment_relique', arc), qty: relicFragmentQty(mat) },
    { key: arcMaterialKey('sceau_catacombe', arc), qty: relicSealQty(mat) },
  ];
}

export function getRelicBase(id: string): RelicBase | undefined {
  return RELIC_BASES.find((b) => b.id === id);
}

/** Coût d'une relique : composant de zone (or + matériaux) + matériaux de donjon. */
export function relicRecipe(
  mat: ForgeMaterialTheme,
  boss: BossMaterial | null,
  arc = 1,
): Recipe {
  return {
    gold: mat.gold + 800,
    // Farm du composant + l'essence CHOISIE (si choisie) + le butin de donjon.
    // L'autel choisit son essence comme la forge : c'est elle qui décide des
    // stats secondaires, donc elle doit se payer.
    //
    // `mat` et `boss` portent DÉJÀ les clés de leur arc (ils viennent des
    // catalogues d'arc) ; seul le butin de donjon doit être traduit ici.
    materials: [
      ...mat.materials,
      ...(boss ? [{ key: boss.key, qty: boss.qty }] : []),
      ...relicDungeonMaterials(mat, arc),
    ],
  };
}

export type RelicCraftResult = {
  item_type: 'relic';
  name: string;
  rarity: Rarity;
  weight: null;
  tier: number;
  atk_bonus: number;
  def_bonus: number;
  hp_bonus: number;
};

/* ------------------------------------------------------------------ *
 * MAÎTRISE DE RELIQUAIRE (niveau de reliquaire, global par joueur)    *
 * ------------------------------------------------------------------ *
 * Troisième atelier de craft à en recevoir une, après la Forge et la  *
 * Joaillerie — les trois suivent désormais la MÊME logique : l'XP     *
 * tombe à chaque craft, le niveau améliore les probas de rareté, et   *
 * le serveur reste autoritaire (le client n'affiche l'aperçu qu'en    *
 * réutilisant ces mêmes fonctions pures).                             *
 *                                                                     *
 * Le moteur vit dans `mastery.ts`, partagé avec la Forge et la        *
 * Joaillerie. Ici, seulement le VOCABULAIRE du reliquaire.            */

/** Niveau de reliquaire maximal. */
export const MAX_RELIC_LEVEL = MAX_MASTERY_LEVEL;

/** Palier de déblocage de l'AUTO-façonnage. */
export const AUTO_RELIC_UNLOCK_LEVEL = AUTO_UNLOCK_LEVEL;

/** L'auto-façonnage est-il débloqué à ce niveau de reliquaire ? */
export const autoRelicUnlocked = autoUnlocked;

export type RelicLevelInfo = MasteryLevelInfo;

/** Dérive le niveau de reliquaire (et la progression) à partir de l'XP totale. */
export const relicLevelInfo = masteryLevelInfo;

/** XP de reliquaire gagnée par relique forgée (plus la zone/tier est haute, plus ça rapporte). */
export const relicMasteryXpGain = masteryXpGain;

/** Poids de rareté d'une relique selon le niveau de reliquaire (1..MAX). */
export const relicRarityWeights = craftRarityWeights;

function pickRarity(rng: Rng, weights: Record<Rarity, number>): Rarity {
  const entries = Object.entries(weights) as [Rarity, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng.next() * total;
  for (const [rarity, w] of entries) {
    roll -= w;
    if (roll < 0) return rarity;
  }
  return entries[0]![0];
}

/**
 * Construit la relique pour une rareté donnée (partagé craft réel / ranges).
 *
 * Une relique peut donner les TROIS stats :
 *  · la stat PRIORITAIRE du modèle touche 100 % de la puissance (magnitude du
 *    composant) — elle ne dépend jamais de l'essence ;
 *  · les deux AUTRES ne tombent QUE si l'essence de boss les nourrit, à une part
 *    qui suit la zone de CETTE ESSENCE (10 % → 35 %, cf. `secondaryStatPct`).
 *
 * Même règle qu'à la forge : l'essence dit QUELLES stats, sa zone DOSE, le
 * composant AMPLIFIE. Sans essence (ou en zones 1-3, qui n'ont pas de boss), la
 * relique est strictement mono-stat.
 *
 * Une essence qui nomme la prioritaire ne sert à rien de ce côté : elle est déjà
 * à 100 %. Un Talisman de Vigueur (PV) + cœur d'hydre (PV) ne donne donc AUCUN
 * secondaire — l'appariement modèle × essence fait partie du choix.
 *
 * Les PV restent sur une échelle ~2× (comme armures/bijoux) : chaque stat est
 * donc calculée à sa pleine valeur « si elle était primaire », puis pondérée.
 */
function buildRelic(
  base: RelicBase,
  mat: ForgeMaterialTheme,
  boss: BossMaterial | null,
  rarity: Rarity,
): RelicCraftResult {
  const magnitude = Math.max(1, Math.round(mat.magnitude * RELIC_MAGNITUDE_MULT));
  const mult = RARITY_MULT[rarity];
  const secondary = boss ? secondaryStatPct(boss.zone) : 0;
  const fed = (stat: RelicStat): boolean => !!boss && (boss.stats as string[]).includes(stat);
  /** Valeur pleine d'une stat si elle était la prioritaire du modèle. */
  const full = (stat: RelicStat): number => Math.round(magnitude * (stat === 'hp' ? 2 : 1) * mult);
  /** Pleine pour la prioritaire ; pondérée pour celles que l'essence nourrit ; 0 sinon. */
  const value = (stat: RelicStat): number =>
    stat === base.primary ? full(stat) : fed(stat) ? Math.round(full(stat) * secondary) : 0;
  return {
    item_type: 'relic',
    name: `${base.label} ${mat.suffix}`,
    rarity,
    weight: null,
    tier: mat.craftTier,
    atk_bonus: value('atk'),
    def_bonus: value('def'),
    hp_bonus: value('hp'),
  };
}

/**
 * Fabrique une relique (modèle × composant de zone).
 * `relicLevel` fourni → probas selon la maîtrise de reliquaire ; sinon probas
 * globales legacy (préserve les reliques offertes et les tests existants).
 */
export function craftRelic(
  base: RelicBase,
  mat: ForgeMaterialTheme,
  boss: BossMaterial | null,
  rng: Rng,
  relicLevel?: number,
): RelicCraftResult {
  const weights = relicLevel === undefined ? CRAFT_RARITY_WEIGHTS : relicRarityWeights(relicLevel);
  return buildRelic(base, mat, boss, pickRarity(rng, weights));
}

/**
 * Fabrique une relique à une rareté IMPOSÉE (récompenses garanties : reliques
 * offertes). Une relique OFFERTE n'a pas d'essence — le joueur n'a rien choisi :
 * elle est mono-stat, pleine sur la prioritaire de son modèle.
 */
export function craftRelicAtRarity(
  base: RelicBase,
  mat: ForgeMaterialTheme,
  boss: BossMaterial | null,
  rarity: Rarity,
): RelicCraftResult {
  return buildRelic(base, mat, boss, rarity);
}

export type RelicStatRanges = {
  atk: [number, number];
  def: [number, number];
  hp: [number, number];
};

/** Range de stats (Médiocre → Ultime), pour l'aperçu avant craft. */
export function relicRanges(
  base: RelicBase,
  mat: ForgeMaterialTheme,
  boss: BossMaterial | null,
): RelicStatRanges {
  const lo = buildRelic(base, mat, boss, 'poor');
  const hi = buildRelic(base, mat, boss, 'ultimate');
  return {
    atk: [lo.atk_bonus, hi.atk_bonus],
    def: [lo.def_bonus, hi.def_bonus],
    hp: [lo.hp_bonus, hi.hp_bonus],
  };
}

export type RelicRarityRow = {
  rarity: Rarity;
  atk: number;
  def: number;
  hp: number;
};

/**
 * Stats de la relique POUR CHAQUE RARETÉ (médiocre → ultime).
 *
 * `relicRanges` ne donnait que les deux bouts. Or l'Autel tire une rareté au
 * hasard : savoir qu'on obtiendra « entre 40 et 120 ATK » ne dit pas ce que vaut
 * le tirage le plus probable. Ce tableau met en face de chaque rareté — dont
 * l'UI affiche déjà la probabilité — ce qu'elle rapporte réellement.
 *
 * Même source que le craft (`buildRelic`) : l'aperçu ne peut pas diverger de ce
 * que le serveur fabrique.
 */
export function relicStatsByRarity(
  base: RelicBase,
  mat: ForgeMaterialTheme,
  boss: BossMaterial | null,
): RelicRarityRow[] {
  return RARITY_ORDER.map((rarity) => {
    const r = buildRelic(base, mat, boss, rarity);
    return { rarity, atk: r.atk_bonus, def: r.def_bonus, hp: r.hp_bonus };
  });
}
