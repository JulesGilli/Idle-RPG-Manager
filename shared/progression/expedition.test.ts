import { describe, expect, it } from 'vitest';
import { arcTuning } from './arc.ts';
import {
  expeditionRequiredPower,
  rollExpeditionLoot,
  expeditionPityDue,
  lootHasRare,
  EXPEDITION_PITY_LIMIT,
  EXPEDITION_SKILLS,
  expeditionSkillSpent,
  expeditionTreeCost,
  expeditionNodeRequirement,
  validateExpeditionAlloc,
  expeditionSkillBonus,
  expeditionTotalBonus,
  expeditionMasteryBonus,
  expeditionFreesHeroes,
  expeditionFullLoot,
  expeditionPowerFactor,
  computeExpeditionDuration,
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


describe('échelle de compétences d’expédition (une seule branche)', () => {
  const echelle = (): Record<string, number> =>
    Object.fromEntries(EXPEDITION_SKILLS.map((n) => [n.id, n.maxRank]));

  it('coûte EXACTEMENT le nombre de niveaux : tout est acquis au niveau max', () => {
    // La propriété qui rend la progression lisible. Si quelqu'un ajoute un
    // palier sans retirer ailleurs, ce test le dit tout de suite.
    expect(expeditionTreeCost()).toBe(MAX_EXPEDITION_LEVEL);
    expect(validateExpeditionAlloc(echelle(), MAX_EXPEDITION_LEVEL).ok).toBe(true);
  });

  it('« Intendance autonome » tombe pile au niveau 6', () => {
    // 5 points sur les deux premiers paliers, le 6e achète l'intendance.
    const jusquA6 = { exp_portage: 3, exp_sacoches: 2, exp_intendance: 1 };
    expect(expeditionSkillSpent(jusquA6)).toBe(6);
    expect(validateExpeditionAlloc(jusquA6, 6).ok).toBe(true);
    // Au niveau 5, le point n'existe pas encore.
    expect(validateExpeditionAlloc(jusquA6, 5).ok).toBe(false);
  });

  it('refuse un palier dont les précédents ne sont pas terminés', () => {
    // C'est l'essence de l'échelle : pas de saut.
    expect(validateExpeditionAlloc({ exp_chineur: 1 }, 20).ok).toBe(false);
    expect(validateExpeditionAlloc({ exp_portage: 2, exp_sacoches: 1 }, 20).ok).toBe(false);
    expect(validateExpeditionAlloc({ exp_portage: 3, exp_sacoches: 1 }, 20).ok).toBe(true);
  });

  it('refuse le niveau minimum non atteint, même avec les points', () => {
    const alloc = { exp_portage: 3, exp_sacoches: 2, exp_intendance: 1 };
    const check = validateExpeditionAlloc(alloc, 5);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/niveau 6|disponibles/);
  });

  it('refuse nœud inconnu, rang négatif, rang au-delà du max, non entier', () => {
    expect(validateExpeditionAlloc({ nawak: 1 }, 20).ok).toBe(false);
    expect(validateExpeditionAlloc({ exp_portage: -1 }, 20).ok).toBe(false);
    expect(validateExpeditionAlloc({ exp_portage: 4 }, 20).ok).toBe(false);
    expect(validateExpeditionAlloc({ exp_portage: 1.5 }, 20).ok).toBe(false);
  });

  it('les deux paliers tout-ou-rien ne répondent qu’une fois pris', () => {
    expect(expeditionFreesHeroes({})).toBe(false);
    expect(expeditionFreesHeroes({ exp_intendance: 1 })).toBe(true);
    expect(expeditionFullLoot({})).toBe(false);
    expect(expeditionFullLoot({ exp_inventaire: 1 })).toBe(true);
  });

  it('une allocation vide ne change rien aux bonus de maîtrise', () => {
    // Non-régression : ne pas toucher à l'arbre doit laisser le joueur
    // exactement où il était.
    for (const lvl of [1, 5, 10, 20]) {
      expect(expeditionTotalBonus(lvl, {})).toEqual(expeditionMasteryBonus(lvl));
    }
  });

  it('l’échelle complète amplifie les trois axes', () => {
    const base = expeditionMasteryBonus(20);
    const full = expeditionTotalBonus(20, echelle());
    expect(full.speedMult).toBeLessThan(base.speedMult);
    expect(full.luckBonus).toBeGreaterThan(base.luckBonus);
    expect(full.qtyMult).toBeGreaterThan(base.qtyMult);
    expect(full.speedMult).toBeGreaterThanOrEqual(0.5);
  });

  it('ignore les rangs gonflés au-delà du max', () => {
    expect(expeditionSkillBonus({ exp_portage: 99 })).toEqual(
      expeditionSkillBonus({ exp_portage: 3 }),
    );
  });

  it('l’ordre des paliers est celui de l’échelle', () => {
    let precedent = -1;
    for (const n of EXPEDITION_SKILLS) {
      const req = expeditionNodeRequirement(n.id);
      expect(req).toBeGreaterThan(precedent);
      precedent = req;
    }
  });
});

