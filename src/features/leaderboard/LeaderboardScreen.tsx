import { useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { syntyUrl, MEDAL_TINT } from '@/lib/synty';
import { useMyGuild } from '@/features/guild/useGuild';
import { useLeaderboard, type LeaderboardRow } from './useLeaderboard';
import { PlayerProfileModal } from './PlayerProfileModal';

type Scope = 'global' | 'guild';

export function LeaderboardScreen() {
  const { data: allRows, isLoading, isError, error } = useLeaderboard();
  const { data: myGuild } = useMyGuild();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [selected, setSelected] = useState<LeaderboardRow | null>(null);
  const [scope, setScope] = useState<Scope>('global');

  const guildIds = useMemo(
    () => new Set((myGuild?.members ?? []).map((m) => m.player_id)),
    [myGuild],
  );
  const inGuild = guildIds.size > 0;

  const rows = useMemo(() => {
    if (!allRows) return allRows;
    if (scope === 'guild' && inGuild) return allRows.filter((r) => guildIds.has(r.player_id));
    return allRows;
  }, [allRows, scope, inGuild, guildIds]);

  return (
    <section className="anim-fade space-y-5">
      <div>
        <h2 className="heading text-2xl">Classement</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Comparaison de progression — 100% PvE. Clique un joueur pour voir sa fiche.
        </p>
      </div>

      {inGuild && (
        <div className="flex gap-2">
          <ScopeChip active={scope === 'global'} onClick={() => setScope('global')} label="Global" />
          <ScopeChip
            active={scope === 'guild'}
            onClick={() => setScope('guild')}
            label={`Ma guilde${myGuild?.guild.tag ? ` [${myGuild.guild.tag}]` : ''}`}
          />
        </div>
      )}

      {isLoading && <p className="text-[var(--color-muted)]">Chargement du classement…</p>}
      {isError && (
        <p className="text-[var(--color-ember)]">
          Erreur : {error instanceof Error ? error.message : 'inconnue'}
        </p>
      )}

      {rows && (
        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-edge)] text-left text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Joueur</th>
                <th className="px-4 py-3 text-right">Progression</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">Diff. max</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">Puissance</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">
                  <span className="inline-flex items-center justify-end gap-1">
                    <UiIcon name="gold" size={13} /> Or
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isMe = row.player_id === currentUserId;
                return (
                  <tr
                    key={row.player_id}
                    onClick={() => setSelected(row)}
                    title={`Voir la fiche de ${row.display_name}`}
                    className={`cursor-pointer border-b border-[var(--color-edge)]/60 transition ${
                      isMe ? 'bg-[var(--color-arcane)]/12' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <td className="px-4 py-3 font-display text-[var(--color-muted)]">
                      {i < 3 ? (
                        <SyntyGlyph
                          src={syntyUrl.map('Star01')}
                          color={MEDAL_TINT[i]!}
                          size={20}
                          title={`#${i + 1}`}
                        />
                      ) : (
                        i + 1
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[var(--color-ink)]">{row.display_name}</span>
                      {isMe && (
                        <span className="ml-2 text-xs text-[var(--color-arcane)]">(toi)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-display font-bold text-[var(--color-gold)]">
                      {row.levels_cleared}
                      <span className="ml-1 text-[10px] font-normal text-[var(--color-muted)]">niv.</span>
                    </td>
                    <td className="hidden px-4 py-3 text-right text-[var(--color-muted)] sm:table-cell">
                      {row.max_difficulty}
                    </td>
                    <td className="hidden px-4 py-3 text-right text-[var(--color-gold-soft)] tabular-nums sm:table-cell">
                      {row.total_power}
                    </td>
                    <td className="hidden px-4 py-3 text-right text-[var(--color-gold-soft)] tabular-nums sm:table-cell">
                      {row.gold}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--color-muted)]">
                    {scope === 'guild'
                      ? 'Aucun membre de ta guilde dans le top 100 pour l’instant.'
                      : "Aucun joueur classé pour l'instant."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selected && <PlayerProfileModal row={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

function ScopeChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
        active
          ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/20 text-white'
          : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:border-[var(--color-edge-strong)] hover:text-[var(--color-ink)]'
      }`}
    >
      {label}
    </button>
  );
}
