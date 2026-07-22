import { useState } from 'react';
import { DonateButton } from '@/features/donate/DonateButton';
import { useProfile } from '@/hooks/useProfile';
import { useAccount } from '@/hooks/useAccount';
import { useRenameProfile } from '@/hooks/useRenameProfile';
import { useTitlesStatus } from '@/features/achievements/useAchievements';
import { AchievementsPanel } from '@/features/achievements/AchievementsPanel';
import { BackToVillage } from '@/components/BackToVillage';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { UiIcon } from '@/components/synty/GameIcons';

/** Plafond de changements de pseudo (aligné sur le trigger DB, migration 0061). */
const MAX_NAME_CHANGES = 2;

export function ProfileScreen() {
  const { data: profile } = useProfile();
  const account = useAccount();
  const { data: titles } = useTitlesStatus();
  const rename = useRenameProfile();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  if (!profile) return null;

  const used = profile.name_changes ?? 0;
  const remaining = Math.max(0, MAX_NAME_CHANGES - used);
  const canChange = remaining > 0;
  const xpPct = Math.min(100, Math.round((account.xpInLevel / Math.max(1, account.xpForLevel)) * 100));
  const memberSince = profile.created_at ? new Date(profile.created_at).toLocaleDateString('fr-FR') : null;

  const startEdit = () => {
    setName(profile.display_name);
    setErr(null);
    setEditing(true);
  };

  const askConfirm = () => {
    const clean = name.trim();
    if (clean === profile.display_name) {
      setEditing(false);
      return;
    }
    if (clean.length < 2 || clean.length > 24) {
      setErr('Le pseudo doit faire entre 2 et 24 caractères.');
      return;
    }
    setErr(null);
    setConfirm(true);
  };

  const doRename = () => {
    setConfirm(false);
    rename.mutate(name.trim(), {
      onSuccess: () => setEditing(false),
      onError: (e) => setErr(e instanceof Error ? e.message : 'Erreur'),
    });
  };

  return (
    <section className="anim-fade space-y-5">
      <BackToVillage />

      {/* Identité + compte */}
      <div className="panel p-5">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-gold)]/12">
            <UiIcon name="squad" size={30} color="var(--color-gold-soft)" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted)]">
              Ton profil
            </div>
            <div className="truncate font-display text-2xl font-bold text-[var(--color-ink)]">
              {profile.display_name}
            </div>
            {titles?.title && (
              <div className="truncate text-sm font-semibold text-[var(--color-gold-soft)]">« {titles.title} »</div>
            )}
          </div>
        </div>

        {/* Barre d'XP de compte */}
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
              <UiIcon name="xp" size={14} /> Compte Nv.{account.level}
              <span className="text-[var(--color-muted)]">· {account.title}</span>
            </span>
            <span className="tabular-nums text-[var(--color-muted)]">
              {account.xpInLevel}/{account.xpForLevel} XP
            </span>
          </div>
          <span className="block h-2 overflow-hidden rounded-full bg-black/40">
            <span className="block h-full rounded-full bg-[var(--color-arcane)]" style={{ width: `${xpPct}%` }} />
          </span>
        </div>

        {/* Petites stats */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="stat-chip">
            <span className="flex items-center gap-1 text-sm font-semibold text-[var(--color-gold-soft)]">
              <UiIcon name="gold" size={13} /> {profile.gold}
            </span>
            <span className="text-[10px] text-[var(--color-muted)]">Or</span>
          </div>
          <div className="stat-chip">
            <span className="text-sm font-semibold text-[var(--color-ink)]">Nv.{account.level}</span>
            <span className="text-[10px] text-[var(--color-muted)]">Niveau de compte</span>
          </div>
          {memberSince && (
            <div className="stat-chip">
              <span className="text-sm font-semibold text-[var(--color-ink)]">{memberSince}</span>
              <span className="text-[10px] text-[var(--color-muted)]">Membre depuis</span>
            </div>
          )}
        </div>
      </div>

      {/* Changer de pseudo */}
      <div className="panel p-5">
        <h3 className="heading text-base">Pseudo</h3>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {canChange ? (
            <>
              Il te reste{' '}
              <span className="font-semibold text-[var(--color-ink)]">
                {remaining} changement{remaining > 1 ? 's' : ''}
              </span>{' '}
              sur {MAX_NAME_CHANGES}. Choisis bien.
            </>
          ) : (
            'Tu as utilisé tous tes changements de pseudo.'
          )}
        </p>

        {editing ? (
          <div className="mt-3 space-y-2">
            <input
              autoFocus
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') askConfirm();
                if (e.key === 'Escape') setEditing(false);
              }}
              placeholder="Nouveau pseudo (2 à 24 caractères)"
              className="w-full rounded-lg border border-[var(--color-edge)] bg-[var(--color-panel-2)] px-3 py-2 font-display text-lg font-bold text-[var(--color-ink)] outline-none focus:border-[var(--color-gold)]"
            />
            <div className="flex items-center gap-2">
              <button onClick={askConfirm} disabled={rename.isPending} className="btn btn-primary text-sm">
                {rename.isPending ? '…' : 'Enregistrer'}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setErr(null);
                }}
                className="rounded-lg border border-[var(--color-edge)] px-3 py-2 text-sm font-medium text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
              >
                Annuler
              </button>
            </div>
            {err && <p className="text-xs text-[var(--color-ember)]">{err}</p>}
          </div>
        ) : (
          <button
            onClick={startEdit}
            disabled={!canChange}
            className="btn btn-primary mt-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            Changer de pseudo
          </button>
        )}
      </div>

      {/* Succès & titres */}
      <AchievementsPanel />

      <ConfirmDialog
        open={confirm}
        title="Changer de pseudo"
        message={
          <>
            Confirmer le passage à « <b>{name.trim()}</b> » ? Il te restera{' '}
            <b>{Math.max(0, remaining - 1)}</b> changement(s) après ça.
          </>
        }
        confirmLabel="Confirmer"
        busy={rename.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={doRename}
      />
      <DonateButton />
    </section>
  );
}
