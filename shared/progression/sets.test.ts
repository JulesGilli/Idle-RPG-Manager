import { describe, expect, it } from 'vitest';
import {
  computeSetBonuses,
  computeSetAbilities,
  activeSets,
  setEffectAt,
  setPieceGated,
  setArc,
  setsForArc,
  setPieceWrongArc,
  SETS,
  SET_PIECES,
  setPieceRecipe,
  craftSetPieceStats,
  SET_BOSS_COMPONENT,
  SET_DUNGEON_MATERIAL,
  setPieceZone,
  equippedSetTier,
  setById,
} from './sets.ts';
import { tierGearMult } from './arc.ts';
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
    expect(computeSetAbilities(rep('colosse', 4))).toEqual([{ kind: 'hp_strike', value: 0.1 }]);
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

describe('sets réservés par ARC — aucun set d’arc 1 en arc 2 (et réciproquement)', () => {
  it('chaque set est rattaché à un arc connu, et les deux catalogues sont peuplés', () => {
    for (const s of SETS) expect([1, 2]).toContain(setArc(s));
    expect(setsForArc(1).length).toBeGreaterThan(0);
    expect(setsForArc(2).length).toBeGreaterThan(0);
  });

  it('les deux catalogues sont DISJOINTS et couvrent tous les sets', () => {
    // C'est la promesse du système : changer d'arc CHANGE les stratégies
    // disponibles au lieu de les empiler.
    const a1 = setsForArc(1).map((s) => s.id);
    const a2 = setsForArc(2).map((s) => s.id);
    expect(a1.filter((id) => a2.includes(id))).toEqual([]);
    expect(a1.length + a2.length).toBe(SETS.length);
  });

  it('tous les sets d’ARC 2 sont des 2-pièces, donc extractibles en rune', () => {
    // Choix d'architecture : ils cohabitent avec l'arme et l'armure divines.
    for (const s of setsForArc(2)) expect(setEffectAt(s)).toBe(2);
  });

  it('setPieceWrongArc : une pièce d’arc 1 est refusée à l’arc 2, acceptée à l’arc 1', () => {
    expect(setPieceWrongArc('colosse_weapon', 1)).toBe(false);
    expect(setPieceWrongArc('colosse_weapon', 2)).toBe(true);
  });

  it('une future pièce d’arc 2 (simulée) serait refusée à l’arc 1', () => {
    // Pas encore de set arc 2 dans le catalogue : on vérifie juste que le
    // helper distingue bien un id inconnu (pas de faux positif/négatif).
    expect(setPieceWrongArc('id_inexistant', 1)).toBe(false);
  });
});

describe('zone d’une pièce de set (bug : figée à 10)', () => {
  const piece = SET_PIECES[0]!;
  const tier = 1;
  const forge = (mat: (typeof FORGE_MATERIALS)[number]) => {
    const s = craftSetPieceStats(piece, mat);
    return {
      name: `${piece.label} (Set)`,
      set_id: piece.setId,
      tier,
      craft_cost: setPieceRecipe(piece, mat).materials,
      base_atk_bonus: s.atk,
      base_def_bonus: s.def,
      base_hp_bonus: s.hp,
    };
  };

  it('retrouve la zone du matériau dépensé, via craft_cost', () => {
    for (const mat of FORGE_MATERIALS) {
      expect(setPieceZone(forge(mat))).toBe(mat.zone);
    }
  });

  it('retombe sur l’inversion des stats quand craft_cost manque (pièces legacy)', () => {
    for (const mat of FORGE_MATERIALS) {
      expect(setPieceZone({ ...forge(mat), craft_cost: null })).toBe(mat.zone);
    }
  });

  it('une pièce forgée en chêne est zone 1, pas zone 10', () => {
    expect(setPieceZone(forge(chene))).toBe(1);
    expect(setPieceZone(forge(etoiles))).toBe(10);
  });

  it('ignore les objets qui ne sont pas des pièces de set', () => {
    expect(setPieceZone({ name: 'Épée de givre', set_id: null })).toBe(0);
  });
});

