import { createRng } from './prng.ts';
import type {
  Ability,
  CombatEvent,
  CombatInput,
  CombatResult,
  CombatantFinalState,
  CombatantInput,
  PassiveType,
  Side,
  StatusType,
} from './types.ts';

const DEFAULT_MAX_ROUNDS = 100;
const DAMAGE_VARIANCE = 0.15;
const HEAL_MULTIPLIER = 1.5;
/** Plafond de pénétration d'armure (on ne peut pas ignorer plus de 90 % de la mitigation). */
const ARMOR_PEN_CAP = 0.9;

/** Statut actif sur un combattant (runtime). */
type ActiveStatus = {
  type: StatusType;
  turnsLeft: number;
  /** DoT : dégâts par tour (poison/burn). */
  dmgPerTurn: number;
  /** weaken : fraction de réduction ATK/DEF. */
  weaken: number;
  /** Nom de la source (pour les messages). */
  sourceName: string;
  /** Id de la source (pour la propagation / contagion). */
  sourceId: string;
};

type Fighter = CombatantInput & {
  side: Side;
  order: number; // index stable pour départager à vitesse égale
  maxHp: number;
  hp: number;
  alive: boolean;
  statuses: ActiveStatus[];
  reviveUsed: boolean;
};

/** Somme des valeurs d'un passif sur un combattant (0 si absent). */
function passive(f: Fighter, type: PassiveType): number {
  let total = 0;
  for (const p of f.passives ?? []) if (p.type === type) total += p.value;
  return total;
}

function abilitiesOf(f: Fighter, kind: Ability['kind']): Ability[] {
  return (f.abilities ?? []).filter((a) => a.kind === kind);
}

function hasStatus(f: Fighter, type: StatusType): boolean {
  return f.statuses.some((s) => s.type === type && s.turnsLeft > 0);
}

/** Fraction de mitigation ignorée par les abilités armor_pen (plafonnée). */
function armorPenOf(f: Fighter): number {
  let total = 0;
  for (const a of abilitiesOf(f, 'armor_pen')) if (a.kind === 'armor_pen') total += a.value;
  return Math.min(ARMOR_PEN_CAP, total);
}

/** Réduction ATK/DEF cumulée des statuts weaken (plafonnée à 90 %). */
function weakenOf(f: Fighter): number {
  let total = 0;
  for (const s of f.statuses) if (s.type === 'weaken' && s.turnsLeft > 0) total += s.weaken;
  return Math.min(0.9, total);
}

function effectiveAtk(f: Fighter): number {
  return Math.max(1, Math.round(f.atk * (1 - weakenOf(f))));
}

/** Mitigation totale = (DEF + armure) × (1 − weaken), réduite par la pénétration de l'attaquant. */
function mitigation(target: Fighter, attacker: Fighter): number {
  const raw = (target.def + (target.armor ?? 0)) * (1 - weakenOf(target));
  return Math.max(0, raw * (1 - armorPenOf(attacker)));
}

/** Bonus de dégâts si la cible est affligée d'un statut ciblé par amp_vs_status. */
function ampVsStatus(actor: Fighter, target: Fighter): number {
  let bonus = 0;
  for (const a of abilitiesOf(actor, 'amp_vs_status')) {
    if (a.kind === 'amp_vs_status' && hasStatus(target, a.status)) bonus += a.bonus;
  }
  return bonus;
}

