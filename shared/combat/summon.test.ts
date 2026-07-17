import { describe, expect, it } from 'vitest';
import { isSummonId, summonerIdOf, summonId } from './summon.ts';

describe('convention d’id des invocations', () => {
  it('summonId encode l’invocateur, reconnu par isSummonId', () => {
    const id = summonId('hero-42', 'Squelette', 2);
    expect(id).toBe('hero-42~summon~Squelette~2');
    expect(isSummonId(id)).toBe(true);
  });

  it('summonerIdOf retrouve l’invocateur', () => {
    expect(summonerIdOf(summonId('hero-42', 'Squelette', 0))).toBe('hero-42');
  });

  it('un id normal n’est pas une invocation et se retourne tel quel', () => {
    expect(isSummonId('hero-42')).toBe(false);
    expect(summonerIdOf('hero-42')).toBe('hero-42');
  });

  it('gère un id d’invocateur contenant des tirets/uuid', () => {
    const uuid = 'a1b2-c3d4-e5';
    expect(summonerIdOf(summonId(uuid, 'Golem', 5))).toBe(uuid);
  });
});
