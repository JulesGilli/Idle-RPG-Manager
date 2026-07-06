import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { dungeonCooldownRemaining } from '@shared/progression/dungeon';
import { useHeroes, type HeroView } from '@/features/heroes/useHeroes';
import {
  useHeroAvailability,
  heroIsBusy,
  HERO_STATUS_LABEL,
} from '@/features/heroes/useHeroAvailability';
import { classMeta } from '@/lib/gameUi';
import { MAP_ART } from '@/lib/synty';
import { SyntyImg } from '@/components/synty/SyntyIcon';
import { UiIcon, ClassIcon } from '@/components/synty/GameIcons';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import { resourceMeta } from '@/hooks/useResources';
import {
  useDungeonTypes,
  useDungeonCooldowns,
  useRunDungeon,
  useLoanableHeroes,
  type DungeonTypeRow,
  type DungeonCombat,
  type DungeonRunResponse,
  type LoanableHero,
} from './useDungeon';

const MAX_TEAM = 5;

// Ambiance par tier : art de carte Synty + couleur d'accent.
const TIER_META: Record<number, { art: string; accent: string }> = {
  1: { art: MAP_ART.skull, accent: '#5fd39b' },
  2: { art: MAP_ART.monster, accent: '#56b6f4' },
  3: { art: MAP_ART.dragon, accent: '#c084fc' },
  4: { art: MAP_ART.treasure, accent: '#e0793c' },
};
const tierMeta = (tier: number) => TIER_META[tier] ?? { art: MAP_ART.skull, accent: '#f5b544' };

function fmtCooldown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const KIND_META: Record<'normal' | 'miniboss' | 'boss', { label: string }> = {
  normal: { label: 'Monstre' },
  miniboss: { label: 'Mini-boss' },
  boss: { label: 'Boss' },
};

function toStored(c: DungeonCombat): StoredCombat {
  return { rounds: c.rounds, result: c.result, events: c.events, final_state: c.finalState };
}

function lootResources(dj: DungeonTypeRow): string[] {
  const keys = [dj.loot_table_normal, dj.loot_table_miniboss, dj.loot_table_boss]
    .flat()
    .map((e) => e.resource);
  return [...new Set(keys)];
}

/* --------------------------------------------------------------- atomes -- */

function DangerMeter({ level, accent }: { level: number; accent: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`Danger ${level}/4`}>
      {Array.from({ length: 4 }, (_, i) => (
        <UiIcon key={i} name="skull" size={11} color={i < level ? accent : 'var(--color-edge-strong)'} />
      ))}
    </span>
  );
}

/** Portrait circulaire d'un héros (icône de classe teintée + anneau d'accent). */
function Portrait({ classId, size = 38 }: { classId: string; size?: number }) {
  const accent = classMeta(classId).accent;
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: `${accent}22`, boxShadow: `inset 0 0 0 1.5px ${accent}88` }}
    >
      <ClassIcon classId={classId} size={Math.round(size * 0.58)} />
    </span>
  );
}

