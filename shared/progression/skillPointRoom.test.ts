import { describe, it, expect } from 'vitest';
import {
  maxSpendablePoints,
  skillPointRoom,
  grantSkillPoints,
  allNodes,
  GRADE_SKILL_CAPS,
  SLOT_MAX_RANK,
  type LearnedSkills,
} from './skills.ts';
import type { Grade } from './recruit.ts';

const CLASSES = ['guerrier', 'archer', 'mage', 'paladin', 'soigneur', 'inquisiteur', 'necromancien', 'voleur'];
const GRADES: Grade[] = ['D', 'C', 'B', 'A', 'S'];

/** Arbre rempli au maximum de ce que le grade autorise. */
function maxedTree(classId: string, grade: Grade): LearnedSkills {
  const caps = GRADE_SKILL_CAPS[grade];
  const nodes = allNodes(classId).filter((n) => !n.pending);
  const learned: LearnedSkills = {};
  const take = (slot: 'passive' | 'active' | 'ultimate', n: number) => {
    for (const node of nodes.filter((x) => x.slot === slot).slice(0, n)) {
      learned[node.id] = node.maxRank;
    }
  };
  take('passive', caps.passives);
  take('active', caps.actives);
  if (caps.ultimate) take('ultimate', 1);
  return learned;
}

describe('plafond de points dépensables par grade', () => {
  it('un grade D plafonne à 18 points', () => {
    // 3 passifs ×5 + 1 actif ×3 + aucun ultime. C'est le cas qui motive la règle :
    // au niveau 30 un D encaisse ~30 points et n'en placera jamais que 18.
    for (const c of CLASSES) expect(maxSpendablePoints(c, 'D')).toBe(18);
  });

  it('le plafond monte avec le grade', () => {
    const expected: Record<Grade, number> = { D: 18, C: 23, B: 25, A: 30, S: 35 };
    for (const c of CLASSES) {
      for (const g of GRADES) expect(maxSpendablePoints(c, g), `${c}/${g}`).toBe(expected[g]);
    }
  });

  it('ne promet jamais plus de nœuds que l’arbre n’en offre', () => {
    for (const c of CLASSES) {
      const nodes = allNodes(c).filter((n) => !n.pending);
      const theoretical =
        nodes.filter((n) => n.slot === 'passive').length * SLOT_MAX_RANK.passive +
        nodes.filter((n) => n.slot === 'active').length * SLOT_MAX_RANK.active +
        nodes.filter((n) => n.slot === 'ultimate').length * SLOT_MAX_RANK.ultimate;
      expect(maxSpendablePoints(c, 'S')).toBeLessThanOrEqual(theoretical);
    }
  });
});

describe('marge restante', () => {
  it('arbre vide : la marge vaut tout le plafond', () => {
    expect(skillPointRoom('guerrier', 'D', {}, 0)).toBe(18);
  });

  it('les points DÉJÀ en poche comptent dans la marge', () => {
    // Sinon on en redonnerait par-dessus un stock non dépensé.
    expect(skillPointRoom('guerrier', 'D', {}, 5)).toBe(13);
  });

  it('arbre au maximum du grade : plus aucune marge', () => {
    for (const c of CLASSES) {
      for (const g of GRADES) {
        expect(skillPointRoom(c, g, maxedTree(c, g), 0), `${c}/${g}`).toBe(0);
      }
    }
  });
});

describe('attribution plafonnée', () => {
  it('accorde normalement tant qu’il reste de la marge', () => {
    expect(grantSkillPoints('guerrier', 'D', {}, 0, 3)).toBe(3);
  });

  it('n’accorde RIEN à un héros qui a tout dépensé', () => {
    const learned = maxedTree('guerrier', 'D');
    expect(grantSkillPoints('guerrier', 'D', learned, 0, 5)).toBe(0);
  });

  it('accorde juste ce qu’il reste, pas plus', () => {
    // 16 points placés, 2 de marge : un gain de 5 niveaux n'en donne que 2.
    expect(grantSkillPoints('guerrier', 'D', {}, 16, 5)).toBe(18);
  });

  it('ne RETIRE jamais un surplus déjà accumulé', () => {
    // Héros d'avant la règle, avec 12 points morts : on cesse d'en donner,
    // on ne confisque pas ce qu'il voit déjà sur sa fiche.
    const learned = maxedTree('guerrier', 'D');
    expect(grantSkillPoints('guerrier', 'D', learned, 12, 3)).toBe(12);
  });

  it('un grade S continue de recevoir là où un D est déjà bloqué', () => {
    const learnedD = maxedTree('guerrier', 'D');
    expect(grantSkillPoints('guerrier', 'D', learnedD, 0, 1)).toBe(0);
    // Le même arbre chez un S laisse encore de la marge (plafond 35).
    expect(grantSkillPoints('guerrier', 'S', learnedD, 0, 1)).toBe(1);
  });
});
