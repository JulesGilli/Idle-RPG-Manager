import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { rarityMeta } from '@/lib/gameUi';
import { rarityHex } from '@/lib/synty';
import { UiIcon } from '@/components/synty/GameIcons';
import type { CraftedItem } from './useForge';

/**
 * LE RITUEL D'ATELIER — machinerie partagée par la Forge et la Joaillerie.
 *
 * Le principe : le joueur FRAPPE (ou sertit) lui-même, et le nombre de coups
 * dépend de la rareté. Il ignore combien il lui en reste : un coup qui ne
 * termine pas la pièce, c'est qu'elle vaut mieux qu'un déchet — la tension MONTE
 * au lieu de se dévoiler d'un bloc.
 *
 * Les coups sont de la MISE EN SCÈNE : l'objet est acquis dès la réponse du
 * serveur. S'il lâche l'outil, la pièce se révèle seule ; on ne lui retire rien.
 */

export const RARITY_ORDER = ['poor', 'common', 'uncommon', 'advanced', 'ultimate'] as const;
export type RarityKey = (typeof RARITY_ORDER)[number];
export const rarityRank = (r: string): number => RARITY_ORDER.indexOf(r as RarityKey);

export const AUTO_TARGETS: RarityKey[] = ['uncommon', 'advanced', 'ultimate'];
export const AUTO_MAX_ATTEMPTS = 300;

/**
 * Coups nécessaires pour révéler la pièce, selon sa rareté.
 *
 * Le minimum est de DEUX, jamais un : à bas niveau, près d'un craft sur deux
 * sort « médiocre » (cf. FORGE_RARITY_NOVICE), et à un coup ces crafts-là se
 * révélaient dès la première frappe — verdict instantané, aucun rituel. Le
 * suspense manquait précisément à l'early game, là où chaque objet compte, pour
 * n'arriver qu'au niveau maître… juste avant que l'auto ne le supprime. Avec un
 * plancher à deux, la première frappe ne tranche plus jamais : elle engage.
 */
export const HITS_BY_RARITY: Record<string, number> = {
  poor: 2,
  common: 3,
  uncommon: 4,
  advanced: 5,
  ultimate: 6,
};
/** Plancher de coups : sert aussi de repli si une rareté inconnue arrive. */
export const MIN_HITS = 2;
export const MAX_HITS = 6;

/** Intensité du reveal selon la rareté : un ultime se fait attendre et éclate. */
export const REVEAL_FX: Record<string, { burstMs: number; scale: number; quake: boolean }> = {
  poor: { burstMs: 380, scale: 1.2, quake: false },
  common: { burstMs: 480, scale: 1.5, quake: false },
  uncommon: { burstMs: 650, scale: 1.9, quake: false },
  advanced: { burstMs: 850, scale: 2.4, quake: true },
  ultimate: { burstMs: 1200, scale: 3.2, quake: true },
};

/** Si le joueur lâche l'outil, la pièce se révèle seule : elle lui est déjà acquise. */
const ABANDON_MS = 2600;

export type RitualCraft = () => Promise<{ item: CraftedItem; xp: number | null }>;

export type Ritual = {
  hits: number;
  pending: CraftedItem | null;
  crafted: CraftedItem | null;
  gainedXp: number | null;
  burstKey: number;
  inFlight: boolean;
  /** Une pièce est en cours : les coups suivants ne coûtent rien de plus. */
  inProgress: boolean;
  /** On martèle tant que la pièce n'est pas révélée — Y COMPRIS pendant que la
      requête est en vol : c'est justement là que « le métal résiste ». */
  canStrike: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  strike: () => void;
  reset: () => void;
};

/**
 * @param craft    lance la fabrication côté serveur (appelé au 1er coup).
 * @param canStart ressources réunies, pas d'auto en cours… (pour ENTAMER une pièce).
 */
