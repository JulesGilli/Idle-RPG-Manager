import { describe, expect, it } from 'vitest';
import {
  BLESSING_MAX,
  baseIdOfName,
  weaponTypeBonus,
  blessedTypeBonusPct,
  blessingCost,
  validateBless,
} from './blessing.ts';
import { FORGE_BASES } from './forge.ts';

describe('baseIdOfName', () => {
  it('déduit le modèle depuis le nom (préfixe le plus long)', () => {
    expect(baseIdOfName('Épée de givre')).toBe('epee');
    expect(baseIdOfName('Grande épée en chêne')).toBe('grande_epee'); // pas « epee »
    expect(baseIdOfName('Faux des sables')).toBe('faux');
    expect(baseIdOfName('Bâton runique')).toBe('baton');
  });
  it('null pour un nom sans modèle connu', () => {
    expect(baseIdOfName('Anneau de puissance')).toBeNull();
  });
});

describe('weaponTypeBonus', () => {
  it('renvoie l’amplificateur de type d’une arme', () => {
    // Ce test porte sur la RECHERCHE, pas sur l'équilibrage : on compare à la
    // donnée source plutôt que de recopier des %, sinon tout retouche du
    // calibrage le casse. Le calibrage est couvert par weaponTypeBonus.test.ts.
    for (const id of ['marteau', 'baton', 'epee']) {
      expect(weaponTypeBonus(id), id).toEqual(FORGE_BASES.find((b) => b.id === id)!.typeBonus);
    }
    expect(weaponTypeBonus('baton')?.kind).toBe('heal');
  });
  it('null pour une armure', () => {
    expect(weaponTypeBonus('plaques')).toBeNull();
  });
});

describe('blessedTypeBonusPct', () => {
  it('amplifie le % de base avec le niveau de bénédiction', () => {
    expect(blessedTypeBonusPct(0.1, 0)).toBeCloseTo(0.1, 6);
    expect(blessedTypeBonusPct(0.1, 10)).toBeCloseTo(0.25, 6); // ×2.5 au niveau max
  });
});

describe('blessingCost', () => {
  it('coût croissant en or et en larmes astrales', () => {
    expect(blessingCost(0).materials[0]).toEqual({ key: 'larme_astrale', qty: 1 });
    expect(blessingCost(4).materials[0]!.qty).toBe(5);
    expect(blessingCost(4).gold).toBeGreaterThan(blessingCost(0).gold);
  });
});

describe('validateBless', () => {
  it('OK si arme bénissable et sous le plafond de renforcement', () => {
    expect(validateBless('Épée de givre', 'weapon', 5, 2).ok).toBe(true);
  });
  it('refuse au-delà du niveau de renforcement (bénédiction ≤ renfo)', () => {
    expect(validateBless('Épée de givre', 'weapon', 3, 3).ok).toBe(false);
  });
  it('refuse au plafond de bénédiction', () => {
    expect(validateBless('Épée de givre', 'weapon', 10, BLESSING_MAX).ok).toBe(false);
  });
  it('refuse une armure ou un bijou', () => {
    expect(validateBless('Armure de plaques en chêne', 'armor', 5, 0).ok).toBe(false);
    expect(validateBless('Anneau de rage', 'jewel', 5, 0).ok).toBe(false);
  });
});
