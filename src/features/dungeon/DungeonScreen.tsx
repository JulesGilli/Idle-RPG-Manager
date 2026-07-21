import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { dungeonCooldownRemaining, DUNGEON_COUNT } from '@shared/progression/dungeon';
import { maxRosterFor, MAX_ROSTER } from '@shared/progression/recruit';
import { useMarkDungeonsSeen } from '@/hooks/useActionAlerts';
import { BackToActivities } from '@/components/BackToActivities';
import { BORROW_LIMIT_PER_TEAM, BORROW_DUNGEON_PER_DAY } from '@shared/progression/garrison';
import { useHeroes, type HeroView } from '@/features/heroes/useHeroes';
import { useBorrowableHeroes, type GarrisonHero } from '@/features/guild/useGuild';
import { useBorrowUsage, dungeonLeft } from '@/features/guild/useBorrowUsage';
import {
  useHeroAvailability,
  heroIsBusy,
  HERO_STATUS_LABEL,
} from '@/features/heroes/useHeroAvailability';
import { classMeta, compactNumber } from '@/lib/gameUi';
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
  type DungeonTypeRow,
  type DungeonCombat,
  type DungeonRunResponse,
} from './useDungeon';

const MAX_TEAM = 5;

// Ambiance par tier : art de carte Synty + couleur d'accent. Les 5 arts Synty
// disponibles tournent sur 8 paliers ; c'est l'ACCENT qui porte la progression,
// du vert (sûr) au rouge (mortel), pour que le tier se lise sans compter les crânes.
const TIER_META: Record<number, { art: string; accent: string }> = {
  1: { art: MAP_ART.skull, accent: '#5fd39b' },
  2: { art: MAP_ART.monster, accent: '#56b6f4' },
  3: { art: MAP_ART.dragon, accent: '#818cf8' },
  4: { art: MAP_ART.treasure, accent: '#c084fc' },
  5: { art: MAP_ART.tower, accent: '#f0a3d0' },
  6: { art: MAP_ART.dragon, accent: '#f5b544' },
  7: { art: MAP_ART.monster, accent: '#e0793c' },
  8: { art: MAP_ART.skull, accent: '#ef4444' },
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

/**
 * Jauge de danger : un crâne par tier. Sur 8 paliers les crânes sont resserrés
 * (taille 9, sans espace) � plafonner à 4 comme avant aurait rendu les quatre
 * derniers donjons visuellement identiques, alors que c'est justement là que
 * l'écart se creuse.
 */
function DangerMeter({ level, accent }: { level: number; accent: string }) {
  return (
    <span className="inline-flex items-center" title={`Danger ${level}/${DUNGEON_COUNT}`}>
      {Array.from({ length: DUNGEON_COUNT }, (_, i) => (
        <UiIcon key={i} name="skull" size={9} color={i < level ? accent : 'var(--color-edge-strong)'} />
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

/** Le « couloir » d'affrontements du donjon : monstres �  mini-boss �  boss. */
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

/* ---------------------------------------------------- crawl dessiné (SVG) -- */

const BOSS_COLOR = '#f5b544';
const MINI_COLOR = '#e07a52';

function starPts(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

type CrawlKind = 'normal' | 'miniboss' | 'boss';

/** Carte dessinée du donjon : enfilade de salles serpentine jusqu'à la salle du boss. */
function DungeonCrawlMap({ dj, accent }: { dj: DungeonTypeRow; accent: string }) {
  const n = dj.monster_sequence.length;
  const kindOf = (i: number): CrawlKind =>
    i === dj.boss_index ? 'boss' : dj.miniboss_indices.includes(i) ? 'miniboss' : 'normal';

  // Couloir horizontal serpentin : on répartit les salles sur le MOINS de rangées
  // possible sans qu'elles se chevauchent (�0� 2 rangées pour un gros donjon).
  const margin = 46;
  const usable = 680 - 2 * margin;
  const minStep = 62; // espacement mini entre 2 salles (évite le chevauchement)
  const maxCols = Math.max(1, Math.floor(usable / minStep) + 1);
  const rows = Math.ceil(n / maxCols);
  const perRow = Math.ceil(n / rows);
  const stepX = perRow > 1 ? usable / (perRow - 1) : 0;
  const y0 = 78;
  const rowGap = 100;
  const H = y0 + (rows - 1) * rowGap + 46;

  const nodes = Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / perRow);
    const pos = i % perRow;
    const col = r % 2 === 0 ? pos : perRow - 1 - pos; // rangées alternées (serpentin)
    const x = perRow > 1 ? margin + col * stepX : 340;
    return { i, x, y: y0 + r * rowGap, kind: kindOf(i) };
  });

  const dim = (k: CrawlKind) =>
    k === 'boss' ? { w: 54, h: 44 } : k === 'miniboss' ? { w: 46, h: 38 } : { w: 40, h: 34 };
  const colorOf = (k: CrawlKind) => (k === 'boss' ? BOSS_COLOR : k === 'miniboss' ? MINI_COLOR : accent);

  const first = nodes[0]!;

  return (
    <svg viewBox={`0 0 680 ${H}`} className="h-auto w-full" role="img" aria-label={`Plan du donjon ${dj.name}`}>
      <defs>
        <linearGradient id="dg-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b0812" />
          <stop offset="100%" stopColor="#050308" />
        </linearGradient>
        <linearGradient id="dg-room" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#221d34" />
          <stop offset="100%" stopColor="#100c1c" />
        </linearGradient>
        <linearGradient id="dg-mini" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3e2a20" />
          <stop offset="100%" stopColor="#1d120c" />
        </linearGradient>
        <linearGradient id="dg-boss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a2712" />
          <stop offset="100%" stopColor="#160d06" />
        </linearGradient>
        <radialGradient id="dg-torch" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ffb356" stopOpacity="0.5" />
          <stop offset="55%" stopColor="#b5601f" stopOpacity="0.13" />
          <stop offset="100%" stopColor="#b5601f" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dg-bossglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ff7a43" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#c0301c" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#c0301c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dg-vig" cx="0.5" cy="0.5" r="0.72">
          <stop offset="55%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.9" />
        </radialGradient>
        <filter id="dg-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x="0" y="0" width="680" height={H} fill="url(#dg-bg)" />

      {/* Dallage discret */}
      {Array.from({ length: Math.ceil(680 / 46) }, (_, i) => (
        <line key={`vx${i}`} x1={i * 46} y1={0} x2={i * 46} y2={H} stroke="#4a4260" strokeWidth="0.5" opacity="0.05" />
      ))}
      {Array.from({ length: Math.ceil(H / 46) }, (_, i) => (
        <line key={`hz${i}`} x1={0} y1={i * 46} x2={680} y2={i * 46} stroke="#4a4260" strokeWidth="0.5" opacity="0.05" />
      ))}

      {/* Pénombre : les bords sombrent dans le noir */}
      <rect x="0" y="0" width="680" height={H} fill="url(#dg-vig)" />

      {/* Halos de torche : la lumière se concentre sur les salles, l'obscurité règne entre */}
      {nodes.map((nd) => {
        const d = dim(nd.kind);
        const rr = (nd.kind === 'boss' ? 1.2 : 0.95) * d.w;
        return (
          <circle
            key={`pool${nd.i}`}
            cx={nd.x}
            cy={nd.y}
            r={rr}
            fill={nd.kind === 'boss' ? 'url(#dg-bossglow)' : 'url(#dg-torch)'}
          />
        );
      })}

      {/* Couloirs creusés dans la roche */}
      {nodes.slice(0, -1).map((a, idx) => {
        const b = nodes[idx + 1]!;
        return (
          <g key={`c${idx}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#000000" strokeWidth="15" strokeLinecap="round" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#1a1322" strokeWidth="9" strokeLinecap="round" />
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#7a4e26"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="1 9"
              opacity="0.55"
            />
          </g>
        );
      })}

      {/* Entrée */}
      <text x={first.x} y={first.y - dim(first.kind).h / 2 - 12} textAnchor="middle" fontSize="11" fontWeight="700" fill="#d99a4e">
        ENTR�0E
      </text>

      {/* Salles */}
      {nodes.map((nd) => {
        const d = dim(nd.kind);
        const c = colorOf(nd.kind);
        const fill = nd.kind === 'boss' ? 'url(#dg-boss)' : nd.kind === 'miniboss' ? 'url(#dg-mini)' : 'url(#dg-room)';
        const top = nd.y - d.h / 2;
        return (
          <g key={nd.i} filter={nd.kind === 'boss' ? 'url(#dg-glow)' : undefined}>
            {/* Torches murales (le boss a son propre brasier) */}
            {nd.kind !== 'boss' &&
              [-1, 1].map((s) => (
                <g key={`wt${nd.i}_${s}`}>
                  <circle cx={nd.x + s * (d.w / 2 + 6)} cy={nd.y - 4} r="3" fill="#ffb648" filter="url(#dg-glow)" />
                  <rect x={nd.x + s * (d.w / 2 + 6) - 1} y={nd.y - 4} width="2" height="9" fill="#332310" />
                </g>
              ))}

            <rect
              x={nd.x - d.w / 2}
              y={top}
              width={d.w}
              height={d.h}
              rx="7"
              fill={fill}
              stroke={c}
              strokeWidth={nd.kind === 'normal' ? 1.2 : 2}
            />
            {/* Arche sombre en haut de la salle */}
            <rect x={nd.x - d.w / 2 + 4} y={top + 3} width={d.w - 8} height={d.h * 0.32} rx="5" fill="#000000" opacity="0.28" />

            {/* Boss : herse (portcullis) + emblème */}
            {nd.kind === 'boss' && (
              <g>
                <line x1={nd.x - d.w / 2 + 4} y1={top + 3} x2={nd.x + d.w / 2 - 4} y2={top + 3} stroke="#0a0715" strokeWidth="3" />
                {[-2, -1, 0, 1, 2].map((k) => (
                  <line key={k} x1={nd.x + k * 10} y1={top + 3} x2={nd.x + k * 10} y2={top + 15} stroke="#0a0715" strokeWidth="2.2" />
                ))}
                <polygon points={starPts(nd.x, top, 9)} fill={BOSS_COLOR} stroke="#1a1523" strokeWidth="1" />
              </g>
            )}
            {nd.kind === 'miniboss' && (
              <polygon
                points={`${nd.x},${top - 7} ${nd.x + 6},${top} ${nd.x},${top + 7} ${nd.x - 6},${top}`}
                fill={MINI_COLOR}
                stroke="#1a1523"
                strokeWidth="1"
              />
            )}

            {/* Numéro de vague */}
            <text
              x={nd.x}
              y={nd.y + (nd.kind === 'boss' ? 4 : 5)}
              textAnchor="middle"
              fontSize={nd.kind === 'boss' ? 15 : 13}
              fontWeight="700"
              fill={nd.kind === 'normal' ? '#cfc7e6' : c}
            >
              {nd.i + 1}
            </text>
            {nd.kind === 'boss' && (
              <text x={nd.x} y={nd.y + d.h / 2 + 14} textAnchor="middle" fontSize="10" fontWeight="700" fill={BOSS_COLOR}>
                BOSS
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Panneau immersif du donjon sélectionné : titre + plan dessiné + légende/butin. */
function DungeonCrawlPanel({ dj }: { dj: DungeonTypeRow }) {
  const { accent } = tierMeta(dj.tier);
  const n = dj.monster_sequence.length;
  const minis = dj.miniboss_indices.length;
  const normals = Math.max(0, n - minis - 1);
  return (
    <div className="panel relative overflow-hidden p-4">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-14 h-48 w-48 rounded-full opacity-20 blur-3xl"
        style={{ backgroundColor: accent }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-display text-lg font-bold text-[var(--color-ink)]">
          <SyntyImg src={tierMeta(dj.tier).art} size={22} /> {dj.name}
        </span>
        <span className="flex items-center gap-2">
          <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">Tier {dj.tier}</span>
          <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">{n} vagues</span>
          <DangerMeter level={Math.min(4, dj.tier)} accent={accent} />
        </span>
      </div>

      <div className="mt-3">
        <DungeonCrawlMap dj={dj} accent={accent} />
      </div>

      {/* Légende + butin possible */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-[var(--color-muted)]">
          <span className="h-3 w-3 rounded-sm border" style={{ borderColor: accent }} /> {normals} monstre(s)
        </span>
        <span className="inline-flex items-center gap-1.5 text-[var(--color-muted)]">
          <UiIcon name="skull" size={12} color={MINI_COLOR} /> {minis} mini-boss
        </span>
        <span className="inline-flex items-center gap-1.5 text-[var(--color-muted)]">
          <UiIcon name="dragon" size={13} color={BOSS_COLOR} /> 1 boss
        </span>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {lootResources(dj).map((r) => (
            <span
              key={r}
              className="inline-flex items-center gap-1 rounded-md bg-black/25 px-1.5 py-0.5 text-[10px] text-[var(--color-ink)]/80"
              title={resourceMeta(r).label}
            >
              <ResourceIcon resKey={r} size={13} /> {resourceMeta(r).label}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- écran -- */

export function DungeonScreen() {
  useMarkDungeonsSeen();
  const { data: heroes } = useHeroes();
  const { data: dungeons, isLoading } = useDungeonTypes();
  const { data: borrowable } = useBorrowableHeroes();
  const { data: borrowUsage } = useBorrowUsage();
  const { data: history } = useDungeonCooldowns();
  const run = useRunDungeon();

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  function cooldownOf(dj: DungeonTypeRow): number {
    const last = history?.lastRunAt[dj.id] ?? null;
    return dungeonCooldownRemaining(last, dj.tier, now);
  }

  const clearedIds = history?.cleared ?? new Set<string>();
  // Slots d'effectif : 5 de base + 1 par donjon distinct vaincu. On le recalcule
  // ici plutôt que de lire `max_roster` (renvoyé par l'Edge Function `recruit`,
  // que cet écran n'appelle pas) � même formule partagée, donc même résultat.
  const rosterNow = maxRosterFor(clearedIds.size);
  const slotsLeft = DUNGEON_COUNT - clearedIds.size;

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

  // Renforts de garnison : au plus BORROW_LIMIT_PER_TEAM par équipe.
  const borrowableIds = useMemo(
    () => new Set((borrowable ?? []).map((b) => b.hero_id)),
    [borrowable],
  );
  function toggleBorrowed(id: string) {
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((h) => h !== id);
      if (cur.length >= MAX_TEAM) return cur;
      const borrowedCount = cur.filter((h) => borrowableIds.has(h)).length;
      if (borrowedCount >= BORROW_LIMIT_PER_TEAM) return cur;
      if (dungeonLeft(borrowUsage, id) <= 0) return cur; // déjà utilisé aujourd'hui
      return [...cur, id];
    });
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

  /** Rejoue d'un coup un donjon déjà vaincu : pas de héros, pas de combat. */
  function skipRun() {
    if (!selectedDungeon) return;
    if (cooldownOf(selectedDungeon) > 0) return;
    setResult(null);
    setReplayIdx(null);
    setRevealed(false);
    run.mutate(
      { dungeonTypeId: selectedDungeon.id, heroIds: [], skip: true },
      {
        onSuccess: (res) => {
          setResult({ res, total: selectedDungeon.monster_sequence.length });
          // Pas de replay à dérouler : on montre le butin directement, sinon le
          // rendu irait chercher un combat dans un tableau vide.
          setRevealed(true);
          setReplayIdx(null);
        },
      },
    );
  }

  const selectedCooldown = selectedDungeon ? cooldownOf(selectedDungeon) : 0;
  const canLaunch =
    Boolean(selectedDungeon) && picked.length > 0 && !run.isPending && selectedCooldown === 0;
  // Le skip ne demande pas d'équipe : il n'exige que d'avoir déjà gagné ici.
  const canSkip =
    Boolean(selectedDungeon) &&
    clearedIds.has(selectedDungeon!.id) &&
    !run.isPending &&
    selectedCooldown === 0;

  return (
    <section className="anim-fade space-y-6">
      <BackToActivities />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="heading flex items-center gap-2 text-2xl">
            <SyntyImg src={MAP_ART.skull} size={26} />
            Donjons
          </h2>
          <p className="text-sm text-[var(--color-muted)]">
            Un test d'endurance : ton équipe n'a <strong>aucun répit</strong> � ses PV ne se
            régénèrent pas entre les vagues. Tenez jusqu'au boss⬦ ou c'est le wipe.
          </p>
        </div>
        <Link to="/village" className="btn btn-ghost text-xs">
          � � Village
        </Link>
      </div>

      {/* La règle des slots d'effectif n'était écrite NULLE PART dans le jeu : on
          ne la découvrait qu'en butant sur « Effectif complet » à la Taverne. */}
      <div className="panel flex flex-wrap items-center gap-x-3 gap-y-1.5 border-l-2 border-l-[var(--color-gold)] p-3 text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-[var(--color-gold-soft)]">
          <UiIcon name="squad" size={15} color="currentColor" />
          Vaincre un donjon pour la première fois débloque un slot de héros.
        </span>
        <span className="text-[var(--color-muted)]">
          {slotsLeft > 0 ? (
            <>
              Effectif actuel <strong className="text-[var(--color-ink)]">{rosterNow}</strong> � il
              reste <strong className="text-[var(--color-ink)]">{slotsLeft}</strong> donjon
              {slotsLeft > 1 ? 's' : ''} à vaincre pour atteindre {MAX_ROSTER}.
            </>
          ) : (
            <>
              Les {DUNGEON_COUNT} donjons sont vaincus : effectif maximal de {MAX_ROSTER} héros
              atteint.
            </>
          )}
        </span>
      </div>

      {/* Portes de donjon */}
      <div className="space-y-3">
        <SectionTitle label="Portes" />
        {isLoading && <p className="text-[var(--color-muted)]">Chargement des donjons⬦</p>}
        <div className="grid gap-3 lg:grid-cols-2">
          {(dungeons ?? []).map((dj) => (
            <DungeonGate
              key={dj.id}
              dj={dj}
              active={dungeonId === dj.id}
              cooldown={cooldownOf(dj)}
              cleared={clearedIds.has(dj.id)}
              onClick={() => setDungeonId(dungeonId === dj.id ? null : dj.id)}
            />
          ))}
        </div>
      </div>

      {/* Plan du donjon sélectionné */}
      {selectedDungeon && (
        <div className="space-y-3">
          <SectionTitle label="Le donjon" />
          <DungeonCrawlPanel dj={selectedDungeon} />
        </div>
      )}

      {/* Escouade */}
      <div className="space-y-3">
        <SectionTitle label={`Escouade · ${picked.length}/${MAX_TEAM}`} />
        {team.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Aucun héros � recrute à la Taverne.</p>
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

        {(borrowable ?? []).length > 0 && (
          <div className="mt-2 space-y-2">
            <div className="text-xs font-semibold text-[var(--color-arcane)]">
              Renforts de guilde <span className="text-[var(--color-muted)]">(1 max par équipe)</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(borrowable ?? []).map((h) => (
                <BorrowedTile
                  key={h.hero_id}
                  hero={h}
                  selected={picked.includes(h.hero_id)}
                  left={dungeonLeft(borrowUsage, h.hero_id)}
                  onToggle={() => toggleBorrowed(h.hero_id)}
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

      <div className="flex flex-col gap-2 sm:flex-row">
        <button onClick={launch} disabled={!canLaunch} className="btn btn-primary flex-1 text-sm">
          {run.isPending
            ? 'Exploration⬦'
            : selectedDungeon && selectedCooldown > 0
              ? `En cooldown � ${fmtCooldown(selectedCooldown)}`
              : !selectedDungeon
                ? 'Choisis un donjon'
                : picked.length === 0
                  ? 'Choisis ton escouade'
                  : `Franchir : ${selectedDungeon.name}`}
        </button>
        {/* Le skip n'apparait que la ou il a un sens : un donjon deja vaincu.
            Ailleurs, un bouton grise de plus n'apprendrait rien. */}
        {selectedDungeon && clearedIds.has(selectedDungeon.id) && (
          <button
            onClick={skipRun}
            disabled={!canSkip}
            title="Rejoue ce donjon instantanement : butin complet, aucun combat, cooldown normal."
            className="btn btn-ghost text-sm sm:w-auto"
          >
            Passer
          </button>
        )}
      </div>

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
  cleared,
  onClick,
}: {
  dj: DungeonTypeRow;
  active: boolean;
  cooldown: number;
  /** Déjà vaincu au moins une fois �  son slot d'effectif est acquis. */
  cleared: boolean;
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
            <span className="chip bg-white/5 text-[10px]">
              Tier {dj.tier}/{DUNGEON_COUNT}
            </span>
            {/* La promesse du slot, portée par CHAQUE porte tant qu'elle n'a pas
                été tenue � c'est là que le joueur choisit où aller. */}
            {cleared ? (
              <span
                className="chip inline-flex items-center gap-1 bg-emerald-400/15 text-[10px] font-semibold text-emerald-300"
                title="Donjon déjà vaincu : son slot d'effectif est acquis."
              >
                <UiIcon name="squad" size={10} color="currentColor" /> Slot acquis
              </span>
            ) : (
              <span
                className="chip inline-flex items-center gap-1 bg-[var(--color-gold)]/15 text-[10px] font-semibold text-[var(--color-gold-soft)]"
                title="Première victoire sur ce donjon : +1 slot de héros, définitivement."
              >
                <UiIcon name="squad" size={10} color="currentColor" /> +1 slot de héros
              </span>
            )}
            {dj.tier >= DUNGEON_COUNT - 1 && (
              <span
                className="chip inline-flex items-center gap-1 bg-[var(--color-ember)]/15 text-[10px] font-semibold text-[var(--color-ember)]"
                title="Contenu de fin : hors de portée au niveau 30. Reviens avec un cap plus haut / un kit optimal."
              >
                <UiIcon name="lock" size={10} color="currentColor" /> Reviens plus fort
              </span>
            )}
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
      title={busyLabel ? `${hero.name} � ${busyLabel}` : hero.name}
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
        {/* `truncate` AUSSI ici : sans lui la ligne classe/niveau débordait et
            écrasait le nom quand la carte est étroite (grille 3 colonnes). */}
        <div className="truncate text-[10px] text-[var(--color-muted)]">
          {busyLabel ?? `${hero.className} · N.${hero.level}`}
        </div>
      </div>
      {/* Puissance COMPACTE (« 5.1k ») : en fin de partie, 4-5 chiffres bruts
          mangeaient la largeur du bloc nom/classe et le réduisaient à 2 lettres. */}
      <span
        className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[var(--color-gold-soft)]"
        title={`Puissance ${hero.power}`}
      >
        <UiIcon name="power" size={11} color="currentColor" /> {compactNumber(hero.power)}
      </span>
      {selected && !busyLabel && (
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-black"
          style={{ backgroundColor: accent }}
        >
          �S
        </span>
      )}
    </button>
  );
}

function BorrowedTile({
  hero,
  selected,
  left,
  onToggle,
}: {
  hero: GarrisonHero;
  selected: boolean;
  left: number;
  onToggle: () => void;
}) {
  const accent = classMeta(hero.class_id).accent;
  const exhausted = left <= 0;
  return (
    <button
      onClick={onToggle}
      disabled={exhausted && !selected}
      title={
        exhausted
          ? `Déjà utilisé en donjon aujourd'hui (${BORROW_DUNGEON_PER_DAY}/jour) � emprunté à ${hero.owner_name}`
          : `Emprunté à ${hero.owner_name} · ${left}/${BORROW_DUNGEON_PER_DAY} donjon aujourd'hui`
      }
      className={`relative flex items-center gap-2.5 rounded-lg border p-2 text-left transition ${
        selected ? 'bg-white/[0.03]' : 'hover:border-[var(--color-edge-strong)]'
      } ${exhausted && !selected ? 'cursor-not-allowed opacity-45' : ''}`}
      style={{ borderColor: selected ? accent : 'rgba(124,108,255,0.35)' }}
    >
      <Portrait classId={hero.class_id} size={38} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--color-ink)]">{hero.name}</div>
        <div className="truncate text-[10px] text-[var(--color-arcane)]">
          N.{hero.level} · de {hero.owner_name}
        </div>
      </div>
      {exhausted ? (
        <span className="rounded bg-[var(--color-ember)]/20 px-1 text-[8px] font-semibold uppercase tracking-wide text-[var(--color-ember)]">
          utilisé
        </span>
      ) : (
        <span className="rounded bg-[var(--color-arcane)]/25 px-1 text-[8px] font-semibold uppercase tracking-wide text-[var(--color-arcane)]">
          emprunté
        </span>
      )}
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

      {/* Un run PASSE n'a aucun combat enregistre : proposer un replay vide
          menerait droit a un ecran mort. */}
      {run.fight_results.length > 0 ? (
        <button onClick={onReplay} className="btn btn-arcane w-full text-sm">
          �� Revoir les combats ({run.fight_results.length})
        </button>
      ) : (
        <p className="text-center text-xs text-[var(--color-muted)]">
          Donjon passe : butin encaisse sans combattre.
        </p>
      )}
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
      title={`Combat ${index + 1}/${fights.length} � ${kind.label} : ${fight.enemyName}`}
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
              Combat suivant dans un instant⬦ (Auto)
            </span>
          )}
          <div className="flex items-center justify-center gap-2">
            {!live && (
              <button
                onClick={() => hasPrev && onIndex(index - 1)}
                disabled={!hasPrev}
                className="btn btn-ghost text-xs disabled:opacity-40"
              >
                �� Précédent
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
