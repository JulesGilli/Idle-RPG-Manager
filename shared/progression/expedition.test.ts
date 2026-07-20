import { describe, expect, it } from 'vitest';
import { arcTuning } from './arc.ts';
import {
  expeditionRequiredPower,
  rollExpeditionLoot,
  expeditionPityDue,
  lootHasRare,
  EXPEDITION_PITY_LIMIT,
  EXPEDITION_SKILLS,
  expeditionSkillPoints,
  expeditionSkillSpent,
  validateExpeditionAlloc,
  expeditionSkillBonus,
  expeditionTotalBonus,
  expeditionMasteryBonus,
  MAX_EXPEDITION_LEVEL,
  type ExpeditionType,
} from './expedition.ts';
import { createRng } from '../combat/prng.ts';

const TYPE: ExpeditionType = {
  id: 'exp_test',
  name: 'Test',
  min_level_required: 5,
  min_power_required: 1000,
  duration_base_seconds: 3600,
  loot_table: [],
};

describe('expeditionRequiredPower', () => {
  it('arc 1 : valeur brute (min_power_required), sans rehaussement global', () => {
    expect(arcTuning(1).powerReqMult).toBe(1);
    expect(expeditionRequiredPower(TYPE, 1)).toBe(1000);
    // Défaut = arc 1.
    expect(expeditionRequiredPower(TYPE)).toBe(1000);
  });

  it('arc 2 : ×10 le seuil de l’arc 1', () => {
    expect(arcTuning(2).powerReqMult).toBe(10);
    expect(expeditionRequiredPower(TYPE, 2)).toBe(10_000);
  });

  it('arc hors limites : replié sur un arc valide (arc 1)', () => {
    expect(expeditionRequiredPower(TYPE, 0)).toBe(1000);
  });
});

/* -------------------------------------------------------- BUTIN & PITIÉ -- */

/** Forêt Fossile après rééquilibrage (poids de la rare 8 → 15). */
const FORET: ExpeditionType = {
  id: 'exp_foret_fossile',
  name: 'Forêt Fossile',
  min_level_required: 3,
  min_power_required: 1000,
  duration_base_seconds: 10800, // 3 h → 3 jets
  loot_table: [
    { resource: 'seve_primordiale', min: 2, max: 5, weight: 60 },
    { resource: 'ambre_vivant', min: 1, max: 3, weight: 25 },
    { resource: 'coeur_sylve_ancien', min: 1, max: 1, weight: 15 },
  ],
};
const RARE = 'coeur_sylve_ancien';
const NEUTRE = { speedMult: 1, luckBonus: 0, qtyMult: 1 };

/** Part d'expéditions contenant la rare, sur `n` seeds distinctes. */
function tauxDeRare(bonus = NEUTRE, opts: { guaranteeRare?: boolean } = {}, n = 4000): number {
  let hits = 0;
  for (let s = 1; s <= n; s++) {
    const loot = rollExpeditionLoot(FORET, createRng(s), bonus, opts);
    if ((loot[RARE] ?? 0) > 0) hits++;
  }
  return hits / n;
}

describe('butin d’expédition — ressource rare', () => {
  it('la rare tombe à un taux raisonnable sur une expédition (mesuré, pas supposé)', () => {
    const taux = tauxDeRare();
    // 3 jets à 15/100 → ~38 %. On teste une fourchette large : le but est de
    // détecter un effondrement (l'ancien 8/93 donnait 23,6 %), pas de figer une
    // valeur exacte au centième.
    expect(taux).toBeGreaterThan(0.3);
    expect(taux).toBeLessThan(0.5);
  });

  it('la maîtrise AMÉLIORE enfin les chances de rare', () => {
    // Le cœur du correctif : le luckBonus ne portait que sur la quantité, or les
    // rares ont min = max = 1 — il n'avait donc aucun effet sur elles.
    const sans = tauxDeRare(NEUTRE);
    const avec = tauxDeRare({ speedMult: 1, luckBonus: 0.3, qtyMult: 1 });
    expect(avec).toBeGreaterThan(sans);
  });

  it('la pitié garantit la rare, quelle que soit la seed', () => {
    expect(tauxDeRare(NEUTRE, { guaranteeRare: true }, 500)).toBe(1);
  });

  it('le seuil de pitié se déclenche après 2 échecs, pas avant', () => {
    expect(expeditionPityDue(0)).toBe(false);
    expect(expeditionPityDue(1)).toBe(false);
    expect(expeditionPityDue(2)).toBe(true);
    expect(expeditionPityDue(3)).toBe(true);
  });

  it('lootHasRare reconnaît la rare de la table (poids le plus faible)', () => {
    expect(lootHasRare(FORET, { seve_primordiale: 12 })).toBe(false);
    expect(lootHasRare(FORET, { [RARE]: 1 })).toBe(true);
  });

  it('jamais plus de 2 expéditions d’affilée sans rare (chaîne complète)', () => {
    // Rejoue la boucle du serveur : compteur, garantie, remise à zéro.
    let misses = 0;
    let pire = 0;
    for (let s = 1; s <= 800; s++) {
      const loot = rollExpeditionLoot(FORET, createRng(s), NEUTRE, {
        guaranteeRare: expeditionPityDue(misses),
      });
      if (lootHasRare(FORET, loot)) misses = 0;
      else misses++;
      pire = Math.max(pire, misses);
    }
    expect(pire).toBeLessThanOrEqual(EXPEDITION_PITY_LIMIT);
  });
});

