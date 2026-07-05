import { create } from 'zustand';

/**
 * État transverse du chat : suivi des messages LUS (par canal, persisté) pour les
 * badges de non-lus, et notification toast des messages privés entrants.
 */
const LAST_READ_KEY = 'chat-last-read-v1';
/** Les messages antérieurs au chargement de l'app comptent comme lus (pas de backlog). */
const APP_LOAD_MS = Date.now();

function loadLastRead(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(LAST_READ_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
function saveLastRead(v: Record<string, number>) {
  try {
    localStorage.setItem(LAST_READ_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

/** Seuil « lu » d'un canal : dernier-lu, sinon l'heure de chargement de l'app. */
export function thresholdOf(lastRead: Record<string, number>, key: string): number {
  return lastRead[key] ?? APP_LOAD_MS;
}

export type ChatToast = { id: number; peerId: string; peerName: string; body: string };

type ChatStore = {
  lastRead: Record<string, number>;
  markRead: (key: string) => void;
  toast: ChatToast | null;
  pushToast: (t: Omit<ChatToast, 'id'>) => void;
  dismissToast: () => void;
  chatOpen: boolean;
  setChatOpen: (b: boolean) => void;
  activePeerId: string | null;
  setActivePeer: (id: string | null) => void;
};

let toastSeq = 1;

export const useChatStore = create<ChatStore>((set, get) => ({
  lastRead: loadLastRead(),
  markRead: (key) => {
    const next = { ...get().lastRead, [key]: Date.now() };
    saveLastRead(next);
    set({ lastRead: next });
  },
  toast: null,
  pushToast: (t) => set({ toast: { ...t, id: toastSeq++ } }),
  dismissToast: () => set({ toast: null }),
  chatOpen: false,
  setChatOpen: (b) => set({ chatOpen: b }),
  activePeerId: null,
  setActivePeer: (id) => set({ activePeerId: id }),
}));
