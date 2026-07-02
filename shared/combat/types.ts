/**
 * Types du simulateur de combat. Framework-free, partagé front + Edge Function.
 */

export type CombatRole = 'tank' | 'dps' | 'healer' | 'enemy';

export type Side = 'ally' | 'enemy';

/** Passifs procurés par les bijoux (gemmes). Valeur = fraction (0.12 = 12 %). */
export type PassiveType =
  | 'regen' // récupère X% des PV max à chaque tour
  | 'shield' // réduit les dégâts subis de X%
  | 'crit' // X% de chance d'infliger un coup critique (dégâts ×2)
  | 'venom' // +X% de dégâts contre les ennemis déjà blessés
  | 'rage' // +X% de dégâts sous 50 % de PV
  | 'thorns' // renvoie X% des dégâts subis
  | 'lifesteal' // soigne X% des dégâts infligés
  | 'first_strike' // +X% de dégâts au premier tour
  | 'dodge' // X% de chance d'esquiver une attaque
  | 'execute'; // +X% de dégâts contre les cibles sous 30 % de PV

export type CombatPassive = { type: PassiveType; value: number };

/* ------------------------------------------------------------- ABILITÉS -- */

/** Statuts appliqués en combat (par les abilités). */
export type StatusType =
  | 'poison' // DoT (dégâts par tour)
  | 'burn' // DoT de feu (se propage via l'AOE mage)
  | 'stun' // saute son tour
  | 'weaken'; // ATK & DEF réduites

/** Action lancée par une abilité active (autocast). */
export type AutocastAction =
  | {
      type: 'aoe';
      /** Dégâts = ATK × dmgMult sur chaque ennemi. */
      dmgMult: number;
      /** Statut optionnel appliqué aux cibles touchées. */
      status?: StatusType;
      statusChance?: number;
      statusPotency?: number;
      statusDuration?: number;
      /** Propage le burn aux autres ennemis déjà en feu (mage de feu). */
      spread?: boolean;
    }
  | {
      type: 'stun_all';
      duration: number;
      /** Dégâts optionnels infligés en même temps (frappe divine). */
      dmgMult?: number;
    };

/**
 * Abilité portée par un combattant (dérivée des compétences de classe ou de la
 * config ennemie). Union discriminée par `kind` — data-driven, pur.
 */
export type Ability =
  | { kind: 'armor_pen'; value: number } // ignore `value` (fraction) de la DEF
  | {
      kind: 'on_hit';
      status: StatusType;
      chance: number;
      /** Sens selon le statut : DoT = fraction de l'ATK/tour ; weaken = fraction de réduction. */
      potency: number;
      duration: number;
    }
  | { kind: 'multi_shot'; chance: number; extraTargets: number }
  | { kind: 'amp_vs_status'; status: StatusType; bonus: number } // +bonus fraction de dégâts
  | { kind: 'autocast'; everyRounds: number; action: AutocastAction }
  | { kind: 'revive'; hpPct: number } // ressuscite une fois par combat
  | { kind: 'contagion'; chance: number }; // tes DoT se propagent à un autre ennemi

/** Combattant tel que fourni en entrée (stats déjà "effectives"). */
export type CombatantInput = {
  id: string;
  name: string;
  role: CombatRole;
  /** PV max (= PV de départ). */
  hp: number;
  atk: number;
  def: number;
  speed: number;
  /** Réduction plate de dégâts (armure), distincte de la DEF ; ciblée par armor_pen. */
  armor?: number;
  /** Passifs (bijoux) — optionnels. */
  passives?: CombatPassive[];
  /** Abilités actives/procs (compétences de classe ou ennemi) — optionnelles. */
  abilities?: Ability[];
};

export type CombatInput = {
  allies: CombatantInput[];
  enemies: CombatantInput[];
  seed: number;
  /** Sécurité anti-combat infini. Défaut : 100. */
  maxRounds?: number;
};

export type CombatEvent =
  | {
      type: 'attack';
      round: number;
      actorId: string;
      targetId: string;
      damage: number;
      targetHpAfter: number;
      message: string;
    }
  | {
      type: 'heal';
      round: number;
      actorId: string;
      targetId: string;
      amount: number;
      targetHpAfter: number;
      message: string;
    }
  | {
      type: 'death';
      round: number;
      combatantId: string;
      message: string;
    }
  | {
      // Événement informatif (statut appliqué, étourdissement, cast d'ultime,
      // armure brisée…). Ne modifie pas de PV — les dégâts/soins passent par
      // 'attack'/'heal' pour que l'UI reconstruise les barres de vie.
      type: 'status';
      round: number;
      combatantId: string;
      status?: StatusType;
      message: string;
    }
  | {
      type: 'end';
      round: number;
      result: CombatResultKind;
      message: string;
    };

export type CombatResultKind = 'win' | 'loss';

/** État final d'un combattant (pour l'UI / le calcul de survie). */
export type CombatantFinalState = {
  id: string;
  name: string;
  side: Side;
  hp: number;
  maxHp: number;
  alive: boolean;
};

export type CombatResult = {
  result: CombatResultKind;
  seed: number;
  rounds: number;
  events: CombatEvent[];
  finalState: CombatantFinalState[];
};
