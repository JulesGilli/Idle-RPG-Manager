import { Link } from 'react-router-dom';
import { BackToActivities } from '@/components/BackToActivities';
import { UiIcon } from '@/components/synty/GameIcons';

/**
 * Teaser du Boss d'Arc. L'ancien boss d'arc SOLO (tables `arc_bosses` /
 * `player_arc_progress`, migration 0033) n'a jamais été activé et le design a
 * changé : le vrai Boss d'Arc sera un EVENT COMMUNAUTAIRE (« Cloche du Désespoir »,
 * Phase 3). En attendant, on affiche un teaser au lieu d'interroger des tables
 * inexistantes (qui provoquaient des 404 en console).
 */
export function ArcBossComingSoon() {
  return (
    <section className="anim-fade space-y-5">
      <BackToActivities />
      <div className="panel flex flex-col items-center gap-3 p-8 text-center">
        <span className="text-5xl">🔔</span>
        <h2 className="heading text-2xl">Le Boss d'Arc arrive</h2>
        <p className="max-w-md text-sm text-[var(--color-muted)]">
          Bientôt : la <strong>Cloche du Désespoir</strong>. Quand assez de commandants
          auront terminé la carte du monde, un boss colossal sera invoqué — tapable{' '}
          <strong>une fois par jour</strong> par tout le serveur. Le vaincre ensemble
          ouvrira l'<strong>arc suivant</strong>.
        </p>
        <span className="chip inline-flex items-center gap-1.5 bg-[var(--color-arcane)]/15 text-[var(--color-gold-soft)]">
          <UiIcon name="dragon" size={14} /> Event communautaire — en préparation
        </span>
        <Link to="/" className="btn btn-ghost mt-1 text-xs">
          ← Activités
        </Link>
      </div>
    </section>
  );
}
