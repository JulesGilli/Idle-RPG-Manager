import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { useProfile } from '@/hooks/useProfile';
import { namesByIds, titlesByIds } from '@/lib/playerNames';
import { useChatStore, thresholdOf } from '@/store/chatStore';

// La table chat_messages n'est pas dans les types générés → client permissif.
const cdb = supabase as unknown as SupabaseClient;

export type ChatMessage = {
  id: string;
  channel: 'general' | 'guild' | 'dm';
  guild_id: string | null;
  sender_id: string;
  sender_name: string;
  /** Titre équipé de l'expéditeur (résolu en live via player_names ; null si aucun). */
  sender_title?: string | null;
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
      const rows = ((data ?? []) as ChatMessage[]).reverse();
      // Titre équipé de chaque expéditeur (toujours à jour), pour l'afficher à côté du pseudo.
      const titles = await titlesByIds(rows.map((m) => m.sender_id));
      return rows.map((m) => ({ ...m, sender_title: titles.get(m.sender_id) ?? null }));
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

export type OnlinePlayer = { id: string; name: string };

/**
 * Canal de présence PARTAGÉ (singleton, ref-compté) : le hook peut être monté par
 * plusieurs composants (ChatWidget, panneau admin…) sans re-souscrire au même canal
 * `online-players` — Supabase interdit d'ajouter des callbacks `.on` après
 * `subscribe()`. On garde donc UN seul abonnement et on diffuse à tous les abonnés.
 */
let presenceChannel: ReturnType<typeof cdb.channel> | null = null;
let presenceRefCount = 0;
let presencePlayers: OnlinePlayer[] = [];
const presenceListeners = new Set<(p: OnlinePlayer[]) => void>();

/**
 * Joueurs actuellement en ligne (Supabase Realtime Presence). On est « en ligne »
 * tant qu'au moins un de ces hooks est monté. Aucune écriture DB : présence éphémère.
 */
export function useOnlinePlayers(): OnlinePlayer[] {
  const userId = useAuthStore((s) => s.user?.id);
  const { data: profile } = useProfile();
  const name = profile?.display_name ?? 'Joueur';
  const [players, setPlayers] = useState<OnlinePlayer[]>(presencePlayers);

  useEffect(() => {
    if (!userId) return;
    const listener = (p: OnlinePlayer[]) => setPlayers(p);
    presenceListeners.add(listener);
    presenceRefCount += 1;

    if (!presenceChannel) {
      const ch = cdb.channel('online-players', { config: { presence: { key: userId } } });
      presenceChannel = ch;
      const sync = () => {
        const state = ch.presenceState() as Record<string, Array<{ id?: string; name?: string }>>;
        const seen = new Set<string>();
        const list: OnlinePlayer[] = [];
        for (const metas of Object.values(state)) {
          for (const m of metas) {
            if (!m?.id || seen.has(m.id)) continue;
            seen.add(m.id);
            list.push({ id: m.id, name: m.name ?? 'Joueur' });
          }
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        presencePlayers = list;
        presenceListeners.forEach((l) => l(list));
      };
      ch.on('presence', { event: 'sync' }, sync)
        .on('presence', { event: 'join' }, sync)
        .on('presence', { event: 'leave' }, sync)
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void ch.track({ id: userId, name });
        });
    } else {
      // Canal déjà actif → livre immédiatement l'instantané courant au nouvel abonné.
      setPlayers(presencePlayers);
    }

    return () => {
      presenceListeners.delete(listener);
      presenceRefCount -= 1;
      if (presenceRefCount <= 0 && presenceChannel) {
        void cdb.removeChannel(presenceChannel);
        presenceChannel = null;
        presencePlayers = [];
      }
    };
  }, [userId, name]);

  return players;
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
        .select('sender_id, sender_name, recipient_id, body, created_at')
        .eq('channel', 'dm')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      const seen = new Map<string, DmConversation>();
      for (const m of (data ?? []) as Record<string, unknown>[]) {
        const iAmSender = m.sender_id === userId;
        const peerId = (iAmSender ? m.recipient_id : m.sender_id) as string | null;
        if (!peerId || seen.has(peerId)) continue;
        // Interlocuteur = destinataire (résolu via player_names) si je suis l'expéditeur,
        // sinon l'expéditeur (nom dénormalisé fiable).
        seen.set(peerId, {
          peerId,
          peerName: iAmSender ? '' : (m.sender_name as string),
          lastBody: m.body as string,
          lastAt: m.created_at as string,
        });
      }
      // Résout les noms des destinataires (conversations où je suis l'expéditeur).
      const missing = [...seen.values()].filter((c) => !c.peerName).map((c) => c.peerId);
      if (missing.length > 0) {
        const names = await namesByIds(missing);
        for (const c of seen.values()) if (!c.peerName) c.peerName = names.get(c.peerId) ?? 'Joueur';
      }
      return [...seen.values()];
    },
  });
}
