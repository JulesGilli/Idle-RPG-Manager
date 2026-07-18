import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import type { Ability, CombatantInput } from './types.ts';
import { allNodes, describeNodeEffects } from '../progression/skills.ts';

const CREATURE = 'Créature mortuaire';
/** Rituel quasi immédiat : 1 stack d'os suffit à dresser la créature. */
const RITUAL: Ability = { kind: 'bone_ritual', threshold: 1, hpMult: 1, atkMult: 1, name: CREATURE };
const STACKS: Ability = { kind: 'bone_stack', chance: 1 };

function necro(extra: Ability[]): CombatantInput {
  return {
    id: 'necro', name: 'Nécromancien', role: 'dps', hp: 20000, atk: 100, def: 20, speed: 20,
    abilities: [STACKS, RITUAL, ...extra],
  };
}
const foe = (o: Partial<CombatantInput> = {}): CombatantInput => ({
  id: 'e1', name: 'Ennemi', role: 'enemy', hp: 60000, atk: 30, def: 5, speed: 5, ...o,
});

describe('Charnier — plus besoin de cadavre', () => {
  const charnier: Ability = {
    kind: 'autocast', everyRounds: 4,
    action: { type: 'creature_aoe', dmgMult: 2, creatureName: CREATURE },
  };

  it('se déclenche alors que PERSONNE n’est mort', () => {
    // Aucun combattant ne meurt : l'ancienne version restait muette.
    const res = resolveCombat({ allies: [necro([charnier])], enemies: [foe()], seed: 3 });
    expect(res.events.some((e) => e.type === 'death')).toBe(false);
    expect(res.events.some((e) => e.type === 'status' && e.message.includes('déchaîne'))).toBe(true);
  });

  it('frappe TOUS les ennemis', () => {
    const res = resolveCombat({
      allies: [necro([charnier])],
      enemies: [foe(), foe({ id: 'e2', name: 'Ennemi 2' })],
      seed: 3,
    });
    const hit = (id: string) =>
      res.events.some((e) => e.type === 'attack' && e.targetId === id && e.message.includes("l'ossuaire"));
    expect(hit('e1')).toBe(true);
    expect(hit('e2')).toBe(true);
  });

  it('les dégâts suivent l’ATK de la CRÉATURE, pas celle du nécromancien', () => {
    // atkMult du rituel double → créature deux fois plus forte, coup deux fois plus fort.
    const burst = (atkMult: number) => {
      const ritual: Ability = { kind: 'bone_ritual', threshold: 1, hpMult: 1, atkMult, name: CREATURE };
      const hero: CombatantInput = {
        id: 'necro', name: 'Nécro', role: 'dps', hp: 20000, atk: 100, def: 20, speed: 20,
        abilities: [STACKS, ritual, charnier],
      };
      const res = resolveCombat({ allies: [hero], enemies: [foe()], seed: 3 });
      const first = res.events.find((e) => e.type === 'attack' && e.message.includes("l'ossuaire"));
      return first ? (first as { damage: number }).damage : 0;
    };
    expect(burst(2)).toBeGreaterThan(burst(1));
  });
});

describe('Communion d’os — délai après l’invocation', () => {
  const communion = (delayRounds?: number): Ability => ({
    kind: 'autocast', everyRounds: 2,
    action: delayRounds === undefined
      ? { type: 'sacrifice_transfer', pct: 1, creatureName: CREATURE }
      : { type: 'sacrifice_transfer', pct: 1, creatureName: CREATURE, delayRounds },
  });
  const sacrificeRound = (a: Ability): number | null => {
    const res = resolveCombat({ allies: [necro([a])], enemies: [foe()], seed: 3 });
    const ritual = res.events.find((e) => e.type === 'status' && e.message.includes('se dresse'));
    const sac = res.events.find((e) => e.type === 'status' && e.message.includes('se fond dans'));
    if (!ritual || !sac) return null;
    return sac.round - ritual.round;
  };

  it('attend bien 12 manches après l’invocation', () => {
    const delta = sacrificeRound(communion(12));
    expect(delta).not.toBeNull();
    expect(delta!).toBeGreaterThanOrEqual(12);
  });

  it('sans délai, elle part beaucoup plus tôt (le garde vient bien du champ)', () => {
    const avecDelai = sacrificeRound(communion(12));
    const sansDelai = sacrificeRound(communion());
    expect(sansDelai!).toBeLessThan(avecDelai!);
  });
});

describe('Colosse — descriptions', () => {
  const node = (id: string) => allNodes('necromancien').find((n) => n.id === id)!;

  it('le Charnier ne parle plus de cadavre', () => {
    const txt = describeNodeEffects(node('n_col_charnier'), 1)[0]!;
    expect(txt).not.toContain('cadavre');
    expect(txt).toContain('200 %');
  });

  it('la Communion annonce son délai', () => {
    expect(describeNodeEffects(node('n_col_communion'), 1)[0]).toContain('12 tours');
  });
});

