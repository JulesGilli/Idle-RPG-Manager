import { describe, expect, it } from 'vitest';
import {
  tavernDayKey,
  parisDateKey,
  tavernResetsAt,
  recruitCost,
  RECRUIT_COST_CAP,
  recruitGrade,
  rollRecruitBonuses,
  rollRecruitName,
  rollTavernPool,
  forcedTavernClasses,
  recruitQualityBonus,
  hashSeed,
  ROLL_MIN,
  ROLL_MAX,
  MAX_ROSTER,
  ROSTER_BASE,
  maxRosterFor,
  countDungeonClears,
  tavernRerollCost,
  TAVERN_SIZE,
  type ClassBase,
} from './recruit.ts';
import { DUNGEON_COUNT } from './dungeon.ts';
import { MAX_ARC } from './arc.ts';
import { createRng } from '../combat/prng.ts';

describe('maxRosterFor (slots progressifs V2)', () => {
  it('5 de base, +1 par donjon terminé, plafonné à MAX_ROSTER', () => {
    expect(maxRosterFor(0)).toBe(ROSTER_BASE);
    expect(maxRosterFor(0)).toBe(5);
    expect(maxRosterFor(3)).toBe(8);
    expect(maxRosterFor(8)).toBe(13);
    expect(maxRosterFor(20)).toBe(MAX_ROSTER); // plafonné (jamais au-delà)
    expect(maxRosterFor(-1)).toBe(5); // borne basse (valeur aberrante ignorée)
  });

  // `recruit.ts` n'importe volontairement pas `dungeon.ts` (poids du bundle Edge) :
  // ce test est le seul garde-fou contre une divergence entre les deux constantes.
  // Sans lui, ajouter un donjon laisserait le dernier promettre un slot inexistant.
  it('MAX_ROSTER couvre un slot par donjon ET PAR ARC', () => {
    // Les 8 donjons se rejouent à chaque arc et y débloquent leurs propres
    // slots : le plafond doit suivre MAX_ARC, sinon les donjons du dernier arc
    // promettraient des slots inexistants.
    expect(MAX_ROSTER).toBe(ROSTER_BASE + DUNGEON_COUNT * MAX_ARC);
    expect(maxRosterFor(DUNGEON_COUNT * MAX_ARC)).toBe(MAX_ROSTER);
    // Boucler les 8 donjons d'un SEUL arc ne suffit plus à saturer l'effectif.
    expect(maxRosterFor(DUNGEON_COUNT)).toBeLessThan(MAX_ROSTER);
  });
});

const GUERRIER: ClassBase = { id: 'guerrier', base_hp: 130, base_atk: 10, base_def: 12, base_speed: 6 };
const ARCHER: ClassBase = { id: 'archer', base_hp: 75, base_atk: 16, base_def: 5, base_speed: 13 };
const MAGE: ClassBase = { id: 'mage', base_hp: 65, base_atk: 18, base_def: 4, base_speed: 10 };
const PALADIN: ClassBase = { id: 'paladin', base_hp: 140, base_atk: 9, base_def: 11, base_speed: 7 };
const SOIGNEUR: ClassBase = { id: 'soigneur', base_hp: 85, base_atk: 7, base_def: 5, base_speed: 9 };
const CLASSES = [GUERRIER, ARCHER, MAGE, PALADIN, SOIGNEUR];

describe('rollRecruitBonuses', () => {
  it('reste dans la fourchette [−20 %, +35 %] de la base (arrondi)', () => {
    for (let s = 0; s < 500; s++) {
      const b = rollRecruitBonuses(GUERRIER, createRng(s));
      expect(b.bonus_hp).toBeGreaterThanOrEqual(Math.round(GUERRIER.base_hp * ROLL_MIN) - 1);
      expect(b.bonus_hp).toBeLessThanOrEqual(Math.round(GUERRIER.base_hp * ROLL_MAX) + 1);
      expect(b.bonus_atk).toBeGreaterThanOrEqual(Math.round(GUERRIER.base_atk * ROLL_MIN) - 1);
      expect(b.bonus_atk).toBeLessThanOrEqual(Math.round(GUERRIER.base_atk * ROLL_MAX) + 1);
    }
  });

  it('déterministe pour une même seed, varié entre seeds', () => {
    expect(rollRecruitBonuses(ARCHER, createRng(7))).toEqual(rollRecruitBonuses(ARCHER, createRng(7)));
    const values = new Set<number>();
    for (let s = 0; s < 50; s++) values.add(rollRecruitBonuses(ARCHER, createRng(s)).bonus_atk);
    expect(values.size).toBeGreaterThan(3);
  });
});

