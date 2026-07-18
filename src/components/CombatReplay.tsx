import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { CombatEvent, CombatantFinalState, Side, StatusType } from '@shared/combat';
import { isSummonId, summonerIdOf } from '@shared/combat';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { STATUS_GLYPH, syntyUrl, classWeaponCleanUrl } from '@/lib/synty';
import { classMeta } from '@/lib/gameUi';
import { useHeroes } from '@/features/heroes/useHeroes';
import { CombatArena } from '@/components/combat/CombatArena';

/** Nature des ennemis d'un combat (donjon/arc/raid) — pour l'icône côté ennemi. */
export type EnemyKind = 'normal' | 'miniboss' | 'boss';

const STATUS_TINT: Record<StatusType, string> = {
  poison: '#8ade8a',
  burn: '#fb923c',
  stun: '#facc15',
  weaken: '#c084fc',
  taunt: '#fbbf24',
};

export type StoredCombat = {
  rounds: number;
  result: 'win' | 'loss';
  events: CombatEvent[];
  final_state: CombatantFinalState[];
};

// Délai de révélation d'un événement de combat. Halvé (380 → 190) pour DOUBLER la
// vitesse de lecture : le sélecteur ×1 joue désormais à l'ancienne vitesse ×2,
// ×2 = ancien ×4, ×4 = ancien ×8. La lecture par défaut (×1) est donc 2× plus vive.
const REVEAL_MS = 190;

/** Paliers de vitesse proposés au joueur. */
const SPEEDS = [1, 4, 16] as const;
type Speed = (typeof SPEEDS)[number];

/**
 * Période MINIMALE entre deux re-rendus (~25/s). À ×16 l'intervalle théorique tombe
 * à 12 ms, soit SOUS une frame : on ne peut pas rendre aussi vite. On garde donc un
 * tick plancher et on révèle PLUSIEURS events d'un coup (cf. `visible` piloté par
 * l'horloge). La vitesse perçue est exacte, le nombre de rendus reste tenable.
 */
const MIN_TICK_MS = 40;

/**
 * Nombre max de lignes de journal RENDUES à l'écran. Un combat long génère des
 * centaines/milliers d'events ; tout monter en DOM lague en fin de combat. On ne
 * rend que les N dernières (le journal scrolle en bas de toute façon) — les PV/
 * barrières restent calculés sur TOUS les events, seul l'affichage est fenêtré.
 */
const LOG_WINDOW = 60;

/** Vitesse de lecture retenue entre combats (persiste le ×16 d'une étape à l'autre). */
function loadSpeed(): Speed {
  try {
    const v = Number(localStorage.getItem('combat-speed'));
    if ((SPEEDS as readonly number[]).includes(v)) return v as Speed;
    // Ancien palier ×2 (supprimé) → on remonte au palier médian plutôt que de
    // renvoyer le joueur en ×1 sans qu'il comprenne pourquoi.
    return v === 2 ? 4 : 1;
  } catch {
    return 1;
  }
}
function persistSpeed(s: Speed): void {
  try {
    localStorage.setItem('combat-speed', String(s));
  } catch {
    /* stockage indisponible : on garde juste l'état local */
  }
}

/** Côté à l'origine d'un événement (qui agit / qui meurt). */
function eventSide(e: CombatEvent, sideById: Map<string, Side>): Side | null {
  switch (e.type) {
    case 'attack':
    case 'heal':
      return sideById.get(e.actorId) ?? null;
    case 'death':
    case 'status':
      return sideById.get(e.combatantId) ?? null;
    default:
      return null;
  }
}

/** Icône du combattant : classe (héros) ou monstre/boss (ennemi). */
function CombatantIcon({
  c,
  classId,
  enemyKind,
}: {
  c: CombatantFinalState;
  classId: string | undefined;
  enemyKind: EnemyKind;
}) {
  if (c.side === 'ally') {
    if (!classId) return null;
    // NB : les icônes d'inventaire n'ont pas de calque Stroke → on garde le Clean teinté.
    return <SyntyGlyph src={classWeaponCleanUrl(classId)} color={classMeta(classId).accent} size={13} />;
  }
  // Ennemi : crâne pour un monstre normal, silhouette de monstre pour (mini-)boss.
  const boss = enemyKind !== 'normal';
  return (
    <SyntyGlyph
      src={syntyUrl.map(boss ? 'Monster01' : 'Skull01', 'Stroke')}
      color={boss ? '#f5b544' : '#fb7185'}
      size={13}
    />
  );
}

