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
import { scaleEnemyStatsForArc } from './arc.ts';
import type { CombatantInput, CombatResult } from '../combat/types.ts';

/** Ressource produite par le Gauntlet — améliore les armes divines. Clé `player_resources`. */
export const ETERNITY_RESOURCE = 'eclat_eternite';

/**
 * Garde-fou anti-boucle-infinie. Le scaling exponentiel fait qu'aucune escouade
 * ne franchit une vague aussi haute ; ce plafond n'est qu'un filet de sécurité si
 * un build dégénéré one-shot tout (sinon la simulation ne se terminerait jamais).
 */
export const GAUNTLET_MAX_WAVE = 200;

/* ------------------------------------------------------------- SCALING ----- */
// ⚠️ Premiers jets — À PASSER AU SIMULATEUR (`npm run sim`). Ces constantes sont
// les SEULS leviers de difficulté : stats de départ d'une vague + croissance par
// vague + montée du nombre d'ennemis.

/** Stats de l'ennemi de référence à la vague 1. */
const BASE_HP = 800;
const BASE_ATK = 60;
const BASE_DEF = 30;

/** Croissance MULTIPLICATIVE des PV/ATK par vague (composée). 1.12 = +12 %/vague. */
const HP_GROWTH = 1.12;
const ATK_GROWTH = 1.12;
/** La DEF monte linéairement (la composer ferait des combats nuls en fin de course). */
const DEF_PER_WAVE = 2;

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
  const hp = Math.round(BASE_HP * Math.pow(HP_GROWTH, w - 1));
  const atk = Math.round(BASE_ATK * Math.pow(ATK_GROWTH, w - 1));
  const def = Math.round(BASE_DEF + DEF_PER_WAVE * (w - 1));
  const speed = 10 + Math.floor(w / 5);

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
 * Sous la vague 1 (aucun record) → 0/jour. Barème « 1 → 10 → 20 → 50 » demandé.
 *
 * ⚠️ Robinet unique de l'amélioration des armes divines : à régler avec le coût
 * de `divineUpgradeCost` (cf. divine.ts). Seul levier de la rente.
 */
export const ETERNITY_PRODUCTION_TIERS: readonly { wave: number; perDay: number }[] = [
  { wave: 1, perDay: 1 },
  { wave: 5, perDay: 2 },
  { wave: 10, perDay: 5 },
  { wave: 15, perDay: 10 },
  { wave: 20, perDay: 20 },
  { wave: 30, perDay: 35 },
  { wave: 40, perDay: 50 },
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
  waveResults: GauntletWaveResult[];
  reachedWave: number; // dernière vague GAGNÉE (0 si échec dès la vague 1)
  clearedNew: number; // vagues gagnées au-delà de l'ancien record
  newBestWave: number; // record après cette course
};

/**
 * Simule une course de Gauntlet à partir de la vague 1, avec l'escouade `allies`
 * (jusqu'à 5 héros, stats effectives, `hp` = PV max). Chaque vague se joue à PV
 * pleins ; la course s'arrête à la première vague non gagnée.
 *
 * @param seed         seed serveur (jamais fournie par le client).
 * @param previousBest meilleure vague déjà atteinte (pour calculer `clearedNew`).
 * @param arc          arc courant (New Game+) : scale les PV/ATK des ennemis.
 */
export function simulateGauntletRun(
  seed: number,
  allies: CombatantInput[],
  previousBest = 0,
  arc = 1,
): GauntletRunResult {
  const waveResults: GauntletWaveResult[] = [];
  let combatSeed = seed >>> 0;
  let reachedWave = 0;
  // Chaque vague : escouade à PV pleins.
  const freshAllies = allies.map((a) => ({ ...a, startHp: a.hp }));

  for (let wave = 1; wave <= GAUNTLET_MAX_WAVE; wave++) {
    const base = gauntletWaveEnemies(wave);
    const enemies = base.map((e) => {
      const scaled = scaleEnemyStatsForArc({ hp: e.hp, atk: e.atk }, arc);
      return { ...e, hp: scaled.hp, atk: scaled.atk };
    });

    combatSeed = (Math.imul(combatSeed, 1664525) + 1013904223) >>> 0;
    const combat = resolveCombat({ allies: freshAllies, enemies, seed: combatSeed });
    waveResults.push({ wave, isBoss: isGauntletBossWave(wave), combat });

    if (combat.result !== 'win') break;
    reachedWave = wave;
  }

  return {
    waveResults,
    reachedWave,
    clearedNew: Math.max(0, reachedWave - previousBest),
    newBestWave: Math.max(previousBest, reachedWave),
  };
}
