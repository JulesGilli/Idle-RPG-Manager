import { describe, expect, it } from 'vitest';
import { SETS, describeSetEffect, setById } from './sets.ts';

/**
 * TOUT set doit dire ce qu'il fait.
 *
 * `describeSetAbility` avait un `default: 'Effet spécial.'` qui avalait toute
 * capacité non prévue : les 16 sets d'ARC 2 — c'est-à-dire l'intégralité du
 * catalogue de l'arc — s'affichaient donc « Effet spécial », sans un mot sur
 * leur effet réel. Le `default` a sauté : oublier d'écrire une description casse
 * désormais la compilation.
 */

describe('description des effets de set', () => {
  it('aucun set ne se contente d’« Effet spécial »', () => {
    const muets = SETS.filter((s) => /Effet spécial|Effet non décrit/.test(describeSetEffect(s)));
    expect(muets.map((s) => s.id)).toEqual([]);
  });

  it('chaque set produit une phrase lisible, une par capacité', () => {
    for (const s of SETS) {
      const d = describeSetEffect(s);
      expect(d.length, `${s.id} : description vide`).toBeGreaterThan(15);
      expect(d.endsWith('.'), `${s.id} : « ${d} »`).toBe(true);
      // Une phrase par capacité du set (les points ne sont pas cumulés à tort).
      expect((d.match(/\./g) ?? []).length).toBeGreaterThanOrEqual(s.abilities4.length);
    }
  });

  it('les chiffres annoncés sont ceux des capacités', () => {
    // Brise-Garde : armor_pen 0.2 → « 20 % ». Un pourcentage faux est pire
    // qu'une absence de texte : le joueur construit dessus.
    const brise = setById('a2_brisegarde')!;
    expect(describeSetEffect(brise)).toContain('20 %');

    // Dernier Cri : explode_on_death hpFrac 1 → « 100 % de tes PV max ».
    expect(describeSetEffect(setById('a2_derniercri')!)).toContain('100 %');

    // Détonation : le seuil ET le multiplicateur PAR marque doivent apparaître.
    const deto = describeSetEffect(setById('a2_detonation')!);
    expect(deto).toContain('5 marques');
    expect(deto).toMatch(/par marque/i);
  });

  it('le Pacte de Sang ne promet pas +100 % en permanence', () => {
    // `ampPerMissing: 1` = +1 % par % de PV manquants, soit +100 % SEULEMENT au
    // seuil de la mort. L'annoncer comme un bonus plat serait un mensonge.
    const d = describeSetEffect(setById('a2_pacte')!);
    expect(d).toMatch(/Jusqu'à/);
    expect(d).toMatch(/PV manquants/);
  });
});
