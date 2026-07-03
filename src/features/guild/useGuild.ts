import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
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
};

export type GuildMember = {
  player_id: string;
  role: GuildRole;
  contribution: number;
  raids_joined: number;
  display_name: string;
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
        .select('player_id, role, contribution, raids_joined, player:profiles!guild_members_player_id_fkey(display_name)')
        .eq('guild_id', mem.guild_id);
      const roster: GuildMember[] = (members ?? []).map((m: Record<string, unknown>) => ({
        player_id: m.player_id as string,
        role: m.role as GuildRole,
        contribution: (m.contribution as number) ?? 0,
        raids_joined: (m.raids_joined as number) ?? 0,
        display_name: ((m.player as { display_name?: string } | null)?.display_name) ?? 'Joueur',
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
