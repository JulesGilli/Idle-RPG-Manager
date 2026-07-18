import { useState } from 'react';
import { useHeroes } from '@/features/heroes/useHeroes';
import { useDummyStatus, useRunDummy, type DummyRunResult } from './useDailyDummy';
import { ClassIcon, UiIcon } from '@/components/synty/GameIcons';
import { classMeta } from '@/lib/gameUi';
import { BackToVillage } from '@/components/BackToVillage';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';

const MAX_TEAM = 5;

export function PantinScreen() {
  const { data: heroes } = useHeroes();
  const { data: status } = useDummyStatus();
  const run = useRunDummy();

  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<DummyRunResult | null>(null);
  const [replay, setReplay] = useState<StoredCombat | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Le pantin ne meurt jamais (combat "loss" côté moteur) : on force `win` pour
  // l'affichage — c'est un entraînement, pas un duel gagné/perdu.
  const toReplay = (r: DummyRunResult): StoredCombat => ({ ...r.combat, result: 'win' });

  const doneToday = status?.done_today ?? false;

  function toggle(id: string) {
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((h) => h !== id) : cur.length < MAX_TEAM ? [...cur, id] : cur,
    );
  }

  function hit() {
    setError(null);
    setResult(null);
    run.mutate(picked, {
      onSuccess: (r) => {
        setResult(r);
        setReplay(toReplay(r)); // ouvre le replay du combat aussitôt
      },
      onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
    });
  }

  return (
    <section className="anim-fade space-y-5">
      <BackToVillage />

      <div className="panel p-5">
        <h2 className="heading flex items-center gap-2 text-xl">
          <UiIcon name="squad" size={22} color="var(--color-gold-soft)" />
          Pantin d'entraînement
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Ton équipe frappe un mannequin qui ne riposte jamais pendant {status?.rounds ?? 50} tours.
          Ton score = total des dégâts infligés. <strong>1 dégât = 1 or.</strong> Une fois par jour.
        </p>
        {typeof status?.best_score === 'number' && status.best_score > 0 && (
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Meilleur score : <span className="font-semibold text-[var(--color-ink)]">{status.best_score.toLocaleString('fr-FR')}</span>
          </p>
        )}
      </div>

      {/* Sélection d'équipe */}
      <div className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-sm font-bold text-[var(--color-ink)]">
            Ton équipe · {picked.length}/{MAX_TEAM}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(heroes ?? []).map((h) => {
            const chosen = picked.includes(h.id);
            const full = picked.length >= MAX_TEAM && !chosen;
            const meta = classMeta(h.classId);
            return (
              <button
                key={h.id}
                onClick={() => toggle(h.id)}
                disabled={full}
                className={`flex items-center gap-2 rounded-lg border p-2 text-left text-sm transition ${
                  chosen
                    ? 'border-[var(--color-gold-soft)]/60 bg-[var(--color-gold-soft)]/10'
                    : full
                      ? 'border-[var(--color-edge)] opacity-40'
                      : 'border-[var(--color-edge)] hover:border-[var(--color-gold-soft)]/40'
                }`}
              >
                <ClassIcon classId={h.classId} size={22} />
                <span className="min-w-0">
                  <span className="block truncate text-[var(--color-ink)]">{h.name}</span>
                  <span className="block text-[10px]" style={{ color: meta.accent }}>
                    {meta.label} · N.{h.level} · {h.grade}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action + résultat */}
      <div className="panel p-4">
        {doneToday && !result ? (
          <p className="text-sm text-[var(--color-gold-soft)]">
            Tu as déjà frappé le pantin aujourd'hui — reviens demain.
          </p>
        ) : (
          <button
            onClick={hit}
            disabled={picked.length === 0 || run.isPending || doneToday}
            className="btn btn-primary text-sm"
          >
            {run.isPending ? 'Combat en cours…' : 'Frapper le pantin'}
          </button>
        )}

        {error && <p className="mt-3 text-sm text-[var(--color-ember)]">{error}</p>}

        {result && (
          <div className="mt-4 rounded-lg border border-[var(--color-gold-soft)]/40 bg-[var(--color-gold-soft)]/[0.06] p-4">
            <div className="text-sm text-[var(--color-muted)]">Score (dégâts infligés)</div>
            <div className="font-display text-3xl font-bold text-[var(--color-ink)]">
              {result.score.toLocaleString('fr-FR')}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-sm">
              <span className="text-[var(--color-muted)]">Récompense :</span>
              <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-gold-soft)]">
                {result.reward.gold.toLocaleString('fr-FR')} <UiIcon name="gold" size={13} color="var(--color-gold-soft)" />
              </span>
            </div>
            <button onClick={() => setReplay(toReplay(result))} className="btn btn-ghost mt-3 text-xs">
              ▶ Revoir le combat
            </button>
          </div>
        )}
      </div>

      {replay && (
        <CombatReplay
          combat={replay}
          title="Pantin d'entraînement"
          onClose={() => setReplay(null)}
          footer={
            result && (
              <div className="mt-3 text-center text-sm">
                <span className="text-[var(--color-muted)]">Score : </span>
                <span className="font-display font-bold text-[var(--color-ink)]">
                  {result.score.toLocaleString('fr-FR')}
                </span>
                <span className="text-[var(--color-muted)]"> · Récompense : </span>
                <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-gold-soft)]">
                  {result.reward.gold.toLocaleString('fr-FR')} <UiIcon name="gold" size={12} color="var(--color-gold-soft)" />
                </span>
              </div>
            )
          }
        />
      )}
    </section>
  );
}
