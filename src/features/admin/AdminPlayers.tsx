/**
 * Annuaire + fiche joueur du panneau admin.
 *
 * Tout passe par l'Edge Function : la RLS de `profiles`/`heroes`/`items` est
 * « select own », donc un admin ne peut RIEN lire d'un autre joueur depuis le
 * client. La présence (qui est en ligne) vient en revanche du canal Realtime,
 * qui n'écrit rien en base — les deux sources sont fusionnées ici.
 */
import { useMemo, useState } from 'react';
import { ClassIcon } from '@/components/synty/GameIcons';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { rarityColor, classMeta } from '@/lib/gameUi';
import { resourceMeta } from '@/hooks/useResources';
import { effectiveStats, heroPower } from '@shared/progression/formulas';
import { setById } from '@shared/progression/sets';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AdminCooldowns } from './AdminCooldowns';
import {
  useAdminPlayers,
  useAdminInspect,
  useAdminAction,
  type AdminItem,
  type AdminHero,
} from './useAdmin';

type ClassRow = { id: string; name: string; base_hp?: number; base_atk?: number; base_def?: number; base_speed?: number };

/** Tri de l'annuaire — les colonnes qui servent réellement à trouver quelqu'un. */
type Sort = 'xp' | 'name' | 'heroes' | 'gold' | 'level';

const SORT_LABEL: Record<Sort, string> = {
  xp: 'XP compte',
  level: 'Niv. max',
  heroes: 'Héros',
  gold: 'Or',
  name: 'Nom',
};

