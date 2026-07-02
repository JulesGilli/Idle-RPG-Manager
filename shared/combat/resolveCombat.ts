import { createRng } from './prng.ts';
import type {
  CombatEvent,
  CombatInput,
  CombatResult,
  CombatantFinalState,
  CombatantInput,
  PassiveType,
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

/** Somme des valeurs d'un passif sur un combattant (0 si absent). */
function passive(f: Fighter, type: PassiveType): number {
  let total = 0;
  for (const p of f.passives ?? []) if (p.type === type) total += p.value;
  return total;
}

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

  const kill = (f: Fighter): void => {
    f.alive = false;
    events.push({
      type: 'death',
      round,
      combatantId: f.id,
      message: `${f.name} est vaincu`,
    });
  };

  while (round < maxRounds && !sideCleared('ally') && !sideCleared('enemy')) {
    round += 1;

    // Passif Régénération : chaque combattant vivant récupère X% de ses PV max.
    for (const f of fighters) {
      if (!f.alive) continue;
      const regen = passive(f, 'regen');
      if (regen <= 0 || f.hp >= f.maxHp) continue;
      const amount = Math.min(f.maxHp - f.hp, Math.max(1, Math.round(f.maxHp * regen)));
      f.hp += amount;
      events.push({
        type: 'heal',
        round,
        actorId: f.id,
        targetId: f.id,
        amount,
        targetHpAfter: f.hp,
        message: `${f.name} régénère ${amount} PV 🌿`,
      });
    }

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

      // Passif Esquive : la cible peut annuler complètement l'attaque.
      const dodge = passive(target, 'dodge');
      if (dodge > 0 && rng.next() < dodge) {
        events.push({
          type: 'attack',
          round,
          actorId: actor.id,
          targetId: target.id,
          damage: 0,
          targetHpAfter: target.hp,
          message: `${target.name} esquive l'attaque de ${actor.name} 💨`,
        });
        continue;
      }

      // Multiplicateurs offensifs conditionnels (passifs de l'attaquant).
      let mult = 1;
      const rage = passive(actor, 'rage');
      if (rage > 0 && actor.hp < actor.maxHp * 0.5) mult += rage;
      const venom = passive(actor, 'venom');
      if (venom > 0 && target.hp < target.maxHp) mult += venom;
      const firstStrike = passive(actor, 'first_strike');
      if (firstStrike > 0 && round === 1) mult += firstStrike;
      const execute = passive(actor, 'execute');
      if (execute > 0 && target.hp < target.maxHp * 0.3) mult += execute;

      const base = Math.max(1, actor.atk - target.def);
      let damage = Math.max(1, Math.round(base * rng.variance(DAMAGE_VARIANCE) * mult));

      // Passif Critique : dégâts doublés.
      const crit = passive(actor, 'crit');
      const isCrit = crit > 0 && rng.next() < crit;
      if (isCrit) damage *= 2;

      // Passif Égide : la cible réduit les dégâts subis.
      const shield = passive(target, 'shield');
      if (shield > 0) damage = Math.max(1, Math.round(damage * (1 - shield)));

      target.hp = Math.max(0, target.hp - damage);
      events.push({
        type: 'attack',
        round,
        actorId: actor.id,
        targetId: target.id,
        damage,
        targetHpAfter: target.hp,
        message: `${actor.name} attaque ${target.name} — ${damage} dégâts${isCrit ? ' ⚡ CRITIQUE' : ''}`,
      });
      if (target.hp === 0) kill(target);

      // Passif Vampirisme : l'attaquant se soigne d'une part des dégâts.
      const lifesteal = passive(actor, 'lifesteal');
      if (lifesteal > 0 && actor.hp < actor.maxHp) {
        const amount = Math.min(actor.maxHp - actor.hp, Math.max(1, Math.round(damage * lifesteal)));
        actor.hp += amount;
        events.push({
          type: 'heal',
          round,
          actorId: actor.id,
          targetId: actor.id,
          amount,
          targetHpAfter: actor.hp,
          message: `${actor.name} draine ${amount} PV 🩸`,
        });
      }

      // Passif Épines : la cible renvoie une part des dégâts subis.
      const thorns = passive(target, 'thorns');
      if (thorns > 0) {
        const reflected = Math.max(1, Math.round(damage * thorns));
        actor.hp = Math.max(0, actor.hp - reflected);
        events.push({
          type: 'attack',
          round,
          actorId: target.id,
          targetId: actor.id,
          damage: reflected,
          targetHpAfter: actor.hp,
          message: `Les épines de ${target.name} renvoient ${reflected} dégâts à ${actor.name} 🌵`,
        });
        if (actor.hp === 0) kill(actor);
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
