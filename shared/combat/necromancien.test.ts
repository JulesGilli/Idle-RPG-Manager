import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import { isSummonId, summonerIdOf } from './summon.ts';
import type { CombatantInput, SummonTemplate } from './types.ts';
import { allNodes, computeAbilities } from '../progression/skills.ts';

describe('compilation des compétences Nécromancien', () => {
  it('expose bien les passifs d’invocation (pas jetés par mergeAbilities)', () => {
    const learned: Record<string, number> = {};
    for (const n of allNodes('necromancien')) learned[n.id] = n.maxRank;
    const kinds = computeAbilities('necromancien', learned).map((a) => a.kind);
    for (const k of ['summon_pool', 'summon_buff', 'summon_explode', 'bone_stack', 'bone_ritual']) {
      expect(kinds, `${k} manquant`).toContain(k);
    }
    // Les DEUX buffs d'invocation (ATK Légion + PV Colosse) coexistent.
    expect(kinds.filter((k) => k === 'summon_buff')).toHaveLength(2);
  });
});

function necro(overrides: Partial<CombatantInput> = {}): CombatantInput {
  return { id: 'necro', name: 'Nécromancien', role: 'dps', hp: 2000, atk: 40, def: 5, speed: 20, ...overrides };
}
function foe(overrides: Partial<CombatantInput> = {}): CombatantInput {
  return { id: 'e1', name: 'Ennemi', role: 'enemy', hp: 100, atk: 20, def: 5, speed: 10, ...overrides };
}

const POOL: SummonTemplate[] = [
  { name: 'Guerrier squelette', atkMult: 0.16, hpMult: 0.32, defMult: 0.15 },
  { name: 'Archer squelette', atkMult: 0.24, hpMult: 0.24 },
  { name: 'Mage squelette', atkMult: 0.32, hpMult: 0.2 },
];

/** Invocations alliées présentes dans l'état final (par nom). */
function summonNames(finalState: { id: string; name: string }[], ownerId: string): string[] {
  return finalState.filter((c) => isSummonId(c.id) && summonerIdOf(c.id) === ownerId).map((c) => c.name);
}

describe('summon_pool (Légion — invocation aléatoire)', () => {
  it('au rang max (distinct), invoque une créature de CHAQUE gabarit', () => {
    const n = necro({ abilities: [{ kind: 'summon_pool', count: 3, distinct: true, templates: POOL }] });
    const res = resolveCombat({ allies: [n], enemies: [foe({ hp: 5000, atk: 1 })], seed: 7 });
    const names = summonNames(res.finalState, 'necro');
    expect(names.sort()).toEqual(['Archer squelette', 'Guerrier squelette', 'Mage squelette']);
  });

  it('hors distinct, invoque exactement `count` créatures', () => {
    const n = necro({ abilities: [{ kind: 'summon_pool', count: 2, distinct: false, templates: POOL }] });
    const res = resolveCombat({ allies: [n], enemies: [foe({ hp: 5000, atk: 1 })], seed: 3 });
    expect(summonNames(res.finalState, 'necro')).toHaveLength(2);
  });
});

describe('summon_buff (PV) — Ossature colossale', () => {
  it('augmente les PV max des invocations', () => {
    const base = necro({ abilities: [{ kind: 'summon_pool', count: 1, distinct: false, templates: [POOL[0]!] }] });
    const buffed = necro({
      abilities: [
        { kind: 'summon_pool', count: 1, distinct: false, templates: [POOL[0]!] },
        { kind: 'summon_buff', stat: 'hp', value: 0.5 },
      ],
    });
    const hpOf = (input: CombatantInput) => {
      const res = resolveCombat({ allies: [input], enemies: [foe({ hp: 5000, atk: 1 })], seed: 2 });
      const s = res.finalState.find((c) => isSummonId(c.id));
      return s!.maxHp;
    };
    expect(hpOf(buffed)).toBeGreaterThan(hpOf(base));
  });
});

describe('summon_explode (Ossuaire — % de vie)', () => {
  it('explose à la mort pour une part des PV max, en zone', () => {
    const n = necro({
      hp: 5000,
      abilities: [
        { kind: 'summon_pool', count: 1, distinct: false, templates: [{ name: 'Squelette', atkMult: 0.1, hpMult: 0.02 }] },
        { kind: 'summon_explode', hpFrac: 0.6 },
      ],
    });
    // Ennemi qui tue vite le squelette fragile → explosion.
    const res = resolveCombat({ allies: [n], enemies: [foe({ hp: 3000, atk: 300, speed: 99 })], seed: 5 });
    expect(res.events.some((e) => e.type === 'status' && e.message.includes('explose'))).toBe(true);
  });
});

