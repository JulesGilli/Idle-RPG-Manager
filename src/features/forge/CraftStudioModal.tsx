import { useEffect, useMemo, useRef, useState } from 'react';
import { useResources } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';
import {
  FORGE_MATERIALS,
  FORGE_BASES,
  CRAFT_RARITY_WEIGHTS,
  craftRanges,
  type ForgeBase,
} from '@shared/progression/forge';
import {
  SETS,
  SET_PIECES,
  setPieceRecipe,
  craftSetPieceStats,
  describeSetEffect,
  setEffectAt,
  type SetPieceRecipe,
} from '@shared/progression/sets';
import { useForge, type CraftedItem } from './useForge';
import { Overlay } from '@/components/Overlay';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon, SetPieceIcon } from '@/components/synty/GameIcons';
import { forgeBaseUrl, rarityHex, STAT_GLYPH } from '@/lib/synty';

const STAT_TINT = { atk: '#fb7185', def: '#56b6f4', hp: '#5fd39b' } as const;

const RARITY_ORDER = ['poor', 'common', 'uncommon', 'advanced', 'ultimate'] as const;
type RarityKey = (typeof RARITY_ORDER)[number];
const rarityRank = (r: string): number => RARITY_ORDER.indexOf(r as RarityKey);
const AUTO_TARGETS: RarityKey[] = ['uncommon', 'advanced', 'ultimate'];
const AUTO_MAX_ATTEMPTS = 300;

const WEIGHT_LABEL: Record<string, string> = { light: 'Léger', medium: 'Moyen', heavy: 'Lourd' };

type ResMap = Record<string, number>;

/**
 * FORGE UNIFIÉE (arme/armure) : une seule fenêtre pour tout le craft.
 *  1. Choisir la pièce (base classique) et le matériau de zone → puissance.
 *  2. Encart SET optionnel : ajouter le butin d'expédition signature transforme
 *     la pièce en pièce de set (rareté ultime garantie + effet de set).
 * Le set n'est PAS émergent : chaque pièce de set est une recette définie ; ici on
 * la présente comme « la version supérieure de ce slot quand tu y ajoutes le butin
 * d'expé requis ».
 */
