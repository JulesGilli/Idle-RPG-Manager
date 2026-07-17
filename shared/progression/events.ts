/**
 * Rotation d'événements — helper PUR (partagé front + Edge Functions).
 *
 * Deux événements en rotation, calés sur le CALENDRIER (fuseau Europe/Paris),
 * donc entièrement déterministes à partir de l'horloge — aucune table d'état,
 * aucun cron n'est nécessaire pour les activer/désactiver :
 *
 *   - Week-end (samedi + dimanche) : BONUS DE CARTE — double XP et double butin
 *     sur les combats de carte (déploiements). Multiplicateurs configurables via
 *     `app_config` (clés `event_weekend_xp_mult` / `event_weekend_drop_mult`).
 *   - Semaine (lundi → vendredi) : BOSS DE LA SEMAINE (immortel, un coup par
 *     joueur, paliers de dégâts collectifs + titre de classement). L'activité du
 *     boss se lit ici, mais son résolveur vit dans sa propre Edge Function.
 *
 * Comme `release.ts` : côté Deno, on passe `Date.now()` = HORLOGE SERVEUR, donc
 * un joueur ne peut pas s'offrir le bonus en trichant l'horloge de son PC. Côté
 * front, on cale l'horloge sur `server_now` (RPC `event_info`) avant d'appeler.
 */

/** Config de rotation lue dans `app_config` (défauts si clés absentes). */
export type EventConfig = {
  /** Coupe-circuit global : `false` désactive toute la rotation. */
  enabled: boolean;
  /** Multiplicateur d'XP de carte le week-end (2 = double). */
  weekendXpMult: number;
  /** Multiplicateur d'or de carte le week-end. */
  weekendGoldMult: number;
  /** Multiplicateur de butin (matériaux/gemmes) de carte le week-end. */
  weekendDropMult: number;
};

export const DEFAULT_EVENT_CONFIG: EventConfig = {
  enabled: true,
  weekendXpMult: 2,
  weekendGoldMult: 2,
  weekendDropMult: 2,
};

export type EventKind = 'weekend_bonus' | 'world_boss';

/** État de l'événement actif à un instant donné. */
export type ActiveEvent = {
  kind: EventKind;
  /** Vrai pendant le week-end (bonus de carte actif). */
  weekend: boolean;
  /** Multiplicateur d'XP de carte à appliquer (1 hors bonus). */
  xpMult: number;
  /** Multiplicateur d'or de carte à appliquer (1 hors bonus). */
  goldMult: number;
  /** Multiplicateur de butin de carte à appliquer (1 hors bonus). */
  dropMult: number;
  /** Le boss de semaine est-il actif ? (jours ouvrés, si `enabled`). */
  worldBossActive: boolean;
};

/**
 * Jour de la semaine (0 = dimanche … 6 = samedi) à l'instant `nowMs`, tel que
 * vu depuis Europe/Paris. `Intl` gère l'heure d'été/hiver — pas de calcul manuel.
 */
export function parisWeekday(nowMs: number): number {
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    weekday: 'short',
  }).format(new Date(nowMs));
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[short] ?? 0;
}

/** Est-on le week-end (samedi ou dimanche) à Paris à l'instant `nowMs` ? */
export function isWeekend(nowMs: number): boolean {
  const d = parisWeekday(nowMs);
  return d === 0 || d === 6;
}

/**
 * Événement actif à l'instant `nowMs` selon la config. Source de vérité unique,
 * appelée côté serveur (application des bonus) ET côté client (bandeau).
 */
export function activeEvent(nowMs: number, config: EventConfig = DEFAULT_EVENT_CONFIG): ActiveEvent {
  const neutral: ActiveEvent = {
    kind: 'world_boss',
    weekend: false,
    xpMult: 1,
    goldMult: 1,
    dropMult: 1,
    worldBossActive: false,
  };
  if (!config.enabled) return neutral;

  if (isWeekend(nowMs)) {
    return {
      kind: 'weekend_bonus',
      weekend: true,
      xpMult: Math.max(1, config.weekendXpMult),
      goldMult: Math.max(1, config.weekendGoldMult),
      dropMult: Math.max(1, config.weekendDropMult),
      worldBossActive: false,
    };
  }
  // Jours ouvrés : boss de la semaine, pas de bonus de carte.
  return { ...neutral, worldBossActive: true };
}

/**
 * Parse la config d'événement depuis les valeurs brutes d'`app_config`
 * (texte). Toute clé absente/illisible retombe sur le défaut — jamais de crash.
 */
export function parseEventConfig(raw: Record<string, string | null | undefined>): EventConfig {
  const num = (v: string | null | undefined, def: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : def;
  };
  return {
    enabled: (raw.event_enabled ?? 'true') !== 'false',
    weekendXpMult: num(raw.event_weekend_xp_mult, DEFAULT_EVENT_CONFIG.weekendXpMult),
    weekendGoldMult: num(raw.event_weekend_gold_mult, DEFAULT_EVENT_CONFIG.weekendGoldMult),
    weekendDropMult: num(raw.event_weekend_drop_mult, DEFAULT_EVENT_CONFIG.weekendDropMult),
  };
}
