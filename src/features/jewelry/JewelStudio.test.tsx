import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent, cleanup } from '@testing-library/react';
import { FORGE_MATERIALS } from '@shared/progression/forge';
import { GEMS } from '@shared/progression/jewelry';
import type { CraftedItem } from '@/features/forge/useForge';

/* Icônes Synty : SVG distants, hors sujet ici. */
vi.mock('@/components/synty/SyntyIcon', () => ({ SyntyGlyph: () => null }));
vi.mock('@/components/synty/ResourceIcon', () => ({ ResourceIcon: () => null }));
vi.mock('@/components/synty/GameIcons', () => ({
  UiIcon: () => null,
  ItemTypeIcon: () => null,
  SetPieceIcon: () => null,
  PassiveIcon: () => null,
}));

const craftJewelMutate = vi.fn();
const craftSetMutate = vi.fn();
const autoCraftMutate = vi.fn();
vi.mock('@/features/forge/useForge', () => ({
  useForge: () => ({
    craftJewel: { mutateAsync: craftJewelMutate, isPending: false },
    craftSet: { mutateAsync: craftSetMutate, isPending: false },
    autoCraft: { mutateAsync: autoCraftMutate, isPending: false },
  }),
}));

let jewelXp = 0;
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ data: { gold: 9_999_999, jewel_xp: jewelXp } }),
}));
vi.mock('@/features/release/useRelease', () => ({ useRelease: () => ({ released: true }) }));

/* Ressources à gogo : on teste l'établi, pas l'économie. */
const RES: Record<string, number> = {};
for (const m of FORGE_MATERIALS) for (const x of m.materials) RES[x.key] = 9999;
for (const g of GEMS) RES[g.id] = 99;
vi.mock('@/hooks/useResources', () => ({ useResources: () => ({ data: RES }) }));

/* Arc 1 par défaut (évite le vrai client Supabase, hors sujet ici). */
vi.mock('@/features/arc/useArc', () => ({
  useArc: () => ({ currentArc: 1, maxArc: 1, switchArc: vi.fn(), isSwitching: false }),
}));

const { JewelStudio } = await import('./JewelStudio');

let seq = 0;
function jewel(rarity: string, pct = 12): CraftedItem {
  seq += 1;
  return {
    id: `id-${rarity}-${seq}`,
    name: `Amulette ${rarity}`,
    rarity,
    item_type: 'jewel',
    tier: 1,
    atk_bonus: 0,
    def_bonus: 0,
    hp_bonus: 0,
    passive_type: 'regen',
    passive_value: pct,
  };
}

/** XP total pour atteindre `level` (cf. jewelXpStep = 80 + 40·level). */
function xpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += 80 + 40 * l;
  return total;
}

const gemCard = () => screen.getByRole('button', { name: /^Gemme de Sève ×/ });
const matCard = () => screen.getByRole('button', { name: /^Chêne T1/ });