export function AdminPlayers({
  selected,
  onSelect,
  classes,
  onlineIds,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
  classes: ClassRow[];
  onlineIds: Set<string>;
}) {
  const { data, isLoading, error } = useAdminPlayers(true);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('xp');
  const [onlineOnly, setOnlineOnly] = useState(false);

  const rows = useMemo(() => {
    let list = data?.players ?? [];
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (p) =>
          (p.display_name ?? '').toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle),
      );
    }
    if (onlineOnly) list = list.filter((p) => onlineIds.has(p.id));
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === 'name') return (a.display_name ?? '').localeCompare(b.display_name ?? '');
      if (sort === 'heroes') return b.heroes - a.heroes;
      if (sort === 'gold') return b.gold - a.gold;
      if (sort === 'level') return b.max_level - a.max_level;
      return b.account_xp - a.account_xp;
    });
    return sorted;
  }, [data, q, sort, onlineOnly, onlineIds]);

  const field =
    'rounded-lg border border-[var(--color-edge)] bg-black/40 px-2.5 py-1.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-arcane)]';

  return (
    <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      {/* ------------------------------------------------------- ANNUAIRE */}
      <div className="flex min-h-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 nom ou uuid…"
            className={`${field} min-w-0 flex-1`}
          />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={field}>
            {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <input type="checkbox" checked={onlineOnly} onChange={(e) => setOnlineOnly(e.target.checked)} />
          En ligne seulement ({onlineIds.size})
        </label>

        {isLoading && <p className="text-sm text-[var(--color-muted)]">Chargement de l'annuaire…</p>}
        {error && (
          <p className="text-sm text-[var(--color-ember)]">
            {error instanceof Error ? error.message : 'Erreur'}
          </p>
        )}

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {rows.map((p) => {
            const on = onlineIds.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                  selected === p.id
                    ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15'
                    : 'border-[var(--color-edge)] bg-black/20 hover:border-[var(--color-arcane)]/50'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? 'bg-emerald-400' : 'bg-[var(--color-edge-strong)]'}`}
                    title={on ? 'En ligne' : 'Hors ligne'}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-ink)]">
                    {p.display_name ?? '(sans nom)'}
                  </span>
                  <span className="shrink-0 text-[10px] text-[var(--color-muted)]">A{p.arc}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-[var(--color-muted)]">
                  <span>{p.heroes} héros</span>
                  <span>niv. {p.max_level}</span>
                  <span>{p.items} obj.</span>
                  <span>{p.gold.toLocaleString('fr-FR')} or</span>
                </div>
              </button>
            );
          })}
          {!isLoading && rows.length === 0 && (
            <p className="text-sm text-[var(--color-muted)]">Aucun joueur ne correspond.</p>
          )}
        </div>
      </div>

      {/* --------------------------------------------------------- FICHE */}
      <div className="min-h-0 overflow-y-auto">
        {selected ? (
          <PlayerSheet playerId={selected} classes={classes} online={onlineIds.has(selected)} />
        ) : (
          <p className="p-6 text-center text-sm text-[var(--color-muted)]">
            Choisis un joueur dans la liste pour voir son escouade et son inventaire.
          </p>
        )}
      </div>
    </div>
  );
}

function PlayerSheet({
  playerId,
  classes,
  online,
}: {
  playerId: string;
  classes: ClassRow[];
  online: boolean;
}) {
  const { data, isLoading, error } = useAdminInspect(playerId);
  const clsMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  // Objets cochés pour suppression. Les ÉQUIPÉS sont éligibles : la clé
  // étrangère est en ON DELETE SET NULL, le héros se déséquipe tout seul.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [delFeedback, setDelFeedback] = useState<string | null>(null);
  const action = useAdminAction();
  const queryClient = useQueryClient();
  const toggleItem = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const deletePicked = () => {
    action.mutate(
      { action: 'delete_items', player_id: playerId, item_ids: [...picked] },
      {
        onSuccess: (r) => {
          const n = ((r as { deleted?: unknown[] }).deleted ?? []).length;
          setDelFeedback(`${n} objet(s) supprimé(s).`);
          setPicked(new Set());
          void queryClient.invalidateQueries({ queryKey: ['admin_inspect', playerId] });
        },
        onError: (e) => setDelFeedback(e instanceof Error ? e.message : 'Erreur'),
      },
    );
    setConfirmDelete(false);
  };


  if (isLoading) return <p className="p-4 text-sm text-[var(--color-muted)]">Chargement de la fiche…</p>;
  if (error)
    return (
      <p className="p-4 text-sm text-[var(--color-ember)]">
        {error instanceof Error ? error.message : 'Erreur'}
      </p>
    );
  if (!data) return null;

  const equippedIds = new Set(
    data.heroes.flatMap((h) => [h.weapon?.id, h.armor?.id, h.jewel?.id, h.relic?.id].filter(Boolean) as string[]),
  );
  const spare = data.items.filter((i) => !equippedIds.has(i.id));

  return (
    <div className="space-y-4 pr-1">
      {/* Bandeau d'identité */}
      <div className="panel flex flex-wrap items-center gap-x-4 gap-y-1.5 p-3">
        <span className="flex items-center gap-1.5 font-display text-base font-bold text-[var(--color-ink)]">
          <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-[var(--color-edge-strong)]'}`} />
          {data.profile.display_name ?? '(sans nom)'}
        </span>
        {data.profile.title && (
          <span className="chip bg-[var(--color-gold)]/15 text-[10px] text-[var(--color-gold-soft)]">
            {data.profile.title}
          </span>
        )}
        <Stat label="Or" value={data.profile.gold.toLocaleString('fr-FR')} />
        <Stat label="XP compte" value={data.profile.account_xp.toLocaleString('fr-FR')} />
        <Stat label="Arc" value={`${data.arc.current_arc} / max ${data.arc.max_arc}`} />
        <Stat label="Niveaux faits" value={String(data.levels_cleared)} />
        <Stat label="Donjons" value={String(data.dungeons_cleared)} />
        <Stat label="Objets" value={String(data.items.length)} />
        <span className="ml-auto font-mono text-[10px] text-[var(--color-muted)]/60">{data.profile.id}</span>
      </div>

      {/* Escouade */}
      <div>
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Escouade ({data.heroes.length})
        </h4>
        <div className="grid gap-2 xl:grid-cols-2">
          {data.heroes.map((h) => (
            <HeroCardAdmin
              key={h.id}
              hero={h}
              cls={clsMap.get(h.class_id)}
              picked={picked}
              onToggleItem={toggleItem}
            />
          ))}
          {data.heroes.length === 0 && (
            <p className="text-sm text-[var(--color-muted)]">Aucun héros.</p>
          )}
        </div>
      </div>

      {/* Cooldowns */}
      <div>
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Cooldowns
        </h4>
        <AdminCooldowns playerId={playerId} />
      </div>

      {/* Inventaire non porté */}
      <div>
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Inventaire non équipé ({spare.length})
          </h4>
          {/* Clique un objet — ici ou sur un héros — pour le cocher. */}
          {picked.size > 0 && (
            <>
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={action.isPending}
                className="btn btn-primary px-2 py-1 text-[11px]"
              >
                Supprimer {picked.size} objet(s)
              </button>
              <button onClick={() => setPicked(new Set())} className="btn btn-ghost px-2 py-1 text-[11px]">
                Tout décocher
              </button>
            </>
          )}
          {delFeedback && (
            <span className="text-[11px] text-[var(--color-gold-soft)]">{delFeedback}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {spare.map((i) => (
            <ItemChip key={i.id} item={i} selected={picked.has(i.id)} onToggle={toggleItem} />
          ))}
          {spare.length === 0 && <p className="text-sm text-[var(--color-muted)]">Rien en réserve.</p>}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        danger
        busy={action.isPending}
        title={`Supprimer ${picked.size} objet(s) ?`}
        message="Les objets équipés seront retirés des héros concernés. Irréversible."
        confirmLabel="Supprimer"
        onConfirm={deletePicked}
        onCancel={() => setConfirmDelete(false)}
      />

      {/* Ressources */}
      <div>
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Ressources
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {data.resources
            .filter((r) => r.amount > 0)
            .sort((a, b) => a.tier - b.tier || b.amount - a.amount)
            .map((r) => (
              <span
                key={`${r.resource}-${r.tier}`}
                className="inline-flex items-center gap-1 rounded-md bg-black/25 px-1.5 py-0.5 text-[11px] text-[var(--color-ink)]/85"
                title={`${resourceMeta(r.resource).label} — arc ${r.tier}`}
              >
                <ResourceIcon resKey={r.resource} size={13} /> {r.amount}
                <span className="text-[9px] text-[var(--color-muted)]">T{r.tier}</span>
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}

function HeroCardAdmin({
  hero,
  cls,
  picked,
  onToggleItem,
}: {
  hero: AdminHero;
  cls: ClassRow | undefined;
  /** Objets cochés pour suppression — l'équipement porté l'est aussi. */
  picked: Set<string>;
  onToggleItem: (id: string) => void;
}) {
  // Mêmes formules que la fiche du joueur : base de classe + inné, puis niveau,
  // puis équipement. Recalculé côté client pour éviter de dupliquer le calcul
  // serveur — si la formule change, les deux bougent ensemble.
  const bonuses = {
    atk: [hero.weapon, hero.armor, hero.jewel, hero.relic].reduce((s, i) => s + (i?.atk_bonus ?? 0), 0),
    def: [hero.weapon, hero.armor, hero.jewel, hero.relic].reduce((s, i) => s + (i?.def_bonus ?? 0), 0),
    hp: [hero.weapon, hero.armor, hero.jewel, hero.relic].reduce((s, i) => s + (i?.hp_bonus ?? 0), 0),
  };
  const stats = cls?.base_hp
    ? effectiveStats(
        {
          hp: Math.max(1, (cls.base_hp ?? 0) + hero.bonus_hp),
          atk: Math.max(1, (cls.base_atk ?? 0) + hero.bonus_atk),
          def: Math.max(0, (cls.base_def ?? 0) + hero.bonus_def),
          speed: Math.max(1, (cls.base_speed ?? 0) + hero.bonus_speed),
        },
        hero.level,
        bonuses,
        { hp: hero.alloc_hp, atk: hero.alloc_atk, def: hero.alloc_def, speed: hero.alloc_speed },
      )
    : null;
  const slots: [string, AdminItem | null][] = [
    ['Arme', hero.weapon],
    ['Armure', hero.armor],
    ['Bijou', hero.jewel],
    ['Relique', hero.relic],
  ];
  const skillCount = Object.keys(hero.skills ?? {}).length;

  return (
    <div className="rounded-xl border border-[var(--color-edge)] bg-black/20 p-2.5">
      <div className="flex items-center gap-2">
        <ClassIcon classId={hero.class_id} size={20} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-ink)]">
          {hero.name}
        </span>
        <span className="chip bg-white/5 text-[10px]" style={{ color: classMeta(hero.class_id).accent }}>
          niv. {hero.level}
        </span>
        {hero.awakened && (
          <span className="chip bg-[var(--color-gold)]/20 text-[10px] text-[var(--color-gold-soft)]">éveillé</span>
        )}
      </div>

      {stats && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-[var(--color-muted)]">
          <span>PV <strong className="text-[var(--color-ink)]">{stats.hp}</strong></span>
          <span>ATK <strong className="text-[var(--color-ink)]">{stats.atk}</strong></span>
          <span>DEF <strong className="text-[var(--color-ink)]">{stats.def}</strong></span>
          <span>VIT <strong className="text-[var(--color-ink)]">{stats.speed}</strong></span>
          <span className="ml-auto">
            Puissance <strong className="text-[var(--color-gold-soft)]">{heroPower(stats)}</strong>
          </span>
        </div>
      )}

      {/* Points non dépensés : c'est souvent LA cause d'un joueur qui bloque. */}
      {(hero.skill_points > 0 || hero.stat_points > 0) && (
        <div className="mt-1 text-[10px] text-[var(--color-ember)]">
          {hero.skill_points > 0 && `${hero.skill_points} pt(s) de compétence non dépensés`}
          {hero.skill_points > 0 && hero.stat_points > 0 && ' · '}
          {hero.stat_points > 0 && `${hero.stat_points} pt(s) de stat non dépensés`}
        </div>
      )}
      <div className="mt-1 text-[10px] text-[var(--color-muted)]">{skillCount} nœud(s) d'arbre appris</div>

      <div className="mt-1.5 space-y-0.5">
        {slots.map(([label, it]) => (
          <div key={label} className="flex items-center gap-1.5 text-[11px]">
            <span className="w-12 shrink-0 text-[var(--color-muted)]">{label}</span>
            {it ? (
              <ItemChip item={it} selected={picked.has(it.id)} onToggle={onToggleItem} />
            ) : (
              <span className="text-[var(--color-ember)]/70">— vide</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Pastille d'objet. Cliquable dès qu'un  est fourni : c'est ainsi
 * qu'on coche les objets à supprimer, ÉQUIPÉS COMPRIS — un objet à retirer est
 * justement, le plus souvent, un objet porté.
 */
function ItemChip({
  item,
  selected = false,
  onToggle,
}: {
  item: AdminItem;
  selected?: boolean;
  onToggle?: ((id: string) => void) | undefined;
}) {
  const set = item.set_id ? setById(item.set_id) : null;
  const bits = [
    item.atk_bonus > 0 ? `${item.atk_bonus} ATK` : null,
    item.def_bonus > 0 ? `${item.def_bonus} DEF` : null,
    item.hp_bonus > 0 ? `${item.hp_bonus} PV` : null,
    item.passive_type && item.passive_value > 0 ? `${item.passive_type} ${item.passive_value}%` : null,
  ].filter(Boolean);
  return (
    <span
      role={onToggle ? 'button' : undefined}
      tabIndex={onToggle ? 0 : undefined}
      onClick={onToggle ? () => onToggle(item.id) : undefined}
      className={[
        'inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]',
        onToggle ? 'cursor-pointer' : '',
        selected ? 'bg-[var(--color-ember)]/25 ring-1 ring-[var(--color-ember)]' : 'bg-black/30',
      ].join(' ')}
      title={`${item.name}${set ? ` — set ${set.name}` : ''}\nT${item.tier} · ${bits.join(' · ') || 'aucun bonus'}`}
    >
      <span className="truncate" style={{ color: rarityColor(item.rarity) }}>
        {item.name}
      </span>
      {item.upgrade_level > 0 && (
        <span className="shrink-0 font-bold text-[var(--color-gold-soft)]">+{item.upgrade_level}</span>
      )}
      {item.blessing_level > 0 && (
        <span className="shrink-0 text-[#fb7185]" title={`Bénédiction ${item.blessing_level}`}>
          ★{item.blessing_level}
        </span>
      )}
      {set && <span className="shrink-0 text-[9px] text-[var(--color-gold-soft)]">{set.name}</span>}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-[11px] text-[var(--color-muted)]">
      {label} <strong className="text-[var(--color-ink)]">{value}</strong>
    </span>
  );
}
