import { describe, expect, it } from 'vitest';
import { resolveCombat, enrageDamageMultiplier } from './resolveCombat.ts';
import { classHealMult } from '../progression/skills.ts';
import type { Ability, CombatantInput } from './types.ts';

function fighter(overrides: Partial<CombatantInput> & { id: string }): CombatantInput {
  return {
    name: overrides.id,
    role: 'dps',
    hp: 50,
    atk: 10,
    def: 5,
    speed: 10,
    ...overrides,
  };
}

describe('resolveCombat', () => {
  it('victoire évidente : allié surpuissant contre ennemi fragile', () => {
    const result = resolveCombat({
      allies: [fighter({ id: 'hero', hp: 200, atk: 50, def: 20, speed: 20 })],
      enemies: [fighter({ id: 'goblin', role: 'enemy', hp: 20, atk: 2, def: 0, speed: 1 })],
      seed: 1,
    });

    expect(result.result).toBe('win');
    expect(result.finalState.find((f) => f.id === 'hero')?.alive).toBe(true);
    expect(result.finalState.find((f) => f.id === 'goblin')?.alive).toBe(false);
  });

  it('invocation : un allié `summon` ajoute des créatures alliées au setup', () => {
    const summonAbility: Ability = { kind: 'summon', count: 2, hpMult: 0.5, atkMult: 0.5, defMult: 0, summonName: 'Goule' };
    const result = resolveCombat({
      allies: [fighter({ id: 'necro', hp: 100, atk: 20, abilities: [summonAbility] })],
      enemies: [fighter({ id: 'foe', role: 'enemy', hp: 300, atk: 10, speed: 1 })],
      seed: 3,
    });
    const summons = result.finalState.filter((f) => f.id.includes('~summon~'));
    expect(summons).toHaveLength(2);
    expect(summons[0]!.name).toBe('Goule');
    // Stats dérivées du lanceur (hp 100 × 0.5 = 50, avant scaling allié = pas de ×4).
    expect(summons[0]!.maxHp).toBe(50);
  });

  it('défaite évidente : allié fragile contre ennemi surpuissant', () => {
    const result = resolveCombat({
      allies: [fighter({ id: 'hero', hp: 20, atk: 2, def: 0, speed: 1 })],
      enemies: [fighter({ id: 'boss', role: 'enemy', hp: 200, atk: 50, def: 20, speed: 20 })],
      seed: 1,
    });

    expect(result.result).toBe('loss');
    expect(result.finalState.find((f) => f.id === 'hero')?.alive).toBe(false);
  });

  it("stats égales : l'avantage du premier coup (alliés) fait gagner la majorité", () => {
    // À stats identiques les alliés frappent en premier chaque tour : net avantage,
    // mais pas garanti à 100 % (la variance des dégâts peut renverser un combat serré).
    // On teste donc la tendance sur de nombreux seeds plutôt qu'un seed précis.
    let wins = 0;
    for (let seed = 1; seed <= 50; seed++) {
      // Adversaire à stats ÉGALES (rôle non-'enemy' → sans le bonus monstre) pour
      // isoler l'avantage du premier coup.
      const result = resolveCombat({
        allies: [fighter({ id: 'ally' })],
        enemies: [fighter({ id: 'enemy' })],
        seed,
      });
      if (result.result === 'win') wins++;
    }
    expect(wins).toBeGreaterThan(25);
  });

  it('déterminisme : même seed → mêmes événements', () => {
    const input = {
      allies: [fighter({ id: 'a', hp: 80 }), fighter({ id: 'b', role: 'healer' as const, atk: 8 })],
      enemies: [
        fighter({ id: 'e1', role: 'enemy' as const, hp: 60 }),
        fighter({ id: 'e2', role: 'enemy' as const, hp: 60 }),
      ],
      seed: 12345,
    };

    const a = resolveCombat(input);
    const b = resolveCombat(input);
    expect(a.events).toEqual(b.events);
    expect(a.result).toBe(b.result);
  });

  it('extra_attack : une chance de 100 % double les attaques du tour (Rafale précise)', () => {
    const res = resolveCombat({
      allies: [
        fighter({ id: 'ally', hp: 300, atk: 10, speed: 10, abilities: [{ kind: 'extra_attack', chance: 1 }] }),
      ],
      enemies: [fighter({ id: 'wall', role: 'enemy', hp: 100000, atk: 1, def: 0, speed: 1 })],
      seed: 7,
    });
    const r1 = res.events.filter((e) => e.type === 'attack' && e.round === 1 && e.actorId === 'ally');
    expect(r1.length).toBe(2);
  });

  it('poison cumulatif : les tics s’additionnent au fil des applications', () => {
    const res = resolveCombat({
      allies: [
        fighter({
          id: 'ply',
          hp: 400,
          atk: 20,
          speed: 10,
          abilities: [{ kind: 'on_hit', status: 'poison', chance: 1, potency: 0.5, duration: 10 }],
        }),
      ],
      enemies: [fighter({ id: 'wall', role: 'enemy', hp: 100000, atk: 1, def: 0, speed: 1 })],
      seed: 3,
    });
    const ticks = res.events
      .filter((e) => e.type === 'attack' && e.status === 'poison')
      .map((e) => (e.type === 'attack' ? e.damage : 0));
    expect(ticks.length).toBeGreaterThan(1);
    // Un tic tardif frappe plus fort qu'un premier tic (cumul, plafonné).
    expect(ticks[ticks.length - 1]!).toBeGreaterThan(ticks[0]!);
  });

  it('seeds différentes peuvent produire des combats différents', () => {
    const base = {
      allies: [fighter({ id: 'a', hp: 60, atk: 12 })],
      enemies: [fighter({ id: 'e', role: 'enemy' as const, hp: 60, atk: 12 })],
    };
    const r1 = resolveCombat({ ...base, seed: 1 });
    const r2 = resolveCombat({ ...base, seed: 999 });
    // Le nombre de rounds ou la trace diffèrent selon la seed (variance des dégâts).
    const differs =
      r1.rounds !== r2.rounds || JSON.stringify(r1.events) !== JSON.stringify(r2.events);
    expect(differs).toBe(true);
  });

  it("le soigneur émet des soins et prolonge la survie de l'équipe", () => {
    const result = resolveCombat({
      allies: [
        fighter({ id: 'tank', role: 'tank', hp: 120, atk: 8, def: 10, speed: 6 }),
        fighter({ id: 'healer', role: 'healer', hp: 85, atk: 12, def: 5, speed: 9 }),
      ],
      enemies: [fighter({ id: 'ogre', role: 'enemy', hp: 90, atk: 16, def: 4, speed: 8 })],
      seed: 7,
    });

    expect(result.events.some((e) => e.type === 'heal')).toBe(true);
  });

  it('aura d’équipe (stat_mod team) booste les PV max de TOUS les alliés', () => {
    const auraHp: Ability = { kind: 'stat_mod', scope: 'team', stat: 'hp', value: 1 };
    const result = resolveCombat({
      allies: [
        fighter({ id: 'carrier', hp: 50, abilities: [auraHp] }),
        fighter({ id: 'mate', hp: 50 }),
      ],
      enemies: [fighter({ id: 'e', role: 'enemy', hp: 1, atk: 1, def: 0, speed: 1 })],
      seed: 1,
    });
    expect(result.finalState.find((f) => f.id === 'carrier')?.maxHp).toBe(100);
    // Le co-équipier sans aura en profite aussi (scope 'team').
    expect(result.finalState.find((f) => f.id === 'mate')?.maxHp).toBe(100);
  });

  it('buff personnel (stat_mod self) ne booste que le porteur', () => {
    const selfHp: Ability = { kind: 'stat_mod', scope: 'self', stat: 'hp', value: 1 };
    const result = resolveCombat({
      allies: [
        fighter({ id: 'buffed', hp: 50, abilities: [selfHp] }),
        fighter({ id: 'plain', hp: 50 }),
      ],
      enemies: [fighter({ id: 'e', role: 'enemy', hp: 1, atk: 1, def: 0, speed: 1 })],
      seed: 1,
    });
    expect(result.finalState.find((f) => f.id === 'buffed')?.maxHp).toBe(100);
    expect(result.finalState.find((f) => f.id === 'plain')?.maxHp).toBe(50);
  });

  it('marque + détonation : atteindre le seuil de stacks déclenche une explosion', () => {
    const abilities: Ability[] = [
      { kind: 'stack_on_hit', mark: 'burn', chance: 1, max: 5 },
      { kind: 'detonate', mark: 'burn', threshold: 1, dmgMult: 3 },
    ];
    const result = resolveCombat({
      allies: [fighter({ id: 'mage', atk: 20, speed: 30, abilities })],
      enemies: [fighter({ id: 'e', role: 'enemy', hp: 200, atk: 1, def: 0, speed: 1 })],
      seed: 4,
    });
    expect(result.events.some((e) => e.message.includes('explose'))).toBe(true);
  });

  it('immunité : un statut négatif peut être totalement ignoré', () => {
    const result = resolveCombat({
      allies: [
        fighter({ id: 'paladin', role: 'tank', hp: 300, def: 20, speed: 1, abilities: [{ kind: 'immune', chance: 1 }] }),
      ],
      enemies: [
        fighter({
          id: 'e', role: 'enemy', hp: 60, atk: 10, speed: 20,
          abilities: [{ kind: 'on_hit', status: 'weaken', chance: 1, potency: 0.3, duration: 3 }],
        }),
      ],
      seed: 2,
    });
    expect(result.events.some((e) => e.type === 'status' && e.message.includes('résiste'))).toBe(true);
  });

  it('soin passif (heal_aura) soigne l’allié le plus blessé chaque tour', () => {
    const result = resolveCombat({
      allies: [
        fighter({ id: 'cleric', atk: 5, speed: 30, abilities: [{ kind: 'heal_aura', pct: 0.2 }] }),
        fighter({ id: 'wounded', hp: 100, startHp: 30, speed: 2 }),
      ],
      enemies: [fighter({ id: 'e', role: 'enemy', hp: 1, atk: 1, def: 0, speed: 1 })],
      seed: 1,
    });
    expect(
      result.events.some((e) => e.type === 'heal' && e.actorId === 'cleric' && e.targetId === 'wounded'),
    ).toBe(true);
  });

  it('%PV plafonné : dégâts = min(PV max × pct, ATK × capMult), ignore la DEF', () => {
    const shot: Ability = { kind: 'autocast', everyRounds: 1, action: { type: 'pct_hp', pct: 0.5, capMult: 100 } };
    const result = resolveCombat({
      allies: [fighter({ id: 'archer', atk: 10, speed: 30, abilities: [shot] })],
      enemies: [fighter({ id: 'boss', role: 'enemy', hp: 100, atk: 1, def: 50, speed: 1 })],
      seed: 1,
    });
    // PV max monstre = 100 ×4 = 400. min(400 × 0.5 = 200 ; 10 × 100 = 1000) = 200.
    expect(result.events.some((e) => e.type === 'attack' && e.targetId === 'boss' && e.damage === 200)).toBe(true);
  });

  it('exécution (execute_strike) : mort instantanée sous le seuil de PV', () => {
    const judge: Ability = {
      kind: 'autocast', everyRounds: 1, action: { type: 'execute_strike', dmgMult: 2, instakillPct: 0.5 },
    };
    const result = resolveCombat({
      allies: [fighter({ id: 'paladin', atk: 20, speed: 30, abilities: [judge] })],
      enemies: [fighter({ id: 'boss', role: 'enemy', hp: 100, startHp: 40, atk: 1, def: 80, speed: 1 })],
      seed: 1,
    });
    // 40 PV ≤ 100 × 0.5 → exécution malgré la grosse DEF.
    expect(result.finalState.find((f) => f.id === 'boss')?.alive).toBe(false);
    expect(result.events.some((e) => e.message.includes('exécute'))).toBe(true);
  });

  it('renvoi temporaire (buff self reflect) : l’attaquant subit les dégâts renvoyés', () => {
    const vengeance: Ability = {
      kind: 'autocast', everyRounds: 1, action: { type: 'buff', scope: 'self', duration: 3, reflect: 1 },
    };
    const result = resolveCombat({
      allies: [fighter({ id: 'damned', role: 'tank', hp: 400, def: 20, speed: 30, abilities: [vengeance] })],
      enemies: [fighter({ id: 'e', role: 'enemy', hp: 200, atk: 30, speed: 10 })],
      seed: 3,
    });
    expect(result.events.some((e) => e.message.includes('renvoient'))).toBe(true);
  });

  it('cri de désespoir (extra_turn) : déclenche une salve d’équipe', () => {
    const cry: Ability = { kind: 'autocast', everyRounds: 1, action: { type: 'extra_turn' } };
    const result = resolveCombat({
      allies: [
        fighter({ id: 'leader', atk: 15, speed: 30, abilities: [cry] }),
        fighter({ id: 'mate', atk: 15, speed: 20 }),
      ],
      enemies: [fighter({ id: 'e', role: 'enemy', hp: 300, atk: 1, def: 0, speed: 1 })],
      seed: 1,
    });
    expect(result.events.some((e) => e.message.includes('cri de désespoir'))).toBe(true);
  });

  it('cap de rounds atteint → défaite', () => {
    const result = resolveCombat({
      allies: [fighter({ id: 'a', hp: 1000, atk: 1, def: 999, speed: 5 })],
      enemies: [fighter({ id: 'e', role: 'enemy', hp: 1000, atk: 1, def: 999, speed: 5 })],
      seed: 3,
      maxRounds: 2,
    });

    expect(result.rounds).toBe(2);
    expect(result.result).toBe('loss');
  });
});

