import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus('sending');
    setErrorMsg('');

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
    } else {
      setStatus('sent');
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 p-6">
      <div className="anim-slide text-center">
        <div className="mb-3 text-5xl drop-shadow-[0_0_18px_rgba(232,182,74,0.55)]">🐉</div>
        <h1 className="heading text-4xl">Idle-RPG Manager</h1>
        <p className="mt-3 text-[var(--color-muted)]">
          Commande ton escouade. Explore les donjons. Grimpe le classement.
        </p>
      </div>

      <div className="panel anim-pop p-6">
        {status === 'sent' ? (
          <div className="text-center">
            <div className="mb-2 text-3xl">✉️</div>
            <p className="text-[var(--color-ink)]">
              Lien de connexion envoyé à<br />
              <span className="font-semibold text-[var(--color-gold-soft)]">{email}</span>
            </p>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Ouvre ta boîte mail et clique sur le lien pour entrer.
            </p>
            <button onClick={() => setStatus('idle')} className="btn btn-ghost mt-4 text-sm">
              Utiliser une autre adresse
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="text-sm font-medium text-[var(--color-muted)]">Adresse e-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="commandant@royaume.fr"
              className="rounded-lg border border-[var(--color-edge)] bg-black/40 px-4 py-3 text-[var(--color-ink)] outline-none transition focus:border-[var(--color-arcane)] focus:shadow-[0_0_0_3px_rgba(139,124,246,0.15)]"
            />
            <button type="submit" disabled={status === 'sending'} className="btn btn-primary mt-1">
              {status === 'sending' ? 'Envoi…' : '✦ Recevoir un lien magique'}
            </button>
            {status === 'error' && <p className="text-sm text-[var(--color-ember)]">{errorMsg}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
