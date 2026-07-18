import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { namesByIds, titlesByIds } from '@/lib/playerNames';
import type { CombatEvent, CombatantFinalState } from '@shared/combat';

// Les tables guilde ne sont pas dans les types générés (hand-maintained) → client
// permissif pour ces lectures ; les lignes sont re-typées explicitement ci-dessous.
const gdb = supabase as unknown as SupabaseClient;

/* ------------------------------------------------------------------ TYPES */

export type GuildRole = 'founder' | 'officer' | 'member';

export type Guild = {
  id: string;
  name: string;
  tag: string;
  description: string;
  emblem: string;
  xp: number;
  max_members: number;
  last_raid_at: string | null;
  /** Plus haut niveau de raid battu (0..10) — pilote les points de raid. */
  highest_raid_cleared: number;
  /** Répartition de l'arbre de compétences de guilde. */
  skill_alloc: import('@shared/progression/guildSkills').GuildAlloc;
};

export type GuildMember = {
  player_id: string;
  role: GuildRole;
  contribution: number;
  raids_joined: number;
  display_name: string;
  /** Titre équipé (succès) du membre, ou null. */
  title: string | null;
};

export type GuildEvent = {
  id: string;
  kind: string;
  message: string;
  created_at: string;
};

export type GuildLeaderboardRow = {
  guild_id: string;
  name: string;
  tag: string;
  emblem: string;
  xp: number;
  members: number;
  contribution: number;
  raids_cleared: number;
};

export type RaidType = {
  id: string;
  name: string;
  tier: number;
  required_guild_level: number;
  min_heroes: number;
  max_heroes: number;
  monster_sequence: { name: string; enemies: unknown[] }[];
};

export type RaidLobby = { id: string; raid_type_id: string; status: string; expires_at: string };
export type RaidContribution = { player_id: string; hero_ids: string[] };

export type RaidFightResult = {
  index: number;
  kind: 'normal' | 'miniboss' | 'boss';
  enemyName: string;
  combat: { result: 'win' | 'loss'; rounds: number; events: CombatEvent[]; finalState: CombatantFinalState[] };
};
export type RaidRunResponse = {
  run_id: string | null;
  success: boolean;
  reached_index: number;
  raid: { id: string; name: string };
  fight_results: RaidFightResult[];
  loot: { resource: string; amount: number }[];
  guild_xp_gained: number;
};

/* ---------------------------------------------------------------- QUERIES */

export type MyGuild = { guild: Guild; role: GuildRole; members: GuildMember[] } | null;

export function useMyGuild() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['guild', 'mine', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<MyGuild> => {
      const { data: mem } = await gdb
        .from('guild_members')
        .select('guild_id, role')
        .eq('player_id', userId!)
        .maybeSingle();
      if (!mem) return null;
      const { data: guild } = await gdb.from('guilds').select('*').eq('id', mem.guild_id).single();
      const { data: members } = await gdb
        .from('guild_members')
        .select('player_id, role, contribution, raids_joined')
        .eq('guild_id', mem.guild_id);
      const memberIds = (members ?? []).map((m) => m.player_id as string);
      const [names, titles] = await Promise.all([namesByIds(memberIds), titlesByIds(memberIds)]);
      const roster: GuildMember[] = (members ?? []).map((m: Record<string, unknown>) => ({
        player_id: m.player_id as string,
        role: m.role as GuildRole,
        contribution: (m.contribution as number) ?? 0,
        raids_joined: (m.raids_joined as number) ?? 0,
        display_name: names.get(m.player_id as string) ?? 'Joueur',
        title: titles.get(m.player_id as string) ?? null,
      }));
      return { guild: guild as Guild, role: mem.role as GuildRole, members: roster };
    },
  });
}

export function useGuildEvents(guildId: string | undefined) {
  return useQuery({
    queryKey: ['guild', 'events', guildId],
    enabled: Boolean(guildId),
    queryFn: async (): Promise<GuildEvent[]> => {
      const { data } = await gdb
        .from('guild_events')
        .select('id, kind, message, created_at')
        .eq('guild_id', guildId!)
        .order('created_at', { ascending: false })
        .limit(30);
      return (data ?? []) as GuildEvent[];
    },
  });
}

export function useGuildLeaderboard() {
  return useQuery({
    queryKey: ['guild', 'leaderboard'],
    queryFn: async (): Promise<GuildLeaderboardRow[]> => {
      const { data } = await gdb
        .from('guild_leaderboard')
        .select('*')
        .order('xp', { ascending: false })
        .limit(20);
      return (data ?? []) as GuildLeaderboardRow[];
    },
  });
}

export function useRaidTypes() {
  return useQuery({
    queryKey: ['guild', 'raid_types'],
    queryFn: async (): Promise<RaidType[]> => {
      const { data } = await gdb.from('guild_raid_types').select('*').order('tier');
      return (data ?? []) as RaidType[];
    },
  });
}

export function useOpenLobby(guildId: string | undefined) {
  return useQuery({
    queryKey: ['guild', 'lobby', guildId],
    enabled: Boolean(guildId),
    queryFn: async (): Promise<{ lobby: RaidLobby | null; contributions: RaidContribution[] }> => {
      const { data: lobby } = await gdb
        .from('guild_raid_lobbies')
        .select('id, raid_type_id, status, expires_at')
        .eq('guild_id', guildId!)
        .eq('status', 'open')
        .maybeSingle();
      if (!lobby) return { lobby: null, contributions: [] };
      const { data: contribs } = await gdb
        .from('guild_raid_contributions')
        .select('player_id, hero_ids')
        .eq('lobby_id', lobby.id);
      return { lobby: lobby as RaidLobby, contributions: (contribs ?? []) as RaidContribution[] };
    },
  });
}

