import { describe, expect, it } from 'vitest';
import {
  craftItem,
  craftRanges,
  craftRecipe,
  getBase,
  getBossMaterial,
  getMaterialTier,
  unlockedCraftTier,
  zoneMaterialCost,
  bossSecondaryBudget,
  FORGE_BASES,
  FORGE_MATERIALS,
  BOSS_MATERIALS,
  CRAFT_RARITY_WEIGHTS,
} from './forge.ts';
import { xpToNextLevel } from './formulas.ts';
import { createRng } from '../combat/prng.ts';

describe('craftItem', () => {
  it('produit un objet spécifique nommé "modèle + composant"', () => {
    const base = getBase('grande_epee')!;
    const mat = getMaterialTier('chene')!;
    const item = craftItem(base, mat, null, createRng(42));
    expect(item.name).toBe('Grande épée en chêne');
    expect(item.item_type).toBe('weapon');
    expect(item.weight).toBe('heavy');
    expect(item.tier).toBe(1);
    expect(item.atk_bonus).toBeGreaterThan(0);
  });

  it('le tier de l’objet suit le tier de craft du composant', () => {
    const base = getBase('sceptre')!;
    for (const mat of FORGE_MATERIALS) {
      const item = craftItem(base, mat, null, createRng(7));
      expect(item.tier).toBe(mat.craftTier);
    }
  });

  it('déterministe pour une même seed', () => {
    const base = getBase('plaques')!;
    const mat = getMaterialTier('givre')!;
    const a = craftItem(base, mat, null, createRng(123));
    const b = craftItem(base, mat, null, createRng(123));
    expect(a).toEqual(b);
  });

  it('un composant de zone supérieure donne des objets plus puissants (en moyenne)', () => {
    const base = getBase('epee')!;
    const z1 = getMaterialTier('chene')!;
    const z10 = getMaterialTier('etoiles')!;
    let sum1 = 0;
    let sum10 = 0;
    for (let s = 0; s < 200; s++) {
      sum1 += craftItem(base, z1, null, createRng(s)).atk_bonus;
      sum10 += craftItem(base, z10, null, createRng(s)).atk_bonus;
    }
    expect(sum10).toBeGreaterThan(sum1 * 3);
  });

  it('les stats craftées restent dans la range affichée', () => {
    for (const base of FORGE_BASES) {
      for (const mat of FORGE_MATERIALS) {
        const boss = getBossMaterial('encre_kraken')!;
        const ranges = craftRanges(base, mat, boss);
        for (let s = 0; s < 50; s++) {
          const item = craftItem(base, mat, boss, createRng(s * 31 + 1));
          expect(item.atk_bonus).toBeGreaterThanOrEqual(ranges.atk[0]);
          expect(item.atk_bonus).toBeLessThanOrEqual(ranges.atk[1]);
          expect(item.def_bonus).toBeGreaterThanOrEqual(ranges.def[0]);
          expect(item.def_bonus).toBeLessThanOrEqual(ranges.def[1]);
          expect(item.hp_bonus).toBeGreaterThanOrEqual(ranges.hp[0]);
          expect(item.hp_bonus).toBeLessThanOrEqual(ranges.hp[1]);
        }
      }
    }
  });

  it('la distribution de rareté suit les % globaux (grossièrement)', () => {
    const base = getBase('dague')!;
    const mat = getMaterialTier('chene')!;
    const counts: Record<string, number> = {};
    const N = 5000;
    for (let s = 0; s < N; s++) {
      const r = craftItem(base, mat, null, createRng(s)).rarity;
      counts[r] = (counts[r] ?? 0) + 1;
    }
    const total = Object.values(CRAFT_RARITY_WEIGHTS).reduce((s, w) => s + w, 0);
    for (const [rarity, weight] of Object.entries(CRAFT_RARITY_WEIGHTS)) {
      const expected = (weight / total) * N;
      // Tolérance large : on vérifie l'ordre de grandeur, pas la précision.
      expect(counts[rarity] ?? 0).toBeGreaterThan(expected * 0.6);
      expect(counts[rarity] ?? 0).toBeLessThan(expected * 1.5);
    }
  });

  it('tierMult par défaut (1) laisse les stats de l’arc 1 STRICTEMENT inchangées', () => {
    const base = getBase('grande_epee')!;
    const mat = getMaterialTier('obsidienne')!;
    const implicit = craftItem(base, mat, null, createRng(99));
    const explicit1 = craftItem(base, mat, null, createRng(99), 1);
    expect(explicit1).toEqual(implicit);
  });

  it('tierMult scale les stats brutes au tier de l’arc', () => {
    const base = getBase('grande_epee')!;
    const mat = getMaterialTier('obsidienne')!;
    const t1 = craftItem(base, mat, null, createRng(99), 1);
    const t2 = craftItem(base, mat, null, createRng(99), 14);
    // Même rareté (même seed) → stats multipliées ~×14 (arrondi près).
    expect(t2.rarity).toBe(t1.rarity);
    expect(t2.atk_bonus).toBe(Math.round(t1.atk_bonus * 14));
    expect(t2.def_bonus).toBe(Math.round(t1.def_bonus * 14));
    expect(t2.hp_bonus).toBe(Math.round(t1.hp_bonus * 14));
  });

  it('toutes les bases sont craftables avec tous les composants', () => {
    for (const base of FORGE_BASES) {
      for (const mat of FORGE_MATERIALS) {
        const item = craftItem(base, mat, null, createRng(1));
        expect(item.name).toContain(base.label);
        if (base.itemType === 'weapon') expect(item.atk_bonus).toBeGreaterThan(0);
        if (base.itemType === 'armor') expect(item.def_bonus).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * L'ESSENCE DE BOSS. Elle était imposée par la zone du composant et ne décidait
 * de RIEN — une taxe. C'est elle, désormais, qui oriente les stats secondaires,
 * et c'est le seul endroit du craft où le joueur arbitre autre chose que de la
 * puissance brute.
 */
describe('essence de boss', () => {
  const epee = () => getBase('epee')!; // « dégâts purs » : aucun secondaire de modèle
  const etoiles = () => getMaterialTier('etoiles')!;

  it('sans essence, une arme « dégâts purs » n’a AUCUN secondaire', () => {
    const item = craftItem(epee(), etoiles(), null, createRng(11));
    expect(item.atk_bonus).toBeGreaterThan(0);
    expect(item.def_bonus).toBe(0);
    expect(item.hp_bonus).toBe(0);
  });

  it('l’essence décide de QUELLE stat secondaire tombe', () => {
    const hydre = craftItem(epee(), etoiles(), getBossMaterial('coeur_hydre')!, createRng(11));
    expect(hydre.hp_bonus).toBeGreaterThan(0);
    expect(hydre.def_bonus).toBe(0);

    const titan = craftItem(epee(), etoiles(), getBossMaterial('fragment_titan')!, createRng(11));
    expect(titan.def_bonus).toBeGreaterThan(0);
    expect(titan.hp_bonus).toBe(0);
  });

  it('les sept essences couvrent les sept combinaisons de stats — aucun doublon', () => {
    const combos = BOSS_MATERIALS.map((b) => [...b.stats].sort().join('+'));
    expect(new Set(combos).size).toBe(BOSS_MATERIALS.length);
    expect(BOSS_MATERIALS.length).toBe(7);
  });

  it('la zone du boss DOSE : un boss tardif verse plus qu’un boss précoce', () => {
    // Sans ça, tout le monde farmerait le boss le plus facile pour toujours.
    for (let z = 5; z <= 10; z++) {
      expect(bossSecondaryBudget(z), `zone ${z}`).toBeGreaterThan(bossSecondaryBudget(z - 1));
    }
    expect(bossSecondaryBudget(4)).toBeCloseTo(0.6);
    expect(bossSecondaryBudget(10)).toBeCloseTo(1.2);
  });

  it('concentrer bat étaler sur une stat donnée — le budget se partage', () => {
    // Cœur d'hydre (zone 4, PV seul) verse plus de PV que l'essence astrale
    // (zone 10) qui étale pourtant deux fois plus de budget sur trois stats.
    const hydre = craftItem(epee(), etoiles(), getBossMaterial('coeur_hydre')!, createRng(11));
    const astrale = craftItem(epee(), etoiles(), getBossMaterial('essence_astrale')!, createRng(11));
    expect(hydre.hp_bonus).toBeGreaterThan(astrale.hp_bonus);
    // …mais l'astrale, elle, touche les trois.
    expect(astrale.def_bonus).toBeGreaterThan(0);
    expect(astrale.hp_bonus).toBeGreaterThan(0);
  });

  it('le composant AMPLIFIE le secondaire : même essence, meilleure zone', () => {
    const boss = getBossMaterial('coeur_hydre')!;
    const petit = craftItem(epee(), getMaterialTier('chene')!, boss, createRng(11));
    const grand = craftItem(epee(), etoiles(), boss, createRng(11));
    expect(grand.hp_bonus).toBeGreaterThan(petit.hp_bonus);
  });

  it('l’essence choisie s’ajoute au coût — et rien sans elle', () => {
    const mat = getMaterialTier('etoiles')!;
    const nue = craftRecipe(mat, null);
    expect(nue.materials.map((m) => m.key)).toEqual(['poussiere_etoile']);

    const boss = getBossMaterial('coeur_hydre')!;
    const avec = craftRecipe(mat, boss);
    expect(avec.materials).toContainEqual({ key: 'coeur_hydre', qty: boss.qty });
  });

  it('les ateliers SANS choix d’essence paient toujours celle de leur zone', () => {
    // Sortir l'essence de `materials` aurait rendu joaillerie/autel/sets moins
    // chers en douce : zoneMaterialCost restitue la recette historique.
    const marais = getMaterialTier('marais')!; // zone 4 → a un boss
    expect(zoneMaterialCost(marais)).toContainEqual({ key: 'coeur_hydre', qty: 1 });
    const chene = getMaterialTier('chene')!; // zones 1-3 → aucun boss
    expect(zoneMaterialCost(chene)).toEqual([{ key: 'ecorce', qty: 10 }]);
  });
});

describe('unlockedCraftTier', () => {
  it('tier 1 par défaut, tier 2 après 10 zones terminées', () => {
    expect(unlockedCraftTier(0)).toBe(1);
    expect(unlockedCraftTier(9)).toBe(1);
    expect(unlockedCraftTier(10)).toBe(2);
    expect(unlockedCraftTier(20)).toBe(3);
  });
});

describe('xpToNextLevel', () => {
  it('croît plus que linéairement (courbe exponentielle)', () => {
    expect(xpToNextLevel(1)).toBe(100);
    // Le coût par niveau croît plus vite que le simple linéaire (100 × niveau).
    expect(xpToNextLevel(10)).toBeGreaterThan(100 * 10 * 2);
    expect(xpToNextLevel(20)).toBeGreaterThan(xpToNextLevel(10) * 4);
  });

  it('reste strictement croissant', () => {
    for (let l = 1; l < 60; l++) {
      expect(xpToNextLevel(l + 1)).toBeGreaterThan(xpToNextLevel(l));
    }
  });
});
