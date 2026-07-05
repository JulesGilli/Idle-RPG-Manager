import { useEffect, useState } from 'react';
import { SyntyImg } from '@/components/synty/SyntyIcon';
import { MAP_ART } from '@/lib/synty';

// Rejoué une fois par session de navigation (survit aux refresh d'un même onglet,
// se relance à la réouverture). Cliquer passe l'intro.
const SESSION_KEY = 'intro-splash-shown-v1';

export function IntroSplash() {
  const [visible, setVisible] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === null;
    } catch {
      return true;
    }
  });
  const [out, setOut] = useState(false);

  useEffect(() => {
    if (!visible) return;
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* stockage indisponible : tant pis, l'intro se rejouera */
    }
    const fade = setTimeout(() => setOut(true), 1900);
    const done = setTimeout(() => setVisible(false), 2400);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [visible]);

  if (!visible) return null;

  const skip = () => {
    setOut(true);
    setTimeout(() => setVisible(false), 450);
  };

  return (
    <div
      role="presentation"
      onClick={skip}
      className={`intro-overlay fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center bg-[var(--color-bg)] ${
        out ? 'is-out' : ''
      }`}
    >
      <div className="flex flex-col items-center">
        <div className="relative flex items-center justify-center">
          <span className="intro-ring pointer-events-none absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full" />
          <SyntyImg src={MAP_ART.dragon} size={132} className="intro-dragon" />
        </div>
        <div className="intro-name mt-6 text-center">
          <div className="font-display text-3xl font-extrabold tracking-tight text-[var(--color-gold-soft)]">
            Idle-RPG
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.4em] text-[var(--color-muted)]">
            Manager
          </div>
        </div>
      </div>
    </div>
  );
}
