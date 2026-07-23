import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import type { CombatantInput } from './types.ts';

/**
 * `oath_link` (set Lien Maudit, arc 2) : les ennemis FRAPPÉS sont liés, et toute
 * blessure d'un lié se répercute sur les autres liés.
 *
 * ⚠️ LIMITE STRUCTURELLE, vérifiée ici : les héros font du FOCUS FIRE. Un porteur
 * qui tape une seule cible à la fois ne lie donc qu'un ennemi, et n'a personne à
 * qui répercuter. Le Serment n'existe qu'associé à une source MULTI-CIBLES
 * (Volée, AoE). Ce n'est pas un bug — c'est sa condition d'emploi, et les tests
 * le figent pour qu'on ne « corrige » pas ce comportement par erreur.
 */
const OATH: CombatantInput['abilities'] = [{ kind: 'oath_link', ratio: 0.2 }];
const MULTI = { kind: 'multi_shot' as const, chance: 1, extraTargets: 2 };

const hero = (abilities: CombatantInput['abilities'] = []): CombatantInput => ({
  id: 'h1', name: 'Lieur', role: 'dps', hp: 200_000, atk: 1000, def: 0, speed: 20, abilities,
});
const mob = (i: number): CombatantInput => ({
  id: `e${i}`, name: `Mob ${i}`, role: 'enemy', hp: 20_000, atk: 5, def: 0, speed: 1,
});

function run(abilities: CombatantInput['abilities'], nbMobs = 4) {
  const enemies = Array.from({ length: nbMobs }, (_, i) => mob(i + 1));
  // Combat volontairement COURT : si le héros nettoie tout, les totaux tombent
  // à zéro des deux côtés et la comparaison ne prouve plus rien.
  const c = resolveCombat({ allies: [hero(abilities)], enemies, seed: 4, maxRounds: 6 });
  return {
    totalEnemyHp: c.finalState.filter((f) => f.id.startsWith('e')).reduce((s, f) => s + f.hp, 0),
    liens: c.events.filter((e) => (e as { message?: string }).message?.includes('Serment')).length,
    rounds: c.rounds,
    result: c.result,
  };
}

describe('oath_link — le Serment', () => {
  it('TERMINE : la propagation ne boucle pas à l’infini', () => {
    // Le vrai risque de cet effet. Sans le garde-fou de ré-entrance, A blesse B
    // qui re-blesse A… et cet appel ne rendrait jamais la main. Qu'il retourne
    // un résultat EST le test.
    const r = run([...OATH, MULTI], 5);
    expect(['win', 'loss', 'draw']).toContain(r.result);
    expect(r.rounds).toBeGreaterThan(0);
  });

  it('répercute réellement, et fait tomber les ennemis plus vite', () => {
    const sans = run([MULTI], 4);
    const avec = run([...OATH, MULTI], 4);
    expect(sans.liens).toBe(0); // le témoin ne doit RIEN répercuter
    expect(avec.liens).toBeGreaterThan(0);
    expect(avec.totalEnemyHp).toBeLessThan(sans.totalEnemyHp);
  });

  it('sans source multi-cibles, il ne se passe RIEN (focus fire → un seul lié)', () => {
    // Comportement assumé, figé pour qu'il ne soit pas pris pour une régression.
    expect(run(OATH, 4).liens).toBe(0);
    expect(run(OATH, 4).totalEnemyHp).toBe(run([], 4).totalEnemyHp);
  });

  it('contre un ennemi SEUL, il n’apporte rien (personne à qui répercuter)', () => {
    expect(run([...OATH, MULTI], 1).liens).toBe(0);
  });
});
