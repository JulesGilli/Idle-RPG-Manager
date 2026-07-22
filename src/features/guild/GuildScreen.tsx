import { useEffect, useMemo, useRef, useState } from 'react';
import { FavStar } from '@/components/FavoriteStar';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useHeroes, type HeroView } from '@/features/heroes/useHeroes';
import { classMeta } from '@/lib/gameUi';
import { classWeaponCleanUrl, type UiIconName } from '@/lib/synty';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { BackToVillage } from '@/components/BackToVillage';
import { namesByIds } from '@/lib/playerNames';
import { GuildSkillTreePanel } from './GuildSkillTreePanel';
import { resourceMeta } from '@/hooks/useResources';
import { guildLevelProgress, canManageMembers, canKick } from '@shared/progression/guild';
import { nextRaidLevel, MAX_RAID_LEVEL } from '@shared/progression/guildSkills';
import {
  useMyGuild,
  useGuildEvents,
  useGuildLeaderboard,
  useGuildActions,
  useGuildRaid,
  useMyEnrollment,
  useRaidTypes,
  useLastGuildRaid,
  useRaidRoster,
  useMyGarrison,
  useBorrowableHeroes,
  useGarrisonActions,
  type GuildMember,
  type GuildRole,
  type RaidFightResult,
  type EnrolledHero,
} from './useGuild';

const ROLE_LABEL: Record<GuildRole, string> = { founder: 'Fondateur', officer: 'Officier', member: 'Membre' };
const ROLE_COLOR: Record<GuildRole, string> = { founder: '#f5b544', officer: '#8b7cf6', member: '#94a3b8' };

export function GuildScreen() {
  const { data: mine, isLoading } = useMyGuild();

  return (
    <section className="anim-fade space-y-5">
      <BackToVillage />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="heading flex items-center gap-2 text-2xl">
            <UiIcon name="guild" size={24} color="var(--color-gold-soft)" />
            Hôtel de Guilde
          </h2>
          <p className="text-sm text-[var(--color-muted)]">
            Rejoins une guilde, monte-la en niveau et lance des raids en mettant vos héros en commun.
          </p>
        </div>
        <Link to="/village" className="btn btn-ghost text-xs">
          ← Village
        </Link>
      </div>

      {isLoading ? (
        <p className="text-[var(--color-muted)]">Chargement…</p>
      ) : mine ? (
        <GuildHome />
      ) : (
        <NoGuild />
      )}
    </section>
  );
}

/* ------------------------------------------------------------- SANS GUILDE */

