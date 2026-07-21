import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ZoneUpgradeStars } from './ItemStars';

const GOLD = '#f5b544';
const RED = '#dc2626'; // rouge de bénédiction (REMPLISSAGE)
const RED_STROKE = '#7f1d1d'; // contour de l'étoile bénie
const ZONE_BLUE = '#3b82f6'; // remplissage de zone

/** Contour de chacune des 10 étoiles, dans l'ordre. */
function strokes(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('path')).map(
    (p) => p.getAttribute('stroke') ?? '',
  );
}

/** Remplissage de chacune des 10 étoiles, dans l'ordre. */
function fills(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('path')).map((p) => p.getAttribute('fill') ?? '');
}

afterEach(cleanup);

describe('ZoneUpgradeStars — bénédiction en ROUGE', () => {
  it('sans bénédiction, le contour d’amélioration reste doré (aucune régression)', () => {
    const { container } = render(<ZoneUpgradeStars zone={5} upgrade={3} />);
    const s = strokes(container);
    expect(s.slice(0, 3)).toEqual([GOLD, GOLD, GOLD]);
    expect(s[3]).not.toBe(GOLD);
    expect(s).not.toContain(RED_STROKE);
    // Les étoiles de zone gardent bien leur intérieur bleu.
    expect(fills(container).slice(0, 5)).toEqual(Array(5).fill(ZONE_BLUE));
  });

  it('une étoile bénie est ENTIÈREMENT rouge : intérieur ET contour', () => {
    // Le cœur de la demande : ce n'était que le cadre qui rougissait, l'intérieur
    // restait au bleu de zone — illisible d'un coup d'œil.
    const { container } = render(<ZoneUpgradeStars zone={10} upgrade={4} blessing={2} />);
    expect(fills(container).slice(0, 2)).toEqual([RED, RED]);
    expect(strokes(container).slice(0, 2)).toEqual([RED_STROKE, RED_STROKE]);
    // Et surtout : plus aucun bleu de zone sur les étoiles bénies.
    expect(fills(container).slice(0, 2)).not.toContain(ZONE_BLUE);
  });

  it('les étoiles bénies perdent leur contour doré, les suivantes le gardent', () => {
    // Bénédiction +2 sur une arme améliorée +4 : 2 rouges puis 2 dorées.
    const { container } = render(<ZoneUpgradeStars zone={10} upgrade={4} blessing={2} />);
    const s = strokes(container);
    expect(s.slice(0, 2)).toEqual([RED_STROKE, RED_STROKE]);
    expect(s.slice(2, 4)).toEqual([GOLD, GOLD]);
    // Les étoiles seulement améliorées restent bleues à l'intérieur.
    expect(fills(container).slice(2, 4)).toEqual([ZONE_BLUE, ZONE_BLUE]);
  });

  it('une arme entièrement bénie n’affiche plus AUCUN doré', () => {
    // C'est la demande : quand c'est rouge, on ne garde pas le cadre doré.
    const { container } = render(<ZoneUpgradeStars zone={10} upgrade={5} blessing={5} />);
    expect(fills(container).slice(0, 5)).toEqual(Array(5).fill(RED));
    expect(strokes(container)).not.toContain(GOLD);
  });

  it('l’infobulle annonce les trois informations', () => {
    const { container } = render(<ZoneUpgradeStars zone={7} upgrade={4} blessing={2} />);
    const title = container.querySelector('div')?.getAttribute('title') ?? '';
    expect(title).toContain('zone 7/10');
    expect(title).toContain('Amélioration +4');
    expect(title).toContain('Bénédiction +2');
  });

  it('borne la bénédiction à 10 étoiles (pas de débordement)', () => {
    const { container } = render(<ZoneUpgradeStars zone={10} upgrade={10} blessing={99} />);
    expect(fills(container).filter((f) => f === RED)).toHaveLength(10);
  });
});
