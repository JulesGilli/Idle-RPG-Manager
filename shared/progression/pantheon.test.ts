import { describe, expect, it } from 'vitest';
import {
  validatePantheonTeams,
  pantheonSeriesWin,
  pantheonAllHeroes,
  PANTHEON_TEAMS,
  PANTHEON_TEAM_SIZE,
  PANTHEON_ROSTER,
} from './pantheon.ts';

/** Compo valide générée à la volée : 5 équipes de 3 héros tous distincts. */
function validTeams(): string[][] {
  return Array.from({ length: PANTHEON_TEAMS }, (_, t) =>
    Array.from({ length: PANTHEON_TEAM_SIZE }, (_, h) => `h${t}-${h}`),
  );
}

describe('Panthéon — validation des équipes', () => {
  it('accepte 5 équipes de 3 héros tous distincts', () => {
    expect(validatePantheonTeams(validTeams())).toEqual({ ok: true });
    expect(pantheonAllHeroes(validTeams())).toHaveLength(PANTHEON_ROSTER);
  });

  it('refuse un mauvais nombre d’équipes', () => {
    expect(validatePantheonTeams(validTeams().slice(0, 4)).ok).toBe(false);
    expect(validatePantheonTeams([...validTeams(), ['a', 'b', 'c']]).ok).toBe(false);
  });

  it('refuse une équipe qui n’a pas 3 héros', () => {
    const t = validTeams();
    t[2] = ['x', 'y'];
    expect(validatePantheonTeams(t).ok).toBe(false);
  });

  it('refuse un même héros dans deux équipes', () => {
    const t = validTeams();
    t[4]![0] = t[0]![0]!; // doublon entre l'équipe 5 et l'équipe 1
    const v = validatePantheonTeams(t);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/deux équipes/);
  });

  it('refuse un doublon DANS une équipe', () => {
    const t = validTeams();
    t[1] = ['dup', 'dup', 'z'];
    expect(validatePantheonTeams(t).ok).toBe(false);
  });

  it('refuse un id vide ou non-string', () => {
    const t = validTeams();
    t[0]![1] = '';
    expect(validatePantheonTeams(t).ok).toBe(false);
  });
});

describe('Panthéon — issue de la série (majorité sur 5)', () => {
  it('3 manches gagnées sur 5 = victoire', () => {
    expect(pantheonSeriesWin([true, true, true, false, false])).toBe(true);
    expect(pantheonSeriesWin([false, true, false, true, true])).toBe(true);
  });

  it('2 manches ou moins = défaite', () => {
    expect(pantheonSeriesWin([true, true, false, false, false])).toBe(false);
    expect(pantheonSeriesWin([false, false, false, false, false])).toBe(false);
  });

  it('balaye 5-0', () => {
    expect(pantheonSeriesWin([true, true, true, true, true])).toBe(true);
  });
});
