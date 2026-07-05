import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useMyGuild } from '@/features/guild/useGuild';
import { useChatStore } from '@/store/chatStore';
import { UiIcon } from '@/components/synty/GameIcons';
import {
  useChatMessages,
  useChatRealtime,
  useChatUnread,
  useSendChat,
  useDmConversations,
  type ChatView,
} from './useChat';

type Tab = 'general' | 'guild' | 'dm';

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Petite pastille de compteur non-lu. */
function Badge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-ember)] px-1 text-[9px] font-bold text-white">
      {n > 9 ? '9+' : n}
    </span>
  );
}

export function ChatWidget() {
  const userId = useAuthStore((s) => s.user?.id);
  const { data: mine } = useMyGuild();
  const guildId = mine?.guild.id ?? null;

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('general');
  const [peer, setPeer] = useState<{ id: string; name: string } | null>(null);

  useChatRealtime();
  const { data: unread } = useChatUnread(guildId);
  const markRead = useChatStore((s) => s.markRead);
  const setChatOpen = useChatStore((s) => s.setChatOpen);
  const setActivePeer = useChatStore((s) => s.setActivePeer);
  const toast = useChatStore((s) => s.toast);
  const dismissToast = useChatStore((s) => s.dismissToast);

  const u = unread ?? { general: 0, guild: 0, dm: 0 };
  const total = u.general + u.guild + u.dm;

  // Synchronise l'état d'ouverture / la conversation active vers le store (pour le temps réel).
  useEffect(() => setChatOpen(open), [open, setChatOpen]);
  useEffect(
    () => setActivePeer(open && tab === 'dm' ? (peer?.id ?? null) : null),
    [open, tab, peer, setActivePeer],
  );

  // Canal actuellement regardé → marqué comme lu (aussi quand un message y arrive).
  const activeKey = open
    ? tab === 'general'
      ? 'general'
      : tab === 'guild' && guildId
        ? `guild:${guildId}`
        : tab === 'dm'
          ? 'dm'
          : null
    : null;
  useEffect(() => {
    if (activeKey) markRead(activeKey);
  }, [activeKey, markRead, u.general, u.guild, u.dm]);

  const view: ChatView | null = useMemo(() => {
    if (tab === 'general') return { kind: 'general' };
    if (tab === 'guild' && guildId) return { kind: 'guild', guildId };
    if (tab === 'dm' && peer) return { kind: 'dm', peerId: peer.id };
    return null;
  }, [tab, guildId, peer]);

  function openDm(id: string, name: string) {
    if (id === userId) return;
    setPeer({ id, name });
    setTab('dm');
    setOpen(true);
  }

  if (!userId) return null;

  return (
    <>
      {toast && <DmToast toast={toast} onOpen={openDm} onDismiss={dismissToast} />}

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-3 z-40 flex items-center gap-2 rounded-full border border-[var(--color-edge)] bg-[var(--color-panel)] px-4 py-2.5 text-sm font-semibold text-[var(--color-ink)] shadow-lg transition hover:border-[var(--color-arcane)] sm:bottom-4 sm:right-4"
          title="Ouvrir le chat"
        >
          <UiIcon name="guild" size={16} color="var(--color-gold-soft)" /> Chat
          <Badge n={total} />
        </button>
      ) : (
        <div className="fixed bottom-20 right-3 z-40 flex h-[26rem] w-[min(92vw,20rem)] flex-col overflow-hidden rounded-xl border border-[var(--color-edge)] bg-[var(--color-panel)] shadow-2xl sm:bottom-4 sm:right-4">
          <div className="flex items-center justify-between border-b border-[var(--color-edge)] px-2 py-1.5">
            <div className="flex gap-1">
              <TabBtn active={tab === 'general'} onClick={() => setTab('general')} label="Général" badge={u.general} />
              {guildId && (
                <TabBtn active={tab === 'guild'} onClick={() => setTab('guild')} label="Guilde" badge={u.guild} />
              )}
              <TabBtn active={tab === 'dm'} onClick={() => setTab('dm')} label="Privé" badge={u.dm} />
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded px-1.5 text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
              title="Réduire"
            >
              ▾
            </button>
          </div>

          {tab === 'dm' && !peer ? (
            <ConversationList onPick={(c) => setPeer({ id: c.peerId, name: c.peerName })} />
          ) : (
            <>
              {tab === 'dm' && peer && (
                <div className="flex items-center gap-2 border-b border-[var(--color-edge)] px-2 py-1 text-xs">
                  <button
                    onClick={() => setPeer(null)}
                    className="text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                  >
                    ← Conversations
                  </button>
                  <span className="font-semibold text-[var(--color-ink)]">{peer.name}</span>
                </div>
              )}
              <MessageList view={view} userId={userId} onNameClick={openDm} />
              <ChatInput view={view} placeholderTab={tab} />
            </>
          )}
        </div>
      )}
    </>
  );
}

