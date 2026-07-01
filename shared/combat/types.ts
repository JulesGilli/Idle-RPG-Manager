/**
 * Types du simulateur de combat. Framework-free, partagé front + Edge Function.
 */

export type CombatRole = 'tank' | 'dps' | 'healer' | 'enemy';

export type Side = 'ally' | 'enemy';

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
