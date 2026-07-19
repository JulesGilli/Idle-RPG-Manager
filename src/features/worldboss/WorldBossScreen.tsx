import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHeroes } from '@/features/heroes/useHeroes';
import { useHeroAvailability, heroIsBusy, HERO_STATUS_LABEL } from '@/features/heroes/useHeroAvailability';
import { useAuthStore } from '@/store/authStore';
import { classMeta, compactNumber } from '@/lib/gameUi';
import { classWeaponCleanUrl } from '@/lib/synty';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { BackToActivities } from '@/components/BackToActivities';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import { WORLD_BOSS_TITLE_ATK_MULT, tierProgress } from '@shared/progression/worldBoss';
import { WorldBossArt } from './WorldBossArt';
import {
  useWorldBoss,
  type WorldBossHitResponse,
  type WorldBossLeader,
  type WorldBossState,
  type WorldBossTierDef,
} from './useWorldBoss';

const MAX_TEAM = 5;
const ACCENT = '#f5b544';

function toStored(c: WorldBossHitResponse['combat']): StoredCombat {
  return { rounds: c.rounds, result: c.result, events: c.events, final_state: c.final_state };
}

/** Récompense d'un palier en chip compacte (or + larmes). */
function RewardChips({ reward }: { reward: { gold?: number; tears?: number } }) {
  return (
    <>
      {(reward.gold ?? 0) > 0 && <span className="text-[var(--color-gold-soft)]">{compactNumber(reward.gold ?? 0)} or</span>}
      {(reward.tears ?? 0) > 0 && <span className="ml-1 text-sky-300">+{reward.tears} 💧</span>}
    </>
  );
}

/** Le boss dédié : colosse démoniaque ailé, imposant et animé. */
function BossStage() {
  return (
    <div className="mx-auto flex w-full items-end justify-center">
      <WorldBossArt accent={ACCENT} size={230} />
    </div>
  );
}

/**
 * Jauge de « vie » du boss jusqu'au PROCHAIN palier seulement (pas le seuil final).
 * On montre la progression depuis le palier précédent vers le prochain, + sa récompense.
 */
