import { describe, expect, it } from 'vitest';
import {
  SKILL_TREES,
  skillTreeFor,
  computePassives,
  computeAbilities,
  validateLearn,
  type LearnedSkills,
} from './skills.ts';

describe('SKILL_TREES', () => {
  it('définit un arbre par classe avec ids uniques et prérequis valides', () => {
    for (const [cls, tree] of Object.entries(SKILL_TREES)) {
      expect(tree.length).toBeGreaterThan(0);
      const ids = tree.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const node of tree) {
        for (const req of node.requires) {
          expect(ids, `${cls}.${node.id} requiert ${req}`).toContain(req);
        }
      }
    }
  });

  it('couvre les 5 classes attendues', () => {
    expect(Object.keys(SKILL_TREES).sort()).toEqual(
      ['archer', 'guerrier', 'mage', 'paladin', 'soigneur'].sort(),
    );
  });

  it('skillTreeFor renvoie [] pour une classe inconnue', () => {
    expect(skillTreeFor('inconnue')).toEqual([]);
  });
});

describe('computePassives', () => {
  it('aucun nœud n’accorde de stat brute (que des effets)', () => {
    for (const tree of Object.values(SKILL_TREES)) {
      for (const node of tree) {
        expect(node.passives || node.abilities, `${node.id} doit avoir un effet`).toBeTruthy();
        // Le type de nœud n'expose plus de bonus de stat.
        expect('effect' in node).toBe(false);
      }
    }
  });

  it('cumule les passifs de combat par type', () => {
    // Œil de faucon (crit 0.08/rang) rang 3 = 0.24.
    const p = computePassives('archer', { a_precision: 3 });
    const crit = p.find((x) => x.type === 'crit');
    expect(crit?.value).toBeCloseTo(0.24, 5);
  });

  it('ignore les classes inconnues', () => {
    expect(computePassives('???', { x: 3 })).toEqual([]);
  });
});

describe('computeAbilities', () => {
  it('agrège le poison de l’archer (chance & durée montent avec le rang)', () => {
    const learned: LearnedSkills = { a_poison: 2, a_venin: 1 };
    const abilities = computeAbilities('archer', learned);
    const poison = abilities.find((a) => a.kind === 'on_hit' && a.status === 'poison');
    expect(poison).toBeDefined();
    if (poison && poison.kind === 'on_hit') {
      // Tir empoisonné rang 2 : chance 0.30 ; Venin ajoute potency/durée.
      expect(poison.chance).toBeCloseTo(0.3, 5);
      expect(poison.potency).toBeGreaterThan(0.15);
      expect(poison.duration).toBeGreaterThanOrEqual(4);
    }
  });

  it('expose l’ultime autocast du mage', () => {
    const abilities = computeAbilities('mage', { m_deflagration: 1 });
    const auto = abilities.find((a) => a.kind === 'autocast');
    expect(auto && auto.kind === 'autocast' && auto.action.type).toBe('aoe');
  });

  it('le paladin obtient revive + jugement', () => {
    const abilities = computeAbilities('paladin', { p_renaissance: 1, p_jugement: 1 });
    expect(abilities.some((a) => a.kind === 'revive')).toBe(true);
    expect(
      abilities.some((a) => a.kind === 'autocast' && a.action.type === 'stun_all'),
    ).toBe(true);
  });

  it('somme la pénétration d’armure du guerrier', () => {
    const abilities = computeAbilities('guerrier', { g_penetration: 3, g_broyeur: 1 });
    const pen = abilities.find((a) => a.kind === 'armor_pen');
    // 0.12×3 + 0.25 = 0.61
    expect(pen && pen.kind === 'armor_pen' && pen.value).toBeCloseTo(0.61, 5);
  });
});

describe('validateLearn', () => {
  it('refuse un nœud inconnu', () => {
    expect(validateLearn('archer', {}, 'nope').ok).toBe(false);
  });

  it('bloque tant que les prérequis ne sont pas débloqués', () => {
    expect(validateLearn('archer', {}, 'a_venin').ok).toBe(false);
    expect(validateLearn('archer', { a_poison: 1 }, 'a_venin').ok).toBe(true);
  });

  it('exige tous les prérequis du capstone', () => {
    expect(validateLearn('archer', { a_toxine: 1 }, 'a_pluie').ok).toBe(false);
    expect(validateLearn('archer', { a_toxine: 1, a_volee: 1 }, 'a_pluie').ok).toBe(true);
  });

  it('refuse au-delà du rang max', () => {
    expect(validateLearn('paladin', { p_renaissance: 1 }, 'p_renaissance').ok).toBe(false);
  });
});
