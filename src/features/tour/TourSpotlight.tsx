import { useEffect, useState } from 'react';
import { useTour } from './useTour';

type Box = { top: number; left: number; width: number; height: number };

/**
 * Titre du chapitre affiché dans la bulle. C'était un ternaire à deux cas
 * (`chapter === 2 ? 'Équipement' : 'Bienvenue'`) : le ch.3 retombait donc sur
 * « Bienvenue », en plein milieu de la partie. Une table indexée par chapitre ne
 * peut plus se tromper de défaut.
 */
const CHAPTER_LABEL: Record<1 | 2 | 3, string> = {
  1: 'Bienvenue',
  2: 'Équipement',
  3: 'Progression',
};

/** Rect de l'élément taggé VISIBLE (ignore les copies masquées : nav desktop/mobile). */
function measure(target: string): Box | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`));
  const el = els.find((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && e.offsetParent !== null;
  });
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * Superposition du tutoriel — un GUIDE, jamais un piège. Rien ne bloque les clics :
 * les voiles et l'anneau sont purement visuels (`pointer-events: none`), seule la
 * bulle capte les clics (ses boutons). Le joueur interagit normalement avec le jeu ;
 * l'étape avance quand il fait la vraie action. z-index sous les fenêtres du jeu
 * (z-50) pour ne jamais les masquer.
 */
export function TourSpotlight() {
  const { step, stepIndex, total, chapter, goNext, skip } = useTour();
  const [box, setBox] = useState<Box | null>(null);

  const target = step?.target;
  useEffect(() => {
    if (!target) {
      setBox(null);
      return;
    }
    // Amener la cible À L'ÉCRAN. Sans ça, une étape dont l'ancre est sous la
    // ligne de flottaison éclaire le vide : le joueur lit « dépense ton point »
    // et ne voit rien s'allumer (l'arbre de compétences est à ~880 px du haut,
    // sous un écran de 812). Le spotlight ne fait que dessiner : c'est ici qu'on
    // décide de ce qu'on montre.
    const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      const dehors = r.top < 0 || r.bottom > window.innerHeight;
      if (dehors) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    const update = () => setBox(measure(target));
    update();
    const id = window.setInterval(update, 200);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [target]);

  if (!step) return null;

  const pad = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scrim = 'rgba(6,4,12,0.66)';
  const hasBox = box != null;

  // Bulle : sous la cible si elle est en haut, au-dessus sinon ; sinon en bas au centre.
  const bubbleW = Math.min(320, vw - 24);
  const below = hasBox ? box!.top < vh * 0.5 : true;
  const left = hasBox
    ? Math.max(12, Math.min(vw - bubbleW - 12, box!.left + box!.width / 2 - bubbleW / 2))
    : Math.max(12, vw / 2 - bubbleW / 2);
  const bubblePos: React.CSSProperties = hasBox
    ? below
      ? { top: Math.min(vh - 180, box!.top + box!.height + 14), left }
      : { bottom: Math.max(12, vh - box!.top + 14), left }
    : { bottom: 88, left };

  const dim: React.CSSProperties = { position: 'fixed', background: scrim, pointerEvents: 'none' };

  return (
    // pointer-events:none sur le conteneur → rien ne bloque ; la bulle réactive les clics.
    // z-index AU-DESSUS des modales (z-50) : le tuto doit pouvoir surligner à
    // l'intérieur de la modale de déploiement et de la fenêtre de combat. Le
    // scrim reste pointer-events:none → il n'empêche jamais d'interagir.
    <div className="fixed inset-0 z-[60]" style={{ pointerEvents: 'none' }} aria-live="polite">
      {hasBox && (
        <>
          <div style={{ ...dim, top: 0, left: 0, width: '100%', height: Math.max(0, box!.top - pad) }} />
          <div style={{ ...dim, top: box!.top + box!.height + pad, left: 0, width: '100%', bottom: 0 }} />
          <div style={{ ...dim, top: box!.top - pad, left: 0, width: Math.max(0, box!.left - pad), height: box!.height + pad * 2 }} />
          <div style={{ ...dim, top: box!.top - pad, left: box!.left + box!.width + pad, right: 0, height: box!.height + pad * 2 }} />
          <div
            className="animate-pulse"
            style={{
              position: 'fixed',
              top: box!.top - pad,
              left: box!.left - pad,
              width: box!.width + pad * 2,
              height: box!.height + pad * 2,
              borderRadius: 10,
              boxShadow: '0 0 0 2px #e8b64a, 0 0 22px 4px rgba(232,182,74,0.45)',
              pointerEvents: 'none',
            }}
          />
        </>
      )}

      <div
        className="anim-pop"
        style={{
          position: 'fixed',
          width: bubbleW,
          background: '#1e1730',
          border: '1px solid #3a3350',
          borderRadius: 12,
          padding: '14px 16px',
          pointerEvents: 'auto',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          ...bubblePos,
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold" style={{ color: '#e8b64a' }}>
            {CHAPTER_LABEL[chapter ?? 1]} · {stepIndex + 1}/{total}
          </span>
          <div className="flex gap-1">
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                style={{ width: 12, height: 4, borderRadius: 2, background: i <= stepIndex ? '#e8b64a' : '#3a3350' }}
              />
            ))}
          </div>
        </div>
        <div className="text-[15px] font-semibold" style={{ color: '#f3efe8' }}>
          {step.title}
        </div>
        <p className="mt-1 text-[13px] leading-snug" style={{ color: '#b4aec0' }}>
          {step.body}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <button onClick={skip} className="text-[12px]" style={{ color: '#6f6980' }}>
            Passer le tuto
          </button>
          {step.manual ? (
            <button
              // `() =>` obligatoire : `onClick={goNext}` passerait l'ÉVÉNEMENT
              // souris en `fromStep`, et la garde d'idempotence bloquerait le clic.
              onClick={() => goNext()}
              className="rounded-lg px-3 py-1.5 text-[13px] font-semibold"
              style={{ background: '#e8b64a', color: '#130f1a' }}
            >
              Compris !
            </button>
          ) : (
            <span className="text-[12px]" style={{ color: '#6f6980' }}>
              {hasBox ? '✨ à toi de jouer' : '…'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
