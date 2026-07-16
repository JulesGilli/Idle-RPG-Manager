import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useResources, resourceMeta } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';
import { FORGE_MATERIALS } from '@shared/progression/forge';
import {
  GEMS,
  jewelRecipe,
  jewelPctRange,
  jewelLevelInfo,
  jewelRarityWeights,
  type GemDef,
} from '@shared/progression/jewelry';
import {
  SETS,
  setPiecesForWorkshop,
  setPieceGated,
  setPieceRecipe,
  craftSetPieceStats,
  describeSetEffect,
  setEffectAt,
} from '@shared/progression/sets';
import { useRelease } from '@/features/release/useRelease';
import { useForge, type CraftedItem } from '@/features/forge/useForge';
import { SectionLabel, Ingredient, TogglePill, StatOut, setBonusLine } from '@/features/forge/craftUi';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon, PassiveIcon, SetPieceIcon, ItemTypeIcon } from '@/components/synty/GameIcons';
import { rarityHex } from '@/lib/synty';

const RARITY_ORDER = ['poor', 'common', 'uncommon', 'advanced', 'ultimate'] as const;
type RarityKey = (typeof RARITY_ORDER)[number];
const rarityRank = (r: string): number => RARITY_ORDER.indexOf(r as RarityKey);
const AUTO_TARGETS: RarityKey[] = ['uncommon', 'advanced', 'ultimate'];
const AUTO_MAX_ATTEMPTS = 300;
const SET_MS = 1500; // 2 descentes de gemme (cf. index.css)

type ResMap = Record<string, number>;

/** Teinte de la gemme à l'écran, par type de passif (présentation seule). */
const GEM_TINT: Record<string, [string, string]> = {
  regen: ['#7ee2a8', '#2f9e63'],
  shield: ['#8fd3ff', '#2f7fbf'],
  crit: ['#ffd27a', '#d99320'],
  venom: ['#b7f07a', '#5f9e2f'],
  rage: ['#ff9a6b', '#d1502a'],
  thorns: ['#c9b7ff', '#7a5fd1'],
  lifesteal: ['#ff8fb0', '#c23a67'],
  first_strike: ['#9fe8ff', '#2f9fbf'],
  dodge: ['#c3c9d4', '#6b7280'],
  execute: ['#ffe6a0', '#c9a227'],
};
const gemTint = (g: GemDef): [string, string] => GEM_TINT[g.passive] ?? ['#c9b7ff', '#7a5fd1'];

/**
 * ATELIER DE JOAILLERIE — pendant de l'atelier de forge, même flow guidé :
 *  1. la GEMME (le « plan » : type de passif, base % et plafond),
 *  2. le COMPOSANT de zone (puissance du %),
 *  3. encart SET optionnel (butin d'expédition),
 *  4. l'établi : sertissage animé qui révèle le bijou.
 * La maîtrise de joaillerie améliore les probas de rareté → passifs plus forts.
 */
