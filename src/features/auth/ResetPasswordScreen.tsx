/**
 * Écran de choix d'un nouveau mot de passe, affiché après un lien de
 * récupération.
 *
 * Il court-circuite le jeu tant que le mot de passe n'est pas changé : Supabase
 * ouvre une session valide dès le clic sur le lien, si bien que le joueur
 * entrerait sinon directement en jeu et ressortirait toujours sans mot de passe
 * connu — donc bloqué à la prochaine déconnexion.
 */
import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { SyntyImg } from '@/components/synty/SyntyIcon';
import { MAP_ART } from '@/lib/synty';

const MIN_LENGTH = 6;

export function ResetPasswordScreen() {
  const endRecovery = useAuthStore((s) => s.endRecovery);
  const signOut = useAuthStore((s) => s.signOut);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) {
      setError(`Le mot de passe doit faire au moins ${MIN_LENGTH} caractères.`);
      return;
    }
    // Vérifié ici plutôt que côté serveur : une faute de frappe recommencerait
    // tout le parcours e-mail, pour rien.
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(
        err.message.toLowerCase().includes('same')
          ? "Choisis un mot de passe différent de l'ancien."
          : err.message,
      );
      return;
    }
    setDone(true);
    endRecovery();
  }

  const field =
    'rounded-lg border border-[var(--color-edge)] bg-black/40 px-4 py-3 text-[var(--color-ink)] outline-none transition focus:border-[var(--color-arcane)]';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 p-6">
      <div className="anim-slide text-center">
        <div className="mb-3 flex justify-center">
          <SyntyImg src={MAP_ART.dragon} size={64} />
        </div>
        <h1 className="heading text-3xl">Nouveau mot de passe</h1>
      </div>

      <div className="panel anim-pop p-6">
        {done ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-emerald-300">
              Mot de passe enregistré. Tu peux reprendre ta partie.
            </p>
            <button onClick={() => endRecovery()} className="btn btn-primary w-full">
              Entrer dans le jeu
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <p className="text-sm text-[var(--color-muted)]">
              Choisis ton nouveau mot de passe. Il remplacera immédiatement l'ancien.
            </p>

            <label className="text-sm font-medium text-[var(--color-muted)]">
              Nouveau mot de passe
            </label>
            <input
              type="password"
              required
              minLength={MIN_LENGTH}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`Au moins ${MIN_LENGTH} caractères`}
              className={field}
            />

            <label className="text-sm font-medium text-[var(--color-muted)]">Confirmation</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Retape-le"
              className={field}
            />

            <button type="submit" disabled={busy} className="btn btn-primary mt-1">
              {busy ? 'Un instant…' : 'Enregistrer'}
            </button>

            {error && <p className="text-sm text-[var(--color-ember)]">{error}</p>}

            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:underline"
            >
              Annuler et revenir à la connexion
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
