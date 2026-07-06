import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHeroes } from '@/features/heroes/useHeroes';
import {
  useHeroAvailability,
  heroIsBusy,
  HERO_STATUS_LABEL,
} from '@/features/heroes/useHeroAvailability';
import { useLevelProgress } from '@/features/maps/useMaps';
import { classMeta } from '@/lib/gameUi';
import { classWeaponCleanUrl, MAP_ART } from '@/lib/synty';
import { SyntyGlyph, SyntyImg } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { resourceMeta } from '@/hooks/useResources';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import type { DungeonCombat } from '@/features/dungeon/useDungeon';
import {
  useArcBosses,
  useArcProgress,
  useResolveArcBoss,
  type ArcBossRow,
  type ArcBossRunResponse,
} from './useArcBoss';

const MAX_TEAM = 5;

function toStored(c: DungeonCombat): StoredCombat {
  return { rounds: c.rounds, result: c.result, events: c.events, final_state: c.finalState };
}

export function ArcBossScreen() {
  const { data: bosses, isLoading } = useArcBosses();
  const { data: cleared } = useArcProgress();
  const { data: levelsDone } = useLevelProgress();
  const { data: heroes } = useHeroes();
  const availability = useHeroAvailability();
  const resolve = useResolveArcBoss();

  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<ArcBossRunResponse | null>(null);
  const [replayIdx, setReplayIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const heroList = heroes ?? [];
  const clearedSet = cleared ?? new Set<string>();
  const doneSet = levelsDone ?? new Set<string>();

  // Le boss d'arc « courant » : le premier non encore vaincu.
  const boss = (bosses ?? []).find((b) => !clearedSet.has(b.id)) ?? (bosses ?? [])[0] ?? null;
  const isCleared = boss ? clearedSet.has(boss.id) : false;
  const isReady = boss?.required_level_id ? doneSet.has(boss.required_level_id) : true;

  function toggleHero(id: string) {
    if (heroIsBusy(availability.get(id))) return;
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((h) => h !== id) : cur.length < MAX_TEAM ? [...cur, id] : cur,
    );
  }

  function launch() {
    if (!boss || picked.length === 0) return;
    setError(null);
    setResult(null);
    setReplayIdx(null);
    resolve.mutate(
      { arcBossId: boss.id, heroIds: picked },
      {
        onSuccess: (r) => {
          setResult(r);
          setReplayIdx(0);
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  }

  const canLaunch = Boolean(boss) && !isCleared && isReady && picked.length > 0 && !resolve.isPending;

  return (
    <section className="anim-fade space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="heading flex items-center gap-2 text-2xl">
            <SyntyImg src={MAP_ART.dragon} size={26} />
            Boss d'arc
          </h2>
          <p className="text-sm text-[var(--color-muted)]">
            La rencontre qui clôt un arc. Terrasse-le pour <strong>débloquer l'arc suivant</strong> et
            son <strong>tier de matériaux</strong> de craft.
          </p>
        </div>
        <Link to="/" className="btn btn-ghost text-xs">
          ← Carte
        </Link>
      </div>

      {/* Arène : boss dressé si un défi est dispo, sinon vide */}
      <div className="panel overflow-hidden p-0">
        <ArcArena active={Boolean(boss) && !isCleared} />
      </div>

      {isLoading && <p className="text-[var(--color-muted)]">Chargement…</p>}
      {!isLoading && !boss && (
        <p className="text-sm text-[var(--color-muted)]">Aucun boss d'arc pour l'instant.</p>
      )}

      {boss && (
        <ArcBossCard boss={boss} cleared={isCleared} ready={isReady} />
      )}

      {boss && !isCleared && (
        <>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--color-muted)]">
                Ton escouade · {picked.length}/{MAX_TEAM}
              </h3>
              {picked.length > 0 && (
                <button
                  onClick={() => setPicked([])}
                  className="text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                >
                  Tout retirer
                </button>
              )}
            </div>
            {heroList.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">Aucun héros — recrute à la Taverne.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {heroList.map((h) => {
                  const busy = heroIsBusy(availability.get(h.id));
                  const chosen = picked.includes(h.id);
                  const meta = classMeta(h.classId);
                  return (
                    <button
                      key={h.id}
                      onClick={() => toggleHero(h.id)}
                      disabled={busy}
                      title={busy ? `${h.name} — ${HERO_STATUS_LABEL[availability.get(h.id)!]}` : h.name}
                      className={`panel flex flex-col items-center gap-1 p-2.5 text-center transition ${
                        busy
                          ? 'cursor-not-allowed opacity-40'
                          : chosen
                            ? 'ring-2 ring-[var(--color-arcane)]'
                            : 'opacity-80 hover:opacity-100'
                      }`}
                    >
                      <SyntyGlyph src={classWeaponCleanUrl(h.classId)} color={meta.accent} size={30} />
                      <span className="w-full truncate text-xs font-medium text-[var(--color-ink)]">
                        {h.name}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--color-gold)]">
                        <UiIcon name="power" size={11} /> {h.power}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {(error || resolve.isError) && (
            <p className="text-sm text-[var(--color-ember)]">
              {error ?? (resolve.error instanceof Error ? resolve.error.message : 'Erreur')}
            </p>
          )}

          <button onClick={launch} disabled={!canLaunch} className="btn btn-primary w-full text-sm">
            {resolve.isPending
              ? 'Affrontement…'
              : !isReady
                ? "Termine d'abord les zones de l'arc"
                : `Défier : ${boss.name}`}
          </button>
        </>
      )}

      {/* Résultat + replay */}
      {result && replayIdx !== null && result.fight_results[replayIdx] && (
        <ArcReplay
          fights={result.fight_results}
          index={replayIdx}
          bossName={boss?.name ?? 'Boss'}
          onIndex={setReplayIdx}
          onClose={() => setReplayIdx(null)}
        />
      )}
      {result && replayIdx === null && <ArcResult run={result} onReplay={() => setReplayIdx(0)} />}
    </section>
  );
}

/* ----------------------------------------------------------------- arène -- */

/** Arène du boss d'arc : colisée sombre. Boss dressé au centre si `active`, sinon vide. */
function ArcArena({ active }: { active: boolean }) {
  const archX = [46, 116, 186, 256, 424, 494, 564, 634];
  const emberBegins = ['0s', '0.6s', '1.2s', '1.8s', '2.4s'];
  return (
    <svg viewBox="0 0 680 250" className="block h-auto w-full" role="img" aria-label="Arène du boss d'arc">
      <defs>
        <linearGradient id="ar-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#120a1c" />
          <stop offset="100%" stopColor="#080510" />
        </linearGradient>
        <radialGradient id="ar-sand" cx="0.5" cy="0.4" r="0.65">
          <stop offset="0%" stopColor={active ? '#3a2e1e' : '#241d14'} />
          <stop offset="100%" stopColor="#0e0a08" />
        </radialGradient>
        <radialGradient id="ar-aura" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ff4b2b" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#b52014" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#b52014" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ar-flame" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ffcf6a" stopOpacity="0.7" />
          <stop offset="60%" stopColor="#c0501f" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#c0501f" stopOpacity="0" />
        </radialGradient>
        <filter id="ar-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x="0" y="0" width="680" height="250" fill="url(#ar-sky)" />
      <circle cx="90" cy="34" r="16" fill="#e9e1c6" opacity="0.12" />
      {[150, 240, 470, 560, 620].map((x, i) => (
        <circle key={i} cx={x} cy={20 + (i % 3) * 9} r={i % 2 ? 1.3 : 0.9} fill="#fff" opacity="0.3" />
      ))}

      {/* Gradins : tier supérieur + rangée d'arches */}
      <rect x="0" y="46" width="680" height="18" fill="#1c1730" />
      {Array.from({ length: 17 }, (_, i) => (
        <rect key={i} x={8 + i * 40} y="42" width="22" height="6" fill="#0d0a18" />
      ))}
      <rect x="0" y="64" width="680" height="90" fill="#231d38" />
      {archX.map((x, i) => (
        <path
          key={i}
          d={`M${x - 20},154 L${x - 20},110 Q${x},92 ${x + 20},110 L${x + 20},154 Z`}
          fill="#0d0a18"
        />
      ))}

      {/* Porte / herse centrale (le boss en émerge) */}
      <path d="M300,154 L300,104 Q340,80 380,104 L380,154 Z" fill="#070510" />
      {[-24, -12, 0, 12, 24].map((k) => (
        <line key={k} x1={340 + k} y1={104 + Math.abs(k) * 0.5} x2={340 + k} y2={154} stroke="#1a1526" strokeWidth="2.5" />
      ))}

      {/* Base de mur + sol de sable */}
      <rect x="0" y="150" width="680" height="24" fill="#140f1e" />
      <ellipse cx="340" cy="204" rx="322" ry="52" fill="url(#ar-sand)" />
      <ellipse cx="340" cy="204" rx="322" ry="52" fill="none" stroke="#2a2016" strokeWidth="2" opacity="0.6" />

      {/* Boss dressé au centre (si un boss est à défier) */}
      {active && (
        <g>
          <ellipse cx="340" cy="172" rx="92" ry="80" fill="url(#ar-aura)">
            <animate attributeName="opacity" values="0.55;0.9;0.55" dur="2.6s" repeatCount="indefinite" />
          </ellipse>
          {/* Corps + membres */}
          <ellipse cx="306" cy="170" rx="13" ry="22" fill="#0b0a14" />
          <ellipse cx="374" cy="170" rx="13" ry="22" fill="#0b0a14" />
          <path d="M312,200 Q300,150 322,140 L358,140 Q380,150 368,200 Z" fill="#0b0a14" />
          {/* Tête + cornes */}
          <ellipse cx="340" cy="130" rx="19" ry="16" fill="#0b0a14" />
          <path d="M327,122 Q314,100 328,96 Q326,110 337,120 Z" fill="#0b0a14" />
          <path d="M353,122 Q366,100 352,96 Q354,110 343,120 Z" fill="#0b0a14" />
          {/* Yeux luisants */}
          <circle cx="333" cy="130" r="2.4" fill="#ffcf4a" filter="url(#ar-glow)">
            <animate attributeName="opacity" values="0.7;1;0.7" dur="1.8s" repeatCount="indefinite" />
          </circle>
          <circle cx="347" cy="130" r="2.4" fill="#ffcf4a" filter="url(#ar-glow)">
            <animate attributeName="opacity" values="0.7;1;0.7" dur="1.8s" repeatCount="indefinite" />
          </circle>
        </g>
      )}

      {/* Braseros (enflammés si un boss est présent, sinon éteints) */}
      {[110, 570].map((bx) => (
        <g key={bx} transform={`translate(${bx},186)`}>
          <path d="M-11,0 L11,0 L8,15 L-8,15 Z" fill="#241a0e" />
          <rect x="-2.5" y="15" width="5" height="10" fill="#1a1208" />
          {active ? (
            <>
              <circle cx="0" cy="-3" r="24" fill="url(#ar-flame)" />
              <g>
                <animateTransform attributeName="transform" type="scale" values="1 1;1.08 1.2;0.94 0.9;1 1" dur="0.5s" repeatCount="indefinite" />
                <path d="M0,-2 C-9,-15 -6,-28 0,-36 C6,-28 9,-15 0,-2 Z" fill="#e8631c" filter="url(#ar-glow)" />
                <path d="M0,-4 C-4,-13 -3,-22 0,-28 C3,-22 4,-13 0,-4 Z" fill="#ffcf5a" />
              </g>
            </>
          ) : (
            <circle cx="0" cy="-1" r="3" fill="#4a2410" />
          )}
        </g>
      ))}

      {/* Braises qui montent (ambiance) quand le boss est là */}
      {active &&
        emberBegins.map((begin, i) => {
          const bx = i % 2 === 0 ? 110 : 570;
          return (
            <circle key={i} cx={bx + (i - 2) * 3} cy="182" r="1.6" fill="#ffb04a">
              <animate attributeName="cy" values="182;150" dur="2.4s" begin={begin} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0" dur="2.4s" begin={begin} repeatCount="indefinite" />
            </circle>
          );
        })}
    </svg>
  );
}

function ArcBossCard({ boss, cleared, ready }: { boss: ArcBossRow; cleared: boolean; ready: boolean }) {
  const waves = boss.monster_sequence?.length ?? 0;
  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-display text-lg font-bold text-[var(--color-ink)]">
          <UiIcon name="dragon" size={20} color="var(--color-gold-soft)" /> {boss.name}
        </span>
        {cleared ? (
          <span className="chip inline-flex items-center gap-1 bg-emerald-500/15 text-[11px] text-emerald-300">
            <UiIcon name="victory" size={12} /> Vaincu
          </span>
        ) : ready ? (
          <span className="chip bg-[var(--color-gold)]/15 text-[11px] text-[var(--color-gold-soft)]">
            Prêt à défier
          </span>
        ) : (
          <span className="chip inline-flex items-center gap-1 bg-white/5 text-[11px] text-[var(--color-muted)]">
            <UiIcon name="lock" size={11} /> Termine l'arc
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-[var(--color-muted)]">
        <span>{waves} combat(s)</span>
        <span className="text-[var(--color-gold-soft)]">Débloque le tier de matériaux {boss.unlocks_tier}</span>
      </div>
    </div>
  );
}

function ArcResult({ run, onReplay }: { run: ArcBossRunResponse; onReplay: () => void }) {
  return (
    <div className="panel anim-pop space-y-3 p-4">
      <span
        className={`flex items-center gap-1.5 font-display text-lg font-bold ${
          run.success ? 'text-[var(--color-gold)]' : 'text-[var(--color-ember)]'
        }`}
      >
        <UiIcon name={run.success ? 'victory' : 'defeat'} size={20} color="currentColor" />
        {run.success ? `${run.arc_boss.name} vaincu — tier ${run.arc_boss.unlocks_tier} débloqué !` : 'Échec'}
      </span>
      {run.loot.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {run.loot.map((d) => (
            <span key={d.resource} className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-ink)]">
              <ResourceIcon resKey={d.resource} /> +{d.amount} {resourceMeta(d.resource).label}
            </span>
          ))}
        </div>
      )}
      <button onClick={onReplay} className="btn btn-arcane w-full text-sm">
        ▶ Revoir les combats ({run.fight_results.length})
      </button>
    </div>
  );
}

function ArcReplay({
  fights,
  index,
  bossName,
  onIndex,
  onClose,
}: {
  fights: ArcBossRunResponse['fight_results'];
  index: number;
  bossName: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const fight = fights[index]!;
  const hasNext = index < fights.length - 1;
  const lost = fight.combat.result === 'loss';
  return (
    <CombatReplay
      key={index}
      combat={toStored(fight.combat)}
      enemyKind={fight.kind}
      onClose={onClose}
      title={`${bossName} — combat ${index + 1}/${fights.length} : ${fight.enemyName}`}
      footer={
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            onClick={() => index > 0 && onIndex(index - 1)}
            disabled={index === 0}
            className="btn btn-ghost text-xs disabled:opacity-40"
          >
            ◀ Précédent
          </button>
          {hasNext && !lost ? (
            <button onClick={() => onIndex(index + 1)} className="btn btn-primary text-xs">
              Combat suivant ▶
            </button>
          ) : (
            <button onClick={onClose} className="btn btn-primary text-xs">
              Voir le bilan
            </button>
          )}
        </div>
      }
    />
  );
}
