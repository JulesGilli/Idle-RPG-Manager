import { useAuthStore } from '@/store/authStore';
import { useLeaderboard } from './useLeaderboard';

const MEDAL = ['🥇', '🥈', '🥉'];

export function LeaderboardScreen() {
  const { data: rows, isLoading, isError, error } = useLeaderboard();
  const currentUserId = useAuthStore((s) => s.user?.id);

  return (
    <section className="anim-fade space-y-5">
      <div>
        <h2 className="heading text-2xl">Classement global</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Comparaison de progression — 100% PvE, aucune interaction entre joueurs.
        </p>
      </div>

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
                <th className="px-4 py-3 text-right">Puissance</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">💰 Or</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">Donjons</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">Diff. max</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isMe = row.player_id === currentUserId;
                return (
                  <tr
                    key={row.player_id}
                    className={`border-b border-[var(--color-edge)]/60 transition ${
                      isMe ? 'bg-[var(--color-arcane)]/12' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <td className="px-4 py-3 font-display text-[var(--color-muted)]">
                      {MEDAL[i] ?? i + 1}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[var(--color-ink)]">{row.display_name}</span>
                      {isMe && (
                        <span className="ml-2 text-xs text-[var(--color-arcane)]">(toi)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-display font-bold text-[var(--color-gold)]">
                      {row.total_power}
                    </td>
                    <td className="hidden px-4 py-3 text-right text-[var(--color-gold-soft)] tabular-nums sm:table-cell">
                      {row.gold}
                    </td>
                    <td className="hidden px-4 py-3 text-right text-[var(--color-muted)] sm:table-cell">
                      {row.dungeons_completed}
                    </td>
                    <td className="hidden px-4 py-3 text-right text-[var(--color-muted)] sm:table-cell">
                      {row.max_difficulty}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--color-muted)]">
                    Aucun joueur classé pour l'instant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
