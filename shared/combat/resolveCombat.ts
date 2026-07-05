import { createRng, type Rng } from './prng.ts';
import type {
  Ability,
  CombatEvent,
  CombatInput,
  CombatResult,
  CombatantFinalState,
  CombatantInput,
  MarkType,
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

/** Buff temporaire à durée (fraction cumulée par champ, décrémenté chaque manche). */
type TimedBuff = {
  turnsLeft: number;
  atk?: number;
  def?: number;
  speed?: number;
  dmg?: number;
  reduce?: number;
  thornsMult?: number;
  reflect?: number;
  heal?: number;
};

type Fighter = CombatantInput & {
  side: Side;
  order: number; // index stable pour départager à vitesse égale
  maxHp: number;
  hp: number;
  alive: boolean;
  statuses: ActiveStatus[];
  reviveUsed: boolean;
  /** Compteurs de marques cumulables (feu empilable, marque arcanique). */
  stacks: Record<MarkType, number>;
  /** Barrière absorbante courante (PV temporaires, regénérée chaque tour). */
  barrier: number;
  /** Buffs temporaires actifs (auras chronométrées, renvoi, etc.). */
  buffs: TimedBuff[];
};

/** Somme d'un champ de buff sur tous les buffs actifs d'un combattant. */
function buffSum(f: Fighter, key: keyof Omit<TimedBuff, 'turnsLeft'>): number {
  let total = 0;
  for (const b of f.buffs) if (b.turnsLeft > 0) total += b[key] ?? 0;
  return total;
}

/** Statuts considérés « négatifs » (ciblés par l'immunité). */
const NEGATIVE_STATUSES: StatusType[] = ['poison', 'burn', 'stun', 'weaken'];

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
  return Math.max(1, Math.round(f.atk * (1 + buffSum(f, 'atk')) * (1 - weakenOf(f))));
}

/** Vitesse effective (buffs temporaires inclus) pour l'ordre d'action. */
function effectiveSpeed(f: Fighter): number {
  return f.speed * (1 + buffSum(f, 'speed'));
}

