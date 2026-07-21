/**
 * MATÉRIAUX PAR ARC — chaque arc a ses PROPRES matériaux.
 *
 * L'arc 2 rejoue les 10 mêmes zones, mais elles n'y lâchent plus l'Écorce ni la
 * Gemme de Sève : elles lâchent leurs équivalents corrompus des Terres du
 * Désespoir (Écorce pétrifiée, Gemme de Sève noire…). Trois familles ont un
 * jumeau par arc : le matériau de FARM, la ressource de BOSS et la GEMME.
 *
 * Pourquoi une correspondance en CODE plutôt qu'en base : les clés de
 * `player_resources` sont de simples chaînes, et la table est déjà indexée par
 * `(player_id, resource, tier)`. Une table de correspondance pure suffit donc à
 * introduire 30 matériaux SANS AUCUNE MIGRATION — et elle est testable.
 *
 * ⚠️ Le `tier` de `player_resources` reste écrit (= l'arc), mais il n'est plus
 * ce qui distingue les matériaux : ce sont les CLÉS qui diffèrent désormais.
 * Les deux mécanismes coexistent sans se gêner.
 *
 * Les jumeaux d'arc 2 ne sont PAS plus puissants en eux-mêmes : la puissance
 * d'un arc vient de `tierGearMult` (×14) et de `forgeCostMult`. Dupliquer aussi
 * la magnitude reviendrait à scaler deux fois.
 */
import { FORGE_MATERIALS, type ForgeMaterialTheme } from './forge.ts';
import { GEMS, type GemDef } from './jewelry.ts';
import { MAX_ARC } from './arc.ts';

/** Un jumeau d'arc : nouvelle clé de ressource + son libellé. */
export type ArcTwin = { key: string; label: string };

/**
 * Correspondance ARC 1 → ARC 2, par clé de ressource. Les trois familles sont
 * dans la même table : c'est la clé qui identifie une ressource, sa famille
 * n'entre en jeu que côté drop.
 */
export const ARC2_TWINS: Record<string, ArcTwin> = {
  // -- matériaux de FARM (puissance des objets forgés) ------------------------
  ecorce: { key: 'ecorce_petrifiee', label: 'Écorce pétrifiée' },
  cristal: { key: 'cristal_fele', label: 'Cristal fêlé' },
  sable_noir: { key: 'sable_cendre', label: 'Sable de cendre' },
  spore: { key: 'spore_virulente', label: 'Spore virulente' },
  obsidienne: { key: 'obsidienne_vive', label: 'Obsidienne vive' },
  rune: { key: 'rune_brisee', label: 'Rune brisée' },
  nacre_noire: { key: 'nacre_morte', label: 'Nacre morte' },
  plume_orage: { key: 'plume_calcinee', label: 'Plume calcinée' },
  ombre_pure: { key: 'ombre_devorante', label: 'Ombre dévorante' },
  poussiere_etoile: { key: 'poussiere_astre_mort', label: "Poussière d'astre mort" },

  // -- ressources de BOSS -----------------------------------------------------
  coeur_sylve: { key: 'coeur_fletri', label: 'Cœur flétri' },
  givre_pur: { key: 'givre_mort', label: 'Givre mort' },
  oeil_sphinx: { key: 'oeil_aveugle', label: 'Œil aveugle' },
  coeur_hydre: { key: 'coeur_gangrene', label: 'Cœur gangrené' },
  braise_eternelle: { key: 'braise_mourante', label: 'Braise mourante' },
  fragment_titan: { key: 'fragment_maudit', label: 'Fragment maudit' },
  encre_kraken: { key: 'encre_abyssale', label: 'Encre abyssale' },
  foudre_condensee: { key: 'foudre_noire', label: 'Foudre noire' },
  coeur_ombre: { key: 'coeur_neant', label: 'Cœur du néant' },
  essence_astrale: { key: 'essence_dechue', label: 'Essence déchue' },

  // -- GEMMES (le passif reste le même : seule la coquille change) ------------
  gemme_seve: { key: 'gemme_seve_noire', label: 'Gemme de Sève noire' },
  gemme_glace: { key: 'gemme_glace_noire', label: 'Gemme de Glace noire' },
  gemme_solaire: { key: 'gemme_eclipse', label: "Gemme d'Éclipse" },
  gemme_venin: { key: 'gemme_venin_pur', label: 'Gemme de Venin pur' },
  gemme_braise: { key: 'gemme_fournaise', label: 'Gemme de Fournaise' },
  gemme_runique: { key: 'gemme_runique_corrompue', label: 'Gemme Runique corrompue' },
  gemme_abyssale: { key: 'gemme_abime', label: "Gemme d'Abîme" },
  gemme_orage: { key: 'gemme_tempete', label: 'Gemme de Tempête' },
  gemme_ombre: { key: 'gemme_neant', label: 'Gemme du Néant' },
  gemme_astrale: { key: 'gemme_astre_noir', label: "Gemme d'Astre noir" },
};

