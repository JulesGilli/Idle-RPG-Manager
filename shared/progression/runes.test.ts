import { describe, expect, it } from 'vitest';
import { SETS, setEffectAt } from './sets.ts';
import {
  canAwaken,
  runeExtractableSets,
  isRuneSet,
  runeAbilities,
  runeAbilitiesFor,
  runeEffectSuppressed,
  AWAKEN_LEVEL,
} from './runes.ts';

describe('canAwaken', () => {
  it('exige grade S + niveau max, et pas déjà éveillé', () => {
    expect(canAwaken('S', AWAKEN_LEVEL, false)).toBe(true);
    expect(canAwaken('A', AWAKEN_LEVEL, false)).toBe(false); // pas S
    expect(canAwaken('S', AWAKEN_LEVEL - 1, false)).toBe(false); // pas niveau max
    expect(canAwaken('S', AWAKEN_LEVEL, true)).toBe(false); // déjà éveillé
  });
});

describe('sets extractibles en rune', () => {
  it('uniquement les sets à effet 2-pièces — jamais un 4-pièces', () => {
    // Liste volontairement NON figée : tous les sets d'arc 2 sont des 2-pièces,
    // et il s'en ajoutera. Ce qu'on verrouille, c'est la RÈGLE, pas le contenu —
    // une liste en dur casserait à chaque nouveau set sans rien prouver.
    const extractables = runeExtractableSets();
    for (const s of extractables) expect(setEffectAt(s)).toBe(2);
    for (const s of SETS) {
      if (setEffectAt(s) === 2) expect(extractables.map((x) => x.id)).toContain(s.id);
    }
    // Les grands sets d'arc 1 (4 pièces) en restent exclus.
    for (const id of ['colosse', 'duelliste', 'tacticien']) {
      expect(extractables.map((s) => s.id)).not.toContain(id);
    }
  });
  it('isRuneSet distingue 2-pièces vs 4-pièces', () => {
    expect(isRuneSet('pyromane')).toBe(true); // 2-pièces
    expect(isRuneSet('colosse')).toBe(false); // 4-pièces
    expect(isRuneSet('inconnu')).toBe(false);
  });
});

describe('runeAbilities', () => {
  it('rend l’effet 2-pièces du set', () => {
    expect(runeAbilities('pyromane')).toEqual([{ kind: 'dmg_type_amp', damageType: 'fire', value: 0.35 }]);
    expect(runeAbilities('provocateur')).toEqual([{ kind: 'threat', value: 6 }]);
  });
  it('vide pour un set 4-pièces ou inconnu', () => {
    expect(runeAbilities('colosse')).toEqual([]);
    expect(runeAbilities(null)).toEqual([]);
  });
});

describe('non-cumul d’un MÊME effet de set (équipement + rune)', () => {
  // `pyromane` est un set 2-pièces universel : 2 pièces portées = effet actif.
  const PYRO = ['pyromane', 'pyromane'];

  it('la rune est NEUTRALISÉE si le même set est déjà porté', () => {
    expect(runeEffectSuppressed('pyromane', PYRO, 'mage')).toBe(true);
    expect(runeAbilitiesFor('pyromane', PYRO, 'mage')).toEqual([]);
  });

  it('une seule pièce portée ne suffit pas à neutraliser (l’effet n’est pas actif)', () => {
    expect(runeEffectSuppressed('pyromane', ['pyromane'], 'mage')).toBe(false);
    expect(runeAbilitiesFor('pyromane', ['pyromane'], 'mage')).toEqual(runeAbilities('pyromane'));
  });

  it('DEUX SETS DIFFÉRENTS aux effets voisins se cumulent bien', () => {
    // C'est la règle voulue : on indexe sur l'IDENTITÉ du set, pas sur l'effet.
    // Ici la rune scelle un set arcane alors que l'équipement en porte un AUTRE.
    const arcaneSets = SETS.filter(
      (s) =>
        setEffectAt(s) === 2 &&
        s.abilities4.some((a) => a.kind === 'dmg_type_amp' && a.damageType === 'arcane'),
    );
    expect(arcaneSets.length).toBeGreaterThanOrEqual(2); // Arcaniste + Verbe Ancien
    const [a, b] = arcaneSets;
    const worn = [a!.id, a!.id]; // on porte le PREMIER set
    expect(runeEffectSuppressed(b!.id, worn, null)).toBe(false); // rune du SECOND
    expect(runeAbilitiesFor(b!.id, worn, null)).toEqual(runeAbilities(b!.id));
  });

  it('sans rune ou sans équipement, rien ne change', () => {
    expect(runeAbilitiesFor(null, PYRO, 'mage')).toEqual([]);
    expect(runeAbilitiesFor('pyromane', [], 'mage')).toEqual(runeAbilities('pyromane'));
  });
});
