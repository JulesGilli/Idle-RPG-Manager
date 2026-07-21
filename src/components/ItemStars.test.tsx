import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ZoneUpgradeStars } from './ItemStars';

const GOLD = '#f5b544';
const RED = '#dc2626';

/** Contour de chacune des 10 étoiles, dans l'ordre. */
function strokes(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('path')).map(
    (p) => p.getAttribute('stroke') ?? '',
  );
}

afterEach(cleanup);

describe('ZoneUpgradeStars — bénédiction en ROUGE', () => {
  it('sans bénédiction, le contour d’amélioration reste doré (aucune régression)', () => {
    const { container } = render(<ZoneUpgradeStars zone={5} upgrade={3} />);
    const s = strokes(container);
    expect(s.slice(0, 3)).toEqual([GOLD, GOLD, GOLD]);
    expect(s[3]).not.toBe(GOLD);
    expect(s).not.toContain(RED);
  });

  it('les étoiles bénies passent au ROUGE et perdent leur contour doré', () => {
    // Bénédiction +2 sur une arme améliorée +4 : 2 rouges puis 2 dorées.
    const { container } = render(<ZoneUpgradeStars zone={10} upgrade={4} blessing={2} />);
    const s = strokes(container);
    expect(s.slice(0, 2)).toEqual([RED, RED]);
    expect(s.slice(2, 4)).toEqual([GOLD, GOLD]);
  });

  it('une arme entièrement bénie n’affiche plus AUCUN doré', () => {
    // C'est la demande : quand c'est rouge, on ne garde pas le cadre doré.
    const { container } = render(<ZoneUpgradeStars zone={10} upgrade={5} blessing={5} />);
    expect(strokes(container).slice(0, 5)).toEqual([RED, RED, RED, RED, RED]);
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
    expect(strokes(container).filter((s) => s === RED)).toHaveLength(10);
  });
});
