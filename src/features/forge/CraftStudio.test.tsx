import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent, cleanup } from '@testing-library/react';
import { FORGE_MATERIALS } from '@shared/progression/forge';
import type { CraftedItem } from './useForge';

/* Les icônes Synty chargent des SVG distants : hors sujet ici. */
vi.mock('@/components/synty/SyntyIcon', () => ({ SyntyGlyph: () => null }));
vi.mock('@/components/synty/ResourceIcon', () => ({ ResourceIcon: () => null }));
vi.mock('@/components/synty/GameIcons', () => ({
  UiIcon: () => null,
  ItemTypeIcon: () => null,
  SetPieceIcon: () => null,
}));

const craftMutate = vi.fn();
const craftSetMutate = vi.fn();
vi.mock('./useForge', () => ({
  useForge: () => ({
    craft: { mutateAsync: craftMutate, isPending: false },
    craftSet: { mutateAsync: craftSetMutate, isPending: false },
  }),
}));

let forgeXp = 0;
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ data: { gold: 9_999_999, forge_xp: forgeXp } }),
}));

/* Toutes les ressources à gogo : on teste l'enclume, pas l'économie. */
const RES: Record<string, number> = {};
for (const m of FORGE_MATERIALS) for (const x of m.materials) RES[x.key] = 9999;
vi.mock('@/hooks/useResources', () => ({ useResources: () => ({ data: RES }) }));

const { CraftStudio } = await import('./CraftStudio');

let seq = 0;
function item(rarity: string): CraftedItem {
  seq += 1;
  return {
    id: `id-${rarity}-${seq}`,
    name: `Épée ${rarity}`,
    rarity,
    item_type: 'weapon',
    tier: 1,
    atk_bonus: 12,
    def_bonus: 0,
    hp_bonus: 0,
    passive_type: null,
    passive_value: 0,
  };
}

/** XP total pour atteindre `level` (cf. forgeXpStep = 80 + 40·level). */
function xpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += 80 + 40 * l;
  return total;
}

/* Le stepper réaffiche le plan et le matériau choisis : on cible les CARTES par
   leur nom accessible, sinon getByText en trouve deux. */
const planCard = () => screen.getByRole('button', { name: /^Grande épée ATK/ });
const matCard = () => screen.getByRole('button', { name: /^Chêne T1/ });

/** Traverse le rituel jusqu'à l'enclume : plan → matériau → forger. */
function goToAnvil(): HTMLElement {
  fireEvent.click(planCard());
  fireEvent.click(matCard());
  return screen.getByLabelText("Frapper l'enclume");
}

