import { describe, expect, it } from 'vitest';
import {
  ARMY_COMPOSITION,
  BATTLEFIELDS,
  BATTLEFIELD_ARC,
  BATTLEFIELD_DAILY_CAP,
  BATTLEFIELD_ENEMY_COUNT,
  BATTLEFIELD_MAX_TEAM,
  battlefieldArmy,
  battlefieldBlocker,
  battlefieldById,
  battlefieldReward,
  battlefieldUnlocked,
  battlesRemaining,
} from './battlefield.ts';
import { resolveCombat } from '../combat/resolveCombat.ts';
import { MAX_ROSTER } from './recruit.ts';
import { arcTuning } from './arc.ts';

const first = BATTLEFIELDS[0]!;
const last = BATTLEFIELDS.at(-1)!;

describe('catalogue des champs de bataille', () => {
  it('les idx sont 1-indexés et contigus (le déblocage séquentiel en dépend)', () => {
    expect(BATTLEFIELDS.map((b) => b.idx)).toEqual(BATTLEFIELDS.map((_, i) => i + 1));
  });

  it('les ids sont uniques', () => {
    const ids = BATTLEFIELDS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('la difficulté est STRICTEMENT croissante (c’est la promesse de l’activité)', () => {
    for (let i = 1; i < BATTLEFIELDS.length; i++) {
      const prev = BATTLEFIELDS[i - 1]!;
      const cur = BATTLEFIELDS[i]!;
      expect(cur.base.hp).toBeGreaterThan(prev.base.hp);
      expect(cur.base.atk).toBeGreaterThan(prev.base.atk);
      expect(cur.base.def).toBeGreaterThan(prev.base.def);
    }
  });

  it('la récompense ne décroît jamais quand la difficulté monte', () => {
    for (let i = 1; i < BATTLEFIELDS.length; i++) {
      expect(BATTLEFIELDS[i]!.dust).toBeGreaterThanOrEqual(BATTLEFIELDS[i - 1]!.dust);
      expect(BATTLEFIELDS[i]!.gold).toBeGreaterThan(BATTLEFIELDS[i - 1]!.gold);
    }
  });

  it('battlefieldById retrouve chaque bataille, et rien d’autre', () => {
    for (const b of BATTLEFIELDS) expect(battlefieldById(b.id)).toBe(b);
    expect(battlefieldById('inexistant')).toBeUndefined();
  });
});

describe('armée adverse', () => {
  it('compte toujours exactement BATTLEFIELD_ENEMY_COUNT combattants', () => {
    expect(ARMY_COMPOSITION).toHaveLength(BATTLEFIELD_ENEMY_COUNT);
    for (const b of BATTLEFIELDS) {
      expect(battlefieldArmy(b)).toHaveLength(BATTLEFIELD_ENEMY_COUNT);
    }
  });

  it('les ids sont uniques — sinon le moteur confond deux combattants', () => {
    const ids = battlefieldArmy(last).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('applique le scaling d’ARC aux PV/ATK (cohérent avec carte/donjon/tour)', () => {
    const t = arcTuning(BATTLEFIELD_ARC);
    const troupe = battlefieldArmy(first)[0]!;
    expect(troupe.hp).toBe(Math.round(first.base.hp * t.enemyHpMult));
    expect(troupe.atk).toBe(Math.round(first.base.atk * t.enemyAtkMult));
    // La DEF n'est PAS scalée par l'arc (règle partagée) — seulement par le grade.
    expect(troupe.def).toBe(first.base.def);
  });

  it('le capitaine est le plus coriace et s’enrage (le combat doit trancher)', () => {
    const army = battlefieldArmy(last);
    const captain = army.at(-1)!;
    for (const e of army.slice(0, -1)) expect(captain.hp).toBeGreaterThan(e.hp);
    expect(captain.abilities?.some((a) => a.kind === 'atk_ramp')).toBe(true);
  });

  it('est déterministe : même bataille → même armée', () => {
    expect(battlefieldArmy(first)).toEqual(battlefieldArmy(first));
  });

  it('une armée d’arc 1 est bien plus faible que la même en arc 2', () => {
    expect(battlefieldArmy(first, 1)[0]!.hp).toBeLessThan(battlefieldArmy(first, 2)[0]!.hp);
  });
});

describe('quota quotidien', () => {
  it('décompte les sorties et ne passe jamais sous zéro', () => {
    expect(battlesRemaining(0)).toBe(BATTLEFIELD_DAILY_CAP);
    expect(battlesRemaining(1)).toBe(BATTLEFIELD_DAILY_CAP - 1);
    expect(battlesRemaining(BATTLEFIELD_DAILY_CAP)).toBe(0);
    expect(battlesRemaining(BATTLEFIELD_DAILY_CAP + 5)).toBe(0);
  });
});

describe('déblocage séquentiel', () => {
  it('la première est toujours ouverte, même sans aucune victoire', () => {
    expect(battlefieldUnlocked(1, 0)).toBe(true);
  });

  it('on ouvre la suivante en gagnant la précédente, pas au-delà', () => {
    expect(battlefieldUnlocked(2, 1)).toBe(true);
    expect(battlefieldUnlocked(3, 1)).toBe(false);
  });
});

describe('battlefieldBlocker — verdict unique serveur & front', () => {
  const ok = { arc: 2, idx: 1, highestCleared: 0, usedToday: 0, teamSize: 5 };

  it('laisse passer une bataille légitime', () => {
    expect(battlefieldBlocker(ok)).toBeNull();
  });

  it('refuse hors Arc 2', () => {
    expect(battlefieldBlocker({ ...ok, arc: 1 })).toBe('arc');
  });

  it('refuse une bataille non débloquée', () => {
    expect(battlefieldBlocker({ ...ok, idx: 4, highestCleared: 1 })).toBe('locked');
  });

  it('refuse quand le quota du jour est épuisé', () => {
    expect(battlefieldBlocker({ ...ok, usedToday: BATTLEFIELD_DAILY_CAP })).toBe('daily_cap');
  });

  it('refuse une escouade vide', () => {
    expect(battlefieldBlocker({ ...ok, teamSize: 0 })).toBe('no_heroes');
  });

  it('un joueur en sous-effectif n’est PAS bloqué (il se bat en infériorité)', () => {
    // Règle de design : le vivier ne verrouille jamais l'activité.
    expect(battlefieldBlocker({ ...ok, teamSize: 1 })).toBeNull();
  });
});

describe('récompenses', () => {
  it('la victoire paie, la défaite ne paie rien mais consomme la sortie', () => {
    expect(battlefieldReward(last, true)).toEqual({ dust: last.dust, gold: last.gold });
    expect(battlefieldReward(last, false)).toEqual({ dust: 0, gold: 0 });
  });
});

describe('cohérence avec le reste du jeu', () => {
  it('l’effectif engagé reste atteignable : MAX_TEAM ≤ MAX_ROSTER', () => {
    // Sinon on promettrait un effectif que le jeu ne permet jamais de réunir.
    expect(BATTLEFIELD_MAX_TEAM).toBeLessThanOrEqual(MAX_ROSTER);
  });

  it('l’armée est directement consommable par le moteur de combat', () => {
    const hero = {
      id: 'h1', name: 'Aldric', role: 'tank' as const,
      hp: 500_000, atk: 40_000, def: 3_000, speed: 20,
    };
    const combat = resolveCombat({
      allies: [hero],
      enemies: battlefieldArmy(first),
      seed: 42,
    });
    expect(['win', 'loss']).toContain(combat.result);
    expect(combat.finalState.length).toBe(1 + BATTLEFIELD_ENEMY_COUNT);
  });
});
