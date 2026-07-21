/**
 * MATÉRIAUX D'EVENT — la monnaie de la Forge Sacrée (qualité Divine, Arc 2).
 *
 * Chaque activité d'event a SA ressource dédiée, distribuée au CLASSEMENT hebdo
 * (top 10, quantité dégressive). Ces matériaux ne servent qu'en Arc 2 (Forge
 * Sacrée) mais se gagnent dès l'Arc 1 : ils s'accumulent en attendant. D'où un
 * tier fixe (Arc 2), et non le tier de l'arc courant du joueur.
 *
 * Ce fichier est le SOCLE : la source de vérité des clés, libellés et du barème.
 * Les fonctions d'event (world-boss, etc.) et la future Forge Sacrée y puisent,
 * pour qu'ajouter/rééquilibrer une source ne se fasse qu'ici.
 *
 * Pur et partagé front + Edge Function.
 */

/**
 * Emplacement d'objet Divin. La Forge Sacrée ne fait QUE arme et armure : les
 * slots bijou et relique sont couverts par les SETS d'Arc 2, pas par le Divin.
 */
export type DivineSlot = 'weapon' | 'armor';

/** Source d'event d'un matériau. */
export type EventSource = 'world_boss' | 'gauntlet' | 'village_defense' | 'weekend';

export type EventMaterial = {
  /** Clé `player_resources.resource`. */
  key: string;
  /** Libellé FR affiché. */
  label: string;
  /** Activité qui le distribue. */
  source: EventSource;
  /**
   * Objet Divin que ce matériau permet de forger — ou absent si le matériau
   * n'alimente pas (encore) la Forge Sacrée. Seuls l'arme (Éclat sacré) et
   * l'armure (Poussière bénie) en ont un pour l'instant.
   */
  divineSlot?: DivineSlot;
};

/**
 * Les matériaux d'event, indexés par source. `gemme_ancienne` et non
 * `gemme_brute` : cette dernière est déjà une ressource d'expédition (Arc 1),
 * les confondre polluerait les deux piles.
 *
 * Mapping vers la Forge Sacrée (décidé le 21 juil.) : l'Éclat sacré (World Boss,
 * combat = offense) forge l'ARME divine ; la Poussière bénie (week-end) forge
 * l'ARMURE divine. La Gemme ancienne (Gauntlet) et le Fragment de guerre
 * (Défense du village) existent comme matériaux mais n'alimentent pas encore le
 * Divin — usage réservé aux sets d'Arc 2, à définir.
 */
export const EVENT_MATERIALS: Record<EventSource, EventMaterial> = {
  world_boss: { key: 'eclat_sacre', label: 'Éclat sacré', source: 'world_boss', divineSlot: 'weapon' },
  weekend: {
    key: 'poussiere_benie',
    label: 'Poussière bénie',
    source: 'weekend',
    divineSlot: 'armor',
  },
  gauntlet: { key: 'gemme_ancienne', label: 'Gemme brute ancienne', source: 'gauntlet' },
  village_defense: {
    key: 'fragment_guerre',
    label: 'Fragment de guerre',
    source: 'village_defense',
  },
};

/** Matériau d'event qui forge le slot Divin donné (arme ou armure). */
export function divineMaterialFor(slot: DivineSlot): EventMaterial {
  const m = Object.values(EVENT_MATERIALS).find((x) => x.divineSlot === slot);
  if (!m) throw new Error(`Aucun matériau d'event pour le slot divin ${slot}`);
  return m;
}

/** Toutes les clés de matériaux d'event (pour l'affichage, les filtres, etc.). */
export const EVENT_MATERIAL_KEYS = Object.values(EVENT_MATERIALS).map((m) => m.key);

/**
 * Tier de stockage des matériaux d'event = Arc 2, quel que soit l'arc du joueur.
 * Monnaie d'Arc 2 par nature (cf. en-tête). `player_resources.tier`.
 */
export const EVENT_MATERIAL_TIER = 2;

/**
 * Quantité de matériau distribuée au joueur classé `rank` (1-based) à la clôture
 * hebdomadaire. Dégressif sur le top 10, rien au-delà.
 *
 * Barème calibré sur la règle du roadmap : « le top 5 doit pouvoir crafter au
 * moins 1 objet Divin par semaine ». Le coût d'un objet Divin (Forge Sacrée, à
 * venir) sera donc calé sur la part du 5e (3). Volontairement centralisé et
 * commenté pour se rééquilibrer d'une ligne.
 */
const RANK_QTY: readonly number[] = [0, 8, 6, 5, 4, 3, 2, 2, 1, 1, 1]; // index = rank

export function eventRankMaterialQty(rank: number): number {
  if (!Number.isInteger(rank) || rank < 1 || rank >= RANK_QTY.length) return 0;
  return RANK_QTY[rank]!;
}