describe('Arrivée en cours de combat — spawnRound', () => {
  /** Seuil à 3 stacks → le rituel demande plusieurs manches avant de partir. */
  const tardif = (): CombatantInput => ({
    id: 'necro', name: 'Nécromancien', role: 'dps', hp: 20000, atk: 100, def: 20, speed: 20,
    abilities: [
      { kind: 'bone_stack', chance: 1 },
      { kind: 'bone_ritual', threshold: 3, hpMult: 1, atkMult: 1, name: CREATURE },
    ],
  });

  it('la créature mortuaire porte sa manche d’apparition', () => {
    const res = resolveCombat({ allies: [tardif()], enemies: [foe()], seed: 3 });
    const creature = res.finalState.find((c) => c.name === CREATURE);
    expect(creature).toBeDefined();
    expect(creature!.spawnRound).toBeGreaterThan(1); // née APRÈS le début
  });

  it('elle coïncide avec l’événement du rituel', () => {
    const res = resolveCombat({ allies: [necro([])], enemies: [foe()], seed: 3 });
    const rituel = res.events.find((e) => e.type === 'status' && e.message.includes('se dresse'));
    const creature = res.finalState.find((c) => c.name === CREATURE);
    expect(creature!.spawnRound).toBe(rituel!.round);
  });

  it('les combattants présents dès le départ n’en portent PAS', () => {
    const res = resolveCombat({ allies: [necro([])], enemies: [foe()], seed: 3 });
    expect(res.finalState.find((c) => c.id === 'necro')!.spawnRound).toBeUndefined();
    expect(res.finalState.find((c) => c.id === 'e1')!.spawnRound).toBeUndefined();
  });

  it('les invocations de DÉPART n’en portent pas non plus', () => {
    // Pool posé au setup → présentes dès la manche 1, donc aucun spawnRound.
    const invocateur: CombatantInput = {
      id: 'inv', name: 'Invocateur', role: 'dps', hp: 900, atk: 60, def: 10, speed: 12,
      abilities: [{ kind: 'summon', count: 2, hpMult: 0.3, atkMult: 0.3, defMult: 0, summonName: 'Squelette' }],
    };
    const res = resolveCombat({ allies: [invocateur], enemies: [foe()], seed: 3 });
    const summons = res.finalState.filter((c) => c.name === 'Squelette');
    expect(summons.length).toBe(2);
    expect(summons.every((c) => c.spawnRound === undefined)).toBe(true);
  });
});

describe('Tas d’os — la créature n’existe pas avant le rituel', () => {
  /** Seuil 3 → plusieurs manches avant l'apparition, ennemi qui frappe fort. */
  const lent = (): CombatantInput => ({
    id: 'necro', name: 'Nécromancien', role: 'dps', hp: 20000, atk: 100, def: 20, speed: 20,
    abilities: [
      { kind: 'bone_stack', chance: 1 },
      { kind: 'bone_ritual', threshold: 3, hpMult: 1, atkMult: 1, name: CREATURE },
    ],
  });

  it('elle ne peut PAS être ciblée avant son apparition', () => {
    const res = resolveCombat({ allies: [lent()], enemies: [foe({ atk: 200 })], seed: 3 });
    const creature = res.finalState.find((c) => c.name === CREATURE)!;
    const touchéeAvant = res.events.some(
      (e) => e.type === 'attack' && e.targetId === creature.id && e.round < creature.spawnRound!,
    );
    expect(touchéeAvant).toBe(false);
  });

  it('elle n’agit pas non plus avant', () => {
    const res = resolveCombat({ allies: [lent()], enemies: [foe({ atk: 200 })], seed: 3 });
    const creature = res.finalState.find((c) => c.name === CREATURE)!;
    const agitAvant = res.events.some(
      (e) => e.type === 'attack' && e.actorId === creature.id && e.round < creature.spawnRound!,
    );
    expect(agitAvant).toBe(false);
  });

  it('la progression du rituel est exposée (ossements / seuil)', () => {
    const res = resolveCombat({ allies: [lent()], enemies: [foe()], seed: 3 });
    const os = res.events.filter(
      (e): e is Extract<typeof e, { type: 'status' }> =>
        e.type === 'status' && e.bones !== undefined,
    );
    expect(os.length).toBeGreaterThan(0);
    expect(os[0]!.bones).toBe(1);
    expect(os[0]!.bonesNeeded).toBe(3);
    // Le compteur monte jusqu'au seuil, puis la récolte S'ARRÊTE : les ossements
    // ne servent qu'au rituel, en ramasser après revient à gâcher des attaques.
    expect(os.map((e) => e.bones)).toEqual([1, 2, 3]);
  });

  it('aucune récolte sans rituel appris (attaques gâchées pour rien)', () => {
    const sansRituel: CombatantInput = {
      id: 'necro', name: 'Nécromancien', role: 'dps', hp: 20000, atk: 100, def: 20, speed: 20,
      abilities: [{ kind: 'bone_stack', chance: 1 }],
    };
    const res = resolveCombat({ allies: [sansRituel], enemies: [foe()], seed: 3 });
    expect(res.events.some((e) => e.type === 'status' && e.bones !== undefined)).toBe(false);
  });
});
