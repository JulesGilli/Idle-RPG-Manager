import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { HeroView } from './useHeroes';

/* StatsPanel n'appelle aucun hook réseau lui-même, mais HeroScreen.tsx (son
 * module) importe useHeroes.ts qui importe le vrai client Supabase, évalué
 * dès l'import (throw si .env absent) — on le mocke pour isoler le rendu. */
vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('@/components/synty/SyntyIcon', () => ({
  SyntyGlyph: () => null,
  SyntyImg: () => null,
}));
vi.mock('@/components/synty/GameIcons', () => ({
  UiIcon: () => null,
  EquipmentIcon: () => null,
  PassiveIcon: () => null,
  SkillNodeIcon: () => null,
}));

const { StatsPanel } = await import('./HeroScreen');

function makeHero(overrides: Partial<HeroView> = {}): HeroView {
  return {
    id: 'h1',
    name: 'Aldric',
    classId: 'guerrier',
    className: 'Guerrier',
    level: 10,
    xp: 0,
    xpToNext: 100,
    stats: { hp: 800, atk: 60, def: 30, speed: 12 },
    statBreakdown: {
      hp: { base: 500, alloc: 100, gear: 200 },
      atk: { base: 40, alloc: 10, gear: 10 },
      def: { base: 20, alloc: 5, gear: 5 },
      speed: { base: 10, alloc: 2, gear: 0 },
    },
    power: 1000,
    statPoints: 0,
    skillPoints: 0,
    skills: {},
    activeSkillId: null,
    ultimateSkillId: null,
    classWeight: 'heavy',
    grade: 'A',
    awakened: false,
    runeId: null,
    innate: { bonus_hp: 0, bonus_atk: 0, bonus_def: 0, bonus_speed: 0 },
    alloc: { hp: 0, atk: 0, def: 0, speed: 0 },
    weapon: null,
    armor: null,
    jewel: null,
    relic: null,
    sets: [],
    ...overrides,
  };
}

describe('StatsPanel — détail de la répartition des stats', () => {
  it('affiche les 4 totaux, masque le détail par défaut', () => {
    render(<MemoryRouter><StatsPanel hero={makeHero()} /></MemoryRouter>);
    expect(screen.getByText('800')).toBeInTheDocument(); // PV
    expect(screen.getByText('60')).toBeInTheDocument(); // ATK
    expect(screen.queryByText('Base (classe + niveau)')).not.toBeInTheDocument();
  });

  it('« Voir le détail » révèle la répartition base/points/équipement, qui somme au total', () => {
    render(<MemoryRouter><StatsPanel hero={makeHero()} /></MemoryRouter>);
    fireEvent.click(screen.getByText('Voir le détail'));
    // 4 occurrences (une par stat) : base/points/équipement listés.
    expect(screen.getAllByText('Base (classe + niveau)')).toHaveLength(4);
    expect(screen.getAllByText('Points alloués')).toHaveLength(4);
    // 3, pas 4 : VIT n'a pas de bonus d'équipement (gear: 0) dans ce mock, donc
    // sa ligne « Équipement » est filtrée (cf. le test dédié juste après).
    expect(screen.getAllByText('Équipement')).toHaveLength(3);
    // PV : 500 + 100 + 200 = 800 (visible en toutes lettres, avec le signe +).
    expect(screen.getByText('+500')).toBeInTheDocument();
    expect(screen.getByText('+100')).toBeInTheDocument();
    expect(screen.getByText('+200')).toBeInTheDocument();
  });

  it('une contribution nulle (ex. VIT sans équipement) n’affiche pas de ligne « Équipement »', () => {
    render(<MemoryRouter><StatsPanel hero={makeHero()} /></MemoryRouter>);
    fireEvent.click(screen.getByText('Voir le détail'));
    // 3 lignes "Équipement" (PV/ATK/DEF) mais pas VIT, dont le gear vaut 0.
    expect(screen.getAllByText('Équipement')).toHaveLength(3);
  });
});
