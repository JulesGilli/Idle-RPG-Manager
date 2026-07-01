import { useAuthStore } from '@/store/authStore';
import { useLeaderboard } from './useLeaderboard';

export function LeaderboardScreen() {
  const { data: rows, isLoading, isError, error } = useLeaderboard();
  const currentUserId = useAuthStore((s) => s.user?.id);

  return (
    <section>
      <h2 className="text-xl font-semibold">Classement global</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Comparaison de progression — 100% PvE, aucune interaction entre joueurs.
      </p>

      {isLoading && <p className="mt-4 text-neutral-500">Chargement du classement…</p>}
      {isError && (
        <p className="mt-4 text-red-400">
          Erreur : {error instanceof Error ? error.message : 'inconnue'}
        </p>
      )}

      {rows && (
        <div className="mt-4 overflow-hidden rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Joueur</th>
                <th className="px-4 py-2 text-right">Puissance</th>
                <th className="px-4 py-2 text-right">Donjons</th>
                <th className="px-4 py-2 text-right">Diff. max</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isMe = row.player_id === currentUserId;
                return (
                  <tr
                    key={row.player_id}
                    className={`border-t border-neutral-800 ${
                      isMe ? 'bg-indigo-950/40' : 'odd:bg-neutral-950 even:bg-neutral-900/40'
                    }`}
                  >
                    <td className="px-4 py-2 text-neutral-400">{i + 1}</td>
                    <td className="px-4 py-2">
                      {row.display_name}
                      {isMe && <span className="ml-2 text-xs text-indigo-300">(toi)</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-amber-300">
                      {row.total_power}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-300">
                      {row.dungeons_completed}
                    </td>
                    <td className="px-4 py-2 text-right text-neutral-300">{row.max_difficulty}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
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
