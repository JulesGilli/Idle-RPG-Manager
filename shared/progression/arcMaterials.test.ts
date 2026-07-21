import { describe, expect, it } from 'vitest';
import {
  ARC2_KEYS,
  ARC2_TWINS,
  ARC2_TWIN_LABELS,
  FORGE_MATERIALS_ARC2,
  GEMS_ARC2,
  arcMaterialKey,
  arcOfMaterialKey,
  forgeMaterialsForArc,
  gemByMapForArc,
  gemsForArc,
} from './arcMaterials.ts';
import { FORGE_MATERIALS } from './forge.ts';
import { GEMS, gemByMap } from './jewelry.ts';


describe('table des jumeaux d’arc', () => {
  it('couvre les 3 familles pour les 10 zones (10 farm + 10 boss + 10 gemmes)', () => {
    expect(Object.keys(ARC2_TWINS)).toHaveLength(30);
  });

  it('couvre TOUS les matériaux de farm de la forge', () => {
    // Le vrai risque : oublier une zone. On part des sources réelles (la forge
    // et les gemmes), pas de la table elle-même — sinon le test ne prouve rien.
    for (const m of FORGE_MATERIALS) {
      for (const x of m.materials) {
        expect(ARC2_TWINS[x.key], `matériau ${x.key} (${m.label})`).toBeDefined();
      }
    }
  });

  it('couvre TOUTES les gemmes', () => {
    for (const g of GEMS) expect(ARC2_TWINS[g.id], `gemme ${g.id}`).toBeDefined();
  });

  it('aucune clé d’arc 2 ne collisionne avec une clé d’arc 1', () => {
    const arc1 = new Set(Object.keys(ARC2_TWINS));
    for (const k of ARC2_KEYS) expect(arc1.has(k)).toBe(false);
  });

  it('les clés et les libellés d’arc 2 sont uniques', () => {
    expect(new Set(ARC2_KEYS).size).toBe(ARC2_KEYS.length);
    const labels = Object.values(ARC2_TWIN_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('arcMaterialKey', () => {
  it('laisse l’arc 1 intact', () => {
    expect(arcMaterialKey('ecorce', 1)).toBe('ecorce');
  });

  it('bascule sur le jumeau en arc 2', () => {
    expect(arcMaterialKey('ecorce', 2)).toBe('ecorce_petrifiee');
    expect(arcMaterialKey('gemme_astrale', 2)).toBe('gemme_astre_noir');
  });

  it('laisse passer une clé SANS jumeau (larmes, butin d’expé, matériaux d’event)', () => {
    // Sans ce repli, passer en arc 2 ferait disparaître ces ressources.
    for (const k of ['larme_astrale', 'eclat_sacre', 'poussiere_benie', 'seve_primordiale']) {
      expect(arcMaterialKey(k, 2)).toBe(k);
    }
  });

  it('arcOfMaterialKey reconnaît l’arc d’une clé', () => {
    expect(arcOfMaterialKey('ecorce')).toBe(1);
    expect(arcOfMaterialKey('ecorce_petrifiee')).toBe(2);
    expect(arcOfMaterialKey('larme_astrale')).toBe(1);
  });
});

describe('thèmes de forge dérivés', () => {
  it('un thème par zone, comme en arc 1', () => {
    expect(FORGE_MATERIALS_ARC2).toHaveLength(FORGE_MATERIALS.length);
  });

  it('portent craftTier 2 et des ids distincts', () => {
    const ids1 = new Set(FORGE_MATERIALS.map((m) => m.id));
    for (const m of FORGE_MATERIALS_ARC2) {
      expect(m.craftTier).toBe(2);
      expect(ids1.has(m.id)).toBe(false);
    }
  });

  it('consomment des matériaux d’ARC 2 uniquement', () => {
    for (const m of FORGE_MATERIALS_ARC2) {
      for (const x of m.materials) expect(arcOfMaterialKey(x.key)).toBe(2);
    }
  });

  it('gardent la magnitude et la zone de leur jumeau : la puissance d’arc vient de tierGearMult, pas d’ici', () => {
    // Doubler le scaling (matériau ×N ET arc ×14) ferait exploser l'arc 2.
    FORGE_MATERIALS_ARC2.forEach((m, i) => {
      expect(m.magnitude).toBe(FORGE_MATERIALS[i]!.magnitude);
      expect(m.zone).toBe(FORGE_MATERIALS[i]!.zone);
    });
  });

  it('forgeMaterialsForArc ne mélange jamais les deux arcs', () => {
    expect(forgeMaterialsForArc(1)).toBe(FORGE_MATERIALS);
    expect(forgeMaterialsForArc(2)).toBe(FORGE_MATERIALS_ARC2);
  });
});

describe('gemmes dérivées', () => {
  it('une gemme par zone, mêmes passifs et mêmes plafonds qu’en arc 1', () => {
    expect(GEMS_ARC2).toHaveLength(GEMS.length);
    GEMS_ARC2.forEach((g, i) => {
      expect(g.passive).toBe(GEMS[i]!.passive);
      // Un arc apporte des STATS, pas des passifs plus gros.
      expect(g.maxPct).toBe(GEMS[i]!.maxPct);
      expect(g.mapId).toBe(GEMS[i]!.mapId);
    });
  });

  it('les ids de gemme d’arc 2 sont ceux de la table de jumeaux', () => {
    for (const g of GEMS_ARC2) expect(arcOfMaterialKey(g.id)).toBe(2);
  });

  it('gemByMapForArc renvoie la gemme du bon arc', () => {
    const t1 = gemByMap('forest')!;
    expect(gemByMapForArc('forest', 1)!.id).toBe(t1.id);
    expect(gemByMapForArc('forest', 2)!.id).toBe('gemme_seve_noire');
  });

  it('gemsForArc ne mélange jamais les deux arcs', () => {
    expect(gemsForArc(1)).toBe(GEMS);
    expect(gemsForArc(2)).toBe(GEMS_ARC2);
  });
});