export function useCraftRitual(craft: RitualCraft, canStart: boolean): Ritual {
  const [hits, setHits] = useState(0);
  const [pending, setPending] = useState<CraftedItem | null>(null);
  const [crafted, setCrafted] = useState<CraftedItem | null>(null);
  const [gainedXp, setGainedXp] = useState<number | null>(null);
  const [burstKey, setBurstKey] = useState(0);
  const [inFlight, setInFlight] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingXpRef = useRef<number | null>(null);
  const abandonRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  // Refs : `strike` reste stable alors que craft/canStart changent à chaque rendu.
  const craftRef = useRef(craft);
  craftRef.current = craft;
  const canStartRef = useRef(canStart);
  canStartRef.current = canStart;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abandonRef.current) window.clearTimeout(abandonRef.current);
    };
  }, []);

  const reset = useCallback(() => {
    if (abandonRef.current) window.clearTimeout(abandonRef.current);
    setCrafted(null);
    setPending(null);
    setHits(0);
    setGainedXp(null);
    setError(null);
    pendingXpRef.current = null;
  }, []);

  const reveal = useCallback((item: CraftedItem) => {
    if (abandonRef.current) window.clearTimeout(abandonRef.current);
    setPending(null);
    setHits(0);
    setCrafted(item);
    setGainedXp(pendingXpRef.current);
    setBurstKey((k) => k + 1);
  }, []);

  const inProgress = hits > 0 || !!pending || inFlight;
  const canStrike = !crafted && (inProgress || canStart);

  const strike = useCallback(() => {
    if (crafted) return;
    const first = !(hits > 0 || pending || inFlight);
    if (first && !canStartRef.current) return;
    const n = hits + 1;
    setHits(n);

    // 1er coup : on lance la requête. Les suivants ne font qu'avancer le reveal.
    if (first) {
      setError(null);
      setInFlight(true);
      void craftRef
        .current()
        .then(({ item, xp }) => {
          if (!mountedRef.current) return;
          setInFlight(false);
          pendingXpRef.current = xp;
          setPending(item);
        })
        .catch((e: unknown) => {
          if (!mountedRef.current) return;
          setInFlight(false);
          setHits(0);
          setError(e instanceof Error ? e.message : 'Erreur');
        });
      return;
    }

    if (pending && n >= (HITS_BY_RARITY[pending.rarity] ?? MIN_HITS)) reveal(pending);
  }, [crafted, hits, pending, inFlight, reveal]);

  // La pièce est acquise dès la réponse serveur : si le joueur a déjà assez
  // frappé (réponse lente), ou s'il lâche l'outil, on révèle sans rien retirer.
  useEffect(() => {
    if (!pending) return;
    if (hits >= (HITS_BY_RARITY[pending.rarity] ?? MIN_HITS)) {
      reveal(pending);
      return;
    }
    abandonRef.current = window.setTimeout(() => reveal(pending), ABANDON_MS);
    return () => {
      if (abandonRef.current) window.clearTimeout(abandonRef.current);
    };
  }, [pending, hits, reveal]);

  return {
    hits,
    pending,
    crafted,
    gainedXp,
    burstKey,
    inFlight,
    inProgress,
    canStrike,
    error,
    setError,
    strike,
    reset,
  };
}

/* --------------------------------------------------------------- affichage */

export type StepDef = { n: number; label: string; value?: string | undefined };

