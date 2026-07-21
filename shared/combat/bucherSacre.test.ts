import { describe, expect, it } from 'vitest';
import { resolveCombat } from './resolveCombat.ts';
import type { Ability, CombatantInput } from './types.ts';
import { allNodes, computeAbilities } from '../progression/skills.ts';

/**
 * BÛCHER SACRÉ — l'ultime ne pose aucun dégât : il DÉMULTIPLIE les afflictions
 * de toute l'équipe (plafond de cumul ×2, durée ×2), dès la manche 1.
 *
 * Chaque test compare la même équipe AVEC et SANS l'ultime : c'est le seul moyen
 * de prouver que l'effet vient bien de lui et pas du hasard de la seed.
 */

/** L'ultime tel que le construit réellement l'arbre de compétences (rang 1). */
const BUCHER: Ability = (() => {
  const built = computeAbilities(
    'inquisiteur',
    { i_buc_bucher: 1 },
    { activeId: null, ultimateId: 'i_buc_bucher' },
  ).find((a) => a.kind === 'amplify_marks');
  if (!built) throw new Error('Bûcher sacré introuvable dans l’arbre Inquisiteur');
  return built;
})();

/** Inquisiteur rapide (il doit lancer AVANT que ses alliés ne posent leurs DoT). */
const inq = (abilities: Ability[]): CombatantInput => ({
  id: 'inq',
  name: 'Inquisiteur',
  role: 'dps',
  hp: 5000,
  atk: 1, // inoffensif : on mesure ce que font les AUTRES
  def: 10,
  speed: 99,
  abilities,
});

const foe = (o: Partial<CombatantInput> = {}): CombatantInput => ({
  id: 'e1',
  name: 'Ennemi',
  role: 'enemy',
  hp: 400_000,
  atk: 1,
  def: 5,
  speed: 1,
  ...o,
});

describe('Bûcher sacré — câblage dans l’arbre', () => {
  const node = allNodes('inquisiteur').find((n) => n.id === 'i_buc_bucher')!;

  it('garde son id (les rangs déjà investis sont conservés)', () => {
    expect(node).toBeDefined();
    expect(node.name).toContain('Bûcher');
  });

  it('déclenche l’amplification, à l’échelle de l’ÉQUIPE et ×2', () => {
    expect(BUCHER.kind).toBe('amplify_marks');
    const a = BUCHER as { scope: string; stackMult: number; dotMult: number; atRound: number };
    expect(a.scope).toBe('team');
    expect(a.stackMult).toBe(2);
    expect(a.dotMult).toBe(2);
  });

  it('part dès la manche 1', () => {
    // PAS un `autocast` : leur période est plancherée à 2 manches
    // (`activePeriod`), l'ultime n'aurait jamais pu partir au tour 1.
    expect((BUCHER as { atRound: number }).atRound).toBe(1);
  });
});

describe('Bûcher sacré — plafond de MARQUES doublé (feu du mage / de l’inquisiteur)', () => {
  /**
   * Sonde binaire : un allié pose des marques (plafond 5) et détone à 8.
   * Sans l'ultime le plafond de 5 n'atteint JAMAIS 8 → aucune explosion.
   * Avec, le plafond passe à 10 → le seuil est franchi. Le message d'explosion
   * est donc la preuve directe que le plafond a doublé.
   */
  const mage = (): CombatantInput => ({
    id: 'mage',
    name: 'Mage',
    role: 'dps',
    hp: 5000,
    atk: 50,
    def: 5,
    speed: 50,
    abilities: [
      { kind: 'stack_on_hit', mark: 'burn', chance: 1, max: 5 },
      { kind: 'detonate', mark: 'burn', threshold: 8, dmgMult: 1 },
    ],
  });

  const exploded = (withUlt: boolean) => {
    const res = resolveCombat({
      allies: withUlt ? [inq([BUCHER]), mage()] : [inq([]), mage()],
      enemies: [foe()],
      seed: 9,
      maxRounds: 30,
    });
    return res.events.some((e) => e.type === 'status' || e.type === 'attack'
      ? e.message.includes('fait exploser')
      : false);
  };

  it('sans l’ultime, le plafond de 5 ne franchit jamais le seuil de 8', () => {
    expect(exploded(false)).toBe(false);
  });

  it('avec l’ultime, le plafond passe à 10 et le seuil est franchi', () => {
    expect(exploded(true)).toBe(true);
  });
});

