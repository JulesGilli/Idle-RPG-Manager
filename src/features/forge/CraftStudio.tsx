import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useResources } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';
import {
  FORGE_BASES,
  craftRecipe,
  craftRanges,
  craftRarityWeights,
  forgeLevelInfo,
  autoForgeUnlocked,
  baseProfile,
  weaponPassiveSpec,
  weaponPassiveFor,
  AUTO_FORGE_UNLOCK_LEVEL,
  TYPE_BONUS_LABEL,
  WEAPON_PASSIVE_LABEL,
  type StatKey,
  type WeaponTypeBonus,
  type WeaponPassiveType,
} from '@shared/progression/forge';
import {
  SETS,
  setPiecesForWorkshop,
  setPieceRecipe,
  craftSetPieceStats,
  describeSetEffect,
  setEffectAt,
  setPieceWrongArc,
} from '@shared/progression/sets';
import { useArc } from '@/features/arc/useArc';
import { forgeMaterialsForArc, bossMaterialForArc } from '@shared/progression/arcMaterials';
import { tierGearMult, scaleRecipeForArc } from '@shared/progression/arc';
import { ArcCraftNotice, ArcSetsEmpty } from '@/features/arc/ArcCraftNotice';
import { useForge, type CraftedItem } from './useForge';
import { Ingredient, StatOut, setBonusLine, BossPicker, STAT_TINT, scaleStats } from './craftUi';
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
  RARITY_ORDER,
  type AutoTarget,
  type Ritual,
} from './craftRitual';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon, ItemTypeIcon, SetPieceIcon } from '@/components/synty/GameIcons';
import { forgeBaseUrl } from '@/lib/synty';

const WEIGHT_LABEL: Record<string, string> = { light: 'Léger', medium: 'Moyen', heavy: 'Lourd' };
type ResMap = Record<string, number>;
type PlanMode = 'weapon' | 'armor' | 'set';
type Step = 1 | 2 | 3;

/**
 * ATELIER DE FORGE (arme/armure) — rituel en 3 temps :
 *  1. le plan (arme, armure, ou pièce de set — le set EST un plan, pas une option),
 *  2. le matériau de zone (fixe la zone, le tier et la puissance),
 *  3. l'enclume : le joueur FRAPPE lui-même, autant de fois que la pièce le mérite.
 *
 * La recette posée, on reste sur l'enclume : reforger ne repasse pas par le
 * rituel. C'est ce qui rend le late game (~60 crafts/jour) tenable — et à
 * partir du Nv.8 de maîtrise, l'auto-forge prend le relais.
 */