function NoGuild() {
  const actions = useGuildActions();
  const { data: board } = useGuildLeaderboard();
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [desc, setDesc] = useState('');
  const [joinTag, setJoinTag] = useState('');

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="panel space-y-3 p-4">
        <h3 className="font-display font-semibold text-[var(--color-ink)]">Fonder une guilde</h3>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom (3-24)" className="w-full rounded-lg border border-[var(--color-edge)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/60" />
        <input value={tag} onChange={(e) => setTag(e.target.value.toUpperCase())} placeholder="Tag (2-5)" maxLength={5} className="w-full rounded-lg border border-[var(--color-edge)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/60" />
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optionnel)" className="w-full rounded-lg border border-[var(--color-edge)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/60" rows={2} />
        <button
          onClick={() => actions.mutate({ action: 'create', name, tag, description: desc })}
          disabled={actions.isPending}
          className="btn btn-primary w-full text-sm"
        >
          Fonder
        </button>

        <div className="divider my-1" />
        <h3 className="font-display font-semibold text-[var(--color-ink)]">Rejoindre</h3>
        <div className="flex gap-2">
          <input value={joinTag} onChange={(e) => setJoinTag(e.target.value.toUpperCase())} placeholder="Tag de la guilde" maxLength={5} className="flex-1 rounded-lg border border-[var(--color-edge)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/60" />
          <button
            onClick={() => actions.mutate({ action: 'join', tag: joinTag })}
            disabled={actions.isPending}
            className="btn btn-arcane text-sm"
          >
            Rejoindre
          </button>
        </div>
        {actions.isError && (
          <p className="text-sm text-[var(--color-ember)]">
            {actions.error instanceof Error ? actions.error.message : 'Erreur'}
          </p>
        )}
      </div>

      <div className="panel p-4">
        <h3 className="mb-2 flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name="victory" size={16} /> Meilleures guildes
        </h3>
        <div className="space-y-1">
          {(board ?? []).map((g, i) => (
            <div key={g.guild_id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-1.5 text-sm">
              <span className="flex items-center gap-2">
                <span className="w-5 text-right text-[var(--color-muted)]">{i + 1}</span>
                <span className="font-medium text-[var(--color-ink)]">{g.name}</span>
                <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">[{g.tag}]</span>
              </span>
              <span className="text-xs text-[var(--color-muted)]">
                {g.members} membres · {g.raids_cleared} raids
              </span>
            </div>
          ))}
          {(board ?? []).length === 0 && <p className="text-sm text-[var(--color-muted)]">Aucune guilde encore.</p>}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- EN GUILDE */

type GuildTab = 'raid' | 'garrison' | 'skills' | 'members' | 'activity';

function GuildHome() {
  const userId = useAuthStore((s) => s.user?.id);
  const { data: mine } = useMyGuild();
  const { data: events } = useGuildEvents(mine?.guild.id);
  const actions = useGuildActions();
  const [confirmDisband, setConfirmDisband] = useState(false);
  const [tab, setTab] = useState<GuildTab>('raid');

  if (!mine) return null;
  const { guild, role, members } = mine;
  const prog = guildLevelProgress(guild.xp);
  const pct = Math.min(100, Math.round((prog.intoLevel / prog.neededForNext) * 100));

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={confirmDisband}
        title="Dissoudre la guilde ?"
        message="Cette action est définitive : la guilde et tout son avancement (niveau, raids, garnison) seront perdus pour tous les membres."
        confirmLabel="Dissoudre"
        danger
        busy={actions.isPending}
        onConfirm={() => actions.mutate({ action: 'disband' }, { onSuccess: () => setConfirmDisband(false) })}
        onCancel={() => setConfirmDisband(false)}
      />
      {/* En-tête (toujours visible au-dessus des onglets) */}
      <div className="panel p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-[var(--color-ink)]">
              {guild.name} <span className="text-sm text-[var(--color-muted)]">[{guild.tag}]</span>
            </h3>
            {guild.description && <p className="text-xs text-[var(--color-muted)]">{guild.description}</p>}
          </div>
          <div className="text-right">
            <div className="font-display text-lg font-bold text-[var(--color-gold)]">Niv. {prog.level}</div>
            <div className="text-[10px] text-[var(--color-muted)]">{members.length}/{guild.max_members} membres</div>
          </div>
        </div>
        <div className="mt-2">
          <div className="mb-1 flex justify-between text-[10px] text-[var(--color-muted)]">
            <span>XP de guilde</span>
            <span>{prog.intoLevel}/{prog.neededForNext}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
            <div className="h-full rounded-full bg-gradient-to-r from-[var(--color-gold)] to-[#ffe08a]" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex flex-wrap gap-2 overflow-x-auto">
        <GuildTabBtn active={tab === 'raid'} onClick={() => setTab('raid')} icon="raid" label="Raid" />
        <GuildTabBtn active={tab === 'garrison'} onClick={() => setTab('garrison')} icon="guild" label="Garnison" />
        <GuildTabBtn active={tab === 'skills'} onClick={() => setTab('skills')} icon="book" label="Compétences" />
        <GuildTabBtn active={tab === 'members'} onClick={() => setTab('members')} icon="squad" label={`Membres · ${members.length}`} />
        <GuildTabBtn active={tab === 'activity'} onClick={() => setTab('activity')} icon="contribution" label="Activité" />
      </div>

      {/* Contenu de l'onglet actif */}
      {tab === 'raid' && (
        <div className="space-y-4">
          <RaidPanel guildId={guild.id} nextLevel={nextRaidLevel(guild.highest_raid_cleared ?? 0)} />
          <LastRaidCard guildId={guild.id} />
        </div>
      )}
      {tab === 'garrison' && <GarrisonPanel />}
      {tab === 'skills' && <GuildSkillTreePanel guild={guild} role={role} actions={actions} />}
      {tab === 'members' && (
        <MembersPanel
          members={members}
          role={role}
          userId={userId}
          actions={actions}
          onDisband={() => setConfirmDisband(true)}
        />
      )}
      {tab === 'activity' && <ActivityPanel events={events ?? []} />}
    </div>
  );
}

function GuildTabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: UiIconName;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-white'
          : 'border-transparent text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-ink)]'
      }`}
    >
      <UiIcon name={icon} size={15} color="currentColor" />
      {label}
    </button>
  );
}

function MembersPanel({
  members,
  role,
  userId,
  actions,
  onDisband,
}: {
  members: GuildMember[];
  role: GuildRole;
  userId: string | undefined;
  actions: ReturnType<typeof useGuildActions>;
  onDisband: () => void;
}) {
  return (
    <div className="panel p-4">
      <h3 className="mb-2 font-display font-semibold text-[var(--color-ink)]">Membres</h3>
      <div className="space-y-1">
        {[...members]
          .sort((a, b) => b.contribution - a.contribution)
          .map((m) => (
            <MemberRow key={m.player_id} m={m} myRole={role} isMe={m.player_id === userId} actions={actions} />
          ))}
      </div>
      <div className="mt-3 flex gap-2">
        {role === 'founder' ? (
          <button onClick={onDisband} className="btn btn-ghost text-xs text-[var(--color-ember)]">
            Dissoudre la guilde
          </button>
        ) : (
          <button onClick={() => actions.mutate({ action: 'leave' })} className="btn btn-ghost text-xs">
            Quitter la guilde
          </button>
        )}
      </div>
    </div>
  );
}

function ActivityPanel({ events }: { events: Array<{ id: string; kind: string; message: string }> }) {
  return (
    <div className="panel p-4">
      <h3 className="mb-2 font-display font-semibold text-[var(--color-ink)]">Activité récente</h3>
      <div className="max-h-[28rem] space-y-1 overflow-y-auto text-sm">
        {events.map((e) => (
          <div key={e.id} className="flex items-center gap-2 rounded bg-white/[0.03] px-2 py-1 text-xs">
            {EVENT_ICON[e.kind] ? (
              <UiIcon name={EVENT_ICON[e.kind]!} size={13} color="currentColor" />
            ) : (
              <span className="text-[var(--color-muted)]">•</span>
            )}
            <span className="text-[var(--color-ink)]/85">{e.message}</span>
          </div>
        ))}
        {events.length === 0 && <p className="text-xs text-[var(--color-muted)]">Rien pour l'instant.</p>}
      </div>
    </div>
  );
}

const EVENT_ICON: Record<string, UiIconName> = {
  create: 'guild',
  join: 'join',
  leave: 'leave',
  kick: 'kick',
  promote: 'promote',
  demote: 'demote',
  raid_clear: 'victory',
  raid_fail: 'defeat',
};

function MemberRow({
  m,
  myRole,
  isMe,
  actions,
}: {
  m: GuildMember;
  myRole: GuildRole;
  isMe: boolean;
  actions: ReturnType<typeof useGuildActions>;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-1.5 text-sm">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="font-medium text-[var(--color-ink)]">{m.display_name}</span>
        {m.title && (
          <span className="text-[10px] font-semibold text-[var(--color-gold-soft)]">« {m.title} »</span>
        )}
        <span className="rounded px-1.5 text-[9px] font-bold" style={{ color: ROLE_COLOR[m.role], boxShadow: `inset 0 0 0 1px ${ROLE_COLOR[m.role]}66` }}>
          {ROLE_LABEL[m.role]}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-gold-soft)]">
        <UiIcon name="contribution" size={11} /> {m.contribution}
      </span>
      </span>
      {!isMe && canManageMembers(myRole) && (
        <span className="flex items-center gap-1">
          {myRole === 'founder' && m.role !== 'founder' && (
            <button
              onClick={() => actions.mutate({ action: 'set_role', target_player_id: m.player_id, role: m.role === 'officer' ? 'member' : 'officer' })}
              className="text-[10px] text-[var(--color-arcane)] hover:underline"
            >
              {m.role === 'officer' ? 'Rétrograder' : 'Promouvoir'}
            </button>
          )}
          {canKick(myRole, m.role) && (
            <button onClick={() => actions.mutate({ action: 'kick', target_player_id: m.player_id })} className="text-[10px] text-[var(--color-ember)] hover:underline">
              Exclure
            </button>
          )}
        </span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- RAID PANEL */

const MAX_ENROLLED = 2;

function GarrisonPanel() {
  const { data: heroes } = useHeroes();
  const { data: mine } = useMyGarrison();
  const { data: borrowable } = useBorrowableHeroes();
  const garrison = useGarrisonActions();
  const [picked, setPicked] = useState<string | null>(null);

  // Rafraîchissement auto du snapshot : si le héros déposé a monté de niveau depuis
  // le dépôt, on re-dépose silencieusement (l'action reconstruit le snapshot à jour).
  // Évite d'avoir à le retirer/remettre à la main. Une fois par (héros, niveau).
  const liveHero = mine ? (heroes ?? []).find((h) => h.id === mine.hero_id) : undefined;
  const refreshedRef = useRef('');
  useEffect(() => {
    if (!mine || !liveHero) return;
    const key = `${mine.hero_id}:${liveHero.level}`;
    if (liveHero.level > mine.level && !garrison.isPending && refreshedRef.current !== key) {
      refreshedRef.current = key;
      garrison.mutate({ action: 'deposit', hero_id: mine.hero_id });
    }
  }, [mine, liveHero, garrison]);

  return (
    <div className="panel space-y-3 p-4">
      <h3 className="flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
        <UiIcon name="guild" size={16} color="currentColor" /> Garnison
      </h3>
      <p className="text-xs text-[var(--color-muted)]">
        Dépose <strong>1 héros</strong> pour que tes coéquipiers l'empruntent en renfort (Carte &
        Donjons, 1 par équipe). Ton héros n'est jamais bloqué — les autres jouent une copie, mise à
        jour automatiquement quand ton héros progresse. Si tu le retires, les groupes qui
        l'utilisaient en farm sont automatiquement mis à jour.
      </p>

      {garrison.isError && (
        <p className="text-sm text-[var(--color-ember)]">
          {garrison.error instanceof Error ? garrison.error.message : 'Erreur'}
        </p>
      )}

      {mine ? (
        <div className="flex items-center justify-between rounded-lg border border-[var(--color-arcane)] bg-[var(--color-arcane)]/10 p-2">
          <span className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
            <SyntyGlyph src={classWeaponCleanUrl(mine.class_id)} color={classMeta(mine.class_id).accent} size={22} />
            {mine.name} <span className="text-[10px] text-[var(--color-muted)]">N.{mine.level}</span>
          </span>
          <button
            onClick={() => garrison.mutate({ action: 'withdraw' })}
            disabled={garrison.isPending}
            className="btn btn-ghost text-xs text-[var(--color-ember)]"
          >
            Retirer
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-1 text-xs text-[var(--color-muted)]">Choisis un héros à déposer</div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {(heroes ?? []).map((h: HeroView) => {
              const chosen = picked === h.id;
              return (
                <button
                  key={h.id}
                  onClick={() => setPicked(chosen ? null : h.id)}
                  className={`panel flex flex-col items-center gap-0.5 p-2 text-center transition ${
                    chosen ? 'ring-2 ring-[var(--color-arcane)]' : 'opacity-80 hover:opacity-100'
                  }`}
                >
                  <SyntyGlyph src={classWeaponCleanUrl(h.classId)} color={classMeta(h.classId).accent} size={24} />
                  <span className="w-full truncate text-[10px] text-[var(--color-ink)]"><FavStar on={h.favorite} />{h.name}</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => picked && garrison.mutate({ action: 'deposit', hero_id: picked })}
            disabled={!picked || garrison.isPending}
            className="btn btn-primary mt-2 w-full text-xs"
          >
            {garrison.isPending ? 'Dépôt…' : 'Déposer en garnison'}
          </button>
        </div>
      )}

      <div>
        <div className="mb-1 text-xs text-[var(--color-muted)]">
          Renforts de la guilde ({(borrowable ?? []).length})
        </div>
        {(borrowable ?? []).length === 0 ? (
          <p className="text-[11px] text-[var(--color-muted)]/70">
            Aucun autre membre n'a déposé de héros pour l'instant.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(borrowable ?? []).map((b) => (
              <span
                key={b.hero_id}
                className="chip inline-flex items-center gap-1.5 bg-white/5 text-xs text-[var(--color-ink)]"
              >
                <SyntyGlyph src={classWeaponCleanUrl(b.class_id)} color={classMeta(b.class_id).accent} size={16} />
                {b.name}
                <span className="text-[10px] text-[var(--color-muted)]">
                  N.{b.level} · {b.owner_name}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RaidPanel({ guildId, nextLevel }: { guildId: string; nextLevel: number }) {
  const { data: enrolled } = useMyEnrollment(guildId);
  const { data: heroes } = useHeroes();
  const raid = useGuildRaid();
  const [picked, setPicked] = useState<string[]>([]);

  // Initialise la sélection avec l'inscription actuelle. On filtre les héros
  // « fantômes » (supprimés mais encore listés en base) pour ne pas bloquer un slot.
  useEffect(() => {
    if (enrolled && heroes) setPicked(enrolled.filter((id) => heroes.some((h) => h.id === id)));
  }, [enrolled, heroes]);

  function toggle(id: string) {
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((h) => h !== id) : cur.length < MAX_ENROLLED ? [...cur, id] : cur,
    );
  }

  const dirty = JSON.stringify([...picked].sort()) !== JSON.stringify([...(enrolled ?? [])].sort());

  return (
    <div className="panel space-y-3 p-4">
      <h3 className="flex flex-wrap items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
        <UiIcon name="raid" size={16} color="currentColor" /> Raid du soir
        <span
          className="ml-1 rounded-full bg-[var(--color-ember)]/15 px-2 py-0.5 text-[11px] font-bold text-[var(--color-ember)]"
          title="Niveau de raid actuel — battre ce niveau débloque le suivant et donne un point de guilde"
        >
          Niveau {nextLevel}/{MAX_RAID_LEVEL}
        </span>
      </h3>
      <p className="text-xs text-[var(--color-muted)]">
        Chaque soir à <strong>20h</strong>, la guilde lance automatiquement un raid avec les héros
        inscrits. Engage jusqu'à <strong>{MAX_ENROLLED} héros</strong> — peu importe qu'ils soient
        déployés sur la carte ou en expédition, ils participent quand même. Le butin est partagé
        entre tous les participants.
      </p>

      {raid.isError && (
        <p className="text-sm text-[var(--color-ember)]">
          {raid.error instanceof Error ? raid.error.message : 'Erreur'}
        </p>
      )}

      <div>
        <div className="mb-1 text-xs text-[var(--color-muted)]">
          Tes héros engagés ({picked.length}/{MAX_ENROLLED})
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {(heroes ?? []).map((h: HeroView) => {
            const chosen = picked.includes(h.id);
            const full = picked.length >= MAX_ENROLLED && !chosen;
            return (
              <button
                key={h.id}
                onClick={() => toggle(h.id)}
                disabled={full}
                className={`panel flex flex-col items-center gap-0.5 p-2 text-center transition ${
                  chosen ? 'ring-2 ring-[var(--color-arcane)]' : 'opacity-80 hover:opacity-100'
                } ${full ? 'opacity-40' : ''}`}
              >
                <SyntyGlyph src={classWeaponCleanUrl(h.classId)} color={classMeta(h.classId).accent} size={24} />
                <span className="w-full truncate text-[10px] text-[var(--color-ink)]"><FavStar on={h.favorite} />{h.name}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => raid.mutate({ action: 'enroll', hero_ids: picked })}
          disabled={raid.isPending || !dirty}
          className="btn btn-primary mt-2 w-full text-xs"
        >
          {raid.isPending
            ? 'Enregistrement…'
            : picked.length === 0
              ? 'Se retirer du raid'
              : `Inscrire ${picked.length} héros au raid du soir`}
        </button>
      </div>

      <NextRaidRoster guildId={guildId} />
    </div>
  );
}

/**
 * Composition inscrite au PROCHAIN raid, tous membres confondus — on ne voyait
 * que ses propres héros, sans savoir si la guilde partait à 2 ou à 10.
 * Regroupée par joueur : c'est ainsi qu'on lit une composition d'équipe.
 */
function NextRaidRoster({ guildId }: { guildId: string }) {
  const { data: roster, isLoading } = useRaidRoster(guildId);
  const byOwner = useMemo(() => {
    const map = new Map<string, EnrolledHero[]>();
    for (const h of roster ?? []) {
      const arr = map.get(h.owner_name) ?? [];
      arr.push(h);
      map.set(h.owner_name, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [roster]);

  const total = (roster ?? []).length;

  return (
    <div className="rounded-lg border border-[var(--color-edge)] bg-white/[0.02] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted)]">
          Composition actuelle
        </span>
        <span className="chip bg-white/5 text-[10px] text-[var(--color-muted)]">
          {total} héros · {byOwner.length} joueur(s)
        </span>
      </div>

      {isLoading ? (
        <p className="text-[11px] text-[var(--color-muted)]">Chargement…</p>
      ) : total === 0 ? (
        <p className="text-[11px] text-[var(--color-muted)]">
          Personne n'est encore inscrit. Engage des héros ci-dessus — la guilde partira à 20h.
        </p>
      ) : (
        <div className="space-y-1.5">
          {byOwner.map(([owner, list]) => (
            <div key={owner} className="flex flex-wrap items-center gap-1.5">
              <span className="min-w-[5rem] text-[11px] font-medium text-[var(--color-ink)]">
                {owner}
              </span>
              {list.map((h) => (
                <span
                  key={h.id}
                  className="chip inline-flex items-center gap-1 bg-white/5 text-[11px] text-[var(--color-ink)]"
                  title={`${h.name} — ${classMeta(h.class_id).label} niv. ${h.level}, engagé par ${owner}`}
                >
                  <SyntyGlyph
                    src={classWeaponCleanUrl(h.class_id)}
                    color={classMeta(h.class_id).accent}
                    size={12}
                  />
                  {h.name}
                  <span className="text-[var(--color-muted)]">niv. {h.level}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LastRaidCard({ guildId }: { guildId: string }) {
  const { data: run } = useLastGuildRaid(guildId);
  const { data: raids } = useRaidTypes();
  const [replayIdx, setReplayIdx] = useState<number | null>(null);

  // Composition du raid : héros engagé → classe + propriétaire. Les pseudos
  // passent par `player_names` (la RLS de `profiles` est « select own »).
  const runHeroes = run?.result?.heroes;
  const [ownerNames, setOwnerNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let alive = true;
    void namesByIds((runHeroes ?? []).map((h) => h.owner_id)).then((n) => {
      if (alive) setOwnerNames(n);
    });
    return () => {
      alive = false;
    };
  }, [runHeroes]);

  const roster = useMemo(() => {
    const names = new Map(
      (run?.result?.fight_results?.[0]?.combat.finalState ?? []).map((c) => [c.id, c.name]),
    );
    return (runHeroes ?? []).map((h) => ({
      id: h.id,
      classId: h.class_id,
      name: names.get(h.id) ?? 'Héros',
      owner: ownerNames.get(h.owner_id) ?? '…',
    }));
  }, [runHeroes, ownerNames, run]);

  if (!run) {
    return (
      <div className="panel p-4 text-sm text-[var(--color-muted)]">
        Aucun raid du soir résolu pour l'instant. Inscris des héros — la guilde partira à 20h.
      </div>
    );
  }
  const raidName = (raids ?? []).find((r) => r.id === run.raid_type_id)?.name ?? 'Raid';
  const loot = run.result?.loot ?? [];
  const fights = run.result?.fight_results ?? [];

  return (
    <div className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
          <UiIcon name={run.success ? 'victory' : 'defeat'} size={16} color="currentColor" />
          Dernier raid du soir
        </h3>
        <span className="text-[11px] text-[var(--color-muted)]">
          {new Date(run.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={run.success ? 'text-[var(--color-gold)]' : 'text-[var(--color-ember)]'}>
          {raidName} — {run.success ? 'vaincu' : `échec vague ${run.reached_index + 1}`}
        </span>
        <span className="chip bg-white/5 text-[11px] text-[var(--color-muted)]">
          {run.participant_player_ids.length} participant(s)
        </span>
      </div>

      {/* Qui a engagé quoi. Le nom du héros vient de l'état final du 1er combat ;
          sa classe et son propriétaire de `result.heroes` (absent des vieux raids). */}
      {roster.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {roster.map((r) => (
            <span
              key={r.id}
              className="chip inline-flex items-center gap-1 bg-white/5 text-[11px] text-[var(--color-ink)]"
              title={`${r.name} — engagé par ${r.owner}`}
            >
              <SyntyGlyph
                src={classWeaponCleanUrl(r.classId)}
                color={classMeta(r.classId).accent}
                size={12}
              />
              {r.name}
              <span className="text-[var(--color-muted)]">· {r.owner}</span>
            </span>
          ))}
        </div>
      )}

      {loot.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {loot.map((d) => (
            <span key={d.resource} className="chip inline-flex items-center gap-1 bg-white/5 text-[var(--color-ink)]">
              <ResourceIcon resKey={d.resource} /> +{d.amount} {resourceMeta(d.resource).label}
            </span>
          ))}
        </div>
      )}

      {fights.length > 0 && (
        <button onClick={() => setReplayIdx(0)} className="btn btn-ghost text-xs">
          ▶ Revoir les combats ({fights.length})
        </button>
      )}

      {replayIdx !== null && fights[replayIdx] && (
        <RaidReplay
          fights={fights}
          index={replayIdx}
          raidName={raidName}
          heroes={run.result.heroes}
          onIndex={setReplayIdx}
          onClose={() => setReplayIdx(null)}
        />
      )}
    </div>
  );
}

function toStored(c: RaidFightResult['combat']): StoredCombat {
  return { rounds: c.rounds, result: c.result, events: c.events, final_state: c.finalState };
}

function RaidReplay({
  fights,
  index,
  raidName,
  heroes,
  onIndex,
  onClose,
}: {
  fights: RaidFightResult[];
  index: number;
  raidName: string;
  /** Carte héros → classe/propriétaire du raid (absente sur les vieux raids). */
  heroes?: { id: string; class_id: string; owner_id: string }[] | undefined;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const fight = fights[index]!;
  const hasNext = index < fights.length - 1;

  const classById = useMemo(
    () => new Map((heroes ?? []).map((h) => [h.id, h.class_id])),
    [heroes],
  );
  // Les pseudos des coéquipiers passent par la vue `player_names` : la RLS de
  // `profiles` est « select own », un join direct renverrait null.
  const [ownerNames, setOwnerNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let alive = true;
    void namesByIds((heroes ?? []).map((h) => h.owner_id)).then((names) => {
      if (!alive) return;
      setOwnerNames(new Map((heroes ?? []).map((h) => [h.id, names.get(h.owner_id) ?? '?'])));
    });
    return () => {
      alive = false;
    };
  }, [heroes]);

  return (
    <CombatReplay
      key={index}
      combat={toStored(fight.combat)}
      enemyKind={fight.kind}
      extraClassById={classById}
      ownerNameById={ownerNames}
      onClose={onClose}
      title={`${raidName} — vague ${index + 1}/${fights.length} · ${fight.enemyName}`}
      footer={
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            onClick={() => index > 0 && onIndex(index - 1)}
            disabled={index === 0}
            className="btn btn-ghost text-xs disabled:opacity-40"
          >
            ◀ Précédent
          </button>
          {hasNext ? (
            <button onClick={() => onIndex(index + 1)} className="btn btn-primary text-xs">
              Vague suivante ▶
            </button>
          ) : (
            <button onClick={onClose} className="btn btn-primary text-xs">
              Terminer
            </button>
          )}
        </div>
      }
    />
  );
}

