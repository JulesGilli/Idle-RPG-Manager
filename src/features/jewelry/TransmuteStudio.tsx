/**
 * ATELIER DE TRANSMUTATION — échanger des gemmes en trop contre celle qu'on vise.
 *
 * Toute la lisibilité tient dans UNE ligne d'équation permanente,
 * « 2 gemmes + 30 composants → 1 gemme », affichée en haut et mise à jour à
 * chaque clic. Les deux listes en dessous ne sont que des sélecteurs : sans
 * cette équation, deux grilles de dix gemmes quasi identiques laissent le
 * joueur incapable de dire laquelle il donne et laquelle il reçoit.
 *
 * Le second repère est la COULEUR, constante d'un bout à l'autre : ce qu'on
 * perd est en `--color-ember` (rouge), ce qu'on gagne en `--color-gold-soft`.
 * L'accent arcane reste réservé à « ceci est sélectionné », pour qu'il ne
 * rentre jamais en concurrence avec le sens perdre/gagner.
 */
import { useMemo, useState } from 'react';
import { useResources, resourceMeta } from '@/hooks/useResources';
import { useForge } from '@/features/forge/useForge';
import { useArc } from '@/features/arc/useArc';
import { gemsForArc } from '@shared/progression/arcMaterials';
import {
  gemTransmuteRecipe,
  zoneFarmMaterialForArc,
  TRANSMUTE_GEM_QTY,
  TRANSMUTE_MATERIAL_QTY,
} from '@shared/progression/transmute';
import { PASSIVE_META, type GemDef } from '@shared/progression/jewelry';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { PassiveIcon } from '@/components/synty/GameIcons';

