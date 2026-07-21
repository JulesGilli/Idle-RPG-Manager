import { describe, expect, it } from 'vitest';
import { resolveCombat } from '../combat/resolveCombat.ts';
import type { CombatantInput } from '../combat/types.ts';
import {
  ARC_HEART_COUNT,
  ARC_HEART_HP_PER_PARTICIPANT,
  arcHeartHp,
  arcHeartsPoolHp,
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

describe('les CINQ cœurs sont dans le même combat (argument des builds de zone)', () => {
  it('en dresse toujours 5, sans dépendre de l’avancement du pool', () => {
    expect(arcHeartCombatants()).toHaveLength(ARC_HEART_COUNT);
  });

  it('une frappe de ZONE entame les cinq cœurs, une mono-cible un seul', () => {
    const heartsHit = (allies: CombatantInput[]) => {
      const res = resolveCombat({
        allies,
        enemies: arcHeartCombatants(),
        seed: 4,
        maxRounds: 6,
      });
      return res.finalState.filter((f) => f.id.startsWith('arc-heart') && f.hp < f.maxHp).length;
    };

    // Mono-cible : le focus-fire de l'escouade ne touche qu'un cœur (ils ont
    // 1 Md de PV, aucun risque d'en achever un et de passer au suivant).
    expect(heartsHit([hero()])).toBe(1);

    // Zone (`aoe` tous les tours) : les cinq encaissent. C'est CE contraste qui
    // justifie la phase — si la zone ne servait à rien, autant garder un boss.
    const aoe = hero({
      id: 'mage',
      abilities: [{ kind: 'autocast', everyRounds: 1, action: { type: 'aoe', dmgMult: 1 } }],
    });
    expect(heartsHit([aoe])).toBe(ARC_HEART_COUNT);
  });
});

describe('les cœurs ne frappent JAMAIS (inert)', () => {
  it('une escouade ressort intacte après un combat complet', () => {
    const squad = [hero({ id: 'h1' }), hero({ id: 'h2' })];
    const res = resolveCombat({
      allies: squad,
      enemies: arcHeartCombatants(),
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
      enemies: arcHeartCombatants(),
      seed: 5,
      maxRounds: 20,
    });
    const heart = res.finalState.find((f) => f.id === 'arc-heart-1')!;
    expect(heart.maxHp - heart.hp).toBeGreaterThan(0);
  });
});
