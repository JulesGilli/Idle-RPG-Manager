import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import type { Ability, CombatEvent, CombatantInput } from './types.ts';

function hero(overrides: Partial<CombatantInput> = {}): CombatantInput {
  return { id: 'h1', name: 'Héros', role: 'dps', hp: 300, atk: 30, def: 5, speed: 20, ...overrides };
}
function foe(id: string, overrides: Partial<CombatantInput> = {}): CombatantInput {
  return { id, name: id, role: 'enemy', hp: 120, atk: 6, def: 0, speed: 1, ...overrides };
}

function run(allies: CombatantInput[], enemies: CombatantInput[], seed = 1) {
  return resolveCombat({ allies, enemies, seed, maxRounds: 40 });
}

const byHero = (e: CombatEvent, id = 'h1') =>
  e.type === 'attack' && e.actorId === id && e.targetId !== id;

describe('armor & armor_pen', () => {
  it("la pénétration d'armure augmente les dégâts du premier coup", () => {
    const enemy = foe('e1', { hp: 5000, armor: 25, def: 5 });
    const pen: Ability = { kind: 'armor_pen', value: 0.8 };

    const plain = run([hero()], [enemy]);
    const piercing = run([hero({ abilities: [pen] })], [enemy]);

    const firstDmg = (r: ReturnType<typeof run>) =>
      (r.events.find((e) => byHero(e)) as Extract<CombatEvent, { type: 'attack' }>).damage;

    expect(firstDmg(piercing)).toBeGreaterThan(firstDmg(plain));
  });
});

describe('on_hit poison (DoT)', () => {
  it('applique le poison puis inflige des dégâts par tour', () => {
    const poison: Ability = { kind: 'on_hit', status: 'poison', chance: 1, potency: 0.3, duration: 3 };
    const r = run([hero({ atk: 20, abilities: [poison] })], [foe('e1', { hp: 4000 })]);

    // Un statut "empoisonné" est émis…
    expect(r.events.some((e) => e.type === 'status' && e.status === 'poison')).toBe(true);
    // …et des tics de DoT frappent l'ennemi (dégâts sur lui-même).
    const ticks = r.events.filter(
      (e) => e.type === 'attack' && e.actorId === 'e1' && e.targetId === 'e1' && e.damage > 0,
    );
    expect(ticks.length).toBeGreaterThan(0);
  });
});

describe('taunt (provocation)', () => {
  it('force les ennemis à cibler le provocateur pendant sa durée', () => {
    const provoke: Ability = { kind: 'taunt', everyRounds: 5, duration: 3 };
    // h2 a beaucoup moins de PV : sans provocation, l'ennemi le focus toujours.
    const r = run(
      [
        hero({ id: 'h1', name: 'Tank', role: 'tank', hp: 5000, def: 20, speed: 10, abilities: [provoke] }),
        hero({ id: 'h2', name: 'Cible', hp: 200, speed: 20 }),
      ],
      [foe('e1', { hp: 6000, atk: 5, speed: 1 })],
    );

    // La provocation est annoncée au tour 5…
    expect(r.events.some((e) => e.type === 'status' && e.status === 'taunt' && e.round === 5)).toBe(
      true,
    );
    // …et pendant sa durée (tours 5-7) l'ennemi frappe le tank malgré ses PV élevés,
    // alors qu'il ne le ciblerait jamais autrement (ciblage aléatoire, focus impossible ici).
    expect(
      r.events.some(
        (e) =>
          e.type === 'attack' &&
          e.actorId === 'e1' &&
          e.targetId === 'h1' &&
          e.round >= 5 &&
          e.round <= 7,
      ),
    ).toBe(true);
  });

  it('hors provocation, la cible ennemie n’est pas toujours le plus bas PV', () => {
    // 1 ennemi vs 4 alliés de PV très différents : sur de nombreux combats, un
    // ciblage aléatoire touche parfois un allié en pleine santé (jamais le cas
    // avec l'ancien focus fire qui visait toujours le plus bas PV).
    const targets = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const r = run(
        [
          hero({ id: 'h1', hp: 100, speed: 5 }),
          hero({ id: 'h2', hp: 400, speed: 5 }),
          hero({ id: 'h3', hp: 700, speed: 5 }),
          hero({ id: 'h4', hp: 1000, speed: 5 }),
        ],
        [foe('e1', { hp: 4000, atk: 10, speed: 1 })],
        seed,
      );
      for (const e of r.events) {
        if (e.type === 'attack' && e.actorId === 'e1' && e.targetId !== 'e1' && e.round === 1) {
          targets.add(e.targetId);
        }
      }
    }
    // Le premier coup ennemi ne tombe pas toujours sur h1 (le plus fragile).
    expect(targets.size).toBeGreaterThan(1);
  });
});

describe('amp_vs_status', () => {
  it('amplifie les dégâts contre une cible affligée', () => {
    const poison: Ability = { kind: 'on_hit', status: 'poison', chance: 1, potency: 0.2, duration: 5 };
    const amp: Ability = { kind: 'amp_vs_status', status: 'poison', bonus: 0.5 };
    const enemy = () => foe('e1', { hp: 6000 });

    const plain = run([hero({ abilities: [poison] })], [enemy()]);
    const amped = run([hero({ abilities: [poison, amp] })], [enemy()]);

    const finalHp = (r: ReturnType<typeof run>) => r.finalState.find((c) => c.id === 'e1')!.hp;
    // Même seed → l'ennemi amplifié perd strictement plus de PV.
    expect(finalHp(amped)).toBeLessThan(finalHp(plain));
  });
});

