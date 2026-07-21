import { useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { forgeLevelInfo, MAX_FORGE_LEVEL } from '@shared/progression/forge';
import { WORKSHOP_SLOTS } from '@shared/progression/sets';
import { CraftStudio } from './CraftStudio';
import { UpgradeStudio } from './UpgradeStudio';
import { DivineForgeStudio } from './DivineForgeStudio';
import { MasteryBar } from './craftUi';
import { UiIcon } from '@/components/synty/GameIcons';
import { type UiIconName } from '@/lib/synty';
import { BackToVillage } from '@/components/BackToVillage';
import { ForgeScene } from './ForgeScene';

export function ForgeScreen() {
  const [tab, setTab] = useState<'craft' | 'upgrade' | 'divine'>('craft');
  const { data: profile } = useProfile();
  const forge = forgeLevelInfo(profile?.forge_xp ?? 0);
  return (
    <section className="anim-fade space-y-5">
      <BackToVillage />
      <div className="panel relative overflow-hidden">
        <div className="relative h-44 w-full sm:h-52">
          <div className="absolute inset-0">
            <ForgeScene />
          </div>
          {/* Scrim pour la lisibilité du titre (couleur du panneau, comme le Village) */}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-panel)] via-[var(--color-panel)]/30 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <h2 className="heading flex items-center gap-2.5 text-2xl">
              <UiIcon name="forge" size={24} color="var(--color-gold-soft)" />
              Forge
            </h2>
            <p className="mt-1 max-w-xl text-sm text-[var(--color-muted)]">
              Le forgeron fabrique armes et armures — pièces classiques puis pièces de set (avec le butin
              d'expédition) —, puis renforce le tout. Bijoux à la Joaillerie, reliques à l'Autel.
            </p>
            {/* Barre de maîtrise de forge (XP de forge) sous la description */}
            <MasteryBar icon="forge" info={forge} maxLevel={MAX_FORGE_LEVEL} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <TabBtn active={tab === 'craft'} onClick={() => setTab('craft')} icon="craft" label="Fabriquer" />
        <TabBtn active={tab === 'upgrade'} onClick={() => setTab('upgrade')} icon="xp" label="Renforcer" />
        <TabBtn active={tab === 'divine'} onClick={() => setTab('divine')} icon="forge" label="Forge Sacrée" />
      </div>
      {tab === 'divine' ? (
        <DivineForgeStudio />
      ) : tab === 'craft' ? (
        <CraftTab />
      ) : (
        // La forge renforce SES types : les reliques relèvent de l'Autel, les
        // bijoux de la Joaillerie, la bénédiction de l'Oratoire. Sa maîtrise
        // bonifie la réussite.
        <UpgradeStudio
          itemTypes={WORKSHOP_SLOTS.forge}
          masteryLevel={forge.level}
          emptyLabel="Aucune arme ni armure à renforcer."
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

/* ------------------------------------------------------------------ CRAFT */

function CraftTab() {
  return (
    <div data-tour="forge-base">
      <CraftStudio />
    </div>
  );
}
