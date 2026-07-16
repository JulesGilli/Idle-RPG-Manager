import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useResources } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';
import {
  FORGE_MATERIALS,
  FORGE_BASES,
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
} from '@shared/progression/sets';
import { useForge, type CraftedItem } from './useForge';
import { Ingredient, StatOut, setBonusLine, STAT_TINT } from './craftUi';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon, ItemTypeIcon, SetPieceIcon } from '@/components/synty/GameIcons';
import { forgeBaseUrl, rarityHex } from '@/lib/synty';

const RARITY_ORDER = ['poor', 'common', 'uncommon', 'advanced', 'ultimate'] as const;
type RarityKey = (typeof RARITY_ORDER)[number];
const rarityRank = (r: string): number => RARITY_ORDER.indexOf(r as RarityKey);
const AUTO_TARGETS: RarityKey[] = ['uncommon', 'advanced', 'ultimate'];
const AUTO_MAX_ATTEMPTS = 300;

/**
 * Coups de marteau nécessaires pour révéler la pièce, selon sa rareté.
 * C'est le cœur du rituel : le joueur ignore combien de coups il lui reste. Un
 * coup qui ne termine pas la pièce, c'est qu'elle vaut mieux qu'un déchet — la
 * tension MONTE au lieu de se dévoiler d'un bloc.
 */
const HITS_BY_RARITY: Record<string, number> = {
  poor: 1,
  common: 2,
  uncommon: 3,
  advanced: 4,
  ultimate: 5,
};
const MAX_HITS = 5;

/** Intensité du reveal selon la rareté : un ultime se fait attendre et éclate. */
const REVEAL_FX: Record<string, { burstMs: number; scale: number; quake: boolean }> = {
  poor: { burstMs: 380, scale: 1.2, quake: false },
  common: { burstMs: 480, scale: 1.5, quake: false },
  uncommon: { burstMs: 650, scale: 1.9, quake: false },
  advanced: { burstMs: 850, scale: 2.4, quake: true },
  ultimate: { burstMs: 1200, scale: 3.2, quake: true },
};

