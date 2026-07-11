import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import {
  MAP_BOSS_ATK_MULT,
  MAP_BOSS_HP_MULT,
  MINIBOSS_MONSTER_SCALING,
  NORMAL_MONSTER_SCALING,
  scaleMinibossMonster,
  scaleNormalMonster,
  tuneMapBoss,
  withStunImmunity,
} from './difficulty.ts';
import type { Ability, CombatantInput } from './types.ts';

function foe(overrides: Partial<CombatantInput> = {}): CombatantInput {
  return { id: 'e1', name: 'Mob', role: 'enemy', hp: 200, atk: 20, def: 8, speed: 5, ...overrides };
}

describe('scaleNormalMonster', () => {
  it('renforce PV / ATK / DEF selon les multiplicateurs', () => {
    const scaled = scaleNormalMonster(foe({ hp: 200, atk: 20, def: 8 }));
    expect(scaled.hp).toBe(Math.round(200 * NORMAL_MONSTER_SCALING.hp));
    expect(scaled.atk).toBe(Math.round(20 * NORMAL_MONSTER_SCALING.atk));
    expect(scaled.def).toBe(Math.round(8 * NORMAL_MONSTER_SCALING.def));
  });

  it('ne mute pas l\'entrée et rend le monstre plus difficile', () => {
    const base = foe();
    const scaled = scaleNormalMonster(base);
    expect(base.hp).toBe(200); // entrée intacte
    expect(scaled.hp).toBeGreaterThan(base.hp);
    expect(scaled.atk).toBeGreaterThan(base.atk);
  });
});

describe('scaleMinibossMonster', () => {
  it('renforce le mini-boss selon ses propres multiplicateurs', () => {
    const scaled = scaleMinibossMonster(foe({ hp: 480, atk: 28, def: 13 }));
    expect(scaled.hp).toBe(Math.round(480 * MINIBOSS_MONSTER_SCALING.hp));
    expect(scaled.atk).toBe(Math.round(28 * MINIBOSS_MONSTER_SCALING.atk));
    expect(scaled.def).toBe(Math.round(13 * MINIBOSS_MONSTER_SCALING.def));
  });

  it('reste plus modéré que le boost des mobs classiques', () => {
    const m = foe();
    expect(scaleMinibossMonster(m).hp).toBeLessThan(scaleNormalMonster(m).hp);
    expect(scaleMinibossMonster(m).hp).toBeGreaterThan(m.hp);
  });
});

describe('withStunImmunity', () => {
  it('rend le boss insensible au stun (il ne passe jamais son tour)', () => {
    // Un héros qui étourdit toute l'équipe ennemie chaque tour.
    const judgement: Ability = {
      kind: 'autocast',
      everyRounds: 1,
      action: { type: 'stun_all', duration: 2, dmgMult: 0 },
    };
    const hero: CombatantInput = {
      id: 'h1', name: 'Héros', role: 'dps', hp: 5000, atk: 40, def: 10, speed: 50,
      abilities: [judgement],
    };
    const boss = withStunImmunity(foe({ id: 'boss', hp: 6000, atk: 40 }));

    const r = resolveCombat({ allies: [hero], enemies: [boss], seed: 7, maxRounds: 40 });
    // Le boss ne saute jamais son tour…
    const bossSkippedTurn = r.events.some(
      (e) => e.type === 'status' && e.combatantId === 'boss' && e.message.includes('passe son tour'),
    );
    expect(bossSkippedTurn).toBe(false);
    // …et résiste explicitement à l'effet stun qu'on tente de lui poser.
    const bossResisted = r.events.some(
      (e) => e.type === 'status' && e.combatantId === 'boss' && e.message.includes('résiste'),
    );
    expect(bossResisted).toBe(true);
  });

  it('un mob classique (sans immunité) peut être étourdi', () => {
    const judgement: Ability = {
      kind: 'autocast',
      everyRounds: 1,
      action: { type: 'stun_all', duration: 2, dmgMult: 0 },
    };
    const hero: CombatantInput = {
      id: 'h1', name: 'Héros', role: 'dps', hp: 5000, atk: 40, def: 10, speed: 50,
      abilities: [judgement],
    };
    const mob = foe({ id: 'e1', hp: 6000, atk: 40 });

    const r = resolveCombat({ allies: [hero], enemies: [mob], seed: 7, maxRounds: 40 });
    const mobSkippedTurn = r.events.some(
      (e) => e.type === 'status' && e.combatantId === 'e1' && e.message.includes('passe son tour'),
    );
    expect(mobSkippedTurn).toBe(true);
  });

  it('ne duplique pas une immunité au stun déjà présente', () => {
    const already = foe({ abilities: [{ kind: 'immune', chance: 1, statuses: ['stun'] }] });
    const out = withStunImmunity(already);
    const immunes = (out.abilities ?? []).filter((a) => a.kind === 'immune');
    expect(immunes).toHaveLength(1);
  });
});

