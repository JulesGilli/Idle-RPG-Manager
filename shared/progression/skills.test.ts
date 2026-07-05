import { describe, expect, it } from 'vitest';
import {
  SKILL_TREES,
  skillTreeFor,
  allNodes,
  computePassives,
  computeAbilities,
  validateLearn,
  branchPoints,
  spentPoints,
  resetCost,
  SLOT_MAX_RANK,
  ULTIMATE_GATE,
  type LearnedSkills,
} from './skills.ts';

describe('SKILL_TREES', () => {
  it('couvre les 5 classes attendues', () => {
    expect(Object.keys(SKILL_TREES).sort()).toEqual(
      ['archer', 'guerrier', 'mage', 'paladin', 'soigneur'].sort(),
    );
  });

  it('chaque classe a 3 branches de 5 nœuds (3 passifs + 1 actif + 1 ultime)', () => {
    for (const [cls, branches] of Object.entries(SKILL_TREES)) {
      expect(branches.length, cls).toBe(3);
      for (const b of branches) {
        expect(b.nodes.length, `${cls} branche ${b.id}`).toBe(5);
        const slots = b.nodes.map((n) => n.slot);
        expect(slots.filter((s) => s === 'passive').length).toBe(3);
        expect(slots.filter((s) => s === 'active').length).toBe(1);
        expect(slots.filter((s) => s === 'ultimate').length).toBe(1);
        for (const n of b.nodes) {
          expect(n.maxRank, `${n.id} rang max`).toBe(SLOT_MAX_RANK[n.slot]);
          expect(n.branch).toBe(b.id);
        }
      }
    }
  });

  it('ids uniques par classe, et aucun bonus de stat brute', () => {
    for (const cls of Object.keys(SKILL_TREES)) {
      const ids = allNodes(cls).map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const node of allNodes(cls)) {
        // Effet (passif/abilité) OU nœud en attente d'implémentation.
        expect(Boolean(node.passives || node.abilities) || node.pending === true).toBe(true);
        expect('effect' in node).toBe(false);
      }
    }
  });

  it('skillTreeFor renvoie [] pour une classe inconnue', () => {
    expect(skillTreeFor('inconnue')).toEqual([]);
  });

  it('tous les nœuds sont implémentés (aucun en attente)', () => {
    for (const cls of Object.keys(SKILL_TREES)) {
      for (const node of allNodes(cls)) {
        expect(node.pending, `${cls}.${node.id} est encore pending`).not.toBe(true);
        expect(Boolean(node.passives || node.abilities), `${cls}.${node.id} sans effet`).toBe(true);
      }
    }
  });
});

describe('computePassives', () => {
  it('cumule les passifs de combat par type (crit du Berserker)', () => {
    // Œil du tueur : crit 0.04 + 0.04×rang → rang 3 = 0.16.
    const p = computePassives('guerrier', { g_ber_oeil: 3 });
    const crit = p.find((x) => x.type === 'crit');
    expect(crit?.value).toBeCloseTo(0.16, 5);
  });

  it('n’expose que les passifs (ignore les nœuds à effet d’abilité)', () => {
    // g_men_fureur porte une abilité (delayed_buff), pas un passif → rien ici.
    expect(computePassives('guerrier', { g_men_fureur: 5 })).toEqual([]);
  });

  it('ignore les classes inconnues', () => {
    expect(computePassives('???', { x: 3 })).toEqual([]);
  });
});

