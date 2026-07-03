import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useHeroes, type HeroView } from '@/features/heroes/useHeroes';
import { classMeta } from '@/lib/gameUi';
import { classWeaponCleanUrl, type UiIconName } from '@/lib/synty';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { CombatReplay, type StoredCombat } from '@/components/CombatReplay';
import { BackToVillage } from '@/components/BackToVillage';
import { guildLevelProgress, canManageMembers, canStartRaid, canKick } from '@shared/progression/guild';
import {
  useMyGuild,
  useGuildEvents,
  useGuildLeaderboard,
  useRaidTypes,
  useOpenLobby,
  useGuildActions,
  useGuildRaid,
  type GuildMember,
  type GuildRole,
  type RaidFightResult,
  type RaidRunResponse,
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

function GuildHome() {
  const userId = useAuthStore((s) => s.user?.id);
  const { data: mine } = useMyGuild();
  const { data: events } = useGuildEvents(mine?.guild.id);
  const actions = useGuildActions();

  if (!mine) return null;
  const { guild, role, members } = mine;
  const prog = guildLevelProgress(guild.xp);
  const pct = Math.min(100, Math.round((prog.intoLevel / prog.neededForNext) * 100));

  return (
    <div className="space-y-4">
      {/* En-tête */}
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

      <RaidPanel role={role} guildId={guild.id} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Roster */}
        <div className="panel p-4">
          <h3 className="mb-2 font-display font-semibold text-[var(--color-ink)]">Membres</h3>
          <div className="space-y-1">
            {[...members].sort((a, b) => b.contribution - a.contribution).map((m) => (
              <MemberRow key={m.player_id} m={m} myRole={role} isMe={m.player_id === userId} actions={actions} />
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            {role === 'founder' ? (
              <button
                onClick={() => window.confirm('Dissoudre la guilde ?') && actions.mutate({ action: 'disband' })}
                className="btn btn-ghost text-xs text-[var(--color-ember)]"
              >
                Dissoudre
              </button>
            ) : (
              <button onClick={() => actions.mutate({ action: 'leave' })} className="btn btn-ghost text-xs">
                Quitter
              </button>
            )}
          </div>
        </div>

        {/* Flux d'activité */}
        <div className="panel p-4">
          <h3 className="mb-2 font-display font-semibold text-[var(--color-ink)]">Activité</h3>
          <div className="max-h-64 space-y-1 overflow-y-auto text-sm">
            {(events ?? []).map((e) => (
              <div key={e.id} className="flex items-center gap-2 rounded bg-white/[0.03] px-2 py-1 text-xs">
                {EVENT_ICON[e.kind] ? (
                  <UiIcon name={EVENT_ICON[e.kind]!} size={13} color="currentColor" />
                ) : (
                  <span className="text-[var(--color-muted)]">•</span>
                )}
                <span className="text-[var(--color-ink)]/85">{e.message}</span>
              </div>
            ))}
            {(events ?? []).length === 0 && <p className="text-xs text-[var(--color-muted)]">Rien pour l'instant.</p>}
          </div>
        </div>
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
      <span className="flex items-center gap-2">
        <span className="font-medium text-[var(--color-ink)]">{m.display_name}</span>
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

function RaidPanel({ role, guildId }: { role: GuildRole; guildId: string }) {
  const { data: raids } = useRaidTypes();
  const { data: lobbyData } = useOpenLobby(guildId);
  const { data: heroes } = useHeroes();
  const raid = useGuildRaid();
  const [picked, setPicked] = useState<string[]>([]);
  const [replay, setReplay] = useState<{ res: RaidRunResponse; idx: number } | null>(null);

  const lobby = lobbyData?.lobby ?? null;
  const raidType = (raids ?? []).find((r) => r.id === lobby?.raid_type_id);
  const totalCommitted = (lobbyData?.contributions ?? []).reduce((s, c) => s + (c.hero_ids?.length ?? 0), 0);

  function toggle(id: string) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((h) => h !== id) : [...cur, id]));
  }

  return (
    <div className="panel space-y-3 p-4">
      <h3 className="flex items-center gap-1.5 font-display font-semibold text-[var(--color-ink)]">
        <UiIcon name="attack" size={16} color="currentColor" /> Raid de guilde
      </h3>

      {raid.isError && (
        <p className="text-sm text-[var(--color-ember)]">{raid.error instanceof Error ? raid.error.message : 'Erreur'}</p>
      )}

      {!lobby ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--color-muted)]">Aucun raid en cours.</p>
          {canStartRaid(role) ? (
            <div className="flex flex-wrap gap-2">
              {(raids ?? []).map((r) => (
                <button
                  key={r.id}
                  onClick={() => raid.mutate({ action: 'create_lobby', raid_type_id: r.id })}
                  disabled={raid.isPending}
                  className="btn btn-primary text-xs"
                >
                  Ouvrir : {r.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--color-muted)]">Un officier doit ouvrir un lobby de raid.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-[var(--color-ink)]">{raidType?.name ?? 'Raid'}</span>
            <span className="chip bg-white/5 text-[11px] text-[var(--color-muted)]">
              {totalCommitted} héros engagés · min {raidType?.min_heroes ?? '?'}
            </span>
          </div>

          {/* Engager mes héros */}
          <div>
            <div className="mb-1 text-xs text-[var(--color-muted)]">Engage tes héros ({picked.length})</div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {(heroes ?? []).map((h: HeroView) => (
                <button
                  key={h.id}
                  onClick={() => toggle(h.id)}
                  className={`panel flex flex-col items-center gap-0.5 p-2 text-center transition ${
                    picked.includes(h.id) ? 'ring-2 ring-[var(--color-arcane)]' : 'opacity-80 hover:opacity-100'
                  }`}
                >
                  <SyntyGlyph src={classWeaponCleanUrl(h.classId)} color={classMeta(h.classId).accent} size={24} />
                  <span className="w-full truncate text-[10px] text-[var(--color-ink)]">{h.name}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => raid.mutate({ action: 'contribute', lobby_id: lobby.id, hero_ids: picked })}
              disabled={raid.isPending}
              className="btn btn-arcane mt-2 w-full text-xs"
            >
              Engager mes {picked.length} héros
            </button>
          </div>

          {canStartRaid(role) && (
            <div className="flex gap-2">
              <button
                onClick={() =>
                  raid.mutate(
                    { action: 'resolve', lobby_id: lobby.id },
                    { onSuccess: (r) => 'fight_results' in (r as RaidRunResponse) && setReplay({ res: r as RaidRunResponse, idx: 0 }) },
                  )
                }
                disabled={raid.isPending}
                className="btn btn-primary flex-1 text-xs"
              >
                <UiIcon name="raid" size={14} color="currentColor" /> Résoudre le raid
              </button>
              <button onClick={() => raid.mutate({ action: 'cancel', lobby_id: lobby.id })} className="btn btn-ghost text-xs">
                Annuler
              </button>
            </div>
          )}
        </div>
      )}

      {replay && replay.res.fight_results[replay.idx] && (
        <RaidReplay res={replay.res} index={replay.idx} onIndex={(i) => setReplay({ ...replay, idx: i })} onClose={() => setReplay(null)} />
      )}
    </div>
  );
}

function toStored(c: RaidFightResult['combat']): StoredCombat {
  return { rounds: c.rounds, result: c.result, events: c.events, final_state: c.finalState };
}

function RaidReplay({
  res,
  index,
  onIndex,
  onClose,
}: {
  res: RaidRunResponse;
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const fight = res.fight_results[index]!;
  const hasNext = index < res.fight_results.length - 1;
  const lost = fight.combat.result === 'loss';
  return (
    <CombatReplay
      key={index}
      combat={toStored(fight.combat)}
      onClose={onClose}
      title={`${res.raid.name} — vague ${index + 1}/${res.fight_results.length} · ${fight.enemyName}`}
      footer={
        <div className="mt-3 flex flex-col items-center gap-2">
          {index === res.fight_results.length - 1 && (
            <div className="inline-flex flex-wrap items-center gap-1 text-xs text-[var(--color-muted)]">
              <UiIcon name={res.success ? 'victory' : 'defeat'} size={13} color="currentColor" />
              {res.success ? 'Raid vaincu' : 'Échec'} · +{res.guild_xp_gained} XP de guilde ·{' '}
              {res.loot.map((d) => (
                <span key={d.resource} className="ml-1 inline-flex items-center gap-1">
                  <ResourceIcon resKey={d.resource} /> {d.amount}
                </span>
              ))}
            </div>
          )}
          {hasNext && !lost ? (
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