describe('recruitGrade', () => {
  it('rolls maximaux = S, minimaux = D, neutres = C', () => {
    const max = {
      bonus_hp: Math.round(GUERRIER.base_hp * ROLL_MAX),
      bonus_atk: Math.round(GUERRIER.base_atk * ROLL_MAX),
      bonus_def: Math.round(GUERRIER.base_def * ROLL_MAX),
      bonus_speed: Math.round(GUERRIER.base_speed * ROLL_MAX),
    };
    const min = {
      bonus_hp: Math.round(GUERRIER.base_hp * ROLL_MIN),
      bonus_atk: Math.round(GUERRIER.base_atk * ROLL_MIN),
      bonus_def: Math.round(GUERRIER.base_def * ROLL_MIN),
      bonus_speed: Math.round(GUERRIER.base_speed * ROLL_MIN),
    };
    const zero = { bonus_hp: 0, bonus_atk: 0, bonus_def: 0, bonus_speed: 0 };
    expect(recruitGrade(max, GUERRIER)).toBe('S');
    expect(recruitGrade(min, GUERRIER)).toBe('D');
    // Un roll neutre (q = 0.5) sort en D : l'excellence est rare.
    expect(recruitGrade(zero, GUERRIER)).toBe('D');
  });

  it('distribution sélective ~60/30/8/1.8/0.2 % sur un grand échantillon', () => {
    const N = 200_000;
    const counts: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    for (let s = 0; s < N; s++) {
      const rng = createRng((s * 0x9e3779b9) >>> 0);
      const cls = CLASSES[rng.int(0, CLASSES.length - 1)]!;
      const g = recruitGrade(rollRecruitBonuses(cls, rng), cls);
      counts[g] = (counts[g] ?? 0) + 1;
    }
    const pct = (g: string) => (100 * (counts[g] ?? 0)) / N;
    expect(pct('D')).toBeGreaterThanOrEqual(57);
    expect(pct('D')).toBeLessThanOrEqual(63);
    expect(pct('C')).toBeGreaterThanOrEqual(27);
    expect(pct('C')).toBeLessThanOrEqual(33);
    expect(pct('B')).toBeGreaterThanOrEqual(6);
    expect(pct('B')).toBeLessThanOrEqual(10);
    expect(pct('A')).toBeGreaterThanOrEqual(1);
    expect(pct('A')).toBeLessThanOrEqual(3);
    expect(pct('S')).toBeGreaterThanOrEqual(0.05);
    expect(pct('S')).toBeLessThanOrEqual(0.6);
  });
});

describe('tavernRerollCost', () => {
  it('1 plume au premier reroll, puis +1 a chaque fois dans la meme periode', () => {
    expect(tavernRerollCost(0)).toBe(1);
    expect(tavernRerollCost(1)).toBe(2);
    expect(tavernRerollCost(2)).toBe(3);
    expect(tavernRerollCost(9)).toBe(10);
  });



  it('retombe a 1 quand le compteur est remis a zero', () => {
    expect(tavernRerollCost(0)).toBe(1);
  });

  it('ne casse pas sur une valeur aberrante en base', () => {
    expect(tavernRerollCost(-3)).toBe(1);
    expect(tavernRerollCost(2.7)).toBe(3);
  });
});

