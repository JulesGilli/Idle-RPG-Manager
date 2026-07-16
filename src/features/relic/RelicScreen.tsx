import { relicLevelInfo, MAX_RELIC_LEVEL } from '@shared/progression/relic';
import { useProfile } from '@/hooks/useProfile';
import { MasteryBar } from '@/features/forge/craftUi';
import { UiIcon } from '@/components/synty/GameIcons';
import { BackToVillage } from '@/components/BackToVillage';
import { RelicScene } from './RelicScene';
import { RelicStudio } from './RelicStudio';

/**
 * Autel des Reliques — même atelier guidé que la Forge et la Joaillerie :
 * plan → composant → l'autel, qu'on consacre soi-même (cf. `craftRitual`).
 */
export function RelicScreen() {
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

      <RelicStudio />
    </section>
  );
}