/** Traverse le rituel jusqu'à l'établi : gemme → composant → sertir. */
function goToBench(): HTMLElement {
  fireEvent.click(gemCard());
  fireEvent.click(matCard());
  return screen.getByLabelText('Sertir la gemme');
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jewelXp = 0;
  craftJewelMutate.mockReset();
  craftSetMutate.mockReset();
  autoCraftMutate.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('JewelStudio — le rituel', () => {
  it('enchaîne gemme → composant → établi', () => {
    render(<JewelStudio />);
    expect(screen.queryByLabelText('Sertir la gemme')).toBeNull();
    fireEvent.click(gemCard());
    fireEvent.click(matCard());
    expect(screen.getByLabelText('Sertir la gemme')).toBeInTheDocument();
  });

  // Plancher à DEUX passes : la première ne doit jamais rendre son verdict.
  it('un « poor » demande DEUX passes', async () => {
    craftJewelMutate.mockResolvedValue({ item: jewel('poor'), jewel_xp: 5 });
    render(<JewelStudio />);
    const bench = goToBench();

    fireEvent.click(bench); // 1 : lance le sertissage, ne révèle rien
    await flush();
    expect(craftJewelMutate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Amulette poor')).toBeNull();

    fireEvent.click(bench); // 2 → reveal
    await waitFor(() => expect(screen.getByText('Amulette poor')).toBeInTheDocument());
  });

  it('un « ultimate » exige SIX passes — il ne se révèle pas avant', async () => {
    craftJewelMutate.mockResolvedValue({ item: jewel('ultimate', 30), jewel_xp: 5 });
    render(<JewelStudio />);
    const bench = goToBench();

    fireEvent.click(bench); // 1 : lance le sertissage
    await flush();
    expect(craftJewelMutate).toHaveBeenCalledTimes(1);

    fireEvent.click(bench); // 2
    fireEvent.click(bench); // 3
    fireEvent.click(bench); // 4
    fireEvent.click(bench); // 5
    expect(screen.queryByText('Amulette ultimate')).toBeNull();

    fireEvent.click(bench); // 6 → reveal
    await waitFor(() => expect(screen.getByText('Amulette ultimate')).toBeInTheDocument());
    // Un seul craft pour six passes : les passes sont de la mise en scène.
    expect(craftJewelMutate).toHaveBeenCalledTimes(1);
  });

  it('rend le bijou même si le joueur lâche l’établi', async () => {
    vi.useFakeTimers();
    craftJewelMutate.mockResolvedValue({ item: jewel('advanced'), jewel_xp: 5 });
    render(<JewelStudio />);
    fireEvent.click(goToBench());
    await flush();
    expect(screen.queryByText('Amulette advanced')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('Amulette advanced')).toBeInTheDocument();
  });
});

describe('JewelStudio — auto-sertissage', () => {
  it('reste verrouillé sous le Nv.8 et annonce le palier', () => {
    jewelXp = 0;
    render(<JewelStudio />);
    goToBench();
    expect(screen.getByText(/débloquée à la maîtrise Nv\./i)).toBeInTheDocument();
    expect(screen.queryByText(/Auto →/)).toBeNull();
  });

  it('apparaît au Nv.8', () => {
    jewelXp = xpForLevel(8);
    render(<JewelStudio />);
    goToBench();
    expect(screen.getByText(/Auto →/)).toBeInTheDocument();
  });

  it('journalise toute la série avec le passif de chaque bijou', async () => {
    jewelXp = xpForLevel(8);
    autoCraftMutate.mockResolvedValueOnce({
      items: [jewel('poor', 4), jewel('advanced', 18)],
      attempts: 2,
      reached: true,
      xp_gain: 10,
      stopped: null,
    });
    render(<JewelStudio />);
    goToBench();

    fireEvent.click(screen.getByText(/Auto →/));

    await waitFor(() => expect(screen.getByText('Résultat de la série')).toBeInTheDocument());
    expect(screen.getByText('Amulette poor')).toBeInTheDocument();
    expect(screen.getByText('Amulette advanced')).toBeInTheDocument();
    // Un bijou n'a pas de stats brutes : sa ligne, c'est son passif.
    expect(screen.getByText('18%')).toBeInTheDocument();
    // UN appel pour toute la série : la boucle vit côté serveur.
    expect(autoCraftMutate).toHaveBeenCalledTimes(1);
    // La gemme fait partie du plan : sans elle, le serveur ne sait pas quoi sertir.
    expect(autoCraftMutate.mock.calls[0]![0]).toMatchObject({ kind: 'jewel' });
    expect(autoCraftMutate.mock.calls[0]![0].gemId).toBeTruthy();
  });
});

describe('JewelStudio — slots', () => {
  it('l’onglet Sets ne propose que des bijoux', () => {
    render(<JewelStudio />);
    fireEvent.click(screen.getByRole('button', { name: 'Sets' }));

    expect(screen.getByRole('button', { name: /^Sceau du Colosse/ })).toBeInTheDocument();
    // Marteau (arme) et Cœur (relique) appartiennent à la Forge et à l'Autel.
    expect(screen.queryByRole('button', { name: /^Marteau du Colosse/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Cœur du Colosse/ })).toBeNull();
  });
});