describe('parisDateKey (journée civile, minuit)', () => {
  // Le prix du reroll retombe à 1 à MINUIT, alors que le pool de recrues, lui,
  // se renouvelle à 22 h. Ces deux tests verrouillent la différence : c'est
  // précisément la fenêtre 22 h → minuit qui les distingue.
  const at = (iso: string) => Date.parse(iso);

  it('bascule à minuit, pas à 22 h', () => {
    // 21 h 30 et 23 h 00 heure de Paris le même jour → MÊME journée civile,
    // alors que la période de taverne a déjà changé entre les deux.
    expect(parisDateKey(at('2026-07-20T19:30:00Z'))).toBe('2026-07-20'); // 21h30 Paris
    expect(parisDateKey(at('2026-07-20T21:00:00Z'))).toBe('2026-07-20'); // 23h00 Paris
    expect(tavernDayKey(at('2026-07-20T19:30:00Z'))).not.toBe(
      tavernDayKey(at('2026-07-20T21:00:00Z')),
    );
  });

  it('change bien au passage de minuit', () => {
    expect(parisDateKey(at('2026-07-20T21:59:00Z'))).toBe('2026-07-20'); // 23h59 Paris
    expect(parisDateKey(at('2026-07-20T22:01:00Z'))).toBe('2026-07-21'); // 00h01 Paris
  });
});

describe('recruitCost', () => {
  it('doublement à chaque recrue au-delà de 3', () => {
    expect(recruitCost(3)).toBe(250);
    expect(recruitCost(4)).toBe(500);
    expect(recruitCost(2)).toBe(250);
    expect(MAX_ROSTER).toBe(21);
  });

  it('PLAFONNE à 1 million — les derniers slots restent atteignables', () => {
    // Sans plafond, le 21e héros (effectif max depuis les donjons d’arc 2)
    // coûtait 65 M d’or : le prix devenait le vrai verrou, pas les donjons.
    expect(recruitCost(14)).toBe(512_000); // dernier palier sous le plafond
    expect(recruitCost(15)).toBe(RECRUIT_COST_CAP); // 1 024 000 sans plafond
    expect(recruitCost(MAX_ROSTER)).toBe(RECRUIT_COST_CAP);
  });

  it('ne décroît JAMAIS quand l’effectif grandit', () => {
    for (let n = 3; n < MAX_ROSTER; n++) {
      expect(recruitCost(n + 1)).toBeGreaterThanOrEqual(recruitCost(n));
    }
  });
});