function HpBar({
  c,
  hp,
  barrier,
  classId,
  enemyKind,
  nested = false,
}: {
  c: CombatantFinalState;
  hp: number;
  barrier: number;
  classId: string | undefined;
  enemyKind: EnemyKind;
  /** Barre d'une INVOCATION : plus petite et indentée sous son invocateur. */
  nested?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, Math.round((hp / c.maxHp) * 100)));
  const barPct = barrier > 0 ? Math.max(0, Math.min(100, Math.round((barrier / c.maxHp) * 100))) : 0;
  const dead = hp <= 0;
  const ally = c.side === 'ally';
  return (
    <div
      className={`transition-opacity ${dead ? 'opacity-40' : ''} ${
        // Indentation + liseré : rattache visuellement l'invocation à l'invocateur.
        nested ? 'ml-3 border-l border-[var(--color-edge)] pl-2' : ''
      }`}
    >
      <div className={`flex justify-between ${nested ? 'text-[10px]' : 'text-[11px]'}`}>
        <span className="flex min-w-0 items-center gap-1 truncate text-[var(--color-ink)]">
          <CombatantIcon c={c} classId={classId} enemyKind={enemyKind} />
          {c.name}
        </span>
        <span className="flex items-center gap-1.5">
          {barrier > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-[#7cc6f7]/15 px-1 text-[10px] font-semibold text-[#7cc6f7]"
              title="Barrière — absorbe les dégâts avant les PV"
            >
              <SyntyGlyph src={syntyUrl.status('Defense01')} color="#7cc6f7" size={10} /> {barrier}
            </span>
          )}
          <span className="text-[var(--color-muted)]">{Math.max(0, hp)}</span>
        </span>
      </div>
      <div
        className={`mt-0.5 flex gap-px overflow-hidden rounded-full bg-black/50 ${
          nested ? 'h-1' : 'h-1.5'
        }`}
      >
        <div
          className={`h-full transition-all duration-300 ${
            ally
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
              : 'bg-gradient-to-r from-rose-600 to-rose-400'
          }`}
          style={{ width: `${pct}%` }}
        />
        {/* Segment de barrière (bleu) accolé à la barre de vie. */}
        {barPct > 0 && <div className="h-full bg-[#7cc6f7]" style={{ width: `${barPct}%` }} />}
      </div>
    </div>
  );
}

/**
 * Ordonne les alliés pour l'affichage des barres : chaque invocateur est suivi de
 * SES invocations (marquées `nested` → barre réduite et indentée). Les invocations
 * orphelines (invocateur absent) sont reléguées en fin de liste.
 */
function orderAlliesWithSummons(
  list: CombatantFinalState[],
): { c: CombatantFinalState; nested: boolean }[] {
  const summonsBy = new Map<string, CombatantFinalState[]>();
  const primaries: CombatantFinalState[] = [];
  for (const c of list) {
    if (isSummonId(c.id)) {
      const k = summonerIdOf(c.id);
      const arr = summonsBy.get(k) ?? [];
      arr.push(c);
      summonsBy.set(k, arr);
    } else {
      primaries.push(c);
    }
  }
  const out: { c: CombatantFinalState; nested: boolean }[] = [];
  const placed = new Set<string>();
  for (const p of primaries) {
    out.push({ c: p, nested: false });
    for (const s of summonsBy.get(p.id) ?? []) {
      out.push({ c: s, nested: true });
      placed.add(s.id);
    }
  }
  for (const arr of summonsBy.values()) {
    for (const s of arr) if (!placed.has(s.id)) out.push({ c: s, nested: true });
  }
  return out;
}

