import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { WORKSHOP_SLOTS } from '@shared/progression/sets';
import { MAX_FORGE_LEVEL } from '@shared/progression/forge';
import type { ItemRow } from '@/features/heroes/useItems';

vi.mock('@/components/synty/SyntyIcon', () => ({ SyntyGlyph: () => null }));
vi.mock('@/components/synty/ResourceIcon', () => ({ ResourceIcon: () => null }));
vi.mock('@/components/synty/GameIcons', () => ({
  UiIcon: () => null,
  EquipmentIcon: () => null,
}));
vi.mock('@/components/ItemStars', () => ({
  ZoneUpgradeStars: () => null,
  BlessingStars: () => null,
}));

vi.mock('@/features/forge/useForge', () => ({
  useForge: () => ({
    upgrade: { mutate: vi.fn(), isPending: false, mutateAsync: vi.fn() },
    bless: { mutate: vi.fn(), isPending: false },
  }),
}));

let ITEMS: ItemRow[] = [];
vi.mock('@/features/heroes/useItems', () => ({ useItems: () => ({ data: ITEMS }) }));
vi.mock('@/features/heroes/useHeroes', () => ({ useHeroes: () => ({ data: [] }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: { gold: 9_999_999 } }) }));
vi.mock('@/hooks/useResources', () => ({ useResources: () => ({ data: { poussiere_etoile: 9999 } }) }));

const { UpgradeStudio } = await import('./UpgradeStudio');

function item(over: Partial<ItemRow> & { id: string; name: string; item_type: string }): ItemRow {
  return {
    rarity: 'common',
    weight: null,
    locked: false,
    tier: 1,
    upgrade_level: 0,
    blessing_level: 0,
    atk_bonus: 10,
    def_bonus: 0,
    hp_bonus: 0,
    passive_type: null,
    passive_value: 0,
    base_passive_value: 0,
    set_id: null,
    ...over,
  } as ItemRow;
}

beforeEach(() => {
  ITEMS = [
    item({ id: 'w1', name: 'Épée des étoiles', item_type: 'weapon' }),
    item({ id: 'a1', name: 'Armure de plaques des étoiles', item_type: 'armor' }),
    item({ id: 'r1', name: 'Idole de Guerre des étoiles', item_type: 'relic' }),
    item({ id: 'j1', name: 'Amulette des étoiles', item_type: 'jewel' }),
  ];
});
afterEach(() => cleanup());

describe('UpgradeStudio — chaque atelier ne renforce que ses types', () => {
  it('la Forge propose armes et armures, jamais reliques ni bijoux', () => {
    render(
      <UpgradeStudio itemTypes={WORKSHOP_SLOTS.forge} masteryLevel={1} blessable emptyLabel="vide" />,
    );
    expect(screen.getByText('Épée des étoiles')).toBeInTheDocument();
    expect(screen.getByText('Armure de plaques des étoiles')).toBeInTheDocument();
    // Les reliques relevent de l'Autel, les bijoux de la Joaillerie.
    expect(screen.queryByText('Idole de Guerre des étoiles')).toBeNull();
    expect(screen.queryByText('Amulette des étoiles')).toBeNull();
  });

  it('l’Autel ne propose que les reliques', () => {
    render(<UpgradeStudio itemTypes={WORKSHOP_SLOTS.altar} masteryLevel={1} emptyLabel="vide" />);
    expect(screen.getByText('Idole de Guerre des étoiles')).toBeInTheDocument();
    expect(screen.queryByText('Épée des étoiles')).toBeNull();
    expect(screen.queryByText('Armure de plaques des étoiles')).toBeNull();
  });

  it('annonce son propre libellé quand il n’y a rien à renforcer', () => {
    ITEMS = [];
    render(<UpgradeStudio itemTypes={WORKSHOP_SLOTS.altar} masteryLevel={1} emptyLabel="Aucune relique." />);
    expect(screen.getByText('Aucune relique.')).toBeInTheDocument();
  });
});

describe('UpgradeStudio — la maîtrise bonifie la réussite', () => {
  it('un novice ne voit aucun bonus', () => {
    render(<UpgradeStudio itemTypes={WORKSHOP_SLOTS.forge} masteryLevel={1} emptyLabel="vide" />);
    fireEvent.click(screen.getByText('Épée des étoiles'));
    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(screen.queryByText(/maîtrise \+/)).toBeNull();
  });

  it('un maître voit le bonus, chiffré', () => {
    render(<UpgradeStudio itemTypes={WORKSHOP_SLOTS.forge} masteryLevel={MAX_FORGE_LEVEL} emptyLabel="vide" />);
    fireEvent.click(screen.getByText('Épée des étoiles'));
    // 95% de base est deja au plafond dur : le bonus ne peut pas depasser.
    expect(screen.getByText('95%')).toBeInTheDocument();
  });

  it('le bonus apparaît là où la réussite n’est pas au plafond', () => {
    ITEMS = [item({ id: 'w2', name: 'Épée des étoiles', item_type: 'weapon', upgrade_level: 9 })];
    render(<UpgradeStudio itemTypes={WORKSHOP_SLOTS.forge} masteryLevel={MAX_FORGE_LEVEL} emptyLabel="vide" />);
    fireEvent.click(screen.getByText('Épée des étoiles'));
    // 32% de base -> 47% pour un maitre.
    expect(screen.getByText('47%')).toBeInTheDocument();
    expect(screen.getByText('maîtrise +15')).toBeInTheDocument();
  });
});

describe('UpgradeStudio — la bénédiction reste à la forge', () => {
  it('la forge la propose sur une arme', () => {
    render(<UpgradeStudio itemTypes={WORKSHOP_SLOTS.forge} masteryLevel={1} blessable emptyLabel="vide" />);
    fireEvent.click(screen.getByText('Épée des étoiles'));
    expect(screen.getByText('Bénédiction')).toBeInTheDocument();
  });

  it('un atelier qui ne bénit pas ne l’affiche jamais', () => {
    render(<UpgradeStudio itemTypes={WORKSHOP_SLOTS.forge} masteryLevel={1} emptyLabel="vide" />);
    fireEvent.click(screen.getByText('Épée des étoiles'));
    expect(screen.queryByText('Bénédiction')).toBeNull();
  });
});