/**
 * Clé de ressource à utiliser pour un arc donné. Arc 1 (ou clé sans jumeau —
 * larmes astrales, butin d'expédition, matériaux d'event…) : la clé d'origine.
 */
export function arcMaterialKey(baseKey: string, arc: number): string {
  if (arc < 2) return baseKey;
  return ARC2_TWINS[baseKey]?.key ?? baseKey;
}

/** Libellés de TOUS les jumeaux (alimente le dictionnaire d'affichage du front). */
export const ARC2_TWIN_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(ARC2_TWINS).map((t) => [t.key, t.label]),
);

/** Toutes les clés d'arc 2 (utile aux tests et aux filtres d'inventaire). */
export const ARC2_KEYS: string[] = Object.values(ARC2_TWINS).map((t) => t.key);

/** L'arc d'appartenance d'une clé de ressource (1 si elle n'a pas de jumeau). */
export function arcOfMaterialKey(key: string): number {
  return ARC2_KEYS.includes(key) ? 2 : 1;
}

/* ------------------------------------------------------- thèmes de forge -- */

/**
 * Thèmes de forge de l'arc 2, DÉRIVÉS de ceux de l'arc 1 : mêmes zones, même
 * magnitude et même or, seules les clés de matériaux et le libellé changent.
 *
 * Dérivés plutôt que recopiés à la main : rééquilibrer un matériau d'arc 1
 * (magnitude, quantité) se répercute automatiquement, et les deux listes ne
 * peuvent pas se désynchroniser en silence.
 */
export const FORGE_MATERIALS_ARC2: ForgeMaterialTheme[] = FORGE_MATERIALS.map((m) => {
  const twin = ARC2_TWINS[m.materials[0]?.key ?? ''];
  return {
    ...m,
    id: `${m.id}_a2`,
    label: twin?.label ?? m.label,
    // Le suffixe nomme l'objet forgé ("Épée en écorce pétrifiée").
    suffix: twin ? `en ${twin.label.toLowerCase()}` : m.suffix,
    craftTier: 2,
    materials: m.materials.map((x) => ({ ...x, key: arcMaterialKey(x.key, 2) })),
  };
});

/**
 * Thèmes de forge proposés à un arc donné. Un joueur d'arc 2 ne voit QUE les
 * matériaux d'arc 2 : ses réserves d'arc 1 ne sont pas dépensables ici, les
 * afficher n'apporterait que de la confusion.
 */
export function forgeMaterialsForArc(arc: number): ForgeMaterialTheme[] {
  return arc >= 2 ? FORGE_MATERIALS_ARC2 : FORGE_MATERIALS;
}

/* --------------------------------------------------------------- gemmes -- */

/**
 * Gemmes de l'arc 2, dérivées des gemmes d'arc 1 : MÊME passif et MÊME plafond.
 * Un arc apporte des stats (×14), pas des passifs plus gros — un vol de vie à
 * 35 % reste un vol de vie à 35 %, sinon les passifs deviendraient la vraie
 * source d'inflation.
 */
export const GEMS_ARC2: GemDef[] = GEMS.map((g) => {
  const twin = ARC2_TWINS[g.id];
  return {
    ...g,
    id: twin?.key ?? `${g.id}_a2`,
    label: twin?.label ?? g.label,
    epithet: g.epithet,
  };
});

/** Gemmes proposées à un arc donné (même règle que les thèmes de forge). */
export function gemsForArc(arc: number): GemDef[] {
  return arc >= 2 ? GEMS_ARC2 : GEMS;
}

/** Gemme lâchée par le boss d'une zone, pour l'arc donné. */
export function gemByMapForArc(mapId: string, arc: number): GemDef | undefined {
  return gemsForArc(arc).find((g) => g.mapId === mapId);
}

/** Garde-fou : la table couvre tous les arcs jusqu'à `MAX_ARC`. */
export const ARC_MATERIALS_MAX_ARC = MAX_ARC;