export function TransmuteStudio() {
  const { data: resources } = useResources();
  const { currentArc } = useArc();
  const { transmuteGem } = useForge();

  const gems = useMemo(() => gemsForArc(currentArc), [currentArc]);
  const res: Record<string, number> = resources ?? {};
  const owned = (id: string) => res[id] ?? 0;

  const [targetId, setTargetId] = useState<string>(gems[gems.length - 1]!.id);
  const [pickedSourceId, setPickedSourceId] = useState<string | null>(null);
  const [done, setDone] = useState<GemDef | null>(null);
  const [error, setError] = useState<string | null>(null);

  const target = gems.find((g) => g.id === targetId) ?? gems[0]!;

  /**
   * Gemme sacrifiée par défaut : celle dont le joueur a le PLUS d'exemplaires.
   * C'est presque toujours le choix qu'il ferait — le proposer d'office rend
   * l'écran utilisable en un clic, tout en restant modifiable juste en dessous.
   */
  const autoSource = useMemo(
    () =>
      gems
        .filter((g) => g.id !== target.id && owned(g.id) >= TRANSMUTE_GEM_QTY)
        .sort((a, b) => owned(b.id) - owned(a.id))[0] ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gems, target.id, resources],
  );
  // Un choix explicite prime, SAUF s'il est devenu invalide (le joueur a pris
  // pour cible la gemme qu'il avait choisi de sacrifier). On retombe alors sur
  // l'automatique plutôt que de laisser un état incohérent à l'écran.
  const source =
    (pickedSourceId && pickedSourceId !== target.id
      ? gems.find((g) => g.id === pickedSourceId)
      : null) ?? autoSource;

  const matKey = zoneFarmMaterialForArc(target.zone, currentArc);
  const matOwned = matKey ? owned(matKey) : 0;
  const matOk = matOwned >= TRANSMUTE_MATERIAL_QTY;
  const gemOk = source ? owned(source.id) >= TRANSMUTE_GEM_QTY : false;

  const recipe = source ? gemTransmuteRecipe(source, target, currentArc) : null;
  const canRun = Boolean(recipe) && matOk && gemOk && !transmuteGem.isPending;

  const reset = () => {
    setDone(null);
    setError(null);
  };

  const run = () => {
    if (!source || !canRun) return;
    reset();
    transmuteGem.mutate(
      { gemId: source.id, targetGemId: target.id },
      {
        onSuccess: () => setDone(target),
        onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Transmutation refusée'),
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------- l'équation */}
      <div className="panel space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-4 sm:gap-x-5">
          <Slot
            resKey={source?.id ?? null}
            qty={TRANSMUTE_GEM_QTY}
            label={source?.label ?? 'Aucune gemme en double'}
            have={source ? owned(source.id) : 0}
            ok={gemOk}
            tone="lose"
          />
          <Op>+</Op>
          <Slot
            resKey={matKey}
            qty={TRANSMUTE_MATERIAL_QTY}
            label={matKey ? resourceMeta(matKey).label : '—'}
            have={matOwned}
            ok={matOk}
            tone="lose"
          />
          <Op>→</Op>
          <Slot
            resKey={target.id}
            qty={1}
            label={target.label}
            have={owned(target.id)}
            ok
            tone="gain"
          />
        </div>

        <div className="flex flex-col items-center gap-2">
          <button className="btn btn-primary w-full sm:w-auto" onClick={run} disabled={!canRun}>
            {transmuteGem.isPending ? 'Transmutation…' : `Transmuter en ${target.label}`}
          </button>
          {/* Une seule raison de blocage à la fois, la plus actionnable d'abord. */}
          {!source ? (
            <p className="text-xs text-[var(--color-ember)]">
              Il te faut {TRANSMUTE_GEM_QTY} exemplaires d’une même gemme à sacrifier.
            </p>
          ) : !matOk && matKey ? (
            <p className="text-xs text-[var(--color-ember)]">
              Il te manque {TRANSMUTE_MATERIAL_QTY - matOwned} {resourceMeta(matKey).label} — farme
              la zone {target.zone}.
            </p>
          ) : null}
          {done ? (
            <p className="text-xs font-semibold text-[var(--color-gold-soft)]">
              +1 {done.label} ajoutée à tes ressources.
            </p>
          ) : null}
          {error ? <p className="text-xs text-[var(--color-ember)]">{error}</p> : null}
        </div>
      </div>

      {/* ------------------------------------------------- 1. ce qu'on veut */}
      <Section
        step={1}
        title="La gemme que tu veux"
        hint={`Sa zone décide du composant à payer (${TRANSMUTE_MATERIAL_QTY} unités).`}
        tone="gain"
      >
        {gems.map((g) => (
          <GemTile
            key={g.id}
            gem={g}
            owned={owned(g.id)}
            active={g.id === target.id}
            tone="gain"
            onClick={() => {
              setTargetId(g.id);
              reset();
            }}
          />
        ))}
      </Section>

      {/* --------------------------------------------- 2. ce qu'on sacrifie */}
      <Section
        step={2}
        title="Les gemmes que tu sacrifies"
        hint={`${TRANSMUTE_GEM_QTY} exemplaires d’une même gemme, n’importe laquelle.`}
        tone="lose"
      >
        {gems
          .filter((g) => g.id !== target.id)
          .map((g) => (
            <GemTile
              key={g.id}
              gem={g}
              owned={owned(g.id)}
              active={g.id === source?.id}
              tone="lose"
              need={TRANSMUTE_GEM_QTY}
              onClick={() => {
                setPickedSourceId(g.id);
                reset();
              }}
            />
          ))}
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ pièces */

type Tone = 'lose' | 'gain';

/** Une case de l'équation : icône, quantité exigée, et ce qu'on possède. */
function Slot({
  resKey,
  qty,
  label,
  have,
  ok,
  tone,
}: {
  resKey: string | null;
  qty: number;
  label: string;
  have: number;
  ok: boolean;
  tone: Tone;
}) {
  const ring = ok
    ? tone === 'gain'
      ? 'border-[var(--color-gold-soft)]/60 bg-[var(--color-gold-soft)]/10'
      : 'border-[var(--color-edge-strong)] bg-black/25'
    : 'border-[var(--color-ember)]/70 bg-[var(--color-ember)]/10';
  return (
    <span className="flex w-[92px] flex-col items-center gap-1 text-center">
      <span className={`relative flex h-14 w-14 items-center justify-center rounded-xl border ${ring}`}>
        {resKey ? <ResourceIcon resKey={resKey} size={30} /> : <span className="text-xl">?</span>}
        <span
          className={`absolute -bottom-1.5 rounded-full px-1.5 py-px text-[10px] font-bold ${
            tone === 'gain'
              ? 'bg-[var(--color-gold-soft)] text-black'
              : 'bg-[var(--color-panel-2)] text-[var(--color-ink)]'
          }`}
        >
          ×{qty}
        </span>
      </span>
      <span className="mt-1 text-[10px] leading-tight text-[var(--color-ink)]/85">{label}</span>
      <span
        className={`text-[10px] leading-none ${
          ok ? 'text-[var(--color-muted)]' : 'text-[var(--color-ember)]'
        }`}
      >
        {tone === 'gain' ? `tu en as ${have}` : `${have} / ${qty}`}
      </span>
    </span>
  );
}

function Op({ children }: { children: string }) {
  return (
    <span className="select-none text-lg font-light text-[var(--color-muted)]">{children}</span>
  );
}

function Section({
  step,
  title,
  hint,
  tone,
  children,
}: {
  step: number;
  title: string;
  hint: string;
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <div className="panel space-y-3 p-4">
      <div className="flex items-baseline gap-2">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
            tone === 'gain'
              ? 'bg-[var(--color-gold-soft)] text-black'
              : 'bg-[var(--color-ember)] text-black'
          }`}
        >
          {step}
        </span>
        <h4 className="text-sm font-semibold text-[var(--color-ink)]">{title}</h4>
        <span className="text-[11px] text-[var(--color-muted)]">{hint}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{children}</div>
    </div>
  );
}

/**
 * Tuile de gemme. `need` (liste des sacrifices) grise celles qu'on ne possède
 * pas en assez d'exemplaires : impossible de sélectionner un choix que le
 * serveur refuserait.
 */
function GemTile({
  gem,
  owned,
  active,
  tone,
  need,
  onClick,
}: {
  gem: GemDef;
  owned: number;
  active: boolean;
  tone: Tone;
  need?: number;
  onClick: () => void;
}) {
  const meta = PASSIVE_META[gem.passive];
  const short = need != null && owned < need;
  const ring = active
    ? tone === 'gain'
      ? 'border-[var(--color-gold-soft)] bg-[var(--color-gold-soft)]/10'
      : 'border-[var(--color-ember)] bg-[var(--color-ember)]/10'
    : 'border-[var(--color-edge)] bg-black/20 hover:border-[var(--color-edge-strong)]';
  return (
    <button
      onClick={onClick}
      disabled={short}
      title={short ? `Il t’en faut ${need}` : meta.desc}
      className={`flex items-center gap-2 rounded-lg border p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${ring}`}
    >
      <ResourceIcon resKey={gem.id} size={24} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-1">
          <span className="truncate text-xs font-semibold text-[var(--color-ink)]">{gem.label}</span>
          <span
            className={`shrink-0 text-[10px] font-semibold ${
              short ? 'text-[var(--color-ember)]' : 'text-[var(--color-gold-soft)]'
            }`}
          >
            ×{owned}
          </span>
        </span>
        <span className="flex items-center gap-1 truncate text-[10px] text-[var(--color-muted)]">
          <PassiveIcon passive={gem.passive} size={10} /> {gem.passiveLabel} · zone {gem.zone}
        </span>
      </span>
    </button>
  );
}
