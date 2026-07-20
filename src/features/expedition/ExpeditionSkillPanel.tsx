import { useEffect, useMemo, useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { UiIcon } from '@/components/synty/GameIcons';
import {
  EXPEDITION_BRANCHES,
  expeditionBranchNodes,
  expeditionLevelInfo,
  expeditionNodeRequirement,
  expeditionRank,
  expeditionSkillPoints,
  expeditionSkillSpent,
  expeditionTotalBonus,
  expeditionTreeCost,
  type ExpeditionAlloc,
  type ExpeditionSkillNode,
} from '@shared/progression/expedition';
import { useSetExpeditionSkills } from './useExpedition';

const pct = (x: number) => `${Math.round(x * 100)} %`;

/**
 * Savoir-faire d'expédition — TROIS branches distinctes (Logistique / Rendement /
 * Butin), chacune gravie de haut en bas : un palier exige que les précédents de SA
 * branche soient au max. Les branches sont indépendantes.
 *
 * Édition LOCALE puis validation en un appel : poser un point ne doit pas
 * déclencher un aller-retour réseau.
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
  // Le profil fait foi : un gain de niveau (ou un autre onglet) rebase le
  // brouillon plutôt que d'écraser des points fraîchement gagnés.
  useEffect(() => setDraft(saved), [saved]);

  const spent = expeditionSkillSpent(draft);
  const left = budget - spent;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const before = expeditionTotalBonus(level, saved);
  const after = expeditionTotalBonus(level, draft);

  /** Points déjà investis dans les paliers PRÉCÉDANT celui-ci, DANS SA BRANCHE. */
  const investedBefore = (node: ExpeditionSkillNode): number => {
    let sum = 0;
    for (const n of expeditionBranchNodes(node.branch)) {
      if (n.id === node.id) break;
      sum += expeditionRank(draft, n.id);
    }
    return sum;
  };

  const bump = (node: ExpeditionSkillNode, delta: number) =>
    setDraft((d) => {
      const next = Math.max(0, Math.min(node.maxRank, expeditionRank(d, node.id) + delta));
      const copy = { ...d };
      if (next === 0) delete copy[node.id];
      else copy[node.id] = next;
      // Retirer un rang doit annuler tout ce qui vient APRÈS DANS SA BRANCHE : sans
      // ça, on laisserait une allocation que le serveur refuserait à la validation.
      if (delta < 0) {
        let seen = false;
        for (const n of expeditionBranchNodes(node.branch)) {
          if (n.id === node.id) {
            seen = true;
            continue;
          }
          if (seen) delete copy[n.id];
        }
      }
      return copy;
    });

  /** Carte d'un palier (réutilisée dans chaque branche). */
  const renderNode = (node: ExpeditionSkillNode) => {
    const rank = expeditionRank(draft, node.id);
    const requirement = expeditionNodeRequirement(node.id);
    const prevDone = investedBefore(node) >= requirement;
    const levelOk = !node.minLevel || level >= node.minLevel;
    const reachable = prevDone && levelOk;
    const canUp = reachable && rank < node.maxRank && left > 0;
    const isUnlock = Boolean(node.unlock);
    const done = rank >= node.maxRank;

    return (
      <div
        key={node.id}
        className={`rounded-lg border p-2.5 transition ${
          done
            ? 'border-[var(--color-gold)]/50 bg-[var(--color-gold)]/[0.07]'
            : reachable
              ? 'border-[var(--color-edge)] bg-white/[0.02]'
              : 'border-[var(--color-edge)] bg-black/20 opacity-55'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink)]">
              {!reachable && <UiIcon name="lock" size={12} />}
              {node.name}
              {isUnlock && (
                <span className="chip bg-[var(--color-arcane)]/20 px-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--color-arcane)]">
                  Déblocage
                </span>
              )}
            </span>
            <span className="block text-[11px] leading-snug text-[var(--color-muted)]">
              {node.desc}
            </span>
            {!levelOk && (
              <span className="block text-[11px] text-[var(--color-gold-soft)]">
                Niveau d'expédition {node.minLevel} requis (tu es niveau {level}).
              </span>
            )}
            {levelOk && !prevDone && (
              <span className="block text-[11px] text-[var(--color-muted)]/70">
                Investis {requirement} points dans cette branche d'abord.
              </span>
            )}
          </div>

          <span className="flex shrink-0 items-center gap-1.5">
            <span className="font-display text-xs font-bold tabular-nums text-[var(--color-gold-soft)]">
              {rank}/{node.maxRank}
            </span>
            <button
              onClick={() => bump(node, -1)}
              disabled={rank === 0}
              title="Retirer un rang (annule aussi les paliers au-dessus)"
              className="h-6 w-6 rounded border border-[var(--color-edge)] text-sm leading-none text-[var(--color-muted)] transition hover:text-[var(--color-ink)] disabled:opacity-30"
            >
              −
            </button>
            <button
              onClick={() => bump(node, +1)}
              disabled={!canUp}
              title={
                !levelOk
                  ? `Niveau ${node.minLevel} requis`
                  : !prevDone
                    ? 'Termine les paliers précédents de la branche'
                    : rank >= node.maxRank
                      ? 'Rang maximum'
                      : left <= 0
                        ? 'Plus de points disponibles'
                        : 'Ajouter un rang'
              }
              className="h-6 w-6 rounded border border-[var(--color-edge)] text-sm leading-none text-[var(--color-muted)] transition hover:border-[var(--color-arcane)] hover:text-[var(--color-ink)] disabled:opacity-30"
            >
              +
            </button>
          </span>
        </div>
      </div>
    );
  };

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
        Trois branches indépendantes, chacune gravie de haut en bas (chaque palier exige les
        précédents de SA branche). L'arbre complet coûte {expeditionTreeCost()} points — soit
        exactement le niveau maximum.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        {EXPEDITION_BRANCHES.map((branch) => (
          <div key={branch.id} className="space-y-1.5">
            <div className="rounded-lg border border-[var(--color-edge)] bg-black/20 px-2.5 py-1.5">
              <div className="font-display text-xs font-bold text-[var(--color-gold-soft)]">
                {branch.name}
              </div>
              <div className="text-[10px] leading-snug text-[var(--color-muted)]">{branch.desc}</div>
            </div>
            {expeditionBranchNodes(branch.id).map((node) => renderNode(node))}
          </div>
        ))}
      </div>

      {/* Effet CONCRET : des « +5 % par rang » ne disent rien tant qu'on ne voit
          pas le total qu'ils produisent. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--color-muted)]">
        <span>
          Durée <span className="font-semibold text-[var(--color-ink)]">{pct(after.speedMult)}</span>
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