/** Inscription du joueur au raid du soir (héros engagés, max 2). */
export function useMyEnrollment(guildId: string | undefined) {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['guild', 'enrollment', userId, guildId],
    enabled: Boolean(userId && guildId),
    queryFn: async (): Promise<string[]> => {
      const { data } = await gdb
        .from('guild_raid_enrollments')
        .select('hero_ids')
        .eq('player_id', userId!)
        .maybeSingle();
      return ((data?.hero_ids as string[]) ?? []) as string[];
    },
  });
}

/** Héros inscrit au prochain raid (résolu côté serveur : RLS « select own »). */
export type EnrolledHero = {
  id: string;
  name: string;
  class_id: string;
  level: number;
  owner_id: string;
  owner_name: string;
};

/**
 * Composition inscrite au prochain raid, TOUS MEMBRES confondus. Passe par la
 * fonction edge : le client ne peut pas lire les héros des autres joueurs.
 */
export function useRaidRoster(guildId: string | undefined) {
  return useQuery({
    queryKey: ['guild', 'raid_roster', guildId],
    enabled: Boolean(guildId),
    queryFn: async (): Promise<EnrolledHero[]> => {
      const r = await invoke<{ heroes: EnrolledHero[] }>('guild-raid', { action: 'roster' });
      return r.heroes ?? [];
    },
  });
}

export type GuildRaidRun = {
  id: string;
  raid_type_id: string;
  success: boolean;
  reached_index: number;
  created_at: string;
  participant_player_ids: string[];
  result: {
    fight_results: RaidFightResult[];
    loot: { resource: string; amount: number }[];
    /**
     * Classe + propriétaire de chaque héros engagé, figés au moment du raid.
     * OPTIONNEL : les raids résolus avant cet ajout ne le portent pas.
     */
    heroes?: { id: string; class_id: string; owner_id: string }[];
  };
};

/** Dernier raid résolu de la guilde (auto du soir ou manuel). */
export function useLastGuildRaid(guildId: string | undefined) {
  return useQuery({
    queryKey: ['guild', 'last_raid', guildId],
    enabled: Boolean(guildId),
    queryFn: async (): Promise<GuildRaidRun | null> => {
      const { data } = await gdb
        .from('guild_raid_runs')
        .select('id, raid_type_id, success, reached_index, created_at, participant_player_ids, result')
        .eq('guild_id', guildId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as GuildRaidRun | null) ?? null;
    },
  });
}

/* -------------------------------------------------------------- MUTATIONS */

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(fn, { body });
  if (error) {
    let msg = error.message;
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = (await ctx.json()) as { error?: string };
        if (j?.error) msg = j.error;
      } catch {
        /* ignore */
      }
    }
    throw new Error(msg);
  }
  return data as T;
}

export function useGuildActions() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['guild'] });
  return useMutation({
    mutationFn: (args: Record<string, unknown>) => invoke('guild-actions', args),
    onSuccess: invalidate,
  });
}

export function useGuildRaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Record<string, unknown>) => invoke<RaidRunResponse | { ok?: boolean; lobby_id?: string }>('guild-raid', args),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['guild'] });
      void qc.invalidateQueries({ queryKey: ['resources'] });
    },
  });
}

/* ---------------------------------------------------------------- GARNISON */

/** Un héros de la garnison de guilde (empruntable par les autres membres). */
export type GarrisonHero = {
  hero_id: string;
  name: string;
  class_id: string;
  level: number;
  owner_id: string;
  owner_name: string;
};

export type MyGarrison = { hero_id: string; name: string; class_id: string; level: number } | null;

/** Le héros que J'AI déposé en garnison (0 ou 1). */
export function useMyGarrison() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['garrison', 'mine', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<MyGarrison> => {
      const { data } = await gdb
        .from('guild_garrison')
        .select('hero_id, hero_name, hero_class_id, hero_level')
        .eq('owner_player_id', userId!)
        .maybeSingle();
      if (!data) return null;
      return {
        hero_id: data.hero_id as string,
        name: data.hero_name as string,
        class_id: data.hero_class_id as string,
        level: data.hero_level as number,
      };
    },
  });
}

/** Héros empruntables = garnison de MA guilde, hors les miens (renforts). */
export function useBorrowableHeroes() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['garrison', 'borrowable', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<GarrisonHero[]> => {
      const { data: mem } = await gdb
        .from('guild_members')
        .select('guild_id')
        .eq('player_id', userId!)
        .maybeSingle();
      if (!mem) return [];
      const { data } = await gdb
        .from('guild_garrison')
        .select('hero_id, hero_name, hero_class_id, hero_level, owner_player_id')
        .eq('guild_id', mem.guild_id)
        .neq('owner_player_id', userId!);
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      const names = await namesByIds(rows.map((r) => r.owner_player_id as string));
      return rows.map((r) => ({
        hero_id: r.hero_id as string,
        name: r.hero_name as string,
        class_id: r.hero_class_id as string,
        level: r.hero_level as number,
        owner_id: r.owner_player_id as string,
        owner_name: names.get(r.owner_player_id as string) ?? 'Joueur',
      }));
    },
  });
}

/** deposit / withdraw un héros de la garnison. */
export function useGarrisonActions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Record<string, unknown>) => invoke('garrison-actions', args),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['garrison'] });
      void qc.invalidateQueries({ queryKey: ['guild'] });
      void qc.invalidateQueries({ queryKey: ['deployments'] });
    },
  });
}