describe('enrage — dégâts croissants des ennemis contre les héros', () => {
  it('barème : ×1 avant 50, ×1.3 dès la manche 50, ×1.5 dès 100 puis +1 %/manche', () => {
    expect(enrageDamageMultiplier(1)).toBe(1);
    expect(enrageDamageMultiplier(49)).toBe(1);
    expect(enrageDamageMultiplier(50)).toBe(1.3);
    expect(enrageDamageMultiplier(99)).toBe(1.3);
    expect(enrageDamageMultiplier(100)).toBe(1.5);
    // Au-delà de 100 : +1 % cumulatif par manche.
    expect(enrageDamageMultiplier(101)).toBeCloseTo(1.51, 5);
    expect(enrageDamageMultiplier(110)).toBeCloseTo(1.6, 5);
    expect(enrageDamageMultiplier(150)).toBeCloseTo(2.0, 5);
  });

  it('les monstres frappent plus fort au fil des manches (enrage)', () => {
    // Héros increvable (gros PV, dégâts nuls) vs monstre increvable : le combat va
    // au plafond de manches ; les coups du monstre montent avec l'enrage.
    const hero = fighter({ id: 'héros', hp: 50_000_000, atk: 0, def: 5, speed: 12 });
    const enemy = fighter({ id: 'monstre', role: 'enemy', hp: 50_000_000, atk: 60, def: 100, speed: 10 });
    const result = resolveCombat({ allies: [hero], enemies: [enemy], seed: 1 });

    const dmgAt = (lo: number, hi: number) =>
      result.events
        .filter((e) => e.type === 'attack' && e.actorId === 'monstre' && e.round >= lo && e.round < hi)
        .map((e) => (e.type === 'attack' ? e.damage : 0));
    const early = dmgAt(1, 50); // enrage ×1
    const late = dmgAt(100, 200); // enrage ×1.5+
    expect(early.length).toBeGreaterThan(0);
    expect(late.length).toBeGreaterThan(0);
    expect(Math.max(...late)).toBeGreaterThan(Math.max(...early));
  });
});

