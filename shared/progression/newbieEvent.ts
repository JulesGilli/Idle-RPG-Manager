/**
 * Event du NOUVEAU JOUEUR (Arc 1).
 *
 * Un event PAR JOUEUR, ouvert au premier chargement post-déploiement pour tout
 * compte qui n'a pas encore fini l'Arc 1 (`player_arc.max_arc === 1`). Il dure
 * NEWBIE_EVENT_DURATION_DAYS jours. Une liste d'objectifs à réaliser DANS la
 * fenêtre : chacun donne sa récompense et fait monter une barre globale, dont
 * les paliers (25/50/75/100 %) débloquent des lots — le 100 % offre un héros S.
 *
 * PUR & testable : ce module ne connaît ni la DB ni l'horloge. L'edge function
 * `newbie-event` récolte les signaux bruts (zones/donjons/expés/pantin/tour/
 * guilde faits DANS la fenêtre) et les passe à `evaluateObjectives`. Le comptage
 * « pendant la fenêtre » (via les horodatages `cleared_at`/`claimed_at`/… et le
 * baseline pantin) est fait côté serveur — ici on ne juge que des signaux déjà
 * fenêtrés.
 *
 * Paramétré par ARC : la version « début d'Arc 2 » réutilisera ce moteur en
 * changeant les zones cibles + l'arc requis (pas encore branché ici).
 */

export const NEWBIE_EVENT_DURATION_DAYS = 7;

/** Types d'expédition (seeds stables — cf. migration 0024). */
export const NEWBIE_EXPEDITION_TYPES = [
  { id: 'exp_foret_fossile', name: 'Forêt Fossile' },
  { id: 'exp_ruines_englouties', name: 'Ruines Englouties' },
  { id: 'exp_mines_abyssales', name: 'Mines Abyssales' },
] as const;

/**
 * Ressource signature créditée par la récompense d'expédition (le matériau
 * commun de la loot_table de chaque type — cf. migration 0024). Un objectif
 * d'expédition crédite celle de SON type ; un palier global les répartit.
 */
export const NEWBIE_EXPEDITION_SIGNATURE_RESOURCE: Record<string, string> = {
  exp_foret_fossile: 'seve_primordiale',
  exp_ruines_englouties: 'poussiere_arcane',
  exp_mines_abyssales: 'minerai_stellaire',
};

/** Pantin : nombre de JOURS distincts requis dans la fenêtre. */
export const NEWBIE_PANTIN_DAYS = 5;
/** Tour : étage à atteindre sur CHAQUE poids (léger/moyen/lourd). */
export const NEWBIE_TOWER_FLOOR = 30;
/** Plafond de zone pour toute récompense d'équipement. */
export const MAX_ZONE = 10;

export type NewbieObjectiveKind = 'zone' | 'dungeon' | 'expedition' | 'pantin' | 'tower' | 'guild';

/**
 * Récompense (donnée d'affichage + gabarit de don, appliqué en tranche 3).
 * `zone` = zone fixe ; `zoneOffset` = zone la plus loin atteinte + offset (plafond MAX_ZONE).
 */
export type NewbieReward =
  | { type: 'gold'; amount: number }
  | { type: 'account_xp'; amount: number }
  | { type: 'expedition_resources'; qty: number }
  | { type: 'equipment_choice'; slots: ('weapon' | 'armor')[]; zone?: number; zoneOffset?: number }
  | { type: 'relic_choice'; zone: number }
  | { type: 'hero_s_choice' };

export type NewbieObjectiveDef = {
  id: string;
  kind: NewbieObjectiveKind;
  label: string;
  desc: string;
  /** zone kind : n° de zone dont le boss doit tomber. */
  zone?: number;
  /** dungeon kind : tier de donjon à réussir. */
  tier?: number;
  /** expedition kind : id du type d'expédition à réussir. */
  expeditionTypeId?: string;
  /** pantin kind : jours distincts requis (défaut NEWBIE_PANTIN_DAYS). */
  target?: number;
  /** Récompenses de CET objectif. */
  rewards: NewbieReward[];
};

/**
 * LISTE DES OBJECTIFS (Arc 1). 13 objectifs — 100 % ambitieux mais atteignable
 * par un nouveau joueur engagé en une semaine. Montants ajustables librement.
 */
