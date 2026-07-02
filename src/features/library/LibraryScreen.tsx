import { useState } from 'react';
import { useHeroes, type HeroView } from '@/features/heroes/useHeroes';
import { useLearnSkill } from './useLearnSkill';
import { classMeta } from '@/lib/gameUi';
import { skillTreeFor, validateLearn, type SkillNode } from '@shared/progression/skills';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { SKILL_NODE_GLYPH } from '@/lib/synty';

export function LibraryScreen() {
  const { data: heroes, isLoading, isError, error } = useHeroes();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = (heroes ?? []).find((h) => h.id === selectedId) ?? heroes?.[0] ?? null;

  return (
    <section className="anim-fade space-y-6">
      <div>
        <h2 className="heading text-2xl">📚 Bibliothèque du Savoir</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Chaque niveau octroie 1 point de compétence. Dépense-le dans l'arbre propre à la classe
          de chaque héros.
        </p>
      </div>

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
              const meta = classMeta(h.classId);
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
                  <span>{meta.icon}</span>
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
    </section>
  );
}

function SkillTree({ hero }: { hero: HeroView }) {
  const learn = useLearnSkill();
  const meta = classMeta(hero.classId);
  const tree = skillTreeFor(hero.classId);

  if (tree.length === 0) {
    return (
      <p className="text-[var(--color-muted)]">Aucun arbre de compétence défini pour cette classe.</p>
    );
  }

  const rows = Math.max(...tree.map((n) => n.row)) + 1;

  return (
    <div className="panel p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{meta.icon}</span>
          <span className="font-display font-semibold text-[var(--color-ink)]">
            Arbre {meta.label} · {hero.name}
          </span>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            hero.skillPoints > 0
              ? 'bg-[var(--color-arcane)]/20 text-[var(--color-ink)]'
              : 'bg-white/5 text-[var(--color-muted)]'
          }`}
        >
          {hero.skillPoints} point(s) à dépenser
        </span>
      </div>

      <div className="space-y-3">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((col) => {
              const node = tree.find((n) => n.row === row && n.col === col);
              if (!node) return <div key={col} />;
              const check = validateLearn(hero.classId, hero.skills, node.id);
              return (
                <SkillNodeCard
                  key={node.id}
                  node={node}
                  rank={hero.skills[node.id] ?? 0}
                  learnable={hero.skillPoints > 0 && check.ok}
                  lockedReason={check.reason}
                  accent={meta.accent}
                  pending={learn.isPending}
                  onLearn={() => learn.mutate({ heroId: hero.id, nodeId: node.id })}
                />
              );
            })}
          </div>
        ))}
      </div>

      {learn.isError && (
        <p className="mt-3 text-xs text-[var(--color-ember)]">
          {learn.error instanceof Error ? learn.error.message : 'Échec de l’apprentissage'}
        </p>
      )}
    </div>
  );
}

function SkillNodeCard({
  node,
  rank,
  learnable,
  lockedReason,
  accent,
  pending,
  onLearn,
}: {
  node: SkillNode;
  rank: number;
  learnable: boolean;
  lockedReason: string | undefined;
  accent: string;
  pending: boolean;
  onLearn: () => void;
}) {
  const maxed = rank >= node.maxRank;
  const owned = rank > 0;
  const isUltimate = node.abilities?.some((a) => a.kind === 'autocast' || a.kind === 'revive');
  const tag = isUltimate
    ? { label: 'Ultime', cls: 'bg-[var(--color-gold)]/20 text-[var(--color-gold-soft)]' }
    : node.abilities?.length || node.passives?.length
      ? { label: 'Passif', cls: 'bg-white/10 text-[var(--color-muted)]' }
      : null;

  return (
    <div
      className="flex flex-col rounded-lg border p-3 text-center transition"
      style={{
        borderColor: owned ? `${accent}88` : 'var(--color-edge)',
        background: owned ? `${accent}12` : 'transparent',
        opacity: !owned && !learnable ? 0.55 : 1,
      }}
    >
      {SKILL_NODE_GLYPH[node.id] ? (
        <SyntyGlyph
          src={SKILL_NODE_GLYPH[node.id]!.src}
          color={SKILL_NODE_GLYPH[node.id]!.color}
          size={30}
          title={node.name}
        />
      ) : (
        <span className="text-2xl">{node.icon}</span>
      )}
      <span className="mt-1 text-sm font-semibold text-[var(--color-ink)]">{node.name}</span>
      {tag && (
        <span className={`mt-0.5 self-center rounded-full px-1.5 text-[9px] font-bold uppercase tracking-wide ${tag.cls}`}>
          {tag.label}
        </span>
      )}
      <span className="mt-0.5 text-[11px] text-[var(--color-muted)]">{node.desc}</span>
      <span className="mt-1 text-[11px] font-medium tabular-nums text-[var(--color-muted)]">
        Rang {rank}/{node.maxRank}
      </span>
      <button
        onClick={onLearn}
        disabled={!learnable || pending}
        className="mt-2 rounded-md px-2 py-1 text-[11px] font-bold transition disabled:cursor-not-allowed"
        style={{
          background: learnable ? `${accent}30` : 'rgba(255,255,255,0.04)',
          color: learnable ? 'var(--color-ink)' : 'var(--color-muted)',
        }}
        title={learnable ? 'Apprendre un rang' : (lockedReason ?? '')}
      >
        {maxed ? 'Max' : learnable ? '+ Apprendre' : (lockedReason ?? 'Verrouillé')}
      </button>
    </div>
  );
}
