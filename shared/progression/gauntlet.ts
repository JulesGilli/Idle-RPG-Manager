/**
 * LE GAUNTLET — mode de combat SANS FIN (vagues), escouade de 5 héros.
 *
 * Le joueur enchaîne des VAGUES d'ennemis dont les stats montent sans plafond.
 * Chaque vague est un combat INDÉPENDANT (l'escouade repart à PV pleins, comme
 * La Tour) : le mur, c'est le scaling, pas l'usure. La course s'arrête à la
 * première vague non gagnée. On ne retient que la MEILLEURE vague atteinte
 * (record) — les tentatives sont illimitées.
 *
 * Le Gauntlet ne lâche PAS de butin par vague. À la place, la meilleure vague
 * atteinte fixe une PRODUCTION QUOTIDIENNE d'Éclat d'Éternité (`eternityPerDay`),
 * l'unique ressource qui améliore les armes divines (100 % de réussite, cf.
 * `divine.ts`). Plus tu pousses loin, plus ta rente d'Éclat est haute.
 *
 * Fonctions PURES et déterministes (rejouables depuis la seed). Aucune I/O.
 */
import { resolveCombat } from '../combat/resolveCombat.ts';
import { withStunImmunity } from '../combat/difficulty.ts';
import type { CombatantInput, CombatResult } from '../combat/types.ts';

/** Ressource produite par le Gauntlet — améliore les armes divines. Clé `player_resources`. */
export const ETERNITY_RESOURCE = 'eclat_eternite';

/**
 * Plafond ABSOLU du mode. Le Gauntlet est pensé « sans fin » : la courbe en loi
 * de puissance (cf. ci-dessous) n'oppose jamais de mur dur, et un build
 * parfaitement optimisé doit pouvoir pousser jusqu'ici. 5000 n'est donc pas un
 * réglage de difficulté mais un filet de sécurité anti-boucle-infinie.
 */
export const GAUNTLET_MAX_WAVE = 5000;

/**
 * Nombre de combats CONSERVÉS pour le replay (les derniers — là où ça se joue).
 * Indispensable : une course peut durer des milliers de vagues, stocker et
 * renvoyer les events de CHAQUE combat ferait exploser la réponse et la ligne
 * `gauntlet_runs.result` (mégaoctets). Les vagues antérieures ne gardent rien.
 */
export const GAUNTLET_REPLAY_KEEP = 10;

/* ------------------------------------------------------------- SCALING ----- */
// COURBE EN LOI DE PUISSANCE : mult(w) = (1 + (w−1)/10)^exp. La croissance
// RELATIVE décroît avec la vague → dur, mais jamais de mur vertical.
//
// CALIBRÉE SUR LES STATS RÉELLES DES JOUEURS (27 juil. 2026, relevées en base
// après que tout le monde a buté PILE à la vague 30). Deux corrections de fond :
//
//  1. Le multiplicateur d'ARC ne s'applique PLUS ici (cf. `simulateGauntletRun`).
//     Le Gauntlet est réservé à l'arc 2, donc TOUT LE MONDE encaissait ×22 PV et
//     ×26 ATK par-dessus la courbe : l'ATK devenait létale (~23 000 à la vague 30,
//     one-shot garanti) et le mode s'arrêtait net. Cette échelle est désormais
//     SELF-CONTAINED — les stats de base ci-dessous intègrent le niveau d'arc 2.
//  2. L'ATK monte BEAUCOUP moins vite que les PV (0.85 contre 1.45). C'est ce qui
//     rend un mode « sans fin » praticable : la course s'arrête parce qu'on ne tue
//     plus assez vite (plafond de tours = DPS check), pas parce qu'on se fait
//     one-shot. Vérifié au simulateur : l'escouade est encore VIVANTE à l'arrêt,
//     à tous les niveaux de puissance testés.
//
// Repères mesurés (escouade NUE, sans skills ni sets — les vraies vont plus loin) :
//   équipement actuel → ~55 · ×4 → ~215 · ×10 → ~475 · ×30 → ~1020 · ×100 → ~2350.

/** Stats de l'ennemi de référence à la vague 1 (échelle d'arc 2 intégrée). */
const BASE_HP = 5000;
const BASE_ATK = 600;
const BASE_DEF = 30;

/** Exposants de la loi de puissance. ATK très en dessous des PV : le mur doit être
 *  l'endurance (tuer à temps), jamais le one-shot subi. */
const HP_EXP = 1.45;
const ATK_EXP = 0.85;
/** La DEF monte linéairement et PLAFONNE (sinon stalemates garantis en fin de course). */
const DEF_PER_WAVE = 0.6;
const DEF_CAP = 400;

