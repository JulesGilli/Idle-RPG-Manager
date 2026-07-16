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

/**
 * L'OR porte l'escalade, la LARME reste plate. La larme est partagée avec l'éveil
 * (3) et les runes (2) — cf. runes.ts — et ne tombe qu'à 35 % sur le boss du T4.
 * Une courbe qui escalade AUSSI sur elle rendait le +10 hors de portée : 55
 * larmes, soit 18 éveils pour une seule arme.
 */
describe('blessingCost', () => {
  it('l’or escalade', () => {
    expect(blessingCost(4).gold).toBeGreaterThan(blessingCost(0).gold);
    expect(blessingCost(9).gold).toBeGreaterThan(blessingCost(4).gold);
  });

  it('la larme reste plate : 2 puis 3, jamais plus', () => {
    expect(blessingCost(0).materials[0]).toEqual({ key: 'larme_astrale', qty: 2 });
    expect(blessingCost(4).materials[0]!.qty).toBe(2);
    expect(blessingCost(5).materials[0]!.qty).toBe(3);
    expect(blessingCost(9).materials[0]!.qty).toBe(3);
  });

  it('un +10 complet reste à l’échelle des autres usages de la larme', () => {
    let tears = 0;
    for (let l = 0; l < BLESSING_MAX; l++) tears += blessingCost(l).materials[0]!.qty;
    expect(tears).toBe(25); // 55 auparavant — hors d'échelle face aux 3 d'un éveil
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