describe('summon_hero (ultime — une seule fois)', () => {
  it('invoque un héros-squelette, une seule fois dans le combat', () => {
    const heroes: SummonTemplate[] = [{ name: 'Champion squelette', hpMult: 0.8, atkMult: 0.4, defMult: 1 }];
    const n = necro({
      hp: 5000,
      atk: 5,
      abilities: [{ kind: 'autocast', everyRounds: 2, action: { type: 'summon_hero', withSpecials: false, templates: heroes } }],
    });
    const res = resolveCombat({ allies: [n], enemies: [foe({ hp: 5000, atk: 5, def: 50 })], seed: 4 });
    const champions = summonNames(res.finalState, 'necro').filter((x) => x === 'Champion squelette');
    expect(champions).toHaveLength(1);
  });
});

describe('perce-armure permanent des invocations', () => {
  it('un squelette entame une cible blindée HORS assaut', () => {
    // Le cas qui motivait le changement : sans perçage permanent, une invocation
    // n'hérite que d'une fraction de l'ATK du lanceur et tapait au plancher de 1
    // dès que l'armure montait — donc partout après les premières zones.
    const n = necro({
      hp: 5000,
      atk: 600,
      abilities: [{ kind: 'summon_pool', count: 1, distinct: false, templates: [POOL[2]!] }],
    });
    const res = resolveCombat({
      allies: [n],
      enemies: [foe({ hp: 500000, atk: 1, def: 150 })],
      seed: 5,
    });
    const hits = res.events.filter((e) => e.type === 'attack' && isSummonId(e.actorId));
    expect(hits.length).toBeGreaterThan(0);
    // Strictement au-dessus du plancher : c'est toute la question.
    expect(Math.max(...hits.map((e) => (e.type === 'attack' ? e.damage : 0)))).toBeGreaterThan(1);
  });

  it('un héros-squelette pèse plus lourd que le pool entier sur son axe', () => {
    // L'ultime (15 points, UNE unité, UNE fois par combat) doit dominer le passif
    // qui donne trois squelettes en permanence. Les gabarits de l'ultime étant
    // FIXES alors que le pool monte avec le rang, c'est au rang 5 que la
    // comparaison est la plus dure — donc le seul rang qui vaille d'être testé.
    // Les deux jeux de gabarits sont lus depuis les compétences COMPILÉES au rang
    // max : recopier les chiffres ici les aurait laissés diverger en silence.
    const learned: Record<string, number> = {};
    for (const n of allNodes('necromancien')) learned[n.id] = n.maxRank;
    const abilities = computeAbilities('necromancien', learned);
    const pool = abilities.find((a) => a.kind === 'summon_pool');
    const avatar = abilities.find(
      (a) => a.kind === 'autocast' && a.action.type === 'summon_hero',
    );
    if (pool?.kind !== 'summon_pool') throw new Error('summon_pool introuvable');
    if (avatar?.kind !== 'autocast' || avatar.action.type !== 'summon_hero') {
      throw new Error('summon_hero introuvable');
    }
    const POOL_MAX_ATK = pool.templates.reduce((s, t) => s + t.atkMult, 0);
    const POOL_MAX_HP = pool.templates.reduce((s, t) => s + t.hpMult, 0);
    const heroes = avatar.action.templates;
    const champion = heroes.find((h) => h.name.startsWith('Champion'))!;
    const archer = heroes.find((h) => h.name.startsWith("Archer d'élite"))!;
    const archimage = heroes.find((h) => h.name.startsWith('Archimage'))!;
    // Le plus fragile du pool sert de plancher aux « élites ».
    const poolMinHp = Math.min(...pool.templates.map((t) => t.hpMult));

    // Le tank encaisse plus que les trois réunis ; le mage frappe plus fort qu'eux trois.
    expect(champion.hpMult).toBeGreaterThan(POOL_MAX_HP);
    expect(archimage.atkMult).toBeGreaterThan(POOL_MAX_ATK);
    // Et aucun « élite » ne doit être plus fragile que le plus fragile des petits
    // squelettes — c'était le cas de l'Archimage (0.40 contre 0.44).
    for (const h of heroes) expect(h.hpMult).toBeGreaterThan(poolMinHp);
    // L'archer d'élite se situe entre les deux, jamais sous le pool en ATK.
    expect(archer.atkMult).toBeGreaterThanOrEqual(POOL_MAX_ATK);
  });

  it('la créature mortuaire perce aussi, comme les squelettes', () => {
    // Elle naît d'un chemin d'invocation DIFFÉRENT (spawnMid au rituel, pas le
    // pool de début de combat) : ce test verrouille le fait que les deux chemins
    // passent bien par la même fabrique et héritent donc du même perçage.
    const n = necro({
      hp: 5000,
      atk: 600,
      abilities: [
        { kind: 'bone_stack', chance: 1 },
        { kind: 'bone_ritual', threshold: 2, hpMult: 1, atkMult: 1, name: 'Créature mortuaire' },
      ],
    });
    const res = resolveCombat({
      allies: [n],
      enemies: [foe({ hp: 500000, atk: 1, def: 300 })],
      seed: 6,
    });
    const creature = res.finalState.find((c) => c.name === 'Créature mortuaire');
    expect(creature).toBeTruthy();
    const hits = res.events.filter(
      (e) => e.type === 'attack' && e.actorId === creature!.id,
    );
    expect(hits.length).toBeGreaterThan(0);
    // Son ATK vaut 100 % de celle du nécro (atkMult 1) : sans perçage elle ferait
    // 600 − 300 = 300. Avec 60 % de perçage, la mitigation tombe à 120.
    expect(Math.max(...hits.map((e) => (e.type === 'attack' ? e.damage : 0)))).toBeGreaterThan(300);
  });
});

