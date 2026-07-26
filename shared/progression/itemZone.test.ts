import { describe, expect, it } from 'vitest';
import { itemCraftZone } from './itemZone.ts';
import { FORGE_MATERIALS } from './forge.ts';
import { FORGE_MATERIALS_ARC2 } from './arcMaterials.ts';
import { SET_PIECES, craftSetPieceStats } from './sets.ts';
import { tierGearMult } from './arc.ts';
import { DIVINE_SEAL } from './divine.ts';

/**
 * Le succès « Paré d'étoiles » (4 pièces en composant de zone 10) doit se
 * valider avec des PIÈCES DE SET et de l'ÉQUIPEMENT DIVIN, en zone 10 d'arc 1
 * comme d'arc 2. Ces trois familles n'ont pas de suffixe de zone lisible dans
 * leur nom — c'est exactement là que l'ancienne déduction (`materialZoneOfName`
 * seule) échouait et refusait le titre à des joueurs pourtant end-game.
 */

const z10a1 = FORGE_MATERIALS.find((m) => m.zone === 10)!;
const z10a2 = FORGE_MATERIALS_ARC2.find((m) => m.zone === 10)!;

/** Pièce de set équipée telle que stockée en base (stats scalées par l'arc). */
function setPieceItem(setPieceIdx: number, arc: number) {
  const piece = SET_PIECES[setPieceIdx]!;
  const mat = arc >= 2 ? z10a2 : z10a1;
  const tm = tierGearMult(arc);
  const s = craftSetPieceStats(piece, mat);
  return {
    name: `${piece.label} (Set)`,
    set_id: piece.setId,
    tier: arc,
    craft_cost: mat.materials.map((m) => ({ key: m.key, qty: 1 })),
    base_atk_bonus: Math.round(s.atk * tm),
    base_def_bonus: Math.round(s.def * tm),
    base_hp_bonus: Math.round(s.hp * tm),
  };
}

describe('itemCraftZone — objet ordinaire', () => {
  it('lit le suffixe de nom en zone 10, arc 1 ET arc 2', () => {
    expect(itemCraftZone({ name: `Épée ${z10a1.suffix}` })).toBe(10);
    expect(itemCraftZone({ name: `Épée ${z10a2.suffix}` })).toBe(10);
  });

  it('retombe sur craft_cost quand le nom ne dit rien', () => {
    expect(itemCraftZone({ name: 'Objet sans suffixe', craft_cost: [{ key: 'poussiere_etoile', qty: 1 }] })).toBe(10);
    expect(itemCraftZone({ name: 'Objet sans suffixe', craft_cost: [{ key: 'poussiere_astre_mort', qty: 1 }] })).toBe(10);
  });

  it('une zone plus basse n’est pas confondue avec la 10', () => {
    const z3 = FORGE_MATERIALS.find((m) => m.zone === 3)!;
    expect(itemCraftZone({ name: `Épée ${z3.suffix}` })).toBe(3);
  });
});

describe('itemCraftZone — pièce de set', () => {
  it('vaut 10 pour une pièce de set de zone 10, via craft_cost (arc 1 et arc 2)', () => {
    expect(itemCraftZone(setPieceItem(0, 1))).toBe(10);
    expect(itemCraftZone(setPieceItem(0, 2))).toBe(10);
  });

  it('vaut 10 même sans craft_cost, par inversion des stats de base (arc 1 et arc 2)', () => {
    for (const arc of [1, 2]) {
      const it = setPieceItem(0, arc);
      const noCost = { ...it, craft_cost: undefined };
      expect(itemCraftZone(noCost), `arc ${arc}`).toBe(10);
    }
  });
});

describe('itemCraftZone — objet divin', () => {
  const divineName = `${DIVINE_SEAL} Épée de Sève`;

  it('vaut 10 via craft_cost d’arc 2', () => {
    expect(itemCraftZone({ name: divineName, craft_cost: [{ key: 'poussiere_astre_mort', qty: 1 }] })).toBe(10);
  });

  it('retombe sur zone 10 (end-game) même si craft_cost est illisible', () => {
    expect(itemCraftZone({ name: divineName })).toBe(10);
    expect(itemCraftZone({ name: divineName, craft_cost: [{ key: 'cle_inconnue', qty: 1 }] })).toBe(10);
  });
});
