import { describe, it, expect } from 'vitest';
import {
  MAX_SAME_CLASS,
  MAX_SAME_CLASS_LARGE,
  classCounts,
  canAddClass,
  checkTeamClasses,
} from './teamComposition.ts';

describe('plafond de doublons de classe', () => {
  it('les grandes formations doublent le plafond', () => {
    expect(MAX_SAME_CLASS).toBe(2);
    expect(MAX_SAME_CLASS_LARGE).toBe(4);
  });
});

describe('classCounts', () => {
  it('compte les occurrences et ignore les entrées vides', () => {
    const c = classCounts(['mage', 'mage', null, 'archer', undefined, '']);
    expect(c.get('mage')).toBe(2);
    expect(c.get('archer')).toBe(1);
    expect(c.size).toBe(2);
  });
});

describe('canAddClass — ce que le front grise', () => {
  it('autorise tant que le plafond n’est pas atteint', () => {
    expect(canAddClass([], 'mage')).toBe(true);
    expect(canAddClass(['mage'], 'mage')).toBe(true);
  });

  it('refuse au plafond', () => {
    expect(canAddClass(['mage', 'mage'], 'mage')).toBe(false);
  });

  it('ne bloque QUE la classe saturée', () => {
    expect(canAddClass(['mage', 'mage'], 'archer')).toBe(true);
  });

  it('respecte un plafond relevé (champs de bataille)', () => {
    const four = ['mage', 'mage', 'mage', 'mage'];
    expect(canAddClass(four.slice(0, 3), 'mage', MAX_SAME_CLASS_LARGE)).toBe(true);
    expect(canAddClass(four, 'mage', MAX_SAME_CLASS_LARGE)).toBe(false);
  });
});

describe('checkTeamClasses — ce que le serveur refuse', () => {
  it('accepte une équipe dans les clous', () => {
    expect(checkTeamClasses(['mage', 'mage', 'archer', 'soigneur', 'guerrier']).ok).toBe(true);
  });

  it('refuse un triplé et NOMME la classe fautive', () => {
    const r = checkTeamClasses(['mage', 'archer', 'mage', 'mage']);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.classId).toBe('mage');
      expect(r.count).toBe(3);
      expect(r.limit).toBe(2);
    }
  });

  it('accepte 4 doublons sur une grande formation, refuse 5', () => {
    const four = ['mage', 'mage', 'mage', 'mage'];
    expect(checkTeamClasses(four, MAX_SAME_CLASS_LARGE).ok).toBe(true);
    expect(checkTeamClasses([...four, 'mage'], MAX_SAME_CLASS_LARGE).ok).toBe(false);
  });

  it('une équipe vide ou d’un seul héros passe toujours', () => {
    expect(checkTeamClasses([]).ok).toBe(true);
    expect(checkTeamClasses(['mage']).ok).toBe(true);
  });
});
