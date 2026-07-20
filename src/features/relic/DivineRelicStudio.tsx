import { useMemo, useState } from 'react';
import { useResources } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { useArc } from '@/features/arc/useArc';
import { useForge, type CraftedItem } from '@/features/forge/useForge';
import { FORGE_MATERIALS } from '@shared/progression/forge';
import { RELIC_BASES, RELIC_STAT_LABEL } from '@shared/progression/relic';
import { GEMS, PASSIVE_META } from '@shared/progression/jewelry';
import { tierGearMult } from '@shared/progression/arc';
import {
  divineRelicStats,
  divineRelicPassive,
  divineRelicRecipe,
  divineRelicName,
  DIVINE_STAT_MULT,
} from '@shared/progression/divine';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon, RelicIcon } from '@/components/synty/GameIcons';
import { StatOut } from '@/features/forge/craftUi';

/**
 * FORGE SACRÉE — la Relique divine. Contrairement à l'autel classique (tirage de
 * rareté, rituel de consécration), le Divin est GARANTI : un seul clic. On choisit
 * un modèle (stat prioritaire), un matériau de zone (puissance) et une gemme
 * (effet unique). Réservé à l'Arc 2 — côté serveur ET ici.
 */
export function DivineRelicStudio() {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { currentArc } = useArc();
  const { craftDivineRelic } = useForge();

  const materials = useMemo(
    () => [...FORGE_MATERIALS].sort((a, b) => a.craftTier - b.craftTier || a.zone - b.zone),
    [],
  );

  const [baseId, setBaseId] = useState(RELIC_BASES[0]!.id);
  // Défaut = la zone la plus haute disponible (dernier après tri croissant).
  const [materialId, setMaterialId] = useState(
    () =>
      [...FORGE_MATERIALS].sort((a, b) => a.craftTier - b.craftTier || a.zone - b.zone).at(-1)!.id,
  );
  const [gemId, setGemId] = useState(GEMS[0]!.id);
  const [crafted, setCrafted] = useState<CraftedItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = RELIC_BASES.find((b) => b.id === baseId) ?? RELIC_BASES[0]!;
  const mat = materials.find((m) => m.id === materialId) ?? materials[materials.length - 1]!;
  const gem = GEMS.find((g) => g.id === gemId) ?? GEMS[0]!;

  const gold = profile?.gold ?? 0;
  const res = resources ?? {};
  const isArc2 = currentArc >= 2;

  // Aperçu : mêmes calculs que le serveur (stats scalées au tier de l'arc).
  const stats = divineRelicStats(base, mat);
  const tm = tierGearMult(currentArc);
  const preview = {
    atk: Math.round(stats.atk * tm),
    def: Math.round(stats.def * tm),
    hp: Math.round(stats.hp * tm),
  };
  const passive = divineRelicPassive(gem);
  const recipe = divineRelicRecipe(mat, gem);
  const affordable =
    gold >= recipe.gold && recipe.materials.every((m) => (res[m.key] ?? 0) >= m.qty);
  const canForge = isArc2 && affordable && !craftDivineRelic.isPending;

  function forge() {
    setError(null);
    setCrafted(null);
    craftDivineRelic.mutate(
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
          La Forge Sacrée n'ouvre qu'en <strong>Arc 2</strong>. Tu peux déjà préparer ta recette — et
          tes Éclats sacrés s'accumulent en attendant.
        </div>
      )}

      <p className="text-[11px] text-[var(--color-muted)]">
        La <strong className="text-[var(--color-gold-soft)]">Relique divine</strong> :{' '}
        {Math.round((DIVINE_STAT_MULT - 1) * 100)}% de stats de plus qu'un ultime, PLUS l'effet d'une
        gemme. Trois ingrédients — un modèle, un matériau de zone, une gemme.
      </p>

      {/* Modèle (stat prioritaire) */}
      <Section label="Modèle">
        <div className="grid gap-1.5 sm:grid-cols-3">
          {RELIC_BASES.map((b) => (
            <button
              key={b.id}
              onClick={() => {
                setBaseId(b.id);
                setCrafted(null);
              }}
              className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition ${
                b.id === base.id
                  ? 'border-[var(--color-gold-soft)] bg-[var(--color-gold-soft)]/10'
                  : 'border-[var(--color-edge)] bg-black/20 hover:border-white/25'
              }`}
            >
              <RelicIcon size={22} color="var(--color-gold-soft)" />
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-[var(--color-ink)]">
                  {b.label}
                </span>
                <span className="text-[10px] text-[var(--color-muted)]">
                  {RELIC_STAT_LABEL[b.primary]} prioritaire
                </span>
              </span>
            </button>
          ))}
        </div>
      </Section>

      {/* Matériau de zone (puissance) */}
      <Section label="Matériau de zone">
        <select
          value={materialId}
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

      {/* Gemme (effet unique) */}
      <Section label="Gemme — l'effet">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {GEMS.map((g) => {
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

      {/* Aperçu + coût + forger */}
      <div className="rounded-lg border border-[var(--color-gold-soft)]/35 bg-[var(--color-gold-soft)]/[0.05] p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-sm font-semibold text-[var(--color-gold-soft)]">
            {divineRelicName(base, gem)}
          </span>
          <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">
            Zone {mat.zone}
          </span>
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
          {craftDivineRelic.isPending
            ? 'Consécration…'
            : !isArc2
              ? 'Réservé à l’Arc 2'
              : !affordable
                ? 'Ressources insuffisantes'
                : '✦ Forger la Relique divine'}
        </button>

        {crafted && (
          <p className="mt-2 text-center text-sm text-[var(--color-gold-soft)]">
            {crafted.name} forgée !
          </p>
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
