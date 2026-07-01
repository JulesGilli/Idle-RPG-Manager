import { createRng } from './prng.ts';
import type {
  CombatEvent,
  CombatInput,
  CombatResult,
  CombatantFinalState,
  CombatantInput,
  Side,
} from './types.ts';

const DEFAULT_MAX_ROUNDS = 100;
const DAMAGE_VARIANCE = 0.15;
const HEAL_MULTIPLIER = 1.5;

type Fighter = CombatantInput & {
  side: Side;
  order: number; // index stable pour départager à vitesse égale
  maxHp: number;
  hp: number;
  alive: boolean;
};

function buildFighters(inputs: CombatantInput[], side: Side, offset: number): Fighter[] {
  return inputs.map((c, i) => ({
    ...c,
    side,
    order: offset + i,
    maxHp: c.hp,
    hp: c.hp,
    alive: c.hp > 0,
  }));
}

/** Ordre d'action : vitesse décroissante, puis alliés d'abord, puis ordre d'entrée. */
function turnOrder(fighters: Fighter[]): Fighter[] {
  return [...fighters].sort((a, b) => {
    if (b.speed !== a.speed) return b.speed - a.speed;
    if (a.side !== b.side) return a.side === 'ally' ? -1 : 1;
    return a.order - b.order;
  });
}

function livingOnSide(fighters: Fighter[], side: Side): Fighter[] {
  return fighters.filter((f) => f.side === side && f.alive);
}

/** Cible = ennemi vivant avec le moins de PV (focus fire), départage par ordre d'entrée. */
function pickTarget(candidates: Fighter[]): Fighter | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, f) => {
    if (f.hp < best.hp) return f;
    if (f.hp === best.hp && f.order < best.order) return f;
    return best;
  });
}

/** Allié le plus blessé (PV manquants max), null si tout le monde est au max. */
function pickHealTarget(allies: Fighter[]): Fighter | null {
  const wounded = allies.filter((f) => f.hp < f.maxHp);
  if (wounded.length === 0) return null;
  return wounded.reduce((best, f) => {
    const missing = f.maxHp - f.hp;
    const bestMissing = best.maxHp - best.hp;
    if (missing > bestMissing) return f;
    if (missing === bestMissing && f.order < best.order) return f;
    return best;
  });
}

/**
 * Résout un combat de façon déterministe pour une seed donnée.
 * Fonction pure : aucune I/O, aucune dépendance runtime.
 */
export function resolveCombat(input: CombatInput): CombatResult {
  const maxRounds = input.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const rng = createRng(input.seed);

  const allies = buildFighters(input.allies, 'ally', 0);
  const enemies = buildFighters(input.enemies, 'enemy', input.allies.length);
  const fighters = [...allies, ...enemies];

  const events: CombatEvent[] = [];
  let round = 0;

  const sideCleared = (side: Side): boolean => livingOnSide(fighters, side).length === 0;

  while (round < maxRounds && !sideCleared('ally') && !sideCleared('enemy')) {
    round += 1;

    for (const actor of turnOrder(fighters)) {
      if (!actor.alive) continue;
      if (sideCleared('ally') || sideCleared('enemy')) break;

      const enemySide: Side = actor.side === 'ally' ? 'enemy' : 'ally';

      // Soigneur : soigne l'allié le plus blessé s'il y en a un, sinon attaque.
      if (actor.role === 'healer') {
        const healTarget = pickHealTarget(livingOnSide(fighters, actor.side));
        if (healTarget) {
          const base = Math.round(actor.atk * HEAL_MULTIPLIER);
          const rolled = Math.max(1, Math.round(base * rng.variance(DAMAGE_VARIANCE)));
          const newHp = Math.min(healTarget.maxHp, healTarget.hp + rolled);
          const amount = newHp - healTarget.hp;
          healTarget.hp = newHp;
          events.push({
            type: 'heal',
            round,
            actorId: actor.id,
            targetId: healTarget.id,
            amount,
            targetHpAfter: healTarget.hp,
            message: `${actor.name} soigne ${healTarget.name} de ${amount} PV`,
          });
          continue;
        }
      }

      const target = pickTarget(livingOnSide(fighters, enemySide));
      if (!target) break;

      const base = Math.max(1, actor.atk - target.def);
      const damage = Math.max(1, Math.round(base * rng.variance(DAMAGE_VARIANCE)));
      target.hp = Math.max(0, target.hp - damage);
      events.push({
        type: 'attack',
        round,
        actorId: actor.id,
        targetId: target.id,
        damage,
        targetHpAfter: target.hp,
        message: `${actor.name} attaque ${target.name} — ${damage} dégâts`,
      });

      if (target.hp === 0) {
        target.alive = false;
        events.push({
          type: 'death',
          round,
          combatantId: target.id,
          message: `${target.name} est vaincu`,
        });
      }
    }
  }

  const result = sideCleared('enemy') ? 'win' : 'loss';
  events.push({
    type: 'end',
    round,
    result,
    message: result === 'win' ? 'Victoire !' : 'Défaite…',
  });

  const finalState: CombatantFinalState[] = fighters.map((f) => ({
    id: f.id,
    name: f.name,
    side: f.side,
    hp: f.hp,
    maxHp: f.maxHp,
    alive: f.alive,
  }));

  return { result, seed: input.seed, rounds: round, events, finalState };
}
