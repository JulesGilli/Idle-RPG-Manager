import { createRng, type Rng } from './prng.ts';
import { summonId, isSummonId, summonerIdOf } from './summon.ts';
import type {
  Ability,
  AutocastAction,
  CombatEvent,
  CombatInput,
  CombatResult,
  CombatantFinalState,
  CombatantInput,
  DamageBase,
  DamageSchool,
  MarkType,
  PassiveType,
  Side,
  StatusType,
  SummonSpecial,
  SummonTemplate,
} from './types.ts';

const DEFAULT_MAX_ROUNDS = 150;
const DAMAGE_VARIANCE = 0.15;

/** Rééquilibrage combat : PV des monstres (role 'enemy') ×4, dégâts ×1.6.
 *  Les héros reçoivent le même ×4 de PV côté `formulas.effectiveStats`
 *  (HERO_HP_SCALE) → combats plus longs et plus exigeants (compo équilibrée). */
const MONSTER_HP_SCALE = 4;
// Dégâts des monstres/boss trop faibles → ×2 (1.6 → 3.2). N'affecte QUE les
// ennemis (role 'enemy'), jamais les héros ni les défenseurs d'arène.
const MONSTER_DMG_SCALE = 3.2;
const HEAL_MULTIPLIER = 1.5;
/**
 * Part d'ATK du LANCEUR ajoutée aux soins actifs (heal_all / heal_aura), en plus
 * de la base en % de PV max de la cible. Donne un sens à l'ATK d'un soigneur (et
 * fait scaler le set « Âme Offerte » sur sa puissance). Ajustable.
 */
const ATK_HEAL_SCALE = 1.0;
/** Plafond de pénétration d'armure (on ne peut pas ignorer plus de 90 % de la mitigation). */
const ARMOR_PEN_CAP = 0.9;

/**
 * Perce-armure PERMANENT de toute invocation (nécromancien : squelettes, créature
 * mortuaire, avatar).
 *
 * Une invocation n'hérite que d'une fraction de l'ATK de son invocateur (6 à 32 %
 * selon le gabarit), alors que la mitigation ennemie est calibrée sur l'ATK d'un
 * héros ENTIER. Résultat : passé les premières zones, tous les squelettes tapaient
 * au plancher de 1 dégât, quel que soit l'équipement du nécromancien — la branche
 * Légion entière ne servait à rien.
 *
 * Corrigé par le perçage plutôt qu'en gonflant `atkMult` : le mode d'échec est
 * exclusivement l'armure. Monter l'ATK héritée les aurait rendus démesurés contre
 * les cibles peu blindées tout en les laissant inoffensifs contre les tanks, ce
 * qui déplaçait le problème au lieu de le régler.
 */
export const SUMMON_ARMOR_PEN = 0.6;
/** Le poison est CUMULATIF : ses tics s'additionnent, plafonnés à ce multiple d'une application. */
const POISON_MAX_STACKS = 5;
/**
 * Plafond de RÉGÉNÉRATION par manche (fraction des PV max). La regen en % ne
 * sature jamais et se CUMULE entre sources (ex. Paladin : ultime Rempart +
 * passif Régénération maudite), ce qui rend un tank quasi increvable en empilant.
 * On borne le total pour éviter cet abus, tout en gardant une forte survie.
 */
const REGEN_CAP = 0.1;

/**
 * Enrage : passé un certain nombre de manches, les ennemis s'enragent et
 * infligent PLUS de dégâts aux héros (anti-stall — empêche les combats de
 * s'éterniser). +30 % à partir de la manche 30, +50 % à partir de la manche 50,
 * puis +1 % supplémentaire à CHAQUE manche au-delà de 50 (croissance sans fin).
 * S'applique à TOUS les combats (moteur partagé).
 */
export function enrageDamageMultiplier(round: number): number {
  if (round >= 100) return 1.5 + 0.01 * (round - 100);
  if (round >= 50) return 1.3;
  return 1;
}

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
  /**
   * Ce DoT a déjà été intensifié par un `extend_statuses` (Bûcher sacré). Empêche
   * un relancement d'empiler le multiplicateur à l'infini. Remis à zéro quand le
   * statut expire puis est réappliqué (nouvelle entrée).
   */
  boosted?: boolean;
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
  /** Stacks d'os accumulés (Colosse) → déclenchent le rituel au seuil. */
  boneStacks: number;
  /**
   * Manche à laquelle le rituel a dressé la créature mortuaire. Sert au délai de
   * la Communion : l'ultime ne peut se déclencher qu'un certain nombre de manches
   * APRÈS l'invocation, pas à n'importe quel moment du combat.
   */
  ritualRound?: number;
  /** Actions à usage unique déjà consommées ce combat (rituel, ultimes, etc.). */
  usedActions: Set<string>;
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

/**
 * Plafond de chance de critique. Le crit vient de SOURCES QUI S'ADDITIONNENT
 * (gemme jusqu'à 35 %, arbre de compétences, buff de guilde, et désormais l'Arc
 * jusqu'à 35 %) : sans plafond, un archer spécialisé critique à ~90 %, ce qui ne
 * l'avantage pas — ça SUPPRIME la variance qui est justement son identité.
 * Le critique doit rester un pari, pas une certitude.
 */
export const CRIT_CHANCE_CAP = 0.75;

