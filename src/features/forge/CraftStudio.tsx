import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useResources } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';
import {
  FORGE_MATERIALS,
  FORGE_BASES,
  craftRanges,
  craftRarityWeights,
  forgeLevelInfo,
} from '@shared/progression/forge';
import {
  SETS,
  SET_PIECES,
  setPieceRecipe,
  craftSetPieceStats,
  describeSetEffect,
  setEffectAt,
} from '@shared/progression/sets';
import { useForge, type CraftedItem } from './useForge';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon, ItemTypeIcon, SetPieceIcon } from '@/components/synty/GameIcons';
import { forgeBaseUrl, rarityHex, STAT_GLYPH } from '@/lib/synty';

const STAT_TINT = { atk: '#fb7185', def: '#56b6f4', hp: '#5fd39b' } as const;
const RARITY_ORDER = ['poor', 'common', 'uncommon', 'advanced', 'ultimate'] as const;
type RarityKey = (typeof RARITY_ORDER)[number];
const rarityRank = (r: string): number => RARITY_ORDER.indexOf(r as RarityKey);
const AUTO_TARGETS: RarityKey[] = ['uncommon', 'advanced', 'ultimate'];
const AUTO_MAX_ATTEMPTS = 300;
const STRIKE_MS = 1500; // 3 coups de marteau (cf. index.css)

const WEIGHT_LABEL: Record<string, string> = { light: 'Léger', medium: 'Moyen', heavy: 'Lourd' };
type ResMap = Record<string, number>;

/**
 * ATELIER DE FORGE (arme/armure) — flow inline complet :
 *  · panneau latéral « Plans » (l'objet à forger),
 *  · matériau de zone (puissance) + encart SET optionnel (butin d'expédition),
 *  · enclume animée (marteau → étincelles) qui révèle le craft,
 *  · maîtrise de forge : plus le niveau monte, meilleures sont les probas.
 */
