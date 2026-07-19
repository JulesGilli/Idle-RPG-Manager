import { useAuthStore } from '@/store/authStore';
import { ClassIcon, UiIcon } from '@/components/synty/GameIcons';
import { classMeta } from '@/lib/gameUi';
import { usePlayerHeroes, type LeaderboardRow, type PublicHero } from './useLeaderboard';
import { BodyPortal } from '@/components/BodyPortal';

/** Fiche personnage publique : profil d'un joueur + ses héros (vue simplifiée). */
export function PlayerProfileModal({ row, onClose }: { row: LeaderboardRow; onClose: () => void }) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { data: heroes, isLoading } = usePlayerHeroes(row.player_id);
  const isMe = row.player_id === currentUserId;

  return (
    <BodyPortal>
    <div className="anim-fade fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8">
      <div className="panel anim-pop relative w-full max-w-2xl p-5">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          title="Fermer"
        >
          ✕
        </button>

        {/* En-tête profil */}
        <div className="mb-4">
          <h3 className="font-display flex items-center gap-2 text-xl font-bold text-[var(--color-ink)]">
            {row.display_name}
            {isMe && <span className="text-sm text-[var(--color-arcane)]">(toi)</span>}
          </h3>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="chip inline-flex items-center gap-1 bg-[var(--color-gold)]/10 text-[var(--color-gold-soft)]">
              <UiIcon name="power" size={13} /> Puissance {row.total_power}
            </span>
            <span className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-muted)]">
              <UiIcon name="map" size={13} /> {row.levels_cleared} niveaux
            </span>
            <span className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-muted)]">
              <UiIcon name="boss" size={13} /> Diff. max {row.max_difficulty}
            </span>
          </div>
        </div>

        {/* Héros */}
        <div className="mb-1 text-sm font-medium text-[var(--color-muted)]">
          Héros ({heroes?.length ?? 0})
        </div>
        {isLoading && <p className="text-sm text-[var(--color-muted)]">Chargement…</p>}
        {heroes && heroes.length === 0 && (
          <p className="text-sm text-[var(--color-muted)]">Aucun héros à afficher.</p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {(heroes ?? []).map((h) => (
            <HeroSheet key={h.id} h={h} />
          ))}
        </div>
      </div>
    </div>
    </BodyPortal>
  );
}

function HeroSheet({ h }: { h: PublicHero }) {
  const meta = classMeta(h.class_id);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--color-edge)] bg-black/20 p-2.5">
      <ClassIcon classId={h.class_id} size={30} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-sm font-medium text-[var(--color-ink)]">{h.name}</span>
          <span className="text-[10px] text-[var(--color-muted)]">N.{h.level}</span>
        </div>
        <div className="text-[10px] text-[var(--color-muted)]">{meta.label}</div>
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-[var(--color-muted)]">
          <span className="text-[var(--color-ember)]">ATK {h.atk}</span>
          <span className="text-[var(--color-arcane)]">DEF {h.def}</span>
          <span className="text-[#fb7185]">PV {h.hp}</span>
        </div>
      </div>
      <span
        className="shrink-0 rounded bg-[var(--color-gold)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-gold-soft)]"
        title="Puissance"
      >
        {h.power}
      </span>
    </div>
  );
}