/** Chance de critique effective d'un combattant (somme des sources, plafonnée). */
export function critChanceOf(f: Pick<Fighter, 'passives'>): number {
  return Math.min(CRIT_CHANCE_CAP, passive(f as Fighter, 'crit'));
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

/**
 * Base d'une frappe de COMPÉTENCE : ATK × mult, moins la mitigation, plus le
 * bonus de PV max du set Lourd.
 *
 * `hpStrikeBonus` n'était appliqué que dans `basicAttack` : le set Lourd boostait
 * les auto-attaques et les ripostes, mais AUCUNE compétence offensive. Un Colosse
 * qui jouait ses actifs perdait donc son bonus précisément sur ses plus gros
 * coups. Chaque action de dégâts recalculait sa base à la main, et il suffisait
 * d'en oublier une — d'où ce point de passage unique.
 *
 * Ne concerne QUE les frappes directes : les DoT (poison, brûlure) gardent leur
 * propre calcul, un bonus par tic serait sans commune mesure.
 */
function skillStrikeBase(actor: Fighter, mult: number, mit: number): number {
  return Math.max(1, Math.round(effectiveAtk(actor) * mult) - mit) + hpStrikeBonus(actor);
}

/** Dégâts bonus plats issus des PV max (set Lourd `hp_strike`). */
function hpStrikeBonus(f: Fighter): number {
  let frac = 0;
  for (const a of abilitiesOf(f, 'hp_strike')) if (a.kind === 'hp_strike') frac += a.value;
  return frac > 0 ? Math.round(f.maxHp * frac) : 0;
}

/** Multiplicateur de dégâts du set Moyen (`double_strike`) : 1 si absent. */
function doubleStrikeFactor(f: Fighter): number {
  for (const a of abilitiesOf(f, 'double_strike')) if (a.kind === 'double_strike') return a.mult;
  return 1;
}

/** Le combattant porte-t-il la double frappe (set Moyen) ? */
function hasDoubleStrike(f: Fighter): boolean {
  return abilitiesOf(f, 'double_strike').length > 0;
}

/** Réduction de cooldown des actifs (set Léger `cdr`), en tours. */
function cdrOf(f: Fighter): number {
  let total = 0;
  for (const a of abilitiesOf(f, 'cdr')) if (a.kind === 'cdr') total += a.value;
  return total;
}

/** Période effective d'un actif (autocast/provocation) après réduction de cooldown (min 2). */
function activePeriod(f: Fighter, everyRounds: number): number {
  return Math.max(2, everyRounds - cdrOf(f));
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

/* ------------------------------------------------- AMPLIFICATION PAR TYPE -- */

/** École (sous-type) portée par un DoT selon son statut. */
function schoolOfStatus(status: StatusType): DamageSchool | undefined {
  if (status === 'poison') return 'poison';
  if (status === 'burn') return 'fire';
  return undefined;
}

/** École d'un autocast, déduite de ses effets (feu/poison/arcane) — sinon aucune. */
function schoolOfAutocast(action: AutocastAction): DamageSchool | undefined {
  const mark = 'mark' in action ? action.mark : undefined;
  if (mark === 'burn') return 'fire';
  if (mark === 'arcane') return 'arcane';
  if ('status' in action && action.status) return schoolOfStatus(action.status);
  if ('spread' in action && action.spread) return 'fire';
  return undefined;
}

/**
 * Amplificateur offensif du combattant pour un type de dégâts donné (fraction).
 * Somme les abilités `dmg_type_amp` ET le champ `dmgAmp` qui matchent la base ou
 * l'école. Ex. un porteur { fire: 0.3 } qui inflige des dégâts {magical, fire}
 * obtient +0.3 (école) [+ un éventuel amp 'magical'].
 */
function damageTypeAmp(f: Fighter, base?: DamageBase, school?: DamageSchool): number {
  let total = 0;
  const tags = [base, school].filter((t): t is DamageBase | DamageSchool => Boolean(t));
  if (tags.length === 0) return 0;
  for (const a of abilitiesOf(f, 'dmg_type_amp')) {
    if (a.kind === 'dmg_type_amp' && tags.includes(a.damageType)) total += a.value;
  }
  for (const t of tags) total += f.dmgAmp?.[t] ?? 0;
  return total;
}

/**
 * Parts du soin émis (set heal→dégâts) : ce qui frappe l'ennemi, et ce qui est
 * réellement rendu à l'allié.
 *
 * Les deux ne sont plus forcément complémentaires : `healRatio` peut être fourni
 * indépendamment, auquel cas une fraction du soin est simplement PERDUE. C'est
 * le levier de nerf du set — réduire ce qu'il rend sans lui rendre ses dégâts.
 * Sans `healRatio`, on retombe sur l'ancien comportement (1 − ratio).
 */
function healConvertOf(f: Fighter): { toDamage: number; toHeal: number } {
  let dmg = 0;
  let heal: number | null = null;
  for (const a of abilitiesOf(f, 'heal_convert')) {
    if (a.kind !== 'heal_convert') continue;
    dmg += a.ratio;
    if (a.healRatio !== undefined) heal = (heal ?? 0) + a.healRatio;
  }
  const toDamage = Math.min(0.95, dmg);
  return { toDamage, toHeal: heal === null ? 1 - toDamage : Math.min(1, Math.max(0, heal)) };
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
    // Les MONSTRES (role 'enemy') voient leurs PV ×MONSTER_HP_SCALE. Les héros (même
    // côté ennemi en arène) sont déjà scalés en amont (effectiveStats) → pas de double.
    const maxHp = c.role === 'enemy' ? Math.round(c.hp * MONSTER_HP_SCALE) : c.hp;
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
      boneStacks: 0,
      usedActions: new Set<string>(),
      stacks: { burn: 0, arcane: 0 },
      barrier: 0,
      buffs: [],
    };
  });
}

/** Abilités attachées à un héros-squelette selon sa spéciale (ultime Légion, rang 2). */
function specialAbilities(special: SummonSpecial): Ability[] {
  switch (special) {
    case 'taunt_all':
      return [{ kind: 'taunt', everyRounds: 4, duration: 2 }];
    case 'aoe_all':
      return [{ kind: 'autocast', everyRounds: 4, action: { type: 'aoe', dmgMult: 1 } }];
    case 'resummon':
      return [{ kind: 'autocast', everyRounds: 4, action: { type: 'resummon' } }];
  }
}

/** Stats-source d'un lanceur d'invocation (fractions appliquées dessus). */
type SummonCaster = {
  id: string;
  maxHp: number;
  atk: number;
  def: number;
  speed: number;
  basicType?: DamageBase | undefined;
  abilities?: Ability[] | undefined;
};

/**
 * Construit l'input d'une invocation à partir d'un lanceur + gabarit, en appliquant
 * les MODIFICATEURS d'invocation du lanceur (summon_buff ATK/PV, summon_explode).
 * Partagé par le passif d'armée (setup), le rituel et l'ultime (plein combat).
 */
function buildSummonInput(
  caster: SummonCaster,
  tpl: SummonTemplate,
  index: number,
  withSpecial: boolean,
): CombatantInput {
  let atkBuff = 0;
  let hpBuff = 0;
  let explodeFrac: number | undefined;
  for (const a of caster.abilities ?? []) {
    if (a.kind === 'summon_buff') {
      if (a.stat === 'atk') atkBuff += a.value;
      else hpBuff += a.value;
    } else if (a.kind === 'summon_explode') {
      explodeFrac = Math.max(explodeFrac ?? 0, a.hpFrac);
    }
  }
  // Toutes les invocations du jeu viennent du nécromancien : le perçage est donc
  // posé ici, à la source unique, plutôt que dupliqué sur chaque gabarit.
  const abilities: Ability[] = [{ kind: 'armor_pen', value: SUMMON_ARMOR_PEN }];
  if (explodeFrac !== undefined) abilities.push({ kind: 'explode_on_death', hpFrac: explodeFrac });
  if (withSpecial && tpl.special) abilities.push(...specialAbilities(tpl.special));
  return {
    id: summonId(caster.id, tpl.name, index),
    name: tpl.name,
    role: 'dps',
    hp: Math.max(1, Math.round(caster.maxHp * tpl.hpMult * (1 + hpBuff))),
    atk: Math.max(1, Math.round(caster.atk * tpl.atkMult * (1 + atkBuff))),
    def: Math.max(0, Math.round(caster.def * (tpl.defMult ?? 0))),
    speed: caster.speed,
    ...(caster.basicType ? { basicType: caster.basicType } : {}),
    ...(abilities.length ? { abilities } : {}),
  };
}

/** Tire les gabarits d'un pool d'invocation. `distinct` (ou count ≥ pool) → un de
 *  chaque (garanti) ; sinon `count` tirages aléatoires avec remise. */
