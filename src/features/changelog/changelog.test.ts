import { describe, expect, it } from 'vitest';
import { RELEASES, UPCOMING } from './changelog';

/**
 * Le journal des nouveautés est du CONTENU écrit à la main : rien ne le vérifie
 * à la compilation. Ces tests attrapent les fautes de structure qui se voient
 * tout de suite en jeu — une version manquante, une entrée vide, un doublon.
 */

describe('journal des nouveautés', () => {
  it('la version en tête est celle annoncée aux joueurs', () => {
    // `app_config.release_version` vaut « V2 » : le journal ne doit pas être en
    // retard sur la version réellement en ligne.
    expect(RELEASES[0]!.version.startsWith('V2')).toBe(true);
  });

  it('aucune version en double', () => {
    const versions = RELEASES.map((r) => r.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('chaque version a un titre, une date et au moins une entrée', () => {
    for (const r of RELEASES) {
      expect(r.title.trim(), r.version).not.toBe('');
      expect(r.date.trim(), r.version).not.toBe('');
      expect(r.entries.length, r.version).toBeGreaterThan(0);
    }
  });

  it('aucune entrée vide, et des textes qui disent quelque chose', () => {
    for (const r of RELEASES) {
      for (const e of r.entries) {
        expect(e.text.trim(), `${r.version} : entrée vide`).not.toBe('');
        expect(e.text.length, `${r.version} : « ${e.text} »`).toBeGreaterThan(20);
      }
    }
  });

  it('les mises en avant restent rares (2 à 5 par version)', () => {
    // Tout mettre en avant revient à ne rien mettre en avant : le panneau les
    // affiche dans un bloc à part, qui perd son sens s'il contient tout.
    for (const r of RELEASES) {
      const n = r.entries.filter((e) => e.highlight).length;
      expect(n, `${r.version} : ${n} entrées en avant`).toBeLessThanOrEqual(5);
    }
  });

  it('« Prochainement » ne promet rien de déjà livré', () => {
    // Une roadmap qui annonce le contenu de la dernière mise à jour donne
    // l'impression que le jeu n'avance plus.
    const shipped = RELEASES.flatMap((r) => r.entries.map((e) => e.text.toLowerCase()));
    for (const item of UPCOMING) {
      const head = item.split(' :')[0]!.toLowerCase();
      expect(
        shipped.some((t) => t.startsWith(head)),
        `« ${head} » est annoncé alors qu'il est déjà livré`,
      ).toBe(false);
    }
  });
});