/** Le « couloir » d'affrontements du donjon : monstres → mini-boss → boss. */
function GauntletPath({ dj, accent }: { dj: DungeonTypeRow; accent: string }) {
  const n = dj.monster_sequence.length;
  const kindOf = (i: number): 'normal' | 'miniboss' | 'boss' =>
    i === dj.boss_index ? 'boss' : dj.miniboss_indices.includes(i) ? 'miniboss' : 'normal';
  return (
    <div className="flex items-center overflow-x-auto pb-0.5">
      {Array.from({ length: n }, (_, i) => {
        const k = kindOf(i);
        return (
          <span key={i} className="flex shrink-0 items-center">
            {i > 0 && <span className="mx-0.5 h-px w-2.5 bg-[var(--color-edge)]" />}
            {k === 'boss' ? (
              <UiIcon name="dragon" size={16} color="var(--color-gold-soft)" />
            ) : k === 'miniboss' ? (
              <UiIcon name="skull" size={13} color={accent} />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-edge-strong)]" />
            )}
          </span>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- écran -- */

export function DungeonScreen() {
  const { data: heroes } = useHeroes();
  const { data: dungeons, isLoading } = useDungeonTypes();
  const { data: loanable } = useLoanableHeroes();
  const { data: cooldowns } = useDungeonCooldowns();
  const run = useRunDungeon();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  function cooldownOf(dj: DungeonTypeRow): number {
    const last = cooldowns?.[dj.id] ?? null;
    return dungeonCooldownRemaining(last, dj.tier, now);
  }

  const [dungeonId, setDungeonId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<{ res: DungeonRunResponse; total: number } | null>(null);
  const [replayIdx, setReplayIdx] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [auto, setAuto] = useState(false);

  const team = heroes ?? [];
  const availability = useHeroAvailability();
  const selectedDungeon = (dungeons ?? []).find((d) => d.id === dungeonId) ?? null;

  function toggleHero(id: string) {
    if (heroIsBusy(availability.get(id))) return;
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((h) => h !== id) : cur.length < MAX_TEAM ? [...cur, id] : cur,
    );
  }

  function launch() {
    if (!selectedDungeon || picked.length === 0) return;
    if (cooldownOf(selectedDungeon) > 0) return;
    setResult(null);
    setReplayIdx(null);
    setRevealed(false);
    run.mutate(
      { dungeonTypeId: selectedDungeon.id, heroIds: picked },
      {
        onSuccess: (res) => {
          setResult({ res, total: selectedDungeon.monster_sequence.length });
          setRevealed(false);
          setReplayIdx(0);
        },
      },
    );
  }

  const selectedCooldown = selectedDungeon ? cooldownOf(selectedDungeon) : 0;
  const canLaunch =
    Boolean(selectedDungeon) && picked.length > 0 && !run.isPending && selectedCooldown === 0;

  return (
    <section className="anim-fade space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="heading flex items-center gap-2 text-2xl">
            <SyntyImg src={MAP_ART.skull} size={26} />
            Donjons
          </h2>
          <p className="text-sm text-[var(--color-muted)]">
            Un test d'endurance : ton équipe n'a <strong>aucun répit</strong> — ses PV ne se
            régénèrent pas entre les vagues. Tenez jusqu'au boss… ou c'est le wipe.
          </p>
        </div>
        <Link to="/village" className="btn btn-ghost text-xs">
          ← Village
        </Link>
      </div>

      {/* Portes de donjon */}
      <div className="space-y-3">
        <SectionTitle label="Portes" />
        {isLoading && <p className="text-[var(--color-muted)]">Chargement des donjons…</p>}
        <div className="grid gap-3 lg:grid-cols-2">
          {(dungeons ?? []).map((dj) => (
            <DungeonGate
              key={dj.id}
              dj={dj}
              active={dungeonId === dj.id}
              cooldown={cooldownOf(dj)}
              onClick={() => setDungeonId(dungeonId === dj.id ? null : dj.id)}
            />
          ))}
        </div>
      </div>

      {/* Escouade */}
      <div className="space-y-3">
        <SectionTitle label={`Escouade · ${picked.length}/${MAX_TEAM}`} />
        {team.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Aucun héros — recrute à la Taverne.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {team.map((h) => (
              <HeroTile
                key={h.id}
                hero={h}
                selected={picked.includes(h.id)}
                busyLabel={
                  heroIsBusy(availability.get(h.id)) ? HERO_STATUS_LABEL[availability.get(h.id)!] : null
                }
                onToggle={() => toggleHero(h.id)}
              />
            ))}
          </div>
        )}

        {(loanable ?? []).length > 0 && (
          <div className="mt-2 space-y-2">
            <div className="text-xs font-semibold text-[var(--color-arcane)]">Héros empruntables</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(loanable ?? []).map((h) => (
                <BorrowedTile
                  key={h.id}
                  hero={h}
                  selected={picked.includes(h.id)}
                  onToggle={() => toggleHero(h.id)}
                />
              ))}
            </div>
          </div>
        )}
        {picked.length > 0 && (
          <button
            onClick={() => setPicked([])}
            className="text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          >
            Tout retirer
          </button>
        )}
      </div>

      {run.isError && (
        <p className="text-sm text-[var(--color-ember)]">
          {run.error instanceof Error ? run.error.message : 'Erreur'}
        </p>
      )}

      <button onClick={launch} disabled={!canLaunch} className="btn btn-primary w-full text-sm">
        {run.isPending
          ? 'Exploration…'
          : selectedDungeon && selectedCooldown > 0
            ? `En cooldown — ${fmtCooldown(selectedCooldown)}`
            : !selectedDungeon
              ? 'Choisis un donjon'
              : picked.length === 0
                ? 'Choisis ton escouade'
                : `Franchir : ${selectedDungeon.name}`}
      </button>

      {result && revealed && replayIdx === null && (
        <RunResult run={result.res} total={result.total} onReplay={() => setReplayIdx(0)} />
      )}

      {result && replayIdx !== null && result.res.fight_results[replayIdx] && (
        <DungeonReplay
          fights={result.res.fight_results}
          index={replayIdx}
          onIndex={setReplayIdx}
          live={!revealed}
          auto={auto}
          onToggleAuto={() => setAuto((v) => !v)}
          onClose={() => {
            setReplayIdx(null);
            setRevealed(true);
            setAuto(false);
          }}
        />
      )}
    </section>
  );
}

function SectionTitle({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-px flex-1 bg-[var(--color-edge)]" />
      <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-muted)]">
        {label}
      </span>
      <span className="h-px flex-1 bg-[var(--color-edge)]" />
    </div>
  );
}