export function JewelStudio() {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { craftJewel, craftSet } = useForge();
  const { released } = useRelease();

  const materials = useMemo(
    () => [...FORGE_MATERIALS].sort((a, b) => a.craftTier - b.craftTier || a.zone - b.zone),
    [],
  );
  // Masque les pièces de set encore verrouillées (sortie V1.1) avant l'heure.
  const setPieces = useMemo(
    () => setPiecesForWorkshop('jewelry').filter((p) => released || !setPieceGated(p.id)),
    [released],
  );

  const [gemId, setGemId] = useState<string>('gemme_seve');
  const [materialId, setMaterialId] = useState<string>('chene');
  const [setPieceId, setSetPieceId] = useState<string | null>(null);

  const [target, setTarget] = useState<RarityKey>('advanced');
  const [auto, setAuto] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [reached, setReached] = useState(false);
  const [setting, setSetting] = useState(false);
  const [crafted, setCrafted] = useState<CraftedItem | null>(null);
  const [gainedXp, setGainedXp] = useState<number | null>(null);
  const stopRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopRef.current = true;
    };
  }, []);

  const gold = profile?.gold ?? 0;
  const res: ResMap = resources ?? {};
  const jewel = jewelLevelInfo(profile?.jewel_xp ?? 0);
  const oddsWeights = jewelRarityWeights(jewel.level);
  const oddsTotal = Object.values(oddsWeights).reduce((s, w) => s + w, 0);

  const gem = GEMS.find((g) => g.id === gemId) ?? GEMS[0]!;
  const mat = materials.find((m) => m.id === materialId) ?? materials[0]!;
  const setMode = setPieceId != null;
  const piece = setMode ? (setPieces.find((p) => p.id === setPieceId) ?? null) : null;

  function resetResult() {
    setCrafted(null);
    setAutoError(null);
    setReached(false);
    setAttempts(0);
    setGainedXp(null);
  }

  // ---------------------------------------------------------- craft + anim
  function revealAfterSet(item: CraftedItem, xp: number | null, hitTarget: boolean, startedAt: number) {
    const wait = Math.max(0, SET_MS - (performance.now() - startedAt));
    window.setTimeout(() => {
      if (!mountedRef.current) return;
      setSetting(false);
      setCrafted(item);
      setGainedXp(xp);
      setReached(hitTarget);
    }, wait);
  }

  async function setOnce(): Promise<void> {
    resetResult();
    setSetting(true);
    const t0 = performance.now();
    try {
      const r = await craftJewel.mutateAsync({ materialId: mat.id, gemId: gem.id });
      revealAfterSet(r.item, r.jewel_xp ?? null, rarityRank(r.item.rarity) >= rarityRank(target), t0);
    } catch (e) {
      setSetting(false);
      setAutoError(e instanceof Error ? e.message : 'Erreur');
    }
  }

  function setSetPiece(): void {
    if (!piece) return;
    resetResult();
    setSetting(true);
    const t0 = performance.now();
    craftSet
      .mutateAsync({ pieceId: piece.id, materialId: mat.id })
      .then((r) => revealAfterSet(r.item, null, false, t0))
      .catch((e) => {
        setSetting(false);
        setAutoError(e instanceof Error ? e.message : 'Erreur');
      });
  }

  // Auto-sertissage : pas d'animation par essai (boucle rapide).
  async function runAuto(): Promise<void> {
    if (auto) return;
    resetResult();
    stopRef.current = false;
    setAuto(true);
    let n = 0;
    try {
      while (!stopRef.current && n < AUTO_MAX_ATTEMPTS) {
        const r = await craftJewel.mutateAsync({ materialId: mat.id, gemId: gem.id });
        n += 1;
        setAttempts(n);
        setCrafted(r.item);
        setGainedXp(r.jewel_xp ?? null);
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

  // -------------------------------------------------------------- aperçu
  const [pctMin, pctMax] = jewelPctRange(mat, gem);
  const classicRecipe = jewelRecipe(mat, gem);
  const classicOk =
    gold >= classicRecipe.gold && classicRecipe.materials.every((x) => (res[x.key] ?? 0) >= x.qty);
  const setStats = piece ? craftSetPieceStats(piece, mat) : null;
  const setRecipe = piece ? setPieceRecipe(piece, mat) : null;
  const setDef = piece ? SETS.find((s) => s.id === piece.setId) : null;
  const setOk = setRecipe
    ? gold >= setRecipe.gold && setRecipe.materials.every((m) => (res[m.key] ?? 0) >= m.qty)
    : false;
  const zoneKeys = new Set(mat.materials.map((x) => x.key));
  const setExtras = setRecipe ? setRecipe.materials.filter((m) => !zoneKeys.has(m.key)) : [];
  const busy = setting || auto || craftJewel.isPending || craftSet.isPending;

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      {/* 1. LA GEMME (le « plan ») ------------------------------------------ */}
      <aside className="space-y-2">
        <SectionLabel n={1} label="La gemme" hint="le passif" />
        <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
          {GEMS.map((g) => {
            const active = !setMode && g.id === gem.id;
            const owned = res[g.id] ?? 0;
            return (
              <button
                key={g.id}
                onClick={() => {
                  setGemId(g.id);
                  setSetPieceId(null);
                  resetResult();
                }}
                className={`flex items-center gap-2 rounded-lg border p-2 text-left transition ${
                  active
                    ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/10'
                    : 'border-[var(--color-edge)] bg-black/20 hover:border-white/25'
                } ${owned > 0 ? '' : 'opacity-60'}`}
                title={`${g.label} — ${g.passiveLabel} (max ${g.maxPct}%)`}
              >
                <ResourceIcon resKey={g.id} size={22} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-[var(--color-ink)]">{g.label}</span>
                  <span className="flex items-center gap-1 text-[10px] text-[var(--color-muted)]">
                    <PassiveIcon passive={g.passive} size={10} /> {g.passiveLabel}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-[10px] font-semibold ${
                    owned > 0 ? 'text-[var(--color-gold-soft)]' : 'text-[var(--color-ember)]'
                  }`}
                >
                  ×{owned}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="space-y-4">
        {/* 2. LE COMPOSANT ------------------------------------------------- */}
        <section className="space-y-2">
          <SectionLabel n={2} label="Composant" hint="fixe la zone, le tier et la puissance du passif" />
          <div className="grid gap-2 sm:grid-cols-2">
            {materials.map((m) => {
              const r = piece ? setPieceRecipe(piece, m) : jewelRecipe(m, gem);
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

        {/* APERÇU ---------------------------------------------------------- */}
        <section className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
          {/* Assemblage visuel de la recette */}
          <div className="mb-3 flex items-center justify-center gap-2">
            <Ingredient icon={<ResourceIcon resKey={gem.id} size={24} />} label={gem.label} />
            <span className="text-[var(--color-muted)]">+</span>
            <Ingredient icon={<ResourceIcon resKey={mat.materials[0]!.key} size={24} />} label={mat.label} />
            {setMode && piece && (
              <>
                <span className="text-[var(--color-muted)]">+</span>
                <Ingredient icon={<SetPieceIcon pieceId={piece.id} size={24} />} label="Butin de set" tone="gold" />
              </>
            )}
            <span className="text-[var(--color-muted)]">→</span>
            <Ingredient
              icon={<ItemTypeIcon type="jewel" size={24} color="var(--color-arcane)" />}
              label={setMode ? 'Pièce de set' : 'Amulette'}
              tone="result"
            />
          </div>

          <div className="mb-1 flex items-center justify-between">
            <span className="font-display text-sm font-semibold text-[var(--color-ink)]">
              {setMode && piece ? `${piece.label} ${mat.suffix}` : `Amulette ${mat.suffix} ${gem.epithet}`}
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
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1 text-[var(--color-ink)]/85">
                  <PassiveIcon passive={gem.passive} size={13} /> {gem.passiveLabel} {pctMin}–{pctMax}%
                </span>
                <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">
                  plafond {gem.maxPct}%
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-[var(--color-muted)]">Probas (joaillerie N.{jewel.level}) :</span>
                {RARITY_ORDER.map((rarity) => {
                  const meta = rarityMeta(rarity);
                  return (
                    <span key={rarity} className={`chip bg-white/5 ${meta.text}`}>
                      {meta.label} {Math.round(((oddsWeights[rarity] ?? 0) / oddsTotal) * 100)}%
                    </span>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* 3. ENCART SET ---------------------------------------------------- */}
        {setPieces.length > 0 && (
          <section className="space-y-2 rounded-lg border border-[var(--color-gold-soft)]/35 bg-[var(--color-gold-soft)]/[0.06] p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold-soft)]/20 text-[10px] font-bold text-[var(--color-gold-soft)]">
                3
              </span>
              <span className="font-display text-sm font-semibold text-[var(--color-gold-soft)]">
                Butin d'expédition — pièce de set (optionnel)
              </span>
            </div>
            <p className="text-[11px] text-[var(--color-muted)]">
              Ajoute le butin d'expédition signature : le bijou devient{' '}
              <strong className="text-[var(--color-ink)]">ultime</strong> et débloque un{' '}
              <strong className="text-[var(--color-ink)]">effet de set</strong> (stats brutes au lieu d'un passif).
            </p>
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
            {piece && setDef && (
              <div className="rounded-lg border border-[var(--color-edge)] bg-black/25 p-2.5">
                <div className="mb-1.5 flex items-center gap-2">
                  <SetPieceIcon pieceId={piece.id} size={18} />
                  <span className="font-display text-xs font-semibold text-[var(--color-ink)]">{setDef.name}</span>
                </div>
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
          </section>
        )}

        {/* 4. L'ÉTABLI ------------------------------------------------------ */}
        <section className="space-y-2">
          <SectionLabel n={4} label="Sertir" hint="cale la gemme dans son chaton" />
          <div className="grid gap-4 rounded-lg border border-[var(--color-edge)] bg-black/20 p-3 sm:grid-cols-[minmax(0,300px)_minmax(0,1fr)] sm:items-center">
            <JewelBench setting={setting} gem={gem}>
              {crafted && !setting && (
                <div
                  className="anim-pop absolute inset-x-3 bottom-3 rounded-lg border bg-[var(--color-bg)]/95 p-2.5 text-sm shadow-lg"
                  style={{ borderColor: `${rarityHex(crafted.rarity)}88` }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={`font-display font-semibold ${rarityMeta(crafted.rarity).text}`}>
                      {crafted.name}
                    </span>
                    <span className="text-xs text-[var(--color-muted)]">
                      {crafted.passive_type
                        ? `${crafted.passive_value}%`
                        : [
                            crafted.atk_bonus ? `+${crafted.atk_bonus} ATK` : null,
                            crafted.def_bonus ? `+${crafted.def_bonus} DEF` : null,
                            crafted.hp_bonus ? `+${crafted.hp_bonus} PV` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px]">
                    {gainedXp != null && gainedXp > 0 && (
                      <span className="text-[var(--color-gold-soft)]">+{gainedXp} XP de joaillerie</span>
                    )}
                    {!setMode && attempts > 0 && (
                      reached ? (
                        <span className="text-emerald-300">
                          ✓ « {rarityMeta(target).label} » en {attempts} essai{attempts > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-[var(--color-muted)]">
                          arrêté après {attempts} essai{attempts > 1 ? 's' : ''}
                        </span>
                      )
                    )}
                  </div>
                </div>
              )}
            </JewelBench>

            <div className="mx-auto w-full max-w-md space-y-3">
              {!setMode && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
                  <span className="text-[var(--color-muted)]">Auto-sertir jusqu'à</span>
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
                  {attempts > 0 && (
                    <span className="ml-auto text-[var(--color-muted)]">
                      {attempts} essai{attempts > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}

              {autoError && <p className="text-sm text-[var(--color-ember)]">{autoError}</p>}

              {setMode ? (
                <button onClick={setSetPiece} disabled={!setOk || busy} className="btn btn-primary w-full text-sm">
                  {setting || craftSet.isPending
                    ? 'Sertissage…'
                    : `Sertir la pièce de set — ${piece?.label ?? ''} ${mat.suffix}`}
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => void setOnce()}
                    disabled={!classicOk || busy}
                    className="btn btn-primary flex-1 text-sm"
                  >
                    {setting ? 'Sertissage…' : 'Sertir 1×'}
                  </button>
                  {auto ? (
                    <button onClick={() => (stopRef.current = true)} className="btn btn-ghost flex-1 text-sm">
                      ⏹ Stop ({attempts})
                    </button>
                  ) : (
                    <button
                      onClick={() => void runAuto()}
                      disabled={!classicOk || busy}
                      className="btn btn-ghost flex-1 text-sm"
                      title={`Re-sertit en boucle jusqu'à « ${rarityMeta(target).label} » ou mieux`}
                    >
                      ⚙ Auto → {rarityMeta(target).label}
                    </button>
                  )}
                </div>
              )}
              {!classicOk && !setMode && (res[gem.id] ?? 0) < 1 && (
                <p className="text-[11px] text-[var(--color-ember)]">
                  Il te faut 1 {resourceMeta(gem.id).label} — elle tombe sur le boss de sa zone.
                </p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

/* --------------------------------------------------------------------- établi */

const SPARKS = Array.from({ length: 12 }, (_, i) => {
  const ang = -Math.PI / 2 + (((i % 6) - 2.5) / 2.5) * (Math.PI / 2.2);
  const dist = 26 + (i % 4) * 10;
  return { sx: `${Math.round(Math.cos(ang) * dist)}px`, sy: `${Math.round(Math.sin(ang) * dist)}px` };
});

function JewelBench({
  setting,
  gem,
  children,
}: {
  setting: boolean;
  gem: GemDef;
  children?: ReactNode;
}) {
  const [light, dark] = gemTint(gem);
  return (
    <div
      className={`relative mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-xl border border-[var(--color-edge)] bg-gradient-to-b from-black/45 to-black/10 ${
        setting ? 'jewel-setting' : ''
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(circle at 50% 60%, ${light}33, transparent 60%)` }}
      />
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <radialGradient id="jewelHaloGrad">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor={light} />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <linearGradient id="jewelGemGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={light} />
            <stop offset="100%" stopColor={dark} />
          </linearGradient>
        </defs>
        {/* établi */}
        <rect x="34" y="168" width="132" height="8" rx="4" fill="#3b3630" />
        <rect x="52" y="176" width="96" height="6" rx="3" fill="#2c2823" />
        {/* pendentif : bélière + serti */}
        <g>
          <circle cx="100" cy="82" r="8" fill="none" stroke="#6b727b" strokeWidth="3" />
          <circle cx="100" cy="122" r="32" fill="#41474f" />
          <circle cx="100" cy="122" r="32" fill="none" stroke="#5b626c" strokeWidth="2" />
          <circle cx="100" cy="122" r="20" fill="#20242a" />
          {/* griffes du chaton */}
          <rect x="97" y="96" width="6" height="9" rx="2" fill="#6b727b" />
          <rect x="97" y="139" width="6" height="9" rx="2" fill="#6b727b" />
          <rect x="74" y="119" width="9" height="6" rx="2" fill="#6b727b" />
          <rect x="117" y="119" width="9" height="6" rx="2" fill="#6b727b" />
        </g>
        {/* gemme qui descend dans le chaton */}
        <g className="jewel-gem">
          <polygon points="100,105 117,122 100,141 83,122" fill="url(#jewelGemGrad)" />
          <polygon points="100,105 117,122 100,122" fill="#ffffff" opacity="0.22" />
          <polygon points="100,105 83,122 100,122" fill="#000000" opacity="0.12" />
        </g>
        {/* halo de sertissage */}
        <circle className="jewel-halo" cx="100" cy="122" r="26" fill="url(#jewelHaloGrad)" />
      </svg>
      {/* étincelles au point de sertissage (~50% / ~61%) */}
      <div className="pointer-events-none absolute left-1/2 top-[61%]">
        {SPARKS.map((s, i) => (
          <span
            key={i}
            className="forge-spark absolute h-1 w-1 rounded-full"
            style={{ ['--sx']: s.sx, ['--sy']: s.sy, background: i % 2 ? light : '#ffffff' } as React.CSSProperties}
          />
        ))}
      </div>
      {children}
    </div>
  );
}