/** Une ligne du journal, alignée et colorée selon le côté à l'origine. */
function LogLine({ e, side }: { e: CombatEvent; side: Side | null }) {
  const ally = side === 'ally';

  if (e.type === 'heal') {
    // Soin : toujours vert (code couleur soin), aligné du côté du soigneur.
    return (
      <div className={`flex ${ally ? 'justify-start' : 'justify-end'}`}>
        <div className="flex max-w-[85%] items-center gap-1 rounded-lg border-l-2 border-emerald-400 bg-emerald-500/10 px-2.5 py-1 text-[12px] text-emerald-200">
          <UiIcon name="heal" size={13} />
          {e.message}
        </div>
      </div>
    );
  }

  if (e.type === 'status') {
    // Événement informatif (statut / cast d'ultime) : bandeau centré neutre,
    // avec l'icône Synty du statut si disponible.
    const glyph = e.status ? STATUS_GLYPH[e.status] : undefined;
    const hasBarrier = typeof e.barrier === 'number';
    return (
      <div className="flex justify-center">
        <div
          className={`flex max-w-[85%] items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] ${
            hasBarrier ? 'bg-[#7cc6f7]/10 text-[#7cc6f7]' : 'bg-white/5 text-[var(--color-muted)]'
          }`}
        >
          {glyph && e.status && <SyntyGlyph src={glyph} color={STATUS_TINT[e.status]} size={13} />}
          {hasBarrier && !e.status && (
            <SyntyGlyph src={syntyUrl.status('Defense01')} color="#7cc6f7" size={12} />
          )}
          {e.message}
        </div>
      </div>
    );
  }

  if (e.type === 'death') {
    // Mort : doré si un ennemi tombe (bon pour toi), rouge si c'est un des tiens.
    return (
      <div className={`flex ${ally ? 'justify-start' : 'justify-end'}`}>
        <div
          className={`max-w-[85%] rounded-lg px-2.5 py-1 text-[12px] font-semibold ${
            ally
              ? 'bg-rose-500/15 text-rose-200'
              : 'bg-[var(--color-gold)]/15 text-[var(--color-gold-soft)]'
          }`}
        >
          <span className="mr-1 inline-flex align-middle">
            <SyntyGlyph
              src={syntyUrl.map('Skull01')}
              color={ally ? '#fda4af' : 'var(--color-gold-soft)'}
              size={13}
            />
          </span>
          {e.message}
        </div>
      </div>
    );
  }

  // Tic de DoT (poison/feu) : ligne teintée à la couleur du statut, avec son
  // icône, pour que les dégâts par tour soient bien lisibles dans le journal.
  if (e.type === 'attack' && e.status) {
    const tint = STATUS_TINT[e.status];
    const glyph = STATUS_GLYPH[e.status];
    const style: CSSProperties = { color: tint, backgroundColor: `${tint}1a` };
    if (ally) style.borderLeft = `2px solid ${tint}`;
    else style.borderRight = `2px solid ${tint}`;
    return (
      <div className={`flex ${ally ? 'justify-start' : 'justify-end'}`}>
        <div
          className={`flex max-w-[85%] items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] ${
            ally ? '' : 'flex-row-reverse text-right'
          }`}
          style={style}
        >
          {glyph && <SyntyGlyph src={glyph} color={tint} size={13} />}
          {e.message}
        </div>
      </div>
    );
  }

  // Attaque : côté = l'attaquant. Vert à gauche (toi), rouge à droite (ennemi).
  return (
    <div className={`flex ${ally ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-2.5 py-1 text-[12px] ${
          ally
            ? 'border-l-2 border-emerald-400 bg-emerald-500/10 text-emerald-100'
            : 'border-r-2 border-rose-400 bg-rose-500/10 text-right text-rose-100'
        }`}
      >
        <span className="mr-1 inline-flex align-middle">
          <UiIcon name={ally ? 'attack' : 'attackEnemy'} size={13} color="currentColor" />
        </span>
        {e.message}
      </div>
    </div>
  );
}

type Tally = { dealt: number; taken: number; healed: number };