describe('summon_assault (actif Légion)', () => {
  it('déclenche l’assaut (le lanceur + ses invocations frappent)', () => {
    const n = necro({
      hp: 5000,
      abilities: [
        { kind: 'summon_pool', count: 1, distinct: false, templates: [POOL[0]!] },
        { kind: 'autocast', everyRounds: 2, action: { type: 'summon_assault', dmgMult: 0.15 } },
      ],
    });
    const res = resolveCombat({ allies: [n], enemies: [foe({ hp: 5000, atk: 5, def: 30 })], seed: 9 });
    expect(res.events.some((e) => e.type === 'status' && e.message.includes('assaut'))).toBe(true);
    // Une invocation a bien porté une attaque (id d'invocation acteur d'un event attack).
    expect(res.events.some((e) => e.type === 'attack' && isSummonId(e.actorId))).toBe(true);
  });

  it('le perce-armure profite AUSSI aux invocations, pas seulement au lanceur', () => {
    // Calibrage : les squelettes du gabarit héritent de 6 % de l'ATK du nécro, il
    // faut donc une ATK haute ET une DEF choisie pour que la mitigation morde sans
    // écraser — sinon les deux cas tombent au plancher de 1 dégât et ne se
    // distinguent pas. On ne mesure QUE les coups des invocations.
    const build = (armorPen: number): CombatantInput =>
      necro({
        hp: 5000,
        atk: 5000,
        abilities: [
          { kind: 'summon_pool', count: 3, distinct: false, templates: [POOL[0]!] },
          { kind: 'autocast', everyRounds: 2, action: { type: 'summon_assault', dmgMult: 0, armorPen } },
        ],
      });
    const summonDamage = (armorPen: number): number => {
      const res = resolveCombat({
        allies: [build(armorPen)],
        enemies: [foe({ hp: 2000000, atk: 1, def: 250 })],
        seed: 9,
      });
      return res.events
        .filter((e) => e.type === 'attack' && isSummonId(e.actorId))
        .reduce((s, e) => s + (e.type === 'attack' ? e.damage : 0), 0);
    };
    expect(summonDamage(0.8)).toBeGreaterThan(summonDamage(0));
    // Perçage TOTAL (valeur réellement utilisée par la compétence) : encore
    // au-dessus, et surtout pas de division par zéro ni de plancher parasite.
    expect(summonDamage(1)).toBeGreaterThan(summonDamage(0.8));
  });

  it('à 100 % de perce-armure, la mitigation de la cible ne retire plus rien', () => {
    // Deux cibles de DEF radicalement différentes doivent encaisser EXACTEMENT
    // les mêmes dégâts : c'est la définition d'un perçage total.
    // On isole une frappe d'ASSAUT : le nécro attaque aussi normalement les autres
    // manches, et ces coups-là ne percent rien. Sommer tout mélangeait les deux, et
    // la durée du combat variant avec la DEF, on comparait des nombres de coups
    // différents plutôt que la mitigation.
    const n = (): CombatantInput =>
      necro({
        hp: 5000,
        atk: 1000,
        abilities: [
          { kind: 'autocast', everyRounds: 2, action: { type: 'summon_assault', dmgMult: 0, armorPen: 1 } },
        ],
      });
    const assaultHit = (def: number): number => {
      const res = resolveCombat({
        allies: [n()],
        enemies: [foe({ hp: 2000000, atk: 1, def })],
        seed: 4,
      });
      const assaultRounds = new Set(
        res.events.filter((e) => e.type === 'status' && e.message.includes("lance l'assaut")).map((e) => e.round),
      );
      const hit = res.events.find(
        (e) => e.type === 'attack' && e.actorId === 'necro' && assaultRounds.has(e.round),
      );
      return hit && hit.type === 'attack' ? hit.damage : -1;
    };
    expect(assaultHit(500)).toBeGreaterThan(0);
    expect(assaultHit(500)).toBe(assaultHit(5));
  });
});

