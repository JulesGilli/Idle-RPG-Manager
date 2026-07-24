import { describe, it, expect } from 'vitest';
import { compactNumber, fullNumber, RARITY_COLOR, RARITY_META, rarityColor, rarityMeta } from './gameUi';
import { rarityHex } from './synty';
import { RARITY_ORDER } from '@shared/progression/loot';

/**
 * UNE seule palette de raretés. Trois coexistaient (`RARITY_COLOR` gris→doré,
 * les classes Tailwind emerald/sky/amber de `RARITY_META`, et `RARITY_HEX`
 * vert/bleu/or côté Synty) : le même objet « Peu commun » sortait vert du rituel
 * de craft, beige doré sur sa carte d'inventaire. Ces tests interdisent qu'une
 * quatrième réapparaisse — ou qu'une des trois redivergentent.
 */
describe('couleurs de rareté', () => {
  it('couvre exactement les paliers du jeu', () => {
    expect(Object.keys(RARITY_COLOR).sort()).toEqual([...RARITY_ORDER].sort());
    expect(Object.keys(RARITY_META).sort()).toEqual([...RARITY_ORDER].sort());
  });

  it('les classes Tailwind arbitraires de RARITY_META citent la couleur canonique', () => {
    for (const r of RARITY_ORDER) {
      const hex = RARITY_COLOR[r]!;
      expect(rarityMeta(r).text, r).toBe(`text-[${hex}]`);
      expect(rarityMeta(r).ring, r).toContain(`ring-[${hex}]`);
    }
  });

  it('rarityHex (Synty) EST rarityColor — plus de palette parallèle', () => {
    for (const r of RARITY_ORDER) expect(rarityHex(r), r).toBe(rarityColor(r));
  });

  it('une rareté inconnue retombe sur « commun », jamais sur du vide', () => {
    expect(rarityColor('n’importe quoi')).toBe(RARITY_COLOR.common);
    expect(rarityMeta('n’importe quoi').label).toBe('Commun');
  });
});

/**
 * Les chiffres du jeu n'ont pas de plafond (or, PV de boss, puissance). Affichés
 * bruts, ils cassent l'interface : le header mobile débordait de 6 px dès que
 * l'or atteignait 8 chiffres. Ce formateur est le garde-fou — il doit rester
 * court QUOI QU'IL ARRIVE.
 *
 * Il remplace deux implémentations qui se contredisaient : « 12.3M » (arc) et
 * « 1,2k » (cartes). Le jeu est en français → virgule décimale.
 */
describe('compactNumber', () => {
  it('laisse les petits nombres intacts', () => {
    expect(compactNumber(0)).toBe('0');
    expect(compactNumber(999)).toBe('999');
  });

  it('bascule en k / M / Md aux bons seuils', () => {
    expect(compactNumber(1000)).toBe('1k');
    expect(compactNumber(999_999)).toBe('1000k');
    expect(compactNumber(1_000_000)).toBe('1M');
    expect(compactNumber(1_000_000_000)).toBe('1Md');
  });

  it('utilise la VIRGULE décimale — le jeu est en français', () => {
    expect(compactNumber(1240)).toBe('1,2k');
    expect(compactNumber(12_300_000)).toBe('12,3M');
    expect(compactNumber(10_070_363)).toBe('10,1M'); // l'or qui faisait déborder le header
  });

  it('arrondit au-delà de 100 : « 150k » n’a pas besoin de sa virgule', () => {
    expect(compactNumber(150_000)).toBe('150k');
    expect(compactNumber(15_000)).toBe('15k'); // le .0 est supprimé, pas affiché
  });

  it('reste COURT quelle que soit la fortune — c’est toute sa raison d’être', () => {
    for (const n of [0, 999, 1000, 12_345, 999_999, 10_070_363, 987_654_321, 5_000_000_000]) {
      expect(compactNumber(n).length, `${n}`).toBeLessThanOrEqual(6);
    }
  });

  it('encaisse le négatif et le zéro sans produire d’absurdité', () => {
    expect(compactNumber(-1240)).toBe('-1,2k');
    expect(compactNumber(-5)).toBe('-5');
  });
});

describe('fullNumber', () => {
  it('donne le montant exact — c’est ce que le compact arrondit', () => {
    // `toLocaleString('fr-FR')` sépare les milliers par un espace insécable
    // (U+00A0 ou U+202F selon le moteur) : on ne garde que les chiffres.
    expect(fullNumber(10_070_363).replace(/\D/g, '')).toBe('10070363');
    expect(fullNumber(42)).toBe('42');
  });
});
