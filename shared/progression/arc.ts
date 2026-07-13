/**
 * Système d'ARCS (New Game+ / régions), partagé front + Edge Functions.
 *
 * Un arc = la MÊME carte du monde au palier au-dessus : difficulté et tier de loot
 * plus élevés. Le roster / l'équipement / l'or / l'XP de compte sont PARTAGÉS ;
 * seuls la PROGRESSION DE CARTE, le TIER de loot et la DIFFICULTÉ changent par arc.
 * Les arcs sont des pistes PARALLÈLES switchables (pas un reset).
 *
 * INVARIANT CLÉ : **le tier de loot = le numéro d'arc**. En arc N, tout ce qui
 * drop/est forgé est estampillé `tier = N`. Pas de système de tier séparé.
 */

/** Arc le plus haut existant à ce jour (étendre en ajoutant sa config ci-dessous). */
export const MAX_ARC = 2;

/** Tier de loot d'un arc = le numéro d'arc (arc 1 → T1, arc 2 → T2, …). */
export function tierOfArc(arc: number): number {
  return clampArc(arc);
}

/** Borne un numéro d'arc dans [1, MAX_ARC]. */
export function clampArc(arc: number): number {
  return Math.max(1, Math.min(MAX_ARC, Math.floor(arc || 1)));
}

/**
 * Réglages de difficulté PAR ARC. L'arc 1 est la référence (tout à 1 / neutre).
 * Les arcs supérieurs sont VOLONTAIREMENT beaucoup plus durs : la difficulté vient
 * d'abord de la DENSITÉ DE MÉCANIQUES (plus d'ennemis à abilités, boss plus
 * menaçants) et de la FRICTION D'ÉCONOMIE (loot plus cher), le stat-scaling brut
 * n'étant qu'un soutien. Extensible : de nouvelles "choses" se branchent ici en data.
 */
export type ArcTuning = {
  arc: number;
  /** Nom de région (affichage). */
  region: string;
  /** Multiplicateurs de stats ennemies (mobs ET boss), en plus du scaling de base. */
  enemyHpMult: number;
  enemyAtkMult: number;
  /**
   * Multiplicateur des SEUILS DE PUISSANCE REQUISE (expéditions…). Aligné sur le
   * scaling ennemi : un arc plus dur exige des escouades proportionnellement plus fortes.
   */
  powerReqMult: number;
  /** Chance qu'un mob NORMAL porte une abilité offensive supplémentaire (0..1). */
  eliteAbilityChance: number;
  /**
   * Multiplicateur des STATS BRUTES de l'équipement forgé/dropé à ce tier
   * (atk/def/hp). VOLONTAIREMENT plus BAS que le scaling ennemi : le joueur est
   * un peu à la traîne au début de l'arc → il doit optimiser (niveaux, skills,
   * gemmes, reliques, sets) pour combler l'écart. ⚠️ pas trop bas non plus, sinon
   * l'arc devient infranchissable — l'écart `enemyHpMult − gearStatMult` doit
   * rester rattrapable par les AUTRES sources de puissance.
   */
  gearStatMult: number;
  /** Multiplicateur du COÛT de forge (friction d'économie : le tier sup coûte plus). */
  forgeCostMult: number;
  /** Teinte d'accent de l'UI pour cet arc (thème). */
  accent: string;
};

/**
 * Arc 1 = neutre (l'expérience actuelle). Arc 2 = « région rouge », nettement plus
 * exigeant. Les valeurs sont des KNOBS de premier jet, à re-tuner après test.
 */
export const ARC_TUNING: Record<number, ArcTuning> = {
  1: {
    arc: 1,
    region: 'Royaumes du Seuil',
    enemyHpMult: 1,
    enemyAtkMult: 1,
    powerReqMult: 1,
    eliteAbilityChance: 0,
    gearStatMult: 1,
    forgeCostMult: 1,
    accent: '#8b5cf6', // violet (thème de base)
  },
  2: {
    arc: 2,
    region: 'Terres du Désespoir',
    // Les arcs S'EMPILENT : l'arc 2 zone 1 doit déjà être PLUS DUR que l'arc 1
    // zone 10. Comme au sein d'un arc les PV grimpent d'un facteur ~×19 entre la
    // zone 1 et la zone 10, le multiplicateur d'arc doit DÉPASSER ce facteur pour
    // que la bande de l'arc 2 démarre au-dessus du plafond de l'arc 1 (pas de
    // chevauchement). Les nombres explosent d'un arc à l'autre : c'est normal pour
    // une échelle de tiers — le stuff T2 fait exploser ta puissance en parallèle.
    enemyHpMult: 22,
    enemyAtkMult: 26,
    // Ne sert QU'AUX expéditions : arc 2 = ×10 le seuil de puissance de l'arc 1.
    powerReqMult: 10,
    eliteAbilityChance: 0.35,
    // ~×14 = ~0.6 du scaling ennemi PV : le stuff T2 est très au-dessus du T1,
    // mais reste SOUS les ennemis → il faut optimiser le reste pour passer.
    gearStatMult: 14,
    forgeCostMult: 2.5,
    accent: '#e0484d', // rouge (thème arc 2)
  },
};

/** Réglages d'un arc (repli sur l'arc 1 si inconnu). */
export function arcTuning(arc: number): ArcTuning {
  return ARC_TUNING[clampArc(arc)] ?? ARC_TUNING[1]!;
}

/**
 * Multiplicateur de stats brutes de l'équipement à un TIER donné (= arc). La forge
 * et les drops multiplient les stats de base de l'objet par ce facteur. Tier 1 = ×1.
 */
export function tierGearMult(tier: number): number {
  return arcTuning(tier).gearStatMult;
}

/**
 * Applique le palier d'ARC aux stats d'un ennemi (PV/ATK ×arc). Helper PARTAGÉ par
 * toutes les activités (carte, donjon, tour, boss d'arc) pour un scaling cohérent.
 * DEF inchangée (comme le rééquilibrage carte, pour éviter les combats nuls).
 */
export function scaleEnemyStatsForArc(
  stats: { hp: number; atk: number },
  arc: number,
): { hp: number; atk: number } {
  const t = arcTuning(arc);
  return {
    hp: Math.max(1, Math.round(stats.hp * t.enemyHpMult)),
    atk: Math.max(1, Math.round(stats.atk * t.enemyAtkMult)),
  };
}
