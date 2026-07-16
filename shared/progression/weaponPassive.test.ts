import { describe, it, expect } from 'vitest';
import {
  FORGE_MATERIALS,
  FORGE_BASES,
  WEAPON_PASSIVES,
  baseProfile,
  getBase,
  weaponPassiveFor,
  weaponPassiveSpec,
} from './forge.ts';
import { itemCombatPassive, buildHeroSnapshot, type HeroSnapshotInput } from './heroLoan.ts';

const matOfZone = (z: number) => FORGE_MATERIALS.find((m) => m.zone === z)!;
const arc = getBase('arc')!;
const dague = getBase('dague')!;
const epee = getBase('epee')!;

describe('weaponPassiveFor', () => {
  it("l'Arc porte du critique, la Dague de l'esquive", () => {
    expect(weaponPassiveFor(arc, matOfZone(1))!.type).toBe('crit');
    expect(weaponPassiveFor(dague, matOfZone(1))!.type).toBe('dodge');
  });

  it('les modèles « dégâts purs » n’en portent pas', () => {
    expect(weaponPassiveFor(epee, matOfZone(10))).toBeNull();
    expect(weaponPassiveSpec('sceptre')).toBeNull();
  });

  it('la puissance vient de la ZONE : plancher en 1, plafond en 10', () => {
    expect(weaponPassiveFor(arc, matOfZone(1))!.pct).toBe(WEAPON_PASSIVES.arc!.minPct);
    expect(weaponPassiveFor(arc, matOfZone(10))!.pct).toBe(WEAPON_PASSIVES.arc!.maxPct);
    expect(weaponPassiveFor(dague, matOfZone(1))!.pct).toBe(WEAPON_PASSIVES.dague!.minPct);
    expect(weaponPassiveFor(dague, matOfZone(10))!.pct).toBe(WEAPON_PASSIVES.dague!.maxPct);
  });

  it('progresse de façon monotone entre les deux', () => {
    let prev = -1;
    for (let z = 1; z <= 10; z++) {
      const pct = weaponPassiveFor(arc, matOfZone(z))!.pct;
      expect(pct).toBeGreaterThan(prev);
      prev = pct;
    }
  });

  it("l'esquive reste bien plus serrée que le crit — elle annule l'attaque entière", () => {
    expect(WEAPON_PASSIVES.dague!.maxPct).toBeLessThan(WEAPON_PASSIVES.arc!.maxPct / 2);
  });

  it('ne concerne que des armes qui n’ont pas déjà une secondaire de stat', () => {
    for (const id of Object.keys(WEAPON_PASSIVES)) {
      const b = FORGE_BASES.find((x) => x.id === id)!;
      expect(b.itemType, id).toBe('weapon');
      expect(baseProfile(b).secondary, id).toBeNull();
    }
  });
});

describe('itemCombatPassive', () => {
  it('convertit les % entiers de la base en fraction de combat', () => {
    expect(itemCombatPassive({ passive_type: 'crit', passive_value: 35 })).toEqual({ type: 'crit', value: 0.35 });
  });

  it('null quand il n’y a pas de passif (cas de la plupart des armes)', () => {
    expect(itemCombatPassive(null)).toBeNull();
    expect(itemCombatPassive(undefined)).toBeNull();
    expect(itemCombatPassive({ passive_type: null, passive_value: 0 })).toBeNull();
    // Un passif à 0 % ne doit pas produire de passif fantôme.
    expect(itemCombatPassive({ passive_type: 'crit', passive_value: 0 })).toBeNull();
  });
});

/** Héros minimal : on ne teste que le passage des passifs jusqu'au combat. */
function heroInput(over: Partial<HeroSnapshotInput> = {}): HeroSnapshotInput {
  return {
    id: 'h1',
    name: 'Test',
    classId: 'archer',
    level: 1,
    classBase: { hp: 100, atk: 10, def: 5, speed: 10 },
    innate: { hp: 0, atk: 0, def: 0, speed: 0 },
    alloc: { hp: 0, atk: 0, def: 0, speed: 0 },
    equipment: { atk: 0, def: 0, hp: 0 },
    skills: {},
    ...over,
  };
}

describe('buildHeroSnapshot — le passif d’ARME atteint le combat', () => {
  it("l'expose comme passif du combattant", () => {
    const snap = buildHeroSnapshot(heroInput({ weaponPassive: { type: 'crit', value: 0.35 } }));
    expect(snap.passives).toContainEqual({ type: 'crit', value: 0.35 });
  });

  it('sans arme à passif, rien n’est ajouté', () => {
    const snap = buildHeroSnapshot(heroInput());
    expect(snap.passives?.some((p) => p.type === 'crit')).toBe(false);
  });

  it('CUMULE avec la gemme du bijou — `passive()` somme les sources en combat', () => {
    const snap = buildHeroSnapshot(
      heroInput({
        jewelPassive: { type: 'crit', value: 0.2 },
        weaponPassive: { type: 'crit', value: 0.35 },
      }),
    );
    const crit = (snap.passives ?? []).filter((p) => p.type === 'crit').reduce((s, p) => s + p.value, 0);
    // 55 % : le cumul est VOULU, mais c'est lui qui rend le calibrage sensible
    // (gemme de crit à 35 % max + arbre + buff de guilde s'ajoutent encore).
    expect(crit).toBeCloseTo(0.55);
  });
});
