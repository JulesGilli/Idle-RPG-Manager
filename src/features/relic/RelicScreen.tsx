import { useState } from 'react';
import { relicLevelInfo, MAX_RELIC_LEVEL } from '@shared/progression/relic';
import { WORKSHOP_SLOTS } from '@shared/progression/sets';
import { useProfile } from '@/hooks/useProfile';
import { MasteryBar } from '@/features/forge/craftUi';
import { UpgradeStudio } from '@/features/forge/UpgradeStudio';
import { UiIcon } from '@/components/synty/GameIcons';
import { type UiIconName } from '@/lib/synty';
import { BackToVillage } from '@/components/BackToVillage';
import { RelicScene } from './RelicScene';
import { RelicStudio } from './RelicStudio';

/**
 * Autel des Reliques — même structure que la Forge : on façonne (rituel guidé)
 * puis on renforce, chacun avec la maîtrise de reliquaire.
 */
export function RelicScreen() {
  const [tab, setTab] = useState<'craft' | 'upgrade'>('craft');
  const { data: profile } = useProfile();
  const relic = relicLevelInfo(profile?.relic_xp ?? 0);

  return (
    <section className="anim-fade space-y-5">
      <BackToVillage />

      <div className="panel relative overflow-hidden p-0">
        <RelicScene />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent p-5">
          <h2 className="heading flex items-center gap-2 text-2xl">
            <UiIcon name="relic" size={24} color="var(--color-gold-soft)" />
            Autel des Reliques
          </h2>
          <p className="max-w-xl text-sm text-white/80">
            Façonne des reliques : le composant porte la stat prioritaire du modèle, les matériaux de boss
            alimentent les deux autres. Renforcées par le butin des donjons.
          </p>
          {/* Maîtrise de reliquaire : plus le niveau monte, meilleures sont les raretés. */}
          <MasteryBar icon="relic" info={relic} maxLevel={MAX_RELIC_LEVEL} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <TabBtn active={tab === 'craft'} onClick={() => setTab('craft')} icon="craft" label="Façonner" />
        <TabBtn active={tab === 'upgrade'} onClick={() => setTab('upgrade')} icon="xp" label="Renforcer" />
      </div>

      {tab === 'craft' ? (
        <RelicStudio />
      ) : (
        // Les reliques se renforçaient à la FORGE : c'est l'Autel qui les fait,
        // donc c'est sa maîtrise qui doit compter. Pas de bénédiction ici (armes
        // uniquement).
        <UpgradeStudio
          itemTypes={WORKSHOP_SLOTS.altar}
          masteryLevel={relic.level}
          emptyLabel="Aucune relique à renforcer."
        />
      )}
    </section>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: UiIconName;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-white'
          : 'border-transparent text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-ink)]'
      }`}
    >
      <UiIcon name={icon} size={15} color="currentColor" />
      {label}
    </button>
  );
}