export function CraftStudio() {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { craft, craftSet } = useForge();

  const [slot, setSlot] = useState<'weapon' | 'armor'>('weapon');
  const bases = useMemo(() => FORGE_BASES.filter((b) => b.itemType === slot), [slot]);
  const setPieces = useMemo(() => SET_PIECES.filter((p) => p.slot === slot), [slot]);
  const materials = useMemo(
    () => [...FORGE_MATERIALS].sort((a, b) => a.craftTier - b.craftTier || a.zone - b.zone),
    [],
  );

  const [baseId, setBaseId] = useState<string>(bases[0]?.id ?? '');
  const [materialId, setMaterialId] = useState<string>('chene');
  const [setPieceId, setSetPieceId] = useState<string | null>(null);

  const [target, setTarget] = useState<RarityKey>('advanced');
  const [auto, setAuto] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [reached, setReached] = useState(false);
  const [striking, setStriking] = useState(false);
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
  const forge = forgeLevelInfo(profile?.forge_xp ?? 0);
  const oddsWeights = craftRarityWeights(forge.level);
  const oddsTotal = Object.values(oddsWeights).reduce((s, w) => s + w, 0);

  const base = bases.find((b) => b.id === baseId) ?? bases[0]!;
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

  function switchSlot(s: 'weapon' | 'armor') {
    setSlot(s);
    const first = FORGE_BASES.find((b) => b.itemType === s);
    setBaseId(first?.id ?? '');
    setSetPieceId(null);
    resetResult();
  }

  // ------------------------------------------------------------- craft + anim
  function revealAfterStrike(item: CraftedItem, xp: number | null, hitTarget: boolean, startedAt: number) {
    const wait = Math.max(0, STRIKE_MS - (performance.now() - startedAt));
    window.setTimeout(() => {
      if (!mountedRef.current) return;
      setStriking(false);
      setCrafted(item);
      setGainedXp(xp);
      setReached(hitTarget);
    }, wait);
  }

  async function forgeClassicOnce(): Promise<void> {
    resetResult();
    setStriking(true);
    const t0 = performance.now();
    try {
      const r = await craft.mutateAsync({ baseId: base.id, materialId: mat.id });
      revealAfterStrike(r.item, r.forge_xp ?? null, rarityRank(r.item.rarity) >= rarityRank(target), t0);
    } catch (e) {
      setStriking(false);
      setAutoError(e instanceof Error ? e.message : 'Erreur');
    }
  }

  function forgeSetPiece(): void {
    if (!piece) return;
    resetResult();
    setStriking(true);
    const t0 = performance.now();
    craftSet
      .mutateAsync({ pieceId: piece.id, materialId: mat.id })
      .then((r) => revealAfterStrike(r.item, null, false, t0))
      .catch((e) => {
        setStriking(false);
        setAutoError(e instanceof Error ? e.message : 'Erreur');
      });
  }

  // Auto-forge : pas d'animation d'enclume par coup (boucle rapide).
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
        setGainedXp(r.forge_xp ?? null);
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

  // ----------------------------------------------------------------- preview
  const ranges = craftRanges(base, mat);
  const classicOk = gold >= mat.gold && mat.materials.every((x) => (res[x.key] ?? 0) >= x.qty);
  const setStats = piece ? craftSetPieceStats(piece, mat) : null;
  const setRecipe = piece ? setPieceRecipe(piece, mat) : null;
  const setDef = piece ? SETS.find((s) => s.id === piece.setId) : null;
  const setOk = setRecipe ? gold >= setRecipe.gold && setRecipe.materials.every((m) => (res[m.key] ?? 0) >= m.qty) : false;
  const zoneKeys = new Set(mat.materials.map((x) => x.key));
  const setExtras = setRecipe ? setRecipe.materials.filter((m) => !zoneKeys.has(m.key)) : [];
  const busy = striking || auto || craft.isPending || craftSet.isPending;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* PLANS ------------------------------------------------------------- */}
        <aside className="space-y-2">
          <div className="flex gap-2">
            {(['weapon', 'armor'] as const).map((t) => (
              <button
                key={t}
                onClick={() => switchSlot(t)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm transition ${
                  slot === t
                    ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-white'
                    : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:border-white/25'
                }`}
              >
                <ItemTypeIcon type={t} size={16} color="currentColor" />
                {t === 'weapon' ? 'Armes' : 'Armures'}
              </button>
            ))}
          </div>
          <SectionLabel n={1} label="Le plan" />
          <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
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
                  <SyntyGlyph src={forgeBaseUrl(b.id)} size={26} color="var(--color-gold-soft)" title={b.label} />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-[var(--color-ink)]">{b.label}</span>
                    <span className="block text-[10px] text-[var(--color-muted)]">{WEIGHT_LABEL[b.weight]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* CONFIG + ENCLUME -------------------------------------------------- */}
        <main className="space-y-4">
          {/* Matériau de zone */}
          <section className="space-y-2">
            <SectionLabel n={2} label="Matériau de base" hint="fixe la zone, le tier et la puissance" />
            <div className="grid gap-2 sm:grid-cols-2">
              {materials.map((m) => {
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

          {/* Recette assemblée + aperçu (stats + probas selon le niveau de forge) */}
          <section className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
            {/* Assemblage : plan ⊕ matériau (⊕ butin de set) → objet */}
            <div className="mb-3 flex flex-wrap items-center justify-center gap-1">
              <Ingredient glyph={forgeBaseUrl(base.id)} label={base.label} />
              <span className="px-0.5 text-[var(--color-muted)]">+</span>
              <Ingredient icon={<ResourceIcon resKey={mat.materials[0]?.key ?? ''} size={24} />} label={mat.label} />
              {setMode && piece && (
                <>
                  <span className="px-0.5 text-[var(--color-muted)]">+</span>
                  <Ingredient icon={<SetPieceIcon pieceId={piece.id} size={24} />} label="Butin de set" tone="gold" />
                </>
              )}
              <span className="px-1 text-lg font-bold text-[var(--color-gold-soft)]">→</span>
              <Ingredient
                glyph={setMode ? undefined : forgeBaseUrl(base.id)}
                icon={setMode && piece ? <SetPieceIcon pieceId={piece.id} size={26} /> : undefined}
                label={`${piece?.label ?? base.label} ${mat.suffix}`}
                tone="result"
              />
            </div>
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
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-[var(--color-muted)]">Probas (forge N.{forge.level}) :</span>
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

          {/* Encart SET */}
          {setPieces.length > 0 && (
            <section className="space-y-2 rounded-lg border border-[var(--color-gold-soft)]/35 bg-[var(--color-gold-soft)]/[0.06] p-3">
              <div className="flex items-center gap-2">
                <UiIcon name="craft" size={14} color="var(--color-gold-soft)" />
                <span className="flex items-center gap-2 font-display text-sm font-semibold text-[var(--color-gold-soft)]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-gold-soft)]/20 text-[10px] font-bold">
                    3
                  </span>
                  Butin d'expédition — pièce de set (optionnel)
                </span>
              </div>
              <p className="text-[11px] text-[var(--color-muted)]">
                Ajoute le butin d'expédition signature : la pièce devient{' '}
                <strong className="text-[var(--color-ink)]">ultime</strong> et débloque un{' '}
                <strong className="text-[var(--color-ink)]">effet de set</strong>.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <TogglePill active={!setMode} onClick={() => { setSetPieceId(null); resetResult(); }}>
                  Classique
                </TogglePill>
                {setPieces.map((p) => {
                  const s = SETS.find((x) => x.id === p.setId);
                  return (
                    <TogglePill key={p.id} active={setPieceId === p.id} onClick={() => { setSetPieceId(p.id); resetResult(); }}>
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

          {/* 4. LE POSTE DE FORGE : enclume (gauche) + contrôles (droite), unifiés
              dans un seul panneau pour éviter deux blocs qui flottent. */}
          <section className="space-y-2">
            <SectionLabel n={4} label="Forger" hint="frappe le fer" />
            <div className="grid gap-4 rounded-lg border border-[var(--color-edge)] bg-black/20 p-3 sm:grid-cols-[minmax(0,300px)_minmax(0,1fr)] sm:items-center">
            <ForgeAnvil striking={striking}>
              {crafted && !striking && (
                <div className="anim-pop absolute inset-x-3 bottom-3 rounded-lg border bg-[var(--color-bg)]/95 p-2.5 text-sm shadow-lg"
                  style={{ borderColor: `${rarityHex(crafted.rarity)}88` }}>
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
                  <div className="mt-1 flex items-center gap-2 text-[11px]">
                    {gainedXp != null && gainedXp > 0 && (
                      <span className="text-[var(--color-gold-soft)]">+{gainedXp} XP de forge</span>
                    )}
                    {!setMode && attempts > 0 && (
                      reached ? (
                        <span className="text-emerald-300">✓ « {rarityMeta(target).label} » en {attempts} forge{attempts > 1 ? 's' : ''}</span>
                      ) : (
                        <span className="text-[var(--color-muted)]">arrêté après {attempts} forge{attempts > 1 ? 's' : ''}</span>
                      )
                    )}
                  </div>
                </div>
              )}
            </ForgeAnvil>

            {/* Colonne de contrôles : largeur BORNÉE pour ne pas s'étirer dans le vide */}
            <div className="mx-auto w-full max-w-md space-y-3">
              {/* Auto-forge : une ligne compacte (libellé + cibles) */}
              {!setMode && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
                  <span className="text-[var(--color-muted)]">Auto-forge jusqu'à</span>
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
                      {attempts} forge{attempts > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}

              {autoError && <p className="text-sm text-[var(--color-ember)]">{autoError}</p>}

              {/* Actions : « Forger » est l'action principale, « Auto » la secondaire */}
              {setMode ? (
                <button onClick={forgeSetPiece} disabled={!setOk || busy} className="btn btn-primary w-full text-sm">
                  {striking || craftSet.isPending ? 'Forge…' : `Forger la pièce de set — ${piece?.label ?? ''} ${mat.suffix}`}
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => void forgeClassicOnce()}
                    disabled={!classicOk || busy}
                    className="btn btn-primary flex-1 text-sm"
                  >
                    {striking ? 'Forge…' : 'Forger 1×'}
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
                      title={`Reforge en boucle jusqu'à « ${rarityMeta(target).label} » ou mieux`}
                    >
                      ⚙ Auto → {rarityMeta(target).label}
                    </button>
                  )}
                </div>
              )}
            </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- pièces */