export const NEWBIE_OBJECTIVES: NewbieObjectiveDef[] = [
  // — Zones : checkpoints 3 / 5 / 7, récompense = équipement (arme OU armure) de la zone au-dessus.
  { id: 'zone_3', kind: 'zone', zone: 3, label: 'Boss de la zone 3',
    desc: 'Bats le boss de la 3ᵉ zone de la carte.',
    rewards: [{ type: 'equipment_choice', slots: ['weapon', 'armor'], zone: 4 }] },
  { id: 'zone_5', kind: 'zone', zone: 5, label: 'Boss de la zone 5',
    desc: 'Bats le boss de la 5ᵉ zone de la carte.',
    rewards: [{ type: 'equipment_choice', slots: ['weapon', 'armor'], zone: 6 }] },
  { id: 'zone_7', kind: 'zone', zone: 7, label: 'Boss de la zone 7',
    desc: 'Bats le boss de la 7ᵉ zone de la carte.',
    rewards: [{ type: 'equipment_choice', slots: ['weapon', 'armor'], zone: 8 }] },

  // — Donjons : tiers 1 → 4, récompense = relique au choix, zone qui monte (3 → 6).
  { id: 'dungeon_1', kind: 'dungeon', tier: 1, label: 'Donjon — palier 1',
    desc: 'Réussis un donjon de palier 1.',
    rewards: [{ type: 'relic_choice', zone: 3 }] },
  { id: 'dungeon_2', kind: 'dungeon', tier: 2, label: 'Donjon — palier 2',
    desc: 'Réussis un donjon de palier 2.',
    rewards: [{ type: 'relic_choice', zone: 4 }] },
  { id: 'dungeon_3', kind: 'dungeon', tier: 3, label: 'Donjon — palier 3',
    desc: 'Réussis un donjon de palier 3.',
    rewards: [{ type: 'relic_choice', zone: 5 }] },
  { id: 'dungeon_4', kind: 'dungeon', tier: 4, label: 'Donjon — palier 4',
    desc: 'Réussis un donjon de palier 4.',
    rewards: [{ type: 'relic_choice', zone: 6 }] },

  // — Expéditions : une de chaque type, récompense = ressources d'expédition.
  ...NEWBIE_EXPEDITION_TYPES.map((t): NewbieObjectiveDef => ({
    id: `expedition_${t.id}`,
    kind: 'expedition',
    expeditionTypeId: t.id,
    label: `Expédition — ${t.name}`,
    desc: `Termine une expédition « ${t.name} ».`,
    rewards: [{ type: 'expedition_resources', qty: 30 }],
  })),

  // — Pantin : 5 jours distincts.
  { id: 'pantin_5days', kind: 'pantin', target: NEWBIE_PANTIN_DAYS, label: 'Pantin assidu',
    desc: `Frappe le pantin sur ${NEWBIE_PANTIN_DAYS} jours différents.`,
    rewards: [{ type: 'gold', amount: 500_000 }] },

  // — Tour : étage 30 sur les 3 poids, récompense = arme au choix 2 zones au-dessus.
  { id: 'tower_30', kind: 'tower', label: 'Grimpeur',
    desc: `Atteins l'étage ${NEWBIE_TOWER_FLOOR} sur les 3 tours (léger, moyen, lourd).`,
    rewards: [{ type: 'equipment_choice', slots: ['weapon'], zoneOffset: 2 }] },

  // — Guilde.
  { id: 'guild_join', kind: 'guild', label: 'Esprit de guilde',
    desc: 'Rejoins une guilde.',
    rewards: [{ type: 'gold', amount: 50_000 }, { type: 'account_xp', amount: 20_000 }] },
];

/** Palier de la barre globale : à `pct` % d'objectifs atteints, débloque `rewards`. */
export type NewbieMilestone = { pct: number; label: string; rewards: NewbieReward[] };

export const NEWBIE_MILESTONES: NewbieMilestone[] = [
  { pct: 25, label: 'Palier 25 %', rewards: [{ type: 'gold', amount: 100_000 }] },
  { pct: 50, label: 'Palier 50 %', rewards: [{ type: 'expedition_resources', qty: 60 }] },
  { pct: 75, label: 'Palier 75 %', rewards: [{ type: 'equipment_choice', slots: ['weapon', 'armor'], zoneOffset: 0 }] },
  { pct: 100, label: 'Palier 100 %', rewards: [{ type: 'hero_s_choice' }] },
];

/**
 * Signaux bruts, DÉJÀ fenêtrés côté serveur (ne contiennent que ce qui a été
 * fait pendant l'event). Le module ne refait aucun filtrage temporel.
 */
export type NewbieSignals = {
  /** N° de zones dont le boss est tombé dans la fenêtre (Arc 1). */
  bossZonesCleared: number[];
  /** Tiers de donjon réussis dans la fenêtre (Arc 1). */
  dungeonTiersCleared: number[];
  /** Ids de types d'expédition réclamés dans la fenêtre. */
  expeditionTypesClaimed: string[];
  /** Jours distincts de pantin depuis le début de l'event (days_done − baseline). */
  pantinDaysInWindow: number;
  /** Meilleur étage courant par poids de tour (Arc 1). */
  towerFloorsByWeight: { light: number; medium: number; heavy: number };
  /** Le joueur est-il actuellement dans une guilde ? */
  inGuild: boolean;
};

