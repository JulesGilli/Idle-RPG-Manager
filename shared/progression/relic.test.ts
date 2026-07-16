import { describe, expect, it } from 'vitest';
import {
  craftRelic,
  craftRelicAtRarity,
  relicRanges,
  relicRecipe,
  getRelicBase,
  RELIC_BASES,
} from './relic.ts';
import {
  getMaterialTier,
  getBossMaterial,
  FORGE_MATERIALS,
  secondaryStatPct,
  SECONDARY_STAT_MAX_PCT,
} from './forge.ts';
import { createRng } from '../combat/prng.ts';

const MAT = getMaterialTier('etoiles')!; // composant de zone puissant (tier 1, zone 10)
/** Essence astrale (zone 10) : nourrit les TROIS stats — la relique « complète ». */
const ASTRALE = getBossMaterial('essence_astrale')!;

describe('craftRelic', () => {
  it('produit une relique nommée d’après son modèle + composant, avec des PV', () => {
    const base = getRelicBase('talisman_vigueur')!;
    const relic = craftRelic(base, MAT, ASTRALE, createRng(42));
    expect(relic.item_type).toBe('relic');
    expect(relic.name).toContain('Talisman de Vigueur');
    expect(relic.name).toContain(MAT.suffix);
    expect(relic.weight).toBeNull();
    expect(relic.hp_bonus).toBeGreaterThan(0);
  });

  it('déterministe pour une même seed', () => {
    const base = getRelicBase('idole_guerre')!;
    const a = craftRelic(base, MAT, ASTRALE, createRng(123));
    const b = craftRelic(base, MAT, ASTRALE, createRng(123));
    expect(a).toEqual(b);
  });

  it('le biais oriente les stats : le talisman est surtout PV, l’idole surtout ATK', () => {
    const talisman = getRelicBase('talisman_vigueur')!;
    const idole = getRelicBase('idole_guerre')!;
    let sumHpT = 0;
    let sumAtkT = 0;
    let sumAtkI = 0;
    for (let s = 0; s < 100; s++) {
      const t = craftRelic(talisman, MAT, ASTRALE, createRng(s));
      const i = craftRelic(idole, MAT, ASTRALE, createRng(s));
      sumHpT += t.hp_bonus;
      sumAtkT += t.atk_bonus;
      sumAtkI += i.atk_bonus;
    }
    expect(sumHpT).toBeGreaterThan(sumAtkT); // talisman : PV >> ATK
    expect(sumAtkI).toBeGreaterThan(sumAtkT); // idole plus d'ATK que le talisman
  });

  it('avec une essence qui nourrit tout, la relique donne les TROIS stats', () => {
    const cases: [string, 'atk_bonus' | 'def_bonus' | 'hp_bonus'][] = [
      ['idole_guerre', 'atk_bonus'],
      ['egide_ancestrale', 'def_bonus'],
      ['talisman_vigueur', 'hp_bonus'],
    ];
    for (const [id, primaryKey] of cases) {
      const r = craftRelic(getRelicBase(id)!, MAT, ASTRALE, createRng(5));
      const others = (['atk_bonus', 'def_bonus', 'hp_bonus'] as const).filter((k) => k !== primaryKey);
      expect(r[primaryKey], id).toBeGreaterThan(0);
      // Les deux autres existent (l'essence les nourrit) mais restent secondaires.
      for (const k of others) {
        expect(r[k], `${id}.${k}`).toBeGreaterThan(0);
        expect(r[k], `${id}.${k}`).toBeLessThan(r[primaryKey]);
      }
    }
  });

  it('les stats secondaires montent avec la zone de L’ESSENCE, pas du composant', () => {
    const base = getRelicBase('idole_guerre')!; // ATK prioritaire
    const mat = getMaterialTier('etoiles')!; // composant CONSTANT : seule l'essence varie
    const titan = craftRelicAtRarity(base, mat, getBossMaterial('fragment_titan')!, 'common'); // z6, DEF
    const astrale = craftRelicAtRarity(base, mat, ASTRALE, 'common'); // z10, tout
    // Part de la DEF (secondaire) rapportée à l'ATK (prioritaire).
    expect(titan.def_bonus / titan.atk_bonus).toBeCloseTo(secondaryStatPct(6), 1);
    expect(astrale.def_bonus / astrale.atk_bonus).toBeCloseTo(SECONDARY_STAT_MAX_PCT, 1);
    expect(astrale.def_bonus).toBeGreaterThan(titan.def_bonus);
  });

  it('la prioritaire reste la prioritaire, quelle que soit la zone', () => {
    for (const matId of ['chene', 'obsidienne', 'etoiles']) {
      const r = craftRelicAtRarity(
        getRelicBase('egide_ancestrale')!,
        getMaterialTier(matId)!,
        ASTRALE,
        'ultimate',
      );
      expect(r.def_bonus, matId).toBeGreaterThan(r.atk_bonus);
      // Les PV sont sur une échelle 2× : on compare à part pour ne pas se
      // faire piéger par l'unité, mais la DEF doit rester dominante à échelle égale.
      expect(r.def_bonus, matId).toBeGreaterThan(r.hp_bonus / 2);
    }
  });

  it('un composant plus puissant → relique plus forte', () => {
    const base = getRelicBase('talisman_vigueur')!;
    const faible = craftRelic(base, getMaterialTier('chene')!, ASTRALE, createRng(7)); // zone 1
    const fort = craftRelic(base, getMaterialTier('etoiles')!, ASTRALE, createRng(7)); // zone 10
    expect(fort.hp_bonus).toBeGreaterThan(faible.hp_bonus);
  });

  it('les stats craftées restent dans la range affichée', () => {
    for (const base of RELIC_BASES) {
      for (const mat of FORGE_MATERIALS) {
        const ranges = relicRanges(base, mat, ASTRALE);
        for (let s = 0; s < 20; s++) {
          const r = craftRelic(base, mat, ASTRALE, createRng(s * 17 + 1));
          expect(r.atk_bonus).toBeGreaterThanOrEqual(ranges.atk[0]);
          expect(r.atk_bonus).toBeLessThanOrEqual(ranges.atk[1]);
          expect(r.def_bonus).toBeGreaterThanOrEqual(ranges.def[0]);
          expect(r.def_bonus).toBeLessThanOrEqual(ranges.def[1]);
          expect(r.hp_bonus).toBeGreaterThanOrEqual(ranges.hp[0]);
          expect(r.hp_bonus).toBeLessThanOrEqual(ranges.hp[1]);
        }
      }
    }
  });

  it('la recette consomme le composant de zone + fragments + sceau de donjon', () => {
    const recipe = relicRecipe(MAT, null);
    expect(recipe.gold).toBeGreaterThan(0);
    const keys = recipe.materials.map((m) => m.key);
    // Matériaux du composant de zone (ex. poussiere_etoile pour "etoiles").
    expect(keys).toContain(MAT.materials[0]!.key);
    // Matériaux de donjon.
    expect(keys).toContain('fragment_relique');
    expect(keys).toContain('sceau_catacombe');
  });

  it('une relique plus forte exige plus de fragments de relique', () => {
    const fragsOf = (matId: string) => {
      const recipe = relicRecipe(getMaterialTier(matId)!, null);
      return recipe.materials.find((m) => m.key === 'fragment_relique')!.qty;
    };
    // Coût strictement croissant de la zone 1 → 10.
    const faible = fragsOf('chene'); // zone 1
    const moyen = fragsOf('obsidienne'); // zone 5
    const fort = fragsOf('etoiles'); // zone 10
    expect(moyen).toBeGreaterThan(faible);
    expect(fort).toBeGreaterThan(moyen);
    expect(faible).toBe(5); // early game inchangé
  });
});

