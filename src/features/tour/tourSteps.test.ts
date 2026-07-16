import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CHAPTER1, CHAPTER2, CHAPTER3, type TourStep } from './tourSteps';

/**
 * LE PIÈGE DE CE SYSTÈME : une étape vise un `data-tour` ; si l'élément n'existe
 * pas, `TourSpotlight` rend `null`. Pas d'erreur, pas de log — le tutoriel se
 * fige simplement sur une étape invisible, et seul un compte NEUF le voit. Un
 * renommage d'ancre passerait donc les tests, la revue, la prod, et ne casserait
 * que pour les nouveaux joueurs.
 *
 * Ce test lit les sources et vérifie que chaque cible a bien son ancre.
 */

const SRC = join(process.cwd(), 'src');

function allSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return allSources(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

/** Ancres `data-tour` réellement posées dans l'UI, littérales ou dynamiques. */
function anchorsInUi(): Set<string> {
  const found = new Set<string>();
  for (const file of allSources(SRC)) {
    const src = readFileSync(file, 'utf8');
    // data-tour="foo"
    for (const m of src.matchAll(/data-tour="([a-z0-9-]+)"/gi)) found.add(m[1]!);
    // 'data-tour': 'foo'  (spread conditionnel)
    for (const m of src.matchAll(/'data-tour':\s*'([a-z0-9-]+)'/gi)) found.add(m[1]!);
    // Cibles passées par prop/variable : `tourKey = cond ? 'foo' : 'bar'`,
    // `tour: 'foo'`, `tourTag: 'foo'`. La fenêtre traverse les retours à la ligne
    // — les ternaires du village s'étalent sur plusieurs lignes. On ratisse large :
    // un faux positif est sans danger ici, un faux négatif ferait échouer à tort.
    for (const m of src.matchAll(/\btour(?:Key|Tag)?\s*[:=][\s\S]{0,300}/gi)) {
      for (const q of m[0]!.matchAll(/'([a-z0-9-]+)'/gi)) found.add(q[1]!);
    }
  }
  return found;
}

const CHAPTERS: [string, TourStep[]][] = [
  ['chapitre 1', CHAPTER1],
  ['chapitre 2', CHAPTER2],
  ['chapitre 3', CHAPTER3],
];

describe('scénario du tutoriel', () => {
  const anchors = anchorsInUi();

  for (const [name, steps] of CHAPTERS) {
    it(`${name} : chaque étape vise une ancre qui existe`, () => {
      const orphelines = steps.filter((s) => !anchors.has(s.target)).map((s) => `${s.id} → ${s.target}`);
      expect(orphelines, `ancres introuvables dans src/ : ${orphelines.join(', ')}`).toEqual([]);
    });
  }

  it('les ids sont uniques — ils servent de clé de rendu', () => {
    const ids = CHAPTERS.flatMap(([, s]) => s).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('chaque étape sait avancer : une action à observer, ou un bouton « Compris »', () => {
    // Sans `advance` NI `manual`, l'étape est un cul-de-sac : rien ne la termine.
    const bloquantes = CHAPTERS.flatMap(([, s]) => s)
      .filter((s) => !s.manual && !s.advance)
      .map((s) => s.id);
    expect(bloquantes).toEqual([]);
  });
});
