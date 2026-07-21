import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';

/* Les quatre signaux historiques (donjon/expé/taverne/bibliothèque) dépendent de
   requêtes lourdes : on les neutralise pour isoler les trois nouveaux. */
vi.mock('@/features/dungeon/useDungeon', () => ({
  useDungeonTypes: () => ({ data: [] }),
  useDungeonCooldowns: () => ({ data: { lastRunAt: {} } }),
}));
vi.mock('@/features/expedition/useExpedition', () => ({ useActiveExpeditions: () => ({ data: [] }) }));
vi.mock('@/features/heroes/useRecruit', () => ({ useTavernPool: () => ({ data: null }) }));
vi.mock('@/features/heroes/useHeroes', () => ({ useHeroes: () => ({ data: [] }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: { gold: 0 } }) }));

/* Les trois sources pilotées par les tests. */
let worldBoss: Record<string, unknown> | undefined;
let dummy: Record<string, unknown> | undefined;
let arc: Record<string, unknown> | undefined;

vi.mock('@/features/worldboss/useWorldBoss', () => ({
  useWorldBoss: () => ({ state: { data: worldBoss } }),
}));
vi.mock('@/features/pantin/useDailyDummy', () => ({
  useDummyStatus: () => ({ data: dummy }),
}));
vi.mock('@/features/arc/useArcEvent', () => ({
  useArcEvent: () => ({ state: { data: arc } }),
}));

const { useActionAlerts } = await import('./useActionAlerts');

const alerts = () => renderHook(() => useActionAlerts()).result.current;

beforeEach(() => {
  worldBoss = undefined;
  dummy = undefined;
  arc = undefined;
});
afterEach(cleanup);

describe('gommette du Boss de la Semaine', () => {
  it('s’allume quand il est frappable et pas encore frappé aujourd’hui', () => {
    worldBoss = { active: true, hittable: true, already_hit_today: false };
    expect(alerts().worldBoss).toBe(true);
  });

  it('s’éteint une fois la frappe du jour faite', () => {
    worldBoss = { active: true, hittable: true, already_hit_today: true };
    expect(alerts().worldBoss).toBe(false);
  });

  it('reste éteinte si le serveur dit « pas frappable » (jour off, event fini…)', () => {
    // On ne redevine PAS les règles du serveur : `hittable` fait autorité.
    worldBoss = { active: true, hittable: false, already_hit_today: false };
    expect(alerts().worldBoss).toBe(false);
    worldBoss = { active: false, hittable: true, already_hit_today: false };
    expect(alerts().worldBoss).toBe(false);
  });
});

describe('gommette du Pantin', () => {
  it('s’allume tant que l’entraînement du jour n’est pas fait', () => {
    dummy = { done_today: false, best_score: 0, rounds: 50 };
    expect(alerts().pantin).toBe(true);
  });

  it('s’éteint une fois fait', () => {
    dummy = { done_today: true, best_score: 10, rounds: 50 };
    expect(alerts().pantin).toBe(false);
  });

  it('reste éteinte tant que le statut n’est pas chargé (pas de faux positif)', () => {
    dummy = undefined;
    expect(alerts().pantin).toBe(false);
  });
});

describe('gommette du Boss d’arc', () => {
  it('s’allume quand une frappe est disponible', () => {
    arc = { can_hit_now: true };
    expect(alerts().arcBoss).toBe(true);
  });

  it('reste éteinte pendant le cooldown de 3 h', () => {
    arc = { can_hit_now: false, next_hit_at: '2026-07-21T23:00:00Z' };
    expect(alerts().arcBoss).toBe(false);
  });

  it('reste éteinte quand aucun event ne tourne', () => {
    arc = { event: null, can_hit_now: false };
    expect(alerts().arcBoss).toBe(false);
  });
});

describe('agrégat du hub Activités', () => {
  it('s’allume dès qu’UN des rendez-vous est en attente', () => {
    dummy = { done_today: false, best_score: 0, rounds: 50 };
    expect(alerts().activities).toBe(true);
  });

  it('reste éteint quand tout est fait', () => {
    worldBoss = { active: true, hittable: true, already_hit_today: true };
    dummy = { done_today: true, best_score: 5, rounds: 50 };
    arc = { can_hit_now: false };
    const a = alerts();
    expect(a.activities).toBe(false);
    expect(a.village).toBe(false);
  });
});
