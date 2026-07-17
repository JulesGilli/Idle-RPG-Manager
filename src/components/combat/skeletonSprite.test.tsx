import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SkeletonSprite, skeletonVariant, type SkeletonVariant } from './FighterSprite';

describe('skeletonVariant (nom → style)', () => {
  const cases: [string, SkeletonVariant][] = [
    ['Guerrier squelette', { kind: 'melee', tier: 'minion' }],
    ['Archer squelette', { kind: 'ranged', tier: 'minion' }],
    ['Mage squelette', { kind: 'caster', tier: 'minion' }],
    ['Champion squelette', { kind: 'melee', tier: 'hero' }],
    ["Archer d'élite squelette", { kind: 'ranged', tier: 'hero' }],
    ['Archimage squelette', { kind: 'caster', tier: 'hero' }],
    ['Créature mortuaire', { kind: 'melee', tier: 'colossus' }],
  ];
  it.each(cases)('%s', (name, expected) => {
    expect(skeletonVariant(name)).toEqual(expected);
  });
});

describe('SkeletonSprite — rendus distincts par variante', () => {
  const markup = (v: SkeletonVariant) =>
    renderToStaticMarkup(<svg>{SkeletonSprite({ variant: v, idle: false })}</svg>);

  it('produit un rendu non vide pour chaque variante', () => {
    for (const kind of ['melee', 'ranged', 'caster'] as const) {
      for (const tier of ['minion', 'hero', 'colossus'] as const) {
        expect(markup({ kind, tier }).length).toBeGreaterThan(50);
      }
    }
  });

  it('le colosse, le héros et le sbire sont visuellement différents', () => {
    const minion = markup({ kind: 'melee', tier: 'minion' });
    const hero = markup({ kind: 'melee', tier: 'hero' });
    const colossus = markup({ kind: 'melee', tier: 'colossus' });
    expect(hero).not.toBe(minion); // couronne + cape en plus
    expect(colossus).not.toBe(minion);
    expect(colossus).not.toBe(hero);
  });

  it('les trois rôles (mêlée/distance/mage) diffèrent par leur arme', () => {
    const melee = markup({ kind: 'melee', tier: 'minion' });
    const ranged = markup({ kind: 'ranged', tier: 'minion' });
    const caster = markup({ kind: 'caster', tier: 'minion' });
    expect(new Set([melee, ranged, caster]).size).toBe(3);
  });
});