function buildFighters(inputs: CombatantInput[], side: Side, offset: number): Fighter[] {
  return inputs.map((c, i) => ({
    ...c,
    side,
    order: offset + i,
    maxHp: c.hp,
    hp: c.hp,
    alive: c.hp > 0,
    statuses: [],
    reviveUsed: false,
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

const STATUS_LABEL: Record<StatusType, string> = {
  poison: 'empoisonné ☠️',
  burn: 'en feu 🔥',
  stun: 'étourdi 💫',
  weaken: 'affaibli 🩸',
};

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
  const byId = new Map(fighters.map((f) => [f.id, f]));

  const events: CombatEvent[] = [];
  let round = 0;

  /** Chance de contagion (propagation des DoT) d'un combattant, 0 si absent. */
  const contagionOf = (f: Fighter): number => {
    let c = 0;
    for (const a of abilitiesOf(f, 'contagion')) if (a.kind === 'contagion') c = Math.max(c, a.chance);
    return c;
  };

  const sideCleared = (side: Side): boolean => livingOnSide(fighters, side).length === 0;

  /** Applique des dégâts bruts (déjà calculés) à une cible + gère mort/résurrection. */
  const applyDamage = (actor: Fighter, target: Fighter, damage: number, message: string): void => {
    target.hp = Math.max(0, target.hp - damage);
    events.push({
      type: 'attack',
      round,
      actorId: actor.id,
      targetId: target.id,
      damage,
      targetHpAfter: target.hp,
      message,
    });
    if (target.hp === 0) killOrRevive(target);
  };

  const killOrRevive = (f: Fighter): void => {
    // Passif Renaissance (Paladin) : une fois par combat, revient à hpPct.
    const revive = abilitiesOf(f, 'revive').find((a) => a.kind === 'revive');
    if (revive && revive.kind === 'revive' && !f.reviveUsed) {
      f.reviveUsed = true;
      f.hp = Math.max(1, Math.round(f.maxHp * revive.hpPct));
      f.statuses = [];
      events.push({
        type: 'heal',
        round,
        actorId: f.id,
        targetId: f.id,
        amount: f.hp,
        targetHpAfter: f.hp,
        message: `${f.name} renaît à ${f.hp} PV ✨`,
      });
      return;
    }
    f.alive = false;
    events.push({ type: 'death', round, combatantId: f.id, message: `${f.name} est vaincu` });
  };

  /** Applique (ou rafraîchit) un statut sur une cible. */
  const applyStatus = (
    source: Fighter,
    target: Fighter,
    type: StatusType,
    potency: number,
    duration: number,
  ): void => {
    if (!target.alive || duration <= 0) return;
    const dmgPerTurn =
      type === 'poison' || type === 'burn'
        ? Math.max(1, Math.round(effectiveAtk(source) * potency))
        : 0;
    const weaken = type === 'weaken' ? potency : 0;
    applyStatusRaw(target, {
      type,
      turnsLeft: duration,
      dmgPerTurn,
      weaken,
      sourceName: source.name,
      sourceId: source.id,
    });
  };

  /** Applique/rafraîchit un statut déjà calculé (utilisé aussi par la contagion). */
  const applyStatusRaw = (target: Fighter, s: ActiveStatus): void => {
    if (!target.alive || s.turnsLeft <= 0) return;
    const existing = target.statuses.find((x) => x.type === s.type);
    if (existing) {
      existing.turnsLeft = Math.max(existing.turnsLeft, s.turnsLeft);
      existing.dmgPerTurn = Math.max(existing.dmgPerTurn, s.dmgPerTurn);
      existing.weaken = Math.max(existing.weaken, s.weaken);
      existing.sourceName = s.sourceName;
      existing.sourceId = s.sourceId;
    } else {
      target.statuses.push({ ...s });
    }
    events.push({
      type: 'status',
      round,
      combatantId: target.id,
      status: s.type,
      message: `${target.name} est ${STATUS_LABEL[s.type]}`,
    });
  };

  /** Déclenche les procs "on_hit" de l'attaquant sur une cible touchée. */
  const applyOnHitProcs = (actor: Fighter, target: Fighter): void => {
    if (!target.alive) return;
    for (const a of abilitiesOf(actor, 'on_hit')) {
      if (a.kind !== 'on_hit') continue;
      if (rng.next() < a.chance) applyStatus(actor, target, a.status, a.potency, a.duration);
    }
  };

  /** Résout une attaque simple d'`actor` sur `target` (avec passifs & procs). */
  const basicAttack = (actor: Fighter, target: Fighter): void => {
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
      return;
    }

    // Multiplicateurs offensifs conditionnels (passifs de l'attaquant + amp abilité).
    let mult = 1 + ampVsStatus(actor, target);
    const rage = passive(actor, 'rage');
    if (rage > 0 && actor.hp < actor.maxHp * 0.5) mult += rage;
    const venom = passive(actor, 'venom');
    if (venom > 0 && target.hp < target.maxHp) mult += venom;
    const firstStrike = passive(actor, 'first_strike');
    if (firstStrike > 0 && round === 1) mult += firstStrike;
    const execute = passive(actor, 'execute');
    if (execute > 0 && target.hp < target.maxHp * 0.3) mult += execute;

    const base = Math.max(1, effectiveAtk(actor) - mitigation(target, actor));
    let damage = Math.max(1, Math.round(base * rng.variance(DAMAGE_VARIANCE) * mult));

    const crit = passive(actor, 'crit');
    const isCrit = crit > 0 && rng.next() < crit;
    if (isCrit) damage *= 2;

    const shield = passive(target, 'shield');
    if (shield > 0) damage = Math.max(1, Math.round(damage * (1 - shield)));

    applyDamage(
      actor,
      target,
      damage,
      `${actor.name} attaque ${target.name} — ${damage} dégâts${isCrit ? ' ⚡ CRITIQUE' : ''}`,
    );

    // Procs "on_hit" : appliquent un statut à la cible touchée.
    applyOnHitProcs(actor, target);

    // Passif Vampirisme : l'attaquant se soigne d'une part des dégâts.
    const lifesteal = passive(actor, 'lifesteal');
    if (lifesteal > 0 && actor.hp < actor.maxHp && actor.alive) {
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
    if (thorns > 0 && target.alive) {
      const reflected = Math.max(1, Math.round(damage * thorns));
      applyDamage(
        target,
        actor,
        reflected,
        `Les épines de ${target.name} renvoient ${reflected} dégâts à ${actor.name} 🌵`,
      );
    }
  };

  /** Lance une abilité active (autocast) : AOE ou stun de zone. */
  const runAutocast = (actor: Fighter, ability: Ability, enemySide: Side): boolean => {
    if (ability.kind !== 'autocast') return false;
    const targets = livingOnSide(fighters, enemySide);
    if (targets.length === 0) return false;
    const action = ability.action;

    if (action.type === 'aoe') {
      events.push({
        type: 'status',
        round,
        combatantId: actor.id,
        message: `${actor.name} déchaîne une déflagration 💥`,
      });
      for (const t of targets) {
        if (!t.alive) continue;
        const base = Math.max(1, Math.round(effectiveAtk(actor) * action.dmgMult) - mitigation(t, actor));
        const damage = Math.max(1, Math.round(base * rng.variance(DAMAGE_VARIANCE)));
        applyDamage(actor, t, damage, `${actor.name} embrase ${t.name} — ${damage} dégâts 🔥`);
        if (t.alive && action.status && rng.next() < (action.statusChance ?? 1)) {
          applyStatus(actor, t, action.status, action.statusPotency ?? 0.1, action.statusDuration ?? 3);
        }
        // Combo : l'AOE relaie aussi tes procs on_hit (poison/feu/affaiblir).
        applyOnHitProcs(actor, t);
      }
      // Propagation du feu : les cibles en feu embrasent toutes les autres.
      if (action.spread && action.status === 'burn') {
        const burning = targets.filter((t) => t.alive && hasStatus(t, 'burn'));
        if (burning.length > 0) {
          for (const t of targets) {
            if (t.alive && !hasStatus(t, 'burn')) {
              applyStatus(actor, t, 'burn', action.statusPotency ?? 0.1, action.statusDuration ?? 3);
            }
          }
        }
      }
      return true;
    }

    // stun_all : frappe divine.
    events.push({
      type: 'status',
      round,
      combatantId: actor.id,
      message: `${actor.name} invoque une frappe divine ⚡`,
    });
    for (const t of targets) {
      if (!t.alive) continue;
      if (action.dmgMult && action.dmgMult > 0) {
        const base = Math.max(1, Math.round(effectiveAtk(actor) * action.dmgMult) - mitigation(t, actor));
        const damage = Math.max(1, Math.round(base * rng.variance(DAMAGE_VARIANCE)));
        applyDamage(actor, t, damage, `${actor.name} foudroie ${t.name} — ${damage} dégâts ⚡`);
      }
      if (t.alive) {
        applyStatus(actor, t, 'stun', 0, action.duration);
        // Combo : la frappe divine relaie aussi tes procs on_hit (affaiblir…).
        applyOnHitProcs(actor, t);
      }
    }
    return true;
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

    // Tic des DoT (poison/feu) en début de manche + propagation (contagion).
    const spreads: { target: Fighter; status: ActiveStatus }[] = [];
    for (const f of fighters) {
      if (!f.alive) continue;
      let dot = 0;
      for (const s of f.statuses) if (s.dmgPerTurn > 0 && s.turnsLeft > 0) dot += s.dmgPerTurn;
      if (dot <= 0) continue;
      const label = hasStatus(f, 'burn') ? '🔥' : '☠️';
      f.hp = Math.max(0, f.hp - dot);
      events.push({
        type: 'attack',
        round,
        actorId: f.id,
        targetId: f.id,
        damage: dot,
        targetHpAfter: f.hp,
        message: `${f.name} subit ${dot} dégâts ${label}`,
      });
      if (f.hp === 0) {
        killOrRevive(f);
        continue;
      }
      // Contagion : chaque DoT dont la source possède "contagion" peut se
      // propager à un autre ennemi du même camp qui n'a pas encore ce statut.
      for (const s of f.statuses) {
        if (s.dmgPerTurn <= 0 || s.turnsLeft <= 0) continue;
        const source = byId.get(s.sourceId);
        const chance = source ? contagionOf(source) : 0;
        if (chance <= 0 || rng.next() >= chance) continue;
        const candidate = livingOnSide(fighters, f.side).find(
          (o) => o.id !== f.id && !hasStatus(o, s.type),
        );
        if (candidate) spreads.push({ target: candidate, status: { ...s } });
      }
    }
    for (const sp of spreads) applyStatusRaw(sp.target, sp.status);

    for (const actor of turnOrder(fighters)) {
      if (!actor.alive) continue;
      if (sideCleared('ally') || sideCleared('enemy')) break;

      // Étourdissement : saute le tour, consomme une charge de stun.
      const stun = actor.statuses.find((s) => s.type === 'stun' && s.turnsLeft > 0);
      if (stun) {
        stun.turnsLeft -= 1;
        events.push({
          type: 'status',
          round,
          combatantId: actor.id,
          status: 'stun',
          message: `${actor.name} est étourdi et passe son tour 💫`,
        });
        continue;
      }

      const enemySide: Side = actor.side === 'ally' ? 'enemy' : 'ally';

      // Abilité active prête (autocast à cooldown) : prioritaire sur l'attaque.
      const ready = abilitiesOf(actor, 'autocast').find(
        (a) => a.kind === 'autocast' && a.everyRounds > 0 && round % a.everyRounds === 0,
      );
      if (ready && runAutocast(actor, ready, enemySide)) continue;

      // Soigneur : soigne l'allié le plus blessé s'il y en a un, sinon attaque.
      if (actor.role === 'healer') {
        const healTarget = pickHealTarget(livingOnSide(fighters, actor.side));
        if (healTarget) {
          const base = Math.round(effectiveAtk(actor) * HEAL_MULTIPLIER);
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

      basicAttack(actor, target);

      // Multi-cibles (Volée) : frappe des cibles supplémentaires.
      const multi = abilitiesOf(actor, 'multi_shot').find((a) => a.kind === 'multi_shot');
      if (multi && multi.kind === 'multi_shot' && rng.next() < multi.chance) {
        const extras = livingOnSide(fighters, enemySide).filter((t) => t.id !== target.id);
        for (let k = 0; k < multi.extraTargets && k < extras.length; k++) {
          if (sideCleared(enemySide)) break;
          basicAttack(actor, extras[k]!);
        }
      }
    }

    // Fin de manche : décrémente les durées des DoT/weaken, purge l'expiré.
    for (const f of fighters) {
      for (const s of f.statuses) if (s.type !== 'stun') s.turnsLeft -= 1;
      f.statuses = f.statuses.filter((s) => s.turnsLeft > 0);
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
