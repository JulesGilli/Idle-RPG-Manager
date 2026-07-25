/**
 * OÙ FARMER CHAQUE RESSOURCE — dictionnaire d'affichage (front uniquement).
 *
 * Sert les infobulles de `ResourceIcon` (hover, partout dans le jeu) et la fiche
 * au tap de l'onglet Matériaux de l'inventaire (mobile). Une seule source de
 * vérité pour ce texte : ne JAMAIS réécrire ces phrases dans un écran.
 *
 * Les jumeaux d'Arc 2 sont dérivés automatiquement de `ARC2_TWINS` : mêmes
 * activités, rejouées dans l'arc 2 — écrire les deux à la main les ferait
 * diverger en silence.
 */
import { ARC2_TWINS } from '@shared/progression/arcMaterials';
import { resourceMeta } from '@/hooks/useResources';

/** Farm / composant de boss / gemme de chaque zone (miroir de la Carte et de la Tour). */
const ZONE_RES: { zone: number; farm: string; boss: string; gem: string }[] = [
  { zone: 1, farm: 'ecorce', boss: 'coeur_sylve', gem: 'gemme_seve' },
  { zone: 2, farm: 'cristal', boss: 'givre_pur', gem: 'gemme_glace' },
  { zone: 3, farm: 'sable_noir', boss: 'oeil_sphinx', gem: 'gemme_solaire' },
  { zone: 4, farm: 'spore', boss: 'coeur_hydre', gem: 'gemme_venin' },
  { zone: 5, farm: 'obsidienne', boss: 'braise_eternelle', gem: 'gemme_braise' },
  { zone: 6, farm: 'rune', boss: 'fragment_titan', gem: 'gemme_runique' },
  { zone: 7, farm: 'nacre_noire', boss: 'encre_kraken', gem: 'gemme_abyssale' },
  { zone: 8, farm: 'plume_orage', boss: 'foudre_condensee', gem: 'gemme_orage' },
  { zone: 9, farm: 'ombre_pure', boss: 'coeur_ombre', gem: 'gemme_ombre' },
  { zone: 10, farm: 'poussiere_etoile', boss: 'essence_astrale', gem: 'gemme_astrale' },
];

const SOURCES: Record<string, string> = (() => {
  const map: Record<string, string> = {};

  // ---- Zones (Carte + Tour) -------------------------------------------------
  for (const z of ZONE_RES) {
    map[z.farm] = `Farm de la zone ${z.zone} — combats gagnés sur la Carte (niv. 1-4) et étages ${z.zone * 10 - 9}-${z.zone * 10} de la Tour.`;
    map[z.boss] = `Boss de la zone ${z.zone} — niveau 5 de la Carte et palier ${z.zone * 10} de la Tour.`;
    map[z.gem] = `Boss de la zone ${z.zone} (chance à chaque victoire) et palier ${z.zone * 10} de la Tour (garantie).`;
  }

  // ---- Donjons --------------------------------------------------------------
  map['ossement'] = 'Donjons — butin des salles.';
  map['fragment_relique'] = 'Donjons — butin des salles (sert aux reliques).';
  map['sceau_catacombe'] = 'Donjons — butin des salles (requis par les pièces de set).';
  map['plume_appel'] = 'Donjons — 1 garantie par donjon terminé (reroll de la Taverne).';
  map['larme_astrale'] =
    'Boss du donjon Tier 4 (meilleure chance) et classement du Boss de la Semaine.';

  // ---- Expéditions ----------------------------------------------------------
  const EXPEDITION_KEYS = [
    'seve_primordiale',
    'ambre_vivant',
    'coeur_sylve_ancien',
    'poussiere_arcane',
    'tablette_oubliee',
    'relique_noyee',
    'minerai_stellaire',
    'gemme_brute',
    'eclat_du_noyau',
  ];
  for (const k of EXPEDITION_KEYS) map[k] = 'Expéditions — butin au retour de mission.';

  // ---- Matériaux d'event ----------------------------------------------------
  map['eclat_sacre'] =
    'Boss de la Semaine — classement hebdomadaire (top 10), à réclamer le week-end. Forge l’armure divine.';
  map['poussiere_benie'] =
    'Champs de bataille — victoires (cooldown 12 h par bataille). Forge l’arme divine.';
  map['eclat_eternite'] =
    'Le Gauntlet — rente quotidienne selon ta meilleure vague. Renforce les équipements divins.';
  map['gemme_ancienne'] = 'Le Gauntlet — récompense d’événement (usage à venir).';
  map['fragment_guerre'] = 'Événement à venir.';

  // ---- Jumeaux d'Arc 2 : mêmes activités, rejouées dans l'arc 2 -------------
  for (const [baseKey, twin] of Object.entries(ARC2_TWINS)) {
    const base = map[baseKey];
    if (base && !map[twin.key]) map[twin.key] = `${base} (En Arc 2.)`;
  }

  return map;
})();

/** Texte « où farmer » d'une ressource, ou null si inconnue (legacy, or…). */
export function resourceSource(key: string): string | null {
  return SOURCES[key] ?? null;
}

/** Infobulle complète d'une ressource : « Nom — où la farmer ». */
export function resourceTooltip(key: string): string {
  const label = resourceMeta(key).label;
  const source = resourceSource(key);
  return source ? `${label} — ${source}` : label;
}
