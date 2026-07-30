import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useProfile } from '@/hooks/useProfile';
import { useAuthStore } from '@/store/authStore';
import { useQueryClient } from '@tanstack/react-query';
import { BodyPortal } from '@/components/BodyPortal';

/**
 * Bannière « compte invité ». Visible uniquement pour un joueur en mode invité
 * (auth anonyme, `profiles.is_guest`). Elle propose de convertir l'invité en
 * compte permanent : `updateUser({ email, password })` ajoute des identifiants au
 * MÊME compte (même id) → toute la progression est conservée, aucune migration.
 * Le RPC `claim_guest_account` bascule ensuite `is_guest = false`.
 */
export function GuestBanner() {
  const { data: profile } = useProfile();
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (!profile?.is_guest) return null;

  async function convert(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true);
    setError('');

    const { error: err } = await supabase.auth.updateUser({ email, password });
    if (err) {
      const m = err.message.toLowerCase();
      setError(
        m.includes('registered') || m.includes('already')
          ? 'Un compte existe déjà avec cet e-mail.'
          : m.includes('at least 6')
            ? 'Le mot de passe doit faire au moins 6 caractères.'
            : err.message,
      );
      setBusy(false);
      return;
    }

    // L'invité est désormais un compte permanent : on le sort du mode invité.
    await supabase.rpc('claim_guest_account');
    await qc.invalidateQueries({ queryKey: ['profile', userId] });
    setDone(true);
    setBusy(false);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-2 bg-[var(--color-gold)]/10 px-4 py-2 text-center text-xs text-[var(--color-ink)]">
        <span>
          Tu joues en <strong className="text-[var(--color-gold-soft)]">invité</strong> — ta
          progression n'est pas encore protégée.
        </span>
        <button
          onClick={() => setOpen(true)}
          className="rounded-md bg-[var(--color-gold)]/20 px-2.5 py-1 font-semibold text-[var(--color-gold-soft)] transition hover:bg-[var(--color-gold)]/30"
        >
          Créer un compte pour la sauvegarder
        </button>
      </div>

      {open && (
        <BodyPortal>
          <div className="anim-fade fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="panel anim-pop w-full max-w-sm p-5">
              {done ? (
                <div className="text-center">
                  <h3 className="heading text-lg">Compte créé !</h3>
                  <p className="mt-2 text-sm text-[var(--color-muted)]">
                    Ta progression est maintenant sauvegardée. Tu pourras te reconnecter avec cet
                    e-mail et ce mot de passe.
                  </p>
                  <button onClick={() => setOpen(false)} className="btn btn-primary mt-4 w-full text-sm">
                    Continuer
                  </button>
                </div>
              ) : (
                <form onSubmit={convert} className="flex flex-col gap-3">
                  <h3 className="heading text-lg">Sauvegarde ta progression</h3>
                  <p className="-mt-1 text-xs text-[var(--color-muted)]">
                    On garde ton escouade et toute ton avancée — on ajoute juste un e-mail et un mot
                    de passe à ton compte actuel.
                  </p>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="commandant@royaume.fr"
                    className="rounded-lg border border-[var(--color-edge)] bg-black/40 px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-arcane)]"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mot de passe (6 caractères min.)"
                    className="rounded-lg border border-[var(--color-edge)] bg-black/40 px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-arcane)]"
                  />
                  {error && <p className="text-xs text-[var(--color-ember)]">{error}</p>}
                  <div className="mt-1 flex gap-2">
                    <button type="submit" disabled={busy} className="btn btn-primary flex-1 text-sm">
                      {busy ? 'Un instant…' : 'Créer mon compte'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="btn btn-ghost text-sm"
                    >
                      Plus tard
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </BodyPortal>
      )}
    </>
  );
}