/* --------------------------------------------------------------- porte -- */

function DungeonGate({
  dj,
  active,
  cooldown,
  onClick,
}: {
  dj: DungeonTypeRow;
  active: boolean;
  cooldown: number;
  onClick: () => void;
}) {
  const { art, accent } = tierMeta(dj.tier);
  const locked = cooldown > 0;
  const regen = Number(dj.regen_pct_between_fights);
  return (
    <button
      onClick={onClick}
      className={`panel group relative overflow-hidden p-0 text-left transition-transform duration-200 hover:-translate-y-0.5 ${locked ? 'opacity-80' : ''}`}
      style={active ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}, 0 0 24px -6px ${accent}` } : undefined}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full opacity-20 blur-xl transition-opacity group-hover:opacity-30"
        style={{ backgroundColor: accent }}
      />
      <div className="relative flex items-start gap-3 p-4">
        <span
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[var(--color-edge)]"
          style={{ backgroundColor: `${accent}14` }}
        >
          <SyntyImg src={art} size={48} title={dj.name} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-display text-base font-semibold text-[var(--color-ink)]">
              {dj.name}
            </span>
            <span className="flex items-center gap-1.5">
              {locked && (
                <span className="chip inline-flex items-center gap-1 bg-[var(--color-ember)]/15 text-[10px] text-[var(--color-ember)]">
                  <UiIcon name="lock" size={10} color="currentColor" /> {fmtCooldown(cooldown)}
                </span>
              )}
              <DangerMeter level={Math.min(4, dj.tier)} accent={accent} />
            </span>
          </div>

          {/* Le couloir d'affrontements */}
          <div className="mt-2">
            <GauntletPath dj={dj} accent={accent} />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-muted)]">
            <span className="inline-flex items-center gap-1">
              <UiIcon name="attack" size={11} color="currentColor" /> {dj.monster_sequence.length} vagues
            </span>
            <span className="chip bg-white/5 text-[10px]">Tier {dj.tier}</span>
            {regen > 0 ? (
              <span className="inline-flex items-center gap-1">
                <UiIcon name="heart" size={11} /> +{Math.round(regen * 100)}% / combat
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[var(--color-ember)]">
                <UiIcon name="bleed" size={11} /> sans répit
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {lootResources(dj).map((r) => (
              <span
                key={r}
                className="inline-flex items-center gap-1 rounded-md bg-black/25 px-1.5 py-0.5 text-[10px] text-[var(--color-ink)]/80"
                title={resourceMeta(r).label}
              >
                <ResourceIcon resKey={r} size={13} /> {resourceMeta(r).label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <span className="block h-1 w-full" style={{ backgroundColor: active ? accent : 'transparent' }} />
    </button>
  );
}

/* ------------------------------------------------------------ escouade -- */

function HeroTile({
  hero,
  selected,
  busyLabel,
  onToggle,
}: {
  hero: HeroView;
  selected: boolean;
  busyLabel: string | null;
  onToggle: () => void;
}) {
  const accent = classMeta(hero.classId).accent;
  return (
    <button
      onClick={onToggle}
      disabled={Boolean(busyLabel)}
      title={busyLabel ? `${hero.name} — ${busyLabel}` : hero.name}
      className={`flex items-center gap-2.5 rounded-lg border p-2 text-left transition ${
        busyLabel
          ? 'cursor-not-allowed opacity-40'
          : selected
            ? 'bg-white/[0.03]'
            : 'border-[var(--color-edge)] hover:border-[var(--color-edge-strong)]'
      }`}
      style={selected && !busyLabel ? { borderColor: accent, boxShadow: `inset 0 0 0 1px ${accent}55` } : undefined}
    >
      <Portrait classId={hero.classId} size={38} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--color-ink)]">{hero.name}</div>
        <div className="text-[10px] text-[var(--color-muted)]">
          {busyLabel ?? `${hero.className} · N.${hero.level}`}
        </div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[var(--color-gold-soft)]">
        <UiIcon name="power" size={11} color="currentColor" /> {hero.power}
      </span>
      {selected && !busyLabel && (
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-black"
          style={{ backgroundColor: accent }}
        >
          ✓
        </span>
      )}
    </button>
  );
}

function BorrowedTile({
  hero,
  selected,
  onToggle,
}: {
  hero: LoanableHero;
  selected: boolean;
  onToggle: () => void;
}) {
  const accent = classMeta(hero.class_id).accent;
  return (
    <button
      onClick={onToggle}
      title={`Emprunté à ${hero.owner_name}`}
      className={`relative flex items-center gap-2.5 rounded-lg border p-2 text-left transition ${
        selected ? 'bg-white/[0.03]' : 'hover:border-[var(--color-edge-strong)]'
      }`}
      style={{ borderColor: selected ? accent : 'rgba(124,108,255,0.35)' }}
    >
      <Portrait classId={hero.class_id} size={38} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--color-ink)]">{hero.name}</div>
        <div className="truncate text-[10px] text-[var(--color-arcane)]">
          N.{hero.level} · de {hero.owner_name}
        </div>
      </div>
      <span className="rounded bg-[var(--color-arcane)]/25 px-1 text-[8px] font-semibold uppercase tracking-wide text-[var(--color-arcane)]">
        emprunté
      </span>
    </button>
  );
}

/* -------------------------------------------------------------- résultat -- */

function RunResult({
  run,
  total,
  onReplay,
}: {
  run: DungeonRunResponse;
  total: number;
  onReplay: () => void;
}) {
  const reached = run.reached_index + 1;
  return (
    <div className="panel anim-pop space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span
          className={`flex items-center gap-1.5 font-display text-lg font-bold ${
            run.success ? 'text-[var(--color-gold)]' : 'text-[var(--color-ember)]'
          }`}
        >
          <UiIcon name={run.success ? 'victory' : 'defeat'} size={20} color="currentColor" />
          {run.success ? 'Donjon conquis !' : 'Wipe'}
        </span>
        <span className="chip bg-white/5 text-[11px] text-[var(--color-muted)]">
          Combat {reached}/{total}
        </span>
      </div>

      <div>
        <div className="mb-1 text-xs text-[var(--color-muted)]">Butin récupéré</div>
        {run.loot.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]/70">Aucun butin.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {run.loot.map((d) => (
              <span
                key={d.resource}
                className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-ink)]"
              >
                <ResourceIcon resKey={d.resource} /> +{d.amount} {resourceMeta(d.resource).label}
              </span>
            ))}
          </div>
        )}
      </div>

      <button onClick={onReplay} className="btn btn-arcane w-full text-sm">
        ▶ Revoir les combats ({run.fight_results.length})
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- replay -- */

function DungeonReplay({
  fights,
  index,
  onIndex,
  onClose,
  live = false,
  auto,
  onToggleAuto,
}: {
  fights: DungeonRunResponse['fight_results'];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  live?: boolean;
  auto: boolean;
  onToggleAuto: () => void;
}) {
  const fight = fights[index]!;
  const kind = KIND_META[fight.kind];
  const hasPrev = index > 0;
  const hasNext = index < fights.length - 1;
  const lost = fight.combat.result === 'loss';

  const startHp = useMemo(
    () => Object.fromEntries(fight.hpBefore.map((h) => [h.id, h.hp])),
    [fight],
  );

  const [finished, setFinished] = useState(false);
  useEffect(() => {
    setFinished(false);
  }, [index]);

  useEffect(() => {
    if (!finished || !auto || !hasNext || lost) return;
    const t = setTimeout(() => onIndex(index + 1), 6000);
    return () => clearTimeout(t);
  }, [finished, auto, hasNext, lost, index, onIndex]);

  return (
    <CombatReplay
      key={index}
      combat={toStored(fight.combat)}
      enemyKind={fight.kind}
      startHp={startHp}
      onDone={() => setFinished(true)}
      onClose={onClose}
      live={live}
      title={`Combat ${index + 1}/${fights.length} — ${kind.label} : ${fight.enemyName}`}
      headerExtra={
        <button
          onClick={onToggleAuto}
          title="Enchaîner automatiquement les combats"
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
            auto
              ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/20 text-[var(--color-ink)]'
              : 'border-[var(--color-edge)] text-[var(--color-muted)] hover:text-[var(--color-ink)]'
          }`}
        >
          {auto ? '⏩ Auto ON' : '⏩ Auto'}
        </button>
      }
      footer={
        <div className="mt-3 flex flex-col items-center gap-2">
          {finished && auto && hasNext && !lost && (
            <span className="text-[11px] text-[var(--color-arcane)]">
              Combat suivant dans un instant… (Auto)
            </span>
          )}
          <div className="flex items-center justify-center gap-2">
            {!live && (
              <button
                onClick={() => hasPrev && onIndex(index - 1)}
                disabled={!hasPrev}
                className="btn btn-ghost text-xs disabled:opacity-40"
              >
                ◀ Précédent
              </button>
            )}
            {hasNext && !lost ? (
              <button onClick={() => onIndex(index + 1)} className="btn btn-primary text-xs">
                <UiIcon name="attack" size={13} color="currentColor" /> Lancer le combat suivant
              </button>
            ) : (
              <button onClick={onClose} className="btn btn-primary text-xs">
                <UiIcon name={lost ? 'defeat' : 'victory'} size={13} color="currentColor" />
                {lost ? 'Voir le bilan' : 'Voir le butin'}
              </button>
            )}
            {live && hasNext && !lost && (
              <button onClick={onClose} className="btn btn-ghost text-xs">
                Abandonner
              </button>
            )}
          </div>
        </div>
      }
    />
  );
}
