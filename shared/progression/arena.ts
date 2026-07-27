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
/** Équipes d'arène limitées à 3 héros (plus petit qu'en PvE). */
export const ARENA_MAX_TEAM = 3;

/**
 * Peut-on défier `defenderRank` quand on est `challengerRank` ?
 *
 * Refonte PvP : TOUT LE MONDE PEUT DÉFIER TOUT LE MONDE — plus de fenêtre de
 * rangs, plus de cooldown. La seule limite est qu'on ne se défie pas soi-même
 * (deux joueurs distincts n'ont jamais le même rang, d'où la comparaison).
 * On ne grimpe qu'en battant MIEUX classé (cf. `arenaRanksAfterChallenge`) : sans
 * fenêtre, défier plus bas reste possible mais ne rapporte aucun rang.
 */
export function canChallenge(challengerRank: number, defenderRank: number): boolean {
  return challengerRank !== defenderRank;
}

/**
 * Rangs du challenger et du défenseur APRÈS un défi.
 *
 * On ne progresse qu'en battant un joueur MIEUX classé (rang inférieur) : dans
 * ce cas les deux ÉCHANGENT de place. Battre un moins bien classé — ou perdre —
 * ne change rien (« le 1er qui défie plus bas et gagne reste à sa place »). C'est
 * ce qui rend l'échelle saine : on ne peut monter qu'en affrontant plus fort,
 * jamais reculer en se faisant défier.
 */
export function arenaRanksAfterChallenge(
  challengerRank: number,
  defenderRank: number,
  win: boolean,
): { challenger: number; defender: number } {
  const climbs = win && defenderRank < challengerRank;
  return climbs
    ? { challenger: defenderRank, defender: challengerRank }
    : { challenger: challengerRank, defender: defenderRank };
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
/** Nombre de zones du jeu — la zone de référence ne peut pas la dépasser. */
export const MAX_ZONE = 10;

/**
 * Zone de RÉFÉRENCE du butin d'arène : celle du JOUEUR qui réclame, +1.
 *
 * Le butin s'indexait sur la zone du 1er du classement : un joueur de zone 4 se
 * voyait donc récompensé au niveau d'un top 10, matériau inutilisable pour lui.
 * Il s'indexe désormais sur la progression du réclamant — « toujours la zone
 * au-dessus de LA SIENNE » (un joueur zone 4 arc 2 reçoit du zone 5 arc 2). La
 * traduction dans l'arc du joueur est faite par l'appelant (`arcMaterialKey`).
 * Plafonné à la dernière zone : un joueur zone 10 ne peut pas viser au-delà.
 */
export function arenaRewardZone(playerZone: number): number {
  return Math.min(MAX_ZONE, Math.max(1, Math.floor(playerZone)) + 1);
}

/**
 * Multiplicateur des ressources d'arène. Le butin de rang était famélique face
 * au farm de zone (20 matériaux/semaine pour le 1er) : ×10 pour en refaire une
 * récompense qui pèse. Isolé ici, seul point à bouger pour le régler.
 */
export const ARENA_REWARD_QTY_MULT = 10;

/**
 * Récompense hebdomadaire selon le rang final et le nombre de participants.
 * Plus il y a de participants, plus la cagnotte est grosse ; mieux classé =
 * meilleure part (facteur 1 pour #1, décroissant jusqu'à 10 % en bas).
 *
 * `zoneResource` : matériau de la zone de RÉFÉRENCE (la zone du joueur +1, cf.
 * `arenaRewardZone`), déjà traduit dans l'arc du joueur par l'appelant. Tout le
 * top 10 reçoit CETTE ressource — « toujours la zone au-dessus » —, seule la
 * quantité varie avec le rang. (Auparavant les rangs 4-10 recevaient la zone du
 * dessous ; on voulait justement que chacun gagne le cran au-dessus de SA
 * progression, plus celle du leader.)
 */
export function arenaWeeklyReward(
  rank: number,
  participants: number,
  zoneResource: string,
): ArenaReward {
  if (rank < 1 || participants < 1) return { gold: 0, materials: [] };
  const factor = Math.max(0.1, 1 - (rank - 1) / participants);
  const gold = Math.round(participants * 200 * factor);
  const materials: { key: string; qty: number }[] = [];
  const qty = (base: number) => base * ARENA_REWARD_QTY_MULT;
  if (rank === 1) materials.push({ key: zoneResource, qty: qty(20) });
  else if (rank <= 10) materials.push({ key: zoneResource, qty: qty(10) });
  return { gold, materials };
}

/** Combats disputés requis dans la semaine pour toucher la récompense. */
export const ARENA_MIN_FIGHTS_FOR_REWARD = 1;

/**
 * A-t-on droit à la récompense de la semaine écoulée ? Il faut avoir COMBATTU :
 * sans cette règle, s'inscrire et ne jamais jouer suffisait à encaisser.
 */
export function arenaRewardEligible(wins: number, losses: number): boolean {
  return wins + losses >= ARENA_MIN_FIGHTS_FOR_REWARD;
}
