/**
 * COOLDOWNS D'UN JOUEUR (panneau admin) — lecture + remise à zéro.
 *
 * Les horloges d'attente vivent dans cinq tables différentes (`dungeon_cooldowns`,
 * `battlefield_cooldowns`, `arena_entries`, `profiles.last_map_fight_at`,
 * `garrison_borrow_usage`). Diagnostiquer un « je peux pas relancer » demandait
 * autant de requêtes SQL à la main ; tout est ici, avec le reste à attendre déjà
 * calculé.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  useAdminCooldowns,
  useAdminAction,
  RESET_SCOPES,
  RESET_SCOPE_LABEL,
  type ResetScope,
} from './useAdmin';

/**
 * Reste d'un cooldown, en clair.
 *
 * Calculé sur l'heure SERVEUR renvoyée avec les données, jamais sur `Date.now()` :
 * l'horloge de la machine de l'admin n'a aucune raison d'être à l'heure, et un
 * décalage afficherait des attentes fantaisistes — voire négatives.
 */
function since(iso: string | null, serverNow: string): string {
  if (!iso) return '—';
  const ms = Date.parse(serverNow) - Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h ${String(min % 60).padStart(2, '0')}`;
  return `il y a ${Math.floor(h / 24)} j`;
}

export function AdminCooldowns({ playerId }: { playerId: string }) {
  const { data, isLoading, error } = useAdminCooldowns(playerId);
  const action = useAdminAction();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<ResetScope | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  function reset(scope: ResetScope) {
    setFeedback(null);
    action.mutate(
      { action: 'reset_cooldown', player_id: playerId, scope },
      {
        onSuccess: (r) => {
          const done = (r as { reset?: string[] }).reset ?? [];
          setFeedback(`Remis à zéro : ${done.join(', ') || 'rien'}`);
          // La fiche du joueur ne bouge pas, mais ses horloges si.
          void queryClient.invalidateQueries({ queryKey: ['admin_cooldowns', playerId] });
        },
        onError: (e) => setFeedback(e instanceof Error ? e.message : 'Erreur'),
      },
    );
    setPending(null);
  }

  if (isLoading) return <p className="text-sm text-[var(--color-muted)]">Lecture des cooldowns…</p>;
  if (error)
    return (
      <p className="text-sm text-[var(--color-ember)]">
        {error instanceof Error ? error.message : 'Erreur'}
      </p>
    );
  if (!data) return null;

  const rows: { label: string; value: string }[] = [
    ...data.dungeons.map((d) => ({
      label: `Donjon ${d.dungeon_type_id} (arc ${d.arc ?? 1})`,
      value: since(d.last_run_at, data.server_now),
    })),
    ...data.battlefields.map((b) => ({
      label: `Bataille ${b.battlefield_id}`,
      value: since(b.last_run_at, data.server_now),
    })),
    { label: 'Arène', value: since(data.arena_last_challenge_at, data.server_now) },
    { label: 'Assaut de carte', value: since(data.map_last_fight_at, data.server_now) },
    ...data.expeditions.map((e) => ({
      label: `Expédition ${e.expedition_type_id}`,
      value: `se termine le ${new Date(e.ends_at).toLocaleString('fr-FR')}`,
    })),
    ...data.borrow_usage.map((b) => ({
      label: `Emprunt ${b.hero_id.slice(0, 8)}… (${b.usage_date})`,
      value: `${b.dungeon_runs} donjon(s) · ${b.map_fights} combat(s)`,
    })),
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {RESET_SCOPES.map((scope) => (
          <button
            key={scope}
            onClick={() => setPending(scope)}
            disabled={action.isPending}
            className={`btn px-2 py-1 text-[11px] ${scope === 'all' ? 'btn-primary' : 'btn-ghost'}`}
          >
            Reset {RESET_SCOPE_LABEL[scope].toLowerCase()}
          </button>
        ))}
      </div>

      {feedback && <p className="text-[11px] text-[var(--color-gold-soft)]">{feedback}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">Aucun cooldown en cours.</p>
      ) : (
        <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-2 text-[11px]">
              <span className="truncate text-[var(--color-muted)]">{r.label}</span>
              <span className="shrink-0 text-[var(--color-ink)]/80">{r.value}</span>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        danger
        busy={action.isPending}
        title={pending ? `Remettre à zéro : ${RESET_SCOPE_LABEL[pending]}` : ''}
        message={
          pending === 'all'
            ? 'Efface TOUTES les horloges d’attente de ce joueur (donjons, batailles, arène, carte, emprunts). Irréversible.'
            : `Efface les cooldowns « ${pending ? RESET_SCOPE_LABEL[pending] : ''} » de ce joueur. Irréversible.`
        }
        confirmLabel="Remettre à zéro"
        onConfirm={() => pending && reset(pending)}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
