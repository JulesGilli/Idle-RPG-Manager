import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DonateButton } from '@/features/donate/DonateButton';

/**
 * ÉCRAN DE CRÉDITS — la fin du jeu, déroulée après la 1re victoire sur le boss
 * final (Zone 11). Générique qui défile, petite mélodie douce jouée en WebAudio
 * (aucun asset audio à charger, aucune musique sous licence), et un bouton pour
 * soutenir le jeu. Atteignable aussi via `/credits` pour le revoir.
 */
export function CreditsScreen() {
  const navigate = useNavigate();
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<CreditsMusic | null>(null);

  // La musique démarre au montage (on arrive ici juste après un clic de combat,
  // donc le contexte audio est autorisé). Si le navigateur la bloque quand même,
  // le bouton « Musique » la relance sur un vrai geste utilisateur.
  useEffect(() => {
    const music = new CreditsMusic();
    audioRef.current = music;
    void music.start();
    return () => music.stop();
  }, []);

  function toggleMute() {
    const music = audioRef.current;
    if (!music) return;
    if (muted) {
      void music.start();
      setMuted(false);
    } else {
      music.stop();
      setMuted(true);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] overflow-hidden bg-[#07060d] text-[var(--color-ink)]">
      <StarField />

      {/* Générique défilant */}
      <div className="absolute inset-0 flex justify-center overflow-hidden">
        <div className="credits-roll w-full max-w-lg px-6 text-center">
          <div className="h-[70vh]" />
          <h1 className="font-display text-4xl font-black tracking-tight text-[var(--color-gold-soft)]">
            Idle-RPG Manager
          </h1>
          <p className="mt-3 text-sm text-[var(--color-muted)]">
            Tu as vaincu <strong className="text-[var(--color-ink)]">L'Aube Première</strong>.
            <br />
            La lumière revient sur le royaume.
          </p>

          <Section title="Le royaume">
            <Line>Un idle-RPG bâti avec soin</Line>
            <Line>Des centaines d'heures de farm, de forge et de combats</Line>
          </Section>

          <Section title="Aventuriers">
            <Line>Toi, commandant d'escouade</Line>
            <Line>Et tous les héros tombés puis relevés</Line>
          </Section>

          <Section title="Merci">
            <Line>À celles et ceux qui ont testé, remonté des bugs</Line>
            <Line>et poussé le jeu jusqu'ici</Line>
            <p className="mt-4 text-sm font-semibold text-[var(--color-gold-soft)]">
              Recto & Tepso
            </p>
            <Line>pour leurs innombrables retours,</Line>
            <Line>qui ont rendu ce jeu meilleur</Line>
          </Section>

          <p className="mt-12 text-lg font-semibold text-[var(--color-gold-soft)]">Fin</p>
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            …mais l'aventure continue : le farm, l'arène, le Panthéon et les runes t'attendent encore.
          </p>

          <div className="mx-auto mt-8 max-w-sm">
            <DonateButton />
          </div>
          <div className="h-[30vh]" />
        </div>
      </div>

      {/* Barre d'actions fixe */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 bg-gradient-to-t from-[#07060d] to-transparent p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <button onClick={toggleMute} className="btn btn-ghost text-sm">
          {muted ? '🔇 Musique' : '🔊 Musique'}
        </button>
        <button onClick={() => navigate('/village')} className="btn btn-primary text-sm">
          Retour au royaume
        </button>
      </div>

      <style>{`
        @keyframes creditsRoll { from { transform: translateY(0); } to { transform: translateY(-72%); } }
        .credits-roll { animation: creditsRoll 60s linear forwards; }
        @media (prefers-reduced-motion: reduce) { .credits-roll { animation: none; } }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-12">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--color-arcane)]">{title}</h2>
      <div className="mt-2 space-y-1">{children}</div>
    </div>
  );
}
function Line({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--color-ink)]/85">{children}</p>;
}

/** Champ d'étoiles discret, en fond. */
function StarField() {
  const stars = useRef(
    Array.from({ length: 60 }, (_, i) => ({
      left: (i * 61) % 100,
      top: (i * 37) % 100,
      r: (i % 3) + 1,
      d: 2 + (i % 5),
    })),
  ).current;
  return (
    <svg className="absolute inset-0 h-full w-full" aria-hidden>
      {stars.map((s, i) => (
        <circle key={i} cx={`${s.left}%`} cy={`${s.top}%`} r={s.r * 0.6} fill="#ffd27a">
          <animate attributeName="opacity" values="0.2;0.9;0.2" dur={`${s.d}s`} repeatCount="indefinite" />
        </circle>
      ))}
    </svg>
  );
}

/**
 * Petite mélodie générée à la volée (WebAudio) : une boucle douce d'accords en
 * arpège, volume bas. Aucun fichier, aucune musique sous licence. Se coupe
 * proprement au démontage.
 */
class CreditsMusic {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;
  private step = 0;

  async start(): Promise<void> {
    if (this.ctx) return;
    // deno-lint-ignore no-explicit-any
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!AC) return;
    this.ctx = new AC();
    try {
      await this.ctx.resume();
    } catch {
      /* bloqué par la politique d'autoplay — le bouton Musique relancera */
    }
    // Progression d'accords douce (Do majeur → La mineur → Fa → Sol), en Hz.
    const chords = [
      [261.6, 329.6, 392.0],
      [220.0, 261.6, 329.6],
      [174.6, 220.0, 261.6],
      [196.0, 246.9, 392.0],
    ];
    this.step = 0;
    const tick = () => {
      const ctx = this.ctx;
      if (!ctx) return;
      const chord = chords[this.step % chords.length]!;
      chord.forEach((freq, i) => this.note(freq, i * 0.16));
      this.step += 1;
    };
    tick();
    this.timer = window.setInterval(tick, 2400);
  }

  private note(freq: number, delay: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    // Enveloppe douce, volume TRÈS bas (ambiance, pas fanfare).
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.06, t0 + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.0);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 2.1);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
