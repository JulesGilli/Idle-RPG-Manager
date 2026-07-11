/**
 * Résolution idle d'un déploiement : une équipe enchaîne des combats sur les
 * niveaux d'une map. Victoire → récompenses + avance (ou reste si mode 'loop').
 * Défaite → recul d'un niveau. Full vie à chaque combat (allies non muté).
 * Fonction pure et déterministe (rejoue depuis une seed) — testable.
 */
import { resolveCombat } from '../combat/resolveCombat.ts';
import { scaleNormalMonster, withStunImmunity } from '../combat/difficulty.ts';
import type { CombatantInput, CombatResult } from '../combat/types.ts';

export const SECONDS_PER_FIGHT = 20;
export const OFFLINE_FIGHT_CAP = 400;
/**
 * Délai minimal entre deux assauts manuels (mode 'advance'). Aligné sur
 * SECONDS_PER_FIGHT pour que le farm manuel ne soit pas plus rapide que l'idle.
 * Vérifié CÔTÉ SERVEUR (Date.now() serveur vs last_resolved_at stocké) : ni la
 * vitesse de replay, ni un appel direct à l'edge function ne peuvent le contourner.
 */
export const FIGHT_COOLDOWN_SECONDS = 20;

export type LevelDef = {
  index: number; // position dans la map (0-based)
  difficulty: number;
  isBoss: boolean;
  enemies: CombatantInput[];
};

export function fightXp(difficulty: number): number {
  return 4 + difficulty * 2;
}
export function fightGold(difficulty: number): number {
  return 4 + difficulty * 2;
}

export function fightsForElapsed(elapsedSeconds: number): number {
  return Math.min(OFFLINE_FIGHT_CAP, Math.max(0, Math.floor(elapsedSeconds / SECONDS_PER_FIGHT)));
}

export type DeploymentBatchResult = {
  startIndex: number;
  endIndex: number;
  fights: number;
  wins: number;
  losses: number;
  xpPerHero: number;
  gold: number;
  resourcePoints: number; // → ressource de la zone
  bossWins: number; // victoires sur un niveau boss
  clearedIndices: number[]; // niveaux gagnés au moins une fois pendant ce batch
  lootDifficulty: number;
  lastCombat: CombatResult | null;
};

/**
 * Simule `fights` combats à partir du niveau `startIndex` de `levels`.
 * `allies` = combattants prêts (stats effectives) ; ils repartent full vie
 * à chaque combat car resolveCombat ne mute pas ses entrées.
 */
export function resolveDeploymentBatch(params: {
  allies: CombatantInput[];
  levels: LevelDef[];
  startIndex: number;
  mode: 'advance' | 'loop';
  fights: number;
  seed: number;
}): DeploymentBatchResult {
  const { allies, levels, mode, fights } = params;
  // Difficulté : les niveaux non-boss voient leurs mobs renforcés ; les boss
  // deviennent insensibles au stun (stats inchangées). Précalculé une fois car
  // les ennemis sont rejoués tels quels à chaque combat (resolveCombat ne mute pas).
  const tunedEnemies: CombatantInput[][] = levels.map((level) =>
    level.isBoss
      ? level.enemies.map(withStunImmunity)
      : level.enemies.map(scaleNormalMonster),
  );
  let idx = params.startIndex;
  let wins = 0;
  let losses = 0;
  let xpPerHero = 0;
  let gold = 0;
  let resourcePoints = 0;
  let bossWins = 0;
  const cleared = new Set<number>();
  let lastCombat: CombatResult | null = null;
  let seed = params.seed >>> 0;

  for (let f = 0; f < fights; f++) {
    const level = levels[idx];
    if (!level) break;

    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const combat = resolveCombat({ allies, enemies: tunedEnemies[idx]!, seed });
    lastCombat = combat;

    if (combat.result === 'win') {
      wins += 1;
      xpPerHero += fightXp(level.difficulty);
      gold += fightGold(level.difficulty);
      resourcePoints += 1 + Math.floor(level.difficulty / 3);
      if (level.isBoss) bossWins += 1;
      cleared.add(idx);
      if (mode === 'advance' && idx < levels.length - 1) idx += 1;
    } else {
      losses += 1;
      if (idx > 0) idx -= 1;
    }
  }

  return {
    startIndex: params.startIndex,
    endIndex: idx,
    fights,
    wins,
    losses,
    xpPerHero,
    gold,
    resourcePoints,
    bossWins,
    clearedIndices: [...cleared],
    lootDifficulty: levels[idx]?.difficulty ?? levels[params.startIndex]?.difficulty ?? 1,
    lastCombat,
  };
}
