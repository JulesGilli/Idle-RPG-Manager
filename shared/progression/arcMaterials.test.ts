import { describe, expect, it } from 'vitest';
import {
  ARC2_KEYS,
  ARC2_TWINS,
  ARC2_TWIN_LABELS,
  FORGE_MATERIALS_ARC2,
  GEMS_ARC2,
  arcMaterialKey,
  arcOfMaterialKey,
  baseMaterialKey,
  forgeMaterialsForArc,
  gemByMapForArc,
  gemsForArc,
  materialForArc,
  gemForArc,
} from './arcMaterials.ts';
import { FORGE_MATERIALS, FORGE_BASES, craftItemAtRarity, effectiveBonus, UPGRADE_MAX } from './forge.ts';
import { GEMS, gemByMap } from './jewelry.ts';
import { SET_PIECES, setArc, setById } from './sets.ts';
import { tierGearMult } from './arc.ts';


describe('table des jumeaux d’arc', () => {
  it('couvre les 4 familles : 10 farm + 10 boss + 10 gemmes + 9 butins d’expédition', () => {
    expect(Object.keys(ARC2_TWINS)).toHaveLength(39);
  });

  it('couvre TOUS les matériaux exigés par les recettes de PIÈCES DE SET', () => {
    // Décisif : sans jumeau pour le butin d'expédition, aucune pièce de set
    // d'arc 2 ne serait craftable — les recettes réclameraient des matériaux
    // que l'arc 2 ne produit pas.
    // Seules les recettes d'ARC 1 sont concernées : celles d'arc 2 réclament
    // déjà des clés T2, qui n'ont évidemment pas de jumeau.
    for (const p of SET_PIECES) {
      if (setArc(setById(p.setId)!) !== 1) continue;
      for (const m of p.materials) {
        expect(ARC2_TWINS[m.key], `recette ${p.id} → ${m.key}`).toBeDefined();
      }
    }
  });

  it('les recettes d’ARC 2 ne consomment QUE des matériaux d’arc 2', () => {
    // Sinon un joueur d'arc 2 devrait retourner farmer l'arc 1 pour ses sets.
    for (const p of SET_PIECES) {
      if (setArc(setById(p.setId)!) !== 2) continue;
      for (const m of p.materials) {
        expect(arcOfMaterialKey(m.key), `recette ${p.id} → ${m.key}`).toBe(2);
      }
    }
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

  it('le butin d’expédition bascule aussi (les recettes de set en dépendent)', () => {
    expect(arcMaterialKey('seve_primordiale', 2)).toBe('seve_corrompue');
    expect(arcMaterialKey('eclat_du_noyau', 2)).toBe('eclat_du_vide');
  });

  it('laisse passer une clé SANS jumeau (larmes astrales, matériaux d’event)', () => {
    // Sans ce repli, passer en arc 2 ferait disparaître ces ressources. Les
    // matériaux d'EVENT n'ont volontairement pas de jumeau : ils sont déjà
    // propres à l'arc 2 (Éclat sacré, Poussière bénie).
    for (const k of ['larme_astrale', 'eclat_sacre', 'poussiere_benie', 'plume_appel']) {
      expect(arcMaterialKey(k, 2)).toBe(k);
    }
  });

  it('baseMaterialKey fait le chemin INVERSE (c’est lui qui porte les icônes)', () => {
    // Les icônes sont indexées par la clé d'arc 1 : sans ce retour en arrière,
    // les 30 matériaux d'arc 2 s'afficheraient sans visuel.
    expect(baseMaterialKey('ecorce_petrifiee')).toBe('ecorce');
    expect(baseMaterialKey('gemme_astre_noir')).toBe('gemme_astrale');
    // Idempotent sur une clé d'arc 1, et neutre sur une clé sans jumeau.
    expect(baseMaterialKey('ecorce')).toBe('ecorce');
    expect(baseMaterialKey('larme_astrale')).toBe('larme_astrale');
  });

  it('aller-retour : toute clé d’arc 2 revient à son jumeau d’arc 1', () => {
    for (const [base, twin] of Object.entries(ARC2_TWINS)) {
      expect(baseMaterialKey(twin.key)).toBe(base);
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
    // Doubler le scaling (matériau ×N ET arc via tierGearMult) ferait exploser l'arc 2.
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

describe('progression entre arcs (invariant structurel)', () => {
  /** Stats totales d'une pièce forgée : modèle × matériau × renfort × arc. */
  const total = (mat: (typeof FORGE_MATERIALS)[number], arc: number, upgrade: number) => {
    const base = FORGE_BASES.find((b) => b.id === 'epee')!;
    const it = craftItemAtRarity(base, mat, null, 'ultimate');
    const sum = it.atk_bonus + it.def_bonus + it.hp_bonus;
    return Math.round(effectiveBonus(sum, upgrade) * tierGearMult(arc));
  };

  it('la PIRE pièce d’arc 2 bat la MEILLEURE d’arc 1 (zone 10 renforcée à fond)', () => {
    // La règle du jeu : passer d'arc ne doit JAMAIS faire reculer la puissance.
    // Le piège est le RENFORCEMENT : une zone 10 à +10 vaut ×2, et c'est ce
    // facteur que le multiplicateur d'arc doit franchir — pas seulement l'écart
    // de zones. À ×14 l'invariant était violé de 3 %.
    const pireArc2 = total(FORGE_MATERIALS_ARC2[0]!, 2, 0); // zone 1, non renforcée
    const meilleurArc1 = total(FORGE_MATERIALS.at(-1)!, 1, UPGRADE_MAX); // zone 10, +10
    expect(pireArc2).toBeGreaterThan(meilleurArc1);
  });

  it('la progression reste monotone zone par zone à l’intérieur de l’arc 2', () => {
    for (let i = 1; i < FORGE_MATERIALS_ARC2.length; i++) {
      expect(total(FORGE_MATERIALS_ARC2[i]!, 2, 0)).toBeGreaterThan(
        total(FORGE_MATERIALS_ARC2[i - 1]!, 2, 0),
      );
    }
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

describe('résolution STRICTE par arc (validation serveur)', () => {
  it('un id d’arc 1 est introuvable en arc 2, et réciproquement', () => {
    // C'est TOUTE la validation serveur : sans cette étanchéité, un client
    // pourrait faire payer un craft d'arc 2 avec des composants d'arc 1.
    const a1 = FORGE_MATERIALS[0]!.id;
    const a2 = FORGE_MATERIALS_ARC2[0]!.id;
    expect(materialForArc(a1, 1)?.id).toBe(a1);
    expect(materialForArc(a1, 2)).toBeUndefined();
    expect(materialForArc(a2, 2)?.id).toBe(a2);
    expect(materialForArc(a2, 1)).toBeUndefined();
  });

  it('même étanchéité pour les gemmes', () => {
    expect(gemForArc('gemme_seve', 1)?.id).toBe('gemme_seve');
    expect(gemForArc('gemme_seve', 2)).toBeUndefined();
    expect(gemForArc('gemme_seve_noire', 2)?.id).toBe('gemme_seve_noire');
    expect(gemForArc('gemme_seve_noire', 1)).toBeUndefined();
  });

  it('la recette d’un matériau d’arc 2 ne réclame QUE des composants d’arc 2', () => {
    // Le symptôme signalé : la Forge Sacrée facturait des composants d'arc 1.
    for (const m of FORGE_MATERIALS_ARC2) {
      for (const x of m.materials) expect(arcOfMaterialKey(x.key), `${m.id} → ${x.key}`).toBe(2);
    }
  });
});