/**
 * L'ESSENCE DE BOSS À L'AUTEL — même règle qu'à la forge. Le commentaire de
 * `buildRelic` promettait déjà que « les deux autres sont alimentées par les
 * matériaux de BOSS » ; c'était la zone du COMPOSANT qui décidait, le boss n'y
 * était pour rien. Il l'est enfin.
 */
describe('essence de boss (reliques)', () => {
  const idole = () => getRelicBase('idole_guerre')!; // ATK prioritaire
  const talisman = () => getRelicBase('talisman_vigueur')!; // PV prioritaire

  it('sans essence, la relique est strictement MONO-STAT', () => {
    const r = craftRelicAtRarity(idole(), MAT, null, 'common');
    expect(r.atk_bonus).toBeGreaterThan(0); // la prioritaire ne dépend jamais de l'essence
    expect(r.def_bonus).toBe(0);
    expect(r.hp_bonus).toBe(0);
  });

  it('l’essence décide QUELLES stats secondaires tombent', () => {
    const titan = craftRelicAtRarity(idole(), MAT, getBossMaterial('fragment_titan')!, 'common'); // DEF
    expect(titan.def_bonus).toBeGreaterThan(0);
    expect(titan.hp_bonus).toBe(0);

    const hydre = craftRelicAtRarity(idole(), MAT, getBossMaterial('coeur_hydre')!, 'common'); // PV
    expect(hydre.hp_bonus).toBeGreaterThan(0);
    expect(hydre.def_bonus).toBe(0);
  });

  it('une essence qui ne verse que la PRIORITAIRE ne donne aucun secondaire', () => {
    // Talisman (PV prioritaire) + cœur d'hydre (PV seul) : l'essence est gâchée.
    // C'est un vrai piège de l'appariement modèle × essence, pas un bug — l'UI
    // grise ce cas, et il vaut mieux le verrouiller que le découvrir en prod.
    const r = craftRelicAtRarity(talisman(), MAT, getBossMaterial('coeur_hydre')!, 'common');
    expect(r.hp_bonus).toBeGreaterThan(0); // la prioritaire, pleine
    expect(r.atk_bonus).toBe(0);
    expect(r.def_bonus).toBe(0);
  });

  it('la prioritaire ne dépend JAMAIS de l’essence', () => {
    const nue = craftRelicAtRarity(idole(), MAT, null, 'common');
    const avec = craftRelicAtRarity(idole(), MAT, ASTRALE, 'common');
    expect(avec.atk_bonus).toBe(nue.atk_bonus);
  });

  it('l’essence choisie s’ajoute au coût — et rien sans elle', () => {
    const nue = relicRecipe(MAT, null);
    expect(nue.materials.map((m) => m.key)).not.toContain('coeur_hydre');

    const boss = getBossMaterial('coeur_hydre')!;
    const avec = relicRecipe(MAT, boss);
    expect(avec.materials).toContainEqual({ key: 'coeur_hydre', qty: boss.qty });
    // Le butin de donjon reste dû dans les deux cas.
    expect(avec.materials.map((m) => m.key)).toContain('fragment_relique');
  });
});
