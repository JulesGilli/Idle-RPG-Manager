import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent, cleanup } from '@testing-library/react';
import { FORGE_MATERIALS } from '@shared/progression/forge';
import type { CraftedItem } from '@/features/forge/useForge';

/* Icônes Synty : SVG distants, hors sujet ici. */
vi.mock('@/components/synty/SyntyIcon', () => ({ SyntyGlyph: () => null }));
vi.mock('@/components/synty/ResourceIcon', () => ({ ResourceIcon: () => null }));
vi.mock('@/components/synty/GameIcons', () => ({
  UiIcon: () => null,
  RelicIcon: () => null,
  SetPieceIcon: () => null,
}));

const craftRelicMutate = vi.fn();
const craftSetMutate = vi.fn();
const autoCraftMutate = vi.fn();
vi.mock('@/features/forge/useForge', () => ({
  useForge: () => ({
    craftRelic: { mutateAsync: craftRelicMutate, isPending: false },
    craftSet: { mutateAsync: craftSetMutate, isPending: false },
    autoCraft: { mutateAsync: autoCraftMutate, isPending: false },
  }),
}));

let relicXp = 0;
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ data: { gold: 9_999_999, relic_xp: relicXp } }),
}));
vi.mock('@/features/release/useRelease', () => ({ useRelease: () => ({ released: true }) }));

/* Ressources à gogo : on teste l'autel, pas l'économie. */
const RES: Record<string, number> = {};
for (const m of FORGE_MATERIALS) for (const x of m.materials) RES[x.key] = 9999;
RES['fragment_relique'] = 9999;
RES['sceau_catacombe'] = 9999;
vi.mock('@/hooks/useResources', () => ({ useResources: () => ({ data: RES }) }));

/* Arc 1 par défaut (évite le vrai client Supabase, hors sujet ici). */
vi.mock('@/features/arc/useArc', () => ({
  useArc: () => ({ currentArc: 1, maxArc: 1, switchArc: vi.fn(), isSwitching: false }),
}));

const { RelicStudio } = await import('./RelicStudio');

let seq = 0;
function relic(rarity: string): CraftedItem {
  seq += 1;
  return {
    id: `id-${rarity}-${seq}`,
    name: `Idole ${rarity}`,
    rarity,
    item_type: 'relic',
    tier: 1,
    atk_bonus: 40,
    def_bonus: 6,
    hp_bonus: 12,
    passive_type: null,
    passive_value: 0,
  };
}

/** XP total pour atteindre `level` (cf. relicXpStep = 80 + 40·level). */
function xpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += 80 + 40 * l;
  return total;
}

const planCard = () => screen.getByRole('button', { name: /^Idole de Guerre ATK prioritaire/ });
const matCard = () => screen.getByRole('button', { name: /^Chêne T1/ });

