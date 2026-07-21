import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BodyPortal } from '@/components/BodyPortal';
import { useClassLimit } from '@/features/heroes/useClassLimit';
import { tooManySameClassError } from '@shared/progression/teamComposition';
import { useAuthStore } from '@/store/authStore';
import { useHeroes, type HeroView } from '@/features/heroes/useHeroes';
import { ClassIcon, UiIcon } from '@/components/synty/GameIcons';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { syntyUrl, MEDAL_TINT } from '@/lib/synty';
import { BackToActivities } from '@/components/BackToActivities';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import { canChallenge, ARENA_MAX_TEAM } from '@shared/progression/arena';
import {
  useArenaLadder,
  useArenaActions,
  useArenaPodium,
  type LadderRow,
  type PodiumRow,
  type ClaimResult,
} from './useArena';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { resourceMeta } from '@/hooks/useResources';

export function ArenaScreen() {
  const userId = useAuthStore((s) => s.user?.id);
  const { data: ladder } = useArenaLadder();
  const { data: heroes } = useHeroes();
  const { setTeam, challenge, claimWeekly } = useArenaActions();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [replay, setReplay] = useState<StoredCombat | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<ClaimResult | null>(null);
  const { data: podium } = useArenaPodium();

  const rows = ladder ?? [];
  const me = rows.find((r) => r.player_id === userId) ?? null;

  function onChallenge(row: LadderRow) {
    setFeedback(null);
    challenge.mutate(row.player_id, {
      onSuccess: (res) => {
        setReplay(res.combat as StoredCombat);
        setFeedback(res.win ? `Victoire ! Tu passes rang ${res.new_rank}.` : 'Défaite — tu gardes ton rang.');
      },
      onError: (e) => setFeedback(e instanceof Error ? e.message : 'Erreur'),
    });
  }

  function onClaim() {
    setFeedback(null);
    setClaimed(null);
    claimWeekly.mutate(undefined, {
      // Le butin s'affichait en clés BRUTES (« 20 poussiere_etoile ») noyées dans
      // une phrase. On garde le résultat pour le rendre en icônes + libellés.
      onSuccess: (r) => setClaimed(r),
      onError: (e) => setFeedback(e instanceof Error ? e.message : 'Erreur'),
    });
  }

  return (
    <section className="anim-fade space-y-5">
      <BackToActivities />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="heading flex items-center gap-2 text-2xl">
            <UiIcon name="attack" size={24} /> Arène
          </h2>
          <p className="max-w-xl text-sm text-[var(--color-muted)]">
            Dépose une équipe de défense, puis <strong>défie un joueur juste au-dessus</strong> de toi :
            gagne pour <strong>échanger vos places</strong>. Chaque semaine, réclame une récompense selon
            ton rang et le nombre de participants.
          </p>
        </div>
        <Link to="/village" className="btn btn-ghost text-xs">← Village</Link>
      </div>

      {/* Mon statut */}
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        {me ? (
          <div className="flex items-center gap-4 text-sm">
            <span className="font-display text-2xl font-bold text-[var(--color-gold)]">#{me.rank}</span>
            <span className="text-[var(--color-muted)]">
              Puissance <span className="text-[var(--color-ink)]">{me.power}</span>
            </span>
            <span className="text-[var(--color-muted)]">
              <span className="text-[var(--color-gold-soft)]">{me.wins}V</span> ·{' '}
              <span className="text-[var(--color-ember)]">{me.losses}D</span>
            </span>
          </div>
        ) : (
          <span className="text-sm text-[var(--color-muted)]">
            Tu n'es pas encore dans l'arène — compose ton équipe de défense pour entrer.
          </span>
        )}
        <div className="flex gap-2">
          <button onClick={() => setPickerOpen(true)} className="btn btn-ghost text-xs">
            {me ? 'Modifier ma défense' : "Rejoindre l'arène"}
          </button>
          {me && (
            <button onClick={onClaim} disabled={claimWeekly.isPending} className="btn btn-primary text-xs">
              🏆 Récompense de la semaine passée
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <p className={`text-sm ${challenge.isError || claimWeekly.isError ? 'text-[var(--color-ember)]' : 'text-[var(--color-gold-soft)]'}`}>
          {feedback}
        </p>
      )}

      {claimed && <ClaimBanner result={claimed} onClose={() => setClaimed(null)} />}

      {podium && podium.length > 0 && <Podium rows={podium} meId={userId ?? null} />}

      {/* Échelle */}
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-edge)] text-left text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Joueur</th>
              <th className="px-4 py-3 text-right">Puissance</th>
              <th className="hidden px-4 py-3 text-right sm:table-cell">V / D</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isMe = row.player_id === userId;
              const challengeable = Boolean(me) && !isMe && canChallenge(me!.rank, row.rank);
              return (
                <tr
                  key={row.player_id}
                  className={`border-b border-[var(--color-edge)]/60 ${isMe ? 'bg-[var(--color-arcane)]/12' : ''}`}
                >
                  <td className="px-4 py-2.5 font-display text-[var(--color-muted)]">{row.rank}</td>
                  <td className="px-4 py-2.5 text-[var(--color-ink)]">
                    {row.display_name}
                    {isMe && <span className="ml-2 text-xs text-[var(--color-arcane)]">(toi)</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-display font-bold text-[var(--color-gold)]">
                    {row.power}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right text-[var(--color-muted)] sm:table-cell">
                    {row.wins} / {row.losses}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {challengeable ? (
                      <button
                        onClick={() => onChallenge(row)}
                        disabled={challenge.isPending}
                        className="btn btn-primary px-2.5 py-1 text-xs"
                      >
                        Défier
                      </button>
                    ) : (
                      <span className="text-[10px] text-[var(--color-muted)]/50">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-muted)]">
                  L'arène est vide — sois le premier à y entrer !
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pickerOpen && (
        <DefenseTeamPicker
          heroes={heroes ?? []}
          initial={me?.team_hero_ids ?? []}
          pending={setTeam.isPending}
          error={setTeam.error instanceof Error ? setTeam.error.message : null}
          onClose={() => setPickerOpen(false)}
          onSave={(ids) => setTeam.mutate(ids, { onSuccess: () => setPickerOpen(false) })}
        />
      )}

      {replay && (
        <CombatReplay combat={replay} title="Combat d'arène" enemyKind="normal" onClose={() => setReplay(null)} />
      )}
    </section>
  );
}

