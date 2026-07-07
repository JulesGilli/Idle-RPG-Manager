import { Link } from 'react-router-dom';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { syntyUrl } from '@/lib/synty';
import { useUnlocks } from '@/hooks/useUnlocks';
import { ACTIVITY_UNLOCKS, type ActivityKey } from '@shared/progression/account.ts';

type Activity = {
  to: string;
  iconSrc: string;
  title: string;
  desc: string;
  accent: string;
  /** Palier de déblocage ; absent = toujours disponible (la Carte). */
  activity?: ActivityKey;
};

// Toutes les façons de partir au combat, regroupées en un seul endroit.
const ACTIVITIES: Activity[] = [
  {
    to: '/map',
    iconSrc: syntyUrl.map('Flag01'),
    title: 'Carte du monde',
    desc: 'Déploie tes escouades zone par zone : le cœur du farm, en continu.',
    accent: '#5fd39b',
  },
  {
    to: '/tower',
    iconSrc: syntyUrl.map('Target01'),
    title: 'La Tour',
    desc: 'Un héros grimpe étage par étage, la difficulté monte sans cesse.',
    accent: '#56b6f4',
    activity: 'tower',
  },
  {
    to: '/dungeon',
    iconSrc: syntyUrl.map('Skull01'),
    title: 'Donjons',
    desc: 'Une chaîne de combats sans repos : duel d’endurance jusqu’au boss.',
    accent: '#c084fc',
    activity: 'dungeon',
  },
  {
    to: '/expeditions',
    iconSrc: syntyUrl.map('Horse01'),
    title: 'Expéditions',
    desc: 'Envoie une équipe en mission longue et récolte à son retour.',
    accent: '#e0793c',
    activity: 'expedition',
  },
  {
    to: '/arena',
    iconSrc: syntyUrl.inv('Swords01'),
    title: 'Arène',
    desc: 'Affronte les escouades des autres joueurs et grimpe au classement.',
    accent: '#f5b544',
    activity: 'arena',
  },
  {
    to: '/arc-boss',
    iconSrc: syntyUrl.map('Dragon01'),
    title: "Boss d'arc",
    desc: 'Les grands boss de la campagne : le défi de fin d’arc.',
    accent: '#ef5d7a',
    activity: 'arc_boss',
  },
];

export function ActivitiesScreen() {
  return (
    <section className="anim-fade space-y-6">
      <div>
        <h2 className="heading flex items-center gap-2.5 text-2xl">
          <SyntyGlyph src={syntyUrl.inv('Swords01')} size={26} color="var(--color-gold-soft)" />
          Activités
        </h2>
        <p className="mt-1 max-w-xl text-sm text-[var(--color-muted)]">
          Toutes les façons de partir au combat, réunies ici : la carte pour farmer, la tour et les
          donjons pour les défis, les expéditions, l’arène et les boss d’arc.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ACTIVITIES.map((a) => (
          <ActivityCard key={a.to} activity={a} />
        ))}
      </div>
    </section>
  );
}

function ActivityCard({ activity: a }: { activity: Activity }) {
  const unlocks = useUnlocks();
  const locked = a.activity ? !unlocks.unlocked(a.activity) : false;
  const reqLabel = a.activity ? `Niveau de compte ${ACTIVITY_UNLOCKS[a.activity]}` : '';

  const inner = (
    <>
      <span
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ background: locked ? 'var(--color-edge-strong)' : a.accent }}
      />

      <div className="flex items-start gap-4 p-5 pl-6">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: locked ? 'rgba(255,255,255,0.04)' : `${a.accent}1f` }}
        >
          <SyntyGlyph src={a.iconSrc} size={38} color={locked ? 'var(--color-muted)' : a.accent} />
        </div>
        <div className="min-w-0">
          <h4 className="font-display text-base font-bold text-[var(--color-ink)]">{a.title}</h4>
          <p className="mt-1.5 text-sm text-[var(--color-muted)]">{a.desc}</p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-[var(--color-edge)] px-6 py-3 text-sm font-semibold text-[var(--color-muted)]">
        {locked ? (
          <span className="inline-flex items-center gap-1.5">
            <UiIcon name="lock" size={14} color="currentColor" /> {reqLabel}
          </span>
        ) : (
          <>
            <span className="transition group-hover:text-[var(--color-ink)]">Y aller</span>
            <span className="transition group-hover:translate-x-0.5">→</span>
          </>
        )}
      </div>
    </>
  );

  if (locked) {
    return (
      <div
        className="panel relative flex cursor-not-allowed flex-col overflow-hidden opacity-70"
        title={`Débloqué : ${reqLabel}`}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link to={a.to} className="panel panel-hover group relative flex flex-col overflow-hidden">
      {inner}
    </Link>
  );
}