/**
 * Agrège dégâts infligés / subis / soins par combattant sur tout le combat. Les
 * INVOCATIONS (squelettes du Nécromancien…) sont repliées sur leur INVOCATEUR :
 * leurs dégâts infligés et subis sont crédités au héros qui les a invoqués
 * (`summonerIdOf`), pas comptés à part.
 */
function computeRecap(events: CombatEvent[]): Map<string, Tally> {
  const tally = new Map<string, Tally>();
  const get = (id: string): Tally => {
    const key = summonerIdOf(id); // invocation → invocateur
    let t = tally.get(key);
    if (!t) {
      t = { dealt: 0, taken: 0, healed: 0 };
      tally.set(key, t);
    }
    return t;
  };
  for (const e of events) {
    if (e.type === 'attack') {
      if (e.damage <= 0) continue;
      get(e.targetId).taken += e.damage;
      // Auteur des dégâts : `sourceId` (DoT) sinon l'attaquant. On ignore les
      // auto-dégâts non attribués (vieux tics de poison sans source enregistrée).
      const dealer = e.sourceId ?? (e.actorId !== e.targetId ? e.actorId : null);
      if (dealer) get(dealer).dealt += e.damage;
    } else if (e.type === 'heal' && e.amount > 0) {
      get(e.actorId).healed += e.amount;
    }
  }
  return tally;
}

function RecapStat({ name, value, tint }: { name: 'attack' | 'bleed' | 'heal'; value: number; tint?: string }) {
  return (
    <span
      className={`flex items-center gap-1 tabular-nums ${value > 0 ? '' : 'opacity-30'}`}
      style={tint && value > 0 ? { color: tint } : undefined}
    >
      <UiIcon name={name} size={12} color="currentColor" />
      {value}
    </span>
  );
}

/** Tableau récapitulatif de fin de combat : dégâts infligés / subis / soins. */
function CombatRecap({
  events,
  final_state,
}: {
  events: CombatEvent[];
  final_state: CombatantFinalState[];
}) {
  const tally = useMemo(() => computeRecap(events), [events]);
  const zero: Tally = { dealt: 0, taken: 0, healed: 0 };

  const rowsFor = (side: Side) =>
    final_state
      // Les invocations ne sont pas des lignes à part : leurs stats sont déjà
      // repliées sur l'invocateur (voir computeRecap).
      .filter((c) => c.side === side && !isSummonId(c.id))
      .map((c) => {
        const t = tally.get(c.id) ?? zero;
        return (
          <div
            key={c.id}
            className="flex items-center justify-between gap-2 rounded-md bg-black/20 px-2 py-1 text-[11px]"
          >
            <span className="min-w-0 flex-1 truncate text-[var(--color-ink)]">{c.name}</span>
            <div className="flex items-center gap-2.5 text-[var(--color-muted)]">
              <RecapStat name="attack" value={t.dealt} tint="#fca5a5" />
              <RecapStat name="bleed" value={t.taken} />
              <RecapStat name="heal" value={t.healed} tint="#6ee7b7" />
            </div>
          </div>
        );
      });

  return (
    <div className="mt-2 rounded-lg border border-[var(--color-edge)] bg-white/[0.02] p-2">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted)]">
          Récap du combat
        </span>
        <span className="flex items-center gap-2.5 text-[9px] uppercase tracking-wide text-[var(--color-muted)]">
          <span className="flex items-center gap-1">
            <UiIcon name="attack" size={11} color="currentColor" /> infligés
          </span>
          <span className="flex items-center gap-1">
            <UiIcon name="bleed" size={11} color="currentColor" /> subis
          </span>
          <span className="flex items-center gap-1">
            <UiIcon name="heal" size={11} color="currentColor" /> soins
          </span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">{rowsFor('ally')}</div>
        <div className="space-y-1">{rowsFor('enemy')}</div>
      </div>
    </div>
  );
}

