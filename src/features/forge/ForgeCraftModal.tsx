import { useEffect, useRef, useState } from 'react';
import { useResources } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';
import {
  FORGE_MATERIALS,
  CRAFT_RARITY_WEIGHTS,
  craftRanges,
  type ForgeBase,
} from '@shared/progression/forge';
import { useForge, type CraftedItem } from './useForge';
import { Overlay } from '@/components/Overlay';
import { SyntyImg, SyntyGlyph } from '@/components/synty/SyntyIcon';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { forgeBaseUrl, rarityHex, STAT_GLYPH } from '@/lib/synty';

const STAT_TINT = { atk: '#fb7185', def: '#56b6f4', hp: '#5fd39b' } as const;

// Ordre croissant de rareté, pour comparer à la qualité visée.
const RARITY_ORDER = ['poor', 'common', 'uncommon', 'advanced', 'ultimate'] as const;
type RarityKey = (typeof RARITY_ORDER)[number];
const rarityRank = (r: string): number => RARITY_ORDER.indexOf(r as RarityKey);
// Cibles proposées pour l'auto-craft (forger jusqu'à « médiocre » n'a aucun sens).
const AUTO_TARGETS: RarityKey[] = ['uncommon', 'advanced', 'ultimate'];
// Garde-fou : nombre max de forges auto en une session (évite une boucle infinie).
const AUTO_MAX_ATTEMPTS = 300;

/**
 * Fenêtre de craft d'une arme/armure normale : on choisit le COMPOSANT de zone
 * (zone 1-10, tier 1-4) qui détermine la puissance/le thème, puis on forge.
 */
