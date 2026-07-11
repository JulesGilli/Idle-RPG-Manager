import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store/authStore';
import { isAdmin } from '@shared/progression/admin';

/**
 * Sortie programmée (V1.x). Le serveur est seul juge de l'heure : on récupère
 * `release_at` + `server_now` via le RPC `release_info`, on en déduit un décalage
 * horloge-serveur/horloge-client, puis on fait tourner un compte à rebours LOCAL
 * calé sur l'heure serveur. Le flag `released` bascule donc à l'heure serveur, pas
 * à celle du PC (impossible de débloquer en avance en trichant son horloge).
 *
 * `releaseAt === null` (aucune sortie programmée) → `released = true` : rien ne
 * verrouille, aucun bandeau.
 */
export type ReleaseState = {
  loading: boolean;
  version: string | null;
  title: string | null;
  /** Instant de bascule (ms epoch) ou null si aucune sortie programmée. */
  releaseAtMs: number | null;
  /** L'utilisateur a-t-il ACCÈS au contenu ? (heure atteinte OU admin bypass.) */
  released: boolean;
  /** Sortie encore À VENIR (heure serveur, sans bypass) — pilote le bandeau. */
  pending: boolean;
  /** Millisecondes restantes avant la sortie (0 si déjà sortie / rien de programmé). */
  remainingMs: number;
};

export function useRelease(): ReleaseState {
  const userId = useAuthStore((s) => s.user?.id);

  const query = useQuery({
    queryKey: ['release-info'],
    enabled: Boolean(userId),
    // Re-synchronise l'horloge serveur périodiquement (corrige toute dérive).
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('release_info');
      if (error) throw error;
      const row = data?.[0];
      const releaseAtMs = row?.release_at ? Date.parse(row.release_at) : null;
      const serverNowMs = row?.server_now ? Date.parse(row.server_now) : Date.now();
      return {
        releaseAtMs: Number.isNaN(releaseAtMs as number) ? null : releaseAtMs,
        // Décalage à appliquer à l'horloge locale pour obtenir l'heure serveur.
        offsetMs: serverNowMs - Date.now(),
        version: row?.version ?? null,
        title: row?.title ?? null,
      };
    },
  });

  // Décalage figé depuis la dernière synchro (0 tant qu'on n'a pas répondu).
  const offsetRef = useRef(0);
  if (query.data) offsetRef.current = query.data.offsetMs;

  // Tick 1 s pour animer le compte à rebours — uniquement AVANT la sortie.
  const [, setTick] = useState(0);
  const releaseAtMs = query.data?.releaseAtMs ?? null;
  const serverNow = Date.now() + offsetRef.current;
  const remainingMs = releaseAtMs != null ? Math.max(0, releaseAtMs - serverNow) : 0;
  // Une sortie est TOUJOURS en attente d'annonce tant que l'heure n'est pas passée
  // — indépendamment du bypass admin. C'est ce qui pilote le BANDEAU (visible par
  // tout le monde, admin compris).
  const pending = releaseAtMs != null && remainingMs > 0;
  // L'admin ACCÈDE aux nouveautés en avance (bypass) : ne pilote QUE les verrous.
  const released = isAdmin(userId) || !pending;

  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [pending]);

  return {
    loading: query.isLoading,
    version: query.data?.version ?? null,
    title: query.data?.title ?? null,
    releaseAtMs,
    released,
    /** Sortie programmée encore à venir (heure serveur) — pilote le bandeau. */
    pending,
    remainingMs,
  };
}

/** Formate une durée (ms) en « 1 j 21 h 34 min 12 s » (compact, sans zéros inutiles). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d} j`);
  if (h > 0 || d > 0) parts.push(`${h} h`);
  if (m > 0 || h > 0 || d > 0) parts.push(`${m} min`);
  parts.push(`${s} s`);
  return parts.join(' ');
}