describe('bone_stack + bone_ritual (Colosse — stacks d’os → créature)', () => {
  it('au seuil de stacks, invoque une fois la créature mortuaire', () => {
    const n = necro({
      hp: 5000,
      atk: 5,
      abilities: [
        { kind: 'bone_stack', chance: 1 },
        { kind: 'bone_ritual', threshold: 3, hpMult: 1.4, atkMult: 1, name: 'Créature mortuaire' },
      ],
    });
    const res = resolveCombat({ allies: [n], enemies: [foe({ hp: 5000, atk: 5, def: 50 })], seed: 6 });
    expect(res.events.some((e) => e.type === 'status' && e.message.includes('rituel'))).toBe(true);
    expect(summonNames(res.finalState, 'necro')).toContain('Créature mortuaire');
  });
});

describe('les invocations ne peuvent pas être soignées', () => {
  // Un allié soigneur (heal_aura + soin de zone) qui a de quoi guérir, un
  // nécro qui invoque une créature fragile, et un ennemi qui la blesse : quelle
  // que soit la source de soin, aucun event `heal` ne doit cibler l'invocation.
  const healer = (): CombatantInput => ({
    id: 'healer',
    name: 'Soigneur',
    role: 'healer',
    hp: 3000,
    atk: 200,
    def: 5,
    speed: 30,
    abilities: [
      { kind: 'heal_aura', pct: 0.5 },
      { kind: 'autocast', everyRounds: 2, action: { type: 'heal_all', pct: 0.9 } },
      { kind: 'team_hot', chance: 1, pct: 0.3, duration: 5 },
    ],
  });

  it('aucun soin (aura / zone / HoT / rôle soigneur) ne cible une invocation', () => {
    const n = necro({
      abilities: [{ kind: 'summon_pool', count: 1, distinct: false, templates: [{ name: 'Squelette', atkMult: 0.1, hpMult: 0.5 }] }],
    });
    // Ennemi qui blesse la créature sans la tuer d'un coup → elle reste une cible
    // « blessée » que les soins voudraient normalement prioriser.
    const res = resolveCombat({ allies: [healer(), n], enemies: [foe({ hp: 8000, atk: 60, speed: 5 })], seed: 11 });
    const healedSummon = res.events.filter((e) => e.type === 'heal' && isSummonId(e.targetId));
    expect(healedSummon).toHaveLength(0);
    // Sanity : le soigneur soigne bien quelqu'un (un VRAI allié) au moins une fois.
    expect(res.events.some((e) => e.type === 'heal' && !isSummonId(e.targetId) && e.actorId === 'healer')).toBe(true);
  });
});

