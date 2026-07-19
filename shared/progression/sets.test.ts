import { describe, expect, it } from 'vitest';
import {
  computeSetBonuses,
  computeSetAbilities,
  activeSets,
  setEffectAt,
  setPieceGated,
  SETS,
  SET_PIECES,
  setPieceRecipe,
  craftSetPieceStats,
  SET_BOSS_COMPONENT,
  SET_DUNGEON_MATERIAL,
} from './sets.ts';
import { FORGE_MATERIALS, getMaterialTier } from './forge.ts';

const chene = getMaterialTier('chene')!;
const etoiles = getMaterialTier('etoiles')!;
const rep = (id: string, n: number) => Array.from({ length: n }, () => id);

describe('sets — grands sets à 4 pièces (poids)', () => {
  it('colosse (lourd), duelliste (moyen), tacticien (léger) existent, effet à 4', () => {
    const ids = SETS.map((s) => s.id);
    expect(ids).toContain('colosse');
    expect(ids).toContain('duelliste');
    expect(ids).toContain('tacticien');
    for (const id of ['colosse', 'duelliste', 'tacticien']) {
      expect(setEffectAt(SETS.find((s) => s.id === id)!)).toBe(4);
    }
  });
});

describe('petits sets utilitaires (V1.1) — 2 pièces universelles', () => {
  const smallIds = ['provocateur', 'ame_offerte', 'pyromane', 'empoisonneur', 'arcaniste', 'brute'];

  it('effet dès 2 pièces (effectAt = 2)', () => {
    for (const id of smallIds) {
      const set = SETS.find((s) => s.id === id)!;
      expect(setEffectAt(set)).toBe(2);
      expect(computeSetAbilities([id, id])).toEqual(set.abilities4);
      expect(computeSetAbilities([id])).toEqual([]); // rien à 1 pièce
    }
  });

  it('exactement 2 pièces, toutes universelles (bijou + relique)', () => {
    for (const id of smallIds) {
      const pieces = SET_PIECES.filter((p) => p.setId === id);
      expect(pieces).toHaveLength(2);
      expect(pieces.map((p) => p.slot).sort()).toEqual(['jewel', 'relic']);
      expect(pieces.every((p) => p.weight === null)).toBe(true);
    }
  });

  it('les sets +type donnent le bon amplificateur (+35 %)', () => {
    const cases: [string, string][] = [
      ['pyromane', 'fire'],
      ['empoisonneur', 'poison'],
      ['arcaniste', 'arcane'],
      ['brute', 'physical'],
    ];
    for (const [id, type] of cases) {
      expect(computeSetAbilities([id, id])).toEqual([
        { kind: 'dmg_type_amp', damageType: type, value: 0.35 },
      ]);
    }
  });

  it('sont verrouillés jusqu’à la sortie (gating), les grands sets non', () => {
    expect(setPieceGated('pyromane_jewel')).toBe(true);
    expect(setPieceGated('ame_offerte_relic')).toBe(true);
    expect(setPieceGated('colosse_weapon')).toBe(false);
  });
});

describe('bonus de stats (2 pièces)', () => {
  it('aucun bonus sous 2 pièces ; bonus2 dès 2', () => {
    const colosse = SETS.find((s) => s.id === 'colosse')!;
    expect(computeSetBonuses(rep('colosse', 1))).toEqual({ atk: 0, def: 0, hp: 0 });
    expect(computeSetBonuses(rep('colosse', 2))).toEqual(colosse.bonus2);
    expect(computeSetBonuses(rep('colosse', 4))).toEqual(colosse.bonus2);
  });
});

describe('effet de combat (4 pièces)', () => {
  it('aucun effet sous 4 pièces', () => {
    expect(computeSetAbilities(rep('colosse', 3))).toEqual([]);
  });
  it('chaque set complet accorde son effet', () => {
    expect(computeSetAbilities(rep('colosse', 4))).toEqual([{ kind: 'hp_strike', value: 0.2 }]);
    expect(computeSetAbilities(rep('duelliste', 4))).toEqual([{ kind: 'double_strike', mult: 0.6 }]);
    expect(computeSetAbilities(rep('tacticien', 4))).toEqual([{ kind: 'cdr', value: 1 }]);
  });
  it('activeSets liste les sets ≥2 pièces', () => {
    const a = activeSets([...rep('colosse', 2), 'duelliste', null]);
    expect(a).toHaveLength(1);
    expect(a[0]!.set.id).toBe('colosse');
  });
});

