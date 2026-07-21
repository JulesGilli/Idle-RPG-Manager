/**
 * Champs de bataille — helpers PURS (partagés front + Edge Function).
 *
 * Concept : contrairement au reste du jeu qui plafonne les compositions à 5
 * héros (3 en arène), un champ de bataille est une BATAILLE RANGÉE — le joueur
 * engage JUSQU'À 10 héros face à une armée de 10. C'est la seule activité où
 * l'effectif compte : `MAX_ROSTER = 13` mais `ROSTER_BASE = 5 + 1 par donjon`,
 * donc recruter et boucler des donjons se traduit enfin en puissance de terrain.
 *
 * Le joueur n'est JAMAIS exclu : il aligne autant de héros qu'il en possède. À
 * 6 héros contre 10 il se bat en infériorité — il vise donc les batailles
 * basses. C'est le gradient de difficulté, pas un verrou.
 *
 * Économie : les batailles sont la SEULE source de Poussière bénie, matière de
 * l'ARMURE divine (cf. `divine.ts` / `eventMaterials.ts`). Le robinet est bridé
 * par un quota QUOTIDIEN global (`BATTLEFIELD_DAILY_CAP`), toutes batailles
 * confondues — et non par un cooldown par bataille : le joueur choisit librement
 * où dépenser ses 4 sorties du jour.
 *
 * Arc 2 uniquement : la récompense ne sert qu'à du contenu Arc 2.
 *
 * Comme `worldBoss.ts` : la clé de jour est calculée sur l'HORLOGE SERVEUR
 * (`parisDayKey`) et le combat est résolu serveur → impossible de tricher.
 */
import type { CombatantInput } from '../combat/types.ts';
import { scaleEnemyStatsForArc } from './arc.ts';

/* ------------------------------------------------------------------ règles -- */

/** Arc à partir duquel les champs de bataille existent. */
export const BATTLEFIELD_ARC = 2;

/**
 * Effectif maximum engagé par le joueur. Volontairement AU-DESSUS du plafond de
 * `MAX_ROSTER` atteignable par la plupart des joueurs : c'est un objectif, pas
 * un prérequis. On n'exige aucun minimum — un joueur à 5 héros joue quand même.
 */
export const BATTLEFIELD_MAX_TEAM = 10;

/** Taille FIXE de l'armée adverse, quelle que soit la bataille. */
export const BATTLEFIELD_ENEMY_COUNT = 10;

/**
 * Nombre de batailles par jour, TOUTES batailles confondues (pas par bataille).
 * Le quota se réinitialise à minuit Europe/Paris, calculé serveur.
 */
export const BATTLEFIELD_DAILY_CAP = 4;

/* ------------------------------------------------------------------ armée -- */

/**
 * Grade d'un combattant ennemi. Une armée n'est pas un mur homogène : la
 * piétaille meurt vite, les élites encaissent, le capitaine impose le tempo.
 * Multiplicateurs appliqués aux stats de base de la bataille.
 */
export const RANK_MULT = { troupe: 1, elite: 1.35, capitaine: 2 } as const;
export type BattlefieldRank = keyof typeof RANK_MULT;

/**
 * Composition d'une armée de 10 : 6 troupes, 3 élites, 1 capitaine. Ordre
 * significatif — le moteur cible dans l'ordre pour certaines abilités, et le
 * capitaine en dernier évite qu'il soit focus au premier tour.
 */
export const ARMY_COMPOSITION: BattlefieldRank[] = [
  'troupe', 'troupe', 'troupe', 'troupe', 'troupe', 'troupe',
  'elite', 'elite', 'elite',
  'capitaine',
];

/** Stats de base d'un ennemi de la bataille, AVANT grade et AVANT scaling d'arc. */
export type BattlefieldStats = { hp: number; atk: number; def: number; speed: number };

/** Définition d'un champ de bataille. */
export type BattlefieldDef = {
  id: string;
  /** Rang de difficulté, 1-indexé et contigu (sert au déblocage séquentiel). */
  idx: number;
  name: string;
  /** Accroche d'ambiance (UI). */
  flavor: string;
  /** Stats d'une TROUPE de base ; élites et capitaine en dérivent via `RANK_MULT`. */
  base: BattlefieldStats;
  /** Noms des trois grades — ils PILOTENT le sprite (cf. `enemyVariant`). */
  troopName: string;
  eliteName: string;
  captainName: string;
  /** Poussière bénie accordée à la victoire (matière de l'armure divine). */
  dust: number;
  /** Or accordé à la victoire. */
  gold: number;
};