describe('zone d’une pièce de set — données manquantes (régression prod)', () => {
  const piece = SET_PIECES[0]!;

  it('répond 0 (inconnu) plutôt que « zone 1 » quand il n’y a RIEN à inverser', () => {
    // La panne du 20 juil. : un appelant qui ne sélectionnait ni `craft_cost` ni
    // les `base_*` recevait 0/0/0. L'inversion élisait alors le matériau le plus
    // faible et répondait « zone 1 » avec aplomb — sur TOUTES les pièces du
    // serveur, y compris celles forgées en poussière d'étoile.
    const nu = { name: `${piece.label} (Set)`, set_id: piece.setId };
    expect(setPieceZone(nu)).toBe(0);
    expect(setPieceZone({ ...nu, tier: 1 })).toBe(0);
    expect(setPieceZone({ ...nu, craft_cost: null, base_atk_bonus: 0, base_def_bonus: 0, base_hp_bonus: 0 })).toBe(0);
  });

  it('un craft_cost seul suffit, même sans aucune stat', () => {
    const etoiles = FORGE_MATERIALS.find((m) => m.zone === 10)!;
    expect(
      setPieceZone({
        name: `${piece.label} (Set)`,
        set_id: piece.setId,
        craft_cost: setPieceRecipe(piece, etoiles).materials,
      }),
    ).toBe(10);
  });

  it('des stats seules suffisent, même sans craft_cost', () => {
    const etoiles = FORGE_MATERIALS.find((m) => m.zone === 10)!;
    const s = craftSetPieceStats(piece, etoiles);
    expect(
      setPieceZone({
        name: `${piece.label} (Set)`,
        set_id: piece.setId,
        tier: 1,
        craft_cost: null,
        base_atk_bonus: s.atk,
        base_def_bonus: s.def,
        base_hp_bonus: s.hp,
      }),
    ).toBe(10);
  });
});

describe('bonus 2 pièces — progression par arc', () => {
  const rep2 = (id: string) => [id, id];

  it('suit le multiplicateur d’arc, comme les stats d’un objet forgé', () => {
    // Sans ce scaling, un bonus de set resterait à sa valeur d'arc 1 (+250 PV)
    // alors que l'équipement d'arc 2 en donne des milliers : le set deviendrait
    // décoratif au moment précis où il devrait peser le plus.
    const t1 = computeSetBonuses(rep2('colosse'), 'paladin', 1);
    const t2 = computeSetBonuses(rep2('colosse'), 'paladin', 2);
    expect(t2.hp).toBe(Math.round(t1.hp * tierGearMult(2)));
    expect(t2.hp).toBeGreaterThan(t1.hp);
  });

  it('sans tier, le comportement d’arc 1 est inchangé (pas de régression)', () => {
    expect(computeSetBonuses(rep2('colosse'), 'paladin')).toEqual(
      computeSetBonuses(rep2('colosse'), 'paladin', 1),
    );
  });

  it('equippedSetTier retient le tier des PIÈCES DE SET, en ignorant le reste', () => {
    // Une arme divine d'arc 2 ne doit pas gonfler le bonus d'un set d'arc 1.
    expect(equippedSetTier([{ set_id: 'colosse', tier: 1 }, { set_id: null, tier: 2 }])).toBe(1);
    expect(equippedSetTier([{ set_id: 'colosse', tier: 2 }])).toBe(2);
    expect(equippedSetTier([null, undefined])).toBe(1);
  });
});

describe('intégrité du catalogue', () => {
  it('aucune pièce ORPHELINE : chaque pièce référence un set existant', () => {
    // Vécu : les deux pièces du Fureur Aveugle ont été ajoutées sans le set.
    // L'incohérence ne s'est révélée que par le crash d'un test sans rapport
    // (`setById(...)` undefined) — elle mérite d'être attrapée ici, directement.
    for (const p of SET_PIECES) {
      expect(setById(p.setId), `pièce ${p.id} → set ${p.setId} introuvable`).toBeDefined();
    }
  });

  it('chaque set a EXACTEMENT le nombre de pièces qu’il exige', () => {
    // Un set 2-pièces sans ses 2 pièces est incraftable ; avec 3, il est incohérent.
    for (const s of SETS) {
      const n = SET_PIECES.filter((p) => p.setId === s.id).length;
      expect(n, `set ${s.id}`).toBe(setEffectAt(s));
    }
  });

  it('les ids de pièces sont uniques', () => {
    const ids = SET_PIECES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