/** Si le joueur lâche l'enclume, la pièce se révèle seule : elle lui est déjà acquise. */
const ABANDON_MS = 2600;

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
  const { craft, craftSet } = useForge();

  const [step, setStep] = useState<Step>(1);
  const [mode, setPlanMode] = useState<PlanMode>('weapon');
  // La Forge ne fait QUE les armes et les armures : les bijoux vont à la
  // Joaillerie, les reliques à l'Autel.
  const setPieces = useMemo(() => setPiecesForWorkshop('forge'), []);
  const slot: 'weapon' | 'armor' = mode === 'set' ? 'weapon' : mode;
  const bases = useMemo(() => FORGE_BASES.filter((b) => b.itemType === slot), [slot]);
  const materials = useMemo(
    () => [...FORGE_MATERIALS].sort((a, b) => a.craftTier - b.craftTier || a.zone - b.zone),
    [],
  );

  const [baseId, setBaseId] = useState<string>(FORGE_BASES.find((b) => b.itemType === 'weapon')?.id ?? '');
  const [materialId, setMaterialId] = useState<string>('chene');
  const [setPieceId, setSetPieceId] = useState<string | null>(null);

  const [target, setTarget] = useState<RarityKey>('advanced');
  const [auto, setAuto] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [autoLog, setAutoLog] = useState<CraftedItem[]>([]);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [reached, setReached] = useState(false);

  // --- état de l'enclume -----------------------------------------------------
  const [hits, setHits] = useState(0); // coups portés sur la pièce en cours
  const [pending, setPending] = useState<CraftedItem | null>(null); // reçue, pas encore révélée
  const [crafted, setCrafted] = useState<CraftedItem | null>(null); // révélée
  const [gainedXp, setGainedXp] = useState<number | null>(null);
  const [burstKey, setBurstKey] = useState(0);
  const [inFlight, setInFlight] = useState(false);
  const pendingXpRef = useRef<number | null>(null);

  const stopRef = useRef(false);
  const mountedRef = useRef(true);
  const abandonRef = useRef<number | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopRef.current = true;
      if (abandonRef.current) window.clearTimeout(abandonRef.current);
    };
  }, []);

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

  const resetResult = useCallback(() => {
    if (abandonRef.current) window.clearTimeout(abandonRef.current);
    setCrafted(null);
    setPending(null);
    setHits(0);
    setAutoError(null);
    setReached(false);
    setAttempts(0);
    setAutoLog([]);
    setGainedXp(null);
    pendingXpRef.current = null;
  }, []);

  function switchMode(m: PlanMode) {
    setPlanMode(m);
    if (m === 'set') setSetPieceId((cur) => cur ?? setPieces[0]?.id ?? null);
    else {
      setBaseId(FORGE_BASES.find((b) => b.itemType === m)?.id ?? '');
      setSetPieceId(null);
    }
    resetResult();
  }

  // ------------------------------------------------------------- reveal / anvil
  const reveal = useCallback((item: CraftedItem) => {
    if (abandonRef.current) window.clearTimeout(abandonRef.current);
    setPending(null);
    setHits(0);
    setCrafted(item);
    setGainedXp(pendingXpRef.current);
    setBurstKey((k) => k + 1);
  }, []);

  // ----------------------------------------------------------------- preview
  const ranges = craftRanges(base, mat);
  const weaponPassive = setMode ? null : weaponPassiveFor(base, mat);
  const setStats = piece ? craftSetPieceStats(piece, mat) : null;
  const setRecipe = piece ? setPieceRecipe(piece, mat) : null;
  const setDef = piece ? SETS.find((s) => s.id === piece.setId) : null;
  const recipe = setMode ? setRecipe : { gold: mat.gold, materials: mat.materials };
  const affordable = recipe
    ? gold >= recipe.gold && recipe.materials.every((m) => (res[m.key] ?? 0) >= m.qty)
    : false;
  const zoneKeys = new Set(mat.materials.map((x) => x.key));
  const setExtras = setRecipe ? setRecipe.materials.filter((m) => !zoneKeys.has(m.key)) : [];
  const busy = auto || inFlight;
  /** Peut-on ENTAMER une nouvelle pièce ? (ressources, pas d'auto en cours…) */
  const canStart = affordable && !auto && (!setMode || !!piece);
  /** Une pièce est sur l'enclume : les coups suivants ne coûtent rien de plus. */
  const inProgress = hits > 0 || !!pending || inFlight;
  /** On martèle tant que la pièce n'est pas révélée — y compris pendant que la
      requête est en vol : c'est justement là que « le métal résiste ». */
  const canStrike = !crafted && (inProgress || canStart);
  const planLabel = setMode ? (piece?.label ?? '—') : base.label;

  /** Un coup de marteau : lance le craft au 1er coup, avance le reveal ensuite. */
  function strike() {
    if (crafted) return;
    const first = !inProgress;
    if (first && !canStart) return;
    const n = hits + 1;
    setHits(n);

    // 1er coup : on lance la requête. Les suivants ne font qu'avancer le reveal.
    if (first) {
      setAutoError(null);
      setInFlight(true);
      const req = setMode
        ? piece
          ? craftSet.mutateAsync({ pieceId: piece.id, materialId: mat.id }).then((r) => ({ item: r.item, xp: null }))
          : null
        : craft
            .mutateAsync({ baseId: base.id, materialId: mat.id })
            .then((r) => ({ item: r.item, xp: r.forge_xp ?? null }));
      if (!req) {
        setInFlight(false);
        return;
      }
      void req
        .then(({ item, xp }: { item: CraftedItem; xp: number | null }) => {
          if (!mountedRef.current) return;
          setInFlight(false);
          pendingXpRef.current = xp;
          setPending(item);
        })
        .catch((e: unknown) => {
          if (!mountedRef.current) return;
          setInFlight(false);
          setHits(0);
          setAutoError(e instanceof Error ? e.message : 'Erreur');
        });
      return;
    }

    if (pending && n >= (HITS_BY_RARITY[pending.rarity] ?? 1)) reveal(pending);
  }

  // La pièce est acquise dès la réponse serveur : si le joueur a déjà assez
  // frappé (réponse lente), ou s'il lâche l'enclume, on révèle sans rien retirer.
  useEffect(() => {
    if (!pending) return;
    if (hits >= (HITS_BY_RARITY[pending.rarity] ?? 1)) {
      reveal(pending);
      return;
    }
    abandonRef.current = window.setTimeout(() => reveal(pending), ABANDON_MS);
    return () => {
      if (abandonRef.current) window.clearTimeout(abandonRef.current);
    };
  }, [pending, hits, reveal]);

  // ---------------------------------------------------------------- auto-forge
  async function runAuto(): Promise<void> {
    if (auto || !autoOk) return;
    resetResult();
    stopRef.current = false;
    setAuto(true);
    let n = 0;
    const log: CraftedItem[] = [];
    try {
      while (!stopRef.current && n < AUTO_MAX_ATTEMPTS) {
        const r = await craft.mutateAsync({ baseId: base.id, materialId: mat.id });
        n += 1;
        log.push(r.item);
        setAttempts(n);
        setAutoLog([...log]);
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

  return (
    <div className="space-y-4">
      <Stepper step={step} onStep={setStep} planLabel={planLabel} matLabel={mat.label} />

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
              const r = piece ? setPieceRecipe(piece, m) : { gold: m.gold, materials: m.materials };
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
            {autoLog.length > 0 && <AutoLog log={autoLog} reached={reached} target={target} running={auto} />}
          </section>

          {/* Poste de forge */}
          <section className="space-y-3">
            <ForgeAnvil
              hits={hits}
              pending={pending}
              crafted={crafted}
              burstKey={burstKey}
              canStrike={canStrike}
              inFlight={inFlight}
              onStrike={strike}
            />

            {crafted ? (
              <CraftedPanel item={crafted} xp={gainedXp} onAgain={resetResult} />
            ) : (
              <p className="text-center text-[11px] text-[var(--color-muted)]">
                {!affordable
                  ? 'Ressources insuffisantes pour cette recette.'
                  : inFlight || pending
                    ? 'Le métal résiste… continue de frapper.'
                    : 'Clique l’enclume pour frapper le fer.'}
              </p>
            )}

            {autoError && <p className="text-center text-sm text-[var(--color-ember)]">{autoError}</p>}

            {/* Auto-forge : récompense de la maîtrise, pas un raccourci. */}
            {!setMode && (
              <div className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-2.5">
                {autoOk ? (
                  <div className="space-y-2">
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
                    </div>
                    {auto ? (
                      <button onClick={() => (stopRef.current = true)} className="btn btn-ghost w-full text-sm">
                        ⏹ Stop ({attempts})
                      </button>
                    ) : (
                      <button
                        onClick={() => void runAuto()}
                        disabled={!affordable || busy}
                        className="btn btn-ghost w-full text-sm"
                        title={`Reforge en boucle jusqu'à « ${rarityMeta(target).label} » ou mieux`}
                      >
                        ⚙ Auto → {rarityMeta(target).label}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[11px] text-[var(--color-muted)]">
                    <UiIcon name="forge" size={13} color="var(--color-muted)" />
                    <span>
                      <strong className="text-[var(--color-ink)]/80">Auto-forge</strong> — débloquée à la maîtrise Nv.
                      {AUTO_FORGE_UNLOCK_LEVEL} (tu es Nv.{forge.level}).
                    </span>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- pièces */

function Stepper({
  step,
  onStep,
  planLabel,
  matLabel,
}: {
  step: Step;
  onStep: (s: Step) => void;
  planLabel: string;
  matLabel: string;
}) {
  const items: { n: Step; label: string; value?: string }[] = [
    { n: 1, label: 'Le plan', value: planLabel },
    { n: 2, label: 'Le matériau', value: matLabel },
    { n: 3, label: 'Forger' },
  ];
  return (
    <div className="flex items-center gap-1">
      {items.map((it, i) => {
        const active = step === it.n;
        return (
          <div key={it.n} className="flex flex-1 items-center gap-1">
            <button
              onClick={() => onStep(it.n)}
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                active
                  ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/10'
                  : 'border-[var(--color-edge)] bg-black/20 hover:border-white/25'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  active
                    ? 'bg-[var(--color-arcane)] text-white'
                    : 'bg-[var(--color-arcane)]/20 text-[var(--color-arcane)]'
                }`}
              >
                {it.n}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-[var(--color-ink)]">{it.label}</span>
                {it.value && <span className="block truncate text-[10px] text-[var(--color-muted)]">{it.value}</span>}
              </span>
            </button>
            {i < items.length - 1 && <span className="shrink-0 text-[var(--color-muted)]">›</span>}
          </div>
        );
      })}
    </div>
  );
}

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
function ForgeAnvil({
  hits,
  pending,
  crafted,
  burstKey,
  canStrike,
  inFlight,
  onStrike,
}: {
  hits: number;
  pending: CraftedItem | null;
  crafted: CraftedItem | null;
  burstKey: number;
  canStrike: boolean;
  inFlight: boolean;
  onStrike: () => void;
}) {
  const fx = crafted ? (REVEAL_FX[crafted.rarity] ?? REVEAL_FX.poor!) : null;
  const heat = Math.min(1, hits / MAX_HITS);
  const idle = !crafted && hits === 0 && !inFlight && !pending;
  const disabled = !canStrike;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onStrike}
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

        {/* Éclat final, teinté et dimensionné par la rareté. */}
        {crafted && fx && (
          <span
            key={burstKey}
            aria-hidden
            className="forge-burst pointer-events-none absolute left-1/2 top-[60%] h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={
              {
                background: `radial-gradient(circle, ${rarityHex(crafted.rarity)}cc 0%, ${rarityHex(crafted.rarity)}44 45%, transparent 70%)`,
                ['--burst-ms']: `${fx.burstMs}ms`,
                ['--burst-scale']: String(fx.scale),
              } as React.CSSProperties
            }
          />
        )}

        {idle && (
          <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] font-semibold text-[var(--color-gold-soft)]">
            Frappe le fer
          </span>
        )}
      </button>

      {/* Jauge de coups : on ne dit JAMAIS combien il en reste. */}
      {(hits > 0 || pending) && !crafted && (
        <div className="flex items-center justify-center gap-1.5">
          {Array.from({ length: MAX_HITS }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i < hits ? 'w-6 bg-[var(--color-gold-soft)]' : 'w-3 bg-white/10'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Le résultat, SOUS l'enclume — pas par-dessus : on ne masque pas l'atelier. */
function CraftedPanel({ item, xp, onAgain }: { item: CraftedItem; xp: number | null; onAgain: () => void }) {
  const meta = rarityMeta(item.rarity);
  return (
    <div
      className="anim-pop rounded-lg border bg-[var(--color-bg)]/95 p-3 shadow-lg"
      style={{ borderColor: `${rarityHex(item.rarity)}88` }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className={`font-display text-sm font-semibold ${meta.text}`}>{item.name}</span>
        <span className={`chip bg-white/5 text-[10px] ${meta.text}`}>{meta.label}</span>
      </div>
      <div className="mt-1 text-xs text-[var(--color-muted)]">
        {[
          item.atk_bonus ? `+${item.atk_bonus} ATK` : null,
          item.def_bonus ? `+${item.def_bonus} DEF` : null,
          item.hp_bonus ? `+${item.hp_bonus} PV` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </div>
      {xp != null && xp > 0 && (
        <div className="mt-1 text-[11px] text-[var(--color-gold-soft)]">+{xp} XP de maîtrise</div>
      )}
      <button onClick={onAgain} className="btn btn-primary mt-2.5 w-full text-sm">
        Reforger la même chose
      </button>
    </div>
  );
}

/** Ce que l'auto-forge a réellement produit — le vrai reveal du late game. */
function AutoLog({
  log,
  reached,
  target,
  running,
}: {
  log: CraftedItem[];
  reached: boolean;
  target: RarityKey;
  running: boolean;
}) {
  const counts = RARITY_ORDER.map((r) => ({ r, n: log.filter((i) => i.rarity === r).length })).filter((x) => x.n > 0);
  return (
    <div className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display text-xs font-semibold text-[var(--color-ink)]">
          {running ? 'Forge en cours…' : 'Résultat de la série'}
        </span>
        <span className="text-[10px] text-[var(--color-muted)]">
          {log.length} forge{log.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {counts.map(({ r, n }) => (
          <span key={r} className={`chip bg-white/5 text-[10px] ${rarityMeta(r).text}`}>
            {rarityMeta(r).label} ×{n}
          </span>
        ))}
      </div>
      {!running && (
        <p className="mb-2 text-[11px]">
          {reached ? (
            <span className="text-emerald-300">
              ✓ « {rarityMeta(target).label} » atteint en {log.length} forge{log.length > 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-[var(--color-muted)]">Arrêté après {log.length} forges</span>
          )}
        </p>
      )}
      <div className="max-h-40 space-y-1 overflow-y-auto">
        {[...log].reverse().map((it, i) => (
          <div key={`${it.id}-${i}`} className="flex items-center justify-between gap-2 text-[11px]">
            <span className={`truncate ${rarityMeta(it.rarity).text}`}>{it.name}</span>
            <span className="shrink-0 text-[var(--color-muted)]">
              {[
                it.atk_bonus ? `+${it.atk_bonus} ATK` : null,
                it.def_bonus ? `+${it.def_bonus} DEF` : null,
                it.hp_bonus ? `+${it.hp_bonus} PV` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-[var(--color-muted)]/70">Tout est parti dans ton inventaire.</p>
    </div>
  );
}