/** Mitigation totale = (DEF + armure) × (1 − weaken), réduite par la pénétration de l'attaquant. */
function mitigation(target: Fighter, attacker: Fighter): number {
  const def = Math.max(0, target.def * (1 + buffSum(target, 'def')));
  const raw = (def + (target.armor ?? 0)) * (1 - weakenOf(target));
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

/**
 * Applique les bonus de stats permanents (`stat_mod`) au setup : auras d'équipe
 * (scope 'team', partagées par tout le camp) + buffs personnels (scope 'self').
 * value = fraction cumulée par stat. Renvoie de nouveaux inputs aux stats boostées.
 */
function applyAuras(inputs: CombatantInput[]): CombatantInput[] {
  const team = { atk: 0, def: 0, hp: 0 };
  for (const c of inputs) {
    for (const a of c.abilities ?? []) {
      if (a.kind === 'stat_mod' && a.scope === 'team') team[a.stat] += a.value;
    }
  }
  const hasAny = team.atk > 0 || team.def > 0 || team.hp > 0
    || inputs.some((c) => (c.abilities ?? []).some((a) => a.kind === 'stat_mod' && a.scope === 'self'));
  if (!hasAny) return inputs;

  return inputs.map((c) => {
    const self = { atk: 0, def: 0, hp: 0 };
    for (const a of c.abilities ?? []) {
      if (a.kind === 'stat_mod' && a.scope === 'self') self[a.stat] += a.value;
    }
    const mult = (stat: 'atk' | 'def' | 'hp'): number => 1 + team[stat] + self[stat];
    const scaled: CombatantInput = {
      ...c,
      atk: Math.max(1, Math.round(c.atk * mult('atk'))),
      def: Math.round(c.def * mult('def')),
      hp: Math.max(1, Math.round(c.hp * mult('hp'))),
    };
    // Conserve la proportion de PV en cours (donjons multi-combats) sans forcer la clé.
    if (c.startHp !== undefined) scaled.startHp = Math.max(0, Math.round(c.startHp * mult('hp')));
    return scaled;
  });
}

function buildFighters(inputs: CombatantInput[], side: Side, offset: number): Fighter[] {
  return inputs.map((c, i) => {
    const maxHp = c.hp;
    // PV de départ : `startHp` si fourni (donjons multi-combats), sinon plein.
    const hp = Math.max(0, Math.min(maxHp, c.startHp ?? maxHp));
    return {
      ...c,
      side,
      order: offset + i,
      maxHp,
      hp,
      alive: hp > 0,
      statuses: [],
      reviveUsed: false,
      stacks: { burn: 0, arcane: 0 },
      barrier: 0,
      buffs: [],
    };
  });
}

/** Ordre d'action : vitesse décroissante, puis alliés d'abord, puis ordre d'entrée. */
function turnOrder(fighters: Fighter[]): Fighter[] {
  return [...fighters].sort((a, b) => {
    const sa = effectiveSpeed(a);
    const sb = effectiveSpeed(b);
    if (sb !== sa) return sb - sa;
    if (a.side !== b.side) return a.side === 'ally' ? -1 : 1;
    return a.order - b.order;
  });
}

function livingOnSide(fighters: Fighter[], side: Side): Fighter[] {
  return fighters.filter((f) => f.side === side && f.alive);
}

/**
 * Choisit la cible d'un attaquant parmi `candidates` (ennemis vivants).
 * 1. Provocation : si des cibles provoquent, on ne vise qu'elles.
 * 2. `random` (attaques ennemies) : cible tirée au hasard, pour ne pas
 *    achever systématiquement le plus fragile (le mage mourait toujours en 1er).
 * 3. sinon (attaques alliées) : focus fire sur le plus bas PV (départage par ordre).
 */
function threatOf(f: Fighter): number {
  let t = 0;
  for (const a of f.abilities ?? []) if (a.kind === 'threat') t += a.value;
  return Math.max(0, t);
}

function pickTarget(candidates: Fighter[], random: boolean, rng: Rng): Fighter | null {
  if (candidates.length === 0) return null;
  const taunters = candidates.filter((f) => hasStatus(f, 'taunt'));
  const pool = taunters.length > 0 ? taunters : candidates;
  if (random) {
    // Sans menace (agro), tirage uniforme (comportement historique inchangé).
    const totalThreat = pool.reduce((s, f) => s + threatOf(f), 0);
    if (totalThreat <= 0) return pool[rng.int(0, pool.length - 1)] ?? null;
    // Sinon, tirage pondéré par la menace (1 + threat).
    const weights = pool.map((f) => 1 + threatOf(f));
    const total = weights.reduce((s, w) => s + w, 0);
    let r = rng.next() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i]!;
      if (r < 0) return pool[i]!;
    }
    return pool[pool.length - 1] ?? null;
  }
  return pool.reduce((best, f) => {
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
  poison: 'empoisonné',
  burn: 'en feu',
  stun: 'étourdi',
  weaken: 'affaibli',
  taunt: 'provocateur',
};

/**
 * Résout un combat de façon déterministe pour une seed donnée.
 * Fonction pure : aucune I/O, aucune dépendance runtime.
 */
export function resolveCombat(input: CombatInput): CombatResult {
  const maxRounds = input.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const rng = createRng(input.seed);

  const allies = buildFighters(applyAuras(input.allies), 'ally', 0);
  const enemies = buildFighters(applyAuras(input.enemies), 'enemy', input.allies.length);
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
    let dealt = damage;
    // Réduction temporaire des dégâts subis (Vengeance du damné…).
    const reduce = Math.min(0.9, buffSum(target, 'reduce'));
    if (reduce > 0 && dealt > 0) dealt = Math.max(1, Math.round(dealt * (1 - reduce)));
    // Barrière : absorbe ensuite (PV temporaires).
    if (target.barrier > 0 && dealt > 0) {
      const absorbed = Math.min(target.barrier, dealt);
      target.barrier -= absorbed;
      dealt -= absorbed;
    }
    target.hp = Math.max(0, target.hp - dealt);
    events.push({
      type: 'attack',
      round,
      actorId: actor.id,
      targetId: target.id,
      damage: dealt,
      targetHpAfter: target.hp,
      message,
    });
    if (target.hp === 0 && target.alive) killOrRevive(target);
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
        message: `${f.name} renaît à ${f.hp} PV`,
      });
      return;
    }
    f.alive = false;
    events.push({ type: 'death', round, combatantId: f.id, message: `${f.name} est vaincu` });
  };

  /** Applique (ou rafraîchit) un statut sur une cible. */
  /** Immunité : chance d'ignorer un statut négatif entrant (Paladin Bastion). */
  const resistsStatus = (target: Fighter, type: StatusType): boolean => {
    if (!NEGATIVE_STATUSES.includes(type)) return false;
    for (const a of abilitiesOf(target, 'immune')) {
      if (a.kind !== 'immune') continue;
      if (a.statuses && !a.statuses.includes(type)) continue;
      if (rng.next() < a.chance) return true;
    }
    return false;
  };

  const applyStatus = (
    source: Fighter,
    target: Fighter,
    type: StatusType,
    potency: number,
    duration: number,
  ): void => {
    if (!target.alive || duration <= 0) return;
    if (resistsStatus(target, type)) {
      events.push({
        type: 'status',
        round,
        combatantId: target.id,
        status: type,
        message: `${target.name} résiste à l'effet ${STATUS_LABEL[type]}`,
      });
      return;
    }
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
        message: `${target.name} esquive l'attaque de ${actor.name}`,
      });
      return;
    }

    // Multiplicateurs offensifs conditionnels (passifs de l'attaquant + amp abilité).
    let mult = 1 + ampVsStatus(actor, target);
    // +dégâts par stack de marque présente sur la cible (combustion, marque arcanique).
    for (const a of abilitiesOf(actor, 'amp_per_stack')) {
      if (a.kind === 'amp_per_stack') mult += a.bonus * (target.stacks[a.mark] ?? 0);
    }
    const rage = passive(actor, 'rage');
    if (rage > 0 && actor.hp < actor.maxHp * 0.5) mult += rage;
    const venom = passive(actor, 'venom');
    if (venom > 0 && target.hp < target.maxHp) mult += venom;
    const firstStrike = passive(actor, 'first_strike');
    if (firstStrike > 0 && round === 1) mult += firstStrike;
    const execute = passive(actor, 'execute');
    if (execute > 0 && target.hp < target.maxHp * 0.3) mult += execute;
    // Buffs temporaires de dégâts (rage d'équipe, Concert céleste…).
    mult += buffSum(actor, 'dmg');

    const barrierBefore = target.barrier;
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
      `${actor.name} attaque ${target.name} — ${damage} dégâts${isCrit ? ' CRITIQUE' : ''}`,
    );

    // Procs "on_hit" : appliquent un statut à la cible touchée.
    applyOnHitProcs(actor, target);

    // Marques cumulables (feu empilable / marque arcanique) + détonation au seuil.
    if (target.alive) {
      for (const a of abilitiesOf(actor, 'stack_on_hit')) {
        if (a.kind !== 'stack_on_hit') continue;
        if (rng.next() < a.chance) {
          target.stacks[a.mark] = Math.min(a.max, (target.stacks[a.mark] ?? 0) + 1);
        }
      }
      for (const a of abilitiesOf(actor, 'detonate')) {
        if (a.kind !== 'detonate') continue;
        if ((target.stacks[a.mark] ?? 0) >= a.threshold) {
          const burst = Math.max(1, Math.round(effectiveAtk(actor) * a.dmgMult));
          target.stacks[a.mark] = 0;
          applyDamage(actor, target, burst, `${actor.name} fait exploser ${target.name} — ${burst} dégâts`);
        }
      }
    }

    // Contrecoup : si la barrière de la cible vient d'être brisée, elle riposte.
    if (target.alive && barrierBefore > 0 && target.barrier === 0) {
      for (const a of abilitiesOf(target, 'riposte_shield')) {
        if (a.kind !== 'riposte_shield') continue;
        const rip = Math.max(1, Math.round(damage * a.bonus));
        applyDamage(target, actor, rip, `${target.name} riposte à ${actor.name} — ${rip} dégâts`);
      }
    }

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
        message: `${actor.name} draine ${amount} PV`,
      });
    }

    // Épines : renvoi d'une part des dégâts (amplifié par Miroir, ou renvoi total par Vengeance).
    const thornsBase = passive(target, 'thorns') * (1 + buffSum(target, 'thornsMult'));
    const reflectFrac = Math.max(thornsBase, buffSum(target, 'reflect'));
    if (reflectFrac > 0 && target.alive) {
      const reflected = Math.max(1, Math.round(damage * reflectFrac));
      applyDamage(
        target,
        actor,
        reflected,
        `Les épines de ${target.name} renvoient ${reflected} dégâts à ${actor.name}`,
      );
    }
  };

  /** Multiplicateur de soin de l'acteur (abilités heal_amp). */
  const healAmpOf = (f: Fighter): number => {
    let b = 0;
    for (const a of abilitiesOf(f, 'heal_amp')) if (a.kind === 'heal_amp') b += a.bonus;
    return 1 + b;
  };

  /** Soigne une cible ; renvoie le montant réellement rendu. */
  const heal = (actor: Fighter, target: Fighter, amount: number, message: string): number => {
    const preHp = target.hp;
    const newHp = Math.min(target.maxHp, target.hp + Math.max(0, amount));
    const gained = newHp - target.hp;
    target.hp = newHp;
    if (gained > 0) {
      events.push({ type: 'heal', round, actorId: actor.id, targetId: target.id, amount: gained, targetHpAfter: target.hp, message });
      // Second souffle : soigner un allié sous 50 % PV lui octroie de l'ATK temporaire.
      if (preHp < target.maxHp * 0.5) {
        for (const a of abilitiesOf(actor, 'heal_buff')) {
          if (a.kind === 'heal_buff') target.buffs.push({ turnsLeft: a.duration, atk: a.atk });
        }
      }
    }
    return gained;
  };

  /** Lance une abilité active (autocast). Renvoie true si l'action a été exécutée. */
  const runAutocast = (actor: Fighter, ability: Ability, enemySide: Side): boolean => {
    if (ability.kind !== 'autocast') return false;
    const action = ability.action;

    // Soin de zone : cible les alliés blessés (propre camp).
    if (action.type === 'heal_all') {
      const wounded = livingOnSide(fighters, actor.side).filter((f) => f.hp < f.maxHp);
      if (wounded.length === 0) return false;
      events.push({ type: 'status', round, combatantId: actor.id, message: `${actor.name} invoque une lumière bienfaisante` });
      const amp = healAmpOf(actor);
      for (const t of wounded) {
        heal(actor, t, Math.round(t.maxHp * action.pct * amp), `${actor.name} soigne ${t.name}`);
      }
      return true;
    }

    // Buff temporaire (soi ou toute l'équipe) : Rituel, Concert, Miroir, Vengeance.
    if (action.type === 'buff') {
      const recipients = action.scope === 'team' ? livingOnSide(fighters, actor.side) : [actor];
      const b: TimedBuff = { turnsLeft: action.duration };
      for (const k of ['atk', 'def', 'speed', 'dmg', 'reduce', 'thornsMult', 'reflect'] as const) {
        const v = action[k];
        if (typeof v === 'number') b[k] = v;
      }
      events.push({
        type: 'status',
        round,
        combatantId: actor.id,
        message: action.scope === 'team' ? `${actor.name} galvanise l'équipe` : `${actor.name} s'entoure d'une aura`,
      });
      for (const r of recipients) r.buffs.push({ ...b });
      return true;
    }

    const targets = livingOnSide(fighters, enemySide);
    if (targets.length === 0) return false;

    switch (action.type) {
      case 'aoe': {
        events.push({ type: 'status', round, combatantId: actor.id, message: `${actor.name} déchaîne une déflagration` });
        for (const t of targets) {
          if (!t.alive) continue;
          const base = Math.max(1, Math.round(effectiveAtk(actor) * action.dmgMult) - mitigation(t, actor));
          const damage = Math.max(1, Math.round(base * rng.variance(DAMAGE_VARIANCE)));
          applyDamage(actor, t, damage, `${actor.name} embrase ${t.name} — ${damage} dégâts`);
          if (t.alive && action.status && rng.next() < (action.statusChance ?? 1)) {
            applyStatus(actor, t, action.status, action.statusPotency ?? 0.1, action.statusDuration ?? 3);
          }
          if (t.alive && action.mark) t.stacks[action.mark] = Math.min(99, (t.stacks[action.mark] ?? 0) + 1);
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

      case 'stun_all': {
        events.push({ type: 'status', round, combatantId: actor.id, message: `${actor.name} invoque une frappe divine` });
        for (const t of targets) {
          if (!t.alive) continue;
          if (action.dmgMult && action.dmgMult > 0) {
            const base = Math.max(1, Math.round(effectiveAtk(actor) * action.dmgMult) - mitigation(t, actor));
            const damage = Math.max(1, Math.round(base * rng.variance(DAMAGE_VARIANCE)));
            applyDamage(actor, t, damage, `${actor.name} foudroie ${t.name} — ${damage} dégâts`);
          }
          if (t.alive) {
            applyStatus(actor, t, 'stun', 0, action.duration);
            applyOnHitProcs(actor, t);
          }
        }
        return true;
      }

      case 'nuke': {
        const t = pickTarget(targets, false, rng);
        if (!t) return false;
        events.push({ type: 'status', round, combatantId: actor.id, message: `${actor.name} concentre un sort dévastateur` });
        const base = Math.max(1, Math.round(effectiveAtk(actor) * action.dmgMult) - mitigation(t, actor));
        const damage = Math.max(1, Math.round(base * rng.variance(DAMAGE_VARIANCE)));
        applyDamage(actor, t, damage, `${actor.name} anéantit ${t.name} — ${damage} dégâts`);
        if (t.alive && action.status) applyStatus(actor, t, action.status, action.statusPotency ?? 0.2, action.statusDuration ?? 2);
        if (t.alive && action.mark) t.stacks[action.mark] = Math.min(99, (t.stacks[action.mark] ?? 0) + 1);
        return true;
      }

      case 'pct_hp': {
        const t = pickTarget(targets, false, rng);
        if (!t) return false;
        // min(PV max × pct, ATK × capMult) : fort sur cibles normales, plafonné sur les boss.
        const dmg = Math.max(
          1,
          Math.min(Math.round(t.maxHp * action.pct), Math.round(effectiveAtk(actor) * action.capMult)),
        );
        events.push({ type: 'status', round, combatantId: actor.id, message: `${actor.name} vise un point vital` });
        applyDamage(actor, t, dmg, `${actor.name} transperce ${t.name} — ${dmg} dégâts`);
        return true;
      }

      case 'multi_hit': {
        events.push({ type: 'status', round, combatantId: actor.id, message: `${actor.name} déchaîne une rafale` });
        for (let h = 0; h < action.hits; h++) {
          const alive = livingOnSide(fighters, enemySide);
          if (alive.length === 0) break;
          for (const t of alive) {
            const base = Math.max(1, Math.round(effectiveAtk(actor) * action.dmgMult) - mitigation(t, actor));
            const damage = Math.max(1, Math.round(base * rng.variance(DAMAGE_VARIANCE)));
            applyDamage(actor, t, damage, `${actor.name} crible ${t.name} — ${damage} dégâts`);
          }
        }
        return true;
      }

      case 'detonate_all': {
        const marked = targets.filter((t) => t.alive && (t.stacks[action.mark] ?? 0) > 0);
        if (marked.length === 0) return false;
        events.push({ type: 'status', round, combatantId: actor.id, message: `${actor.name} déclenche une réaction en chaîne` });
        for (const t of marked) {
          const burst = Math.max(1, Math.round(effectiveAtk(actor) * action.dmgMult));
          t.stacks[action.mark] = 0;
          applyDamage(actor, t, burst, `${actor.name} fait exploser ${t.name} — ${burst} dégâts`);
        }
        return true;
      }

      case 'extra_turn': {
        events.push({ type: 'status', round, combatantId: actor.id, message: `${actor.name} pousse un cri de désespoir` });
        // Tous les alliés — même ceux à terre — portent une frappe supplémentaire.
        for (const ally of fighters.filter((f) => f.side === actor.side)) {
          const t = pickTarget(livingOnSide(fighters, enemySide), ally.side === 'enemy', rng);
          if (!t) break;
          basicAttack(ally, t);
        }
        return true;
      }

      case 'execute_strike': {
        const t = pickTarget(targets, false, rng);
        if (!t) return false;
        events.push({ type: 'status', round, combatantId: actor.id, message: `${actor.name} rend son jugement` });
        if (t.hp <= t.maxHp * action.instakillPct) {
          applyDamage(actor, t, t.hp, `${actor.name} exécute ${t.name}`);
        } else {
          const base = Math.max(1, Math.round(effectiveAtk(actor) * action.dmgMult) - mitigation(t, actor));
          const damage = Math.max(1, Math.round(base * rng.variance(DAMAGE_VARIANCE)));
          applyDamage(actor, t, damage, `${actor.name} juge ${t.name} — ${damage} dégâts`);
        }
        return true;
      }
    }
    return false;
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
        message: `${f.name} régénère ${amount} PV`,
      });
    }

    // Barrière (Rempart) : regénérée en début de manche à un % des PV max.
    for (const f of fighters) {
      if (!f.alive) continue;
      let pct = 0;
      for (const a of abilitiesOf(f, 'barrier')) if (a.kind === 'barrier') pct = Math.max(pct, a.pct);
      if (pct > 0) f.barrier = Math.max(f.barrier, Math.round(f.maxHp * pct));
    }

    // Soutien (soigneur / paladin) : soin passif ciblé + barrière sur l'allié le plus faible.
    for (const f of fighters) {
      if (!f.alive) continue;
      const amp = healAmpOf(f);
      for (const a of abilitiesOf(f, 'heal_aura')) {
        if (a.kind !== 'heal_aura') continue;
        const target = pickHealTarget(livingOnSide(fighters, f.side));
        if (target) heal(f, target, Math.round(target.maxHp * a.pct * amp), `${f.name} soigne ${target.name}`);
      }
      for (const a of abilitiesOf(f, 'ally_shield')) {
        if (a.kind !== 'ally_shield') continue;
        if (rng.next() >= a.chance) continue;
        const allies = livingOnSide(fighters, f.side);
        const lowest = pickHealTarget(allies) ?? allies[0];
        if (lowest) {
          lowest.barrier = Math.max(lowest.barrier, Math.round(lowest.maxHp * a.pct));
          events.push({
            type: 'status',
            round,
            combatantId: lowest.id,
            message: `${f.name} protège ${lowest.name} d'une barrière`,
          });
        }
      }
    }

    // Buffs temporisés déclenchés en début de manche.
    for (const f of fighters) {
      if (!f.alive) continue;
      // Fureur du meneur : au tour prévu, +dégâts pour toute l'équipe jusqu'à la fin.
      for (const a of abilitiesOf(f, 'delayed_buff')) {
        if (a.kind === 'delayed_buff' && round === a.afterRounds) {
          for (const ally of livingOnSide(fighters, f.side)) ally.buffs.push({ turnsLeft: maxRounds, dmg: a.dmg });
          events.push({ type: 'status', round, combatantId: f.id, message: `${f.name} déchaîne la fureur de l'équipe` });
        }
      }
      // Bénédiction : chance de poser un soin sur la durée sur toute l'équipe.
      for (const a of abilitiesOf(f, 'team_hot')) {
        if (a.kind !== 'team_hot') continue;
        if (rng.next() >= a.chance) continue;
        for (const ally of livingOnSide(fighters, f.side)) {
          const existing = ally.buffs.find((b) => (b.heal ?? 0) > 0);
          if (existing) existing.turnsLeft = Math.max(existing.turnsLeft, a.duration);
          else ally.buffs.push({ turnsLeft: a.duration, heal: a.pct });
        }
        events.push({ type: 'status', round, combatantId: f.id, message: `${f.name} bénit l'équipe` });
      }
    }

    // Application des soins sur la durée (HoT) en début de manche.
    for (const f of fighters) {
      if (!f.alive) continue;
      const hot = buffSum(f, 'heal');
      if (hot > 0 && f.hp < f.maxHp) heal(f, f, Math.round(f.maxHp * hot), `${f.name} est régénéré par la bénédiction`);
    }

    // Tic des DoT (poison/feu) en début de manche + propagation (contagion).
    const spreads: { target: Fighter; status: ActiveStatus }[] = [];
    for (const f of fighters) {
      if (!f.alive) continue;
      const dots = f.statuses.filter((s) => s.dmgPerTurn > 0 && s.turnsLeft > 0);
      if (dots.length === 0) continue;
      // Un tic par source de DoT : chaque event porte son `sourceId` pour créditer
      // le lanceur (poison/feu) dans le récap, plutôt que la victime elle-même.
      let killed = false;
      for (const s of dots) {
        if (!f.alive) break;
        // Amplification du DoT si la source possède dot_amp pour ce statut (Toxine).
        let dmg = s.dmgPerTurn;
        const src = byId.get(s.sourceId);
        if (src) {
          let amp = 0;
          for (const a of abilitiesOf(src, 'dot_amp')) {
            if (a.kind === 'dot_amp' && a.status === s.type) amp += a.bonus;
          }
          if (amp > 0) dmg = Math.max(1, Math.round(dmg * (1 + amp)));
        }
        const label = s.type === 'burn' ? 'de feu' : 'de poison';
        f.hp = Math.max(0, f.hp - dmg);
        events.push({
          type: 'attack',
          round,
          actorId: f.id,
          targetId: f.id,
          sourceId: s.sourceId,
          status: s.type,
          damage: dmg,
          targetHpAfter: f.hp,
          message: `${f.name} subit ${dmg} dégâts ${label}`,
        });
        if (f.hp === 0) {
          killOrRevive(f);
          killed = true;
          break;
        }
      }
      if (killed) continue;
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
          message: `${actor.name} est étourdi et passe son tour`,
        });
        continue;
      }

      // Provocation (tank) : tous les N tours, force les ennemis à le cibler
      // pendant `duration` tours. Action gratuite : le combattant attaque quand même.
      const taunt = abilitiesOf(actor, 'taunt').find(
        (a) => a.kind === 'taunt' && a.everyRounds > 0 && round % a.everyRounds === 0,
      );
      if (taunt && taunt.kind === 'taunt') {
        const existing = actor.statuses.find((s) => s.type === 'taunt');
        if (existing) existing.turnsLeft = Math.max(existing.turnsLeft, taunt.duration);
        else
          actor.statuses.push({
            type: 'taunt',
            turnsLeft: taunt.duration,
            dmgPerTurn: 0,
            weaken: 0,
            sourceName: actor.name,
            sourceId: actor.id,
          });
        events.push({
          type: 'status',
          round,
          combatantId: actor.id,
          status: 'taunt',
          message: `${actor.name} provoque les ennemis`,
        });
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

      // Les ennemis frappent au hasard ; tes héros gardent le focus fire.
      const target = pickTarget(livingOnSide(fighters, enemySide), actor.side === 'enemy', rng);
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

    // Fin de manche : décrémente les durées des DoT/weaken/buffs, purge l'expiré.
    for (const f of fighters) {
      for (const s of f.statuses) if (s.type !== 'stun') s.turnsLeft -= 1;
      f.statuses = f.statuses.filter((s) => s.turnsLeft > 0);
      for (const b of f.buffs) b.turnsLeft -= 1;
      f.buffs = f.buffs.filter((b) => b.turnsLeft > 0);
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