describe('Bûcher sacré — plafond de CUMUL du poison doublé (archer)', () => {
  /**
   * Le poison n'empile pas des « marques » mais des TICS qui s'additionnent,
   * plafonnés à POISON_MAX_STACKS × le tic de base. On lit donc le tic le plus
   * fort du combat : il vaut base×5 sans l'ultime, base×10 avec.
   */
  const archer = (): CombatantInput => ({
    id: 'arc',
    name: 'Archer',
    role: 'dps',
    hp: 5000,
    atk: 100,
    def: 5,
    speed: 50,
    abilities: [{ kind: 'on_hit', status: 'poison', chance: 1, potency: 0.2, duration: 30 }],
  });

  const maxPoisonTick = (withUlt: boolean) => {
    const res = resolveCombat({
      allies: withUlt ? [inq([BUCHER]), archer()] : [inq([]), archer()],
      enemies: [foe()],
      seed: 3,
      maxRounds: 30,
    });
    return res.events
      .filter((e) => e.type === 'attack' && e.status === 'poison' && e.targetId === 'e1')
      .reduce((max, e) => Math.max(max, (e as { damage: number }).damage), 0);
  };

  it('le tic maximal DOUBLE avec l’ultime', () => {
    const sans = maxPoisonTick(false);
    const avec = maxPoisonTick(true);
    expect(sans).toBeGreaterThan(0);
    // Tolérance d'un point d'arrondi : le tic de base est arrondi avant cumul.
    expect(avec).toBeGreaterThanOrEqual(sans * 2 - 2);
    expect(avec).toBeLessThanOrEqual(sans * 2 + 2);
  });
});

describe('Bûcher sacré — DURÉE des afflictions doublée', () => {
  /**
   * La durée ne se VOIT qu'une fois le poseur hors-jeu : tant qu'il frappe, il
   * rafraîchit la brûlure à chaque tour et elle ne s'épuise jamais. D'où un
   * « brûleur » à 1 PV, qui pose la brûlure puis meurt au premier coup reçu.
   *
   * Le monstre choisit sa cible AU HASARD entre les deux alliés : la manche où
   * le brûleur tombe varie donc d'une seed à l'autre. On agrège plusieurs seeds
   * plutôt que d'en figer une — un test qui ne tiendrait que sur `seed: 7`
   * mesurerait ce tirage-là, pas l'effet de l'ultime.
   */
  const burnTicks = (withUlt: boolean, seed: number) => {
    const bruleur: CombatantInput = {
      id: 'brl',
      name: 'Brûleur',
      role: 'dps',
      hp: 1,
      atk: 80,
      def: 0,
      speed: 60,
      abilities: [{ kind: 'on_hit', status: 'burn', chance: 1, potency: 0.2, duration: 2 }],
    };
    const res = resolveCombat({
      // Inquisiteur très résistant : le combat doit durer assez pour que la
      // brûlure s'épuise, sinon on mesurerait la fin du combat, pas la durée.
      allies: withUlt ? [{ ...inq([BUCHER]), hp: 500_000 }, bruleur] : [{ ...inq([]), hp: 500_000 }, bruleur],
      enemies: [foe({ atk: 50, speed: 55 })],
      seed,
      maxRounds: 40,
    });
    return res.events.filter(
      (e) => e.type === 'attack' && e.status === 'burn' && e.targetId === 'e1',
    ).length;
  };

  const total = (withUlt: boolean) =>
    [1, 2, 3, 4, 5, 6, 7, 8].reduce((sum, s) => sum + burnTicks(withUlt, s), 0);

  it('la brûlure tique nettement plus longtemps', () => {
    const sans = total(false);
    const avec = total(true);
    expect(sans).toBeGreaterThan(0);
    // Durée ×2 : on attend ~le double de tics. Marge basse à ×1,5 pour absorber
    // les manches où le brûleur meurt plus ou moins tôt selon la seed.
    expect(avec).toBeGreaterThanOrEqual(Math.round(sans * 1.5));
  });
});

describe('Bûcher sacré — usage unique', () => {
  it('n’est lancé qu’UNE fois, même sur un long combat', () => {
    const res = resolveCombat({
      allies: [inq([BUCHER])],
      enemies: [foe()],
      seed: 2,
      maxRounds: 40,
    });
    const casts = res.events.filter(
      (e) => e.type === 'status' && e.message.includes('dresse le bûcher'),
    );
    // `round === atRound` ne peut être vrai qu'une fois : l'effet tient tout le
    // combat sans jamais se relancer ni empiler de buffs.
    expect(casts).toHaveLength(1);
    expect(casts[0]!.round).toBe(1);
  });
});
