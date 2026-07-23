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
import { BOSS_MATERIALS, FORGE_MATERIALS, type BossMaterial, type ForgeMaterialTheme } from './forge.ts';
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

  // -- BUTIN D'EXPÉDITION -----------------------------------------------------
  // Les expéditions se rejouent en arc 2 comme le reste (mêmes types, même
  // progression de niveau) : elles y rapportent donc leurs jumeaux. Ce sont eux
  // que consommeront les recettes des PIÈCES DE SET d'arc 2.
  seve_primordiale: { key: 'seve_corrompue', label: 'Sève corrompue' },
  ambre_vivant: { key: 'ambre_mort', label: 'Ambre mort' },
  coeur_sylve_ancien: { key: 'coeur_sylve_damne', label: 'Cœur sylvestre damné' },
  poussiere_arcane: { key: 'poussiere_maudite', label: 'Poussière maudite' },
  tablette_oubliee: { key: 'tablette_profanee', label: 'Tablette profanée' },
  relique_noyee: { key: 'relique_engloutie', label: 'Relique engloutie' },
  minerai_stellaire: { key: 'minerai_dechu', label: 'Minerai déchu' },
  gemme_brute: { key: 'gemme_fracturee', label: 'Gemme fracturée' },
  eclat_du_noyau: { key: 'eclat_du_vide', label: 'Éclat du vide' },

  // -- BUTIN DE DONJON --------------------------------------------------------
  // Les 8 donjons se rejouent en arc 2 (mêmes types, ennemis à l'échelle de
  // l'arc) : ils y lâchent donc leurs jumeaux, que consomment les recettes des
  // RELIQUES d'arc 2.
  //
  // La LARME ASTRALE n'a VOLONTAIREMENT pas de jumeau : elle paie la
  // bénédiction d'arme (Oratoire) et le craft des runes, deux systèmes communs
  // aux deux arcs. Lui donner une version d'arc 2 scinderait une réserve unique
  // en deux tas incompatibles et bloquerait l'Oratoire d'un joueur d'arc 2
  // assis sur ses larmes d'arc 1. Elle tombe donc dans les donjons des DEUX arcs
  // et se dépense partout — c'est la seule exception de la table.
  ossement: { key: 'ossement_calcine', label: 'Ossements calcinés' },
  fragment_relique: { key: 'fragment_relique_profane', label: 'Fragment de relique profané' },
  sceau_catacombe: { key: 'sceau_catacombe_brise', label: 'Sceau des catacombes brisé' },

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
 * RESSOURCES MUTUALISÉES ENTRE LES ARCS.
 *
 * `player_resources` est indexé par `(player_id, resource, tier)` où `tier` =
 * l'arc. Ne pas donner de jumeau à une ressource ne suffit donc PAS à la rendre
 * commune : elle reste rangée dans deux tas, un par arc, et le joueur d'arc 2 ne
 * voit ni ne dépense ce qu'il a gagné en arc 1.
 *
 * Ces clés-là sont donc épinglées à un tier UNIQUE (1), quel que soit l'arc où
 * elles tombent :
 *
 *  • `plume_appel` — paie le reroll de la Taverne, commune aux deux arcs ;
 *  • `larme_astrale` — paie la bénédiction d'arme (Oratoire) et le craft des
 *    runes, deux systèmes partagés. Le World Boss la créditait DÉJÀ au tier 1
 *    en dur, alors que les donjons la créditaient au tier de l'arc et que la
 *    dépense lisait le tier de l'arc : en arc 2, les larmes du World Boss
 *    étaient tout simplement indépensables.
 */
export const CROSS_ARC_RESOURCES: readonly string[] = ['plume_appel', 'larme_astrale'];

/** La ressource est-elle commune aux arcs (tas unique) ? */
export function isCrossArcResource(key: string): boolean {
  return CROSS_ARC_RESOURCES.includes(key);
}

/**
 * Tier de stockage d'une ressource pour un arc donné : 1 pour les ressources
 * mutualisées, l'arc pour toutes les autres.
 *
 * À utiliser PARTOUT où l'on crédite, lit ou dépense — c'est le seul point qui
 * garantit qu'un crédit et la dépense correspondante visent la même ligne.
 */
export function resourceTier(key: string, arc: number): number {
  return isCrossArcResource(key) ? 1 : Math.max(1, arc);
}

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

/** Correspondance INVERSE : clé d'arc 2 → clé d'arc 1 dont elle est le jumeau. */
const TWIN_TO_BASE: Record<string, string> = Object.fromEntries(
  Object.entries(ARC2_TWINS).map(([base, twin]) => [twin.key, base]),
);

/**
 * Clé d'ARC 1 d'origine d'un matériau (elle-même si c'en est déjà une).
 *
 * Sert à tout ce qui est indexé par la clé d'arc 1 sans avoir à être dupliqué —
 * au premier chef les ICÔNES : un jumeau d'arc 2 réutilise le visuel de son
 * aîné, ce qui évite 30 icônes de plus et garde la lecture immédiate (une
 * Écorce pétrifiée ressemble à de l'écorce).
 */
