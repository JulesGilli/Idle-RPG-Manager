import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useResources } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { secondaryStatPct } from '@shared/progression/forge';
import {
  RELIC_BASES,
  RELIC_STAT_LABEL,
  relicRecipe,
  relicRanges,
  relicStatsByRarity,
  relicLevelInfo,
  relicRarityWeights,
  autoRelicUnlocked,
  AUTO_RELIC_UNLOCK_LEVEL,
  type RelicStat,
} from '@shared/progression/relic';
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
import { forgeMaterialsForArc, bossMaterialForArc } from '@shared/progression/arcMaterials';
import { tierGearMult, scaleRecipeForArc } from '@shared/progression/arc';
import { ArcCraftNotice, ArcSetsEmpty } from '@/features/arc/ArcCraftNotice';
import { useForge, type CraftedItem } from '@/features/forge/useForge';
import { Ingredient, StatOut, setBonusLine, BossPicker, STAT_TINT, scaleStats, RecipeCost, RarityStatTable } from '@/features/forge/craftUi';
import {
  useCraftRitual,
  RitualStepper,
  RevealBurst,
  HitGauge,
  CraftedPanel,
  AutoLog,
  AutoGate,
  REVEAL_FX,
  MAX_HITS,
  AUTO_MAX_ATTEMPTS,
  AUTO_CHUNK,
  type AutoTarget,
  type Ritual,
} from '@/features/forge/craftRitual';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon, RelicIcon, SetPieceIcon } from '@/components/synty/GameIcons';

type ResMap = Record<string, number>;
type PlanMode = 'relic' | 'set';
type Step = 1 | 2 | 3;

/**
 * AUTEL DES RELIQUES — même rituel que la Forge et la Joaillerie (cf.
 * `craftRitual`) :
 *  1. le plan (modèle de relique — ou une pièce de set, plan à part entière),
 *  2. le composant de zone (porte la stat PRIORITAIRE du modèle ; les matériaux
 *     de boss qu'il exige alimentent les deux autres),
 *  3. l'autel : le joueur CONSACRE lui-même, autant de passes que la relique
 *     le mérite.
 *
 * La recette posée, on reste sur l'autel ; à partir du Nv.8 de maîtrise,
 * l'auto-façonnage prend le relais.
 */
