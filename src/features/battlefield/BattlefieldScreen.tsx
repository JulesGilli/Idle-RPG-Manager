import { useState } from 'react';
import { useHeroes } from '@/features/heroes/useHeroes';
import { useArc } from '@/features/arc/useArc';
import {
  useBattlefieldStatus,
  useRunBattlefield,
  type BattlefieldRow,
  type BattlefieldRunResult,
} from './useBattlefield';
import {
  BATTLEFIELD_ARC,
  BATTLEFIELD_ENEMY_COUNT,
  BATTLEFIELD_MAX_TEAM,
} from '@shared/progression/battlefield';
import { ClassIcon, UiIcon } from '@/components/synty/GameIcons';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { classMeta } from '@/lib/gameUi';
import { BackToVillage } from '@/components/BackToVillage';
import { useClassLimit } from '@/features/heroes/useClassLimit';
import {
  canAddClass,
  tooManySameClassError,
  MAX_SAME_CLASS_LARGE,
} from '@shared/progression/teamComposition';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import { BattlefieldScene } from './BattlefieldScene';

/**
 * CHAMPS DE BATAILLE — batailles rangées 10 contre 10 (Arc 2).
 *
 * Seul écran du jeu où l'on engage jusqu'à 10 héros. Le joueur en aligne autant
 * qu'il en possède : en sous-effectif il se bat en infériorité, ce qui l'oriente
 * naturellement vers les batailles basses plutôt que de le verrouiller dehors.
 */