describe('restriction des sets par poids', () => {
  const ALL_CLASSES = [
    'paladin', 'guerrier', 'mage', 'soigneur', 'archer', 'voleur', 'necromancien', 'inquisiteur',
  ];
  const ZERO = { atk: 0, def: 0, hp: 0 };

  it('les GRANDS sets sont réservés à leur poids', () => {
    const colosse = SETS.find((s) => s.id === 'colosse')!;
    // Colosse = lourd → paladin oui, mage non.
    expect(computeSetBonuses(rep('colosse', 2), 'paladin')).toEqual(colosse.bonus2);
    expect(computeSetBonuses(rep('colosse', 2), 'mage')).toEqual(ZERO);
    expect(computeSetAbilities(rep('colosse', 4), 'paladin')).toHaveLength(1);
    expect(computeSetAbilities(rep('colosse', 4), 'mage')).toEqual([]);
    // Tacticien = léger → mage oui, paladin non.
    const tacticien = SETS.find((s) => s.id === 'tacticien')!;
    expect(computeSetBonuses(rep('tacticien', 2), 'mage')).toEqual(tacticien.bonus2);
    expect(computeSetBonuses(rep('tacticien', 2), 'paladin')).toEqual(ZERO);
  });

  it('les PETITS sets (bijou + relique) restent universels', () => {
    // Leurs deux pièces sont des slots SANS poids : aucune classe ne se voit
    // refuser leur équipement, les restreindre laisserait un joueur forger le set,
    // l'équiper entièrement et ne rien recevoir.
    for (const cls of ALL_CLASSES) {
      expect(computeSetAbilities(['ame_offerte', 'ame_offerte'], cls), cls).toHaveLength(1);
      expect(computeSetBonuses(['provocateur', 'provocateur'], cls), cls).not.toEqual(ZERO);
    }
  });

  it('INVARIANT : un set sans aucune pièce à poids ne peut pas être restreint', () => {
    // La règle de fond plutôt qu'une liste d'ids : si aucune pièce ne porte de
    // poids, restreindre le set par poids est forcément une incohérence.
    for (const set of SETS) {
      const pieces = SET_PIECES.filter((p) => p.setId === set.id);
      const aUnPoids = pieces.some((p) => p.weight !== null);
      if (!aUnPoids) {
        expect(new Set(set.weights), `${set.id} devrait être universel`).toEqual(
          new Set(['light', 'medium', 'heavy']),
        );
      }
    }
  });

  it('un set restreint est signalé INACTIF, jamais silencieusement ignoré', () => {
    // `equip_item` laisse n'importe quelle classe porter les pièces : sans ce
    // marqueur, un mage équiperait le Colosse entier sans comprendre pourquoi il
    // ne gagne rien. C'est l'UI qui rend la restriction supportable.
    expect(activeSets(rep('colosse', 2), 'mage')[0]!.usable).toBe(false);
    expect(activeSets(rep('colosse', 2), 'paladin')[0]!.usable).toBe(true);
  });

  it('sans classId → bonus accordé (repli)', () => {
    const colosseBonus = SETS.find((s) => s.id === 'colosse')!.bonus2;
    expect(computeSetBonuses(rep('colosse', 2))).toEqual(colosseBonus);
  });
});

describe('stats scalent avec le matériau (comme un item de base)', () => {
  it('un matériau plus puissant → plus de stats', () => {
    const weapon = SET_PIECES.find((p) => p.id === 'colosse_weapon')!;
    const faible = craftSetPieceStats(weapon, chene);
    const fort = craftSetPieceStats(weapon, etoiles);
    expect(fort.atk).toBeGreaterThan(faible.atk);
  });

  it('respecte le bias : une stat à 0 reste 0', () => {
    const armor = SET_PIECES.find((p) => p.id === 'colosse_armor')!; // bias.atk = 0
    expect(craftSetPieceStats(armor, etoiles).atk).toBe(0);
    expect(craftSetPieceStats(armor, etoiles).def).toBeGreaterThan(0);
  });
});

describe('pièces de set — poids & recette', () => {
  it('arme/armure ont le poids du set ; bijou/relique universels', () => {
    for (const [wid, aid] of [
      ['colosse_weapon', 'colosse_armor'],
      ['duelliste_weapon', 'duelliste_armor'],
      ['tacticien_weapon', 'tacticien_armor'],
    ]) {
      const w = SET_PIECES.find((p) => p.id === wid)!;
      const a = SET_PIECES.find((p) => p.id === aid)!;
      expect(['heavy', 'medium', 'light']).toContain(w.weight);
      expect(w.weight).toBe(a.weight);
    }
    expect(SET_PIECES.find((p) => p.slot === 'jewel')!.weight).toBeNull();
    expect(SET_PIECES.find((p) => p.slot === 'relic')!.weight).toBeNull();
  });

  it('recette = matériau de zone choisi + signature + boss + donjon', () => {
    const piece = SET_PIECES.find((p) => p.id === 'colosse_weapon')!;
    const keys = setPieceRecipe(piece, chene).materials.map((m) => m.key);
    expect(keys).toContain(chene.materials[0]!.key);
    expect(keys).toContain(piece.materials[0]!.key);
    expect(keys).toContain(SET_BOSS_COMPONENT.colosse);
    expect(keys).toContain(SET_DUNGEON_MATERIAL.key);
  });

  it('aucune clé de matériau dupliquée', () => {
    for (const p of SET_PIECES) {
      const keys = setPieceRecipe(p, FORGE_MATERIALS[0]!).materials.map((m) => m.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