export function RelicStudio() {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { craftRelic, craftSet, autoCraft } = useForge();
  const { released } = useRelease();
  const { currentArc } = useArc();

  const [step, setStep] = useState<Step>(1);
  const [mode, setPlanMode] = useState<PlanMode>('relic');
  const materials = useMemo(
    () => [...forgeMaterialsForArc(currentArc)].sort((a, b) => a.craftTier - b.craftTier || a.zone - b.zone),
    [currentArc],
  );
  // L'Autel ne fait QUE les reliques. Masque aussi les pièces encore
  // verrouillées (sortie V1.1) avant l'heure, et celles d'un AUTRE arc que le
  // courant (chaque arc a son propre catalogue de sets).
  const setPieces = useMemo(
    () =>
      setPiecesForWorkshop('altar').filter(
        (p) => (released || !setPieceGated(p.id)) && !setPieceWrongArc(p.id, currentArc),
      ),
    [released, currentArc],
  );

  const [baseId, setBaseId] = useState<string>(RELIC_BASES[0]!.id);
  const [materialId, setMaterialId] = useState<string>('chene');
  const [setPieceId, setSetPieceId] = useState<string | null>(null);
  /** Essence de boss choisie — `null` = aucune, donc relique mono-stat. */
  const [bossKey, setBossKey] = useState<string | null>(null);

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
  const relic = relicLevelInfo(profile?.relic_xp ?? 0);
  const autoOk = autoRelicUnlocked(relic.level);
  const oddsWeights = relicRarityWeights(relic.level);
  const oddsTotal = Object.values(oddsWeights).reduce((s, w) => s + w, 0);

  const base = RELIC_BASES.find((b) => b.id === baseId) ?? RELIC_BASES[0]!;
  const mat = materials.find((m) => m.id === materialId) ?? materials[0]!;
  const setMode = mode === 'set';
  const piece = setMode ? (setPieces.find((p) => p.id === setPieceId) ?? null) : null;

  // Une pièce de set ne choisit pas son essence : sa recette est signée.
  const boss = setMode ? null : bossKey ? (bossMaterialForArc(bossKey, currentArc) ?? null) : null;

  // ----------------------------------------------------------------- aperçu
  // Même correction qu'à la Forge : `relicRanges` donne les stats de BASE, le
  // multiplicateur d'arc étant appliqué par le serveur au craft.
  const tm = tierGearMult(currentArc);
  const rawRanges = relicRanges(base, mat, boss);
  const ranges = {
    atk: [Math.round(rawRanges.atk[0] * tm), Math.round(rawRanges.atk[1] * tm)] as [number, number],
    def: [Math.round(rawRanges.def[0] * tm), Math.round(rawRanges.def[1] * tm)] as [number, number],
    hp: [Math.round(rawRanges.hp[0] * tm), Math.round(rawRanges.hp[1] * tm)] as [number, number],
  };
  // Détail par qualité — MÊME multiplicateur d'arc que la fourchette ci-dessus,
  // sinon les deux blocs annonceraient des chiffres différents pour un objet
  // identique.
  const byRarity = useMemo(
    () =>
      relicStatsByRarity(base, mat, boss).map((r) => ({
        rarity: r.rarity,
        atk: Math.round(r.atk * tm),
        def: Math.round(r.def * tm),
        hp: Math.round(r.hp * tm),
      })),
    [base, mat, boss, tm],
  );
  const statColumns = [
    { label: 'ATK', color: STAT_TINT.atk },
    { label: 'DEF', color: STAT_TINT.def },
    { label: 'PV', color: STAT_TINT.hp },
  ];
  const setStats = piece ? scaleStats(craftSetPieceStats(piece, mat), tm) : null;
  const setRecipe = piece ? setPieceRecipe(piece, mat) : null;
  const setDef = piece ? SETS.find((s) => s.id === piece.setId) : null;
  // Coût REEL, forgeCostMult inclus (cf. CraftStudio).
  const recipe = scaleRecipeForArc(setMode && setRecipe ? setRecipe : relicRecipe(mat, boss, currentArc), currentArc);
  const affordable = recipe
    ? gold >= recipe.gold && recipe.materials.every((m) => (res[m.key] ?? 0) >= m.qty)
    : false;
  const zoneKeys = new Set(mat.materials.map((x) => x.key));
  // Butin signature = ce que la recette RÉELLE (scalée par l'arc, cf. recipe)
  // exige en plus du farm de zone. Lire `setRecipe` brut ici affichait les
  // quantités d'arc 1 sous un total d'arc 2 — deux chiffres pour un même craft.
  const signatureKeys = setRecipe
    ? new Set(recipe.materials.filter((m) => !zoneKeys.has(m.key)).map((m) => m.key))
    : new Set<string>();
  const canStart = affordable && !auto && (!setMode || !!piece);
  const planLabel = setMode ? (piece?.label ?? '—') : base.label;

  const ritual = useCraftRitual(
    useCallback(
      () =>
        setMode
          ? craftSet.mutateAsync({ pieceId: piece!.id, materialId: mat.id }).then((r) => ({ item: r.item, xp: null }))
          : craftRelic
              .mutateAsync({ baseId: base.id, materialId: mat.id, bossMaterialId: boss?.key ?? null })
              .then((r) => ({ item: r.item, xp: r.relic_xp ?? null })),
      [setMode, piece, mat.id, base.id, boss, craftRelic, craftSet],
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

  // ---------------------------------------------------------- auto-façonnage
  // La série tourne CÔTÉ SERVEUR, par lots : un appel enchaîne jusqu'à AUTO_CHUNK
  // reliques. On reste en boucle pour garder le Stop réactif et le journal vivant.
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
          kind: 'relic',
          baseId: base.id,
          materialId: mat.id,
          // L'essence vaut pour toute la série : c'est le plan, pas un tirage.
          bossMaterialId: boss?.key ?? null,
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
      <ArcCraftNotice />
      <RitualStepper
        step={step}
        onStep={(n) => setStep(n as Step)}
        steps={[
          { n: 1, label: 'Le plan', value: planLabel },
          { n: 2, label: 'Le composant', value: mat.label },
          { n: 3, label: 'Consacrer' },
        ]}
      />

      {/* ÉTAPE 1 — LE PLAN ---------------------------------------------------- */}
      {step === 1 && (
        <section className="space-y-3">
          <div className="flex gap-2">
            {(
              [
                { id: 'relic', label: 'Reliques' },
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
                  <RelicIcon size={16} color="currentColor" />
                )}
                {t.label}
              </button>
            ))}
          </div>

          {setMode ? (
            setPieces.length === 0 ? (
              <ArcSetsEmpty arc={currentArc} />
            ) : (
            <>
              <p className="text-[11px] text-[var(--color-muted)]">
                Une pièce de set se façonne avec le{' '}
                <strong className="text-[var(--color-ink)]">butin d'expédition</strong> signature : elle sort{' '}
                <strong className="text-[var(--color-ink)]">ultime</strong> à coup sûr et débloque un{' '}
                <strong className="text-[var(--color-ink)]">effet de set</strong>.
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
            )
          ) : (
            <>
              <p className="text-[11px] text-[var(--color-muted)]">
                Toutes les reliques donnent les <strong className="text-[var(--color-ink)]">trois stats</strong> : le
                modèle décide seulement de la <strong className="text-[var(--color-ink)]">prioritaire</strong>.
              </p>
              <div className="grid gap-1.5 sm:grid-cols-3">
                {RELIC_BASES.map((b) => (
                  <PlanCard
                    key={b.id}
                    active={b.id === base.id}
                    onClick={() => {
                      setBaseId(b.id);
                      resetResult();
                      setStep(2);
                    }}
                    icon={<RelicIcon size={26} color="var(--color-gold-soft)" />}
                    label={b.label}
                    sub="ATK · DEF · PV"
                    primary={b.primary}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ÉTAPE 2 — LE COMPOSANT ---------------------------------------------- */}
      {step === 2 && (
        <section className="space-y-3">
          <p className="text-[11px] text-[var(--color-muted)]">
            Le composant porte la <strong className="text-[var(--color-ink)]">stat prioritaire</strong> ; les{' '}
            <strong className="text-[var(--color-ink)]">matériaux de boss</strong> qu'il exige alimentent les deux
            autres.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {materials.map((m) => {
              // MÊME calcul qu'à l'étape suivante, `forgeCostMult` compris : la
              // carte de composant annonçait le coût BRUT, l'autel le coût réel.
              // En arc 2 les deux écrans se contredisaient (×2.5 d'écart).
              const r = scaleRecipeForArc(
                piece ? setPieceRecipe(piece, m) : relicRecipe(m, boss, currentArc),
                currentArc,
              );
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

      {/* ÉTAPE 3 — L'AUTEL ---------------------------------------------------- */}
      {step === 3 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-3">
            {/* Même règle qu'à la forge : l'essence se choisit SUR l'autel, pour
                pouvoir la changer entre deux reliques sans refaire le rituel. */}
            {!setMode && (
              <BossPicker
                res={res}
                value={bossKey}
                onPick={setBossKey}
                disabled={busy}
                primary={base.primary}
                arc={currentArc}
              />
            )}
            <div className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-center gap-1">
                <Ingredient
                  icon={
                    setMode && piece ? (
                      <SetPieceIcon pieceId={piece.id} size={24} />
                    ) : (
                      <RelicIcon size={24} color="var(--color-gold-soft)" />
                    )
                  }
                  label={planLabel}
                  tone={setMode ? 'gold' : undefined}
                />
                <span className="px-0.5 text-[var(--color-muted)]">+</span>
                <Ingredient icon={<ResourceIcon resKey={mat.materials[0]!.key} size={24} />} label={mat.label} />
                {boss && (
                  <>
                    <span className="px-0.5 text-[var(--color-muted)]">+</span>
                    <Ingredient icon={<ResourceIcon resKey={boss.key} size={24} />} label={boss.label} />
                  </>
                )}
                <span className="px-1 text-lg font-bold text-[var(--color-gold-soft)]">→</span>
                <Ingredient
                  icon={
                    setMode && piece ? (
                      <SetPieceIcon pieceId={piece.id} size={26} />
                    ) : (
                      <RelicIcon size={26} color="var(--color-arcane)" />
                    )
                  }
                  label={`${planLabel} ${mat.suffix}`}
                  tone="result"
                />
              </div>
              <div className="mb-1 flex items-center justify-between">
                <span className="font-display text-sm font-semibold text-[var(--color-ink)]">
                  {planLabel} {mat.suffix}
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
                  {/* Les trois stats, la prioritaire mise en avant. */}
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <RelicRange kind="atk" lo={ranges.atk[0]} hi={ranges.atk[1]} primary={base.primary === 'atk'} />
                    <RelicRange kind="def" lo={ranges.def[0]} hi={ranges.def[1]} primary={base.primary === 'def'} />
                    <RelicRange kind="hp" lo={ranges.hp[0]} hi={ranges.hp[1]} primary={base.primary === 'hp'} />
                  </div>
                  <p className="mt-1.5 text-[10px] text-[var(--color-muted)]/80">
                    Le <strong className="text-[var(--color-ink)]/90">composant</strong> porte la prioritaire (
                    {RELIC_STAT_LABEL[base.primary]}) ;{' '}
                    {boss ? (
                      <>
                        l'<strong className="text-[var(--color-ink)]/90">{boss.label}</strong> alimente{' '}
                        {boss.stats.filter((s) => s !== base.primary).length > 0 ? (
                          <>
                            {boss.stats
                              .filter((s) => s !== base.primary)
                              .map((s) => RELIC_STAT_LABEL[s])
                              .join(' et ')}{' '}
                            à {Math.round(secondaryStatPct(boss.zone) * 100)}%.
                          </>
                        ) : (
                          <span className="text-[var(--color-ember)]">
                            déjà la prioritaire — aucun secondaire.
                          </span>
                        )}
                      </>
                    ) : (
                      <>sans essence de boss, elle reste mono-stat.</>
                    )}
                  </p>
                  {/* CE QUE VAUT CHAQUE RARETÉ (tableau partagé avec la Forge et la
                      Joaillerie). La fourchette ne donne que les deux bouts ; ici
                      chaque rareté est en face de sa proba et de ses stats. */}
                  <RarityStatTable
                    masteryLevel={relic.level}
                    columns={statColumns}
                    rows={byRarity.map((r) => ({
                      rarity: r.rarity,
                      cells: [
                        r.atk > 0 ? `+${r.atk}` : null,
                        r.def > 0 ? `+${r.def}` : null,
                        r.hp > 0 ? `+${r.hp}` : null,
                      ],
                    }))}
                    chanceOf={(rarity) => Math.round(((oddsWeights[rarity as keyof typeof oddsWeights] ?? 0) / oddsTotal) * 100)}
                  />
                </>
              )}

              {recipe && (
                <RecipeCost recipe={recipe} res={res} gold={gold} signatureKeys={signatureKeys} />
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
              </div>
            )}

            {autoLog.length > 0 && (
              <AutoLog log={autoLog} reached={reached} target={target} running={auto} verb="relique" line={statLine} />
            )}
          </section>

          {/* Poste de consécration */}
          <section className="space-y-3">
            <RelicAltar ritual={ritual} />

            {ritual.crafted ? (
              <CraftedPanel
                item={ritual.crafted}
                xp={ritual.gainedXp}
                xpLabel="XP de reliquaire"
                againLabel="Façonner la même chose"
                onAgain={resetResult}
              >
                <div className="mt-1 text-xs text-[var(--color-muted)]">{statLine(ritual.crafted)}</div>
              </CraftedPanel>
            ) : (
              <p className="text-center text-[11px] text-[var(--color-muted)]">
                {!affordable
                  ? 'Ressources insuffisantes pour cette recette.'
                  : ritual.inFlight || ritual.pending
                    ? 'La relique résiste… continue de consacrer.'
                    : 'Clique l’autel pour consacrer la relique.'}
              </p>
            )}

            {(ritual.error ?? autoError) && (
              <p className="text-center text-sm text-[var(--color-ember)]">{ritual.error ?? autoError}</p>
            )}

            {!setMode && (
              <AutoGate
                unlocked={autoOk}
                unlockLevel={AUTO_RELIC_UNLOCK_LEVEL}
                level={relic.level}
                label="Auto-façonnage"
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

function statLine(it: CraftedItem): string {
  return [
    it.atk_bonus ? `+${it.atk_bonus} ATK` : null,
    it.def_bonus ? `+${it.def_bonus} DEF` : null,
    it.hp_bonus ? `+${it.hp_bonus} PV` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Une stat de relique : la prioritaire est mise en avant, les autres s'effacent. */
function RelicRange({
  kind,
  lo,
  hi,
  primary,
}: {
  kind: RelicStat;
  lo: number;
  hi: number;
  primary: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${primary ? 'font-semibold' : 'opacity-60'}`}>
      <StatOut kind={kind} label={RELIC_STAT_LABEL[kind]} text={`${lo}–${hi}`} />
      {primary && (
        <span className="chip bg-[var(--color-arcane)]/15 text-[9px] font-semibold text-[var(--color-arcane)]">
          prioritaire
        </span>
      )}
    </span>
  );
}

function PlanCard({
  active,
  onClick,
  icon,
  label,
  sub,
  tone,
  primary,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub: string;
  tone?: 'gold';
  primary?: RelicStat;
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
      }`}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-[var(--color-ink)]">{label}</span>
        {/* Les 3 modèles donnent les mêmes stats : la prioritaire EST le critère. */}
        {primary && (
          <span className="mt-0.5 inline-flex chip bg-white/5 text-[9px]" style={{ color: STAT_TINT[primary] }}>
            {RELIC_STAT_LABEL[primary]} prioritaire
          </span>
        )}
        <span className="block truncate text-[10px] text-[var(--color-muted)]">{sub}</span>
      </span>
    </button>
  );
}

/* --------------------------------------------------------------------- autel */

const SPARKS = Array.from({ length: 12 }, (_, i) => {
  const ang = -Math.PI / 2 + (((i % 6) - 2.5) / 2.5) * (Math.PI / 2.4);
  const dist = 28 + (i % 4) * 11;
  return { sx: `${Math.round(Math.cos(ang) * dist)}px`, sy: `${Math.round(Math.sin(ang) * dist)}px` };
});

/**
 * L'autel EST le bouton : on le clique pour consacrer. La lueur monte à chaque
 * passe qui ne termine pas la relique — pendant de l'enclume et de l'établi.
 */
function RelicAltar({ ritual }: { ritual: Ritual }) {
  const { hits, pending, crafted, burstKey, canStrike, inFlight, strike } = ritual;
  const fx = crafted ? (REVEAL_FX[crafted.rarity] ?? REVEAL_FX.poor!) : null;
  const heat = Math.min(1, hits / MAX_HITS);
  const idle = !crafted && hits === 0 && !inFlight && !pending;
  const disabled = !canStrike;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={strike}
        disabled={disabled}
        aria-label="Consacrer la relique"
        className={`relative mx-auto block aspect-square w-full max-w-[300px] overflow-hidden rounded-xl border bg-gradient-to-b from-black/45 to-black/10 transition ${
          disabled
            ? 'cursor-default border-[var(--color-edge)] opacity-80'
            : `cursor-pointer border-[var(--color-edge)] hover:border-[var(--color-gold-soft)]/60 ${idle ? 'anim-pulse' : ''}`
        } ${crafted && fx?.quake ? 'forge-quake' : ''}`}
      >
        {/* Lueur : monte avec le nombre de passes encaissées. */}
        <span
          aria-hidden
          className="forge-heat pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle at 50% 58%, rgba(167,139,250,${(0.22 + heat * 0.4).toFixed(2)}), transparent ${58 + heat * 12}%)`,
          }}
        />

        {/* Passe de consécration : remontée à chaque clic pour rejouer l'animation. */}
        <span key={hits} className={hits > 0 && !crafted ? 'relic-hit' : ''}>
          <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" aria-hidden>
            <defs>
              <radialGradient id="relicSealGrad">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="45%" stopColor="#c4b5fd" />
                <stop offset="100%" stopColor="rgba(167,139,250,0)" />
              </radialGradient>
              <linearGradient id="relicIdolGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ddd6fe" />
                <stop offset="100%" stopColor="#7c5cd6" />
              </linearGradient>
            </defs>
            {/* socle de l'autel : marches + plateau */}
            <rect x="46" y="172" width="108" height="9" rx="3" fill="#2c2823" />
            <rect x="58" y="160" width="84" height="12" rx="3" fill="#3b3630" />
            <rect x="66" y="150" width="68" height="10" rx="3" fill="#4a443c" />
            <rect x="66" y="150" width="68" height="3" rx="1.5" fill="#5f584e" />
            {/* sceau gravé sur le plateau */}
            <circle className="relic-seal" cx="100" cy="128" r="30" fill="url(#relicSealGrad)" />
            {/* la relique, qui s'abaisse sur le socle */}
            <g className="relic-idol">
              <polygon points="100,96 116,120 100,150 84,120" fill="url(#relicIdolGrad)" />
              <polygon points="100,96 116,120 100,120" fill="#ffffff" opacity="0.24" />
              <polygon points="100,96 84,120 100,120" fill="#000000" opacity="0.14" />
              <circle cx="100" cy="120" r="5" fill="#fef3c7" opacity="0.9" />
            </g>
          </svg>
          <span className="pointer-events-none absolute left-1/2 top-[62%]">
            {SPARKS.map((s, i) => (
              <span
                key={i}
                className="forge-spark absolute h-1 w-1 rounded-full"
                style={
                  { ['--sx']: s.sx, ['--sy']: s.sy, background: i % 2 ? '#c4b5fd' : '#fef3c7' } as React.CSSProperties
                }
              />
            ))}
          </span>
        </span>

        {crafted && <RevealBurst rarity={crafted.rarity} burstKey={burstKey} />}

        {idle && (
          <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] font-semibold text-[var(--color-gold-soft)]">
            Consacre la relique
          </span>
        )}
      </button>

      {(hits > 0 || pending) && !crafted && <HitGauge hits={hits} />}
    </div>
  );
}