/**
 * Les 6 champs de bataille, difficulté croissante (~×1.28 de PV par palier).
 *
 * CALIBRÉ AU SIMULATEUR — `npm run sim:bf` (moteur réel, 40 graines, héros niv. 30,
 * équipement de zone 10 à l'échelle d'arc 2, renforcé +5). Résultats visés :
 *
 *   set 4 pièces, 10 héros (étalon)   B1-B5 acquis · B6 contesté (~55 %)
 *   forge sans set, 10 héros          idem, B6 ~80 % (plus tanky, cf. ci-dessous)
 *   set 4 pièces, 6 héros             B1-B4 acquis · B5+ non (gradient du vivier)
 *
 * ⚠️ RECALIBRÉ après le passage de `gearStatMult` de 14 à 16 (arc 2) : ce +14 %
 * de puissance joueur rendait B6 acquis à 100 %. Toute retouche à ce
 * multiplicateur EXIGE de relancer `npm run sim:bf` — les deux sont couplés.
 *
 * Le sommet reste contesté À DESSEIN : la sim ignore les runes, le buff de guilde,
 * les objets divins et les bénédictions. Un B6 à 100 % en sim serait acquis dès
 * l'ouverture en vrai.
 *
 * ⚠️ Trois leçons de calibrage, chacune payée par une version ratée :
 *  • l'ATK est le levier le plus SENSIBLE — le scaling d'arc la multiplie par 26
 *    contre 22 pour les PV. Une première version trop offensive lavait l'escouade
 *    en 2-4 manches et rendait B6 strictement invaincu ;
 *  • trop de PV ne tue pas, ça fait EXPIRER le combat (plafond `DEFAULT_MAX_ROUNDS`
 *    = 150). Une version à 6300 PV perdait B6 par dépassement, pas par massacre ;
 *  • la DEF ennemie est le vrai moteur de DURÉE : c'est le levier à baisser pour
 *    raccourcir un combat sans le rendre facile.
 *
 * ⚠️ Les combats des paliers hauts restent LONGS (B5 ~100 manches, B6 proche du
 * plafond de 150). C'est jouable mais le rejeu est interminable à regarder ; si on
 * veut resserrer, baisser encore la DEF plutôt que les PV.
 *
 * Les noms sont choisis pour tomber sur un archétype de sprite existant
 * (`enemyVariant`) : gobelin→imp, gargouille→winged, revenant→ombre/undead,
 * sentinelle→golem, brute/pillard/chef→brute, colosse→titan.
 */
export const BATTLEFIELDS: BattlefieldDef[] = [
  {
    id: 'avant_poste',
    idx: 1,
    name: 'L’Avant-poste brûlé',
    flavor: 'Une garnison en déroute tient encore la palissade.',
    base: { hp: 1700, atk: 110, def: 22, speed: 10 },
    troopName: 'Gobelin de la Horde',
    eliteName: 'Pillard du Désespoir',
    captainName: 'Chef de guerre gobelin',
    dust: 1,
    gold: 4_000,
  },
  {
    id: 'pont_cendres',
    idx: 2,
    name: 'Le Pont de Cendres',
    flavor: 'Un goulet où dix suffisent à tenir mille.',
    base: { hp: 2200, atk: 148, def: 27, speed: 10 },
    troopName: 'Brute calcinée',
    eliteName: 'Gargouille de siège',
    captainName: 'Tyran des Cendres',
    dust: 1,
    gold: 7_000,
  },
  {
    id: 'plaine_lances',
    idx: 3,
    name: 'La Plaine aux Lances',
    flavor: 'Les étendards des morts battent encore au vent.',
    base: { hp: 2850, atk: 195, def: 33, speed: 10 },
    troopName: 'Revenant de la Ligne',
    eliteName: 'Spectre porte-étendard',
    captainName: 'Ombre du Maréchal',
    dust: 2,
    gold: 11_000,
  },
  {
    id: 'citadelle',
    idx: 4,
    name: 'La Citadelle éventrée',
    flavor: 'Ses sentinelles n’ont jamais reçu l’ordre de cesser.',
    base: { hp: 3600, atk: 250, def: 40, speed: 11 },
    troopName: 'Sentinelle brisée',
    eliteName: 'Gardien de la Brèche',
    captainName: 'Golem de rempart',
    dust: 2,
    gold: 16_000,
  },
  {
    id: 'vallee_rouge',
    idx: 5,
    name: 'La Vallée Rouge',
    flavor: 'Le sol y est rouge depuis si longtemps qu’on en a oublié la cause.',
    base: { hp: 4500, atk: 320, def: 44, speed: 11 },
    troopName: 'Harpie charognarde',
    eliteName: 'Bête de meute',
    captainName: 'Colosse de la Vallée',
    dust: 3,
    gold: 24_000,
  },
  {
    id: 'dernier_rempart',
    idx: 6,
    name: 'Le Dernier Rempart',
    flavor: 'Au-delà, il n’y a plus rien à défendre.',
    base: { hp: 5300, atk: 400, def: 48, speed: 11 },
    troopName: 'Élémentaire de guerre',
    eliteName: 'Archonte déchu',
    captainName: 'Colosse du Désespoir',
    dust: 3,
    gold: 35_000,
  },
];

