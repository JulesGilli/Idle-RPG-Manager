import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { safeDonateUrl, DONATE_DEFAULT_LABEL } from './useDonate';

/**
 * BOUTON DE SOUTIEN.
 *
 * L'URL vient de `app_config` et finit dans un `href` : c'est le seul endroit du
 * jeu où une valeur de base de données devient une destination de navigation.
 */

describe('safeDonateUrl', () => {
  it('accepte une URL https', () => {
    expect(safeDonateUrl('https://ko-fi.com/quelquun')).toBe('https://ko-fi.com/quelquun');
  });

  it('rogne les espaces autour (copier-coller)', () => {
    expect(safeDonateUrl('  https://ko-fi.com/x  ')).toBe('https://ko-fi.com/x');
  });

  it('REFUSE javascript: — un href peut exécuter du code', () => {
    expect(safeDonateUrl('javascript:alert(1)')).toBeNull();
    expect(safeDonateUrl('JavaScript:alert(1)')).toBeNull();
  });

  it('refuse http:// — pas de page de paiement en clair', () => {
    expect(safeDonateUrl('http://ko-fi.com/x')).toBeNull();
  });

  it('refuse le vide, le nul et le charabia', () => {
    for (const bad of [null, undefined, '', '   ', 'ko-fi.com/x', 'data:text/html,<h1>x']) {
      expect(safeDonateUrl(bad), String(bad)).toBeNull();
    }
  });
});

/* --------------------------------------------------------------- rendu -- */

let info: { url: string | null; label: string } = { url: null, label: DONATE_DEFAULT_LABEL };
vi.mock('./useDonate', async () => {
  const real = await vi.importActual<typeof import('./useDonate')>('./useDonate');
  return { ...real, useDonate: () => ({ data: info }) };
});
vi.mock('@/components/synty/GameIcons', () => ({ UiIcon: () => null }));

const { DonateButton } = await import('./DonateButton');

describe('DonateButton', () => {
  it('ne rend RIEN tant qu’aucun lien n’est configuré', () => {
    // Un bouton mort qui quémande sans page de destination serait pire que rien.
    info = { url: null, label: DONATE_DEFAULT_LABEL };
    const { container } = render(<DonateButton />);
    expect(container.textContent).toBe('');
  });

  it('ouvre le lien dans un nouvel onglet, sans laisser la main sur le jeu', () => {
    info = { url: 'https://ko-fi.com/jules', label: 'Soutenir' };
    render(<DonateButton />);
    const a = screen.getByRole('link');
    expect(a.getAttribute('href')).toBe('https://ko-fi.com/jules');
    expect(a.getAttribute('target')).toBe('_blank');
    // Sans `noopener`, la page ouverte peut rediriger l'onglet du jeu.
    expect(a.getAttribute('rel')).toContain('noopener');
  });

  it('annonce noir sur blanc qu’il n’y a AUCUNE contrepartie', () => {
    // C'est ce qui distingue un don d'un achat : la promesse doit être écrite.
    info = { url: 'https://ko-fi.com/jules', label: 'Soutenir' };
    const { container } = render(<DonateButton />);
    expect(container.textContent).toMatch(/aucune contrepartie en jeu/i);
  });
});
