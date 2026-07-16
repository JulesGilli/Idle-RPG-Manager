import { describe, it, expect } from 'vitest';
import { FORGE_BASES, baseProfile } from './forge.ts';
import { CLASS_DAMAGE_BASE } from './damageTypes.ts';
import { blessedTypeBonusPct, BLESSING_MAX, BLESSING_STEP } from './blessing.ts';

/**
 * L'amplificateur de type est le SEUL axe qui distingue deux armes de même
 * profil (Épée / Sceptre = ATK pur). Ces tests verrouillent son calibrage et,
 * surtout, l'appariement arme ↔ classe : un `kind` qui ne matche pas le type de
 * dégâts du porteur rend l'amp mort (damageTypeAmp ne voit jamais le tag) —
 * c'était le cas du Marteau (magical) porté par le Paladin (physical).
 */

/** Arme signature de chaque classe (1 arme = 1 classe). */
const CLASS_WEAPON: Record<string, string> = {
  inquisiteur: 'grande_epee',
  paladin: 'marteau',
  guerrier: 'epee',
  necromancien: 'faux',
  archer: 'arc',
  voleur: 'dague',
  mage: 'sceptre',
  soigneur: 'baton',
};

const weapons = FORGE_BASES.filter((b) => b.itemType === 'weapon');

describe('amplificateur de type des armes', () => {
  it('couvre exactement les 8 classes', () => {
    expect(weapons).toHaveLength(8);
    expect(Object.keys(CLASS_WEAPON).sort()).toEqual(Object.keys(CLASS_DAMAGE_BASE).sort());
  });

  it('chaque arme porte un amplificateur', () => {
    for (const w of weapons) expect(w.typeBonus, w.id).toBeDefined();
  });

  it("le kind d'une arme de dégâts matche le type de sa classe — sinon l'amp est mort", () => {
    for (const [classId, weaponId] of Object.entries(CLASS_WEAPON)) {
      const w = weapons.find((x) => x.id === weaponId)!;
      if (w.typeBonus!.kind === 'heal') continue; // le soin n'est pas un type de dégâts
      expect(w.typeBonus!.kind, `${weaponId} (${classId})`).toBe(CLASS_DAMAGE_BASE[classId]);
    }
  });

  it("les armes SANS secondaire frappent plus fort que celles qui en ont une", () => {
    const pure = weapons.filter((w) => baseProfile(w).secondary === null && w.typeBonus!.kind !== 'heal');
    const withSecondary = weapons.filter((w) => baseProfile(w).secondary !== null);
    const minPure = Math.min(...pure.map((w) => w.typeBonus!.pct));
    const maxSecondary = Math.max(...withSecondary.map((w) => w.typeBonus!.pct));
    expect(minPure).toBeGreaterThan(maxSecondary);
  });

  it("le bâton troque ses dégâts contre l'amp de soin le plus fort", () => {
    const baton = weapons.find((w) => w.id === 'baton')!;
    expect(baton.typeBonus!.kind).toBe('heal');
    expect(baton.bias.atk).toBeLessThan(Math.min(...weapons.filter((w) => w.id !== 'baton').map((w) => w.bias.atk)));
    expect(baton.typeBonus!.pct).toBeGreaterThan(Math.max(...weapons.filter((w) => w.id !== 'baton').map((w) => w.typeBonus!.pct)));
  });

  it("aucun amp ne devient absurde une fois beni au max (x2.5)", () => {
    for (const w of weapons) {
      const maxed = blessedTypeBonusPct(w.typeBonus!.pct, BLESSING_MAX);
      expect(maxed, w.id).toBeLessThanOrEqual(0.6);
    }
    // Le facteur de bénédiction est bien x2.5 — si BLESSING_STEP bouge, ce test
    // rappelle que tout le calibrage ci-dessus en dépend.
    expect(1 + BLESSING_STEP * BLESSING_MAX).toBeCloseTo(2.5);
  });
});
