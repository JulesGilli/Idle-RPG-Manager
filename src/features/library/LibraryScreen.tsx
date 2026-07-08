import { Fragment, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useHeroes, type HeroView } from '@/features/heroes/useHeroes';
import { useLearnSkill, useResetSkills, useSelectSkill } from './useLearnSkill';
import { useProfile } from '@/hooks/useProfile';
import { classMeta } from '@/lib/gameUi';
import {
  skillTreeFor,
  validateLearn,
  branchPoints,
  spentPoints,
  resetCost,
  describeNodeEffects,
  resolveLoadout,
  allNodes,
  ULTIMATE_GATE,
  type SkillBranch,
  type SkillNode,
} from '@shared/progression/skills';
import { UiIcon, ClassIcon, SkillNodeIcon } from '@/components/synty/GameIcons';
import { BackToVillage } from '@/components/BackToVillage';

const SLOT_LABEL: Record<SkillNode['slot'], string> = {
  passive: 'Passif',
  active: 'Actif',
  ultimate: 'Ultime',
};

export function LibraryScreen() {
  return (
    <section className="anim-fade space-y-6">
      <BackToVillage />
      <div>
        <h2 className="heading flex items-center gap-2 text-2xl">
          <UiIcon name="book" size={24} color="var(--color-gold-soft)" />
          Bibliothèque du Savoir
        </h2>
        <p className="text-sm text-[var(--color-muted)]">
          Forme tes héros dans les arbres de compétence propres à chaque classe.
        </p>
      </div>

      <SkillsTab />
    </section>
  );
}