export function BattlefieldScreen() {
  const { data: heroes } = useHeroes();
  const { data: status } = useBattlefieldStatus();
  const { currentArc } = useArc();
  const run = useRunBattlefield();

  const [picked, setPicked] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<BattlefieldRunResult | null>(null);
  const [replay, setReplay] = useState<StoredCombat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roster = heroes ?? [];
  const rows = status?.battlefields ?? [];
  const cap = status?.daily_cap ?? 0;
  const used = status?.used_today ?? 0;
  const remaining = Math.max(0, cap - used);
  const isArc2 = currentArc >= BATTLEFIELD_ARC;

  // Par défaut : la plus haute bataille débloquée (celle que le joueur vise).
  const selected =
    rows.find((b) => b.id === selectedId) ?? [...rows].reverse().find((b) => b.unlocked) ?? null;

  // Plafond DOUBLÉ ici : l'équipe fait 10 héros (cf. MAX_SAME_CLASS_LARGE).
  const { classFull } = useClassLimit(roster, picked, MAX_SAME_CLASS_LARGE);

  function toggle(id: string) {
    const h = roster.find((x) => x.id === id);
    if (h && classFull(h.id, h.classId)) return;
    setPicked((cur) =>
      cur.includes(id)
        ? cur.filter((h2) => h2 !== id)
        : cur.length < BATTLEFIELD_MAX_TEAM
          ? [...cur, id]
          : cur,
    );
  }

  /**
   * Engage tout le vivier, dans la limite des 10 places ET du plafond de
   * doublons de classe. Prendre les 10 premiers sans filtrer composerait une
   * équipe que le serveur refuserait — le bouton fabriquerait lui-même l'erreur.
   */
  function pickAll() {
    const chosen: string[] = [];
    const classes: string[] = [];
    for (const h of roster) {
      if (chosen.length >= BATTLEFIELD_MAX_TEAM) break;
      if (!canAddClass(classes, h.classId, MAX_SAME_CLASS_LARGE)) continue;
      chosen.push(h.id);
      classes.push(h.classId);
    }
    setPicked(chosen);
  }

  function launch() {
    if (!selected) return;
    setError(null);
    setResult(null);
    run.mutate(
      { battlefieldId: selected.id, heroIds: picked },
      {
        onSuccess: (r) => {
          setResult(r);
          setReplay(r.combat);
        },
        onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
      },
    );
  }

  const canLaunch =
    isArc2 && Boolean(selected?.unlocked) && picked.length > 0 && remaining > 0 && !run.isPending;

  return (
    <section className="anim-fade space-y-5">
      <BackToVillage />

      <div className="panel relative overflow-hidden">
        {/* Décor : même schéma que la Forge — scène en fond, voile pour la
            lisibilité du titre, texte par-dessus. */}
        <div className="relative h-44 w-full sm:h-52">
          <div className="absolute inset-0">
            <BattlefieldScene />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-panel)] via-[var(--color-panel)]/30 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <h2 className="heading flex items-center gap-2.5 text-2xl">
              <UiIcon name="raid" size={24} color="var(--color-ember)" />
              Champs de bataille
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
              Des batailles rangées : tu engages jusqu'à{' '}
              <strong className="text-[var(--color-ink)]">{BATTLEFIELD_MAX_TEAM} héros</strong> face
              à une armée de {BATTLEFIELD_ENEMY_COUNT}. La victoire rapporte de la{' '}
              <strong className="text-[var(--color-gold-soft)]">Poussière bénie</strong>, seule
              matière de l'armure divine.
            </p>
          </div>
        </div>

        {/* Quota du jour — l'information qui conditionne tout le reste. */}
        <div className="flex flex-wrap items-center gap-3 p-6 pt-0">
          <span className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
            Sorties du jour
          </span>
          <div className="flex gap-1.5">
            {Array.from({ length: cap }, (_, i) => (
              <span
                key={i}
                className={`h-2.5 w-8 rounded-full ${
                  i < remaining ? 'bg-[var(--color-ember)]' : 'bg-white/10'
                }`}
              />
            ))}
          </div>
          <span className="text-sm font-semibold text-[var(--color-ink)]">
            {remaining} / {cap}
          </span>
          {remaining === 0 && (
            <span className="text-xs text-[var(--color-muted)]">
              Épuisées — elles se renouvellent à minuit.
            </span>
          )}
        </div>
      </div>

      {!isArc2 && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-gold-soft)]/40 bg-[var(--color-gold-soft)]/[0.07] p-3 text-sm text-[var(--color-gold-soft)]">
          <UiIcon name="lock" size={16} />
          Les champs de bataille n'ouvrent qu'à l'<strong>Arc {BATTLEFIELD_ARC}</strong>.
        </div>
      )}

      {/* ------------------------------------------------------ les batailles */}
      <div className="panel p-4">
        <h3 className="mb-3 font-display text-sm font-semibold text-[var(--color-ink)]">
          Choisis ta bataille
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map((b) => (
            <BattleCard
              key={b.id}
              battle={b}
              active={selected?.id === b.id}
              onPick={() => {
                setSelectedId(b.id);
                setResult(null);
              }}
            />
          ))}
        </div>
      </div>

      {/* --------------------------------------------------------- l'escouade */}
      <div className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold text-[var(--color-ink)]">
            Ton escouade —{' '}
            <span className={picked.length < BATTLEFIELD_MAX_TEAM ? 'text-[var(--color-ember)]' : ''}>
              {picked.length}
            </span>
            /{BATTLEFIELD_MAX_TEAM}
          </h3>
          <button onClick={pickAll} className="btn btn-ghost text-xs">
            Tout engager
          </button>
        </div>

        {picked.length > 0 && picked.length < BATTLEFIELD_ENEMY_COUNT && (
          <p className="mb-3 text-xs text-[var(--color-muted)]">
            Tu combats en infériorité numérique ({picked.length} contre {BATTLEFIELD_ENEMY_COUNT}) —
            possible, mais vise une bataille basse. Recruter et boucler des donjons agrandit ton
            vivier.
          </p>
        )}

        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {roster.map((h) => {
            const meta = classMeta(h.classId);
            const on = picked.includes(h.id);
            const capped = classFull(h.id, h.classId);
            const full = (!on && picked.length >= BATTLEFIELD_MAX_TEAM) || capped;
            return (
              <button
                key={h.id}
                onClick={() => toggle(h.id)}
                disabled={full}
                title={capped ? tooManySameClassError(MAX_SAME_CLASS_LARGE) : undefined}
                className={`flex items-center gap-2 rounded-lg border p-2 text-left text-xs transition ${
                  on
                    ? 'border-[var(--color-ember)] bg-[var(--color-ember)]/10'
                    : full
                      ? 'border-[var(--color-edge)] opacity-40'
                      : 'border-[var(--color-edge)] hover:border-[var(--color-gold-soft)]/40'
                }`}
              >
                <ClassIcon classId={h.classId} size={22} />
                <span className="min-w-0">
                  <span className="block truncate text-[var(--color-ink)]">{h.name}</span>
                  <span className="block text-[10px]" style={{ color: meta.accent }}>
                    {meta.label} · N.{h.level} · {h.grade}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------ l'assaut */}
      <div className="panel p-4">
        <button onClick={launch} disabled={!canLaunch} className="btn btn-primary text-sm disabled:opacity-40">
          {run.isPending
            ? 'Bataille en cours…'
            : !isArc2
              ? `Réservé à l'Arc ${BATTLEFIELD_ARC}`
              : remaining === 0
                ? 'Sorties épuisées'
                : picked.length === 0
                  ? 'Engage au moins un héros'
                  : `Lancer l'assaut — ${selected?.name ?? ''}`}
        </button>

        {error && <p className="mt-3 text-sm text-[var(--color-ember)]">{error}</p>}

        {result && (
          <div
            className={`mt-4 rounded-lg border p-4 ${
              result.won
                ? 'border-[var(--color-gold-soft)]/40 bg-[var(--color-gold-soft)]/[0.06]'
                : 'border-[var(--color-ember)]/40 bg-[var(--color-ember)]/[0.06]'
            }`}
          >
            <div className="font-display text-xl font-bold text-[var(--color-ink)]">
              {result.won ? 'Bataille remportée' : 'Bataille perdue'}
            </div>
            {result.won ? (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-gold-soft)]">
                  <ResourceIcon resKey="poussiere_benie" size={15} /> +{result.reward.dust}
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-gold-soft)]">
                  <UiIcon name="gold" size={13} color="var(--color-gold-soft)" />{' '}
                  {result.reward.gold.toLocaleString('fr-FR')}
                </span>
              </div>
            ) : (
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                La défaite ne rapporte rien, mais consomme la sortie. Renforce ton escouade ou vise
                plus bas.
              </p>
            )}
            <button onClick={() => setReplay(result.combat)} className="btn btn-ghost mt-3 text-xs">
              ▶ Revoir le combat
            </button>
          </div>
        )}
      </div>

      {replay && (
        <CombatReplay
          combat={replay}
          title={selected?.name ?? 'Champ de bataille'}
          onClose={() => setReplay(null)}
        />
      )}
    </section>
  );
}

