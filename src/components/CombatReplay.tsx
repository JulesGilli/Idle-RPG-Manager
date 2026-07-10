import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { CombatEvent, CombatantFinalState, Side, StatusType } from '@shared/combat';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { STATUS_GLYPH, syntyUrl, classWeaponCleanUrl } from '@/lib/synty';
import { classMeta } from '@/lib/gameUi';
import { useHeroes } from '@/features/heroes/useHeroes';

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

const REVEAL_MS = 380;

/** Vitesse de lecture retenue entre combats (persiste le ×4 d'une étape à l'autre). */
function loadSpeed(): 1 | 2 | 4 {
  try {
    const v = Number(localStorage.getItem('combat-speed'));
    return v === 2 || v === 4 ? v : 1;
  } catch {
    return 1;
  }
}
function persistSpeed(s: 1 | 2 | 4): void {
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
}: {
  c: CombatantFinalState;
  hp: number;
  barrier: number;
  classId: string | undefined;
  enemyKind: EnemyKind;
}) {
  const pct = Math.max(0, Math.min(100, Math.round((hp / c.maxHp) * 100)));
  const barPct = barrier > 0 ? Math.max(0, Math.min(100, Math.round((barrier / c.maxHp) * 100))) : 0;
  const dead = hp <= 0;
  const ally = c.side === 'ally';
  return (
    <div className={`transition-opacity ${dead ? 'opacity-40' : ''}`}>
      <div className="flex justify-between text-[11px]">
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
      <div className="mt-0.5 flex h-1.5 gap-px overflow-hidden rounded-full bg-black/50">
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

/** Agrège dégâts infligés / subis / soins par combattant sur tout le combat. */
function computeRecap(events: CombatEvent[]): Map<string, Tally> {
  const tally = new Map<string, Tally>();
  const get = (id: string): Tally => {
    let t = tally.get(id);
    if (!t) {
      t = { dealt: 0, taken: 0, healed: 0 };
      tally.set(id, t);
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
      .filter((c) => c.side === side)
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
}) {
  const [visible, setVisible] = useState(1);
  const [speed, setSpeed] = useState<1 | 2 | 4>(loadSpeed);
  const [paused, setPaused] = useState(false);
  const done = visible >= combat.events.length;

  function changeSpeed(s: 1 | 2 | 4) {
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

  useEffect(() => {
    if (done || paused) return;
    const timer = setTimeout(() => setVisible((v) => v + 1), REVEAL_MS / speed);
    return () => clearTimeout(timer);
  }, [visible, done, speed, paused]);

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
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [visible]);

  const shown = combat.events.slice(0, visible);

  const hpMap = useMemo(() => {
    // PV de départ : reportés (donjon) si fournis, sinon PV max (combat frais).
    const map = new Map(combat.final_state.map((c) => [c.id, startHp?.[c.id] ?? c.maxHp]));
    for (const e of shown) {
      if (e.type === 'attack' || e.type === 'heal') map.set(e.targetId, e.targetHpAfter);
    }
    return map;
  }, [combat.final_state, shown, startHp]);

  // Barrière courante par combattant (reconstruite depuis les events).
  const barrierMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of shown) {
      if (e.type === 'status' && typeof e.barrier === 'number') map.set(e.combatantId, e.barrier);
      else if (e.type === 'attack' && typeof e.barrier === 'number') map.set(e.targetId, e.barrier);
    }
    return map;
  }, [shown]);

  const allies = combat.final_state.filter((c) => c.side === 'ally');
  const enemies = combat.final_state.filter((c) => c.side === 'enemy');

  // Construit les lignes du journal avec des séparateurs de manche.
  const rows: ReactNode[] = [];
  let lastRound = 0;
  shown.forEach((e, i) => {
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
      <div className="panel anim-pop flex h-[85vh] w-full max-w-2xl flex-col">
        <div className="flex items-center justify-between border-b border-[var(--color-edge)] px-5 py-3">
          <h3 className="font-display font-semibold text-[var(--color-ink)]">{title}</h3>
          <div className="flex items-center gap-3">
            {headerExtra}
            {!done && (
              <div className="flex items-center gap-0.5 rounded-lg border border-[var(--color-edge)] bg-black/20 p-0.5">
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
                {([1, 2, 4] as const).map((s) => (
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

        <div className="grid grid-cols-2 gap-4 px-5 py-4">
          <div className="space-y-2 rounded-lg bg-emerald-500/[0.06] p-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Ton équipe
            </div>
            {allies.map((c) => (
              <HpBar
                key={c.id}
                c={c}
                hp={hpMap.get(c.id) ?? c.maxHp}
                barrier={barrierMap.get(c.id) ?? 0}
                classId={classById.get(c.id)}
                enemyKind={enemyKind}
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
        <div className="flex items-center justify-center gap-4 border-y border-[var(--color-edge)] py-1.5 text-[10px] text-[var(--color-muted)]">
          <span className="flex items-center gap-1 text-emerald-300">
            ◀ <UiIcon name="attack" size={12} color="currentColor" />
            <span className="text-[var(--color-muted)]">Tes actions</span>
          </span>
          <span className="flex items-center gap-1 text-rose-300">
            <span className="text-[var(--color-muted)]">Ennemis</span>
            <UiIcon name="attackEnemy" size={12} color="currentColor" /> ▶
          </span>
        </div>

        <div ref={logRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 py-3">
          {rows}
          {done && <CombatRecap events={combat.events} final_state={combat.final_state} />}
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