/** Fil des étapes du rituel. Reste navigable : la recette posée, on n'y repasse pas. */
export function RitualStepper({
  step,
  onStep,
  steps,
}: {
  step: number;
  onStep: (n: number) => void;
  steps: StepDef[];
}) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((it, i) => {
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
            {i < steps.length - 1 && <span className="shrink-0 text-[var(--color-muted)]">›</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Éclat du dernier coup, teinté et dimensionné par la rareté. */
export function RevealBurst({ rarity, burstKey }: { rarity: string; burstKey: number }) {
  const fx = REVEAL_FX[rarity] ?? REVEAL_FX.poor!;
  return (
    <span
      key={burstKey}
      aria-hidden
      className="forge-burst pointer-events-none absolute left-1/2 top-[60%] h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={
        {
          background: `radial-gradient(circle, ${rarityHex(rarity)}cc 0%, ${rarityHex(rarity)}44 45%, transparent 70%)`,
          ['--burst-ms']: `${fx.burstMs}ms`,
          ['--burst-scale']: String(fx.scale),
        } as React.CSSProperties
      }
    />
  );
}

/** Jauge de coups : on ne dit JAMAIS combien il en reste. */
export function HitGauge({ hits }: { hits: number }) {
  return (
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
  );
}

/** Le résultat, SOUS l'outil — pas par-dessus : on ne masque pas l'atelier. */
export function CraftedPanel({
  item,
  xp,
  xpLabel,
  againLabel,
  onAgain,
  children,
}: {
  item: CraftedItem;
  xp: number | null;
  xpLabel: string;
  againLabel: string;
  onAgain: () => void;
  children?: ReactNode;
}) {
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
      {children}
      {xp != null && xp > 0 && (
        <div className="mt-1 text-[11px] text-[var(--color-gold-soft)]">
          +{xp} {xpLabel}
        </div>
      )}
      <button onClick={onAgain} className="btn btn-primary mt-2.5 w-full text-sm">
        {againLabel}
      </button>
    </div>
  );
}

/** Ce que l'auto a réellement produit — le vrai reveal du late game. */
export function AutoLog({
  log,
  reached,
  target,
  running,
  verb,
  line,
}: {
  log: CraftedItem[];
  reached: boolean;
  target: RarityKey;
  running: boolean;
  /** « forge » / « sertissage » — pour compter dans la bonne langue de l'atelier. */
  verb: string;
  /** Résumé d'une ligne (stats, passif…) : chaque atelier montre ce qui compte chez lui. */
  line: (item: CraftedItem) => string;
}) {
  const counts = RARITY_ORDER.map((r) => ({ r, n: log.filter((i) => i.rarity === r).length })).filter((x) => x.n > 0);
  const plural = log.length > 1 ? 's' : '';
  return (
    <div className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display text-xs font-semibold text-[var(--color-ink)]">
          {running ? 'En cours…' : 'Résultat de la série'}
        </span>
        <span className="text-[10px] text-[var(--color-muted)]">
          {log.length} {verb}
          {plural}
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
              ✓ « {rarityMeta(target).label} » atteint en {log.length} {verb}
              {plural}
            </span>
          ) : (
            <span className="text-[var(--color-muted)]">
              Arrêté après {log.length} {verb}
              {plural}
            </span>
          )}
        </p>
      )}
      <div className="max-h-40 space-y-1 overflow-y-auto">
        {[...log].reverse().map((it, i) => (
          <div key={`${it.id}-${i}`} className="flex items-center justify-between gap-2 text-[11px]">
            <span className={`truncate ${rarityMeta(it.rarity).text}`}>{it.name}</span>
            <span className="shrink-0 text-[var(--color-muted)]">{line(it)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-[var(--color-muted)]/70">Tout est parti dans ton inventaire.</p>
    </div>
  );
}

/**
 * L'auto : RÉCOMPENSE de la maîtrise, pas un raccourci. Tant qu'elle est
 * verrouillée on annonce le palier — le joueur doit savoir qu'elle existe et la viser.
 */
export function AutoGate({
  unlocked,
  unlockLevel,
  level,
  label,
  target,
  onTarget,
  running,
  attempts,
  canRun,
  onRun,
  onStop,
}: {
  unlocked: boolean;
  unlockLevel: number;
  level: number;
  label: string;
  target: RarityKey;
  onTarget: (r: RarityKey) => void;
  running: boolean;
  attempts: number;
  canRun: boolean;
  onRun: () => void;
  onStop: () => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-2.5">
      {unlocked ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
            <span className="text-[var(--color-muted)]">{label} jusqu'à</span>
            {AUTO_TARGETS.map((r) => {
              const meta = rarityMeta(r);
              const active = target === r;
              return (
                <button
                  key={r}
                  onClick={() => onTarget(r)}
                  disabled={running}
                  className={`chip border transition ${
                    active
                      ? `border-current ${meta.text} bg-white/5`
                      : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:border-white/25'
                  } ${running ? 'opacity-60' : ''}`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
          {running ? (
            <button onClick={onStop} className="btn btn-ghost w-full text-sm">
              ⏹ Stop ({attempts})
            </button>
          ) : (
            <button
              onClick={onRun}
              disabled={!canRun}
              className="btn btn-ghost w-full text-sm"
              title={`Recommence en boucle jusqu'à « ${rarityMeta(target).label} » ou mieux`}
            >
              ⚙ Auto → {rarityMeta(target).label}
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[11px] text-[var(--color-muted)]">
          <UiIcon name="forge" size={13} color="var(--color-muted)" />
          <span>
            <strong className="text-[var(--color-ink)]/80">{label}</strong> — débloquée à la maîtrise Nv.
            {unlockLevel} (tu es Nv.{level}).
          </span>
        </div>
      )}
    </div>
  );
}
