import { describe, it, expect } from 'vitest';
import { CRIT_CHANCE_CAP, critChanceOf } from './resolveCombat.ts';
import { WEAPON_PASSIVES } from '../progression/forge.ts';
import { GEMS } from '../progression/jewelry.ts';

/**
 * Le critique s'additionne depuis plusieurs sources indépendantes (gemme, arbre,
 * buff de guilde, passif d'arme). Ces tests garantissent qu'aucun empilement ne
 * transforme le critique en certitude — ce qui supprimerait la variance qui fait
 * l'identité de l'Arc.
 */
describe('plafond de critique', () => {
  it('somme les sources tant qu’on est sous le plafond', () => {
    const f = { passives: [
      { type: 'crit' as const, value: 0.2 },
      { type: 'crit' as const, value: 0.15 },
    ] };
    expect(critChanceOf(f)).toBeCloseTo(0.35);
  });

  it('ne dépasse jamais le plafond, même en empilant tout', () => {
    const f = { passives: [
      { type: 'crit' as const, value: 0.35 }, // gemme max
      { type: 'crit' as const, value: 0.35 }, // Arc zone 10
      { type: 'crit' as const, value: 0.2 }, // arbre
      { type: 'crit' as const, value: 0.1 }, // buff de guilde
    ] };
    expect(critChanceOf(f)).toBe(CRIT_CHANCE_CAP);
  });

  it('reste un pari : le plafond laisse une vraie chance de rater', () => {
    expect(CRIT_CHANCE_CAP).toBeLessThan(1);
    expect(CRIT_CHANCE_CAP).toBeGreaterThan(0.5);
  });

  it('ignore les autres passifs', () => {
    expect(critChanceOf({ passives: [{ type: 'dodge', value: 0.3 }] })).toBe(0);
    expect(critChanceOf({ passives: [] })).toBe(0);
  });

  // Où se situe VRAIMENT le plafond par rapport aux builds réels du jeu.
  const critGem = GEMS.find((g) => g.passive === 'crit')!;
  const arcMax = WEAPON_PASSIVES.arc!.maxPct;

  it('gemme + Arc restent sous le plafond : le build spécialisé reste jouable', () => {
    // 70 % — volontairement juste en dessous. C'est l'équivalent en dégâts du
    // futur build Épée (+35 % ATK secondaire + 35 % de crit de gemme).
    expect((critGem.maxPct + arcMax) / 100).toBeLessThanOrEqual(CRIT_CHANCE_CAP);
  });

  it('mais empiler l’arbre par-dessus sature — c’est là que le plafond mord', () => {
    const withTree = { passives: [
      { type: 'crit' as const, value: critGem.maxPct / 100 },
      { type: 'crit' as const, value: arcMax / 100 },
      { type: 'crit' as const, value: 0.2 }, // arbre d'un archer spécialisé
    ] };
    expect(critChanceOf(withTree)).toBe(CRIT_CHANCE_CAP);
  });
});