export function CraftStudio() {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { craft, craftSet, autoCraft } = useForge();
  const { currentArc } = useArc();

  const [step, setStep] = useState<Step>(1);
  const [mode, setPlanMode] = useState<PlanMode>('weapon');
  // La Forge ne fait QUE les armes et les armures : les bijoux vont à la
  // Joaillerie, les reliques à l'Autel. Seuls les sets de l'ARC COURANT sont
  // proposés — un set d'un autre arc a disparu du catalogue, pas juste caché.
  const setPieces = useMemo(
    () => setPiecesForWorkshop('forge').filter((p) => !setPieceWrongArc(p.id, currentArc)),
    [currentArc],
  );
  const slot: 'weapon' | 'armor' = mode === 'set' ? 'weapon' : mode;
  const bases = useMemo(() => FORGE_BASES.filter((b) => b.itemType === slot), [slot]);
  const materials = useMemo(
    () => [...forgeMaterialsForArc(currentArc)].sort((a, b) => a.craftTier - b.craftTier || a.zone - b.zone),
    [currentArc],
  );

  const [baseId, setBaseId] = useState<string>(FORGE_BASES.find((b) => b.itemType === 'weapon')?.id ?? '');
  const [materialId, setMaterialId] = useState<string>('chene');
  const [setPieceId, setSetPieceId] = useState<string | null>(null);
  /** Essence de boss choisie — `null` = aucune, donc aucune stat secondaire. */
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
  const forge = forgeLevelInfo(profile?.forge_xp ?? 0);
  const autoOk = autoForgeUnlocked(forge.level);
  const oddsWeights = craftRarityWeights(forge.level);
  const oddsTotal = Object.values(oddsWeights).reduce((s, w) => s + w, 0);

  const base = bases.find((b) => b.id === baseId) ?? bases[0]!;
  const mat = materials.find((m) => m.id === materialId) ?? materials[0]!;
  const setMode = mode === 'set';
  const piece = setMode ? (setPieces.find((p) => p.id === setPieceId) ?? null) : null;

  // Une pièce de set ne choisit pas son essence : sa recette est signée.
  // L'essence est résolue DANS L'ARC : en arc 2 c'est le Cœur flétri, pas le
  // Cœur sylvestre — le serveur ne connaît que le catalogue de l'arc courant.
  const boss = setMode ? null : bossKey ? (bossMaterialForArc(bossKey, currentArc) ?? null) : null;

  // ----------------------------------------------------------------- preview
  // ⚠️ Les fourchettes de `craftRanges` sont les stats de BASE, avant le
  // multiplicateur d'arc — c'est le serveur qui l'applique au craft. Les
  // afficher telles quelles annonçait 55-94 en arc 2 pour un objet livré 16 fois
  // plus fort, et faisait paraître un T2 zone 1 plus faible qu'un T1 zone 10.
  const tm = tierGearMult(currentArc);
  const rawRanges = craftRanges(base, mat, boss);
  const ranges = {
    atk: [Math.round(rawRanges.atk[0] * tm), Math.round(rawRanges.atk[1] * tm)] as [number, number],
    def: [Math.round(rawRanges.def[0] * tm), Math.round(rawRanges.def[1] * tm)] as [number, number],
    hp: [Math.round(rawRanges.hp[0] * tm), Math.round(rawRanges.hp[1] * tm)] as [number, number],
  };
  const weaponPassive = setMode ? null : weaponPassiveFor(base, mat);
  const setStats = piece ? scaleStats(craftSetPieceStats(piece, mat), tm) : null;
  // Recettes telles que le SERVEUR les facturera : `forgeCostMult` inclus. Sans
  // ça l'atelier annonçait 16 composants là où l'arc 2 en prélève 40.
  const setRecipe = piece ? scaleRecipeForArc(setPieceRecipe(piece, mat), currentArc) : null;
  const setDef = piece ? SETS.find((s) => s.id === piece.setId) : null;
  const recipe = setMode ? setRecipe : scaleRecipeForArc(craftRecipe(mat, boss), currentArc);
  const affordable = recipe
    ? gold >= recipe.gold && recipe.materials.every((m) => (res[m.key] ?? 0) >= m.qty)
    : false;
  const zoneKeys = new Set(mat.materials.map((x) => x.key));
  const setExtras = setRecipe ? setRecipe.materials.filter((m) => !zoneKeys.has(m.key)) : [];
  /** Peut-on ENTAMER une nouvelle pièce ? (ressources, pas d'auto en cours…) */
  const canStart = affordable && !auto && (!setMode || !!piece);
  const planLabel = setMode ? (piece?.label ?? '—') : base.label;

  // Le rituel : un coup lance la forge, les suivants font monter la révélation.
  const ritual = useCraftRitual(
    useCallback(
      () =>
        setMode
          ? craftSet.mutateAsync({ pieceId: piece!.id, materialId: mat.id }).then((r) => ({ item: r.item, xp: null }))
          : craft
              .mutateAsync({ baseId: base.id, materialId: mat.id, bossMaterialId: boss?.key ?? null })
              .then((r) => ({ item: r.item, xp: r.forge_xp ?? null })),
      [setMode, piece, mat.id, base.id, boss, craft, craftSet],
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
    else {
      setBaseId(FORGE_BASES.find((b) => b.itemType === m)?.id ?? '');
      setSetPieceId(null);
    }
    resetResult();
  }

  // ---------------------------------------------------------------- auto-forge
  // La série tourne CÔTÉ SERVEUR, par lots : un appel enchaîne jusqu'à AUTO_CHUNK
  // crafts. On reste en boucle pour garder le Stop réactif et le journal vivant.
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
          kind: 'weapon',
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
          { n: 2, label: 'Le matériau', value: mat.label },
          { n: 3, label: 'Forger', ...(setMode ? {} : { value: boss?.label ?? 'Sans essence' }) },
        ]}
      />

      {/* ÉTAPE 1 — LE PLAN ---------------------------------------------------- */}
      {step === 1 && (
        <section className="space-y-3">
          <div className="flex gap-2">
            {(
              [
                { id: 'weapon', label: 'Armes' },
                { id: 'armor', label: 'Armures' },
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
                  <ItemTypeIcon type={t.id} size={16} color="currentColor" />
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
                Une pièce de set se forge avec le <strong className="text-[var(--color-ink)]">butin d'expédition</strong>{' '}
                signature : elle sort <strong className="text-[var(--color-ink)]">ultime</strong> à coup sûr et débloque
                un <strong className="text-[var(--color-ink)]">effet de set</strong>.
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
                      sub={`${s?.name ?? ''} · ${p.slot === 'weapon' ? 'Arme' : 'Armure'}`}
                    />
                  );
                })}
              </div>
            </>
            )
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {bases.map((b) => (
                <PlanCard
                  key={b.id}
                  active={b.id === base.id}
                  onClick={() => {
                    setBaseId(b.id);
                    resetResult();
                    setStep(2);
                  }}
                  glyph={forgeBaseUrl(b.id)}
                  label={b.label}
                  sub={WEIGHT_LABEL[b.weight] ?? ''}
                  profile={baseProfile(b)}
                  typeBonus={b.typeBonus ?? null}
                  passive={weaponPassiveSpec(b.id)?.type ?? null}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ÉTAPE 2 — LE MATÉRIAU ------------------------------------------------ */}
      {step === 2 && (
        <section className="space-y-3">
          <p className="text-[11px] text-[var(--color-muted)]">
            Le matériau fixe la <strong className="text-[var(--color-ink)]">zone</strong>, le{' '}
            <strong className="text-[var(--color-ink)]">tier</strong> et la{' '}
            <strong className="text-[var(--color-ink)]">puissance</strong> de la pièce.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {materials.map((m) => {
              const r = scaleRecipeForArc(piece ? setPieceRecipe(piece, m) : { gold: m.gold, materials: m.materials }, currentArc);
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

      {/* ÉTAPE 3 — L'ENCLUME -------------------------------------------------- */}
      {step === 3 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Recette + aperçu */}
          <section className="space-y-3">
            {/* L'essence se choisit SUR l'enclume : la recette posée, on n'en
                repart pas — on veut pouvoir la changer entre deux pièces. */}
            {!setMode && <BossPicker res={res} value={bossKey} onPick={setBossKey} disabled={busy} arc={currentArc} />}
            <div className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-center gap-1">
                <Ingredient
                  glyph={setMode ? undefined : forgeBaseUrl(base.id)}
                  icon={setMode && piece ? <SetPieceIcon pieceId={piece.id} size={24} /> : undefined}
                  label={planLabel}
                  tone={setMode ? 'gold' : undefined}
                />
                <span className="px-0.5 text-[var(--color-muted)]">+</span>
                <Ingredient icon={<ResourceIcon resKey={mat.materials[0]?.key ?? ''} size={24} />} label={mat.label} />
                {boss && (
                  <>
                    <span className="px-0.5 text-[var(--color-muted)]">+</span>
                    <Ingredient icon={<ResourceIcon resKey={boss.key} size={24} />} label={boss.label} />
                  </>
                )}
                <span className="px-1 text-lg font-bold text-[var(--color-gold-soft)]">→</span>
                <Ingredient
                  glyph={setMode ? undefined : forgeBaseUrl(base.id)}
                  icon={setMode && piece ? <SetPieceIcon pieceId={piece.id} size={26} /> : undefined}
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
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {ranges.atk[1] > 0 && <StatOut kind="atk" label="ATK" text={`${ranges.atk[0]}–${ranges.atk[1]}`} />}
                    {ranges.def[1] > 0 && <StatOut kind="def" label="DEF" text={`${ranges.def[0]}–${ranges.def[1]}`} />}
                    {ranges.hp[1] > 0 && <StatOut kind="hp" label="PV" text={`${ranges.hp[0]}–${ranges.hp[1]}`} />}
                    {/* Stat secondaire : sa puissance vient de la ZONE du matériau. */}
                    {weaponPassive && (
                      <span className="chip bg-emerald-400/15 text-[10px] font-semibold text-emerald-300">
                        {WEAPON_PASSIVE_LABEL[weaponPassive.type]} +{weaponPassive.pct}%
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-[var(--color-muted)]">Probas (maîtrise N.{forge.level}) :</span>
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

            {/* Ce que l'auto-forge a réellement produit — le vrai reveal du late game. */}
            {autoLog.length > 0 && (
              <AutoLog log={autoLog} reached={reached} target={target} running={auto} verb="forge" line={statLine} />
            )}
          </section>

          {/* Poste de forge */}
          <section className="space-y-3">
            <ForgeAnvil ritual={ritual} />

            {ritual.crafted ? (
              <CraftedPanel
                item={ritual.crafted}
                xp={ritual.gainedXp}
                xpLabel="XP de maîtrise"
                againLabel="Reforger la même chose"
                onAgain={resetResult}
              >
                <div className="mt-1 text-xs text-[var(--color-muted)]">{statLine(ritual.crafted)}</div>
              </CraftedPanel>
            ) : (
              <p className="text-center text-[11px] text-[var(--color-muted)]">
                {!affordable
                  ? 'Ressources insuffisantes pour cette recette.'
                  : ritual.inFlight || ritual.pending
                    ? 'Le métal résiste… continue de frapper.'
                    : 'Clique l’enclume pour frapper le fer.'}
              </p>
            )}

            {(ritual.error ?? autoError) && (
              <p className="text-center text-sm text-[var(--color-ember)]">{ritual.error ?? autoError}</p>
            )}

            {!setMode && (
              <AutoGate
                unlocked={autoOk}
                unlockLevel={AUTO_FORGE_UNLOCK_LEVEL}
                level={forge.level}
                label="Auto-forge"
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

const STAT_LABEL: Record<StatKey, string> = { atk: 'ATK', def: 'DEF', hp: 'PV' };

function PlanCard({
  active,
  onClick,
  glyph,
  icon,
  label,
  sub,
  tone,
  profile,
  typeBonus,
  passive,
}: {
  active: boolean;
  onClick: () => void;
  glyph?: string;
  icon?: ReactNode;
  label: string;
  sub: string;
  tone?: 'gold';
  profile?: { primary: StatKey; secondary: StatKey | null };
  typeBonus?: WeaponTypeBonus | null;
  passive?: WeaponPassiveType | null;
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
      <span className="mt-0.5 shrink-0">
        {glyph ? <SyntyGlyph src={glyph} size={26} color="var(--color-gold-soft)" title={label} /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-[var(--color-ink)]">{label}</span>
        {/* Le PROFIL du plan : primaire + secondaire. C'est le vrai critère de
            choix, et rien ne l'affichait — les 8 armes se ressemblaient toutes. */}
        {profile ? (
          <span className="mt-0.5 flex flex-wrap items-center gap-1">
            <span className="chip bg-white/5 text-[9px]" style={{ color: STAT_TINT[profile.primary] }}>
              {STAT_LABEL[profile.primary]}
            </span>
            {profile.secondary ? (
              <span
                className="chip bg-white/5 text-[9px] opacity-80"
                style={{ color: STAT_TINT[profile.secondary] }}
              >
                + {STAT_LABEL[profile.secondary]}
              </span>
            ) : passive ? (
              <span className="chip bg-emerald-400/15 text-[9px] text-emerald-300">
                + {WEAPON_PASSIVE_LABEL[passive]}
              </span>
            ) : (
              <span className="chip bg-white/5 text-[9px] text-[var(--color-muted)]">dégâts purs</span>
            )}
            {typeBonus && (
              <span className="chip bg-[var(--color-arcane)]/15 text-[9px] text-[var(--color-arcane)]">
                {TYPE_BONUS_LABEL[typeBonus.kind]} +{Math.round(typeBonus.pct * 100)}%
              </span>
            )}
          </span>
        ) : (
          <span className="block truncate text-[10px] text-[var(--color-muted)]">{sub}</span>
        )}
        {profile && <span className="mt-0.5 block truncate text-[10px] text-[var(--color-muted)]">{sub}</span>}
      </span>
    </button>
  );
}

const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const ang = -Math.PI / 2 + (((i % 7) - 3) / 3) * (Math.PI / 2.2);
  const dist = 30 + (i % 4) * 12;
  return { sx: `${Math.round(Math.cos(ang) * dist)}px`, sy: `${Math.round(Math.sin(ang) * dist)}px`, warm: i % 2 === 0 };
});

/**
 * L'enclume EST le bouton : on la frappe. Le métal chauffe à chaque coup qui ne
 * termine pas la pièce — ce qui, en soi, annonce déjà qu'elle vaut le détour.
 */
function ForgeAnvil({ ritual }: { ritual: Ritual }) {
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
        aria-label="Frapper l'enclume"
        className={`relative mx-auto block aspect-square w-full max-w-[300px] overflow-hidden rounded-xl border bg-gradient-to-b from-black/45 to-black/10 transition ${
          disabled
            ? 'cursor-default border-[var(--color-edge)] opacity-80'
            : `cursor-pointer border-[var(--color-edge)] hover:border-[var(--color-gold-soft)]/60 ${idle ? 'anim-pulse' : ''}`
        } ${crafted && fx?.quake ? 'forge-quake' : ''}`}
      >
        {/* Braises : montent avec le nombre de coups encaissés. */}
        <span
          aria-hidden
          className="forge-heat pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle at 50% 68%, rgba(224,121,60,${(0.28 + heat * 0.4).toFixed(2)}), transparent ${58 + heat * 12}%)`,
          }}
        />

        {/* Coup de marteau : remonté à chaque frappe pour rejouer l'animation. */}
        <span key={hits} className={hits > 0 && !crafted ? 'forge-hit' : ''}>
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
              <rect x="58" y="120" width="84" height="4" rx="2" fill="#5b626c" />
              <rect x="84" y="135" width="32" height="3" fill="#2f343a" />
              <rect x="66" y="169" width="68" height="4" rx="2" fill="#2f343a" />
            </g>
            {/* marteau : dessiné DROIT puis incliné d'un bloc → tête ⊥ manche. */}
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
            <circle className="forge-flash" cx="100" cy="120" r="18" fill="url(#forgeFlashGrad)" />
          </svg>
          <span className="pointer-events-none absolute left-1/2 top-[60%]">
            {SPARKS.map((s, i) => (
              <span
                key={i}
                className="forge-spark absolute h-1 w-1 rounded-full"
                style={
                  { ['--sx']: s.sx, ['--sy']: s.sy, background: s.warm ? '#ff8a3c' : '#ffd27a' } as React.CSSProperties
                }
              />
            ))}
          </span>
        </span>

        {crafted && <RevealBurst rarity={crafted.rarity} burstKey={burstKey} />}

        {idle && (
          <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] font-semibold text-[var(--color-gold-soft)]">
            Frappe le fer
          </span>
        )}
      </button>

      {(hits > 0 || pending) && !crafted && <HitGauge hits={hits} />}
    </div>
  );
}

/** Résumé des stats d'un objet, pour les lignes de résultat. */
function statLine(it: CraftedItem): string {
  return [
    it.atk_bonus ? `+${it.atk_bonus} ATK` : null,
    it.def_bonus ? `+${it.def_bonus} DEF` : null,
    it.hp_bonus ? `+${it.hp_bonus} PV` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