export function CraftStudioModal({
  slot,
  initialBaseId,
  initialSetPieceId,
  onClose,
}: {
  slot: 'weapon' | 'armor';
  initialBaseId?: string;
  initialSetPieceId?: string;
  onClose: () => void;
}) {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { craft, craftSet } = useForge();

  const bases = useMemo(() => FORGE_BASES.filter((b) => b.itemType === slot), [slot]);
  const setPieces = useMemo(() => SET_PIECES.filter((p) => p.slot === slot), [slot]);
  const materials = useMemo(
    () => [...FORGE_MATERIALS].sort((a, b) => a.craftTier - b.craftTier || a.zone - b.zone),
    [],
  );

  const [baseId, setBaseId] = useState<string>(initialBaseId ?? bases[0]?.id ?? '');
  const [materialId, setMaterialId] = useState<string>('chene');
  // Pièce de set active (mode « set ») ; null = craft classique.
  const [setPieceId, setSetPieceId] = useState<string | null>(initialSetPieceId ?? null);
  const [crafted, setCrafted] = useState<CraftedItem | null>(null);

  // Auto-forge (mode classique uniquement).
  const [target, setTarget] = useState<RarityKey>('advanced');
  const [auto, setAuto] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [reached, setReached] = useState(false);
  const stopRef = useRef(false);
  useEffect(() => () => void (stopRef.current = true), []);

  const gold = profile?.gold ?? 0;
  const res: ResMap = resources ?? {};

  const base = bases.find((b) => b.id === baseId) ?? bases[0]!;
  const mat = materials.find((m) => m.id === materialId) ?? materials[0]!;
  const setMode = setPieceId != null;
  const piece = setMode ? (setPieces.find((p) => p.id === setPieceId) ?? null) : null;

  function resetResult() {
    setCrafted(null);
    setAutoError(null);
    setReached(false);
    setAttempts(0);
  }

  // -------------------------------------------------------------- craft actions
  async function craftClassicOnce(): Promise<void> {
    resetResult();
    try {
      const r = await craft.mutateAsync({ baseId: base.id, materialId: mat.id });
      setCrafted(r.item);
      setReached(rarityRank(r.item.rarity) >= rarityRank(target));
    } catch (e) {
      setAutoError(e instanceof Error ? e.message : 'Erreur');
    }
  }

  async function runAuto(): Promise<void> {
    if (auto) return;
    resetResult();
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
      setAutoError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setAuto(false);
    }
  }

  function craftSetPiece(): void {
    if (!piece) return;
    resetResult();
    craftSet.mutate({ pieceId: piece.id, materialId: mat.id }, { onSuccess: (r) => setCrafted(r.item) });
  }

  // ------------------------------------------------------------------ preview data
  const ranges = craftRanges(base, mat);
  const oddsTotal = Object.values(CRAFT_RARITY_WEIGHTS).reduce((s, w) => s + w, 0);
  const classicOk = gold >= mat.gold && mat.materials.every((x) => (res[x.key] ?? 0) >= x.qty);

  const setStats = piece ? craftSetPieceStats(piece, mat) : null;
  const setRecipe = piece ? setPieceRecipe(piece, mat) : null;
  const setDef = piece ? SETS.find((s) => s.id === piece.setId) : null;
  const setOk = setRecipe ? gold >= setRecipe.gold && setRecipe.materials.every((m) => (res[m.key] ?? 0) >= m.qty) : false;
  // Matériaux « signature » du set = ce que la recette ajoute au matériau de zone.
  const zoneKeys = new Set(mat.materials.map((x) => x.key));
  const setExtras = setRecipe ? setRecipe.materials.filter((m) => !zoneKeys.has(m.key)) : [];

  const slotLabel = slot === 'weapon' ? 'arme' : 'armure';

  return (
    <Overlay
      title={
        <span className="flex items-center gap-2">
          <UiIcon name="forge" size={22} color="var(--color-gold-soft)" /> Forger une {slotLabel}
        </span>
      }
      onClose={onClose}
    >
      <div className="space-y-4">
        {/* 1. PIÈCE DE BASE ----------------------------------------------------- */}
        <section className="space-y-2">
          <SectionLabel n={1} label="Choisis la pièce" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {bases.map((b) => {
              const active = !setMode && b.id === base.id;
              return (
                <button
                  key={b.id}
                  onClick={() => {
                    setBaseId(b.id);
                    setSetPieceId(null);
                    resetResult();
                  }}
                  className={`flex items-center gap-2 rounded-lg border p-2 text-left transition ${
                    active
                      ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/10'
                      : 'border-[var(--color-edge)] bg-black/20 hover:border-white/25'
                  }`}
                >
                  <SyntyGlyph src={forgeBaseUrl(b.id)} size={28} color="var(--color-gold-soft)" title={b.label} />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-[var(--color-ink)]">{b.label}</span>
                    <span className="block text-[10px] text-[var(--color-muted)]">{WEIGHT_LABEL[b.weight]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 2. MATÉRIAU DE ZONE -------------------------------------------------- */}
        <section className="space-y-2">
          <SectionLabel n={2} label="Matériau de zone" hint="fixe la zone, le tier et la puissance" />
          <div className="grid gap-2 sm:grid-cols-2">
            {materials.map((m) => {
              // Affordabilité selon le mode actif (classique = mat seul ; set = recette complète).
              const r = piece ? setPieceRecipe(piece, m) : { gold: m.gold, materials: m.materials };
              const can = gold >= r.gold && r.materials.every((x) => (res[x.key] ?? 0) >= x.qty);
              const active = mat.id === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setMaterialId(m.id);
                    resetResult();
                  }}
                  className={`rounded-lg border p-2.5 text-left transition ${
                    active
                      ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/10'
                      : 'border-[var(--color-edge)] bg-black/20 hover:border-white/25'
                  } ${can ? '' : 'opacity-60'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-sm font-semibold text-[var(--color-ink)]">{m.label}</span>
                    <span className="flex items-center gap-1">
                      <span className="chip bg-[var(--color-gold)]/15 text-[10px] font-semibold text-[var(--color-gold-soft)]">
                        T{m.craftTier}
                      </span>
                      <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">Z{m.zone}</span>
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
        </section>

        {/* 3. APERÇU ------------------------------------------------------------ */}
        <section className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-display text-sm font-semibold text-[var(--color-ink)]">
              {(piece?.label ?? base.label)} {mat.suffix}
            </span>
            <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">
              T{mat.craftTier} · Zone {mat.zone}
            </span>
          </div>
          {setMode && setStats ? (
            <div className="flex flex-wrap gap-3 text-xs">
              {setStats.atk > 0 && <StatOut kind="atk" label="ATK" text={`+${setStats.atk}`} />}
              {setStats.def > 0 && <StatOut kind="def" label="DEF" text={`+${setStats.def}`} />}
              {setStats.hp > 0 && <StatOut kind="hp" label="PV" text={`+${setStats.hp}`} />}
              <span className="chip bg-white/5 text-[10px] text-[var(--color-gold-soft)]">Ultime garanti</span>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-3 text-xs">
                {ranges.atk[1] > 0 && <StatOut kind="atk" label="ATK" text={`${ranges.atk[0]}–${ranges.atk[1]}`} />}
                {ranges.def[1] > 0 && <StatOut kind="def" label="DEF" text={`${ranges.def[0]}–${ranges.def[1]}`} />}
                {ranges.hp[1] > 0 && <StatOut kind="hp" label="PV" text={`${ranges.hp[0]}–${ranges.hp[1]}`} />}
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
            </>
          )}
        </section>

        {/* ENCART SET ----------------------------------------------------------- */}
        {setPieces.length > 0 && (
          <section className="space-y-2 rounded-lg border border-[var(--color-gold-soft)]/35 bg-[var(--color-gold-soft)]/[0.06] p-3">
            <div className="flex items-center gap-2">
              <UiIcon name="craft" size={14} color="var(--color-gold-soft)" />
              <span className="font-display text-sm font-semibold text-[var(--color-gold-soft)]">
                Transformer en pièce de set
              </span>
            </div>
            <p className="text-[11px] text-[var(--color-muted)]">
              Ajoute le butin d'expédition signature au matériau de zone : la pièce devient{' '}
              <strong className="text-[var(--color-ink)]">ultime</strong> et débloque un{' '}
              <strong className="text-[var(--color-ink)]">effet de set</strong>.
            </p>

            <div className="space-y-2">
              {/* Choix : classique ou l'une des pièces de set du slot */}
              <div className="flex flex-wrap gap-1.5">
                <TogglePill active={!setMode} onClick={() => { setSetPieceId(null); resetResult(); }}>
                  Classique
                </TogglePill>
                {setPieces.map((p) => {
                  const s = SETS.find((x) => x.id === p.setId);
                  return (
                    <TogglePill
                      key={p.id}
                      active={setPieceId === p.id}
                      onClick={() => { setSetPieceId(p.id); resetResult(); }}
                    >
                      <SetPieceIcon pieceId={p.id} size={14} /> {s?.name ?? p.label}
                    </TogglePill>
                  );
                })}
              </div>

              {/* Détail de la pièce de set sélectionnée */}
              {piece && setDef && setRecipe && (
                <div className="rounded-lg border border-[var(--color-edge)] bg-black/25 p-2.5">
                  <div className="mb-1.5 flex items-center gap-2">
                    <SetPieceIcon pieceId={piece.id} size={18} />
                    <span className="font-display text-xs font-semibold text-[var(--color-ink)]">{setDef.name}</span>
                  </div>
                  {/* Effet de set MIS EN AVANT */}
                  <div className="space-y-1 rounded-md bg-[var(--color-gold-soft)]/10 p-2 text-[11px]">
                    <div className="flex gap-1.5">
                      <span className="shrink-0 font-semibold text-[var(--color-muted)]">2 pièces</span>
                      <span className="text-[var(--color-gold-soft)]">{setBonusLine(setDef.bonus2)}</span>
                    </div>
                    <div className="flex gap-1.5">
                      <span className="shrink-0 font-semibold text-[var(--color-muted)]">{setEffectAt(setDef)} pièces</span>
                      <span className="text-[var(--color-gold-soft)]">{describeSetEffect(setDef)}</span>
                    </div>
                  </div>
                  {/* Butin d'expédition à ajouter */}
                  {setExtras.length > 0 && (
                    <div className="mt-2">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                        Butin signature à ajouter
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        {setExtras.map((m) => {
                          const have = res[m.key] ?? 0;
                          return (
                            <span
                              key={m.key}
                              className={`inline-flex items-center gap-1 ${
                                have >= m.qty ? 'text-[var(--color-ink)]/80' : 'text-[var(--color-ember)]'
                              }`}
                            >
                              <ResourceIcon resKey={m.key} size={13} /> {have}/{m.qty}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* AUTO-FORGE (classique uniquement) ----------------------------------- */}
        {!setMode && (
          <section className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
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
          </section>
        )}

        {autoError && <p className="text-sm text-[var(--color-ember)]">{autoError}</p>}
        {craftSet.isError && setMode && (
          <p className="text-sm text-[var(--color-ember)]">
            {craftSet.error instanceof Error ? craftSet.error.message : 'Erreur'}
          </p>
        )}

        {/* ACTIONS -------------------------------------------------------------- */}
        {setMode ? (
          <button
            onClick={craftSetPiece}
            disabled={!setOk || craftSet.isPending}
            className="btn btn-primary w-full text-sm"
          >
            {craftSet.isPending ? 'Forge…' : `Forger la pièce de set${piece ? ` — ${piece.label} ${mat.suffix}` : ''}`}
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => void craftClassicOnce()}
              disabled={!classicOk || craft.isPending || auto}
              className="btn btn-ghost flex-1 text-sm"
            >
              {craft.isPending && !auto ? 'Forge…' : 'Forger 1×'}
            </button>
            {auto ? (
              <button onClick={() => (stopRef.current = true)} className="btn btn-primary flex-1 text-sm">
                ⏹ Stop ({attempts})
              </button>
            ) : (
              <button
                onClick={() => void runAuto()}
                disabled={!classicOk || craft.isPending}
                className="btn btn-primary flex-1 text-sm"
                title={`Reforge en boucle jusqu'à obtenir « ${rarityMeta(target).label} » ou mieux`}
              >
                ⚙ Auto → {rarityMeta(target).label}
              </button>
            )}
          </div>
        )}

        {/* RÉSULTAT ------------------------------------------------------------- */}
        {crafted && (
          <div
            className="anim-pop rounded-lg border p-3 text-sm"
            style={{ borderColor: `${rarityHex(crafted.rarity)}66` }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className={`font-display font-semibold ${rarityMeta(crafted.rarity).text}`}>{crafted.name}</span>
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
            {!setMode && !auto && attempts > 0 && (
              <p className="mt-1.5 text-xs">
                {reached ? (
                  <span className="text-emerald-300">
                    ✓ Qualité « {rarityMeta(target).label} » atteinte en {attempts} forge{attempts > 1 ? 's' : ''}.
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

/* --------------------------------------------------------------------- atomes */

function SectionLabel({ n, label, hint }: { n: number; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-arcane)]/20 text-[10px] font-bold text-[var(--color-arcane)]">
        {n}
      </span>
      <span className="text-xs font-semibold text-[var(--color-ink)]">{label}</span>
      {hint && <span className="text-[11px] text-[var(--color-muted)]">— {hint}</span>}
    </div>
  );
}

function TogglePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
        active
          ? 'border-[var(--color-gold-soft)] bg-[var(--color-gold-soft)]/15 text-[var(--color-gold-soft)]'
          : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:border-white/25'
      }`}
    >
      {children}
    </button>
  );
}

function StatOut({ kind, label, text }: { kind: 'atk' | 'def' | 'hp'; label: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[var(--color-ink)]/85">
      <SyntyGlyph src={STAT_GLYPH[kind]} color={STAT_TINT[kind]} size={13} /> {label} {text}
    </span>
  );
}

function setBonusLine(b: { atk: number; def: number; hp: number }): string {
  return [b.atk ? `+${b.atk} ATK` : null, b.def ? `+${b.def} DEF` : null, b.hp ? `+${b.hp} PV` : null]
    .filter(Boolean)
    .join(' · ');
}
