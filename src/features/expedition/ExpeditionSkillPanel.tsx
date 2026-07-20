import { useEffect, useMemo, useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { UiIcon } from '@/components/synty/GameIcons';
import {
  EXPEDITION_SKILLS,
  EXPEDITION_BRANCH_LABEL,
  expeditionLevelInfo,
  expeditionSkillPoints,
  expeditionSkillSpent,
  expeditionTotalBonus,
  type ExpeditionAlloc,
  type ExpeditionSkillNode,
} from '@shared/progression/expedition';
import { useSetExpeditionSkills } from './useExpedition';

const BRANCH_COLOR: Record<ExpeditionSkillNode['branch'], string> = {
  celerite: '#5fd39b',
  fortune: '#e8b64a',
  abondance: '#8b7cf6',
};

const BRANCH_HINT: Record<ExpeditionSkillNode['branch'], string> = {
  celerite: 'Raccourcit les expéditions',
  fortune: 'Tire le butin vers les ressources rares',
  abondance: 'Augmente les quantités rapportées',
};

const pct = (x: number) => `${Math.round(x * 100)} %`;

/**
 * Arbre de compétences d'expédition.
 *
 * Édition LOCALE puis validation en un appel, comme l'arbre des héros : poser un
 * point ne doit pas déclencher un aller-retour réseau.
 */
export function ExpeditionSkillPanel() {
  const { data: profile } = useProfile();
  const save = useSetExpeditionSkills();

  const level = expeditionLevelInfo(profile?.expedition_xp ?? 0).level;
  const budget = expeditionSkillPoints(level);
  const saved = useMemo<ExpeditionAlloc>(
    () => (profile?.expedition_skills ?? {}) as ExpeditionAlloc,
    [profile?.expedition_skills],
  );

  const [draft, setDraft] = useState<ExpeditionAlloc>(saved);
  // Le profil est la vérité : quand il change (gain de niveau, autre onglet),
  // le brouillon repart de lui plutôt que d'écraser des points fraîchement gagnés.
  useEffect(() => setDraft(saved), [saved]);

  const spent = expeditionSkillSpent(draft);
  const left = budget - spent;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const bump = (node: ExpeditionSkillNode, delta: number) =>
    setDraft((d) => {
      const next = Math.max(0, Math.min(node.maxRank, (d[node.id] ?? 0) + delta));
      const copy = { ...d };
      if (next === 0) delete copy[node.id];
      else copy[node.id] = next;
      return copy;
    });

  const before = expeditionTotalBonus(level, saved);
  const after = expeditionTotalBonus(level, draft);

  const branches = ['celerite', 'fortune', 'abondance'] as const;

  return (
    <div className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display flex items-center gap-2 text-sm font-bold text-[var(--color-ink)]">
          <UiIcon name="book" size={16} color="var(--color-gold-soft)" />
          Savoir-faire d'expédition
        </h3>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            left > 0
              ? 'bg-[var(--color-arcane)]/20 text-[var(--color-ink)]'
              : 'bg-white/5 text-[var(--color-muted)]'
          }`}
          title={`1 point par niveau d'expédition (niveau ${level})`}
        >
          {left} point{left > 1 ? 's' : ''} à placer
        </span>
      </div>

      <p className="text-[11px] text-[var(--color-muted)]">
        Un point par niveau d'expédition. L'arbre peut absorber{' '}
        {expeditionSkillSpent(
          Object.fromEntries(EXPEDITION_SKILLS.map((n) => [n.id, n.maxRank])),
        )}{' '}
        points au total pour {expeditionSkillPoints(20)} disponibles au niveau max — il faut
        choisir une voie.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        {branches.map((b) => (
          <div
            key={b}
            className="rounded-xl border p-2.5"
            style={{ borderColor: `${BRANCH_COLOR[b]}55`, background: `${BRANCH_COLOR[b]}0a` }}
          >
            <div className="mb-2">
              <span className="flex items-center gap-1.5 font-display text-xs font-bold text-[var(--color-ink)]">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: BRANCH_COLOR[b] }}
                />
                {EXPEDITION_BRANCH_LABEL[b]}
              </span>
              <span className="text-[10px] text-[var(--color-muted)]">{BRANCH_HINT[b]}</span>
            </div>

            <div className="space-y-1.5">
              {EXPEDITION_SKILLS.filter((n) => n.branch === b).map((node) => {
                const rank = draft[node.id] ?? 0;
                const canUp = rank < node.maxRank && left > 0;
                return (
                  <div
                    key={node.id}
                    className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 text-[11px] font-medium text-[var(--color-ink)]">
                        {node.name}
                      </span>
                      <span className="shrink-0 font-display text-[11px] font-bold tabular-nums" style={{ color: BRANCH_COLOR[b] }}>
                        {rank}/{node.maxRank}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="text-[10px] leading-tight text-[var(--color-muted)]">
                        {node.desc}
                      </span>
                      <span className="flex shrink-0 gap-1">
                        <button
                          onClick={() => bump(node, -1)}
                          disabled={rank === 0}
                          title="Retirer un rang"
                          className="h-5 w-5 rounded border border-[var(--color-edge)] text-[11px] leading-none text-[var(--color-muted)] transition hover:text-[var(--color-ink)] disabled:opacity-30"
                        >
                          −
                        </button>
                        <button
                          onClick={() => bump(node, +1)}
                          disabled={!canUp}
                          title={
                            rank >= node.maxRank
                              ? 'Rang maximum'
                              : left <= 0
                                ? 'Plus de points disponibles'
                                : 'Ajouter un rang'
                          }
                          className="h-5 w-5 rounded border border-[var(--color-edge)] text-[11px] leading-none text-[var(--color-muted)] transition hover:border-[var(--color-arcane)] hover:text-[var(--color-ink)] disabled:opacity-30"
                        >
                          +
                        </button>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Effet CONCRET de l'allocation en cours. Des « +2 % par rang » ne disent
          rien tant qu'on ne voit pas le total qu'ils produisent. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--color-muted)]">
        <span>
          Durée{' '}
          <span className="font-semibold text-[var(--color-ink)]">{pct(after.speedMult)}</span>
          {dirty && after.speedMult !== before.speedMult && (
            <span className="text-[var(--color-muted)]/70"> (avant {pct(before.speedMult)})</span>
          )}
        </span>
        <span>
          Chance de rare{' '}
          <span className="font-semibold text-[var(--color-ink)]">+{pct(after.luckBonus)}</span>
          {dirty && after.luckBonus !== before.luckBonus && (
            <span className="text-[var(--color-muted)]/70"> (avant +{pct(before.luckBonus)})</span>
          )}
        </span>
        <span>
          Quantités{' '}
          <span className="font-semibold text-[var(--color-ink)]">{pct(after.qtyMult)}</span>
          {dirty && after.qtyMult !== before.qtyMult && (
            <span className="text-[var(--color-muted)]/70"> (avant {pct(before.qtyMult)})</span>
          )}
        </span>
      </div>

      {dirty && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setDraft(saved)}
            disabled={save.isPending}
            className="rounded-md border border-[var(--color-edge)] px-3 py-1 text-xs font-medium text-[var(--color-muted)] transition hover:text-[var(--color-ink)] disabled:opacity-40"
          >
            Annuler
          </button>
          <button
            onClick={() => save.mutate(draft)}
            disabled={save.isPending}
            className="btn btn-primary px-3 py-1 text-xs disabled:opacity-50"
          >
            {save.isPending ? 'Enregistrement…' : 'Valider'}
          </button>
          <span className="text-[11px] text-[var(--color-muted)]">
            Les points se reprennent librement, sans coût.
          </span>
        </div>
      )}

      {save.isError && (
        <p className="text-[11px] text-[var(--color-ember)]">
          {save.error instanceof Error ? save.error.message : 'Échec de l’enregistrement'}
        </p>
      )}
    </div>
  );
}
