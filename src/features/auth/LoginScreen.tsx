import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { SyntyImg } from '@/components/synty/SyntyIcon';
import { MAP_ART } from '@/lib/synty';

type Mode = 'signin' | 'signup' | 'forgot';

/**
 * Où Supabase renvoie le joueur après le clic sur le lien de récupération.
 *
 * `BASE_URL` et non `/` : le jeu est servi sous un sous-chemin
 * (`/Idle-RPG-Manager/`), et une redirection vers la racine tomberait sur une
 * page morte. Cette URL doit aussi figurer dans les « Redirect URLs » du
 * dashboard Supabase, sinon le lien est refusé.
 */
function recoveryRedirectUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

/** Traduit les erreurs Supabase les plus courantes. */
function frError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('already registered')) return 'Un compte existe déjà avec cet e-mail.';
  if (m.includes('at least 6')) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (m.includes('email') && m.includes('invalid')) return 'Adresse e-mail invalide.';
  return message;
}

/** Logo Google officiel (inline : la CSP des Artifacts/preview interdit les hôtes externes). */
function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  /**
   * Connexion Google (OAuth). Redirige vers le fournisseur puis revient à l'URL
   * de base du jeu — la MÊME que la récupération de mot de passe, et qui doit
   * figurer dans les « Redirect URLs » du dashboard Supabase, sinon le retour
   * est refusé. Au retour, `onAuthStateChange` (authStore) prend le relais et le
   * trigger `handle_new_user` a déjà créé le profil pour un nouveau compte.
   */
  async function handleGoogle() {
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: recoveryRedirectUrl() },
    });
    // En cas de succès le navigateur part chez Google : ce code n'est atteint
    // que si l'appel ÉCHOUE (provider non configuré, réseau…).
    if (err) {
      setError(frError(err.message));
      setBusy(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (mode === 'forgot') {
      if (!email) return;
      setBusy(true);
      setError('');
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: recoveryRedirectUrl(),
      });
      setBusy(false);
      // On affiche le même message qu'il y ait un compte ou non : répondre
      // « cet e-mail est inconnu » permettrait à n'importe qui de tester des
      // adresses pour savoir lesquelles sont inscrites.
      if (err && !err.message.toLowerCase().includes('not found')) {
        setError(frError(err.message));
        return;
      }
      setSent(true);
      return;
    }

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

          {mode !== 'forgot' && (
            <>
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
            </>
          )}

          {mode === 'forgot' && !sent && (
            <p className="text-sm text-[var(--color-muted)]">
              On t'envoie un lien pour choisir un nouveau mot de passe.
            </p>
          )}

          {sent ? (
            <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              Si un compte existe avec cette adresse, le lien vient de partir. Pense à regarder
              dans tes spams — il expire au bout d'une heure.
            </p>
          ) : (
            <button type="submit" disabled={busy} className="btn btn-primary mt-1">
              {busy
                ? 'Un instant…'
                : mode === 'signin'
                  ? 'Se connecter'
                  : mode === 'signup'
                    ? 'Créer mon compte'
                    : 'Envoyer le lien'}
            </button>
          )}

          {mode === 'signin' && (
            <button
              type="button"
              onClick={() => {
                setMode('forgot');
                setError('');
                setSent(false);
              }}
              className="text-left text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:underline"
            >
              Mot de passe oublié ?
            </button>
          )}

          {error && <p className="text-sm text-[var(--color-ember)]">{error}</p>}
        </form>

        {/* Google : hors du <form> pour que ce ne soit jamais un submit implicite.
            Masqué en mode « mot de passe oublié », où il n'aurait aucun sens. */}
        {mode !== 'forgot' && (
          <>
            <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-widest text-[var(--color-muted)]">
              <span className="h-px flex-1 bg-[var(--color-edge)]" />
              ou
              <span className="h-px flex-1 bg-[var(--color-edge)]" />
            </div>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-[var(--color-edge)] bg-white/[0.03] px-4 py-3 text-sm font-medium text-[var(--color-ink)] transition hover:bg-white/[0.06] disabled:opacity-50"
            >
              <GoogleGlyph />
              Continuer avec Google
            </button>
          </>
        )}

        <div className="mt-4 text-center text-sm text-[var(--color-muted)]">
          {mode === 'forgot' ? (
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError('');
                setSent(false);
              }}
              className="font-semibold text-[var(--color-gold-soft)] hover:underline"
            >
              ← Retour à la connexion
            </button>
          ) : mode === 'signin' ? (
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
