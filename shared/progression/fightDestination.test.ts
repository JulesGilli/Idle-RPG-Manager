import { describe, expect, it } from 'vitest';
import { fightDestination } from './deployment.ts';

/**
 * APRÈS UN ASSAUT GAGNÉ : avancer, ou rester ?
 *
 * Le déplacement était automatique — on ne pouvait pas refarmer le niveau qu'on
 * venait de gagner sans redéployer le groupe. Ces tests figent les deux issues
 * et, surtout, l'effet sur le compteur de clears.
 */

const NIV4 = 'lvl-4';
const NIV5 = 'lvl-5';

describe('fightDestination', () => {
  it('« Avancer » déplace l’escouade sur le niveau suivant', () => {
    expect(fightDestination({ startLevelId: NIV4, endLevelId: NIV5, advance: true })).toEqual({
      levelId: NIV5,
      sameLevel: false,
      advanced: 1,
    });
  });

  it('« Valider » la laisse sur place, la victoire restant acquise', () => {
    expect(fightDestination({ startLevelId: NIV4, endLevelId: NIV5, advance: false })).toEqual({
      levelId: NIV4,
      sameLevel: true,
      advanced: 0,
    });
  });

  it('rester = les CLEARS du niveau continuent de s’empiler', () => {
    // `sameLevel` pilote le compteur côté serveur : à false il repart de zéro.
    // Rester pour refarmer ne doit donc pas remettre le compteur à plat.
    expect(fightDestination({ startLevelId: NIV4, endLevelId: NIV5, advance: false }).sameLevel).toBe(true);
    expect(fightDestination({ startLevelId: NIV4, endLevelId: NIV5, advance: true }).sameLevel).toBe(false);
  });

  it('au DERNIER niveau d’une zone, avancer ne mène nulle part', () => {
    // Le combat renvoie alors la même destination que le départ : les deux
    // boutons sont équivalents (et l'UI n'en propose qu'un).
    const fin = { startLevelId: NIV5, endLevelId: NIV5, advance: true };
    expect(fightDestination(fin)).toEqual({ levelId: NIV5, sameLevel: true, advanced: 0 });
  });

  it('destination absente ou nulle → on reste, jamais d’escouade perdue', () => {
    for (const endLevelId of [null, undefined]) {
      expect(fightDestination({ startLevelId: NIV4, endLevelId, advance: true }).levelId).toBe(NIV4);
    }
  });
});
