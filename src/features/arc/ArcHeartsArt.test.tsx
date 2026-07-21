import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ArcHeartsArt } from './ArcHeartsArt';

/** Le visuel n'existe que DANS un <svg> : on lui en fournit un, comme l'arène. */
function renderArt() {
  return render(
    <svg viewBox="0 0 680 250">
      <ArcHeartsArt />
    </svg>,
  );
}

afterEach(cleanup);

describe('ArcHeartsArt — les cinq cœurs de la phase 2', () => {
  it('dessine EXACTEMENT cinq cœurs', () => {
    const { container } = renderArt();
    // La silhouette de cœur est le seul path à porter ce dégradé de chair.
    const hearts = container.querySelectorAll('path[fill="url(#ah-flesh)"]');
    expect(hearts).toHaveLength(5);
  });

  it('chaque cœur bat, et les battements sont DÉCALÉS', () => {
    const { container } = renderArt();
    const beats = Array.from(container.querySelectorAll('animateTransform[type="scale"]'));
    expect(beats).toHaveLength(5);
    // Décalages distincts : sans eux les cinq battraient à l'unisson exact, ce
    // qui se lit comme une seule image qui zoome, pas comme cinq organes.
    const begins = beats.map((b) => b.getAttribute('begin'));
    expect(new Set(begins).size).toBe(5);
  });

  it('déclare ses dégradés sous un préfixe qui lui est propre', () => {
    const { container } = renderArt();
    // L'arène (`ar-`) et l'ange (`ab-`) vivent dans le même document : un id
    // partagé ferait silencieusement gagner le dernier déclaré.
    const ids = Array.from(container.querySelectorAll('defs > *')).map((n) => n.getAttribute('id'));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id).toMatch(/^ah-/);
  });

  it('montre l’auréole BRISÉE (ce qui dit « l’Être est tombé »)', () => {
    const { container } = renderArt();
    // Deux arcs d'or terni séparés par une fracture, plus ses éclats. C'est le
    // seul vestige de l'ange : une dépouille complète (ailes + torse) a été
    // essayée puis retirée — à cette taille elle lisait comme des pattes d'insecte.
    const arcs = container.querySelectorAll('path[stroke="#9a8352"]');
    expect(arcs.length).toBe(2);
    const shards = container.querySelectorAll('path[fill="#9a8352"]');
    expect(shards.length).toBeGreaterThanOrEqual(2);
  });

  it('suspend chaque cœur à une veine (organes arrachés, pas posés)', () => {
    const { container } = renderArt();
    // `fill="none"` distingue la veine de suspension du CONTOUR du cœur, qui
    // porte la même couleur de trait mais est rempli de chair.
    const veins = container.querySelectorAll('path[stroke="#28040b"][fill="none"]');
    expect(veins.length).toBe(5);
  });

  it('anime des braises ascendantes (le fond ne reste pas figé)', () => {
    const { container } = renderArt();
    const rising = Array.from(container.querySelectorAll('animate[attributeName="cy"]'));
    expect(rising.length).toBe(5);
  });
});
