/**
 * LE PANTHÉON (Arc 2) — PvP par ÉQUIPES MULTIPLES.
 *
 * Chaque joueur aligne CINQ équipes de TROIS héros, sans qu'un même héros
 * apparaisse dans deux équipes (15 héros distincts au total). Lors d'un défi,
 * les cinq équipes s'affrontent une par une — équipe 1 contre équipe 1, etc. —
 * et la MAJORITÉ des manches (3 sur 5) emporte le duel.
 *
 * PUR & testable : ni DB ni combat ici. L'edge function `pantheon` construit les
 * snapshots, joue les cinq combats via /shared/combat, et applique ces règles.
 * Le classement suit la même logique que l'arène refondue (on ne grimpe qu'en
 * battant mieux classé) — cf. `arenaRanksAfterChallenge`, réutilisé côté serveur.
 */

/** Nombre d'équipes alignées par joueur. */
export const PANTHEON_TEAMS = 5;
/** Héros par équipe. */
export const PANTHEON_TEAM_SIZE = 3;
/** Total de héros DISTINCTS requis (5 × 3). */
export const PANTHEON_ROSTER = PANTHEON_TEAMS * PANTHEON_TEAM_SIZE;

/** Arc où le Panthéon se débloque. */
export const PANTHEON_MIN_ARC = 2;

export type PantheonValidation = { ok: true } | { ok: false; reason: string };

/**
 * Valide la STRUCTURE d'une composition de Panthéon : exactement 5 équipes de 3,
 * et 15 héros tous distincts (aucun héros dans deux équipes, ni deux fois dans la
 * même). Ne vérifie ni la possession ni les classes — c'est le rôle du serveur,
 * qui a les données des héros.
 */
export function validatePantheonTeams(teams: (string[] | null | undefined)[]): PantheonValidation {
  if (!Array.isArray(teams) || teams.length !== PANTHEON_TEAMS) {
    return { ok: false, reason: `Il faut exactement ${PANTHEON_TEAMS} équipes.` };
  }
  const seen = new Set<string>();
  for (let i = 0; i < teams.length; i++) {
    const team = teams[i];
    if (!Array.isArray(team) || team.length !== PANTHEON_TEAM_SIZE) {
      return { ok: false, reason: `Chaque équipe doit compter ${PANTHEON_TEAM_SIZE} héros (équipe ${i + 1}).` };
    }
    for (const id of team) {
      if (typeof id !== 'string' || id.length === 0) {
        return { ok: false, reason: `Héros invalide dans l'équipe ${i + 1}.` };
      }
      if (seen.has(id)) {
        return { ok: false, reason: 'Un même héros ne peut pas servir dans deux équipes.' };
      }
      seen.add(id);
    }
  }
  return { ok: true };
}

/** Tous les héros d'une compo, à plat (15 ids) — pour charger/valider en bloc. */
export function pantheonAllHeroes(teams: string[][]): string[] {
  return teams.flat();
}

/**
 * L'attaquant remporte-t-il la SÉRIE ? Majorité stricte des manches (3 sur 5).
 * `matchWins[i]` = l'attaquant a gagné la i-e manche. Le nombre de manches est
 * déduit de la longueur, mais reste PANTHEON_TEAMS en pratique.
 */
export function pantheonSeriesWin(matchWins: boolean[]): boolean {
  const won = matchWins.filter(Boolean).length;
  return won * 2 > matchWins.length;
}