describe('computeAbilities', () => {
  it('agrège le poison de la Vipère (chance monte avec le rang)', () => {
    const learned: LearnedSkills = { a_vip_poison: 3 };
    const abilities = computeAbilities('archer', learned);
    const poison = abilities.find((a) => a.kind === 'on_hit' && a.status === 'poison');
    expect(poison).toBeDefined();
    // chance 0.20 + 0.05×3 = 0.35.
    if (poison && poison.kind === 'on_hit') expect(poison.chance).toBeCloseTo(0.35, 5);
  });

  it('somme la pénétration d’armure du Berserker', () => {
    const abilities = computeAbilities('guerrier', { g_ber_brutale: 3 });
    const pen = abilities.find((a) => a.kind === 'armor_pen');
    // 0.15 + 0.15×3 = 0.60.
    expect(pen && pen.kind === 'armor_pen' && pen.value).toBeCloseTo(0.6, 5);
  });

  it('expose la provocation (taunt) du Rempart avec durée croissante', () => {
    const abilities = computeAbilities('guerrier', { g_rem_provoc: 3 });
    const taunt = abilities.find((a) => a.kind === 'taunt');
    // durée 1 + 1×3 = 4.
    expect(taunt && taunt.kind === 'taunt' && taunt.duration).toBe(4);
  });

  it('l’autocast réduit son cooldown avec le rang', () => {
    const r1 = computeAbilities('archer', { a_tem_pluie: 1 }).find((a) => a.kind === 'autocast');
    const r3 = computeAbilities('archer', { a_tem_pluie: 3 }).find((a) => a.kind === 'autocast');
    // everyRounds 5 − rang : rang 1 = 4, rang 3 = 2.
    if (r1 && r1.kind === 'autocast') expect(r1.everyRounds).toBe(4);
    if (r3 && r3.kind === 'autocast') expect(r3.everyRounds).toBe(2);
  });

  it('ignore les rangs à 0 (aucun nœud appris)', () => {
    expect(computeAbilities('guerrier', {})).toEqual([]);
  });

  it('les mécaniques avancées produisent leurs abilités (fureur différée, concert)', () => {
    const fureur = computeAbilities('guerrier', { g_men_fureur: 3 });
    expect(fureur.some((a) => a.kind === 'delayed_buff')).toBe(true);
    const concert = computeAbilities('soigneur', { s_ora_concert: 2 });
    expect(concert.some((a) => a.kind === 'autocast' && a.action.type === 'buff')).toBe(true);
  });

  it('le Brasier du Mage produit des stacks de feu + une détonation', () => {
    const ab = computeAbilities('mage', { m_bra_etincelle: 3, m_bra_surchauffe: 2 });
    expect(ab.some((a) => a.kind === 'stack_on_hit' && a.mark === 'burn')).toBe(true);
    expect(ab.some((a) => a.kind === 'detonate' && a.mark === 'burn')).toBe(true);
  });

  it('les auras (Oracle du Clerc) produisent des stat_mod team', () => {
    const ab = computeAbilities('soigneur', { s_ora_puissance: 5, s_ora_vitalite: 2 });
    const atk = ab.find((a) => a.kind === 'stat_mod' && a.stat === 'atk');
    const hp = ab.find((a) => a.kind === 'stat_mod' && a.stat === 'hp');
    // puissance rang 5 : 0.01 + 0.01×5 = 0.06 ; vitalité rang 2 : 0.015 + 0.015×2 = 0.045.
    expect(atk && atk.kind === 'stat_mod' && atk.scope).toBe('team');
    if (atk && atk.kind === 'stat_mod') expect(atk.value).toBeCloseTo(0.06, 5);
    if (hp && hp.kind === 'stat_mod') expect(hp.value).toBeCloseTo(0.045, 5);
  });
});

describe('validateLearn', () => {
  it('refuse un nœud inconnu', () => {
    expect(validateLearn('archer', {}, 'nope').ok).toBe(false);
  });

  it('autorise un passif prêt sans prérequis', () => {
    expect(validateLearn('guerrier', {}, 'g_ber_rage').ok).toBe(true);
  });

  it('refuse au-delà du rang max', () => {
    expect(validateLearn('guerrier', { g_ber_execution: 2 }, 'g_ber_execution').ok).toBe(false);
  });

  it('progression séquentielle : un nœud est verrouillé tant que le précédent n’a pas de rang', () => {
    // g_ber_oeil (2e nœud) exige g_ber_rage (1er) débloqué.
    expect(validateLearn('guerrier', {}, 'g_ber_oeil').ok).toBe(false);
    expect(validateLearn('guerrier', { g_ber_rage: 1 }, 'g_ber_oeil').ok).toBe(true);
  });

  it('bloque l’ultime tant que la branche n’a pas 15 points (en plus du prérequis)', () => {
    expect(validateLearn('guerrier', {}, 'g_ber_execution').ok).toBe(false);
    // Chaîne séquentielle complète : 3 passifs maxés (15) + l'actif débloqué.
    const built = { g_ber_rage: 5, g_ber_oeil: 5, g_ber_sang: 5, g_ber_brutale: 1 };
    expect(branchPoints('guerrier', built, 2)).toBeGreaterThanOrEqual(ULTIMATE_GATE);
    expect(validateLearn('guerrier', built, 'g_ber_execution').ok).toBe(true);
    // Sans l'actif intermédiaire, l'ultime reste verrouillé même avec 15 pts.
    expect(validateLearn('guerrier', { g_ber_rage: 5, g_ber_oeil: 5, g_ber_sang: 5 }, 'g_ber_execution').ok).toBe(false);
  });
});

describe('économie', () => {
  it('spentPoints somme les rangs plafonnés', () => {
    expect(spentPoints('guerrier', { g_ber_rage: 5, g_ber_oeil: 3, g_men_faille: 99 })).toBe(13);
  });

  it('resetCost croît avec les points dépensés', () => {
    expect(resetCost(0)).toBe(0);
    expect(resetCost(10)).toBeGreaterThan(resetCost(5));
  });
});