function SkillsTab() {
  const { data: heroes, isLoading, isError, error } = useHeroes();
  // Préselection via ?hero=<id> (ex. bouton « arbre » depuis un héros de l'inventaire).
  const [params] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(params.get('hero'));

  const selected = (heroes ?? []).find((h) => h.id === selectedId) ?? heroes?.[0] ?? null;

  return (
    <div className="space-y-6">
      <p className="text-xs text-[var(--color-muted)]">
        Chaque niveau octroie 1 point de compétence. Dépense-le dans l'arbre propre à la classe de
        chaque héros.
      </p>

      {isLoading && <p className="text-[var(--color-muted)]">Consultation des grimoires…</p>}
      {isError && (
        <p className="text-[var(--color-ember)]">
          Erreur : {error instanceof Error ? error.message : 'inconnue'}
        </p>
      )}

      {heroes && heroes.length === 0 && (
        <p className="text-[var(--color-muted)]">Aucun héros à former pour l'instant.</p>
      )}

      {heroes && heroes.length > 0 && (
        <>
          {/* Sélecteur de héros */}
          <div className="flex flex-wrap gap-2">
            {heroes.map((h) => {
              const active = selected?.id === h.id;
              return (
                <button
                  key={h.id}
                  onClick={() => setSelectedId(h.id)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                    active
                      ? 'border-[var(--color-arcane)]/60 bg-[var(--color-arcane)]/15 text-[var(--color-ink)]'
                      : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:bg-white/5'
                  }`}
                >
                  <ClassIcon classId={h.classId} size={18} />
                  <span className="font-medium">{h.name}</span>
                  {h.skillPoints > 0 && (
                    <span className="rounded-full bg-[var(--color-arcane)]/30 px-1.5 text-[10px] font-bold text-[var(--color-ink)]">
                      {h.skillPoints}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {selected && <SkillTree hero={selected} />}
        </>
      )}
    </div>
  );
}

function SkillTree({ hero }: { hero: HeroView }) {
  const learn = useLearnSkill();
  const select = useSelectSkill();
  const meta = classMeta(hero.classId);
  const branches = skillTreeFor(hero.classId);

  if (branches.length === 0) {
    return (
      <p className="text-[var(--color-muted)]">Aucun arbre de compétence défini pour cette classe.</p>
    );
  }

  // Actif + ultime réellement équipés (repli auto sur le 1er appris).
  const loadout = resolveLoadout(hero.classId, hero.skills, {
    activeId: hero.activeSkillId,
    ultimateId: hero.ultimateSkillId,
  });

  return (
    <div className="panel p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClassIcon classId={hero.classId} size={22} />
          <span className="font-display font-semibold text-[var(--color-ink)]">
            Arbre {meta.label} · {hero.name}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              hero.skillPoints > 0
                ? 'bg-[var(--color-arcane)]/20 text-[var(--color-ink)]'
                : 'bg-white/5 text-[var(--color-muted)]'
            }`}
          >
            {hero.skillPoints} point(s) à dépenser
          </span>
          <ResetControl hero={hero} />
        </div>
      </div>

      <EquippedBanner hero={hero} activeId={loadout.activeId} ultimateId={loadout.ultimateId} />

      <div className="grid gap-4 md:grid-cols-3">
        {branches.map((branch) => (
          <BranchColumn
            key={branch.id}
            hero={hero}
            branch={branch}
            learn={learn}
            select={select}
            equippedActiveId={loadout.activeId}
            equippedUltimateId={loadout.ultimateId}
          />
        ))}
      </div>

      {(learn.isError || select.isError) && (
        <p className="mt-3 text-xs text-[var(--color-ember)]">
          {(learn.error ?? select.error) instanceof Error
            ? ((learn.error ?? select.error) as Error).message
            : 'Échec de l’opération'}
        </p>
      )}
    </div>
  );
}

/** Récap de l'actif + l'ultime actuellement activés (un seul de chaque). */
function EquippedBanner({
  hero,
  activeId,
  ultimateId,
}: {
  hero: HeroView;
  activeId: string | null;
  ultimateId: string | null;
}) {
  const nodes = allNodes(hero.classId);
  const nameOf = (id: string | null) => (id ? (nodes.find((n) => n.id === id)?.name ?? '—') : '—');
  return (
    <div className="mb-4 grid grid-cols-2 gap-2">
      <div className="rounded-lg border border-[var(--color-edge)] bg-black/20 px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-muted)]">
          Compétence active
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink)]">
          {activeId ? (
            <>
              <SkillNodeIcon nodeId={activeId} size={16} color="var(--color-arcane)" />
              {nameOf(activeId)}
            </>
          ) : (
            <span className="text-[var(--color-muted)]">Aucune apprise</span>
          )}
        </div>
      </div>
      <div className="rounded-lg border border-[var(--color-gold-soft)]/40 bg-[var(--color-gold-soft)]/5 px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-gold-soft)]">
          Ultime actif
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink)]">
          {ultimateId ? (
            <>
              <SkillNodeIcon nodeId={ultimateId} size={16} color="var(--color-gold-soft)" />
              {nameOf(ultimateId)}
            </>
          ) : (
            <span className="text-[var(--color-muted)]">Aucun appris</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ResetControl({ hero }: { hero: HeroView }) {
  const reset = useResetSkills();
  const { data: profile } = useProfile();
  const [confirming, setConfirming] = useState(false);

  const spent = spentPoints(hero.classId, hero.skills);
  const cost = resetCost(spent);
  const gold = profile?.gold ?? 0;
  const canAfford = gold >= cost;

  if (spent <= 0) return null;

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1 rounded-full border border-[var(--color-edge)] px-3 py-1 text-xs font-medium text-[var(--color-muted)] transition hover:border-[var(--color-ember)]/60 hover:text-[var(--color-ember)]"
        title="Rembourse tous les points contre de l’or"
      >
        <UiIcon name="loop" size={13} color="currentColor" />
        Réinitialiser · {cost}
        <UiIcon name="gold" size={12} color="var(--color-gold-soft)" />
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5 rounded-full border border-[var(--color-ember)]/50 bg-[var(--color-ember)]/10 px-2 py-1 text-xs">
      <span className="text-[var(--color-muted)]">
        {canAfford ? (
          <>
            Rendre {spent} pt(s) pour {cost} <UiIcon name="gold" size={11} color="var(--color-gold-soft)" /> ?
          </>
        ) : (
          <span className="text-[var(--color-ember)]">Or insuffisant ({cost} requis)</span>
        )}
      </span>
      <button
        onClick={() =>
          reset.mutate({ heroId: hero.id }, { onSuccess: () => setConfirming(false) })
        }
        disabled={!canAfford || reset.isPending}
        className="rounded-md bg-[var(--color-ember)]/80 px-2 py-0.5 font-bold text-white transition hover:bg-[var(--color-ember)] disabled:opacity-40"
      >
        {reset.isPending ? '…' : 'Oui'}
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="px-1 text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
      >
        Non
      </button>
    </span>
  );
}

function BranchColumn({
  hero,
  branch,
  learn,
  select,
  equippedActiveId,
  equippedUltimateId,
}: {
  hero: HeroView;
  branch: SkillBranch;
  learn: ReturnType<typeof useLearnSkill>;
  select: ReturnType<typeof useSelectSkill>;
  equippedActiveId: string | null;
  equippedUltimateId: string | null;
}) {
  const invested = branchPoints(hero.classId, hero.skills, branch.id);

  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: `${branch.color}55`, background: `${branch.color}0a` }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-display text-sm font-bold text-[var(--color-ink)]">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: branch.color }} />
          {branch.name}
        </span>
        <span className="text-[10px] font-medium tabular-nums text-[var(--color-muted)]" title={`Ultime débloqué à ${ULTIMATE_GATE} points`}>
          {invested}/20
        </span>
      </div>

      <div className="flex flex-col items-stretch">
        {branch.nodes.map((node, i) => {
          const rank = hero.skills[node.id] ?? 0;
          const check = validateLearn(hero.classId, hero.skills, node.id);
          const activatable = node.slot === 'active' || node.slot === 'ultimate';
          const equipped =
            (node.slot === 'active' && node.id === equippedActiveId) ||
            (node.slot === 'ultimate' && node.id === equippedUltimateId);
          return (
            <Fragment key={node.id}>
              {i > 0 && (
                <span
                  className="mx-auto my-1 h-3 w-[2px] rounded-full"
                  style={{ background: rank > 0 ? branch.color : 'var(--color-edge)' }}
                />
              )}
              <SkillNodeCard
                node={node}
                rank={rank}
                color={branch.color}
                stats={{ atk: hero.stats.atk, def: hero.stats.def, hp: hero.stats.hp }}
                learnable={hero.skillPoints > 0 && check.ok}
                locked={rank === 0 && !check.ok}
                lockedReason={check.reason}
                pending={learn.isPending}
                onLearn={() => learn.mutate({ heroId: hero.id, nodeId: node.id })}
                canEquip={activatable && rank > 0}
                equipped={equipped}
                selecting={select.isPending}
                onEquip={() =>
                  select.mutate({
                    heroId: hero.id,
                    slot: node.slot as 'active' | 'ultimate',
                    nodeId: node.id,
                  })
                }
              />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function SkillNodeCard({
  node,
  rank,
  color,
  stats,
  learnable,
  locked,
  lockedReason,
  pending,
  onLearn,
  canEquip,
  equipped,
  selecting,
  onEquip,
}: {
  node: SkillNode;
  rank: number;
  color: string;
  stats: { atk: number; def: number; hp: number };
  learnable: boolean;
  locked: boolean;
  lockedReason: string | undefined;
  pending: boolean;
  onLearn: () => void;
  canEquip: boolean;
  equipped: boolean;
  selecting: boolean;
  onEquip: () => void;
}) {
  const maxed = rank >= node.maxRank;
  const owned = rank > 0;

  // Effets CHIFFRÉS exacts (mêmes formules que le moteur). On montre le rang 1 et
  // le rang max quand l'effet évolue ; sinon une seule ligne. Si possédé, on met
  // en avant le rang courant. Les stats du héros → valeurs concrètes entre parenthèses.
  const effMin = describeNodeEffects(node, 1, stats);
  const effMax = describeNodeEffects(node, node.maxRank, stats);
  const scales = JSON.stringify(effMin) !== JSON.stringify(effMax);
  const effectRows: { label: string; lines: string[] }[] =
    effMin.length === 0
      ? []
      : !scales
        ? [{ label: 'Effet', lines: effMin }]
        : owned
          ? [
              { label: `Rang ${rank}${maxed ? ' · max' : ''}`, lines: describeNodeEffects(node, rank, stats) },
              ...(maxed ? [] : [{ label: `Rang max (${node.maxRank})`, lines: effMax }]),
            ]
          : [
              { label: 'Rang 1', lines: effMin },
              { label: `Rang max (${node.maxRank})`, lines: effMax },
            ];

  return (
    <div
      className="group relative flex items-start gap-2.5 rounded-lg border p-2.5 transition"
      style={{
        borderColor: equipped ? color : owned ? `${color}aa` : 'var(--color-edge)',
        // Verrouillé : légèrement grisé (fond/bordure) SANS opacité sur la carte —
        // sinon le tooltip au survol devient transparent lui aussi.
        background: owned ? `${color}18` : locked ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.02)',
        ...(equipped ? { boxShadow: `0 0 0 1px ${color}, 0 0 12px -4px ${color}` } : {}),
      }}
    >
      {/* Tooltip au survol */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-56 -translate-x-1/2 group-hover:block">
        <div className="rounded-lg border border-[var(--color-edge-strong)] bg-[var(--color-panel-2)] p-2.5 text-left shadow-xl">
          <div className="flex items-center gap-1.5">
            <SkillNodeIcon nodeId={node.id} size={15} color={color} />
            <span className="text-sm font-bold text-[var(--color-ink)]">{node.name}</span>
            <span
              className="ml-auto rounded-full px-1.5 text-[9px] font-bold uppercase tracking-wide"
              style={{ background: `${color}22`, color }}
            >
              {SLOT_LABEL[node.slot]}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-[var(--color-muted)]">{node.desc}</p>
          {effectRows.length > 0 && (
            <div className="mt-1.5 space-y-1 border-t border-[var(--color-edge)] pt-1.5">
              {effectRows.map((row) => (
                <div key={row.label} className="text-[10px] leading-snug">
                  <span className="font-semibold" style={{ color }}>
                    {row.label}
                  </span>
                  <span className="text-[var(--color-ink)]/80"> — {row.lines.join(' ; ')}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-1.5 flex items-center justify-between text-[10px]">
            <span className="tabular-nums text-[var(--color-muted)]">
              Rang {rank}/{node.maxRank}
            </span>
            {locked ? (
              <span className="inline-flex items-center gap-1 font-medium text-[var(--color-muted)]">
                <UiIcon name="lock" size={10} color="currentColor" /> {lockedReason ?? 'Verrouillé'}
              </span>
            ) : node.slot === 'ultimate' ? (
              <span className="font-medium" style={{ color }}>
                Ultime · {ULTIMATE_GATE} pts requis
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Icône Synty du nœud dans une pastille colorée */}
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${locked ? 'opacity-55' : ''}`}
        style={{ background: `${color}22` }}
        aria-hidden
      >
        <SkillNodeIcon nodeId={node.id} size={20} color={color} />
      </span>

      <div className={`min-w-0 flex-1 transition ${locked ? 'opacity-55' : ''}`}>
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-[var(--color-ink)]">{node.name}</span>
          <span
            className="shrink-0 rounded-full px-1.5 text-[9px] font-bold uppercase tracking-wide"
            style={{ background: `${color}22`, color }}
          >
            {SLOT_LABEL[node.slot]}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-[var(--color-muted)]">
          {node.desc}
        </p>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          {/* Pips de rang */}
          <span className="flex gap-0.5">
            {Array.from({ length: node.maxRank }, (_, i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: i < rank ? color : 'var(--color-edge-strong)' }}
              />
            ))}
          </span>

          {locked ? (
            <span
              className="inline-flex items-center rounded-md bg-white/5 px-2 py-1 text-[var(--color-muted)]"
              title={lockedReason ?? 'Verrouillé'}
            >
              <UiIcon name="lock" size={11} color="currentColor" />
            </span>
          ) : maxed ? (
            <span className="rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ color }}>
              Max
            </span>
          ) : (
            <button
              onClick={onLearn}
              disabled={!learnable || pending}
              title={learnable ? 'Apprendre un rang' : (lockedReason ?? '')}
              className="rounded-md px-2 py-0.5 text-[11px] font-bold transition disabled:cursor-not-allowed"
              style={{
                background: learnable ? `${color}33` : 'rgba(255,255,255,0.04)',
                color: learnable ? 'var(--color-ink)' : 'var(--color-muted)',
              }}
            >
              {learnable ? (
                '+ Apprendre'
              ) : (
                <UiIcon name="lock" size={11} color="currentColor" />
              )}
            </button>
          )}
        </div>

        {/* Équipement de l'actif/ultime : un seul de chaque s'applique en combat. */}
        {canEquip && (
          <div className="mt-1.5">
            {equipped ? (
              <span
                className="inline-flex w-full items-center justify-center gap-1 rounded-md py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ background: `${color}2e`, color }}
              >
                <UiIcon name="victory" size={11} color="currentColor" /> Équipé
              </span>
            ) : (
              <button
                onClick={onEquip}
                disabled={selecting}
                title="Activer ce nœud (remplace l'actif/ultime équipé)"
                className="w-full rounded-md border border-[var(--color-edge)] py-0.5 text-[10px] font-semibold text-[var(--color-muted)] transition hover:border-white/30 hover:text-[var(--color-ink)] disabled:opacity-40"
              >
                Activer
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