export function baseMaterialKey(key: string): string {
  return TWIN_TO_BASE[key] ?? key;
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

/* ------------------------------------------------------ essences de boss -- */

/**
 * Essences de boss de l'arc 2, dérivées de celles de l'arc 1 : MÊME zone, MÊME
 * quantité, MÊMES stats arrosées — seules la clé et l'étiquette changent.
 *
 * Sans cette table, la forge d'arc 2 proposait les essences d'ARC 1 : le joueur
 * les voyait à 0 (il possède `coeur_fletri`, pas `coeur_sylve`) et le serveur
 * facturait de toute façon une clé d'arc 1 qu'il n'a pas — les stats secondaires
 * étaient donc tout simplement inaccessibles en arc 2.
 */
export const BOSS_MATERIALS_ARC2: BossMaterial[] = BOSS_MATERIALS.map((b) => {
  const twin = ARC2_TWINS[b.key];
  return { ...b, key: twin?.key ?? b.key, label: twin?.label ?? b.label };
});

/** Essences proposées à un arc donné (même règle que les thèmes de forge). */
export function bossMaterialsForArc(arc: number): BossMaterial[] {
  return arc >= 2 ? BOSS_MATERIALS_ARC2 : BOSS_MATERIALS;
}

/** Résout une essence de boss dans le catalogue de l'arc. Strict, comme `materialForArc`. */
export function bossMaterialForArc(key: string, arc: number): BossMaterial | undefined {
  return bossMaterialsForArc(arc).find((b) => b.key === key);
}

/** Essence lâchée par le boss de CETTE zone, dans cet arc (`null` pour les zones 1 à 3). */
export function zoneBossMaterialForArc(zone: number, arc: number): BossMaterial | null {
  return bossMaterialsForArc(arc).find((b) => b.zone === zone) ?? null;
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

/**
 * Résout un id de MATÉRIAU dans le catalogue de l'arc donné.
 *
 * STRICT à dessein : un id d'arc 1 est introuvable en arc 2, et inversement.
 * C'est ce qui empêche un client de faire payer un craft d'arc 2 avec des
 * composants d'arc 1 — la validation serveur repose entièrement là-dessus.
 */
export function materialForArc(id: string, arc: number): ForgeMaterialTheme | undefined {
  return forgeMaterialsForArc(arc).find((m) => m.id === id);
}

/** Résout un id de GEMME dans le catalogue de l'arc donné. Strict, comme ci-dessus. */
export function gemForArc(id: string, arc: number): GemDef | undefined {
  return gemsForArc(arc).find((g) => g.id === id);
}

/**
 * Dans quels arcs une ressource existe-t-elle ?
 *
 *  • `'arc1'` — matériau d'arc 1 qui a un jumeau : remplacé en arc 2 ;
 *  • `'arc2'` — le jumeau lui-même ;
 *  • `'both'` — ressource SANS jumeau, donc commune aux deux arcs : butin de
 *    donjon, larmes astrales, matériaux d'event, plume d'appel…
 *
 * ⚠️ `arcOfMaterialKey` ne suffit pas pour filtrer un affichage : il répond 1
 * pour toute clé sans jumeau, ce qui masquerait à tort le butin de donjon et les
 * matériaux d'event à un joueur d'arc 2.
 */
export function materialArcScope(key: string): 'arc1' | 'arc2' | 'both' {
  if (ARC2_KEYS.includes(key)) return 'arc2';
  return ARC2_TWINS[key] ? 'arc1' : 'both';
}

/** La ressource est-elle disponible dans cet arc ? */
export function materialInArc(key: string, arc: number): boolean {
  const scope = materialArcScope(key);
  return scope === 'both' || scope === (arc >= 2 ? 'arc2' : 'arc1');
}

/**
 * Résout un id de matériau dans N'IMPORTE QUEL arc.
 *
 * ⚠️ RÉSERVÉ AUX OUTILS D'ADMINISTRATION. Le craft doit rester STRICT
 * (`materialForArc`) : c'est cette étanchéité qui empêche de payer un objet d'arc 2
 * avec des composants d'arc 1. Ici l'intention est inverse — un admin désigne un
 * matériau précis et doit pouvoir accorder de l'arc 1 comme de l'arc 2.
 */
export function materialAnyArc(id: string): ForgeMaterialTheme | undefined {
  return FORGE_MATERIALS.find((m) => m.id === id) ?? FORGE_MATERIALS_ARC2.find((m) => m.id === id);
}

/** Idem pour une gemme. Outils d'administration UNIQUEMENT. */
export function gemAnyArc(id: string): GemDef | undefined {
  return GEMS.find((g) => g.id === id) ?? GEMS_ARC2.find((g) => g.id === id);
}

/** Gemme lâchée par le boss d'une zone, pour l'arc donné. */
export function gemByMapForArc(mapId: string, arc: number): GemDef | undefined {
  return gemsForArc(arc).find((g) => g.mapId === mapId);
}

/** Garde-fou : la table couvre tous les arcs jusqu'à `MAX_ARC`. */
export const ARC_MATERIALS_MAX_ARC = MAX_ARC;
