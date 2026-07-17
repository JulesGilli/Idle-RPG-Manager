import { describe, expect, it } from 'vitest';
import {
  activeEvent,
  isWeekend,
  parisWeekday,
  parseEventConfig,
  DEFAULT_EVENT_CONFIG,
} from './events.ts';

// Instants de référence (UTC) — Europe/Paris = UTC+2 en juillet (heure d'été).
const SAT = Date.parse('2026-07-18T12:00:00Z'); // samedi
const SUN = Date.parse('2026-07-19T12:00:00Z'); // dimanche
const MON = Date.parse('2026-07-20T12:00:00Z'); // lundi
const WED = Date.parse('2026-07-15T12:00:00Z'); // mercredi

describe('parisWeekday', () => {
  it('mappe les jours en fuseau Paris (0=dim … 6=sam)', () => {
    expect(parisWeekday(SAT)).toBe(6);
    expect(parisWeekday(SUN)).toBe(0);
    expect(parisWeekday(MON)).toBe(1);
    expect(parisWeekday(WED)).toBe(3);
  });

  it("gère le passage de minuit Paris (23h UTC un vendredi = déjà samedi à Paris l'été)", () => {
    // Vendredi 23:00 UTC = samedi 01:00 à Paris (UTC+2).
    expect(parisWeekday(Date.parse('2026-07-17T23:00:00Z'))).toBe(6);
  });
});

describe('isWeekend', () => {
  it('vrai samedi et dimanche, faux en semaine', () => {
    expect(isWeekend(SAT)).toBe(true);
    expect(isWeekend(SUN)).toBe(true);
    expect(isWeekend(MON)).toBe(false);
    expect(isWeekend(WED)).toBe(false);
  });
});

describe('activeEvent', () => {
  it('week-end : bonus de carte x2 par défaut, boss inactif', () => {
    const ev = activeEvent(SAT);
    expect(ev.kind).toBe('weekend_bonus');
    expect(ev.weekend).toBe(true);
    expect(ev.xpMult).toBe(2);
    expect(ev.goldMult).toBe(2);
    expect(ev.dropMult).toBe(2);
    expect(ev.worldBossActive).toBe(false);
  });

  it('semaine : aucun bonus (mults à 1), boss actif', () => {
    const ev = activeEvent(MON);
    expect(ev.kind).toBe('world_boss');
    expect(ev.weekend).toBe(false);
    expect(ev.xpMult).toBe(1);
    expect(ev.dropMult).toBe(1);
    expect(ev.worldBossActive).toBe(true);
  });

  it('coupe-circuit : enabled=false → tout neutre, aucun boss', () => {
    const off = { ...DEFAULT_EVENT_CONFIG, enabled: false };
    expect(activeEvent(SAT, off)).toMatchObject({ xpMult: 1, dropMult: 1, worldBossActive: false });
    expect(activeEvent(MON, off).worldBossActive).toBe(false);
  });

  it('multiplicateurs configurables', () => {
    const cfg = { ...DEFAULT_EVENT_CONFIG, weekendXpMult: 3, weekendDropMult: 1.5 };
    const ev = activeEvent(SUN, cfg);
    expect(ev.xpMult).toBe(3);
    expect(ev.dropMult).toBe(1.5);
  });

  it('ne descend jamais sous x1 même si config aberrante', () => {
    const cfg = { ...DEFAULT_EVENT_CONFIG, weekendXpMult: 0.5 };
    expect(activeEvent(SAT, cfg).xpMult).toBe(1);
  });
});

describe('parseEventConfig', () => {
  it('valeurs absentes → défauts', () => {
    expect(parseEventConfig({})).toEqual(DEFAULT_EVENT_CONFIG);
  });

  it('lit et coerce les valeurs texte de app_config', () => {
    expect(
      parseEventConfig({
        event_enabled: 'false',
        event_weekend_xp_mult: '3',
        event_weekend_drop_mult: '2.5',
      }),
    ).toMatchObject({ enabled: false, weekendXpMult: 3, weekendDropMult: 2.5 });
  });

  it('valeurs illisibles/négatives → défaut de la clé', () => {
    expect(parseEventConfig({ event_weekend_xp_mult: 'abc' }).weekendXpMult).toBe(2);
    expect(parseEventConfig({ event_weekend_drop_mult: '-1' }).weekendDropMult).toBe(2);
  });
});