function pickPool(pool: Extract<Ability, { kind: 'summon_pool' }>, rng: Rng): SummonTemplate[] {
  const t = pool.templates;
  if (t.length === 0) return [];
  if (pool.distinct || pool.count >= t.length) return t.slice(0, Math.min(pool.count, t.length));
  const out: SummonTemplate[] = [];
  for (let i = 0; i < pool.count; i++) out.push(t[Math.floor(rng.next() * t.length)]!);
  return out;
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

  const allyInputs = applyAuras(input.allies);
  const enemyInputs = applyAuras(input.enemies);
  const allies = buildFighters(allyInputs, 'ally', 0);
  const enemies = buildFighters(enemyInputs, 'enemy', input.allies.length);

  /**
   * Invocations (Nécromancien) posées au SETUP : chaque combattant portant une
   * abilité `summon`/`summon_pool` ajoute ses créatures DE SON CÔTÉ, aux stats
   * dérivées de lui-même. Leurs ids ne matchent aucun héros → aucune récompense
   * ni XP ne leur est attribuée par les appelants.
   *
   * Appliqué aux DEUX camps : ces boucles ne parcouraient que les alliés, si bien
   * qu'un nécromancien adverse (défenseur d'arène, héros prêté d'un autre joueur)
   * n'invoquait jamais rien — il combattait amputé de toute sa branche.
   */
  const collectSummons = (inputs: CombatantInput[]): CombatantInput[] => {
    const out: CombatantInput[] = [];
    for (const summoner of inputs) {
      for (const a of summoner.abilities ?? []) {
        if (a.kind !== 'summon') continue;
        for (let k = 0; k < a.count; k++) {
          out.push({
            id: summonId(summoner.id, a.summonName, k),
            name: a.summonName,
            role: 'dps',
            hp: Math.max(1, Math.round(summoner.hp * a.hpMult)),
            atk: Math.max(1, Math.round(summoner.atk * a.atkMult)),
            def: Math.max(0, Math.round(summoner.def * a.defMult)),
            speed: summoner.speed,
            ...(summoner.basicType ? { basicType: summoner.basicType } : {}),
            // Invocations « qui explosent » (Ossuaire) : elles portent l'abilité
            // explode_on_death, déclenchée à leur mort par killOrRevive.
            ...(a.explodeDmgMult ? { abilities: [{ kind: 'explode_on_death', dmgMult: a.explodeDmgMult }] } : {}),
          });
        }
      }
    }
    // Invocation ALÉATOIRE (passif Légion) : tire `count` gabarits dans le pool.
    let poolIdx = 0;
    for (const summoner of inputs) {
      for (const a of summoner.abilities ?? []) {
        if (a.kind !== 'summon_pool') continue;
        const caster: SummonCaster = {
          id: summoner.id,
          maxHp: summoner.hp,
          atk: summoner.atk,
          def: summoner.def,
          speed: summoner.speed,
          basicType: summoner.basicType,
          abilities: summoner.abilities,
        };
        for (const tpl of pickPool(a, rng)) out.push(buildSummonInput(caster, tpl, poolIdx++, false));
      }
    }
    return out;
  };

  const summonInputs = collectSummons(allyInputs);
  const enemySummonInputs = collectSummons(enemyInputs);
  const base = input.allies.length + input.enemies.length;
  const summons = buildFighters(summonInputs, 'ally', base);
  const enemySummons = buildFighters(enemySummonInputs, 'enemy', base + summonInputs.length);
  const fighters = [...allies, ...summons, ...enemies, ...enemySummons];
  const byId = new Map(fighters.map((f) => [f.id, f]));

  /** Fait apparaître des combattants EN PLEIN COMBAT (rituel, ultimes). Ils entrent
   *  dans l'ordre d'action à la manche suivante (turnOrder recalculé chaque manche). */
  /** Manche d'arrivée des combattants nés en cours de combat (id → manche). */
  const spawnRounds = new Map<string, number>();
  const spawnMid = (side: Side, inputs: CombatantInput[]): Fighter[] => {
    const built = buildFighters(inputs, side, fighters.length);
    for (const nf of built) {
      fighters.push(nf);
      byId.set(nf.id, nf);
      // Mémorisé pour que le rejeu ne les montre pas AVANT leur apparition.
      spawnRounds.set(nf.id, round);
    }
    return built;
  };
  /** Vue « lanceur d'invocation » d'un combattant déjà en jeu. */
  const casterOf = (f: Fighter): SummonCaster => ({
    id: f.id,
    maxHp: f.maxHp,
    atk: f.atk,
    def: f.def,
    speed: f.speed,
    basicType: f.basicType,
    abilities: f.abilities,
  });
  /** Créature mortuaire (vivante) du lanceur `id` portant le nom `name`, ou null. */
  const creatureOf = (ownerId: string, name: string): Fighter | null =>
    fighters.find(
      (f) => f.alive && isSummonId(f.id) && summonerIdOf(f.id) === ownerId && f.name === name,
    ) ?? null;

  const events: CombatEvent[] = [];
  let round = 0;
  // Combattants ayant déjà porté leur PREMIÈRE attaque (pour les procs « on_first_hit »).
  const firstStruck = new Set<string>();

  /** Chance de contagion (propagation des DoT) d'un combattant, 0 si absent. */
  const contagionOf = (f: Fighter): number => {
    let c = 0;
    for (const a of abilitiesOf(f, 'contagion')) if (a.kind === 'contagion') c = Math.max(c, a.chance);
    return c;
  };

  const sideCleared = (side: Side): boolean => livingOnSide(fighters, side).length === 0;

  /** Applique des dégâts bruts (déjà calculés) à une cible + gère mort/résurrection. */
  const applyDamage = (
    actor: Fighter,
    target: Fighter,
    damage: number,
    message: string,
    // Type des dégâts pour l'amplification offensive de l'attaquant. Défaut : la
    // base de sa classe (basicType). Omis pour les dégâts non typés (épines…).
    type?: { base?: DamageBase | undefined; school?: DamageSchool | undefined },
    /**
     * Dégâts déjà retranchés EN AMONT par l'armure/DEF et l'Égide (calculés au
     * point d'appel, où la valeur brute est connue). On les propage pour pouvoir
     * afficher ce que la cible a réellement encaissé.
     */
    prevented = 0,
  ): void => {
    // Amplificateur de type de l'ATTAQUANT (dernier multiplicateur offensif).
    const amp = type ? damageTypeAmp(actor, type.base, type.school) : 0;
    let dealt = amp > 0 ? Math.max(1, Math.round(damage * (1 + amp))) : damage;
    // Réduction temporaire des dégâts subis (Vengeance du damné…).
    const reduce = Math.min(0.9, buffSum(target, 'reduce'));
    const beforeReduce = dealt;
    if (reduce > 0 && dealt > 0) dealt = Math.max(1, Math.round(dealt * (1 - reduce)));
    // Barrière : absorbe ensuite (PV temporaires).
    const barrierBefore = target.barrier;
    let barrierAbsorbed = 0;
    if (target.barrier > 0 && dealt > 0) {
      barrierAbsorbed = Math.min(target.barrier, dealt);
      target.barrier -= barrierAbsorbed;
      dealt -= barrierAbsorbed;
    }
    // Total encaissé sans perte de PV : armure/Égide + réduction + barrière.
    const absorbed = Math.max(0, Math.round(prevented)) + (beforeReduce - dealt - barrierAbsorbed) + barrierAbsorbed;
    target.hp = Math.max(0, target.hp - dealt);
    events.push({
      type: 'attack',
      round,
      actorId: actor.id,
      targetId: target.id,
      damage: dealt,
      ...(absorbed > 0 ? { absorbed } : {}),
      targetHpAfter: target.hp,
      // Barrière restante après ce coup (pour l'UI), si la cible en avait une.
      ...(barrierBefore > 0 ? { barrier: target.barrier } : {}),
      message,
    });
    if (target.hp === 0 && target.alive) killOrRevive(target);
  };

  const killOrRevive = (f: Fighter): void => {
    // Sacre du carnage (Paladin) : chaque passage à 0 PV sur le champ (les DEUX
    // camps) renforce durablement les porteurs (+ATK/+DEF cumulatif). Déclenché
    // ici, avant la résurrection éventuelle → une renaissance suivie d'une
    // nouvelle chute recompte bien une seconde fois.
    for (const other of fighters) {
      if (!other.alive) continue;
      for (const a of abilitiesOf(other, 'rally_death')) {
        if (a.kind !== 'rally_death' || a.value <= 0) continue;
        other.buffs.push({ turnsLeft: 9999, atk: a.value, def: a.value });
        events.push({
          type: 'status',
          round,
          combatantId: other.id,
          message: `${other.name} s'exalte du carnage (+${Math.round(a.value * 100)}% ATK/DEF)`,
        });
      }
    }

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

    // Explosion à la mort (invocations de l'Ossuaire) : dégâts de zone aux ennemis
    // du camp adverse. Les dégâts (non typés) = dmgMult × ATK de la créature.
    for (const a of abilitiesOf(f, 'explode_on_death')) {
      if (a.kind !== 'explode_on_death') continue;
      const foes = livingOnSide(fighters, f.side === 'ally' ? 'enemy' : 'ally');
      if (foes.length === 0) continue;
      // Montant = fraction des PV MAX (Ossuaire) si fournie, sinon fraction de l'ATK.
      const burst =
        a.hpFrac !== undefined
          ? Math.max(1, Math.round(f.maxHp * a.hpFrac))
          : Math.max(1, Math.round(effectiveAtk(f) * (a.dmgMult ?? 0)));
      events.push({ type: 'status', round, combatantId: f.id, message: `${f.name} explose !` });
      for (const foe of [...foes]) {
        if (foe.alive) applyDamage(f, foe, burst, `L'explosion de ${f.name} touche ${foe.name} — ${burst} dégâts`);
      }
    }
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
      // Poison CUMULATIF : les tics s'additionnent (plafonnés) au lieu de se rafraîchir —
      // récompense les tirs répétés (multi-tir de l'archer). Les autres DoT prennent le max.
      if (s.type === 'poison' && s.dmgPerTurn > 0) {
        existing.dmgPerTurn = Math.min(existing.dmgPerTurn + s.dmgPerTurn, s.dmgPerTurn * POISON_MAX_STACKS);
      } else {
        existing.dmgPerTurn = Math.max(existing.dmgPerTurn, s.dmgPerTurn);
      }
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

  /** Retire un bienfait (buff temporaire actif) de la cible. Renvoie true si un
   *  bienfait a été dissipé. Utilisé par la purge (Inquisiteur) et le vol (Voleur). */
  const purgeBuff = (source: Fighter, target: Fighter): boolean => {
    const idx = target.buffs.findIndex((b) => b.turnsLeft > 0);
    if (idx < 0) return false;
    target.buffs.splice(idx, 1);
    events.push({
      type: 'status',
      round,
      combatantId: target.id,
      message: `${source.name} dissipe un bienfait de ${target.name}`,
    });
    // Sceau d'affaiblissement : chaque bienfait dissipé renforce durablement le
    // dissipateur. Posé ICI plutôt qu'aux appelants pour créditer AUSSI bien le
    // proc à l'attaque (Excommunication) que les incantations (Réprimande,
    // Verdict). `turnsLeft` très grand = tient tout le combat ; aucun plafond,
    // les buffs s'empilent et `buffSum` les additionne.
    for (const a of abilitiesOf(source, 'purge_stack')) {
      if (a.kind !== 'purge_stack') continue;
      source.buffs.push({ turnsLeft: 9999, dmg: a.value });
      events.push({
        type: 'status',
        round,
        combatantId: source.id,
        message: `${source.name} scelle sa proie (+${Math.round(a.value * 100)}% dégâts)`,
      });
    }
    return true;
  };

  /**
   * Boost de dégâts des MONSTRES (role 'enemy') : ×MONSTER_DMG_SCALE + enrage
   * (ramp au fil des manches). Neutre pour les héros (arène incluse : les
   * défenseurs ont un rôle de héros, pas 'enemy').
   */
  const monsterDamageBoost = (actor: Fighter, raw: number): number => {
    if (actor.role !== 'enemy') return raw;
    // Boss à rampe propre (event) : ×(1+perTurn)^(tour−1), SANS le boost monstre
    // standard ni l'enrage — sa montée en dégâts est entièrement pilotée par la rampe.
    const ramp = (actor.abilities ?? []).find((a) => a.kind === 'atk_ramp');
    if (ramp && ramp.kind === 'atk_ramp') {
      return Math.max(1, Math.round(raw * Math.pow(1 + ramp.perTurn, Math.max(0, round - 1))));
    }
    return Math.max(1, Math.round(raw * MONSTER_DMG_SCALE * enrageDamageMultiplier(round)));
  };

  /** Résout une attaque simple d'`actor` sur `target` (avec passifs & procs). */
  /**
   * `armorPen` : fraction de la mitigation ignorée POUR CE COUP uniquement
   * (0..1). Distinct du passif `armor_pen`, qui est cumulatif et plafonné par
   * `ARMOR_PEN_CAP` — ici c'est un actif qui paie son effet en cadence.
   */
  const basicAttack = (
    actor: Fighter,
    target: Fighter,
    bonusDmg = 0,
    isRiposte = false,
    armorPen = 0,
  ): void => {
    // Passif Esquive : la cible peut annuler complètement l'attaque. Une riposte, elle,
    // ne peut être ni esquivée ni contrée à son tour (garde anti-récursion).
    if (!isRiposte) {
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
        // Riposte sur esquive (Voleur — « Riposte ») : l'esquiveur contre-attaque
        // immédiatement l'assaillant, une fois par esquive.
        if (target.alive && actor.alive) {
          for (const a of abilitiesOf(target, 'riposte_dodge')) {
            if (a.kind === 'riposte_dodge') basicAttack(target, actor, a.bonus - 1, true);
          }
        }
        return;
      }
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
    // Jugement (Inquisiteur) : +dégâts contre une cible qui porte un bienfait (buff).
    if (target.buffs.some((b) => b.turnsLeft > 0)) {
      for (const a of abilitiesOf(actor, 'amp_vs_buff')) if (a.kind === 'amp_vs_buff') mult += a.bonus;
    }
    // Buffs temporaires de dégâts (rage d'équipe, Concert céleste…) + bonus ponctuel
    // (assaut d'os : +% de dégâts sur la frappe du lanceur).
    mult += buffSum(actor, 'dmg') + bonusDmg;
    // Set Moyen : chaque frappe est réduite (compensée par une 2e attaque/tour).
    mult *= doubleStrikeFactor(actor);

    const barrierBefore = target.barrier;
    // Set Lourd : +% des PV max en dégâts bonus (après mitigation, avant variance/crit).
    // Part arrêtée par l'armure/DEF : on la MÉMORISE (elle était jetée) pour
    // pouvoir montrer ce qu'un tank encaisse vraiment.
    const atk = effectiveAtk(actor);
    const mit = mitigation(target, actor) * (1 - Math.min(1, Math.max(0, armorPen)));
    let prevented = Math.max(0, Math.min(atk, mit));
    const base = Math.max(1, atk - mit) + hpStrikeBonus(actor);
    let damage = Math.max(1, Math.round(base * rng.variance(DAMAGE_VARIANCE) * mult));

    const crit = critChanceOf(actor);
    const isCrit = crit > 0 && rng.next() < crit;
    // Crit : ×2 de base, augmenté par le bonus « dégâts critiques » (arbre de guilde).
    if (isCrit) damage = Math.round(damage * (2 + (actor.critDmg ?? 0)));

    const shield = passive(target, 'shield');
    if (shield > 0) {
      const afterShield = Math.max(1, Math.round(damage * (1 - shield)));
      prevented += damage - afterShield;
      damage = afterShield;
    }

    // Rééquilibrage : les MONSTRES frappent plus fort (×1.6) + enrage au fil des manches.
    damage = monsterDamageBoost(actor, damage);

    applyDamage(
      actor,
      target,
      damage,
      `${actor.name} attaque ${target.name} — ${damage} dégâts${isCrit ? ' CRITIQUE' : ''}`,
      { base: actor.basicType ?? 'physical' },
      prevented,
    );

    // Procs "on_hit" : appliquent un statut à la cible touchée.
    applyOnHitProcs(actor, target);

    // Ouverture (Voleur — Ombre patiente) : le TOUT PREMIER coup du combat applique
    // un statut garanti (ex. affaiblissement). Une seule fois par combattant.
    if (!isRiposte && !firstStruck.has(actor.id)) {
      let opened = false;
      for (const a of abilitiesOf(actor, 'on_first_hit')) {
        if (a.kind !== 'on_first_hit') continue;
        opened = true;
        applyStatus(actor, target, a.status, a.potency, a.duration);
      }
      if (opened) firstStruck.add(actor.id);
    }

    // Marques cumulables (feu empilable / marque arcanique) + détonation au seuil.
    if (target.alive) {
      for (const a of abilitiesOf(actor, 'stack_on_hit')) {
        if (a.kind !== 'stack_on_hit') continue;
        if (rng.next() < a.chance) {
          // Un coup critique pose une stack supplémentaire (mage arcanique : les crits marquent plus fort).
          const gain = isCrit ? 2 : 1;
          target.stacks[a.mark] = Math.min(a.max, (target.stacks[a.mark] ?? 0) + gain);
        }
      }
      for (const a of abilitiesOf(actor, 'detonate')) {
        if (a.kind !== 'detonate') continue;
        if ((target.stacks[a.mark] ?? 0) >= a.threshold) {
          const burst = Math.max(1, Math.round(effectiveAtk(actor) * a.dmgMult));
          target.stacks[a.mark] = 0;
          applyDamage(actor, target, burst, `${actor.name} fait exploser ${target.name} — ${burst} dégâts`, {
            base: actor.basicType ?? 'physical',
            school: a.mark === 'burn' ? 'fire' : 'arcane',
          });
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

    // Purge à l'attaque (Excommunication / Doigts agiles) : chance de dissiper un bienfait.
    if (target.alive) {
      for (const a of abilitiesOf(actor, 'purge')) {
        if (a.kind === 'purge' && rng.next() < a.chance) purgeBuff(actor, target);
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

    // Aura de drain (Hémomancie) : une part des dégâts soigne l'allié le plus blessé.
    for (const a of abilitiesOf(actor, 'drain_aura')) {
      if (a.kind !== 'drain_aura' || a.pct <= 0) continue;
      const ally = pickHealTarget(healableOnSide(actor.side));
      if (ally) heal(actor, ally, Math.max(1, Math.round(damage * a.pct)), `${actor.name} draine la vie vers ${ally.name}`);
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

    // Frappe enchaînée (Voleur — Points vitaux) : chaque attaque déclenche une frappe
    // supplémentaire, plus faible. Non récursive (isRiposte) → ne s'enchaîne pas elle-même.
    if (!isRiposte && target.alive && actor.alive) {
      for (const a of abilitiesOf(actor, 'bonus_strike')) {
        if (a.kind === 'bonus_strike') basicAttack(actor, target, a.mult - 1, true);
      }
    }
  };

  /** Multiplicateur de soin de l'acteur (abilités heal_amp). */
  const healAmpOf = (f: Fighter): number => {
    let b = 0;
    for (const a of abilitiesOf(f, 'heal_amp')) if (a.kind === 'heal_amp') b += a.bonus;
    return 1 + b;
  };

  /**
   * Montant d'un soin ACTIF : base en % des PV max de la cible + une part de l'ATK
   * du lanceur, le tout amplifié par heal_amp. L'ATK du soigneur compte donc enfin.
   */
  const castHealAmount = (actor: Fighter, target: Fighter, pct: number): number =>
    Math.round((target.maxHp * pct + effectiveAtk(actor) * ATK_HEAL_SCALE) * healAmpOf(actor));

  /**
   * Alliés vivants ET soignables d'un camp : exclut les invocations, qui ne
   * peuvent être ni ciblées ni prises en compte par un sort de soin. Les
   * soigneurs choisissent ainsi un VRAI allié plutôt que de gâcher leur cast.
   */
  const healableOnSide = (side: Side): Fighter[] =>
    livingOnSide(fighters, side).filter((f) => !isSummonId(f.id));

  /** Soigne une cible ; renvoie le montant réellement rendu. */
  const heal = (actor: Fighter, target: Fighter, amount: number, message: string): number => {
    // Les invocations (Nécromancien) sont des créatures « mortes » : elles ne
    // peuvent PAS recevoir de soin, quelle qu'en soit la source (soin actif,
    // aura, drain, HoT/bénédiction). Filet de sécurité central : tout heal ciblant
    // une invocation est un no-op, sans event ni effet annexe.
    if (isSummonId(target.id)) return 0;
    let effAmount = Math.max(0, amount);

    // Set heal→dégâts : une part du soin est détournée en dégâts sur un ennemi
    // aléatoire (l'allié ne reçoit que le reste). Appliqué AVANT le soin.
    const convert = healConvertOf(actor);
    let redirected = 0;
    if (convert.toDamage > 0 && effAmount > 0) {
      // Les deux parts sont calculées sur le soin BRUT, indépendamment l'une de
      // l'autre : la part perdue (1 − toHeal − toDamage) ne profite à personne.
      redirected = Math.round(effAmount * convert.toDamage);
      effAmount = Math.round(effAmount * convert.toHeal);
    }

    const preHp = target.hp;
    const newHp = Math.min(target.maxHp, target.hp + effAmount);
    const gained = newHp - target.hp;
    target.hp = newHp;
    if (gained > 0) {
      events.push({
        type: 'heal',
        round,
        actorId: actor.id,
        targetId: target.id,
        amount: gained,
        targetHpAfter: target.hp,
        message: `${message} — ${gained} PV`,
      });
      // Second souffle : soigner un allié sous 50 % PV lui octroie de l'ATK temporaire.
      if (preHp < target.maxHp * 0.5) {
        for (const a of abilitiesOf(actor, 'heal_buff')) {
          if (a.kind === 'heal_buff') target.buffs.push({ turnsLeft: a.duration, atk: a.atk });
        }
      }
    }

    // La part détournée frappe un ennemi vivant au hasard.
    if (redirected > 0 && actor.alive) {
      const foes = livingOnSide(fighters, actor.side === 'ally' ? 'enemy' : 'ally');
      if (foes.length > 0) {
        const foe = foes[Math.floor(rng.next() * foes.length)]!;
        applyDamage(
          actor,
          foe,
          redirected,
          `${actor.name} convertit son soin en dégâts sur ${foe.name} — ${redirected} dégâts`,
          { base: actor.basicType ?? 'physical' },
        );
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
      const wounded = healableOnSide(actor.side).filter((f) => f.hp < f.maxHp);
      if (wounded.length === 0) return false;
      events.push({ type: 'status', round, combatantId: actor.id, message: `${actor.name} invoque une lumière bienfaisante` });
      for (const t of wounded) {
        heal(actor, t, castHealAmount(actor, t, action.pct), `${actor.name} soigne ${t.name}`);
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

    // Type de dégâts de cet autocast (base de la classe + école déduite des effets).
    const dmgType = {
      base: (actor.basicType ?? 'physical') as DamageBase,
      school: schoolOfAutocast(action),
    };

    switch (action.type) {
      case 'aoe': {
        events.push({ type: 'status', round, combatantId: actor.id, message: `${actor.name} déchaîne une déflagration` });
        for (const t of targets) {
          if (!t.alive) continue;
          const base = skillStrikeBase(actor, action.dmgMult, mitigation(t, actor));
          const damage = monsterDamageBoost(actor, Math.max(1, Math.round(base * rng.variance(DAMAGE_VARIANCE))));
          applyDamage(actor, t, damage, `${actor.name} embrase ${t.name} — ${damage} dégâts`, dmgType);
          if (t.alive && action.status && rng.next() < (action.statusChance ?? 1)) {
            applyStatus(actor, t, action.status, action.statusPotency ?? 0.1, action.statusDuration ?? 3);
          }
          if (t.alive && action.mark)
            t.stacks[action.mark] = Math.min(99, (t.stacks[action.mark] ?? 0) + (action.markStacks ?? 1));
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
            const base = skillStrikeBase(actor, action.dmgMult, mitigation(t, actor));
            const damage = monsterDamageBoost(actor, Math.max(1, Math.round(base * rng.variance(DAMAGE_VARIANCE))));
            applyDamage(actor, t, damage, `${actor.name} foudroie ${t.name} — ${damage} dégâts`, dmgType);
          }
          if (t.alive) {
            applyStatus(actor, t, 'stun', 0, action.duration);
            applyOnHitProcs(actor, t);
          }
        }
        return true;
      }

      case 'stun_lowest': {
        // Cible les `count` alliés vivants les plus bas en PV (départage par ordre
        // d'entrée pour rester déterministe), les étourdit `duration` tours.
        const victims = [...targets]
          .sort((a, b) => a.hp - b.hp || a.order - b.order)
          .slice(0, Math.max(1, action.count));
        events.push({
          type: 'status',
          round,
          combatantId: actor.id,
          message: `${actor.name} enchaîne les plus faibles`,
        });
        for (const t of victims) {
          if (!t.alive) continue;
          if (action.dmgMult && action.dmgMult > 0) {
            const base = skillStrikeBase(actor, action.dmgMult, mitigation(t, actor));
            const damage = monsterDamageBoost(actor, Math.max(1, Math.round(base * rng.variance(DAMAGE_VARIANCE))));
            applyDamage(actor, t, damage, `${actor.name} écrase ${t.name} — ${damage} dégâts`, dmgType);
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
        // Perce-armure PONCTUEL : on retire la part d'armure ignorée le temps de
        // cette frappe, en plus du perce-armure permanent déjà pris par `mitigation`.
        const mit = mitigation(t, actor) * (1 - Math.min(1, action.armorPen ?? 0));
        const base = skillStrikeBase(actor, action.dmgMult, mit);
        const damage = monsterDamageBoost(actor, Math.max(1, Math.round(base * rng.variance(DAMAGE_VARIANCE))));
        applyDamage(actor, t, damage, `${actor.name} anéantit ${t.name} — ${damage} dégâts`, dmgType);
        // `statusChance` absent = statut garanti (comportement historique).
        if (t.alive && action.status && rng.next() < (action.statusChance ?? 1))
          applyStatus(actor, t, action.status, action.statusPotency ?? 0.2, action.statusDuration ?? 2);
        if (t.alive && action.mark)
          t.stacks[action.mark] = Math.min(99, (t.stacks[action.mark] ?? 0) + (action.markStacks ?? 1));
        return true;
      }

      case 'pct_hp': {
        const t = pickTarget(targets, false, rng);
        if (!t) return false;
        // min(PV max × pct, ATK × capMult) : fort sur cibles normales, plafonné sur les boss.
        // Le bonus du set Lourd s'ajoute APRÈS le plafond : c'est une valeur fixe,
        // issue des PV du lanceur et non de ceux de la cible, elle ne rouvre donc
        // pas la porte au one-shot de boss que ce plafond ferme.
        const dmg =
          Math.max(
            1,
            Math.min(Math.round(t.maxHp * action.pct), Math.round(effectiveAtk(actor) * action.capMult)),
          ) + hpStrikeBonus(actor);
        events.push({ type: 'status', round, combatantId: actor.id, message: `${actor.name} vise un point vital` });
        applyDamage(actor, t, dmg, `${actor.name} transperce ${t.name} — ${dmg} dégâts`, dmgType);
        return true;
      }

      case 'multi_hit': {
        events.push({ type: 'status', round, combatantId: actor.id, message: `${actor.name} déchaîne une rafale` });
        for (let h = 0; h < action.hits; h++) {
          const alive = livingOnSide(fighters, enemySide);
          if (alive.length === 0) break;
          for (const t of alive) {
            const base = skillStrikeBase(actor, action.dmgMult, mitigation(t, actor));
            const damage = monsterDamageBoost(actor, Math.max(1, Math.round(base * rng.variance(DAMAGE_VARIANCE))));
            applyDamage(actor, t, damage, `${actor.name} crible ${t.name} — ${damage} dégâts`, dmgType);
          }
        }
        return true;
      }

      case 'extend_statuses': {
        // Prolonge les statuts au lieu de consommer les stacks : la brûlure (et
        // tout autre DoT, d'où qu'il vienne — y compris celle d'un mage feu)
        // continue de courir, et les stacks d'embrasement restent en place pour
        // continuer d'amplifier les dégâts.
        const affected = targets.filter(
          (t) => t.alive && t.statuses.some((s) => s.turnsLeft > 0),
        );
        if (affected.length === 0) return false;
        events.push({
          type: 'status',
          round,
          combatantId: actor.id,
          message: `${actor.name} attise les flammes`,
        });
        const amp = action.dotAmp ?? 0;
        for (const t of affected) {
          let extended = 0;
          let intensified = 0;
          for (const s of t.statuses) {
            if (s.turnsLeft <= 0) continue;
            s.turnsLeft += action.turns;
            extended += 1;
            // Intensification des DoT, UNE SEULE FOIS par statut : sans ce garde,
            // relancer l'ultime toutes les ~5 manches multiplierait les dégâts en
            // boucle jusqu'à l'absurde sur un combat long.
            if (amp > 0 && s.dmgPerTurn > 0 && !s.boosted) {
              s.dmgPerTurn = Math.max(1, Math.round(s.dmgPerTurn * (1 + amp)));
              s.boosted = true;
              intensified += 1;
            }
          }
          events.push({
            type: 'status',
            round,
            combatantId: t.id,
            message:
              `${t.name} — ${extended} affliction(s) prolongée(s) de ${action.turns} tours` +
              (intensified > 0 ? `, dont ${intensified} intensifiée(s)` : ''),
          });
        }
        return true;
      }

      case 'detonate_all': {
        const marked = targets.filter((t) => t.alive && (t.stacks[action.mark] ?? 0) > 0);
        if (marked.length === 0) return false;
        events.push({ type: 'status', round, combatantId: actor.id, message: `${actor.name} déclenche une réaction en chaîne` });
        for (const t of marked) {
          // Frappe directe elle aussi : elle ignore la mitigation (c'est le
          // principe de la détonation), mais reste une attaque du lanceur et
          // porte donc le bonus du set Lourd.
          const burst = Math.max(1, Math.round(effectiveAtk(actor) * action.dmgMult)) + hpStrikeBonus(actor);
          t.stacks[action.mark] = 0;
          applyDamage(actor, t, burst, `${actor.name} fait exploser ${t.name} — ${burst} dégâts`, dmgType);
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
          const base = skillStrikeBase(actor, action.dmgMult, mitigation(t, actor));
          const damage = monsterDamageBoost(actor, Math.max(1, Math.round(base * rng.variance(DAMAGE_VARIANCE))));
          applyDamage(actor, t, damage, `${actor.name} juge ${t.name} — ${damage} dégâts`, dmgType);
        }
        return true;
      }

      case 'purge': {
        // Châtiment (Réprimande/Verdict) & Grand Larcin : dissipe jusqu'à `count`
        // bienfaits de la cible focus, puis la frappe d'autant plus fort qu'elle en portait.
        const t = pickTarget(targets, false, rng);
        if (!t) return false;
        let purged = 0;
        for (let i = 0; i < action.count; i++) {
          if (purgeBuff(actor, t)) purged += 1;
          else break;
        }
        events.push({ type: 'status', round, combatantId: actor.id, message: `${actor.name} prononce sa sentence` });
        const mult = (action.dmgMult ?? 0) + (action.perPurgedDmg ?? 0) * purged;
        if (mult > 0) {
          const base = skillStrikeBase(actor, mult, mitigation(t, actor));
          const damage = monsterDamageBoost(actor, Math.max(1, Math.round(base * rng.variance(DAMAGE_VARIANCE))));
          applyDamage(actor, t, damage, `${actor.name} châtie ${t.name} — ${damage} dégâts`, dmgType);
        }
        return true;
      }

      case 'summon_assault': {
        // Assaut d'os (actif Légion) : le lanceur frappe avec un bonus, puis chacune
        // de ses invocations vivantes rejoue une attaque de base.
        events.push({ type: 'status', round, combatantId: actor.id, message: `${actor.name} lance l'assaut !` });
        // On repère où commencent les coups de CET assaut : les dégâts qu'ils
        // infligent alimentent ensuite le soin des invocations.
        const from = events.length;
        // Le perce-armure vaut pour TOUT l'assaut : le lanceur ouvre la garde et
        // ses invocations s'engouffrent dedans. Le réserver au seul lanceur en
        // gaspillait l'essentiel — la frappe des squelettes est le gros du volume
        // de dégâts de cet actif, et c'est elle qui butait sur l'armure.
        const pen = action.armorPen ?? 0;
        const t = pickTarget(targets, actor.side === 'enemy', rng);
        if (t) basicAttack(actor, t, action.dmgMult, false, pen);
        const mine = (id: string) => id === actor.id || summonerIdOf(id) === actor.id;
        for (const f of [...fighters]) {
          if (!f.alive || !isSummonId(f.id) || summonerIdOf(f.id) !== actor.id) continue;
          if (sideCleared(enemySide)) break;
          const st = pickTarget(livingOnSide(fighters, enemySide), false, rng);
          if (st) basicAttack(f, st, 0, false, pen);
        }

        // Une part des dégâts de l'assaut régénère les invocations. Le soin est
        // appliqué DIRECTEMENT ici, sans passer par `heal()` : ce dernier refuse
        // par principe tout soin sur une invocation (créatures « mortes »), règle
        // qu'on garde partout ailleurs pour qu'un soigneur ne gâche pas son sort.
        const healFrac = action.summonHealFrac ?? 0;
        if (healFrac > 0) {
          let dealt = 0;
          for (let i = from; i < events.length; i++) {
            const e = events[i]!;
            if (e.type === 'attack' && mine(e.sourceId ?? e.actorId)) dealt += e.damage;
          }
          const alive = fighters.filter(
            (f) => f.alive && isSummonId(f.id) && summonerIdOf(f.id) === actor.id,
          );
          const pool = Math.round(dealt * healFrac);
          if (pool > 0 && alive.length > 0) {
            const share = Math.floor(pool / alive.length);
            for (const s of alive) {
              const before = s.hp;
              s.hp = Math.min(s.maxHp, s.hp + share);
              const gained = s.hp - before;
              if (gained > 0) {
                events.push({
                  type: 'heal',
                  round,
                  actorId: actor.id,
                  targetId: s.id,
                  amount: gained,
                  targetHpAfter: s.hp,
                  message: `${actor.name} régénère ${s.name} — ${gained} PV`,
                });
              }
            }
          }
        }
        return true;
      }

      case 'summon_hero': {
        // Avatar d'os (ultime Légion) : une seule fois, invoque un héros-squelette
        // tiré au hasard. `withSpecials` (rang 2) lui donne sa spéciale.
        if (actor.usedActions.has('summon_hero')) return false;
        actor.usedActions.add('summon_hero');
        const tpl = action.templates[Math.floor(rng.next() * action.templates.length)];
        if (!tpl) return false;
        spawnMid(actor.side, [buildSummonInput(casterOf(actor), tpl, 0, action.withSpecials)]);
        events.push({
          type: 'status',
          round,
          combatantId: actor.id,
          message: `${actor.name} invoque un ${tpl.name} !`,
        });
        return true;
      }

      case 'resummon': {
        // Spéciale du mage-squelette : rejoue une fois le pool d'invocation du nécro
        // d'origine (son invocateur).
        if (actor.usedActions.has('resummon')) return false;
        const necro = byId.get(summonerIdOf(actor.id));
        const pool = necro && abilitiesOf(necro, 'summon_pool').find((a) => a.kind === 'summon_pool');
        if (!necro || !pool || pool.kind !== 'summon_pool') return false;
        actor.usedActions.add('resummon');
        const inputs = pickPool(pool, rng).map((tpl, i) =>
          buildSummonInput(casterOf(necro), tpl, 1000 + round * 10 + i, false),
        );
        spawnMid(necro.side, inputs);
        events.push({ type: 'status', round, combatantId: actor.id, message: `${actor.name} rappelle une légion d'os` });
        return true;
      }

      case 'creature_aoe': {
        // Charnier (actif Colosse) : la créature mortuaire refrappe en zone.
        // Ne dépend PLUS d'un cadavre disponible — la compétence était muette tant
        // que personne n'était mort, donc inutilisable en début de combat. Les
        // dégâts viennent de l'ATK de la CRÉATURE (et non du nécromancien) : la
        // Communion, qui lui transfère les stats du lanceur, les renforce donc.
        const creature = creatureOf(actor.id, action.creatureName);
        if (!creature || !creature.alive) return false;
        events.push({
          type: 'status',
          round,
          combatantId: actor.id,
          message: `${actor.name} déchaîne ${creature.name}`,
        });
        const dmg = Math.max(1, Math.round(effectiveAtk(creature) * action.dmgMult));
        for (const foe of [...targets]) {
          if (foe.alive) applyDamage(creature, foe, dmg, `${creature.name} déchaîne l'ossuaire — ${dmg} dégâts`);
        }
        return true;
      }

      case 'sacrifice_transfer': {
        // Communion (ultime Colosse) : le lanceur se sacrifie et transfère ses stats
        // à sa créature mortuaire, à hauteur de `pctPerStack` × ossements récoltés.
        // Le forfait précédent (100 % / 120 % quoi qu'il arrive) ignorait le travail
        // de récolte : deux Colosses au même rang finissaient identiques, que l'un
        // ait empilé 30 ossements ou zéro.
        if (actor.usedActions.has('sacrifice')) return false;
        const creature = creatureOf(actor.id, action.creatureName);
        if (!creature) return false;
        // Délai APRÈS l'invocation : la créature doit avoir vécu `delayRounds`
        // manches avant qu'on puisse lui transférer ses stats. Sans ce garde, la
        // Communion partait dès que la créature apparaissait, ce qui court-circuitait
        // toute la montée en puissance de la branche.
        const delay = action.delayRounds ?? 0;
        if (delay > 0 && (actor.ritualRound === undefined || round < actor.ritualRound + delay)) {
          return false;
        }
        // Sans le moindre ossement il n'y a rien à transmettre : on garde l'ultime
        // en réserve plutôt que de tuer le lanceur pour un transfert nul.
        if (actor.boneStacks <= 0) return false;
        actor.usedActions.add('sacrifice');
        const pct = action.pctPerStack * actor.boneStacks;
        const addHp = Math.round(actor.maxHp * pct);
        creature.maxHp += addHp;
        creature.hp += addHp;
        creature.atk = Math.round(creature.atk + actor.atk * pct);
        creature.def = Math.round(creature.def + actor.def * pct);
        events.push({
          type: 'status',
          round,
          combatantId: actor.id,
          bones: actor.boneStacks,
          message: `${actor.name} se sacrifie et se fond dans ${creature.name} (${actor.boneStacks} ossements — +${Math.round(pct * 100)} %)`,
        });
        actor.hp = 0;
        killOrRevive(actor);
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
      const regen = Math.min(REGEN_CAP, passive(f, 'regen'));
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
    // On ne journalise QUE quand elle monte (première pose ou après absorption),
    // pour ne pas spammer le log à chaque manche.
    for (const f of fighters) {
      if (!f.alive) continue;
      let pct = 0;
      for (const a of abilitiesOf(f, 'barrier')) if (a.kind === 'barrier') pct = Math.max(pct, a.pct);
      if (pct <= 0) continue;
      const want = Math.round(f.maxHp * pct);
      if (want > f.barrier) {
        f.barrier = want;
        events.push({
          type: 'status',
          round,
          combatantId: f.id,
          barrier: f.barrier,
          message: `${f.name} lève une barrière (${f.barrier})`,
        });
      }
    }

    // Soutien (soigneur / paladin) : soin passif ciblé + barrière sur l'allié le plus faible.
    for (const f of fighters) {
      if (!f.alive) continue;
      for (const a of abilitiesOf(f, 'heal_aura')) {
        if (a.kind !== 'heal_aura') continue;
        const target = pickHealTarget(healableOnSide(f.side));
        if (target) heal(f, target, castHealAmount(f, target, a.pct), `${f.name} soigne ${target.name}`);
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
            barrier: lowest.barrier,
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
          // Les invocations ne bénéficient pas de la bénédiction (aucun soin).
          if (isSummonId(ally.id)) continue;
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
          // Amplificateur de TYPE de la source (set +poison/+feu) : le DoT porte
          // l'école de son statut (poison→poison, burn→feu) + la base de la source.
          amp += damageTypeAmp(src, src.basicType, schoolOfStatus(s.type));
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
        (a) => a.kind === 'taunt' && a.everyRounds > 0 && round % activePeriod(actor, a.everyRounds) === 0,
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

      // Abilités actives prêtes (autocast à cooldown) : prioritaires sur l'attaque.
      //
      // On les joue TOUTES, pas seulement la première. Avec un seul `find`, une
      // capacité de période courte éclipsait définitivement une capacité de période
      // plus longue dont elle divise la cadence : un actif « tous les 2 tours » est
      // prêt à chaque manche paire, donc AUSSI à chaque manche multiple de 4 — un
      // ultime « tous les 4 tours » ne partait alors jamais de tout le combat.
      const ready = abilitiesOf(actor, 'autocast').filter(
        (a) => a.kind === 'autocast' && a.everyRounds > 0 && round % activePeriod(actor, a.everyRounds) === 0,
      );
      let casted = false;
      for (const a of ready) {
        if (!actor.alive) break; // certains sorts sacrifient le lanceur
        if (runAutocast(actor, a, enemySide)) casted = true;
      }
      if (casted) continue;

      // Moelle (Colosse) : chance de récolter un STACK D'OS. Au seuil, le rituel
      // invoque la créature mortuaire (une seule fois).
      //
      // La récolte s'ajoute à l'attaque au lieu de la remplacer. Avant, le tour
      // était CONSOMMÉ : le nécro renonçait à frapper pour un compteur, ce qui
      // rendait la branche perdante à court terme et la rendait à peu près
      // injouable. Et on récolte désormais SANS FIN, même après le rituel :
      // les ossements alimentent la Communion, qui transfère d'autant plus que
      // le tas est haut. Ils ne sont donc plus un compteur mort une fois la
      // créature dressée.
      const bone = abilitiesOf(actor, 'bone_stack').find((a) => a.kind === 'bone_stack');
      if (bone && bone.kind === 'bone_stack' && rng.next() < bone.chance) {
        actor.boneStacks += 1;
        const ritualSpec = abilitiesOf(actor, 'bone_ritual').find((a) => a.kind === 'bone_ritual');
        const needed =
          ritualSpec && ritualSpec.kind === 'bone_ritual' ? Math.ceil(ritualSpec.threshold) : undefined;
        events.push({
          type: 'status',
          round,
          combatantId: actor.id,
          bones: actor.boneStacks,
          // Le seuil accompagne chaque ossement : l'UI peut afficher « 4/10 »
          // sans connaître les règles de la branche.
          ...(needed !== undefined ? { bonesNeeded: needed } : {}),
          message: `${actor.name} récolte un ossement (${actor.boneStacks}${needed ? `/${needed}` : ''})`,
        });
        const ritual = abilitiesOf(actor, 'bone_ritual').find((a) => a.kind === 'bone_ritual');
        if (
          ritual &&
          ritual.kind === 'bone_ritual' &&
          !actor.usedActions.has('ritual') &&
          actor.boneStacks >= ritual.threshold
        ) {
          actor.usedActions.add('ritual');
          actor.ritualRound = round;
          const tpl: SummonTemplate = {
            name: ritual.name,
            hpMult: ritual.hpMult,
            atkMult: ritual.atkMult,
            defMult: 1,
          };
          spawnMid(actor.side, [buildSummonInput(casterOf(actor), tpl, 0, false)]);
          events.push({
            type: 'status',
            round,
            combatantId: actor.id,
            message: `${actor.name} accomplit le rituel : ${ritual.name} se dresse !`,
          });
        }
        // PAS de `continue` : la récolte ne coûte plus le tour, le nécro enchaîne
        // sur son attaque normale juste en dessous.
      }

      // Soigneur : soigne l'allié le plus blessé s'il y en a un, sinon attaque.
      if (actor.role === 'healer') {
        const healTarget = pickHealTarget(healableOnSide(actor.side));
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

      // Set Moyen : une 2e attaque dans le même tour (dégâts déjà réduits, double les procs).
      if (hasDoubleStrike(actor) && !sideCleared(enemySide)) {
        const t2 = pickTarget(livingOnSide(fighters, enemySide), actor.side === 'enemy', rng);
        if (t2) basicAttack(actor, t2);
      }

      // Rafale précise (archer) : chance de tirer une flèche supplémentaire dans le tour.
      for (const a of abilitiesOf(actor, 'extra_attack')) {
        if (a.kind !== 'extra_attack') continue;
        if (sideCleared(enemySide)) break;
        if (rng.next() < a.chance) {
          const te = pickTarget(livingOnSide(fighters, enemySide), actor.side === 'enemy', rng);
          if (te) basicAttack(actor, te);
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
    ...(spawnRounds.has(f.id) ? { spawnRound: spawnRounds.get(f.id)! } : {}),
  }));

  return { result, seed: input.seed, rounds: round, events, finalState };
}