/** Un champ de bataille par son id (undefined si inconnu). */
export function battlefieldById(id: string): BattlefieldDef | undefined {
  return BATTLEFIELDS.find((b) => b.id === id);
}

/**
 * Déblocage SÉQUENTIEL : on accède à la bataille `n` dès qu'on a vaincu la
 * `n-1`. `highestCleared` = plus haut `idx` déjà remporté (0 si aucun). La
 * première est donc toujours ouverte.
 */
export function battlefieldUnlocked(idx: number, highestCleared: number): boolean {
  return idx <= Math.max(0, highestCleared) + 1;
}

/**
 * Nom affiché d'un combattant selon son grade et son rang dans l'armée. Le
 * numéro distingue les doublons dans le journal de combat (« Gobelin 3 »).
 */
export function battlefieldEnemyName(
  def: BattlefieldDef,
  rank: BattlefieldRank,
  n: number,
): string {
  if (rank === 'capitaine') return def.captainName;
  const base = rank === 'elite' ? def.eliteName : def.troopName;
  return `${base} ${n}`;
}

/**
 * L'armée adverse : 10 `CombatantInput` prêts pour `resolveCombat`, stats
 * multipliées par le grade PUIS par le scaling d'arc (helper partagé, même
 * traitement que carte/donjon/tour → cohérence garantie).
 *
 * Le capitaine s'enrage (+4 %/tour) : sans lui, une bataille perdue d'avance
 * pourrait tourner en boucle interminable au lieu de trancher.
 */
export function battlefieldArmy(def: BattlefieldDef, arc = BATTLEFIELD_ARC): CombatantInput[] {
  let troupe = 0;
  let elite = 0;
  return ARMY_COMPOSITION.map((rank, i) => {
    const mult = RANK_MULT[rank];
    const scaled = scaleEnemyStatsForArc(
      { hp: def.base.hp * mult, atk: def.base.atk * mult },
      arc,
    );
    const n = rank === 'elite' ? ++elite : ++troupe;
    return {
      id: `${def.id}-${rank}-${i}`,
      name: battlefieldEnemyName(def, rank, n),
      role: 'enemy' as const,
      hp: scaled.hp,
      atk: scaled.atk,
      def: Math.round(def.base.def * mult),
      speed: def.base.speed,
      ...(rank === 'capitaine' ? { abilities: [{ kind: 'atk_ramp' as const, perTurn: 0.04 }] } : {}),
    };
  });
}

/* ------------------------------------------------------------------ quota -- */

/** Sorties restantes aujourd'hui (jamais négatif). */
export function battlesRemaining(usedToday: number): number {
  return Math.max(0, BATTLEFIELD_DAILY_CAP - Math.max(0, usedToday));
}

/** Raison pour laquelle une bataille est refusée — `null` = elle peut être lancée. */
export type BattlefieldBlock = 'arc' | 'locked' | 'daily_cap' | 'no_heroes';

/**
 * Vérification unique et partagée : le serveur l'applique pour AUTORISER, le
 * front pour EXPLIQUER (même verdict des deux côtés, pas de divergence).
 */
export function battlefieldBlocker(args: {
  arc: number;
  idx: number;
  highestCleared: number;
  usedToday: number;
  teamSize: number;
}): BattlefieldBlock | null {
  if (args.arc < BATTLEFIELD_ARC) return 'arc';
  if (!battlefieldUnlocked(args.idx, args.highestCleared)) return 'locked';
  if (battlesRemaining(args.usedToday) <= 0) return 'daily_cap';
  if (args.teamSize <= 0) return 'no_heroes';
  return null;
}

/* ------------------------------------------------------------ récompenses -- */

/** Butin d'une bataille remportée. */
export type BattlefieldReward = { dust: number; gold: number };

/**
 * Récompense de victoire. La défaite ne rapporte RIEN mais consomme quand même
 * la sortie : c'est ce qui donne du poids au choix de la bataille (viser trop
 * haut coûte une des 4 sorties du jour).
 */
export function battlefieldReward(def: BattlefieldDef, won: boolean): BattlefieldReward {
  if (!won) return { dust: 0, gold: 0 };
  return { dust: def.dust, gold: def.gold };
}