/** Laisse les promesses en attente se résoudre. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  forgeXp = 0;
  craftMutate.mockReset();
  craftSetMutate.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CraftStudio — le rituel', () => {
  it('enchaîne plan → matériau → enclume', () => {
    render(<CraftStudio />);

    // Étape 1 : les plans sont là, pas l'enclume.
    expect(screen.queryByLabelText("Frapper l'enclume")).toBeNull();
    fireEvent.click(planCard());

    // Étape 2 : les matériaux.
    expect(matCard()).toBeInTheDocument();
    fireEvent.click(matCard());

    // Étape 3 : l'enclume.
    expect(screen.getByLabelText("Frapper l'enclume")).toBeInTheDocument();
  });

  it('affiche le profil de chaque plan — le vrai critère de choix', () => {
    render(<CraftStudio />);

    // Grande épée : ATK + PV (bias.hp = 0.6).
    expect(screen.getByRole('button', { name: /^Grande épée ATK \+ PV/ })).toBeInTheDocument();
    // Marteau : ATK + DEF (bias.def = 0.5).
    expect(screen.getByRole('button', { name: /^Marteau de guerre ATK \+ DEF/ })).toBeInTheDocument();
    // Épée : aucune secondaire → dégâts purs, et c'est dit.
    expect(screen.getByRole('button', { name: /^Épée ATK dégâts purs/ })).toBeInTheDocument();
    // Arc / Dague : leur secondaire est un PASSIF, pas une stat.
    expect(screen.getByRole('button', { name: /^Arc ATK \+ Critique/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Dague ATK \+ Esquive/ })).toBeInTheDocument();
    // L'amplificateur de type est enfin visible (Bâton = soin, sa raison d'être).
    expect(screen.getByRole('button', { name: /^Bâton ATK dégâts purs Soin \+22%/ })).toBeInTheDocument();
  });

  it('un « poor » se révèle en UN coup', async () => {
    craftMutate.mockResolvedValue({ item: item('poor'), forge_xp: 7 });
    render(<CraftStudio />);
    const anvil = goToAnvil();

    fireEvent.click(anvil);

    expect(craftMutate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('Épée poor')).toBeInTheDocument());
  });

  it('un « ultimate » exige CINQ coups — il ne se révèle pas avant', async () => {
    craftMutate.mockResolvedValue({ item: item('ultimate'), forge_xp: 7 });
    render(<CraftStudio />);
    const anvil = goToAnvil();

    fireEvent.click(anvil); // coup 1 : lance le craft
    await flush();
    expect(craftMutate).toHaveBeenCalledTimes(1);

    // La pièce est arrivée mais reste cachée : le suspense tient.
    fireEvent.click(anvil); // 2
    fireEvent.click(anvil); // 3
    fireEvent.click(anvil); // 4
    expect(screen.queryByText('Épée ultimate')).toBeNull();

    fireEvent.click(anvil); // 5 → reveal
    await waitFor(() => expect(screen.getByText('Épée ultimate')).toBeInTheDocument());

    // Un seul craft pour cinq coups : les coups sont de la mise en scène.
    expect(craftMutate).toHaveBeenCalledTimes(1);
  });

  it('rend la pièce même si le joueur lâche l’enclume', async () => {
    vi.useFakeTimers();
    craftMutate.mockResolvedValue({ item: item('ultimate'), forge_xp: 7 });
    render(<CraftStudio />);
    const anvil = goToAnvil();

    fireEvent.click(anvil); // 1 coup, puis le joueur s'en va
    await flush();
    expect(screen.queryByText('Épée ultimate')).toBeNull();

    // L'objet est déjà attribué côté serveur : on ne le lui retire pas.
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('Épée ultimate')).toBeInTheDocument();
  });

  it('révèle sans coup en trop si le serveur répond après les frappes', async () => {
    let resolve!: (v: { item: CraftedItem; forge_xp: number }) => void;
    craftMutate.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<CraftStudio />);
    const anvil = goToAnvil();

    // Le joueur martèle avant que le serveur ait répondu.
    fireEvent.click(anvil);
    fireEvent.click(anvil);
    fireEvent.click(anvil);

    resolve({ item: item('common'), forge_xp: 7 }); // common = 2 coups, déjà dépassés
    await flush();
    await waitFor(() => expect(screen.getByText('Épée common')).toBeInTheDocument());
  });
});

describe('CraftStudio — auto-forge', () => {
  it('reste verrouillée sous le Nv.8 et annonce le palier', () => {
    forgeXp = 0; // Nv.1
    render(<CraftStudio />);
    goToAnvil();

    expect(screen.getByText(/débloquée à la maîtrise Nv\./i)).toBeInTheDocument();
    expect(screen.queryByText(/Auto →/)).toBeNull();
  });

  it('apparaît au Nv.8', () => {
    forgeXp = xpForLevel(8);
    render(<CraftStudio />);
    goToAnvil();

    expect(screen.getByText(/Auto →/)).toBeInTheDocument();
    expect(screen.queryByText(/débloquée à la maîtrise Nv\./i)).toBeNull();
  });

  it('journalise TOUTE la série, pas seulement le dernier objet', async () => {
    forgeXp = xpForLevel(8);
    craftMutate
      .mockResolvedValueOnce({ item: item('poor'), forge_xp: 7 })
      .mockResolvedValueOnce({ item: item('common'), forge_xp: 7 })
      .mockResolvedValueOnce({ item: item('advanced'), forge_xp: 7 });
    render(<CraftStudio />);
    goToAnvil();

    fireEvent.click(screen.getByText(/Auto →/));

    await waitFor(() => expect(screen.getByText('Résultat de la série')).toBeInTheDocument());
    // Les trois objets sont listés — le joueur voit ce que sa journée a produit.
    expect(screen.getByText('Épée poor')).toBeInTheDocument();
    expect(screen.getByText('Épée common')).toBeInTheDocument();
    expect(screen.getByText('Épée advanced')).toBeInTheDocument();
    expect(craftMutate).toHaveBeenCalledTimes(3);
  });
});
