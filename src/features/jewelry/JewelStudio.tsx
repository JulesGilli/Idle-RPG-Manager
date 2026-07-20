import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useResources } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';
import { FORGE_MATERIALS } from '@shared/progression/forge';
import {
  GEMS,
  jewelRecipe,
  jewelPctRange,
  jewelLevelInfo,
  jewelRarityWeights,
  autoJewelUnlocked,
  AUTO_JEWEL_UNLOCK_LEVEL,
  type GemDef,
} from '@shared/progression/jewelry';
import {
  SETS,
  setPiecesForWorkshop,
  setPieceGated,
  setPieceWrongArc,
  setPieceRecipe,
  craftSetPieceStats,
  describeSetEffect,
  setEffectAt,
} from '@shared/progression/sets';
import { useRelease } from '@/features/release/useRelease';
import { useArc } from '@/features/arc/useArc';
import { useForge, type CraftedItem } from '@/features/forge/useForge';
import { Ingredient, StatOut, setBonusLine } from '@/features/forge/craftUi';
import {
  useCraftRitual,
  RitualStepper,
  RevealBurst,
  HitGauge,
  CraftedPanel,
  AutoLog,
  AutoGate,
  REVEAL_FX,
  AUTO_MAX_ATTEMPTS,
  AUTO_CHUNK,
  RARITY_ORDER,
  type AutoTarget,
  type Ritual,
} from '@/features/forge/craftRitual';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon, PassiveIcon, SetPieceIcon, ItemTypeIcon } from '@/components/synty/GameIcons';

type ResMap = Record<string, number>;
type PlanMode = 'gem' | 'set';
type Step = 1 | 2 | 3;

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
 * ATELIER DE JOAILLERIE — même rituel que la Forge (cf. `craftRitual`) :
 *  1. la gemme (le « plan » : type de passif, base % et plafond) — ou une pièce
 *     de set, qui est un plan à part entière et non une option,
 *  2. le composant de zone (puissance du %),
 *  3. l'établi : le joueur SERTIT lui-même, autant de fois que la pièce le mérite.
 *
 * Pas d'étape « matériau de boss » ici : les bijoux n'en consomment pas.
 * La recette posée, on reste sur l'établi ; à partir du Nv.8 de maîtrise,
 * l'auto-sertissage prend le relais.
 */
