import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import { computeAbilities } from '../progression/skills.ts';
import type { Ability, CombatantInput } from './types.ts';

const foe = (): CombatantInput => ({
  id: 'e1', name: 'Ennemi', role: 'enemy', hp: 200_000, atk: 10, def: 5, speed: 1,
});
const necro = (abilities: Ability[]): CombatantInput => ({
  id: 'n', name: 'Nécromancien', role: 'dps', hp: 9000, atk: 80, def: 20, speed: 12, abilities,
});
const avatarRound = (skills: Record<string, number>, activeId: string | null): number | null => {
  const abilities = computeAbilities('necromancien', skills, { activeId, ultimateId: 'n_leg_avatar' });
  const res = resolveCombat({ allies: [necro(abilities)], enemies: [foe()], seed: 9, maxRounds: 30 });
  const ev = res.events.find((e) => e.type === 'status' && e.message.includes('invoque un'));
  return ev ? ev.round : null;
};

describe('Capacités prêtes en même temps', () => {
  it('l’ultime part même quand un actif est équipé', () => {
    // Assaut d'os rang 3 = tous les 2 tours ; Avatar = tous les 4. Les manches
    // multiples de 4 sont aussi paires : l'ultime était éclipsé à chaque fois.
    expect(avatarRound({ n_leg_avatar: 1, n_leg_assaut: 3 }, 'n_leg_assaut')).not.toBeNull();
  });

  it('il part à la même manche qu’un ultime seul (aucune pénalité)', () => {
    expect(avatarRound({ n_leg_avatar: 1, n_leg_assaut: 3 }, 'n_leg_assaut')).toBe(
      avatarRound({ n_leg_avatar: 1 }, null),
    );
  });

  it('les DEUX capacités agissent la même manche', () => {
    const abilities = computeAbilities(
      'necromancien',
      { n_leg_avatar: 1, n_leg_assaut: 3, n_leg_appel: 5 },
      { activeId: 'n_leg_assaut', ultimateId: 'n_leg_avatar' },
    );
    const res = resolveCombat({ allies: [necro(abilities)], enemies: [foe()], seed: 9, maxRounds: 30 });
    const avatar = res.events.find((e) => e.type === 'status' && e.message.includes('invoque un'))!;
    const assaut = res.events.filter(
      (e) => e.type === 'status' && e.message.includes("lance l'assaut") && e.round === avatar.round,
    );
    expect(assaut.length).toBeGreaterThan(0);
  });

  it('une capacité à usage unique ne bloque pas les autres une fois consommée', () => {
    // L'Avatar ne part qu'une fois : les manches suivantes doivent rester utiles.
    const abilities = computeAbilities(
      'necromancien',
      { n_leg_avatar: 1, n_leg_assaut: 3 },
      { activeId: 'n_leg_assaut', ultimateId: 'n_leg_avatar' },
    );
    const res = resolveCombat({ allies: [necro(abilities)], enemies: [foe()], seed: 9, maxRounds: 30 });
    const assauts = res.events.filter((e) => e.type === 'status' && e.message.includes("lance l'assaut"));
    expect(assauts.length).toBeGreaterThan(3);
  });
});