describe('tuneMapBoss', () => {
  it('relève les PV, baisse l\'ATK, ajoute une spéciale + immunité au stun (sans muter)', () => {
    const base = foe({ id: 'boss', hp: 2000, atk: 200, abilities: [{ kind: 'armor_pen', value: 0.3 }] });
    const boss = tuneMapBoss(base, 30); // zone 6
    expect(base.hp).toBe(2000); // entrée intacte
    expect(boss.hp).toBe(Math.round(2000 * MAP_BOSS_HP_MULT));
    expect(boss.atk).toBe(Math.round(200 * MAP_BOSS_ATK_MULT));
    expect(boss.atk).toBeLessThan(base.atk); // ne one-shot plus
    const kinds = (boss.abilities ?? []).map((a) => a.kind);
    expect(kinds).toContain('autocast'); // attaque spéciale de zone
    expect(kinds).toContain('immune'); // insensible au stun
  });

  it('donne des spéciales DIFFÉRENTES selon la zone', () => {
    const z1 = tuneMapBoss(foe({ hp: 800, atk: 30 }), 5);
    const z3 = tuneMapBoss(foe({ hp: 1300, atk: 60 }), 15);
    const cast = (m: CombatantInput) =>
      (m.abilities ?? []).find((a) => a.kind === 'autocast');
    const a1 = cast(z1);
    const a3 = cast(z3);
    const type1 = a1?.kind === 'autocast' ? a1.action.type : null;
    const type3 = a3?.kind === 'autocast' ? a3.action.type : null;
    expect(type1).toBe('nuke');
    expect(type3).toBe('stun_lowest');
  });
});

describe('autocast stun_lowest', () => {
  it('étourdit les N alliés les plus bas en PV, pas les autres', () => {
    const boss: CombatantInput = {
      id: 'boss', name: 'Geôlier', role: 'enemy', hp: 100000, atk: 10, def: 0, speed: 1,
      abilities: [{ kind: 'autocast', everyRounds: 1, action: { type: 'stun_lowest', count: 2, duration: 1 } }],
    };
    // 3 héros : PV 100 / 200 / 300 (ATK nulle → PV stables, boss ne meurt pas).
    const mk = (id: string, hp: number): CombatantInput => ({
      id, name: id, role: 'dps', hp, atk: 0, def: 0, speed: 50,
    });
    const r = resolveCombat({
      allies: [mk('low', 100), mk('mid', 200), mk('high', 300)],
      enemies: [boss],
      seed: 3,
      maxRounds: 6,
    });
    const skipped = (id: string) =>
      r.events.some((e) => e.type === 'status' && e.combatantId === id && e.message.includes('passe son tour'));
    expect(skipped('low')).toBe(true);
    expect(skipped('mid')).toBe(true);
    expect(skipped('high')).toBe(false); // le plus haut en PV est épargné
  });
});