describe('durée d’expédition pilotée par la PUISSANCE', () => {
  const type = {
    id: 'e1',
    name: 'Test',
    min_level_required: 5,
    min_power_required: 1000,
    duration_base_seconds: 3600,
    loot_table: [
      { resource: 'commun', weight: 10, min: 2, max: 4 },
      { resource: 'rare', weight: 1, min: 1, max: 1 },
    ],
  };

  it('le strict minimum coûte la durée de base', () => {
    expect(expeditionPowerFactor(1000, 1000)).toBe(1);
  });

  it('DEUX FOIS la puissance requise → moitié moins de temps', () => {
    // La règle demandée : 1000 requis, 2000 envoyés → −50 %.
    expect(expeditionPowerFactor(1000, 2000)).toBeCloseTo(0.5, 5);
    expect(computeExpeditionDuration(type, 2000, 1, {}, 1)).toBe(1800);
  });

  it('une escouade trop faible ne rallonge pas au-delà de la base', () => {
    expect(expeditionPowerFactor(1000, 500)).toBe(1);
  });

  it('plancher à 40 % : sur-stuffer ne rend pas l’expédition instantanée', () => {
    expect(expeditionPowerFactor(1000, 100000)).toBeCloseTo(0.4, 5);
  });

  it('l’arbre se cumule à la puissance', () => {
    const sans = computeExpeditionDuration(type, 2000, 1, {}, 1);
    const avec = computeExpeditionDuration(type, 2000, 1, { exp_portage: 3 }, 1);
    expect(avec).toBeLessThan(sans);
  });
});

describe('Inventaire complet — un exemplaire de chaque matériau', () => {
  const type = {
    id: 'e2',
    name: 'Test',
    min_level_required: 5,
    min_power_required: 1000,
    duration_base_seconds: 3600,
    loot_table: [
      { resource: 'commun', weight: 100, min: 2, max: 4 },
      { resource: 'rare', weight: 1, min: 1, max: 1 },
      { resource: 'tres_rare', weight: 1, min: 1, max: 1 },
    ],
  };
  const rng = () => createRng(12345);

  it('sans le palier, un tirage peut manquer des ressources', () => {
    const loot = rollExpeditionLoot(type, rng());
    expect(Object.keys(loot).length).toBeLessThan(type.loot_table.length);
  });

  it('avec le palier, CHAQUE ressource de la table est présente', () => {
    const loot = rollExpeditionLoot(type, rng(), undefined, { guaranteeAll: true });
    for (const e of type.loot_table) {
      expect(loot[e.resource]).toBeGreaterThan(0);
    }
  });

  it('il COMPLÈTE le tirage, il ne l’écrase pas', () => {
    // Un bon jet ne doit pas être ramené au minimum garanti.
    const nu = rollExpeditionLoot(type, rng());
    const garanti = rollExpeditionLoot(type, rng(), undefined, { guaranteeAll: true });
    for (const [res, qty] of Object.entries(nu)) {
      expect(garanti[res]).toBeGreaterThanOrEqual(qty);
    }
  });
});
