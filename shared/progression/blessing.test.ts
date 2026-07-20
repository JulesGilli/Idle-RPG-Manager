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
  it('reconnaît les armes de set via leur mot-modèle court', () => {
    // « Marteau du Colosse » ≠ label « Marteau de guerre » : sans l'alias, ni
    // bénissable ni amplifiée en combat (weaponCombatAmp utilise aussi baseIdOfName).
    expect(baseIdOfName('Marteau du Colosse (Panoplie du Colosse)')).toBe('marteau');
    expect(baseIdOfName('Épée du Duelliste')).toBe('epee');
    expect(baseIdOfName('Sceptre du Tacticien')).toBe('sceptre');
    // Non-régression : un marteau FORGÉ reste sur son label complet.
    expect(baseIdOfName('Marteau de guerre de givre')).toBe('marteau');
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

  it('la larme reste plate : 1 puis 2, jamais plus', () => {
    expect(blessingCost(0).materials[0]).toEqual({ key: 'larme_astrale', qty: 1 });
    expect(blessingCost(4).materials[0]!.qty).toBe(1);
    expect(blessingCost(5).materials[0]!.qty).toBe(2);
    expect(blessingCost(9).materials[0]!.qty).toBe(2);
  });

  it('un +10 complet reste à l’échelle des autres usages de la larme', () => {
    let tears = 0;
    for (let l = 0; l < BLESSING_MAX; l++) tears += blessingCost(l).materials[0]!.qty;
    // 55 a l'origine, 25 apres un premier passage : toujours trop pour un joueur
    // qui vise les armes de ses 9 heros. Les drops, eux, ne pouvaient plus monter
    // sans rendre l'eveil et les runes gratuits (meme ressource).
    expect(tears).toBe(15);
  });
});

describe('validateBless', () => {
  it('OK si arme bénissable et sous le plafond de renforcement', () => {
    expect(validateBless('Épée de givre', 'weapon', 5, 2).ok).toBe(true);
  });
  it('accepte le Marteau du Colosse (arme de set) — bug de reconnaissance corrigé', () => {
    expect(validateBless('Marteau du Colosse (Panoplie du Colosse)', 'weapon', 5, 0).ok).toBe(true);
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
