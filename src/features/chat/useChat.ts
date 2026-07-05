import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { useChatStore, thresholdOf } from '@/store/chatStore';

// La table chat_messages n'est pas dans les types générés → client permissif.
const cdb = supabase as unknown as SupabaseClient;

export type ChatMessage = {
  id: string;
  channel: 'general' | 'guild' | 'dm';
  guild_id: string | null;
  sender_id: string;
  sender_name: string;
  recipient_id: string | null;
  body: string;
  created_at: string;
};

export type ChatView =
  | { kind: 'general' }
  | { kind: 'guild'; guildId: string }
  | { kind: 'dm'; peerId: string };

export type DmConversation = { peerId: string; peerName: string; lastBody: string; lastAt: string };

const SELECT = 'id, channel, guild_id, sender_id, sender_name, recipient_id, body, created_at';

function viewKey(v: ChatView, userId: string | undefined): (string | undefined)[] {
  if (v.kind === 'general') return ['chat', 'general'];
  if (v.kind === 'guild') return ['chat', 'guild', v.guildId];
  return ['chat', 'dm', userId, v.peerId];
}

/** Messages récents d'une vue (général / guilde / conversation privée), du plus ancien au plus récent. */
export function useChatMessages(view: ChatView | null) {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: view ? viewKey(view, userId) : ['chat', 'none'],
    enabled: Boolean(view && userId),
    queryFn: async (): Promise<ChatMessage[]> => {
      const v = view!;
      let q = cdb.from('chat_messages').select(SELECT).order('created_at', { ascending: false }).limit(50);
      if (v.kind === 'general') {
        q = q.eq('channel', 'general');
      } else if (v.kind === 'guild') {
        q = q.eq('channel', 'guild').eq('guild_id', v.guildId);
      } else {
        q = q
          .eq('channel', 'dm')
          .or(
            `and(sender_id.eq.${userId},recipient_id.eq.${v.peerId}),and(sender_id.eq.${v.peerId},recipient_id.eq.${userId})`,
          );
      }
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as ChatMessage[]).reverse();
    },
  });
}

/** Envoie un message sur la vue courante. */
export function useSendChat() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  return useMutation({
    mutationFn: async (args: { view: ChatView; body: string }) => {
      const body = args.body.trim().slice(0, 500);
      if (!body || !userId) return;
      const row: Record<string, unknown> = { channel: args.view.kind, sender_id: userId, body };
      if (args.view.kind === 'guild') row.guild_id = args.view.guildId;
      if (args.view.kind === 'dm') row.recipient_id = args.view.peerId;
      const { error } = await cdb.from('chat_messages').insert(row);
      if (error) throw error;
    },
    onSuccess: (_d, args) => {
      void qc.invalidateQueries({ queryKey: viewKey(args.view, userId) });
      void qc.invalidateQueries({ queryKey: ['chat', 'dm-list', userId] });
    },
  });
}

/**
 * Abonnement temps réel unique : rafraîchit les vues chat à chaque nouveau message
 * et déclenche une notification toast sur un message PRIVÉ entrant (sauf si on est
 * déjà en train de regarder cette conversation).
 */
export function useChatRealtime() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const pushToast = useChatStore((s) => s.pushToast);
  useEffect(() => {
    const ch = cdb
      .channel('chat-stream')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          void qc.invalidateQueries({ queryKey: ['chat'] });
          const m = payload.new as Partial<ChatMessage> | undefined;
          if (!m || !userId || m.sender_id === userId) return;
          if (m.channel === 'dm' && m.recipient_id === userId) {
            const st = useChatStore.getState();
            const watching = st.chatOpen && st.activePeerId === m.sender_id;
            if (!watching) {
              pushToast({
                peerId: m.sender_id!,
                peerName: m.sender_name ?? 'Joueur',
                body: m.body ?? '',
              });
            }
          }
        },
      )
      .subscribe();
    return () => {
      void cdb.removeChannel(ch);
    };
  }, [qc, userId, pushToast]);
}

/** Compteurs de messages non lus par canal (général / guilde / privé). */
export function useChatUnread(guildId: string | null) {
  const userId = useAuthStore((s) => s.user?.id);
  const lastRead = useChatStore((s) => s.lastRead);
  const tGen = thresholdOf(lastRead, 'general');
  const tGuild = thresholdOf(lastRead, `guild:${guildId}`);
  const tDm = thresholdOf(lastRead, 'dm');
  return useQuery({
    queryKey: ['chat', 'unread', userId, guildId, tGen, tGuild, tDm],
    enabled: Boolean(userId),
    queryFn: async (): Promise<{ general: number; guild: number; dm: number }> => {
      const iso = (ms: number) => new Date(ms).toISOString();
      const gen = await cdb
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('channel', 'general')
        .neq('sender_id', userId!)
        .gt('created_at', iso(tGen));
      let guild = 0;
      if (guildId) {
        const gc = await cdb
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('channel', 'guild')
          .eq('guild_id', guildId)
          .neq('sender_id', userId!)
          .gt('created_at', iso(tGuild));
        guild = gc.count ?? 0;
      }
      const dm = await cdb
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('channel', 'dm')
        .eq('recipient_id', userId!)
        .gt('created_at', iso(tDm));
      return { general: gen.count ?? 0, guild, dm: dm.count ?? 0 };
    },
  });
}

/** Liste des conversations privées (dernier message par interlocuteur). */
export function useDmConversations() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['chat', 'dm-list', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<DmConversation[]> => {
      const { data, error } = await cdb
        .from('chat_messages')
        .select(
          'sender_id, sender_name, recipient_id, body, created_at, recipient:profiles!chat_messages_recipient_id_fkey(display_name)',
        )
        .eq('channel', 'dm')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      const seen = new Map<string, DmConversation>();
      for (const m of (data ?? []) as Record<string, unknown>[]) {
        const iAmSender = m.sender_id === userId;
        const peerId = (iAmSender ? m.recipient_id : m.sender_id) as string | null;
        if (!peerId || seen.has(peerId)) continue;
        const peerName = iAmSender
          ? ((m.recipient as { display_name?: string } | null)?.display_name ?? 'Joueur')
          : (m.sender_name as string);
        seen.set(peerId, {
          peerId,
          peerName,
          lastBody: m.body as string,
          lastAt: m.created_at as string,
        });
      }
      return [...seen.values()];
    },
  });
}
