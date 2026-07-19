import { describe, expect, it } from 'vitest';
import { arcTuning } from './arc.ts';
import {
  expeditionRequiredPower,
  rollExpeditionLoot,
  expeditionPityDue,
  lootHasRare,
  EXPEDITION_PITY_LIMIT,
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