/** Traverse le rituel jusqu'à l'autel : plan → composant → consacrer. */
function goToAltar(): HTMLElement {
  fireEvent.click(planCard());
  fireEvent.click(matCard());
  return screen.getByLabelText('Consacrer la relique');
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  relicXp = 0;
  craftRelicMutate.mockReset();
  craftSetMutate.mockReset();
  autoCraftMutate.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('RelicStudio — le rituel', () => {
  it('enchaîne plan → composant → autel', () => {
    render(<RelicStudio />);
    expect(screen.queryByLabelText('Consacrer la relique')).toBeNull();
    fireEvent.click(planCard());
    fireEvent.click(matCard());
    expect(screen.getByLabelText('Consacrer la relique')).toBeInTheDocument();
  });

  it('annonce la stat prioritaire de chaque modèle — le seul critère de choix', () => {
    render(<RelicStudio />);
    expect(screen.getByRole('button', { name: /^Idole de Guerre ATK prioritaire/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Égide Ancestrale DEF prioritaire/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Talisman de Vigueur PV prioritaire/ })).toBeInTheDocument();
  });

  // Plancher à DEUX passes : la première ne doit jamais rendre son verdict.
  it('un « poor » demande DEUX passes', async () => {
    craftRelicMutate.mockResolvedValue({ item: relic('poor'), relic_xp: 9 });
    render(<RelicStudio />);
    const altar = goToAltar();

    fireEvent.click(altar); // 1 : lance le façonnage, ne révèle rien
    await flush();
    expect(craftRelicMutate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Idole poor')).toBeNull();

    fireEvent.click(altar); // 2 → reveal
    await waitFor(() => expect(screen.getByText('Idole poor')).toBeInTheDocument());
  });

  it('un « ultimate » exige SIX passes — il ne se révèle pas avant', async () => {
    craftRelicMutate.mockResolvedValue({ item: relic('ultimate'), relic_xp: 9 });
    render(<RelicStudio />);
    const altar = goToAltar();

    fireEvent.click(altar); // 1 : lance le façonnage
    await flush();
    expect(craftRelicMutate).toHaveBeenCalledTimes(1);

    fireEvent.click(altar); // 2
    fireEvent.click(altar); // 3
    fireEvent.click(altar); // 4
    fireEvent.click(altar); // 5
    expect(screen.queryByText('Idole ultimate')).toBeNull();

    fireEvent.click(altar); // 6 → reveal
    await waitFor(() => expect(screen.getByText('Idole ultimate')).toBeInTheDocument());
    // Un seul craft pour six passes : les passes sont de la mise en scène.
    expect(craftRelicMutate).toHaveBeenCalledTimes(1);
  });

  it('rend la relique même si le joueur lâche l’autel', async () => {
    vi.useFakeTimers();
    craftRelicMutate.mockResolvedValue({ item: relic('advanced'), relic_xp: 9 });
    render(<RelicStudio />);
    fireEvent.click(goToAltar());
    await flush();
    expect(screen.queryByText('Idole advanced')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('Idole advanced')).toBeInTheDocument();
  });
});

describe('RelicStudio — auto-façonnage', () => {
  it('reste verrouillé sous le Nv.8 et annonce le palier', () => {
    relicXp = 0;
    render(<RelicStudio />);
    goToAltar();
    expect(screen.getByText(/débloquée à la maîtrise Nv\./i)).toBeInTheDocument();
    expect(screen.queryByText(/Auto →/)).toBeNull();
  });

  it('apparaît au Nv.8', () => {
    relicXp = xpForLevel(8);
    render(<RelicStudio />);
    goToAltar();
    expect(screen.getByText(/Auto →/)).toBeInTheDocument();
  });

  it('journalise toute la série', async () => {
    relicXp = xpForLevel(8);
    autoCraftMutate.mockResolvedValueOnce({
      items: [relic('poor'), relic('advanced')],
      attempts: 2,
      reached: true,
      xp_gain: 18,
      stopped: null,
    });
    render(<RelicStudio />);
    goToAltar();

    fireEvent.click(screen.getByText(/Auto →/));

    await waitFor(() => expect(screen.getByText('Résultat de la série')).toBeInTheDocument());
    expect(screen.getByText('Idole poor')).toBeInTheDocument();
    expect(screen.getByText('Idole advanced')).toBeInTheDocument();
    // UN appel pour toute la série : la boucle vit côté serveur.
    expect(autoCraftMutate).toHaveBeenCalledTimes(1);
    expect(autoCraftMutate.mock.calls[0]![0]).toMatchObject({ kind: 'relic' });
  });
});

describe('RelicStudio — slots', () => {
  it('l’onglet Sets ne propose que des reliques', () => {
    render(<RelicStudio />);
    fireEvent.click(screen.getByRole('button', { name: 'Sets' }));

    expect(screen.getByRole('button', { name: /^Cœur du Colosse/ })).toBeInTheDocument();
    // Marteau (arme) et Sceau (bijou) appartiennent à la Forge et à la Joaillerie.
    expect(screen.queryByRole('button', { name: /^Marteau du Colosse/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Sceau du Colosse/ })).toBeNull();
  });
});
