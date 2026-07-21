import { useMemo, useState } from 'react';
import { useResources } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { useArc } from '@/features/arc/useArc';
import { useForge, type CraftedItem } from './useForge';
import { FORGE_BASES } from '@shared/progression/forge';
import { WEIGHT_META } from '@/lib/gameUi';
import { PASSIVE_META } from '@shared/progression/jewelry';
import { tierGearMult } from '@shared/progression/arc';
import { forgeMaterialsForArc, gemsForArc } from '@shared/progression/arcMaterials';
import {
  divineStats,
  divinePassive,
  divineRecipe,
  divineName,
  DIVINE_STAT_MULT,
  DIVINE_MIN_ARC,
} from '@shared/progression/divine';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { PassiveStackNotice } from '@/components/PassiveStackNotice';
import { StatOut } from './craftUi';

type Slot = 'weapon' | 'armor';

/** Modèles d'arme/armure du slot (FORGE_BASES filtrés par type). */
const modelsFor = (slot: Slot) => FORGE_BASES.filter((b) => b.itemType === slot);

/**
 * FORGE SACRÉE — arme ou armure DIVINE. Le Divin est GARANTI (pas de tirage) : un
 * clic. On choisit le type (arme/armure), un modèle (poids → classes), un matériau
 * de zone (puissance) et une gemme (effet unique). Arc 2 uniquement.
 */