describe('sacrifice_transfer (Communion — auto-sacrifice)', () => {
  it('le nécromancien meurt et renforce sa créature mortuaire', () => {
    const n = necro({
      hp: 4000,
      atk: 5,
      abilities: [
        { kind: 'bone_stack', chance: 1 },
        { kind: 'bone_ritual', threshold: 2, hpMult: 1, atkMult: 1, name: 'Créature mortuaire' },
        { kind: 'autocast', everyRounds: 3, action: { type: 'sacrifice_transfer', pctPerStack: 1, creatureName: 'Créature mortuaire' } },
      ],
    });
    const res = resolveCombat({ allies: [n], enemies: [foe({ hp: 8000, atk: 5, def: 80 })], seed: 8 });
    const necroDead = res.finalState.find((c) => c.id === 'necro' && !c.alive);
    const creature = res.finalState.find((c) => c.name === 'Créature mortuaire');
    expect(necroDead).toBeTruthy();
    expect(creature).toBeTruthy();
    // La créature a reçu les PV du nécro (maxHp > sa base = 1× les 4000 PV du nécro).
    expect(creature!.maxHp).toBeGreaterThan(4000);
  });
});

describe('Assaut d’os — régénération des invocations', () => {
  /** Nécro avec 2 squelettes et l'assaut équipé, face à un sac de frappe. */
  function necroAssault(healFrac?: number): CombatantInput {
    return necro({
      id: 'necro',
      name: 'Nécromancien',
      hp: 2000,
      atk: 200,
      speed: 20,
      abilities: [
        {
          kind: 'summon_pool',
          count: 2,
          distinct: false,
          templates: [{ name: 'Squelette', atkMult: 0.5, hpMult: 0.5 }],
        },
        {
          kind: 'autocast',
          everyRounds: 2,
          action:
            healFrac === undefined
              ? { type: 'summon_assault', dmgMult: 0.15 }
              : { type: 'summon_assault', dmgMult: 0.15, summonHealFrac: healFrac },
        },
      ],
    });
  }

  it('soigne les invocations pendant l’assaut', () => {
    const res = resolveCombat({
      allies: [necroAssault(0.5)],
      enemies: [foe({ hp: 100000, atk: 120, speed: 5 })],
      seed: 21,
    });
    const heals = res.events.filter(
      (e) => e.type === 'heal' && e.message.includes('régénère'),
    );
    expect(heals.length).toBeGreaterThan(0);
  });

  it('sans la part de soin, aucune régénération (l’effet vient bien du champ)', () => {
    const res = resolveCombat({
      allies: [necroAssault()],
      enemies: [foe({ hp: 100000, atk: 120, speed: 5 })],
      seed: 21,
    });
    expect(res.events.some((e) => e.type === 'heal' && e.message.includes('régénère'))).toBe(false);
  });

  it('le soin est PROPORTIONNEL à la part configurée', () => {
    // Rien ne vérifiait que `summonHealFrac` pilotait l'AMPLEUR du soin, seulement
    // sa présence : doubler la valeur pouvait n'avoir aucun effet sans qu'un test
    // ne bronche. On somme les PV rendus plutôt que de compter les événements.
    const healed = (healFrac: number): number => {
      const res = resolveCombat({
        allies: [necroAssault(healFrac)],
        enemies: [foe({ hp: 100000, atk: 120, speed: 5 })],
        seed: 21,
      });
      return res.events
        .filter((e) => e.type === 'heal' && e.message.includes('régénère'))
        .reduce((s, e) => s + (e.type === 'heal' ? e.amount : 0), 0);
    };
    expect(healed(1)).toBeGreaterThan(healed(0.5));
    expect(healed(2)).toBeGreaterThan(healed(1));
  });

  it('les invocations tiennent PLUS longtemps grâce au soin', () => {
    const survivors = (healFrac?: number) => {
      const res = resolveCombat({
        allies: [necroAssault(healFrac)],
        enemies: [foe({ hp: 100000, atk: 120, speed: 5 })],
        seed: 21,
      });
      return res.finalState.filter((c) => isSummonId(c.id) && c.hp > 0).length;
    };
    expect(survivors(0.5)).toBeGreaterThanOrEqual(survivors());
  });

  it('un soin normal reste INTERDIT sur une invocation (règle inchangée)', () => {
    const soigneur = necro({
      id: 'heal',
      name: 'Soigneur',
      atk: 10,
      speed: 30,
      abilities: [{ kind: 'heal_aura', pct: 0.5 }],
    });
    const caster = necroAssault();
    const res = resolveCombat({
      allies: [caster, soigneur],
      enemies: [foe({ hp: 100000, atk: 120, speed: 5 })],
      seed: 7,
    });
    const healsOnSummons = res.events.filter(
      (e) => e.type === 'heal' && isSummonId(e.targetId),
    );
    expect(healsOnSummons).toHaveLength(0);
  });
});