/** Multiplicateur de la loi de puissance à la vague `w`. */
function waveMult(w: number, exp: number): number {
  return Math.pow(1 + (w - 1) / 10, exp);
}

/** Vague « boss » tous les 10 : insensible au stun (comme les boss de donjon/arc). */
export function isGauntletBossWave(wave: number): boolean {
  return wave % 10 === 0;
}

/** Nombre d'ennemis d'une vague : 2 au départ, +1 toutes les 10 vagues, plafonné à 5. */
export function gauntletEnemyCount(wave: number): number {
  return Math.min(5, 2 + Math.floor(Math.max(0, wave - 1) / 10));
}

function gauntletEnemyName(wave: number, idx: number): string {
  if (isGauntletBossWave(wave)) return `Colosse de la Vague ${wave}`;
  return `Assaillant ${idx + 1} (vague ${wave})`;
}

/**
 * Les ennemis d'une vague. Stats communes (scaling exponentiel), `count` unités.
 * Le boss de palier (tous les 10) est un ennemi UNIQUE aux stats renforcées et
 * insensible au stun — un vrai mur, pas une nuée.
 */
export function gauntletWaveEnemies(wave: number): CombatantInput[] {
  const w = Math.max(1, Math.floor(wave));
  const hp = Math.round(BASE_HP * waveMult(w, HP_EXP));
  const atk = Math.round(BASE_ATK * waveMult(w, ATK_EXP));
  const def = Math.round(Math.min(DEF_CAP, BASE_DEF + DEF_PER_WAVE * (w - 1)));
  const speed = Math.min(30, 10 + Math.floor(w / 25));

  if (isGauntletBossWave(w)) {
    // Boss unique : PV concentrés (×2.2) pour être un mur, ATK légèrement au-dessus.
    const boss: CombatantInput = {
      id: `gauntlet-w${w}-boss`,
      name: gauntletEnemyName(w, 0),
      role: 'enemy',
      hp: Math.round(hp * 2.2),
      atk: Math.round(atk * 1.15),
      def,
      speed,
    };
    return [withStunImmunity(boss)];
  }

  const count = gauntletEnemyCount(w);
  return Array.from({ length: count }, (_, i) => ({
    id: `gauntlet-w${w}-e${i}`,
    name: gauntletEnemyName(w, i),
    role: 'enemy' as const,
    hp,
    atk,
    def,
    speed,
  }));
}

/* ---------------------------------------------------- PRODUCTION D'ÉCLAT ---- */

/**
 * Paliers de PRODUCTION d'Éclat d'Éternité par jour, selon la meilleure vague
 * atteinte. On prend le palier le plus haut dont la vague requise est ≤ record.
 * Sous la vague 1 (aucun record) → 0/jour.
 *
 * Barème ÉTIRÉ avec la courbe (26 juil. 2026) : l'ancien plafond « vague 40 →
 * 50/j » vit désormais à la vague 150 (≈ même difficulté sur la nouvelle
 * courbe), et des paliers de PRESTIGE récompensent les pushs profonds jusqu'au
 * plafond absolu (vague 5000 → 120/j, ~2 jours pour maxer un objet divin).
 *
 * ⚠️ Robinet unique de l'amélioration des armes divines : à régler avec le coût
 * de `divineUpgradeCost` (cf. divine.ts). Seul levier de la rente.
 */
export const ETERNITY_PRODUCTION_TIERS: readonly { wave: number; perDay: number }[] = [
  { wave: 1, perDay: 1 },
  { wave: 10, perDay: 2 },
  { wave: 25, perDay: 5 },
  { wave: 50, perDay: 10 },
  { wave: 75, perDay: 15 },
  { wave: 100, perDay: 25 },
  { wave: 150, perDay: 50 },
  { wave: 300, perDay: 60 },
  { wave: 500, perDay: 70 },
  { wave: 1000, perDay: 85 },
  { wave: 2500, perDay: 100 },
  { wave: 5000, perDay: 120 },
];

/** Éclat d'Éternité produit PAR JOUR pour une meilleure vague donnée (0 si aucun record). */
export function eternityPerDay(bestWave: number): number {
  let perDay = 0;
  for (const tier of ETERNITY_PRODUCTION_TIERS) {
    if (bestWave >= tier.wave) perDay = tier.perDay;
  }
  return perDay;
}

/** Plafond d'accumulation de la rente (jours). Au-delà, checker le jeu ~2×/semaine suffit. */
export const ETERNITY_CLAIM_CAP_DAYS = 7;
const SECONDS_PER_DAY = 86400;