const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const ang = -Math.PI / 2 + (((i % 7) - 3) / 3) * (Math.PI / 2.2);
  const dist = 30 + (i % 4) * 12;
  return { sx: `${Math.round(Math.cos(ang) * dist)}px`, sy: `${Math.round(Math.sin(ang) * dist)}px`, warm: i % 2 === 0 };
});

function ForgeAnvil({ striking, children }: { striking: boolean; children?: ReactNode }) {
  return (
    <div
      className={`relative mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-xl border border-[var(--color-edge)] bg-gradient-to-b from-black/45 to-black/10 ${
        striking ? 'forge-striking' : ''
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(circle at 50% 68%, rgba(224,121,60,0.28), transparent 58%)' }}
      />
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <radialGradient id="forgeFlashGrad">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="45%" stopColor="#ffd27a" />
            <stop offset="100%" stopColor="rgba(255,180,90,0)" />
          </radialGradient>
        </defs>
        {/* enclume : corne à gauche, table, taille creusée, pied */}
        <g className="forge-anvil">
          <path
            d="M34 128 L58 120 L142 120 L142 135 L116 135 L110 149 L134 153 L134 173 L66 173 L66 153 L90 149 L84 135 L58 135 Z"
            fill="#40464e"
          />
          {/* reflet du dessus de table */}
          <rect x="58" y="120" width="84" height="4" rx="2" fill="#5b626c" />
          {/* ombre sous la table */}
          <rect x="84" y="135" width="32" height="3" fill="#2f343a" />
          {/* pied */}
          <rect x="66" y="169" width="68" height="4" rx="2" fill="#2f343a" />
        </g>
        {/* marteau : dessiné DROIT (tête horizontale + manche vertical =
            perpendiculaires) puis incliné d'un bloc → la tête reste ⊥ au manche. */}
        <g className="forge-hammer">
          <g transform="rotate(26 100 107)">
            <rect x="96" y="42" width="8" height="60" rx="3" fill="#7c5330" />
            <rect x="97.5" y="44" width="2.5" height="56" rx="1.25" fill="#976a3d" />
            <rect x="78" y="98" width="44" height="18" rx="3.5" fill="#4b5158" />
            <rect x="78" y="98" width="44" height="4" rx="2" fill="#6b727b" />
            <rect x="78" y="98" width="7" height="18" rx="2" fill="#3a4046" />
            <rect x="115" y="98" width="7" height="18" rx="2" fill="#3a4046" />
          </g>
        </g>
        {/* éclair d'impact (sur la table) */}
        <circle className="forge-flash" cx="100" cy="120" r="18" fill="url(#forgeFlashGrad)" />
      </svg>
      {/* étincelles au point d'impact (~50% / ~60%) */}
      <div className="pointer-events-none absolute left-1/2 top-[60%]">
        {SPARKS.map((s, i) => (
          <span
            key={i}
            className="forge-spark absolute h-1 w-1 rounded-full"
            style={{ ['--sx']: s.sx, ['--sy']: s.sy, background: s.warm ? '#ff8a3c' : '#ffd27a' } as React.CSSProperties}
          />
        ))}
      </div>
      {children}
    </div>
  );
}

function SectionLabel({ n, label, hint }: { n?: number; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2">
      {n != null && (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-arcane)]/20 text-[10px] font-bold text-[var(--color-arcane)]">
          {n}
        </span>
      )}
      <span className="text-xs font-semibold text-[var(--color-ink)]">{label}</span>
      {hint && <span className="text-[11px] text-[var(--color-muted)]">— {hint}</span>}
    </div>
  );
}

/** Un « ingrédient » de la recette : icône encadrée + libellé (pour l'assemblage visuel). */
function Ingredient({
  glyph,
  icon,
  label,
  tone,
}: {
  glyph?: string | undefined;
  icon?: ReactNode | undefined;
  label: string;
  tone?: 'gold' | 'result';
}) {
  const ring =
    tone === 'gold'
      ? 'border-[var(--color-gold-soft)]/50 bg-[var(--color-gold-soft)]/10'
      : tone === 'result'
        ? 'border-[var(--color-arcane)]/50 bg-[var(--color-arcane)]/10'
        : 'border-[var(--color-edge)] bg-black/25';
  return (
    <span className="flex w-[62px] flex-col items-center gap-1 text-center">
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl border ${ring}`}>
        {glyph ? <SyntyGlyph src={glyph} size={24} color="var(--color-gold-soft)" /> : icon}
      </span>
      <span className="text-[9px] leading-tight text-[var(--color-muted)]">{label}</span>
    </span>
  );
}

function TogglePill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
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
