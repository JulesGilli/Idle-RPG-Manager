import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { UiIcon } from '@/components/synty/GameIcons';

// La RPC set_initial_pseudo n'est pas dans les types générés → client permissif.
const pdb = supabase as unknown as SupabaseClient;

/**
 * Choix du pseudo à la 1re connexion. S'affiche tant que `pseudo_chosen` est faux.
 * Passe par la RPC `set_initial_pseudo` : ce choix initial NE compte PAS dans les
 * 2 changements de pseudo autorisés ensuite.
 */
export function ChoosePseudoModal({ suggestion }: { suggestion: string }) {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const [name, setName] = useState(suggestion);
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (pseudo: string) => {
      const { error } = await pdb.rpc('set_initial_pseudo', { p_name: pseudo.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile', userId] });
      void qc.invalidateQueries({ queryKey: ['leaderboard'] });
    },
    onError: (e) => setErr(e instanceof Error ? e.message : 'Erreur'),
  });

  const clean = name.trim();
  const valid = clean.length >= 2 && clean.length <= 24;

  function submit() {
    setErr(null);
    if (!valid) {
      setErr('Le pseudo doit faire entre 2 et 24 caractères.');
      return;
    }
    save.mutate(clean);
  }

  return (
    <div className="anim-fade fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
      <div className="panel anim-pop w-full max-w-sm p-6">
        <div className="mb-1 flex items-center gap-2.5">
          <UiIcon name="squad" size={24} color="var(--color-gold-soft)" />
          <h2 className="heading text-xl">Choisis ton pseudo</h2>
        </div>
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          C'est le nom que verront les autres joueurs (classement, chat, guilde). Tu pourras encore
          le changer 2 fois plus tard.
        </p>

        <input
          autoFocus
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="Ton pseudo"
          className="w-full rounded-lg border border-[var(--color-edge)] bg-[var(--color-panel-2)] px-3 py-2 font-display text-lg font-bold text-[var(--color-ink)] outline-none focus:border-[var(--color-gold)]"
        />
        <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--color-muted)]">
          <span>{err ? <span className="text-[var(--color-ember)]">{err}</span> : '2 à 24 caractères'}</span>
          <span className="tabular-nums">{clean.length}/24</span>
        </div>

        <button
          onClick={submit}
          disabled={!valid || save.isPending}
          className="btn btn-primary mt-4 w-full text-sm disabled:opacity-50"
        >
          {save.isPending ? '…' : "C'est parti !"}
        </button>
      </div>
    </div>
  );
}
