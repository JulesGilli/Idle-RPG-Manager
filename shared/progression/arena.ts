/**
 * Arène PvP ASYNCHRONE : chaque joueur dépose une équipe de défense (figée en
 * snapshot). Pour grimper, on DÉFIE un joueur mieux classé (dans une fenêtre de
 * rangs) ; si on gagne, on ÉCHANGE de place avec lui. Le combat est simulé côté
 * serveur (mêmes règles PvE, /shared/combat) — aucune interaction temps réel.
 *
 * Récompense HEBDOMADAIRE : réclamable une fois par semaine ISO, calculée à partir
 * de ton rang et du NOMBRE DE JOUEURS ayant participé cette semaine.
 *
 * Pur & testable. Aucune I/O.
 */

export const ARENA_MIN_TEAM = 1;
export const ARENA_MAX_TEAM = 5;

/** On ne peut défier qu'un joueur classé au-dessus, dans cette fenêtre de rangs. */
export const ARENA_CHALLENGE_RANGE = 5;

/** Repos entre deux défis (anti-spam), en secondes. */
export const ARENA_CHALLENGE_COOLDOWN_SECONDS = 30 * 60;

/** Peut-on défier `defenderRank` quand on est `challengerRank` ? (au-dessus + à portée) */
export function canChallenge(challengerRank: number, defenderRank: number): boolean {
  return defenderRank < challengerRank && challengerRank - defenderRank <= ARENA_CHALLENGE_RANGE;
}

/** Secondes restantes avant de pouvoir relancer un défi. */
export function arenaChallengeCooldownRemaining(lastAtMs: number | null, nowMs: number): number {
  if (lastAtMs == null) return 0;
  const elapsed = (nowMs - lastAtMs) / 1000;
  return Math.max(0, Math.ceil(ARENA_CHALLENGE_COOLDOWN_SECONDS - elapsed));
}

/** Clé de semaine ISO 8601 'YYYY-Www' à partir d'une date 'YYYY-MM-DD'. */
export function isoWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7; // 1 (lun) .. 7 (dim)
  date.setUTCDate(date.getUTCDate() + 4 - day); // jeudi de la semaine ISO
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export type ArenaReward = { gold: number; materials: { key: string; qty: number }[] };

/**
 * Récompense hebdomadaire selon le rang final et le nombre de participants.
 * Plus il y a de participants, plus la cagnotte est grosse ; mieux classé =
 * meilleure part (facteur 1 pour #1, décroissant jusqu'à 10 % en bas).
 */
export function arenaWeeklyReward(rank: number, participants: number): ArenaReward {
  if (rank < 1 || participants < 1) return { gold: 0, materials: [] };
  const factor = Math.max(0.1, 1 - (rank - 1) / participants);
  const gold = Math.round(participants * 200 * factor);
  const materials: { key: string; qty: number }[] = [];
  if (rank === 1) materials.push({ key: 'poussiere_etoile', qty: 20 });
  else if (rank <= 3) materials.push({ key: 'poussiere_etoile', qty: 10 });
  else if (rank <= 10) materials.push({ key: 'ombre_pure', qty: 10 });
  return { gold, materials };
}