/**
 * Marches du podium : l'or au centre et plus haut, comme un vrai podium.
 * Les couleurs viennent de MEDAL_TINT, déjà utilisé par le classement global —
 * une médaille doit avoir la même teinte partout dans le jeu.
 */
const STEP: Record<number, { h: string; order: string }> = {
  1: { h: 'h-16', order: 'order-2' },
  2: { h: 'h-12', order: 'order-1' },
  3: { h: 'h-9', order: 'order-3' },
};

/**
 * Champions de la semaine écoulée. L'arène ne montrait QUE le classement en
 * cours : le travail d'une semaine disparaissait à la clôture, et la récompense
 * hebdo tombait sans qu'on sache jamais qui avait gagné.
 */
function Podium({ rows, meId }: { rows: PodiumRow[]; meId: string | null }) {
  return (
    <div className="panel p-4">
      <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-[var(--color-ink)]">
        <SyntyGlyph src={syntyUrl.map('Star01')} color={MEDAL_TINT[0]!} size={16} />
        Champions de la semaine passée
        <span className="font-sans text-[10px] font-normal text-[var(--color-muted)]">
          {rows[0]?.week}
        </span>
      </h3>
      <div className="flex items-end justify-center gap-2 sm:gap-4">
        {rows.slice(0, 3).map((r) => {
          const step = STEP[r.rank] ?? STEP[3]!;
          const tint = MEDAL_TINT[r.rank - 1] ?? MEDAL_TINT[2]!;
          const isMe = r.player_id === meId;
          return (
            <div key={r.player_id} className={`flex w-24 flex-col items-center ${step.order}`}>
              <SyntyGlyph src={syntyUrl.map('Star01')} color={tint} size={24} title={`#${r.rank}`} />
              <span
                className={`mt-1 w-full truncate text-center text-xs font-semibold ${
                  isMe ? 'text-[var(--color-arcane)]' : 'text-[var(--color-ink)]'
                }`}
                title={`${r.display_name} — ${r.wins}V / ${r.losses}D`}
              >
                {r.display_name}
                {isMe && ' (toi)'}
              </span>
              <span className="text-[10px] text-[var(--color-muted)]">
                {r.wins}V · {r.losses}D
              </span>
              <div
                className={`mt-1.5 flex w-full items-start justify-center rounded-t-md pt-1 font-display text-sm font-bold ${step.h}`}
                style={{ background: `${tint}22`, boxShadow: `inset 0 2px 0 ${tint}` }}
              >
                <span style={{ color: tint }}>#{r.rank}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Butin hebdo réclamé, en icônes et libellés plutôt qu'en clés de base. */
function ClaimBanner({ result, onClose }: { result: ClaimResult; onClose: () => void }) {
  return (
    <div className="panel anim-fade flex flex-wrap items-center gap-x-3 gap-y-2 border border-[var(--color-gold)]/40 p-3">
      <span className="text-sm font-semibold text-[var(--color-gold-soft)]">
        Semaine {result.week} · rang {result.rank}/{result.participants}
      </span>
      <span className="flex items-center gap-1 text-sm text-[var(--color-ink)]">
        <UiIcon name="gold" size={14} /> {result.reward.gold.toLocaleString('fr-FR')}
      </span>
      {result.reward.materials.map((m) => (
        <span key={m.key} className="flex items-center gap-1 text-sm text-[var(--color-ink)]">
          <ResourceIcon resKey={m.key} />
          {resourceMeta(m.key).label}
          {/* La quantité en ×N : c'est elle qui fait la valeur du rang, elle ne
              doit pas se lire comme un simple préfixe du nom. */}
          <span className="chip bg-[var(--color-gold)]/15 px-1.5 text-[11px] font-bold text-[var(--color-gold-soft)]">
            ×{m.qty}
          </span>
        </span>
      ))}
      {result.reward.materials.length === 0 && (
        <span className="text-xs text-[var(--color-muted)]">
          Aucun matériau à ce rang — vise le top 10.
        </span>
      )}
      <span className="flex-1" />
      <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-ink)]">
        ✕
      </button>
    </div>
  );
}

function DefenseTeamPicker({
  heroes,
  initial,
  pending,
  error,
  onClose,
  onSave,
}: {
  heroes: HeroView[];
  initial: string[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (ids: string[]) => void;
}) {
  // Ignore les héros de l'équipe enregistrée qui n'existent plus (renvoyés) :
  // sinon le fantôme reste sélectionné sans pouvoir être retiré → save bloqué (403).
  const [picked, setPicked] = useState<string[]>(() =>
    initial.filter((id) => heroes.some((h) => h.id === id)),
  );
  const { classFull } = useClassLimit(heroes, picked);
  function toggle(id: string) {
    const h = heroes.find((x) => x.id === id);
    if (h && classFull(h.id, h.classId)) return;
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((h2) => h2 !== id) : cur.length < ARENA_MAX_TEAM ? [...cur, id] : cur,
    );
  }
  return (
    <BodyPortal>
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="panel anim-pop max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto p-5 sm:max-h-[85vh]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-[var(--color-ink)]">
            Équipe de défense · {picked.length}/{ARENA_MAX_TEAM}
          </h3>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-ink)]">✕</button>
        </div>
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          Ces héros défendent ta place quand un autre joueur te défie (copie figée de leurs stats).
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {heroes.map((h) => {
            const chosen = picked.includes(h.id);
            const capped = classFull(h.id, h.classId);
            const full = (picked.length >= ARENA_MAX_TEAM && !chosen) || capped;
            return (
              <button
                key={h.id}
                onClick={() => toggle(h.id)}
                disabled={full}
                title={capped ? tooManySameClassError() : undefined}
                className={`panel flex flex-col items-center gap-0.5 p-2 text-center transition ${
                  chosen ? 'ring-2 ring-[var(--color-arcane)]' : 'opacity-80 hover:opacity-100'
                } ${full ? 'opacity-40' : ''}`}
              >
                <ClassIcon classId={h.classId} size={22} />
                <span className="w-full truncate text-[10px] text-[var(--color-ink)]">{h.name}</span>
                <span className="text-[9px] text-[var(--color-muted)]">N.{h.level}</span>
              </button>
            );
          })}
        </div>
        {error && <p className="mt-2 text-sm text-[var(--color-ember)]">{error}</p>}
        <button
          onClick={() => onSave(picked)}
          disabled={pending || picked.length === 0}
          className="btn btn-primary mt-3 w-full text-sm"
        >
          {pending ? 'Enregistrement…' : 'Valider ma défense'}
        </button>
      </div>
    </div>
    </BodyPortal>
  );
}