/** Progression d'un objectif : fait ? + avancement chiffré (pour l'affichage partiel). */
export type NewbieObjectiveProgress = {
  id: string;
  done: boolean;
  /** Avancement courant (ex. jours de pantin, étage min de tour) — pour la jauge. */
  current: number;
  /** Cible (ex. 5 jours, étage 30) — 1 pour les objectifs binaires. */
  target: number;
};

/** Évalue UN objectif contre les signaux. */
export function objectiveProgress(def: NewbieObjectiveDef, s: NewbieSignals): NewbieObjectiveProgress {
  switch (def.kind) {
    case 'zone': {
      const done = s.bossZonesCleared.includes(def.zone!);
      return { id: def.id, done, current: done ? 1 : 0, target: 1 };
    }
    case 'dungeon': {
      const done = s.dungeonTiersCleared.includes(def.tier!);
      return { id: def.id, done, current: done ? 1 : 0, target: 1 };
    }
    case 'expedition': {
      const done = s.expeditionTypesClaimed.includes(def.expeditionTypeId!);
      return { id: def.id, done, current: done ? 1 : 0, target: 1 };
    }
    case 'pantin': {
      const target = def.target ?? NEWBIE_PANTIN_DAYS;
      const current = Math.min(s.pantinDaysInWindow, target);
      return { id: def.id, done: s.pantinDaysInWindow >= target, current, target };
    }
    case 'tower': {
      const minFloor = Math.min(
        s.towerFloorsByWeight.light,
        s.towerFloorsByWeight.medium,
        s.towerFloorsByWeight.heavy,
      );
      return {
        id: def.id,
        done: minFloor >= NEWBIE_TOWER_FLOOR,
        current: Math.min(minFloor, NEWBIE_TOWER_FLOOR),
        target: NEWBIE_TOWER_FLOOR,
      };
    }
    case 'guild':
      return { id: def.id, done: s.inGuild, current: s.inGuild ? 1 : 0, target: 1 };
  }
}

/** Évalue TOUS les objectifs. */
export function evaluateObjectives(
  s: NewbieSignals,
  defs: NewbieObjectiveDef[] = NEWBIE_OBJECTIVES,
): NewbieObjectiveProgress[] {
  return defs.map((d) => objectiveProgress(d, s));
}

/** % d'objectifs atteints (0..100, entier). */
export function overallPct(progress: NewbieObjectiveProgress[]): number {
  if (progress.length === 0) return 0;
  const done = progress.filter((p) => p.done).length;
  return Math.round((done / progress.length) * 100);
}

/** Paliers atteints à ce %, dans l'ordre (ex. [25, 50]). */
export function milestonesReached(pct: number, milestones: NewbieMilestone[] = NEWBIE_MILESTONES): number[] {
  return milestones.filter((m) => pct >= m.pct).map((m) => m.pct);
}

/** L'event est-il encore actif ? (dates en ms epoch). */
export function eventActive(startsAtMs: number, endsAtMs: number, nowMs: number): boolean {
  return nowMs >= startsAtMs && nowMs < endsAtMs;
}

/**
 * Zone effective d'une récompense d'équipement/relique : `zone` fixe, sinon
 * `furthestZone + zoneOffset` (plafond MAX_ZONE). `null` si la récompense n'a
 * pas de notion de zone.
 */
export function resolveRewardZone(reward: NewbieReward, furthestZone: number): number | null {
  if (reward.type === 'relic_choice') return Math.min(MAX_ZONE, reward.zone);
  if (reward.type === 'equipment_choice') {
    const z = reward.zone != null ? reward.zone : Math.max(1, furthestZone) + (reward.zoneOffset ?? 0);
    return Math.min(MAX_ZONE, Math.max(1, z));
  }
  return null;
}

/** Type de choix requis par une récompense (null = don direct sans choix). */
export function rewardChoice(reward: NewbieReward): 'equipment' | 'relic' | 'hero' | null {
  if (reward.type === 'equipment_choice') return 'equipment';
  if (reward.type === 'relic_choice') return 'relic';
  if (reward.type === 'hero_s_choice') return 'hero';
  return null;
}

/** L'objectif de cet id (ou undefined). */
export function objectiveById(id: string): NewbieObjectiveDef | undefined {
  return NEWBIE_OBJECTIVES.find((o) => o.id === id);
}

/** Le palier à ce pct (ou undefined). */
export function milestoneByPct(pct: number): NewbieMilestone | undefined {
  return NEWBIE_MILESTONES.find((m) => m.pct === pct);
}