/** Carte d'une bataille : état de déblocage, ambiance et butin. */
function BattleCard({
  battle,
  active,
  onPick,
}: {
  battle: BattlefieldRow;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      disabled={!battle.unlocked}
      className={`rounded-lg border p-3 text-left transition ${
        active
          ? 'border-[var(--color-ember)] bg-[var(--color-ember)]/10'
          : battle.unlocked
            ? 'border-[var(--color-edge)] bg-black/20 hover:border-white/25'
            : 'border-[var(--color-edge)] opacity-45'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="chip bg-white/5 text-[10px] font-semibold text-[var(--color-muted)]">
          {battle.idx}
        </span>
        <span className="min-w-0 flex-1 truncate font-display text-sm font-semibold text-[var(--color-ink)]">
          {battle.name}
        </span>
        {battle.cleared && <UiIcon name="victory" size={13} color="var(--color-gold-soft)" />}
        {!battle.unlocked && <UiIcon name="lock" size={13} />}
      </div>
      <p className="mt-1 text-[11px] italic text-[var(--color-muted)]">{battle.flavor}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1 text-[var(--color-gold-soft)]">
          <ResourceIcon resKey="poussiere_benie" size={12} /> {battle.dust}
        </span>
        <span className="inline-flex items-center gap-1 text-[var(--color-ink)]/70">
          <UiIcon name="gold" size={11} /> {battle.gold.toLocaleString('fr-FR')}
        </span>
      </div>
    </button>
  );
}