export function DivineForgeStudio() {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { currentArc } = useArc();
  const { craftDivine } = useForge();

  /**
   * Arc du CATALOGUE affiché. La Forge Sacrée n'ouvre qu'à l'Arc 2 (le serveur
   * renvoie 403 en deçà), donc on montre toujours au moins ce catalogue-là : en
   * arc 1, afficher les matériaux de l'arc courant proposait une recette que le
   * serveur n'aurait jamais acceptée — d'où l'impression que la forge « demande
   * des trucs d'arc 1 ».
   */
  const catalogArc = Math.max(currentArc, DIVINE_MIN_ARC);

  const materials = useMemo(
    () => [...forgeMaterialsForArc(catalogArc)].sort((a, b) => a.craftTier - b.craftTier || a.zone - b.zone),
    [catalogArc],
  );

  const [slot, setSlot] = useState<Slot>('weapon');
  const [baseId, setBaseId] = useState(() => modelsFor('weapon')[0]!.id);
  const [materialId, setMaterialId] = useState(() => materials.at(-1)!.id);
  const [gemId, setGemId] = useState(() => gemsForArc(DIVINE_MIN_ARC)[0]!.id);
  const [crafted, setCrafted] = useState<CraftedItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const models = modelsFor(slot);
  const base = models.find((b) => b.id === baseId) ?? models[0]!;
  const mat = materials.find((m) => m.id === materialId) ?? materials.at(-1)!;
  const gems = useMemo(() => gemsForArc(catalogArc), [catalogArc]);
  const gem = gems.find((g) => g.id === gemId) ?? gems[0]!;

  const gold = profile?.gold ?? 0;
  const res = resources ?? {};
  const isArc2 = currentArc >= 2;

  const stats = divineStats(base, mat);
  // Aperçu de stats calé sur le MÊME arc que la recette : un objet qui ne peut
  // naître qu'en Arc 2 doit annoncer ses stats d'Arc 2, pas celles de l'arc du visiteur.
  const tm = tierGearMult(catalogArc);
  const preview = {
    atk: Math.round(stats.atk * tm),
    def: Math.round(stats.def * tm),
    hp: Math.round(stats.hp * tm),
  };
  const passive = divinePassive(gem);
  const recipe = divineRecipe(base, mat, gem);
  const affordable =
    gold >= recipe.gold && recipe.materials.every((m) => (res[m.key] ?? 0) >= m.qty);
  const canForge = isArc2 && affordable && !craftDivine.isPending;

  function pickSlot(s: Slot) {
    setSlot(s);
    setBaseId(modelsFor(s)[0]!.id);
    setCrafted(null);
  }

  function forge() {
    setError(null);
    setCrafted(null);
    craftDivine.mutate(
      { baseId: base.id, materialId: mat.id, gemId: gem.id },
      {
        onSuccess: (r) => setCrafted(r.item),
        onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  }

  return (
    <div className="space-y-4">
      {!isArc2 && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-gold-soft)]/40 bg-[var(--color-gold-soft)]/[0.07] p-3 text-sm text-[var(--color-gold-soft)]">
          <UiIcon name="lock" size={16} />
          La Forge Sacrée n'ouvre qu'en <strong>Arc 2</strong>. Tu peux déjà préparer ta recette.
        </div>
      )}

      <p className="text-[11px] text-[var(--color-muted)]">
        L'objet <strong className="text-[var(--color-gold-soft)]">Divin</strong> :{' '}
        {Math.round((DIVINE_STAT_MULT - 1) * 100)}% de stats de plus qu'un ultime, PLUS l'effet d'une
        gemme. La Forge Sacrée ne fait qu'<strong>armes</strong> et <strong>armures</strong> (bijoux
        et reliques = sets).
      </p>

      <div className="flex gap-2">
        {(['weapon', 'armor'] as Slot[]).map((s) => (
          <button
            key={s}
            onClick={() => pickSlot(s)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
              slot === s
                ? 'border-[var(--color-gold-soft)] bg-[var(--color-gold-soft)]/10 text-[var(--color-gold-soft)]'
                : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:border-white/25'
            }`}
          >
            {s === 'weapon' ? 'Arme (Éclat sacré)' : 'Armure (Poussière bénie)'}
          </button>
        ))}
      </div>

      <Section label="Modèle (poids → classes)">
        <select
          value={base.id}
          onChange={(e) => {
            setBaseId(e.target.value);
            setCrafted(null);
          }}
          className="w-full rounded-md border border-[var(--color-edge)] bg-[var(--color-panel-2)] px-3 py-2 text-sm text-[var(--color-ink)]"
        >
          {models.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label} — {WEIGHT_META[b.weight]?.label ?? b.weight}
            </option>
          ))}
        </select>
      </Section>

      <Section label="Matériau de zone (puissance)">
        <select
          value={mat.id}
          onChange={(e) => {
            setMaterialId(e.target.value);
            setCrafted(null);
          }}
          className="w-full rounded-md border border-[var(--color-edge)] bg-[var(--color-panel-2)] px-3 py-2 text-sm text-[var(--color-ink)]"
        >
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — Zone {m.zone} (T{m.craftTier})
            </option>
          ))}
        </select>
      </Section>

      <PassiveStackNotice />

      <Section label="Gemme — l'effet">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {gems.map((g) => {
            const meta = PASSIVE_META[g.passive];
            return (
              <button
                key={g.id}
                onClick={() => {
                  setGemId(g.id);
                  setCrafted(null);
                }}
                title={meta.desc}
                className={`flex items-center gap-2 rounded-lg border p-2 text-left transition ${
                  g.id === gem.id
                    ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/10'
                    : 'border-[var(--color-edge)] bg-black/20 hover:border-white/25'
                }`}
              >
                <ResourceIcon resKey={g.id} size={20} />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-[var(--color-ink)]">
                    {meta.icon} {meta.label}
                  </span>
                  <span className="text-[10px] text-[var(--color-muted)]">{g.maxPct}% (max)</span>
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <div className="rounded-lg border border-[var(--color-gold-soft)]/35 bg-[var(--color-gold-soft)]/[0.05] p-3">
        <div className="mb-2 font-display text-sm font-semibold text-[var(--color-gold-soft)]">
          {divineName(base, gem)}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {preview.atk > 0 && <StatOut kind="atk" label="ATK" text={`+${preview.atk}`} />}
          {preview.def > 0 && <StatOut kind="def" label="DEF" text={`+${preview.def}`} />}
          {preview.hp > 0 && <StatOut kind="hp" label="PV" text={`+${preview.hp}`} />}
          <span className="chip bg-[var(--color-arcane)]/15 text-[10px] font-semibold text-[var(--color-arcane)]">
            {PASSIVE_META[passive.type].icon} {PASSIVE_META[passive.type].label} {passive.value}%
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--color-edge)] pt-2 text-[11px]">
          <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Coût</span>
          <span className={gold >= recipe.gold ? 'text-[var(--color-gold-soft)]' : 'text-[var(--color-ember)]'}>
            <UiIcon name="gold" size={11} /> {recipe.gold}
          </span>
          {recipe.materials.map((m) => {
            const have = res[m.key] ?? 0;
            return (
              <span
                key={m.key}
                className={`inline-flex items-center gap-1 ${
                  have >= m.qty ? 'text-[var(--color-ink)]/75' : 'text-[var(--color-ember)]'
                }`}
              >
                <ResourceIcon resKey={m.key} size={13} /> {have}/{m.qty}
              </span>
            );
          })}
        </div>

        <button
          onClick={forge}
          disabled={!canForge}
          className="btn btn-primary mt-3 w-full text-sm disabled:opacity-40"
        >
          {craftDivine.isPending
            ? 'Consécration…'
            : !isArc2
              ? 'Réservé à l’Arc 2'
              : !affordable
                ? 'Ressources insuffisantes'
                : '✦ Forger'}
        </button>

        {crafted && (
          <p className="mt-2 text-center text-sm text-[var(--color-gold-soft)]">{crafted.name} forgé !</p>
        )}
        {error && <p className="mt-2 text-center text-sm text-[var(--color-ember)]">{error}</p>}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <span className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">{label}</span>
      {children}
    </section>
  );
}
