import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { SyntyImg } from '@/components/synty/SyntyIcon';
import { MAP_ART } from '@/lib/synty';

type Mode = 'signin' | 'signup';

/** Traduit les erreurs Supabase les plus courantes. */
function frError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('already registered')) return 'Un compte existe déjà avec cet e-mail.';
  if (m.includes('at least 6')) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (m.includes('email') && m.includes('invalid')) return 'Adresse e-mail invalide.';
  return message;
}

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true);
    setError('');

    const fn =
      mode === 'signin'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });
    const { data, error: err } = await fn;

    if (err) {
      setError(frError(err.message));
      setBusy(false);
      return;
    }
    // Inscription avec confirmation d'e-mail activée → pas de session immédiate.
    if (mode === 'signup' && !data.session) {
      setError(
        "Compte créé, mais la confirmation d'e-mail est activée. Désactive-la dans Supabase pour entrer directement.",
      );
      setBusy(false);
      return;
    }
    // Succès : onAuthStateChange (authStore) prend le relais et affiche le jeu.
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 p-6">
      <div className="anim-slide text-center">
        <div className="mb-3 flex justify-center">
          <SyntyImg src={MAP_ART.dragon} size={64} />
        </div>
        <h1 className="heading text-4xl">Idle-RPG Manager</h1>
        <p className="mt-3 text-[var(--color-muted)]">
          Commande ton escouade. Explore les donjons. Grimpe le classement.
        </p>
      </div>

      <div className="panel anim-pop p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="text-sm font-medium text-[var(--color-muted)]">Adresse e-mail</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="commandant@royaume.fr"
            className="rounded-lg border border-[var(--color-edge)] bg-black/40 px-4 py-3 text-[var(--color-ink)] outline-none transition focus:border-[var(--color-arcane)] focus:shadow-[0_0_0_3px_rgba(139,124,246,0.15)]"
          />

          <label className="text-sm font-medium text-[var(--color-muted)]">Mot de passe</label>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Au moins 6 caractères"
            className="rounded-lg border border-[var(--color-edge)] bg-black/40 px-4 py-3 text-[var(--color-ink)] outline-none transition focus:border-[var(--color-arcane)] focus:shadow-[0_0_0_3px_rgba(139,124,246,0.15)]"
          />

          <button type="submit" disabled={busy} className="btn btn-primary mt-1">
            {busy
              ? 'Un instant…'
              : mode === 'signin'
                ? 'Se connecter'
                : 'Créer mon compte'}
          </button>

          {error && <p className="text-sm text-[var(--color-ember)]">{error}</p>}
        </form>

        <div className="mt-4 text-center text-sm text-[var(--color-muted)]">
          {mode === 'signin' ? (
            <>
              Pas encore de compte ?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError('');
                }}
                className="font-semibold text-[var(--color-gold-soft)] hover:underline"
              >
                Créer un compte
              </button>
            </>
          ) : (
            <>
              Déjà un compte ?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError('');
                }}
                className="font-semibold text-[var(--color-gold-soft)] hover:underline"
              >
                Se connecter
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