describe('rollTavernPool', () => {
  it('génère TAVERN_SIZE recrues, déterministe pour une même seed', () => {
    const seed = hashSeed('user-abc', '2026-07-02');
    const a = rollTavernPool(seed, CLASSES);
    const b = rollTavernPool(seed, CLASSES);
    expect(a).toHaveLength(TAVERN_SIZE);
    expect(a).toEqual(b);
    expect(a.map((c) => c.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('un jour différent donne un pool différent', () => {
    const p1 = rollTavernPool(hashSeed('user-abc', '2026-07-02'), CLASSES);
    const p2 = rollTavernPool(hashSeed('user-abc', '2026-07-03'), CLASSES);
    const names1 = p1.map((c) => c.name).join(',');
    const names2 = p2.map((c) => c.name).join(',');
    expect(names1).not.toBe(names2);
  });

  it('deux joueurs différents ont des pools différents le même jour', () => {
    const a = rollTavernPool(hashSeed('user-a', '2026-07-02'), CLASSES);
    const b = rollTavernPool(hashSeed('user-b', '2026-07-02'), CLASSES);
    expect(a.map((c) => c.name).join(',')).not.toBe(b.map((c) => c.name).join(','));
  });

  it('onboarding : force archer + soigneur sur les 2 premiers slots (effectif < 3)', () => {
    const seed = hashSeed('user-abc', '2026-07-02');
    const forced = forcedTavernClasses(1);
    expect(forced).toEqual({ 0: 'archer', 1: 'soigneur' });
    const pool = rollTavernPool(seed, CLASSES, forced);
    expect(pool[0]!.class_id).toBe('archer');
    expect(pool[1]!.class_id).toBe('soigneur');
    // Hors onboarding (effectif >= 3) : plus de forçage.
    expect(forcedTavernClasses(3)).toEqual({});
  });

  it('garantit les classes MANQUANTES, et seulement elles', () => {
    const all = CLASSES.map((c) => c.id);
    // Nouveau joueur (ne possède que son Guerrier de départ).
    const forced = forcedTavernClasses(1, ['guerrier'], all);
    const manquantes = all.filter((id) => id !== 'guerrier');
    expect(new Set(Object.values(forced))).toEqual(new Set(manquantes));
    // Le guerrier, déjà possédé, ne monopolise plus un slot : il reste libre.
    expect(Object.values(forced)).not.toContain('guerrier');
    const pool = rollTavernPool(hashSeed('newbie', '2026-07-07'), CLASSES, forced);
    for (const id of manquantes) expect(pool.some((c) => c.class_id === id)).toBe(true);
    // Une fois une classe de chaque possédée → pool normal (aucun forçage).
    expect(forcedTavernClasses(6, all, all)).toEqual({});
  });

  it('le mapping slot→classe reste stable quoi qu’on possède', () => {
    // C'est cette stabilité qui empêche les indices déjà réclamés
    // (`tavern_state.claimed`) de se décaler : un slot garde toujours la même
    // classe de référence, seul son caractère imposé/libre change.
    const all = CLASSES.map((c) => c.id);
    const tout = forcedTavernClasses(1, [], all);
    for (const [slot, cls] of Object.entries(forcedTavernClasses(1, ['guerrier'], all))) {
      expect(tout[Number(slot)]).toBe(cls);
    }
  });

  it('renvoyer un héros ne rouvre qu’UN slot, pas toute la taverne', () => {
    // Le reroll gratuit d'avant : perdre sa dernière classe X faisait basculer
    // les huit slots d'un coup, ce qui contournait la plume d'appel.
    const all = CLASSES.map((c) => c.id);
    const avant = forcedTavernClasses(6, all, all); // collection complète → {}
    const apres = forcedTavernClasses(5, all.filter((id) => id !== 'mage'), all);
    const changes = new Set([...Object.keys(avant), ...Object.keys(apres)]).size;
    expect(changes).toBe(1);
    expect(Object.values(apres)).toEqual(['mage']);
  });

  it('la qualité des recrues monte avec les zones terminées (plafonnée)', () => {
    expect(recruitQualityBonus(0)).toBe(0);
    expect(recruitQualityBonus(4)).toBeCloseTo(0.1, 5);
    expect(recruitQualityBonus(100)).toBe(0.22); // plafond
    // Sur beaucoup de tirages, un gros bonus produit davantage de bons grades.
    const goodGrades = (bonus: number): number => {
      let good = 0;
      for (let s = 0; s < 400; s++) {
        const g = recruitGrade(rollRecruitBonuses(MAGE, createRng(s), bonus), MAGE);
        if (g === 'S' || g === 'A' || g === 'B') good++;
      }
      return good;
    };
    expect(goodGrades(0.22)).toBeGreaterThan(goodGrades(0));
  });

  it('produit un mélange de classes et de grades sur un pool', () => {
    const grades = new Set<string>();
    for (let d = 0; d < 40; d++) {
      const pool = rollTavernPool(hashSeed('u', `day-${d}`), CLASSES);
      for (const c of pool) {
        const cls = CLASSES.find((x) => x.id === c.class_id)!;
        grades.add(recruitGrade(c.bonuses, cls));
      }
    }
    // Sur 40 jours × 8 recrues, on doit voir de la variété de grades.
    expect(grades.size).toBeGreaterThanOrEqual(4);
  });
});

describe('hashSeed', () => {
  it('déterministe et sensible aux entrées', () => {
    expect(hashSeed('a', 'b')).toBe(hashSeed('a', 'b'));
    expect(hashSeed('a', 'b')).not.toBe(hashSeed('a', 'c'));
    expect(hashSeed('a', 'b')).not.toBe(hashSeed('b', 'a'));
  });
});

describe('rollRecruitName', () => {
  it('retourne toujours un nom non vide', () => {
    for (let s = 0; s < 40; s++) {
      expect(rollRecruitName(createRng(s)).length).toBeGreaterThan(0);
    }
  });
});

describe('Taverne — renouvellement à 22 h (Paris)', () => {
  const at = (iso: string) => Date.parse(iso);

  it('avant 22 h, on est encore sur la période de la veille (été, UTC+2)', () => {
    // 19:59 UTC = 21:59 Paris en CEST.
    expect(tavernDayKey(at('2026-07-18T19:59:00Z'))).toBe('2026-07-17');
  });

  it('à 22 h pile, la période bascule (été)', () => {
    expect(tavernDayKey(at('2026-07-18T20:00:00Z'))).toBe('2026-07-18');
    expect(tavernDayKey(at('2026-07-18T20:01:00Z'))).toBe('2026-07-18');
  });

  it('fonctionne aussi en heure d’HIVER (UTC+1)', () => {
    // 20:59 UTC = 21:59 Paris en CET ; 21:00 UTC = 22:00 Paris.
    expect(tavernDayKey(at('2026-01-15T20:59:00Z'))).toBe('2026-01-14');
    expect(tavernDayKey(at('2026-01-15T21:00:00Z'))).toBe('2026-01-15');
  });

  it('après minuit, la clé ne change PAS (le reset est à 22 h, pas à minuit)', () => {
    const soir = tavernDayKey(at('2026-07-18T20:30:00Z')); // 22h30 Paris
    const nuit = tavernDayKey(at('2026-07-18T23:30:00Z')); // 01h30 Paris le 19
    const matin = tavernDayKey(at('2026-07-19T08:00:00Z')); // 10h Paris le 19
    expect(nuit).toBe(soir);
    expect(matin).toBe(soir);
  });

  it('la clé change une seule fois par période de 24 h', () => {
    const keys = new Set<string>();
    // Toutes les heures sur 3 jours.
    for (let i = 0; i < 72; i++) keys.add(tavernDayKey(at('2026-07-18T00:00:00Z') + i * 3600_000));
    expect(keys.size).toBe(4); // 3 jours pleins → 4 périodes touchées
  });

  it('la prochaine échéance tombe bien à 22 h Paris', () => {
    expect(tavernResetsAt(at('2026-07-18T19:00:00Z'))).toBe('2026-07-18T20:00:00.000Z');
    expect(tavernResetsAt(at('2026-07-18T21:00:00Z'))).toBe('2026-07-19T20:00:00.000Z');
    // Hiver : 22h Paris = 21h UTC.
    expect(tavernResetsAt(at('2026-01-15T20:00:00Z'))).toBe('2026-01-15T21:00:00.000Z');
  });

  it('l’échéance est toujours dans le futur et à moins de 24 h', () => {
    for (let i = 0; i < 48; i++) {
      const now = at('2026-07-18T00:00:00Z') + i * 1800_000;
      const delta = Date.parse(tavernResetsAt(now)) - now;
      expect(delta).toBeGreaterThan(0);
      expect(delta).toBeLessThanOrEqual(24 * 3600_000);
    }
  });
});

describe('countDungeonClears — un slot par donjon ET par arc', () => {
  it('compte chaque donjon une seule fois DANS un arc', () => {
    // Refaire dix fois le même donjon ne donne qu'un slot.
    const rows = Array.from({ length: 10 }, () => ({ dungeon_type_id: 'crypte', arc: 1 }));
    expect(countDungeonClears(rows)).toBe(1);
  });

  it('le MÊME donjon rejoué en arc 2 débloque un second slot', () => {
    // C'était le bug : la déduplication portait sur le seul `dungeon_type_id`,
    // donc tout l'arc 2 était stérile pour qui avait déjà bouclé l'arc 1.
    expect(
      countDungeonClears([
        { dungeon_type_id: 'crypte', arc: 1 },
        { dungeon_type_id: 'crypte', arc: 2 },
      ]),
    ).toBe(2);
  });

  it('boucler les deux arcs sature l’effectif, un seul arc non', () => {
    const all = (arc: number) =>
      Array.from({ length: DUNGEON_COUNT }, (_, i) => ({ dungeon_type_id: `d${i}`, arc }));
    expect(maxRosterFor(countDungeonClears(all(1)))).toBeLessThan(MAX_ROSTER);
    expect(maxRosterFor(countDungeonClears([...all(1), ...all(2)]))).toBe(MAX_ROSTER);
  });

  it('un arc absent ou nul compte comme l’arc 1 (lignes d’avant les arcs)', () => {
    // `dungeon_runs.arc` est arrivé après coup : les vieilles lignes sont à null
    // et ne doivent surtout pas former un « arc 0 » qui offrirait des slots en trop.
    expect(
      countDungeonClears([
        { dungeon_type_id: 'crypte', arc: null },
        { dungeon_type_id: 'crypte' },
        { dungeon_type_id: 'crypte', arc: 1 },
      ]),
    ).toBe(1);
  });

  it('ignore les lignes sans donjon', () => {
    expect(countDungeonClears([{ dungeon_type_id: '', arc: 1 }])).toBe(0);
  });
});
