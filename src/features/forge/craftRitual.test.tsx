import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCraftRitual, MIN_HITS, MAX_HITS, HITS_BY_RARITY } from './craftRitual';
import type { CraftedItem } from './useForge';

const item = (rarity: string): CraftedItem => ({
  id: 'x',
  name: 'Test',
  rarity,
  item_type: 'epee',
  tier: 1,
  atk_bonus: 0,
  def_bonus: 0,
  hp_bonus: 0,
  passive_type: null,
  passive_value: 0,
});

describe('useCraftRitual — spam-click pendant le vol de la requête', () => {
  it('plafonne les frappes à MIN_HITS tant que la rareté est inconnue', () => {
    // Ne se résout jamais dans ce test : on veut rester dans l'état "en vol".
    const craft = vi.fn(() => new Promise<{ item: CraftedItem; xp: number | null }>(() => {}));
    const { result } = renderHook(() => useCraftRitual(craft, true));

    // Spam de 10 clics avant toute réponse serveur.
    // Chaque clic est un événement DISCRET dans un vrai navigateur (le clic
    // suivant ne part qu'une fois le rendu précédent flush) : on les enveloppe
    // un par un, sinon un unique batch verrait `hits` figé à sa valeur de
    // rendu initiale pour les 10 appels — un artefact de test, pas la réalité.
    for (let i = 0; i < 10; i++) act(() => result.current.strike());

    // La rareté est encore inconnue : la jauge ne doit JAMAIS avoir dépassé le
    // plancher, quel que soit le nombre de clics envoyés dans l'intervalle.
    expect(result.current.hits).toBe(MIN_HITS);
    expect(result.current.hits).toBeLessThan(MAX_HITS);
  });

  it('un objet MÉDIOCRE se révèle sans jauge pleine, même après un spam massif', async () => {
    let resolveCraft: (v: { item: CraftedItem; xp: number | null }) => void = () => {};
    const craft = vi.fn(
      () =>
        new Promise<{ item: CraftedItem; xp: number | null }>((res) => {
          resolveCraft = res;
        }),
    );
    const { result } = renderHook(() => useCraftRitual(craft, true));

    for (let i = 0; i < 15; i++) act(() => result.current.strike());
    // Le serveur répond enfin : objet le plus faible, qui n'exige que MIN_HITS.
    await act(async () => {
      resolveCraft({ item: item('poor'), xp: 5 });
      await Promise.resolve();
    });

    expect(result.current.crafted?.rarity).toBe('poor');
    // La révélation d'un objet médiocre ne doit JAMAIS être passée par une
    // jauge pleine (MAX_HITS) — avant le correctif, le spam la faisait
    // grimper jusque-là avant même que le serveur ait répondu.
    expect(HITS_BY_RARITY.poor).toBeLessThan(MAX_HITS);
  });

  it('un objet ULTIME continue d’exiger le plein de frappes APRÈS la réponse serveur', async () => {
    let resolveCraft: (v: { item: CraftedItem; xp: number | null }) => void = () => {};
    const craft = vi.fn(
      () =>
        new Promise<{ item: CraftedItem; xp: number | null }>((res) => {
          resolveCraft = res;
        }),
    );
    const { result } = renderHook(() => useCraftRitual(craft, true));

    // Spam pendant le vol : plafonné à MIN_HITS, comme toujours.
    for (let i = 0; i < 8; i++) act(() => result.current.strike());
    expect(result.current.hits).toBe(MIN_HITS);

    await act(async () => {
      resolveCraft({ item: item('ultimate'), xp: 50 });
      await Promise.resolve();
    });

    // Rareté connue mais pas encore assez frappée : pas de révélation instantanée.
    expect(result.current.crafted).toBeNull();
    expect(result.current.pending?.rarity).toBe('ultimate');

    // Les frappes reprennent normalement une fois la rareté connue. `crafted`
    // marque la révélation : la dernière frappe remet `hits` à 0, donc la
    // condition doit aussi s'arrêter là — sinon boucle infinie une fois révélé.
    while (!result.current.crafted) act(() => result.current.strike());
    expect(result.current.crafted?.rarity).toBe('ultimate');
  });
});
