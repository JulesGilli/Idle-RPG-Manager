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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Idle-RPG Manager</h1>
        <p className="mt-2 text-neutral-400">Connecte-toi pour diriger ton escouade.</p>
      </div>

      {status === 'sent' ? (
        <div className="rounded-lg border border-emerald-700 bg-emerald-950/40 p-4 text-center text-emerald-300">
          Lien de connexion envoyé à <span className="font-semibold">{email}</span>.<br />
          Ouvre ta boîte mail et clique sur le lien.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ton@email.com"
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-neutral-100 outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            className="rounded-lg bg-indigo-600 px-4 py-3 font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === 'sending' ? 'Envoi…' : 'Recevoir un lien magique'}
          </button>
          {status === 'error' && <p className="text-sm text-red-400">{errorMsg}</p>}
        </form>
      )}
    </main>
  );
}