export function ForgeCraftModal({ base, onClose }: { base: ForgeBase; onClose: () => void }) {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { craft } = useForge();
  const [materialId, setMaterialId] = useState<string>('chene');
  const [crafted, setCrafted] = useState<CraftedItem | null>(null);

  // Auto-craft : reforge en boucle jusqu'à atteindre la qualité visée.
  const [target, setTarget] = useState<RarityKey>('advanced');
  const [auto, setAuto] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [reached, setReached] = useState(false);
  const stopRef = useRef(false);
  // Démonte → coupe la boucle (évite un setState sur composant démonté).
  useEffect(() => () => void (stopRef.current = true), []);

  const gold = profile?.gold ?? 0;
  const res = resources ?? {};

  const materials = [...FORGE_MATERIALS].sort(
    (a, b) => a.craftTier - b.craftTier || a.zone - b.zone,
  );
  const mat = materials.find((m) => m.id === materialId) ?? materials[0]!;
  const ranges = craftRanges(base, mat);
  const oddsTotal = Object.values(CRAFT_RARITY_WEIGHTS).reduce((s, w) => s + w, 0);
  const ok = gold >= mat.gold && mat.materials.every((x) => (res[x.key] ?? 0) >= x.qty);

  async function craftOnce(): Promise<void> {
    setAutoError(null);
    setReached(false);
    setCrafted(null);
    setAttempts(0);
    try {
      const r = await craft.mutateAsync({ baseId: base.id, materialId: mat.id });
      setCrafted(r.item);
      setReached(rarityRank(r.item.rarity) >= rarityRank(target));
    } catch (e) {
      setAutoError(e instanceof Error ? e.message : 'Erreur');
    }
  }

  // Reforge en boucle jusqu'à la qualité visée, plus de ressources, ou un stop.
  async function runAuto(): Promise<void> {
    if (auto) return;
    setAutoError(null);
    setReached(false);
    setCrafted(null);
    setAttempts(0);
    stopRef.current = false;
    setAuto(true);
    let n = 0;
    try {
      while (!stopRef.current && n < AUTO_MAX_ATTEMPTS) {
        const r = await craft.mutateAsync({ baseId: base.id, materialId: mat.id });
        n += 1;
        setAttempts(n);
        setCrafted(r.item);
        if (rarityRank(r.item.rarity) >= rarityRank(target)) {
          setReached(true);
          break;
        }
      }
    } catch (e) {
      // Typiquement « Or insuffisant » / « Matériau insuffisant » → on s'arrête.
      setAutoError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setAuto(false);
    }
  }

  return (
    <Overlay
      title={
        <span className="flex items-center gap-2">
          <SyntyImg src={forgeBaseUrl(base.id)} size={22} title={base.label} /> {base.label}
        </span>
      }
      onClose={onClose}
    >
      <div className="space-y-3">
        <div className="text-xs font-medium text-[var(--color-muted)]">
          Choisis le composant — il fixe la zone, le tier et la puissance de l'objet
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {materials.map((m) => {
            const can = gold >= m.gold && m.materials.every((x) => (res[x.key] ?? 0) >= x.qty);
            const active = mat.id === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMaterialId(m.id)}
                className={`rounded-lg border p-2.5 text-left transition ${
                  active
                    ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/10'
                    : 'border-[var(--color-edge)] bg-black/20 hover:border-white/25'
                } ${can ? '' : 'opacity-60'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-semibold text-[var(--color-ink)]">
                    {m.label}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="chip bg-[var(--color-gold)]/15 text-[10px] font-semibold text-[var(--color-gold-soft)]">
                      T{m.craftTier}
                    </span>
                    <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">
                      Z{m.zone}
                    </span>
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={gold >= m.gold ? 'text-[var(--color-gold-soft)]' : 'text-[var(--color-ember)]'}>
                    <UiIcon name="gold" size={11} /> {m.gold}
                  </span>
                  {m.materials.map((x) => {
                    const have = res[x.key] ?? 0;
                    return (
                      <span
                        key={x.key}
                        className={`inline-flex items-center gap-1 ${
                          have >= x.qty ? 'text-[var(--color-ink)]/75' : 'text-[var(--color-ember)]'
                        }`}
                      >
                        <ResourceIcon resKey={x.key} /> {have}/{x.qty}
                      </span>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>

        {/* Aperçu des stats obtenues avec le composant choisi */}
        <div className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-display text-sm font-semibold text-[var(--color-ink)]">
              {base.label} {mat.suffix}
            </span>
            <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">
              T{mat.craftTier} · Zone {mat.zone}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {ranges.atk[1] > 0 && <Range kind="atk" label="ATK" lo={ranges.atk[0]} hi={ranges.atk[1]} />}
            {ranges.def[1] > 0 && <Range kind="def" label="DEF" lo={ranges.def[0]} hi={ranges.def[1]} />}
            {ranges.hp[1] > 0 && <Range kind="hp" label="PV" lo={ranges.hp[0]} hi={ranges.hp[1]} />}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(CRAFT_RARITY_WEIGHTS).map(([rarity, w]) => {
              const meta = rarityMeta(rarity);
              return (
                <span key={rarity} className={`chip bg-white/5 ${meta.text}`}>
                  {meta.label} {Math.round((w / oddsTotal) * 100)}%
                </span>
              );
            })}
          </div>
        </div>

        {/* Qualité visée pour l'auto-craft */}
        <div className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-[var(--color-muted)]">Auto-forge jusqu'à la qualité</span>
            {attempts > 0 && (
              <span className="text-[var(--color-muted)]">
                {attempts} forge{attempts > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {AUTO_TARGETS.map((r) => {
              const meta = rarityMeta(r);
              const active = target === r;
              return (
                <button
                  key={r}
                  onClick={() => setTarget(r)}
                  disabled={auto}
                  className={`chip border transition ${
                    active
                      ? `border-current ${meta.text} bg-white/5`
                      : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:border-white/25'
                  } ${auto ? 'opacity-60' : ''}`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        {autoError && <p className="text-sm text-[var(--color-ember)]">{autoError}</p>}
        {craft.isError && !auto && !autoError && (
          <p className="text-sm text-[var(--color-ember)]">
            {craft.error instanceof Error ? craft.error.message : 'Erreur'}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => void craftOnce()}
            disabled={!ok || craft.isPending || auto}
            className="btn btn-ghost flex-1 text-sm"
          >
            {craft.isPending && !auto ? 'Forge…' : 'Forger 1×'}
          </button>
          {auto ? (
            <button
              onClick={() => (stopRef.current = true)}
              className="btn btn-primary flex-1 text-sm"
            >
              ⏹ Stop ({attempts})
            </button>
          ) : (
            <button
              onClick={() => void runAuto()}
              disabled={!ok || craft.isPending}
              className="btn btn-primary flex-1 text-sm"
              title={`Reforge en boucle jusqu'à obtenir « ${rarityMeta(target).label} » ou mieux`}
            >
              ⚙ Auto → {rarityMeta(target).label}
            </button>
          )}
        </div>

        {crafted && (
          <div
            className="anim-pop rounded-lg border p-3 text-sm"
            style={{ borderColor: `${rarityHex(crafted.rarity)}66` }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className={`font-display font-semibold ${rarityMeta(crafted.rarity).text}`}>
                {crafted.name}
              </span>
              <span className="text-xs text-[var(--color-muted)]">
                {[
                  crafted.atk_bonus ? `+${crafted.atk_bonus} ATK` : null,
                  crafted.def_bonus ? `+${crafted.def_bonus} DEF` : null,
                  crafted.hp_bonus ? `+${crafted.hp_bonus} PV` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            {!auto && attempts > 0 && (
              <p className="mt-1.5 text-xs">
                {reached ? (
                  <span className="text-emerald-300">
                    ✓ Qualité « {rarityMeta(target).label} » atteinte en {attempts} forge
                    {attempts > 1 ? 's' : ''}.
                  </span>
                ) : (
                  <span className="text-[var(--color-muted)]">
                    Arrêté après {attempts} forge{attempts > 1 ? 's' : ''}
                    {autoError ? ` — ${autoError}` : ''}.
                  </span>
                )}
              </p>
            )}
          </div>
        )}
      </div>
    </Overlay>
  );
}

function Range({ kind, label, lo, hi }: { kind: 'atk' | 'def' | 'hp'; label: string; lo: number; hi: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[var(--color-ink)]/85">
      <SyntyGlyph src={STAT_GLYPH[kind]} color={STAT_TINT[kind]} size={13} /> {label} {lo}–{hi}
    </span>
  );
}
