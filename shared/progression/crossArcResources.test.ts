import { describe, expect, it } from 'vitest';
import {
  CROSS_ARC_RESOURCES,
  isCrossArcResource,
  resourceTier,
  ARC2_TWINS,
  arcMaterialKey,
} from './arcMaterials.ts';
import { TAVERN_REROLL_CURRENCY } from './recruit.ts';
import { BLESSING_RESOURCE } from './blessing.ts';
import { RUNE_RESOURCE } from './runes.ts';

/**
 * RESSOURCES MUTUALISÉES ENTRE LES ARCS.
 *
 * `player_resources` est indexé par `(player_id, resource, tier)` avec
 * `tier` = l'arc. Une ressource « commune » l'est donc à DEUX conditions :
 *   1. aucune clé jumelle d'arc 2 (sinon deux clés différentes) ;
 *   2. un tier de stockage FIXE (sinon deux lignes, une par arc).
 *
 * La condition 2 manquait : les plumes gagnées en arc 1 étaient invisibles en
 * arc 2, et les larmes du World Boss (créditées au tier 1) indépensables pour
 * un joueur d'arc 2, dont la dépense lisait le tier 2.
 */

describe('resourceTier', () => {
  it('épingle les ressources communes au tier 1, quel que soit l’arc', () => {
    for (const key of CROSS_ARC_RESOURCES) {
      for (const arc of [1, 2, 3]) expect(resourceTier(key, arc)).toBe(1);
    }
  });

  it('laisse les autres ressources au tier de leur arc', () => {
    expect(resourceTier('ecorce', 1)).toBe(1);
    expect(resourceTier('ecorce_petrifiee', 2)).toBe(2);
    expect(resourceTier('sceau_catacombe_brise', 2)).toBe(2);
  });

  it('ne descend jamais sous 1 (un arc 0 n’existe pas)', () => {
    expect(resourceTier('ecorce', 0)).toBe(1);
    expect(resourceTier('ecorce', -3)).toBe(1);
  });
});

describe('cohérence des deux conditions', () => {
  it('une ressource commune n’a AUCUN jumeau d’arc 2', () => {
    // Sinon on aurait deux clés distinctes en plus des deux tiers : la
    // mutualisation serait cassée d'une seconde façon.
    for (const key of CROSS_ARC_RESOURCES) {
      expect(ARC2_TWINS[key], `${key} a un jumeau d'arc 2`).toBeUndefined();
      expect(arcMaterialKey(key, 2)).toBe(key);
    }
  });

  it('couvre les monnaies réellement partagées par les deux arcs', () => {
    // La plume paie le reroll de Taverne, la larme paie l'Oratoire ET les runes.
    // Si l'une de ces constantes change de clé, ce test tombe.
    expect(isCrossArcResource(TAVERN_REROLL_CURRENCY)).toBe(true);
    expect(isCrossArcResource(BLESSING_RESOURCE)).toBe(true);
    expect(isCrossArcResource(RUNE_RESOURCE)).toBe(true);
  });

  it('ne mutualise RIEN d’autre (le reste doit rester séparé par arc)', () => {
    // Mutualiser un matériau de farm reviendrait à fusionner les économies des
    // deux arcs — l'inverse de l'intention.
    for (const key of ['ecorce', 'poussiere_etoile', 'sceau_catacombe', 'gemme_seve']) {
      expect(isCrossArcResource(key), `${key} ne doit pas être mutualisé`).toBe(false);
    }
  });
});