/**
 * Éclat d'Éternité à créditer pour un temps écoulé depuis le dernier encaissement.
 *
 * Rente CONTINUE mais créditée en unités ENTIÈRES : on rend `floor(perDay × jours)`
 * et on renvoie le temps EFFECTIVEMENT consommé (les unités entières créditées),
 * pour que l'appelant avance l'ancre SANS perdre le reliquat fractionnaire — même
 * logique anti-perte que le farm de carte. L'accumulation est plafonnée à
 * `ETERNITY_CLAIM_CAP_DAYS`.
 *
 * @returns `amount` (entier crédité) + `consumedSeconds` (à ajouter à l'ancre).
 */
export function eternityClaim(
  bestWave: number,
  elapsedSeconds: number,
): { amount: number; consumedSeconds: number } {
  const perDay = eternityPerDay(bestWave);
  if (perDay <= 0 || elapsedSeconds <= 0) return { amount: 0, consumedSeconds: 0 };
  const cappedSeconds = Math.min(elapsedSeconds, ETERNITY_CLAIM_CAP_DAYS * SECONDS_PER_DAY);
  const produced = (perDay * cappedSeconds) / SECONDS_PER_DAY;
  const amount = Math.floor(produced);
  if (amount <= 0) return { amount: 0, consumedSeconds: 0 };
  // Temps correspondant EXACTEMENT aux unités entières créditées (reste préservé).
  const consumedSeconds = (amount / perDay) * SECONDS_PER_DAY;
  return { amount, consumedSeconds };
}

/* ----------------------------------------------------------------- COURSE -- */

export type GauntletWaveResult = {
  wave: number;
  isBoss: boolean;
  combat: CombatResult;
};

export type GauntletRunResult = {
  /** Les {@link GAUNTLET_REPLAY_KEEP} DERNIERS combats seulement (replay de la
   *  fin de course) — une course peut durer des milliers de vagues. */
  waveResults: GauntletWaveResult[];
  /** Première vague TENTÉE (= record + 1) : la course reprend au point d'arrêt. */
  fromWave: number;
  reachedWave: number; // dernière vague GAGNÉE (le record si la 1re tentée échoue)
  clearedNew: number; // vagues gagnées au-delà de l'ancien record
  newBestWave: number; // record après cette course
};

/**
 * Simule une course de Gauntlet, avec l'escouade `allies` (jusqu'à 5 héros, stats
 * effectives, `hp` = PV max). Chaque vague se joue à PV pleins ; la course
 * s'arrête à la première vague non gagnée.
 *
 * REPRISE AU RECORD : la course démarre à `previousBest + 1`, comme la Tour.
 * Recommencer à la vague 1 à chaque tentative n'apportait RIEN — les vagues sont
 * indépendantes et jouées à PV pleins, donc les rejouer donne exactement le même
 * résultat — mais infligeait au joueur de tout refaire pour retrouver son point
 * d'arrêt (et gonflait le temps de calcul serveur pour rien).
 *
 * Le multiplicateur d'ARC n'est volontairement PAS appliqué : la courbe de vagues
 * EST l'échelle de difficulté du mode (cf. le bloc SCALING plus haut).
 *
 * @param seed         seed serveur (jamais fournie par le client).
 * @param previousBest meilleure vague déjà atteinte (point de reprise).
 */
export function simulateGauntletRun(
  seed: number,
  allies: CombatantInput[],
  previousBest = 0,
): GauntletRunResult {
  const waveResults: GauntletWaveResult[] = [];
  let combatSeed = seed >>> 0;
  const best = Math.max(0, Math.floor(previousBest));
  const fromWave = Math.min(GAUNTLET_MAX_WAVE, best + 1);
  // Échec dès la première vague tentée → le record est CONSERVÉ tel quel.
  let reachedWave = best;
  // Chaque vague : escouade à PV pleins.
  const freshAllies = allies.map((a) => ({ ...a, startHp: a.hp }));

  for (let wave = fromWave; wave <= GAUNTLET_MAX_WAVE; wave++) {
    const enemies = gauntletWaveEnemies(wave);

    combatSeed = (Math.imul(combatSeed, 1664525) + 1013904223) >>> 0;
    const combat = resolveCombat({ allies: freshAllies, enemies, seed: combatSeed });
    // Fenêtre glissante : seuls les DERNIERS combats sont conservés (replay de la
    // fin de course) — cf. GAUNTLET_REPLAY_KEEP.
    waveResults.push({ wave, isBoss: isGauntletBossWave(wave), combat });
    if (waveResults.length > GAUNTLET_REPLAY_KEEP) waveResults.shift();

    if (combat.result !== 'win') break;
    reachedWave = wave;
  }

  return {
    waveResults,
    fromWave,
    reachedWave,
    clearedNew: Math.max(0, reachedWave - best),
    newBestWave: Math.max(best, reachedWave),
  };
}
