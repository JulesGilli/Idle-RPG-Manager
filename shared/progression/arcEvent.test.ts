import { describe, expect, it } from 'vitest';
import { resolveCombat } from '../combat/resolveCombat.ts';
import type { CombatantInput } from '../combat/types.ts';
import {
  ARC_HEART_COUNT,
  ARC_HEART_HP_PER_PARTICIPANT,
  arcHeartHp,
  arcHeartsPoolHp,
  arcHeartsRemaining,
  arcHeartCombatants,
} from './arcEvent.ts';

const hero = (o: Partial<CombatantInput> = {}): CombatantInput => ({
  id: 'h1',
  name: 'Héros',
  role: 'dps',
  hp: 3000,
  atk: 300,
  def: 50,
  speed: 20,
  ...o,
});

describe('cœurs de démon — dimensionnement du pool', () => {
  it('un cœur vaut 1 M de PV par joueur éligible', () => {
    expect(arcHeartHp(1)).toBe(ARC_HEART_HP_PER_PARTICIPANT);
    expect(arcHeartHp(5)).toBe(5 * ARC_HEART_HP_PER_PARTICIPANT);
  });

  it('le pool total vaut les cinq cœurs réunis', () => {
    expect(arcHeartsPoolHp(5)).toBe(ARC_HEART_COUNT * 5 * ARC_HEART_HP_PER_PARTICIPANT);
  });

  it('plancher à 1 joueur : un pool nul rendrait l’event increvable ou instantané', () => {
    expect(arcHeartHp(0)).toBe(ARC_HEART_HP_PER_PARTICIPANT);
    expect(arcHeartsPoolHp(-3)).toBe(ARC_HEART_COUNT * ARC_HEART_HP_PER_PARTICIPANT);
  });
});

describe('cœurs restants déduits du pool', () => {
  const eligibles = 5;
  const per = arcHeartHp(eligibles); // 5 M

  it('pool plein = 5 cœurs, pool vide = 0', () => {
    expect(arcHeartsRemaining(arcHeartsPoolHp(eligibles), eligibles)).toBe(ARC_HEART_COUNT);
    expect(arcHeartsRemaining(0, eligibles)).toBe(0);
  });

  it('les cœurs tombent un par un', () => {
    // Un cœur pile détruit : il reste exactement 4 debout.
    expect(arcHeartsRemaining(per * 4, eligibles)).toBe(4);
    // Une écorchure sur le 5e : il tient encore, donc 5 debout.
    expect(arcHeartsRemaining(per * 4 + 1, eligibles)).toBe(5);
    // Dernier cœur entamé : toujours 1 debout tant que le pool n'est pas vide.
    expect(arcHeartsRemaining(1, eligibles)).toBe(1);
  });

  it('ne dépasse jamais 5, même si le pool est gonflé', () => {
    expect(arcHeartsRemaining(per * 99, eligibles)).toBe(ARC_HEART_COUNT);
  });
});

describe('les cœurs ne frappent JAMAIS (inert)', () => {
  it('une escouade ressort intacte après un combat complet', () => {
    const squad = [hero({ id: 'h1' }), hero({ id: 'h2' })];
    const res = resolveCombat({
      allies: squad,
      enemies: arcHeartCombatants(ARC_HEART_COUNT),
      seed: 12,
      maxRounds: 40,
    });
    // Le vrai piège : `atk: 0` ne suffit pas (plancher à 1 dégât par coup). Sur
    // 40 manches × 5 cœurs, une escouade non protégée aurait perdu des PV.
    for (const h of res.finalState.filter((f) => f.id.startsWith('h'))) {
      expect(h.hp, `${h.id} a été touché`).toBe(h.maxHp);
      expect(h.alive).toBe(true);
    }
    // Et aucun événement d'attaque n'émane d'un cœur.
    const heartAttacks = res.events.filter(
      (e) => e.type === 'attack' && typeof e.actorId === 'string' && e.actorId.startsWith('arc-heart'),
    );
    expect(heartAttacks).toHaveLength(0);
  });

  it('les cœurs encaissent bien les dégâts (ce sont des cibles, pas des décors)', () => {
    const res = resolveCombat({
      allies: [hero()],
      enemies: arcHeartCombatants(1),
      seed: 5,
      maxRounds: 20,
    });
    const heart = res.finalState.find((f) => f.id === 'arc-heart-1')!;
    expect(heart.maxHp - heart.hp).toBeGreaterThan(0);
  });

  it('n’en dresse que le nombre demandé (les cœurs détruits ne reviennent pas)', () => {
    const res = resolveCombat({
      allies: [hero()],
      enemies: arcHeartCombatants(2),
      seed: 5,
      maxRounds: 5,
    });
    expect(res.finalState.filter((f) => f.id.startsWith('arc-heart'))).toHaveLength(2);
  });
});