export function JewelStudio() {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { craftJewel, craftSet, autoCraft } = useForge();
  const { released } = useRelease();
  const { currentArc } = useArc();

  const [step, setStep] = useState<Step>(1);
  const [mode, setPlanMode] = useState<PlanMode>('gem');
  const materials = useMemo(
    () => [...FORGE_MATERIALS].sort((a, b) => a.craftTier - b.craftTier || a.zone - b.zone),
    [],
  );
  // La Joaillerie ne fait QUE les bijoux. Masque aussi les pièces encore
  // verrouillées (sortie V1.1) avant l'heure, et celles d'un AUTRE arc que le
  // courant (chaque arc a son propre catalogue de sets).
  const setPieces = useMemo(
    () =>
      setPiecesForWorkshop('jewelry').filter(
        (p) => (released || !setPieceGated(p.id)) && !setPieceWrongArc(p.id, currentArc),
      ),
    [released, currentArc],
  );

  const [gemId, setGemId] = useState<string>('gemme_seve');
  const [materialId, setMaterialId] = useState<string>('chene');
  const [setPieceId, setSetPieceId] = useState<string | null>(null);

  const [target, setTarget] = useState<AutoTarget>('advanced');
  const [auto, setAuto] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [autoLog, setAutoLog] = useState<CraftedItem[]>([]);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [reached, setReached] = useState(false);
  const stopRef = useRef(false);
  useEffect(() => () => void (stopRef.current = true), []);

  const gold = profile?.gold ?? 0;
  const res: ResMap = resources ?? {};
  const jewel = jewelLevelInfo(profile?.jewel_xp ?? 0);
  const autoOk = autoJewelUnlocked(jewel.level);
  const oddsWeights = jewelRarityWeights(jewel.level);
  const oddsTotal = Object.values(oddsWeights).reduce((s, w) => s + w, 0);

  const gem = GEMS.find((g) => g.id === gemId) ?? GEMS[0]!;
  const mat = materials.find((m) => m.id === materialId) ?? materials[0]!;
  const setMode = mode === 'set';
  const piece = setMode ? (setPieces.find((p) => p.id === setPieceId) ?? null) : null;

  // -------------------------------------------------------------- aperçu
  const [pctMin, pctMax] = jewelPctRange(mat, gem);
  const setStats = piece ? craftSetPieceStats(piece, mat) : null;
  const setRecipe = piece ? setPieceRecipe(piece, mat) : null;
  const setDef = piece ? SETS.find((s) => s.id === piece.setId) : null;
  const recipe = setMode ? setRecipe : jewelRecipe(mat, gem);
  const affordable = recipe
    ? gold >= recipe.gold && recipe.materials.every((m) => (res[m.key] ?? 0) >= m.qty)
    : false;
  const zoneKeys = new Set(mat.materials.map((x) => x.key));
  const setExtras = setRecipe ? setRecipe.materials.filter((m) => !zoneKeys.has(m.key)) : [];
  const canStart = affordable && !auto && (!setMode || !!piece);
  const planLabel = setMode ? (piece?.label ?? '—') : gem.label;

  const ritual = useCraftRitual(
    useCallback(
      () =>
        setMode
          ? craftSet.mutateAsync({ pieceId: piece!.id, materialId: mat.id }).then((r) => ({ item: r.item, xp: null }))
          : craftJewel
              .mutateAsync({ materialId: mat.id, gemId: gem.id })
              .then((r) => ({ item: r.item, xp: r.jewel_xp ?? null })),
      [setMode, piece, mat.id, gem.id, craftJewel, craftSet],
    ),
    canStart,
  );
  const busy = auto || ritual.inFlight;

  const resetResult = useCallback(() => {
    ritual.reset();
    setReached(false);
    setAttempts(0);
    setAutoLog([]);
    setAutoError(null);
  }, [ritual]);

  function switchMode(m: PlanMode) {
    setPlanMode(m);
    if (m === 'set') setSetPieceId((cur) => cur ?? setPieces[0]?.id ?? null);
    else setSetPieceId(null);
    resetResult();
  }

  // -------------------------------------------------------- auto-sertissage
  // La série tourne CÔTÉ SERVEUR, par lots : un appel enchaîne jusqu'à AUTO_CHUNK
  // sertissages. On reste en boucle pour garder le Stop réactif et le journal vivant.
  async function runAuto(): Promise<void> {
    if (auto || !autoOk) return;
    resetResult();
    stopRef.current = false;
    setAuto(true);
    let n = 0;
    const log: CraftedItem[] = [];
    try {
      while (!stopRef.current && n < AUTO_MAX_ATTEMPTS) {
        const r = await autoCraft.mutateAsync({
          kind: 'jewel',
          gemId: gem.id,
          materialId: mat.id,
          target,
          maxAttempts: Math.min(AUTO_CHUNK, AUTO_MAX_ATTEMPTS - n),
        });
        n += r.attempts;
        log.push(...r.items);
        setAttempts(n);
        setAutoLog([...log]);
        if (r.reached) {
          setReached(true);
          break;
        }
        // Plus de quoi payer : ce n'est pas une erreur, c'est la fin de la série.
        if (r.stopped) {
          setAutoError(r.stopped);
          break;
        }
        if (r.attempts === 0) break;
      }
    } catch (e) {
      setAutoError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setAuto(false);
    }
  }

  return (
    <div className="space-y-4">
      <RitualStepper
        step={step}
        onStep={(n) => setStep(n as Step)}
        steps={[
          { n: 1, label: 'La gemme', value: planLabel },
          { n: 2, label: 'Le composant', value: mat.label },
          { n: 3, label: 'Sertir' },
        ]}
      />

      {/* ÉTAPE 1 — LA GEMME --------------------------------------------------- */}
      {step === 1 && (
        <section className="space-y-3">
          <div className="flex gap-2">
            {(
              [
                { id: 'gem', label: 'Gemmes' },
                { id: 'set', label: 'Sets' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => switchMode(t.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm transition ${
                  mode === t.id
                    ? t.id === 'set'
                      ? 'border-[var(--color-gold-soft)] bg-[var(--color-gold-soft)]/15 text-[var(--color-gold-soft)]'
                      : 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-white'
                    : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:border-white/25'
                }`}
              >
                {t.id === 'set' ? (
                  <UiIcon name="craft" size={15} color="currentColor" />
                ) : (
                  <ItemTypeIcon type="jewel" size={16} color="currentColor" />
                )}
                {t.label}
              </button>
            ))}
          </div>

          {setMode ? (
            <>
              <p className="text-[11px] text-[var(--color-muted)]">
                Une pièce de set se sertit avec le <strong className="text-[var(--color-ink)]">butin d'expédition</strong>{' '}
                signature : elle sort <strong className="text-[var(--color-ink)]">ultime</strong> à coup sûr et débloque
                un <strong className="text-[var(--color-ink)]">effet de set</strong> — des stats brutes au lieu d'un
                passif.
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {setPieces.map((p) => {
                  const s = SETS.find((x) => x.id === p.setId);
                  return (
                    <PlanCard
                      key={p.id}
                      active={setPieceId === p.id}
                      tone="gold"
                      onClick={() => {
                        setSetPieceId(p.id);
                        resetResult();
                        setStep(2);
                      }}
                      icon={<SetPieceIcon pieceId={p.id} size={26} />}
                      label={p.label}
                      sub={s?.name ?? ''}
                    />
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <p className="text-[11px] text-[var(--color-muted)]">
                La gemme décide du <strong className="text-[var(--color-ink)]">passif</strong> du bijou et de son{' '}
                <strong className="text-[var(--color-ink)]">plafond</strong>.
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {GEMS.map((g) => {
                  const owned = res[g.id] ?? 0;
                  return (
                    <PlanCard
                      key={g.id}
                      active={g.id === gem.id}
                      onClick={() => {
                        setGemId(g.id);
                        resetResult();
                        setStep(2);
                      }}
                      icon={<ResourceIcon resKey={g.id} size={24} />}
                      label={g.label}
                      sub={`plafond ${g.maxPct}%`}
                      passive={
                        <span className="inline-flex items-center gap-1">
                          <PassiveIcon passive={g.passive} size={10} /> {g.passiveLabel}
                        </span>
                      }
                      owned={owned}
                      dim={owned === 0}
                    />
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {/* ÉTAPE 2 — LE COMPOSANT ---------------------------------------------- */}
      {step === 2 && (
        <section className="space-y-3">
          <p className="text-[11px] text-[var(--color-muted)]">
            Le composant fixe la <strong className="text-[var(--color-ink)]">zone</strong>, le{' '}
            <strong className="text-[var(--color-ink)]">tier</strong> et la{' '}
            <strong className="text-[var(--color-ink)]">puissance du passif</strong>.
          </p>
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
                    setStep(3);
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
                    <span className={gold >= r.gold ? 'text-[var(--color-gold-soft)]' : 'text-[var(--color-ember)]'}>
                      <UiIcon name="gold" size={11} /> {r.gold}
                    </span>
                    {r.materials.map((x) => {
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
      )}

      {/* ÉTAPE 3 — L'ÉTABLI --------------------------------------------------- */}
      {step === 3 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-3">
            <div className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-center gap-1">
                <Ingredient
                  icon={setMode && piece ? <SetPieceIcon pieceId={piece.id} size={24} /> : <ResourceIcon resKey={gem.id} size={24} />}
                  label={planLabel}
                  tone={setMode ? 'gold' : undefined}
                />
                <span className="px-0.5 text-[var(--color-muted)]">+</span>
                <Ingredient icon={<ResourceIcon resKey={mat.materials[0]!.key} size={24} />} label={mat.label} />
                <span className="px-1 text-lg font-bold text-[var(--color-gold-soft)]">→</span>
                <Ingredient
                  icon={
                    setMode && piece ? (
                      <SetPieceIcon pieceId={piece.id} size={26} />
                    ) : (
                      <ItemTypeIcon type="jewel" size={24} color="var(--color-arcane)" />
                    )
                  }
                  label={setMode ? (piece?.label ?? '') : 'Amulette'}
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
                  <span className="chip bg-[var(--color-gold-soft)]/15 text-[10px] font-semibold text-[var(--color-gold-soft)]">
                    Ultime garanti
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="inline-flex items-center gap-1 text-[var(--color-ink)]/85">
                      <PassiveIcon passive={gem.passive} size={13} /> {gem.passiveLabel} {pctMin}–{pctMax}%
                    </span>
                    <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">plafond {gem.maxPct}%</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-[var(--color-muted)]">Probas (maîtrise N.{jewel.level}) :</span>
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

              {recipe && (
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
              )}
            </div>

            {/* Effet de set */}
            {setMode && piece && setDef && (
              <div className="rounded-lg border border-[var(--color-gold-soft)]/35 bg-[var(--color-gold-soft)]/[0.06] p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <SetPieceIcon pieceId={piece.id} size={18} />
                  <span className="font-display text-xs font-semibold text-[var(--color-gold-soft)]">{setDef.name}</span>
                </div>
                <div className="space-y-1 rounded-md bg-black/25 p-2 text-[11px]">
                  <div className="flex gap-1.5">
                    <span className="shrink-0 font-semibold text-[var(--color-muted)]">2 pièces</span>
                    <span className="text-[var(--color-gold-soft)]">{setBonusLine(setDef.bonus2)}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="shrink-0 font-semibold text-[var(--color-muted)]">
                      {setEffectAt(setDef)} pièces
                    </span>
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

            {autoLog.length > 0 && (
              <AutoLog
                log={autoLog}
                reached={reached}
                target={target}
                running={auto}
                verb="sertissage"
                line={jewelLine}
              />
            )}
          </section>

          {/* Poste de sertissage */}
          <section className="space-y-3">
            <JewelBench ritual={ritual} gem={gem} />

            {ritual.crafted ? (
              <CraftedPanel
                item={ritual.crafted}
                xp={ritual.gainedXp}
                xpLabel="XP de joaillerie"
                againLabel="Sertir la même chose"
                onAgain={resetResult}
              >
                <div className="mt-1 text-xs text-[var(--color-muted)]">{jewelLine(ritual.crafted)}</div>
              </CraftedPanel>
            ) : (
              <p className="text-center text-[11px] text-[var(--color-muted)]">
                {!affordable
                  ? 'Ressources insuffisantes pour cette recette.'
                  : ritual.inFlight || ritual.pending
                    ? 'La gemme résiste… continue de sertir.'
                    : 'Clique l’établi pour sertir la gemme.'}
              </p>
            )}

            {(ritual.error ?? autoError) && (
              <p className="text-center text-sm text-[var(--color-ember)]">{ritual.error ?? autoError}</p>
            )}

            {!setMode && (
              <AutoGate
                unlocked={autoOk}
                unlockLevel={AUTO_JEWEL_UNLOCK_LEVEL}
                level={jewel.level}
                label="Auto-sertissage"
                target={target}
                onTarget={setTarget}
                running={auto}
                attempts={attempts}
                canRun={affordable && !busy}
                onRun={() => void runAuto()}
                onStop={() => (stopRef.current = true)}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- pièces */

/** Un bijou n'a pas de stats brutes : sa ligne de résultat, c'est son passif. */
function jewelLine(it: CraftedItem): string {
  if (it.passive_type && it.passive_value > 0) return `${it.passive_value}%`;
  return [
    it.atk_bonus ? `+${it.atk_bonus} ATK` : null,
    it.def_bonus ? `+${it.def_bonus} DEF` : null,
    it.hp_bonus ? `+${it.hp_bonus} PV` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function PlanCard({
  active,
  onClick,
  icon,
  label,
  sub,
  tone,
  passive,
  owned,
  dim,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub: string;
  tone?: 'gold';
  passive?: React.ReactNode;
  owned?: number;
  dim?: boolean;
}) {
  const on =
    tone === 'gold'
      ? 'border-[var(--color-gold-soft)] bg-[var(--color-gold-soft)]/10'
      : 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/10';
  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-2 rounded-lg border p-2.5 text-left transition ${
        active ? on : 'border-[var(--color-edge)] bg-black/20 hover:border-white/25'
      } ${dim ? 'opacity-60' : ''}`}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold text-[var(--color-ink)]">{label}</span>
          {owned != null && (
            <span
              className={`shrink-0 text-[10px] font-semibold ${
                owned > 0 ? 'text-[var(--color-gold-soft)]' : 'text-[var(--color-ember)]'
              }`}
            >
              ×{owned}
            </span>
          )}
        </span>
        {passive && <span className="mt-0.5 block text-[10px] text-[var(--color-arcane)]">{passive}</span>}
        <span className="block truncate text-[10px] text-[var(--color-muted)]">{sub}</span>
      </span>
    </button>
  );
}

/* --------------------------------------------------------------------- établi */

const SPARKS = Array.from({ length: 12 }, (_, i) => {
  const ang = -Math.PI / 2 + (((i % 6) - 2.5) / 2.5) * (Math.PI / 2.2);
  const dist = 26 + (i % 4) * 10;
  return { sx: `${Math.round(Math.cos(ang) * dist)}px`, sy: `${Math.round(Math.sin(ang) * dist)}px` };
});

/**
 * L'établi EST le bouton : on le clique pour sertir. Le halo s'intensifie à
 * chaque passe qui ne termine pas la pièce — pendant de l'enclume de la Forge.
 */
function JewelBench({ ritual, gem }: { ritual: Ritual; gem: GemDef }) {
  const { hits, pending, crafted, burstKey, canStrike, inFlight, strike } = ritual;
  const [light, dark] = gemTint(gem);
  const fx = crafted ? (REVEAL_FX[crafted.rarity] ?? REVEAL_FX.poor!) : null;
  const heat = Math.min(1, hits / 5);
  const idle = !crafted && hits === 0 && !inFlight && !pending;
  const disabled = !canStrike;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={strike}
        disabled={disabled}
        aria-label="Sertir la gemme"
        className={`relative mx-auto block aspect-square w-full max-w-[300px] overflow-hidden rounded-xl border bg-gradient-to-b from-black/45 to-black/10 transition ${
          disabled
            ? 'cursor-default border-[var(--color-edge)] opacity-80'
            : `cursor-pointer border-[var(--color-edge)] hover:border-[var(--color-gold-soft)]/60 ${idle ? 'anim-pulse' : ''}`
        } ${crafted && fx?.quake ? 'forge-quake' : ''}`}
      >
        {/* Halo : monte avec le nombre de passes encaissées. */}
        <span
          aria-hidden
          className="forge-heat pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(circle at 50% 60%, ${light}${heat > 0.5 ? '55' : '33'}, transparent ${60 + heat * 12}%)` }}
        />

        {/* Passe de sertissage : remontée à chaque clic pour rejouer l'animation. */}
        <span key={hits} className={hits > 0 && !crafted ? 'jewel-hit' : ''}>
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
          <span className="pointer-events-none absolute left-1/2 top-[61%]">
            {SPARKS.map((s, i) => (
              <span
                key={i}
                className="forge-spark absolute h-1 w-1 rounded-full"
                style={{ ['--sx']: s.sx, ['--sy']: s.sy, background: i % 2 ? light : '#ffffff' } as React.CSSProperties}
              />
            ))}
          </span>
        </span>

        {crafted && <RevealBurst rarity={crafted.rarity} burstKey={burstKey} />}

        {idle && (
          <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] font-semibold text-[var(--color-gold-soft)]">
            Sertis la gemme
          </span>
        )}
      </button>

      {(hits > 0 || pending) && !crafted && <HitGauge hits={hits} />}
    </div>
  );
}