describe('arbre de compétences d’expédition', () => {
  const plein = (): Record<string, number> =>
    Object.fromEntries(EXPEDITION_SKILLS.map((n) => [n.id, n.maxRank]));

  it('1 point par niveau, plafonné au niveau max', () => {
    expect(expeditionSkillPoints(1)).toBe(1);
    expect(expeditionSkillPoints(12)).toBe(12);
    expect(expeditionSkillPoints(999)).toBe(MAX_EXPEDITION_LEVEL);
  });

  it('l’arbre coûte PLUS que le budget max — il faut donc choisir', () => {
    // C'est la propriété de design : si 20 points suffisaient à tout prendre,
    // l'arbre ne serait qu'un déblocage déguisé.
    expect(expeditionSkillSpent(plein())).toBeGreaterThan(
      expeditionSkillPoints(MAX_EXPEDITION_LEVEL),
    );
  });

  it('refuse de dépenser plus de points qu’on en a', () => {
    const trop = { exp_cel_1: 3, exp_cel_2: 3, exp_cel_3: 3 }; // 9 points
    expect(validateExpeditionAlloc(trop, 20).ok).toBe(true);
    const check = validateExpeditionAlloc(trop, 5);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/disponibles/);
  });

  it('refuse un nœud inconnu, un rang négatif ou au-delà du max', () => {
    expect(validateExpeditionAlloc({ nawak: 1 }, 20).ok).toBe(false);
    expect(validateExpeditionAlloc({ exp_cel_1: -1 }, 20).ok).toBe(false);
    expect(validateExpeditionAlloc({ exp_cel_1: 4 }, 20).ok).toBe(false);
    expect(validateExpeditionAlloc({ exp_cel_1: 1.5 }, 20).ok).toBe(false);
  });

  it('une allocation vide ne change rien aux bonus de maîtrise', () => {
    // Garantie de non-régression : les joueurs qui n'ouvrent jamais l'arbre
    // doivent conserver EXACTEMENT ce qu'ils avaient avant.
    for (const lvl of [1, 5, 10, 20]) {
      expect(expeditionTotalBonus(lvl, {})).toEqual(expeditionMasteryBonus(lvl));
    }
  });

  it('l’arbre AMPLIFIE la maîtrise sur les trois axes', () => {
    const base = expeditionMasteryBonus(10);
    const boost = expeditionTotalBonus(10, { exp_cel_1: 3, exp_for_1: 3, exp_abo_1: 3 });
    expect(boost.speedMult).toBeLessThan(base.speedMult);
    expect(boost.luckBonus).toBeGreaterThan(base.luckBonus);
    expect(boost.qtyMult).toBeGreaterThan(base.qtyMult);
  });

  it('la durée ne peut jamais tomber sous la moitié, même tout investi', () => {
    expect(expeditionTotalBonus(MAX_EXPEDITION_LEVEL, plein()).speedMult).toBeGreaterThanOrEqual(0.5);
  });

  it('ignore les rangs au-delà du max dans le calcul du bonus', () => {
    const sain = expeditionSkillBonus({ exp_cel_1: 3 });
    const gonfle = expeditionSkillBonus({ exp_cel_1: 99 });
    expect(gonfle).toEqual(sain);
  });
});