describe('multi_shot (Volée)', () => {
  it('frappe une cible supplémentaire le même tour', () => {
    const volley: Ability = { kind: 'multi_shot', chance: 1, extraTargets: 1 };
    const r = run([hero({ abilities: [volley] })], [foe('e1', { hp: 500 }), foe('e2', { hp: 500 })]);
    const round1HeroHits = r.events.filter(
      (e) => e.type === 'attack' && e.actorId === 'h1' && e.targetId !== 'h1' && e.round === 1,
    ) as Extract<CombatEvent, { type: 'attack' }>[];
    const targets = new Set(round1HeroHits.map((e) => e.targetId));
    expect(targets.size).toBeGreaterThanOrEqual(2);
  });
});

describe('autocast stun_all', () => {
  it('étourdit les ennemis qui passent leur tour', () => {
    const judgement: Ability = {
      kind: 'autocast',
      everyRounds: 1,
      action: { type: 'stun_all', duration: 2, dmgMult: 0 },
    };
    const r = run([hero({ abilities: [judgement], speed: 50 })], [foe('e1', { hp: 4000, atk: 40 })]);
    expect(r.events.some((e) => e.type === 'status' && e.message.includes('passe son tour'))).toBe(
      true,
    );
  });
});

describe('autocast aoe + propagation du feu', () => {
  it('touche tous les ennemis et propage le burn', () => {
    const blast: Ability = {
      kind: 'autocast',
      everyRounds: 1,
      action: { type: 'aoe', dmgMult: 1, status: 'burn', statusChance: 1, statusPotency: 0.2, statusDuration: 3, spread: true },
    };
    const r = run(
      [hero({ abilities: [blast], speed: 50 })],
      [foe('e1', { hp: 3000 }), foe('e2', { hp: 3000 }), foe('e3', { hp: 3000 })],
    );
    const burned = new Set(
      r.events
        .filter(
          (e): e is Extract<CombatEvent, { type: 'status' }> =>
            e.type === 'status' && e.status === 'burn',
        )
        .map((e) => e.combatantId),
    );
    expect(burned.size).toBeGreaterThanOrEqual(2);
  });
});

describe('combos', () => {
  it('multi_shot applique le poison à chaque cible touchée', () => {
    const kit: Ability[] = [
      { kind: 'multi_shot', chance: 1, extraTargets: 2 },
      { kind: 'on_hit', status: 'poison', chance: 1, potency: 0.2, duration: 3 },
    ];
    const r = run(
      [hero({ abilities: kit })],
      [foe('e1', { hp: 400 }), foe('e2', { hp: 400 }), foe('e3', { hp: 400 })],
    );
    const poisoned = new Set(
      r.events
        .filter(
          (e): e is Extract<CombatEvent, { type: 'status' }> =>
            e.type === 'status' && e.status === 'poison' && e.round === 1,
        )
        .map((e) => e.combatantId),
    );
    expect(poisoned.size).toBe(3);
  });

  it("l'AOE relaie les procs on_hit de l'attaquant", () => {
    const kit: Ability[] = [
      { kind: 'autocast', everyRounds: 1, action: { type: 'aoe', dmgMult: 1 } },
      { kind: 'on_hit', status: 'weaken', chance: 1, potency: 0.2, duration: 2 },
    ];
    const r = run(
      [hero({ abilities: kit, speed: 50 })],
      [foe('e1', { hp: 800 }), foe('e2', { hp: 800 })],
    );
    const weakened = new Set(
      r.events
        .filter(
          (e): e is Extract<CombatEvent, { type: 'status' }> =>
            e.type === 'status' && e.status === 'weaken',
        )
        .map((e) => e.combatantId),
    );
    expect(weakened.size).toBeGreaterThanOrEqual(2);
  });

  it('la contagion propage le poison à un autre ennemi', () => {
    const kit: Ability[] = [
      // Empoisonne seulement la 1re cible (focus fire), la contagion fait le reste.
      { kind: 'on_hit', status: 'poison', chance: 1, potency: 0.3, duration: 6 },
      { kind: 'contagion', chance: 1 },
    ];
    const r = run(
      [hero({ abilities: kit })],
      [foe('e1', { hp: 4000 }), foe('e2', { hp: 4000 })],
    );
    const poisoned = new Set(
      r.events
        .filter(
          (e): e is Extract<CombatEvent, { type: 'status' }> =>
            e.type === 'status' && e.status === 'poison',
        )
        .map((e) => e.combatantId),
    );
    // e2 n'est jamais attaqué directement (focus e1) mais est empoisonné par contagion.
    expect(poisoned.size).toBeGreaterThanOrEqual(2);
  });
});

describe('revive', () => {
  it('ressuscite une seule fois par combat', () => {
    const revive: Ability = { kind: 'revive', hpPct: 0.3 };
    const r = run([hero({ hp: 40, atk: 1, def: 0, abilities: [revive] })], [foe('e1', { hp: 9999, atk: 200, speed: 99 })]);
    const revives = r.events.filter((e) => e.type === 'heal' && e.message.includes('renaît'));
    expect(revives.length).toBe(1);
    expect(r.result).toBe('loss');
  });
});

describe('déterminisme', () => {
  it('même seed → mêmes événements avec abilités', () => {
    const kit: Ability[] = [
      { kind: 'on_hit', status: 'poison', chance: 0.5, potency: 0.2, duration: 3 },
      { kind: 'multi_shot', chance: 0.5, extraTargets: 1 },
    ];
    const a = run([hero({ abilities: kit })], [foe('e1'), foe('e2')], 42);
    const b = run([hero({ abilities: kit })], [foe('e1'), foe('e2')], 42);
    expect(a.events).toEqual(b.events);
  });
});