function NextTierGauge({ total, tiers }: { total: number; tiers: WorldBossTierDef[] }) {
  const { unlocked, from, next } = tierProgress(total, tiers);

  if (!next) {
    return (
      <div className="rounded-lg bg-amber-500/10 p-2.5 text-center text-sm text-amber-200">
        ★ Tous les paliers débloqués — {compactNumber(total)} dégâts collectifs !
      </div>
    );
  }

  const span = Math.max(1, next.threshold - from);
  const pct = Math.max(0, Math.min(100, ((total - from) / span) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-[var(--color-muted)]">
          Prochain palier {next.idx} · récompense <RewardChips reward={next.reward} />
        </span>
        <span className="tabular-nums font-semibold text-[var(--color-ink)]">
          {compactNumber(total)} / {compactNumber(next.threshold)}
        </span>
      </div>
      <div className="relative h-4 overflow-hidden rounded-full bg-black/50">
        <div
          className="h-full bg-gradient-to-r from-amber-600 to-amber-300 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-[var(--color-muted)]">
        {unlocked} palier{unlocked > 1 ? 's' : ''} déjà débloqué{unlocked > 1 ? 's' : ''} cette semaine.
      </p>
    </div>
  );
}

function Leaderboard({ rows, meId }: { rows: WorldBossLeader[]; meId: string | undefined }) {
  return (
    <div className="panel space-y-2 p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-muted)]">
        <UiIcon name="leaderboard" size={15} color="var(--color-gold-soft)" /> Classement de la semaine
      </h3>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li
            key={r.player_id}
            className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm ${
              r.player_id === meId ? 'bg-[var(--color-arcane)]/15 ring-1 ring-[var(--color-arcane)]/40' : 'bg-black/20'
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-5 text-right text-xs font-semibold text-[var(--color-muted)]">{r.rank}</span>
              <span className="truncate text-[var(--color-ink)]">
                {r.name}
                {r.rank === 1 && <span className="ml-1 text-amber-300" title="Fléau de la Semaine">👑</span>}
              </span>
            </span>
            <span className="tabular-nums font-semibold text-[var(--color-gold-soft)]">{compactNumber(r.damage)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WorldBossScreen() {
  const { state, hit, claim } = useWorldBoss();
  const { data: heroes } = useHeroes();
  const availability = useHeroAvailability();
  const meId = useAuthStore((s) => s.user?.id);

  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<WorldBossHitResponse | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data: WorldBossState | undefined = state.data;
  const heroList = heroes ?? [];
  const weekday = Boolean(data?.weekday);
  const alreadyHit = Boolean(data?.already_hit_today);
  const bossName = data?.boss_name ?? 'Boss de la Semaine';

  // Le boss de la semaine accepte les héros OCCUPÉS, contrairement aux autres
  // activités. La frappe est instantanée et ne mobilise personne : le combat est
  // résolu d'un coup côté serveur contre un sac de frappe figé, sans immobiliser
  // l'escouade ni interrompre ce qu'elle fait ailleurs. Rien ne justifiait donc
  // d'écarter un héros parti en farm ou en expédition — et comme la frappe est
  // limitée à une par jour, s'en priver revenait à gâcher son unique tentative.
  function toggleHero(id: string) {
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((h) => h !== id) : cur.length < MAX_TEAM ? [...cur, id] : cur,
    );
  }

  function doHit() {
    if (picked.length === 0) return;
    setError(null);
    setResult(null);
    setShowReplay(false);
    hit.mutate(picked, {
      onSuccess: (r) => {
        setResult(r);
        setShowReplay(true);
      },
      onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
    });
  }

  function doClaim() {
    setError(null);
    claim.mutate(undefined, { onError: (e) => setError(e instanceof Error ? e.message : 'Erreur') });
  }

  const canHit = weekday && !alreadyHit && picked.length > 0 && !hit.isPending;
  const claimableGold = data?.claimable_gold ?? 0;
  const claimableTears = data?.claimable_tears ?? 0;

  return (
    <section className="anim-fade space-y-5">
      <BackToActivities />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="heading flex items-center gap-2 text-2xl">
            <UiIcon name="boss" size={24} color={ACCENT} /> Boss de la Semaine
          </h2>
          <p className="text-sm text-[var(--color-muted)]">
            Boss communautaire immortel. Frappe-le <strong>une fois par jour</strong> (lun→ven) : les dégâts de
            tout le serveur s'additionnent et débloquent des <strong>paliers d'or pour tous</strong>. Le week-end,
            place au <strong>double XP &amp; butin</strong> en campagne.
          </p>
        </div>
        <Link to="/" className="btn btn-ghost text-xs">
          ← Activités
        </Link>
      </div>

      {state.isLoading && <p className="text-[var(--color-muted)]">Chargement…</p>}

      {data?.active && (
        <>
          <div className="panel space-y-3 overflow-hidden p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-display text-lg font-bold text-[var(--color-ink)]">
                <UiIcon name="dragon" size={20} color={ACCENT} /> {bossName}
              </span>
              <span className="chip bg-white/5 text-[11px] text-[var(--color-muted)]">immortel · dégâts mutualisés</span>
            </div>
            <BossStage />
            <NextTierGauge total={data.total_damage ?? 0} tiers={data.tiers} />
            {(data.my_damage ?? 0) > 0 && (
              <p className="text-xs text-[var(--color-muted)]">
                Ta contribution cette semaine :{' '}
                <span className="font-semibold text-[var(--color-gold-soft)]">{compactNumber(data.my_damage ?? 0)}</span> dégâts
              </p>
            )}
          </div>

          {/* Titre éphémère équipé (le cas échéant). */}
          {data.my_title && (
            <div className="panel flex items-center gap-2 border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <span className="text-amber-300">👑</span>
              <span className="text-[var(--color-ink)]">
                Titre <strong>{data.my_title.title}</strong> —{' '}
                <span className="text-amber-200">+{Math.round((WORLD_BOSS_TITLE_ATK_MULT - 1) * 100)}% ATK</span> tant qu'il est équipé
              </span>
            </div>
          )}

          {/* Réclamation des paliers communs débloqués. */}
          {(claimableGold > 0 || claimableTears > 0) && (
            <div className="panel anim-pop flex flex-wrap items-center justify-between gap-3 border border-amber-500/40 bg-amber-500/10 p-4">
              <span className="flex items-center gap-2 font-display font-bold text-amber-200">
                <UiIcon name="victory" size={18} color="currentColor" /> Paliers à récupérer :{' '}
                {compactNumber(claimableGold)} or
                {claimableTears > 0 && <span className="text-sky-300">+ {claimableTears} 💧</span>}
              </span>
              <button onClick={doClaim} disabled={claim.isPending} className="btn btn-primary text-sm">
                {claim.isPending ? 'Récupération…' : 'Récupérer'}
              </button>
            </div>
          )}

          {/* Frappe du jour, ou message de repos week-end / déjà frappé. */}
          {!weekday ? (
            <div className="panel space-y-1 p-4 text-center text-sm">
              <p className="font-display font-bold text-[var(--color-ink)]">Le boss se repose ce week-end 🛌</p>
              <p className="text-[var(--color-muted)]">
                Profites-en : <strong>double XP &amp; butin</strong> en campagne. Le boss revient lundi.
              </p>
            </div>
          ) : alreadyHit ? (
            <div className="panel space-y-1 p-4 text-center text-sm">
              <p className="font-display font-bold text-[var(--color-ink)]">Frappe du jour effectuée ✔</p>
              <p className="text-[var(--color-muted)]">
                Tu as infligé <span className="font-semibold text-[var(--color-gold-soft)]">{compactNumber(data.my_today_damage ?? 0)}</span>{' '}
                dégâts aujourd'hui. Reviens demain pour frapper à nouveau.
              </p>
            </div>
          ) : (
            <>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--color-muted)]">
                    Ton escouade · {picked.length}/{MAX_TEAM}
                  </h3>
                  {picked.length > 0 && (
                    <button onClick={() => setPicked([])} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-ink)]">
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
                          // Occupé = sélectionnable, mais on le SIGNALE : le joueur
                          // doit savoir que ce héros est ailleurs, pas se le voir
                          // refuser.
                          title={
                            busy
                              ? `${h.name} — ${HERO_STATUS_LABEL[availability.get(h.id)!]} (utilisable ici)`
                              : h.name
                          }
                          className={`panel flex flex-col items-center gap-1 p-2.5 text-center transition ${
                            chosen ? 'ring-2 ring-[var(--color-arcane)]' : 'opacity-80 hover:opacity-100'
                          }`}
                        >
                          <SyntyGlyph src={classWeaponCleanUrl(h.classId)} color={meta.accent} size={30} />
                          <span className="w-full truncate text-xs font-medium text-[var(--color-ink)]">{h.name}</span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--color-gold)]">
                            <UiIcon name="power" size={11} /> {h.power}
                          </span>
                          {busy && (
                            <span className="w-full truncate text-[9px] text-[var(--color-muted)]">
                              {HERO_STATUS_LABEL[availability.get(h.id)!]}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-[var(--color-ember)]">{error}</p>}

              <button onClick={doHit} disabled={!canHit} className="btn btn-primary w-full text-sm">
                {hit.isPending ? 'Assaut…' : 'Frapper le boss (1×/jour)'}
              </button>
            </>
          )}

          {/* Erreurs de réclamation / frappe hors du bloc escouade. */}
          {error && (alreadyHit || !weekday) && <p className="text-sm text-[var(--color-ember)]">{error}</p>}

          {/* Contribution de la frappe (hors replay). */}
          {result && !showReplay && (
            <div className="panel anim-pop space-y-2 p-4">
              <span className="flex items-center gap-1.5 font-display text-lg font-bold text-[var(--color-gold)]">
                <UiIcon name="attack" size={20} color="currentColor" /> Contribution : {compactNumber(result.damage)} dégâts
              </span>
              <button onClick={() => setShowReplay(true)} className="btn btn-arcane w-full text-sm">
                ▶ Revoir le combat
              </button>
            </div>
          )}

          {data.leaderboard && data.leaderboard.length > 0 && <Leaderboard rows={data.leaderboard} meId={meId} />}
        </>
      )}

      {result && showReplay && (
        <CombatReplay
          combat={toStored(result.combat)}
          enemyKind="boss"
          title={`${bossName} — ${compactNumber(result.damage)} dégâts`}
          onClose={() => setShowReplay(false)}
        />
      )}
    </section>
  );
}