function TabBtn({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center rounded-md px-2.5 py-1 text-xs font-semibold transition ${
        active
          ? 'bg-[var(--color-arcane)]/20 text-[var(--color-ink)]'
          : 'text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-ink)]'
      }`}
    >
      {label}
      {!active && <Badge n={badge} />}
    </button>
  );
}

function MessageList({
  view,
  userId,
  onNameClick,
}: {
  view: ChatView | null;
  userId: string;
  onNameClick: (id: string, name: string) => void;
}) {
  const { data: messages, isLoading } = useChatMessages(view);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2.5 py-2">
      {isLoading && <p className="text-center text-xs text-[var(--color-muted)]">Chargement…</p>}
      {messages && messages.length === 0 && (
        <p className="mt-6 text-center text-xs text-[var(--color-muted)]/70">
          Pas encore de message. Lance la discussion !
        </p>
      )}
      {(messages ?? []).map((m) => {
        const mineMsg = m.sender_id === userId;
        return (
          <div key={m.id} className={`flex flex-col ${mineMsg ? 'items-end' : 'items-start'}`}>
            {!mineMsg && (
              <button
                onClick={() => onNameClick(m.sender_id, m.sender_name)}
                className="px-1 text-[10px] font-semibold text-[var(--color-arcane)] hover:underline"
                title="Envoyer un message privé"
              >
                {m.sender_name}
              </button>
            )}
            <div
              className={`max-w-[85%] rounded-lg px-2.5 py-1 text-[13px] ${
                mineMsg
                  ? 'bg-[var(--color-arcane)]/25 text-[var(--color-ink)]'
                  : 'bg-white/[0.06] text-[var(--color-ink)]'
              }`}
            >
              {m.body}
            </div>
            <span className="px-1 text-[9px] text-[var(--color-muted)]/60">{fmtTime(m.created_at)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ConversationList({ onPick }: { onPick: (c: { peerId: string; peerName: string }) => void }) {
  const { data: convos, isLoading } = useDmConversations();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {isLoading && <p className="text-center text-xs text-[var(--color-muted)]">Chargement…</p>}
      {convos && convos.length === 0 && (
        <p className="mt-6 px-3 text-center text-xs text-[var(--color-muted)]/70">
          Aucune conversation. Clique le nom d'un joueur dans le chat pour lui écrire.
        </p>
      )}
      {(convos ?? []).map((c) => (
        <button
          key={c.peerId}
          onClick={() => onPick(c)}
          className="mb-1 flex w-full flex-col rounded-lg px-3 py-2 text-left transition hover:bg-white/5"
        >
          <span className="text-sm font-semibold text-[var(--color-ink)]">{c.peerName}</span>
          <span className="truncate text-xs text-[var(--color-muted)]">{c.lastBody}</span>
        </button>
      ))}
    </div>
  );
}

function ChatInput({ view, placeholderTab }: { view: ChatView | null; placeholderTab: Tab }) {
  const send = useSendChat();
  const [text, setText] = useState('');

  const placeholder =
    placeholderTab === 'general'
      ? 'Message général…'
      : placeholderTab === 'guild'
        ? 'Message de guilde…'
        : 'Message privé…';

  function submit() {
    const body = text.trim();
    if (!body || !view) return;
    send.mutate({ view, body });
    setText('');
  }

  return (
    <div className="flex items-center gap-1.5 border-t border-[var(--color-edge)] p-1.5">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        disabled={!view}
        maxLength={500}
        placeholder={view ? placeholder : 'Choisis une conversation'}
        className="min-w-0 flex-1 rounded-lg border border-[var(--color-edge)] bg-[var(--color-panel-2)] px-3 py-1.5 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-muted)]/60 disabled:opacity-50"
      />
      <button
        onClick={submit}
        disabled={!view || !text.trim() || send.isPending}
        className="btn btn-primary shrink-0 px-3 py-1.5 text-xs disabled:opacity-40"
      >
        Envoyer
      </button>
    </div>
  );
}

function DmToast({
  toast,
  onOpen,
  onDismiss,
}: {
  toast: { id: number; peerId: string; peerName: string; body: string };
  onOpen: (id: string, name: string) => void;
  onDismiss: () => void;
}) {
  // Disparaît tout seul après quelques secondes.
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  return (
    <button
      onClick={() => {
        onOpen(toast.peerId, toast.peerName);
        onDismiss();
      }}
      className="anim-pop fixed bottom-36 right-3 z-50 flex w-[min(80vw,17rem)] items-start gap-2 rounded-xl border border-[var(--color-arcane)]/50 bg-[var(--color-panel)] p-3 text-left shadow-2xl sm:bottom-20 sm:right-4"
      title="Ouvrir la conversation"
    >
      <UiIcon name="guild" size={16} color="var(--color-arcane)" />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-[var(--color-ink)]">
          Message privé de {toast.peerName}
        </span>
        <span className="block truncate text-xs text-[var(--color-muted)]">{toast.body}</span>
      </span>
    </button>
  );
}
