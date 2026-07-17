import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import {
  activeEvent,
  DEFAULT_EVENT_CONFIG,
  type ActiveEvent,
  type EventConfig,
} from '@shared/progression/events.ts';

/**
 * Événement en rotation (week-end double XP/butin vs boss de semaine). Comme
 * `useRelease`, le SERVEUR est seul juge de l'heure : on récupère `server_now` +
 * la config via le RPC `event_info`, on cale l'horloge locale dessus, puis on
 * calcule l'événement actif avec le MÊME helper pur que le serveur. Impossible
 * de s'offrir le bonus en trichant l'horloge du PC.
 */
export type EventState = {
  loading: boolean;
  /** Événement actif recalculé à l'heure serveur (ou neutre pendant le chargement). */
  event: ActiveEvent;
};

export function useEvent(): EventState {
  const userId = useAuthStore((s) => s.user?.id);

  const query = useQuery({
    queryKey: ['event-info'],
    enabled: Boolean(userId),
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('event_info');
      if (error) throw error;
      const row = data?.[0];
      const serverNowMs = row?.server_now ? Date.parse(row.server_now) : Date.now();
      const config: EventConfig = {
        enabled: row?.enabled ?? DEFAULT_EVENT_CONFIG.enabled,
        weekendXpMult: Number(row?.weekend_xp_mult ?? DEFAULT_EVENT_CONFIG.weekendXpMult),
        weekendGoldMult: Number(row?.weekend_gold_mult ?? DEFAULT_EVENT_CONFIG.weekendGoldMult),
        weekendDropMult: Number(row?.weekend_drop_mult ?? DEFAULT_EVENT_CONFIG.weekendDropMult),
      };
      return { offsetMs: serverNowMs - Date.now(), config };
    },
  });

  // Décalage figé depuis la dernière synchro (0 tant qu'on n'a pas répondu).
  const offsetRef = useRef(0);
  if (query.data) offsetRef.current = query.data.offsetMs;

  const config = query.data?.config ?? DEFAULT_EVENT_CONFIG;
  const serverNow = Date.now() + offsetRef.current;
  const event = query.data
    ? activeEvent(serverNow, config)
    : activeEvent(serverNow, { ...DEFAULT_EVENT_CONFIG, enabled: false });

  return { loading: query.isLoading, event };
}
