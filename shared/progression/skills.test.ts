import { describe, expect, it } from 'vitest';
import {
  SKILL_TREES,
  skillTreeFor,
  allNodes,
  computePassives,
  computeAbilities,
  validateLearn,
  validateSelect,
  resolveLoadout,
  branchPoints,
  spentPoints,
  resetCost,
  describeNodeEffects,
  SLOT_MAX_RANK,
  ULTIMATE_GATE,
  type LearnedSkills,
} from './skills.ts';

const findNode = (classId: string, id: string) => allNodes(classId).find((n) => n.id === id)!;

describe('describeNodeEffects — chiffres exacts', () => {
  it('poison : chance monte avec le rang, potence/durée exactes', () => {
    const node = findNode('archer', 'a_vip_poison'); // on_hit poison 0.3+0.08r, potency .14+.01r, dur 3
    const r1 = describeNodeEffects(node, 1).join(' ');
    const r5 = describeNodeEffects(node, 5).join(' ');
    expect(r1).toContain('38 %'); // 0.3 + 0.08×1
    expect(r1).toContain("15 % de l'ATK par tour"); // 0.14 + 0.01×1
    expect(r1).toContain('3 tours');
    expect(r5).toContain('70 %'); // 0.3 + 0.08×5
  });

  it('aura stat_mod : valeur exacte par rang', () => {
    const node = findNode('guerrier', 'g_men_banniere'); // stat_mod atk team 0.01+0.02r
    expect(describeNodeEffects(node, 1).join(' ')).toContain('+3 % ATK'); // 0.01+0.02
    expect(describeNodeEffects(node, 5).join(' ')).toContain('+11 % ATK'); // 0.01+0.10
  });

  it('autocast : fréquence scalée + magnitude de l’action', () => {
    const node = findNode('guerrier', 'g_men_assommant'); // every 6-1r, nuke 0.6 + stun 2t
    const r1 = describeNodeEffects(node, 1).join(' ');
    expect(r1).toContain('Tous les 5 tours'); // 6 - 1
    expect(r1).toContain("60 % de l'ATK");
    expect(r1).toContain('étourdissement'); // nuke + status stun (2 tours)
    expect(r1).toContain('2 tours');
  });

  it('une ligne par effet, jamais vide pour un nœud actif', () => {
    for (const classId of Object.keys(SKILL_TREES)) {
      for (const node of allNodes(classId)) {
        if (node.pending) continue;
        const lines = describeNodeEffects(node, node.maxRank);
        expect(lines.length).toBeGreaterThan(0);
        for (const l of lines) expect(l.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('SKILL_TREES', () => {
  it('couvre les 8 classes attendues (V2)', () => {
    expect(Object.keys(SKILL_TREES).sort()).toEqual(
      ['archer', 'guerrier', 'inquisiteur', 'mage', 'necromancien', 'paladin', 'soigneur', 'voleur'].sort(),
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

  it('nœuds non-pending = effet ; nœuds pending = placeholder sans effet', () => {
    for (const cls of Object.keys(SKILL_TREES)) {
      for (const node of allNodes(cls)) {
        if (node.pending) {
          expect(Boolean(node.passives || node.abilities), `${cls}.${node.id} pending devrait être vide`).toBe(false);
        } else {
          expect(Boolean(node.passives || node.abilities), `${cls}.${node.id} sans effet`).toBe(true);
        }
      }
    }
  });

  it('plus aucun nœud en attente (moteur d’invocation implémenté)', () => {
    const pending = Object.keys(SKILL_TREES).flatMap((cls) => allNodes(cls).filter((n) => n.pending).map((n) => n.id));
    expect(pending).toEqual([]);
  });
});

describe('plafond de compétences par grade (V2)', () => {
  it('passifs distincts plafonnés par grade (rang d’un passif déjà pris toujours permis)', () => {
    // 3 passifs distincts appris dans la branche 1 du guerrier.
    const three = { g_men_faille: 1, g_men_banniere: 1, g_men_fureur: 1 };
    // Un 4e passif distinct (branche 2, sans prérequis) : bloqué en D (cap 3), permis en A (cap 5).
    expect(validateLearn('guerrier', three, 'g_ber_rage', 'D').ok).toBe(false);
    expect(validateLearn('guerrier', three, 'g_ber_rage', 'A').ok).toBe(true);
    // Monter le rang d'un passif DÉJÀ appris reste permis même au plafond.
    expect(validateLearn('guerrier', three, 'g_men_faille', 'D').ok).toBe(true);
  });

  it('un seul actif distinct, quel que soit le grade', () => {
    // Actif de branche 1 appris (assommant) + de quoi débloquer l'actif de branche 2.
    const learned = {
      g_men_faille: 1, g_men_banniere: 1, g_men_fureur: 1, g_men_assommant: 1,
      g_ber_rage: 1, g_ber_oeil: 1, g_ber_sang: 1,
    };
    // 2e actif distinct (g_ber_brutale) bloqué même en S (cap actifs = 1).
    expect(validateLearn('guerrier', learned, 'g_ber_brutale', 'S').ok).toBe(false);
  });

  it('ultime : bloqué en D/C, permis en B+ (gate d’investissement respecté)', () => {
    // 15 points investis dans la branche 1 + actif appris (prérequis séquentiel de l'ultime).
    const learned = { g_men_faille: 5, g_men_banniere: 5, g_men_fureur: 4, g_men_assommant: 1 };
    expect(validateLearn('guerrier', learned, 'g_men_cri', 'D').ok).toBe(false);
    expect(validateLearn('guerrier', learned, 'g_men_cri', 'C').ok).toBe(false);
    expect(validateLearn('guerrier', learned, 'g_men_cri', 'B').ok).toBe(true);
  });

  it('sans grade → comportement historique (plafond fixe, ultime non gaté par grade)', () => {
    const learned = { g_men_faille: 5, g_men_banniere: 5, g_men_fureur: 4, g_men_assommant: 1 };
    expect(validateLearn('guerrier', learned, 'g_men_cri').ok).toBe(true);
  });
});

describe('computePassives', () => {
  it('cumule les passifs de combat par type (crit du Berserker)', () => {
    // Œil du tueur : crit 0.05 + 0.06×rang → rang 3 = 0.23.
    const p = computePassives('guerrier', { g_ber_oeil: 3 });
    const crit = p.find((x) => x.type === 'crit');
    expect(crit?.value).toBeCloseTo(0.23, 5);
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
    // chance 0.30 + 0.08×3 = 0.54.
    if (poison && poison.kind === 'on_hit') expect(poison.chance).toBeCloseTo(0.54, 5);
  });

  it('Frappe brutale est une INCANTATION, plus un perce-armure permanent', () => {
    // Avant : perce-armure permanent 0.3 + 0.3×rang sur un slot pourtant ACTIF.
    // Depuis la refonte, le nœud ne produit plus d'abilité `armor_pen` du tout.
    const abilities = computeAbilities('guerrier', { g_ber_brutale: 3 }, {
      activeId: 'g_ber_brutale',
      ultimateId: null,
    });
    expect(abilities.find((a) => a.kind === 'armor_pen')).toBeUndefined();

    const cast = abilities.find((a) => a.kind === 'autocast');
    expect(cast).toBeDefined();
    const action = (cast as { action: { type: string; armorPen?: number } }).action;
    expect(action.type).toBe('nuke');
    // Perce-armure de la frappe : 0.15 + 0.15×3 = 0.60, moitié des 1.2 d'avant.
    expect(action.armorPen).toBeCloseTo(0.6, 5);
  });

  it('l’Œil du tueur (passif) accorde aussi une attaque supplémentaire', () => {
    const abilities = computeAbilities('guerrier', { g_ber_oeil: 3 });
    const extra = abilities.find((a) => a.kind === 'extra_attack');
    // chance 0.1 + 0.05×3 = 0.25.
    expect(extra && extra.kind === 'extra_attack' && extra.chance).toBeCloseTo(0.25, 5);
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

describe('loadout — un seul actif + un seul ultime', () => {
  // Deux actifs appris : Coup assommant (branche 1) et Provocation (branche 3).
  const twoActives: LearnedSkills = { g_men_assommant: 1, g_rem_provoc: 1 };

  it('resolveLoadout replie sur le PREMIER appris quand rien n’est équipé', () => {
    const lo = resolveLoadout('guerrier', twoActives);
    expect(lo.activeId).toBe('g_men_assommant'); // 1er dans l'ordre des branches
    expect(lo.ultimateId).toBeNull(); // aucun ultime appris
  });

  it('resolveLoadout respecte le choix explicite s’il est appris', () => {
    const lo = resolveLoadout('guerrier', twoActives, { activeId: 'g_rem_provoc' });
    expect(lo.activeId).toBe('g_rem_provoc');
  });

  it('resolveLoadout ignore un choix pointant un nœud non appris (repli auto)', () => {
    const lo = resolveLoadout('guerrier', twoActives, { activeId: 'g_men_cri' });
    expect(lo.activeId).toBe('g_men_assommant');
  });

  it('computeAbilities n’applique QUE l’actif équipé parmi plusieurs appris', () => {
    // Par défaut → assommant équipé : autocast présent, taunt (provoc) absent.
    const def = computeAbilities('guerrier', twoActives);
    expect(def.some((a) => a.kind === 'autocast')).toBe(true);
    expect(def.some((a) => a.kind === 'taunt')).toBe(false);
    // On équipe Provocation → taunt présent, l'autocast d'assommant disparaît.
    const swapped = computeAbilities('guerrier', twoActives, { activeId: 'g_rem_provoc' });
    expect(swapped.some((a) => a.kind === 'taunt')).toBe(true);
    expect(swapped.some((a) => a.kind === 'autocast')).toBe(false);
  });

  it('les passifs (hors slot actif/ultime) s’appliquent toujours', () => {
    // Bannière de guerre = passif (stat_mod), indépendant de l'actif équipé.
    const ab = computeAbilities('guerrier', { ...twoActives, g_men_banniere: 1 }, {
      activeId: 'g_rem_provoc',
    });
    expect(ab.some((a) => a.kind === 'stat_mod')).toBe(true);
  });

  it('un seul ultime s’applique parmi plusieurs appris', () => {
    const twoUlts: LearnedSkills = { g_men_cri: 1, g_rem_sacrifice: 1 };
    // Défaut → g_men_cri (extra_turn) ; g_rem_sacrifice (buff) exclu.
    const def = computeAbilities('guerrier', twoUlts);
    expect(def.filter((a) => a.kind === 'autocast')).toHaveLength(1);
    expect(def.some((a) => a.kind === 'autocast' && a.action.type === 'extra_turn')).toBe(true);
    const swapped = computeAbilities('guerrier', twoUlts, { ultimateId: 'g_rem_sacrifice' });
    expect(swapped.some((a) => a.kind === 'autocast' && a.action.type === 'buff')).toBe(true);
  });
});

describe('validateSelect', () => {
  const learned: LearnedSkills = { g_men_assommant: 1, g_men_cri: 1 };
  it('accepte un actif appris pour le slot actif', () => {
    expect(validateSelect('guerrier', learned, 'active', 'g_men_assommant').ok).toBe(true);
  });
  it('refuse un nœud non appris', () => {
    expect(validateSelect('guerrier', {}, 'active', 'g_men_assommant').ok).toBe(false);
  });
  it('refuse un mauvais slot (ultime demandé sur emplacement actif)', () => {
    expect(validateSelect('guerrier', learned, 'active', 'g_men_cri').ok).toBe(false);
  });
  it('accepte null (déséquiper)', () => {
    expect(validateSelect('guerrier', learned, 'active', null).ok).toBe(true);
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

describe('Sceau d’affaiblissement (refonte purge_stack)', () => {
  const sceau = allNodes('inquisiteur').find((n) => n.id === 'i_cha_sceau')!;

  it('garde son id (les rangs investis sont conservés)', () => {
    expect(sceau).toBeDefined();
    expect(sceau.name).toContain('Sceau');
  });

  it('vaut 4 % au rang 1 et 12 % au rang 5', () => {
    expect(describeNodeEffects(sceau, 1)[0]).toContain('4 %');
    expect(describeNodeEffects(sceau, 5)[0]).toContain('12 %');
  });

  it('progresse de façon monotone entre les rangs', () => {
    const pct = (r: number): number =>
      Number(describeNodeEffects(sceau, r)[0]!.match(/([\d,]+) %/)![1]!.replace(',', '.'));
    const values = [1, 2, 3, 4, 5].map(pct);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(5);
  });
});

describe('Équilibrage Archer — nerfs', () => {
  const node = (id: string) => allNodes('archer').find((n) => n.id === id)!;

  it('Visée mortelle : divisée par deux (11 % au rang 1, 31 % au rang 5)', () => {
    expect(describeNodeEffects(node('a_oeil_visee'), 1)[0]).toContain('11 %');
    expect(describeNodeEffects(node('a_oeil_visee'), 5)[0]).toContain('31 %');
  });

  it('Point faible : divisé par deux (17 % au rang 1, 45 % au rang 5)', () => {
    expect(describeNodeEffects(node('a_oeil_faille'), 1)[0]).toContain('17 %');
    expect(describeNodeEffects(node('a_oeil_faille'), 5)[0]).toContain('45 %');
  });

  it('Flèche perforante : étourdissement à 10 % au rang 1 et 30 % au rang max', () => {
    const r1 = describeNodeEffects(node('a_oeil_perforante'), 1)[0]!;
    const r3 = describeNodeEffects(node('a_oeil_perforante'), 3)[0]!;
    expect(r1).toContain('10 %');
    expect(r3).toContain('30 %');
    // L'étourdissement n'est plus présenté comme certain.
    expect(r1).toContain('chance');
  });

  it("l'étourdissement n'est plus garanti dans le moteur", () => {
    const built = computeAbilities('archer', { a_oeil_perforante: 1 }, {
      activeId: 'a_oeil_perforante',
      ultimateId: null,
    });
    const cast = built.find((a) => a.kind === 'autocast')!;
    const action = (cast as { action: { type: string; statusChance?: number } }).action;
    expect(action.type).toBe('nuke');
    expect(action.statusChance).toBeCloseTo(0.1, 5);
  });

  it('les autres nukes gardent leur statut GARANTI (pas de régression)', () => {
    // Coup assommant (Guerrier) ne fournit pas de chance → statut certain.
    const built = computeAbilities('guerrier', { g_men_assommant: 1 }, {
      activeId: 'g_men_assommant',
      ultimateId: null,
    });
    const cast = built.find((a) => a.kind === 'autocast')!;
    const action = (cast as { action: { statusChance?: number } }).action;
    expect(action.statusChance).toBeUndefined();
  });
});

describe('Frappe brutale — cadence et portée du perce-armure', () => {
  const brutale = allNodes('guerrier').find((n) => n.id === 'g_ber_brutale')!;

  it('se lance tous les 4 à 5 tours selon le rang', () => {
    expect(describeNodeEffects(brutale, 1)[0]).toContain('Tous les 5 tours');
    expect(describeNodeEffects(brutale, 2)[0]).toContain('Tous les 4 tours');
    expect(describeNodeEffects(brutale, 3)[0]).toContain('Tous les 4 tours');
  });

  it('annonce un perce-armure de 30 % au rang 1 et 60 % au rang 3', () => {
    expect(describeNodeEffects(brutale, 1)[0]).toContain('30 %');
    expect(describeNodeEffects(brutale, 3)[0]).toContain('60 %');
  });

  it('le perce-armure ne vaut QUE pour cette frappe', () => {
    // Une attaque normale ne doit pas en bénéficier : aucune abilité permanente.
    const abilities = computeAbilities('guerrier', { g_ber_brutale: 3 }, {
      activeId: 'g_ber_brutale',
      ultimateId: null,
    });
    expect(abilities.some((a) => a.kind === 'armor_pen')).toBe(false);
  });
});