export function CombatReplay({
  combat,
  onClose,
  title = 'Replay du dernier combat',
  footer,
  live = false,
  startHp,
  onDone,
  headerExtra,
  enemyKind = 'normal',
  tourAnchors = false,
}: {
  combat: StoredCombat;
  onClose: () => void;
  title?: string;
  footer?: ReactNode;
  /** Nature des ennemis (donjon/arc/raid) : change l'icône côté ennemi. Défaut : monstre. */
  enemyKind?: EnemyKind;
  /** Contenu additionnel dans l'en-tête (ex : toggle « combat auto »), toujours visible. */
  headerExtra?: ReactNode;
  /**
   * Mode « temps réel » (premier visionnage d'un combat déjà résolu) : on ne peut
   * ni accélérer/passer, ni fermer — seulement abandonner. Illusion de live.
   * En mode revue (false), on garde « Passer » et la croix de fermeture.
   */
  live?: boolean;
  /** PV de DÉPART par combattant (id → PV), pour les donjons où les PV se reportent. */
  startHp?: Record<string, number>;
  /** Appelé une fois quand le combat a fini de se dérouler (pour l'enchaînement auto). */
  onDone?: () => void;
  /** Pose des ancrages `data-tour` (fenêtre + vitesse) pour le tutoriel. */
  tourAnchors?: boolean;
}) {
  const [visible, setVisible] = useState(1);
  const [speed, setSpeed] = useState<Speed>(loadSpeed);
  const [paused, setPaused] = useState(false);
  const total = combat.events.length;
  const done = visible >= total;

  function changeSpeed(s: Speed) {
    setSpeed(s);
    persistSpeed(s);
  }
  const logRef = useRef<HTMLDivElement>(null);

  // id de combattant → classe (les combattants alliés SONT des héros du joueur).
  const { data: heroes } = useHeroes();
  const classById = useMemo(
    () => new Map((heroes ?? []).map((h) => [h.id, h.classId])),
    [heroes],
  );

  const sideById = useMemo(
    () => new Map(combat.final_state.map((c) => [c.id, c.side])),
    [combat.final_state],
  );

  // Position de lecture pilotée par l'HORLOGE, pas par le nombre de ticks. Un
  // `setTimeout` par event (ancienne approche) se faisait bornider à 1 s dans un
  // onglet en arrière-plan : la lecture tombait à 1 event/s et le sélecteur de
  // vitesse devenait inerte. Ici chaque réveil calcule la position due au temps
  // ÉCOULÉ et rattrape d'un coup — un réveil bridé révèle N events au lieu d'un.
  // Bonus : ça permet ×16, dont l'intervalle (12 ms) est sous une frame.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  useEffect(() => {
    if (done || paused) return;
    const perEvent = REVEAL_MS / speed;
    const startedAt = performance.now();
    const from = visibleRef.current;
    const id = setInterval(
      () => {
        const due = from + Math.floor((performance.now() - startedAt) / perEvent);
        setVisible((v) => (due > v ? Math.min(due, total) : v));
      },
      Math.max(perEvent, MIN_TICK_MS),
    );
    return () => clearInterval(id);
    // `visible` est volontairement HORS deps : il change à chaque tick et
    // ré-ancrerait l'horloge en boucle. L'ancre est relue via la ref au (re)démarrage.
  }, [speed, paused, done, total]);

  // Enchaînement auto : notifie une seule fois quand le combat est terminé.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const firedRef = useRef(false);
  useEffect(() => {
    if (done && !firedRef.current) {
      firedRef.current = true;
      onDoneRef.current?.();
    }
  }, [done]);

  useEffect(() => {
    // Le scroll « smooth » ne suit pas quand les événements défilent vite (×2/×4) :
    // l'animation dure plus longtemps que l'intervalle de révélation → on reste en
    // arrière. Instantané dès qu'on accélère, smooth seulement à vitesse normale.
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: speed > 1 ? 'auto' : 'smooth',
    });
  }, [visible, speed]);

  const shown = combat.events.slice(0, visible);

  // NB : ces deux memos dépendent de `visible` (un nombre) et NON de `shown`, qui est
  // un tableau recréé à chaque rendu — sa dépendance invalidait le cache en
  // permanence, faisant re-balayer tout l'historique à chaque rendu, même ceux sans
  // rapport (pause, chargement des héros…).
  const hpMap = useMemo(() => {
    // PV de départ : reportés (donjon) si fournis, sinon PV max (combat frais).
    const map = new Map(combat.final_state.map((c) => [c.id, startHp?.[c.id] ?? c.maxHp]));
    for (const e of combat.events.slice(0, visible)) {
      if (e.type === 'attack' || e.type === 'heal') map.set(e.targetId, e.targetHpAfter);
    }
    return map;
  }, [combat.final_state, combat.events, visible, startHp]);

  // Barrière courante par combattant (reconstruite depuis les events).
  const barrierMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of combat.events.slice(0, visible)) {
      if (e.type === 'status' && typeof e.barrier === 'number') map.set(e.combatantId, e.barrier);
      else if (e.type === 'attack' && typeof e.barrier === 'number') map.set(e.targetId, e.barrier);
    }
    return map;
  }, [combat.events, visible]);

  const allies = combat.final_state.filter((c) => c.side === 'ally');
  const enemies = combat.final_state.filter((c) => c.side === 'enemy');

  // Construit les lignes du journal avec des séparateurs de manche. On ne rend que
  // les LOG_WINDOW dernières lignes (anti-lag) ; la clé = index d'origine pour que
  // React réutilise les nœuds (pas de re-montage/re-animation à chaque révélation).
  const rows: ReactNode[] = [];
  const startIdx = Math.max(0, shown.length - LOG_WINDOW);
  if (startIdx > 0) {
    rows.push(
      <div
        key="log-truncated"
        className="py-1 text-center text-[9px] uppercase tracking-widest text-[var(--color-muted)]/50"
      >
        ⋯ {startIdx} ligne{startIdx > 1 ? 's' : ''} plus haut
      </div>,
    );
  }
  let lastRound = 0;
  shown.slice(startIdx).forEach((e, j) => {
    const i = startIdx + j;
    if (e.type === 'end') return; // le bandeau final couvre déjà l'issue
    if (e.round !== lastRound) {
      lastRound = e.round;
      rows.push(
        <div key={`round-${e.round}`} className="flex items-center gap-2 py-1">
          <div className="h-px flex-1 bg-[var(--color-edge)]" />
          <span className="text-[9px] uppercase tracking-widest text-[var(--color-muted)]">
            Manche {e.round}
          </span>
          <div className="h-px flex-1 bg-[var(--color-edge)]" />
        </div>,
      );
    }
    rows.push(
      <div key={i} className="anim-float">
        <LogLine e={e} side={eventSide(e, sideById)} />
      </div>,
    );
  });

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div
        {...(tourAnchors ? { 'data-tour': 'tour-combat-window' } : {})}
        className="panel anim-pop flex h-[85vh] w-full max-w-2xl flex-col lg:max-w-5xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-edge)] px-5 py-3">
          <h3 className="font-display font-semibold text-[var(--color-ink)]">{title}</h3>
          <div className="flex items-center gap-3">
            {headerExtra}
            {!done && (
              <div
                {...(tourAnchors ? { 'data-tour': 'tour-combat-speed' } : {})}
                className="flex items-center gap-0.5 rounded-lg border border-[var(--color-edge)] bg-black/20 p-0.5"
              >
                <button
                  onClick={() => setPaused((p) => !p)}
                  title={paused ? 'Reprendre' : 'Pause'}
                  aria-label={paused ? 'Reprendre' : 'Pause'}
                  className={`rounded px-1.5 py-0.5 text-[11px] font-semibold leading-none transition ${
                    paused
                      ? 'bg-[var(--color-arcane)]/25 text-[var(--color-ink)]'
                      : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {paused ? '▶' : '⏸'}
                </button>
                <span className="mx-0.5 h-3 w-px bg-[var(--color-edge)]" />
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => changeSpeed(s)}
                    title={`Vitesse ×${s}`}
                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold transition ${
                      speed === s
                        ? 'bg-[var(--color-arcane)]/25 text-[var(--color-ink)]'
                        : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                    }`}
                  >
                    ×{s}
                  </button>
                ))}
              </div>
            )}
            {!done && !live && (
              <button
                onClick={() => setVisible(combat.events.length)}
                className="text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              >
                Passer »
              </button>
            )}
            {!live && (
              <button
                onClick={onClose}
                className="text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/*
          Corps : sur grand écran (lg+) le VISUEL (arène + barres + légende) et le
          JOURNAL passent CÔTE À CÔTE — le journal prend toute la hauteur à droite,
          plus de logs rognés à quelques lignes en bas. Sur mobile/tablette, on
          reste empilé (le journal sous le visuel, faute de largeur horizontale).
        */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Colonne VISUEL */}
          <div className="flex shrink-0 flex-col lg:min-h-0 lg:w-[52%] lg:overflow-y-auto lg:border-r lg:border-[var(--color-edge)]">
            {/* Arène animée : incarne le combat au-dessus des barres de vie. */}
            <div className="px-5 pt-3">
              <CombatArena
                allies={allies}
                enemies={enemies}
                classById={classById}
                enemyKind={enemyKind}
                event={visible > 0 ? combat.events[visible - 1] : undefined}
                eventIndex={visible}
                hpMap={hpMap}
                speed={speed}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 px-5 py-4">
              <div className="space-y-2 rounded-lg bg-emerald-500/[0.06] p-2">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" /> Ton équipe
                </div>
                {orderAlliesWithSummons(allies).map(({ c, nested }) => (
                  <HpBar
                    key={c.id}
                    c={c}
                    hp={hpMap.get(c.id) ?? c.maxHp}
                    barrier={barrierMap.get(c.id) ?? 0}
                    classId={classById.get(c.id)}
                    enemyKind={enemyKind}
                    nested={nested}
                  />
                ))}
              </div>
              <div className="space-y-2 rounded-lg bg-rose-500/[0.06] p-2">
                <div className="flex items-center justify-end gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-rose-300">
                  Ennemis <span className="h-2 w-2 rounded-full bg-rose-400" />
                </div>
                {enemies.map((c) => (
                  <HpBar
                    key={c.id}
                    c={c}
                    hp={hpMap.get(c.id) ?? c.maxHp}
                    barrier={barrierMap.get(c.id) ?? 0}
                    classId={undefined}
                    enemyKind={enemyKind}
                  />
                ))}
              </div>
            </div>

            {/* Légende : lève l'ambiguïté toi (gauche/vert) vs ennemis (droite/rouge) */}
            <div className="flex items-center justify-center gap-4 border-y border-[var(--color-edge)] py-1.5 text-[10px] text-[var(--color-muted)] lg:border-b-0">
              <span className="flex items-center gap-1 text-emerald-300">
                ◀ <UiIcon name="attack" size={12} color="currentColor" />
                <span className="text-[var(--color-muted)]">Tes actions</span>
              </span>
              <span className="flex items-center gap-1 text-rose-300">
                <span className="text-[var(--color-muted)]">Ennemis</span>
                <UiIcon name="attackEnemy" size={12} color="currentColor" /> ▶
              </span>
            </div>
          </div>

          {/* Colonne JOURNAL (scrollable, pleine hauteur à droite en lg+) */}
          <div ref={logRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 py-3">
            {rows}
            {done && <CombatRecap events={combat.events} final_state={combat.final_state} />}
          </div>
        </div>

        {/* Combat live en cours : la seule sortie est l'abandon. */}
        {live && !done && (
          <div className="border-t border-[var(--color-edge)] px-5 py-3 text-center">
            <button
              onClick={onClose}
              className="btn btn-ghost text-xs"
              title="Quitter le combat en cours (abandon)"
            >
              Abandonner le combat
            </button>
          </div>
        )}

        {done && (
          <div className="border-t border-[var(--color-edge)] px-5 py-3 text-center">
            <span
              className={`flex items-center justify-center gap-1.5 font-display text-lg font-bold ${
                combat.result === 'win' ? 'text-[var(--color-gold)]' : 'text-[var(--color-ember)]'
              }`}
            >
              <UiIcon
                name={combat.result === 'win' ? 'victory' : 'defeat'}
                size={20}
                color="currentColor"
              />
              {combat.result === 'win' ? 'Victoire' : 'Défaite'}
            </span>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
