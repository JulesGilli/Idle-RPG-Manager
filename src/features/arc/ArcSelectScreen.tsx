import { useNavigate } from 'react-router-dom';
import { BackToActivities } from '@/components/BackToActivities';
import { UiIcon } from '@/components/synty/GameIcons';
import { arcTuning, MAX_ARC } from '@shared/progression/arc.ts';
import { useArc } from './useArc';

/**
 * Sélection d'ARC (New Game+). Écran volontairement épuré : un retour, un titre,
 * puis la liste verticale des arcs. Les arcs au-delà de `maxArc` sont grisés.
 * Choisir un arc débloqué bascule dessus (`switchArc`) puis revient en arrière.
 */
export function ArcSelectScreen() {
  const navigate = useNavigate();
  const { currentArc, maxArc, switchArc, isSwitching } = useArc();

  // Tous les arcs existants ; ceux > maxArc restent verrouillés (grisés).
  const arcs = Array.from({ length: MAX_ARC }, (_, i) => i + 1);

  function choose(arc: number) {
    if (arc > maxArc || arc === currentArc || isSwitching) return;
    switchArc(arc);
    navigate(-1);
  }

  return (
    <section className="anim-fade mx-auto max-w-xl space-y-5">
      <BackToActivities />

      <div>
        <h2 className="heading flex items-center gap-2 text-2xl">
          <UiIcon name="dragon" size={24} color="var(--color-gold-soft)" />
          Changer d'arc
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Un arc est la même carte du monde à un palier supérieur : ennemis plus durs, tier de loot
          plus élevé. Ton roster, ton équipement et ton or sont <strong>partagés</strong> — seule la
          progression de carte est propre à chaque arc.
        </p>
      </div>

      <div className="space-y-2.5">
        {arcs.map((arc) => {
          const tuning = arcTuning(arc);
          const locked = arc > maxArc;
          const current = arc === currentArc;
          return (
            <button
              key={arc}
              onClick={() => choose(arc)}
              disabled={locked || current || isSwitching}
              title={
                locked
                  ? 'Terrasse le boss de fin d\'arc pour le débloquer'
                  : current
                    ? 'Arc actuel'
                    : `Basculer sur ${tuning.region}`
              }
              className={`panel flex w-full items-center gap-4 p-4 text-left transition ${
                locked
                  ? 'cursor-not-allowed opacity-45'
                  : current
                    ? 'cursor-default ring-2 ring-[var(--color-arcane)]'
                    : 'panel-hover cursor-pointer'
              }`}
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-display text-lg font-extrabold"
                style={{
                  background: locked ? 'rgba(255,255,255,0.04)' : `${tuning.accent}1f`,
                  color: locked ? 'var(--color-muted)' : tuning.accent,
                }}
              >
                {arc}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-display text-base font-bold text-[var(--color-ink)]">
                    {tuning.region}
                  </span>
                  {current && (
                    <span className="chip bg-[var(--color-arcane)]/15 text-[10px] text-[var(--color-ink)]">
                      Arc actuel
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                  Arc {arc} · tier de loot T{arc}
                </span>
              </span>

              {locked ? (
                <UiIcon name="lock" size={16} color="currentColor" />
              ) : current ? (
                <UiIcon name="victory" size={16} color="var(--color-arcane)" />
              ) : (
                <span className="text-[var(--color-muted)]">→</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
