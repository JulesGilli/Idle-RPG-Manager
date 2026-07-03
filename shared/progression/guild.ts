/**
 * Logique PURE de guilde (rôles, progression, raids). Source de vérité partagée
 * front + Edge Functions. La SIMULATION d'un raid réutilise `simulateDungeonRun`
 * (un raid = un contenu de type donjon, en plus dur) — aucun moteur parallèle.
 */

export type GuildRole = 'founder' | 'officer' | 'member';

export const ROLE_RANK: Record<GuildRole, number> = { founder: 3, officer: 2, member: 1 };

/** Taille par défaut d'une guilde et bornes de raid. */
export const DEFAULT_MAX_MEMBERS = 20;
export const MAX_RAID_HEROES = 20;
/** Un raid par guilde toutes les 20 h. */
export const RAID_COOLDOWN_SECONDS = 20 * 3600;
/** Un lobby ouvert expire au bout d'1 h s'il n'est pas résolu. */
export const LOBBY_TTL_SECONDS = 3600;

/* --------------------------------------------------------------- RÔLES ---- */

export function canManageMembers(role: GuildRole): boolean {
  return role === 'founder' || role === 'officer';
}

/** Peut lancer/résoudre un raid : fondateur ou officier. */
export function canStartRaid(role: GuildRole): boolean {
  return role === 'founder' || role === 'officer';
}

/** Seul le fondateur change les rôles (promouvoir/rétrograder) ou dissout. */
export function canSetRole(actorRole: GuildRole): boolean {
  return actorRole === 'founder';
}
export function canDisband(role: GuildRole): boolean {
  return role === 'founder';
}

/**
 * Peut exclure `target` : il faut être d'un rang STRICTEMENT supérieur et ne pas
 * être un simple membre. Le fondateur (rang max) ne peut donc jamais être exclu.
 */
export function canKick(actorRole: GuildRole, targetRole: GuildRole): boolean {
  return actorRole !== 'member' && ROLE_RANK[actorRole] > ROLE_RANK[targetRole];
}

/* --------------------------------------------------------- PROGRESSION ---- */

/**
 * Niveau de guilde selon l'XP cumulée. Coût croissant : passer au niveau L
 * coûte 500·L d'XP (500 pour 1→2, 1000 pour 2→3, …).
 */
export function guildLevel(xp: number): number {
  let level = 1;
  let threshold = 0;
  while (true) {
    threshold += 500 * level;
    if (xp < threshold) return level;
    level += 1;
    if (level > 1000) return level; // garde-fou
  }
}

/** Détail de progression vers le niveau suivant (pour l'UI). */
export function guildLevelProgress(xp: number): {
  level: number;
  intoLevel: number;
  neededForNext: number;
} {
  const level = guildLevel(xp);
  let base = 0;
  for (let l = 1; l < level; l++) base += 500 * l;
  return { level, intoLevel: xp - base, neededForNext: 500 * level };
}

/* --------------------------------------------------------------- RAID ----- */

/** Secondes restantes avant de pouvoir relancer un raid de guilde. */
export function raidCooldownRemaining(lastRaidAtMs: number | null, nowMs: number): number {
  if (lastRaidAtMs == null) return 0;
  const elapsed = (nowMs - lastRaidAtMs) / 1000;
  return Math.max(0, Math.ceil(RAID_COOLDOWN_SECONDS - elapsed));
}

/** Points de contribution gagnés par un membre selon les héros engagés + issue. */
export function guildContributionPoints(heroCount: number, success: boolean): number {
  return Math.max(0, Math.floor(heroCount)) * (success ? 10 : 3);
}

/** XP gagnée par la GUILDE pour un raid (récompense la progression + le clear). */
export function guildXpForRaid(success: boolean, reachedIndex: number, totalWaves: number): number {
  const progress = totalWaves > 0 ? Math.min(1, (reachedIndex + 1) / totalWaves) : 0;
  const base = Math.round(200 * progress);
  return success ? base + 300 : base;
}
