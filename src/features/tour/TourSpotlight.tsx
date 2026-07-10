import { useEffect, useState } from 'react';
import { useTour } from './useTour';

type Box = { top: number; left: number; width: number; height: number };

/** Retourne le rect de l'élément taggé VISIBLE (ignore les copies masquées : nav desktop/mobile). */
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
 * Superposition du tutoriel : assombrit tout SAUF l'élément ciblé (4 voiles autour
 * qui bloquent aussi les clics à côté), un anneau qui pulse, et une bulle coach.
 * Le trou reste cliquable → le joueur fait vraiment l'action pour avancer.
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
    const update = () => setBox(measure(target));
    update();
    const id = window.setInterval(update, 250); // suit les chargements/animations
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
  const scrim = 'rgba(6,4,12,0.78)';

  // Position de la bulle : sous la cible si elle est en haut, au-dessus sinon.
  const hasBox = box != null;
  const below = hasBox ? box!.top < vh * 0.5 : true;
  const bubbleW = 300;
  const left = hasBox
    ? Math.max(10, Math.min(vw - bubbleW - 10, box!.left + box!.width / 2 - bubbleW / 2))
    : Math.max(10, vw / 2 - bubbleW / 2);
  const bubbleStyle: React.CSSProperties = hasBox
    ? below
      ? { top: box!.top + box!.height + 14, left }
      : { bottom: vh - box!.top + 14, left }
    : { bottom: 24, left };

  return (
    <div className="fixed inset-0 z-[60]" aria-live="polite">
      {hasBox ? (
        <>
          {/* 4 voiles autour de la cible (assombrissent + bloquent les clics à côté). */}
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: Math.max(0, box!.top - pad), background: scrim }} />
          <div style={{ position: 'fixed', top: box!.top + box!.height + pad, left: 0, width: '100%', bottom: 0, background: scrim }} />
          <div style={{ position: 'fixed', top: box!.top - pad, left: 0, width: Math.max(0, box!.left - pad), height: box!.height + pad * 2, background: scrim }} />
          <div style={{ position: 'fixed', top: box!.top - pad, left: box!.left + box!.width + pad, right: 0, height: box!.height + pad * 2, background: scrim }} />
          {/* Anneau lumineux (non cliquable). */}
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
      ) : (
        // Cible introuvable (mauvais écran) : simple voile, la bulle guide au bon endroit.
        <div style={{ position: 'fixed', inset: 0, background: scrim }} />
      )}

      {/* Bulle coach. */}
      <div
        className="anim-pop"
        style={{
          position: 'fixed',
          width: bubbleW,
          background: '#1e1730',
          border: '1px solid #3a3350',
          borderRadius: 12,
          padding: '14px 16px',
          ...bubbleStyle,
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold" style={{ color: '#e8b64a' }}>
            {chapter === 2 ? 'Équipement' : 'Bienvenue'} · {stepIndex + 1}/{total}
          </span>
          <div className="flex gap-1">
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                style={{
                  width: 12,
                  height: 4,
                  borderRadius: 2,
                  background: i <= stepIndex ? '#e8b64a' : '#3a3350',
                }}
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
          <button
            onClick={skip}
            className="text-[12px]"
            style={{ color: '#6f6980' }}
          >
            Passer le tuto
          </button>
          {step.manual ? (
            <button
              onClick={goNext}
              className="rounded-lg px-3 py-1.5 text-[13px] font-semibold"
              style={{ background: '#e8b64a', color: '#130f1a' }}
            >
              Compris !
            </button>
          ) : (
            <span className="text-[12px]" style={{ color: '#6f6980' }}>
              {hasBox ? '↑ à toi de jouer' : '…'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