describe('équilibrage des soins par classe (passe du 20 juil. 2026)', () => {
  it('les multiplicateurs sont exactement ceux décidés', () => {
    // Verrouille l'INTENTION : −40 % Soigneur, −20 % Paladin, +20 % Nécromancien.
    // Si quelqu'un touche ces chiffres, il doit le faire en connaissance de cause.
    expect(classHealMult('soigneur')).toBeCloseTo(0.6, 5);
    expect(classHealMult('paladin')).toBeCloseTo(0.8, 5);
    expect(classHealMult('necromancien')).toBeCloseTo(1.2, 5);
  });

  it('une classe non listée n’est pas affectée', () => {
    for (const c of ['guerrier', 'mage', 'archer', 'voleur', 'inquisiteur']) {
      expect(classHealMult(c)).toBe(1);
    }
  });

  it('un healMult absent laisse le soin INCHANGÉ (repli sûr)', () => {
    // La règle qui évite qu'un constructeur oublieux produise une valeur fausse :
    // sans le champ, on retombe sur le comportement historique.
    const soin = (healMult?: number) => {
      const res = resolveCombat({
        allies: [
          { id: 'h', name: 'Soigneur', role: 'healer', hp: 500, atk: 100, def: 0, speed: 10,
            ...(healMult === undefined ? {} : { healMult }) },
          { id: 'b', name: 'Blessé', role: 'tank', hp: 500, startHp: 50, atk: 1, def: 0, speed: 1 },
        ],
        enemies: [{ id: 'e', name: 'Mannequin', role: 'dps', hp: 100000, atk: 0, def: 0, speed: 1 }],
        seed: 42,
        maxRounds: 6,
      });
      return res.events
        .filter((e) => e.type === 'heal' && e.actorId === 'h')
        .reduce((s, e) => s + (e as { amount: number }).amount, 0);
    };
    expect(soin(undefined)).toBe(soin(1));
    expect(soin(undefined)).toBeGreaterThan(0);
  });

  it('le soin AUTOMATIQUE du rôle healer est bien réduit (le chemin qui évite heal())', () => {
    // Le piège de cette passe : ce soin-là contourne `heal()`. Sans application
    // explicite, le nerf aurait raté l'action que le Soigneur joue chaque tour.
    const total = (healMult: number) => {
      const res = resolveCombat({
        allies: [
          { id: 'h', name: 'Soigneur', role: 'healer', hp: 500, atk: 100, def: 0, speed: 10, healMult },
          { id: 'b', name: 'Blessé', role: 'tank', hp: 5000, startHp: 100, atk: 1, def: 0, speed: 1 },
        ],
        enemies: [{ id: 'e', name: 'Mannequin', role: 'dps', hp: 100000, atk: 0, def: 0, speed: 1 }],
        seed: 7,
        maxRounds: 8,
      });
      return res.events
        .filter((e) => e.type === 'heal' && e.actorId === 'h')
        .reduce((s, e) => s + (e as { amount: number }).amount, 0);
    };
    const plein = total(1);
    const nerfe = total(0.6);
    expect(nerfe).toBeLessThan(plein);
    // ~40 % de moins, à l'arrondi et à la variance de seed près.
    expect(nerfe / plein).toBeGreaterThan(0.5);
    expect(nerfe / plein).toBeLessThan(0.7);
  });

  it('le VOL DE VIE suit aussi le multiplicateur (autre chemin qui évite heal())', () => {
    const drained = (healMult: number) => {
      const res = resolveCombat({
        allies: [
          { id: 'v', name: 'Vampire', role: 'dps', hp: 500, startHp: 100, atk: 100, def: 0, speed: 10,
            healMult, passives: [{ type: 'lifesteal', value: 0.5 }] },
        ],
        enemies: [{ id: 'e', name: 'Mannequin', role: 'dps', hp: 100000, atk: 0, def: 0, speed: 1 }],
        seed: 11,
        maxRounds: 5,
      });
      return res.events
        .filter((e) => e.type === 'heal' && e.actorId === 'v')
        .reduce((s, e) => s + (e as { amount: number }).amount, 0);
    };
    expect(drained(1.2)).toBeGreaterThan(drained(1));
    expect(drained(0.6)).toBeLessThan(drained(1));
  });
});
