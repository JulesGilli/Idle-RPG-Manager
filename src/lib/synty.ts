/**
 * Helpers pour les assets UI Synty « Fantasy Warrior ».
 * Les PNG sont servis statiquement depuis public/synty/Sprites/… (URL absolues).
 * On ne touche à aucune logique de jeu : ce module ne fait que construire des URLs.
 */
// `import.meta.env.BASE_URL` = base Vite (« / » en dev, « /Idle-RPG-Manager/ » sur
// GitHub Pages). Indispensable pour que les assets se chargent sous un sous-chemin.
const BASE = `${import.meta.env.BASE_URL}synty/Sprites`;

/** Les icônes existent en 3 calques : Clean (silhouette pleine, teintable), Stroke (contour), Underlay (ombre). */
export type IconVariant = 'Clean' | 'Stroke' | 'Underlay';

export const syntyUrl = {
  /** Cadres/barres/anneaux/gems du kit principal. */
  fw: (name: string) => `${BASE}/FantasyWarrior/SPR_FantasyWarrior_${name}.png`,
  hud: (name: string) => `${BASE}/HUD/SPR_HUD_FantasyWarrior_${name}.png`,
  fx: (name: string) => `${BASE}/FX/SPR_FX_FantasyWarrior_${name}.png`,
  stat: (name: string, v: IconVariant = 'Clean') =>
    `${BASE}/Icons_Stats/ICON_FantasyWarrior_Stat_${name}_${v}.png`,
  status: (name: string, v: IconVariant = 'Clean') =>
    `${BASE}/Icons_Status/ICON_FantasyWarrior_Status_${name}_${v}.png`,
  element: (name: string, v: IconVariant = 'Clean') =>
    `${BASE}/Icons_Elements/ICON_FantasyWarrior_Element_${name}_${v}.png`,
  map: (name: string, v: IconVariant = 'Clean') =>
    `${BASE}/Icons_Map/ICON_FantasyWarrior_Map_${name}_${v}.png`,
  inv: (name: string, v: IconVariant = 'Clean') =>
    `${BASE}/Icons_Inventory/ICON_FantasyWarrior_Inventory_${name}_${v}.png`,
  /** Icônes pleine couleur (fichier complet, sans variante). */
  weapon: (file: string) => `${BASE}/Icons_Weapons/${file}.png`,
  resource: (file: string) => `${BASE}/Icons_Resources/${file}.png`,
} as const;

/** Cadre médiéval doré de référence (fin, centre creux) — utilisé en border-image. */
export const FRAME_MEDIUM = syntyUrl.fw('Frame_Box_Medium01_Variant01');

/** Icône d'arme pleine couleur représentant chaque classe (portrait / badge). */
export const CLASS_WEAPON: Record<string, string> = {
  guerrier: 'ICON_SM_Wep_Sword_01',
  archer: 'ICON_SM_Prop_Bow_01',
  mage: 'ICON_SM_Wep_Staff_01',
  paladin: 'ICON_SM_Wep_Shield_01',
  soigneur: 'ICON_SM_Wep_Sceptre_01',
};

export function classWeaponUrl(classId: string): string {
  return syntyUrl.weapon(CLASS_WEAPON[classId] ?? 'ICON_SM_Wep_Sword_01');
}

/** Couleur (hex) par palier de rareté — cadre + halo de craft (5 paliers). */
export const RARITY_HEX: Record<string, string> = {
  poor: '#94a3b8',
  common: '#cbd5e1',
  uncommon: '#34d399',
  advanced: '#38bdf8',
  ultimate: '#f5b544',
};

export function rarityHex(rarity: string): string {
  return RARITY_HEX[rarity] ?? RARITY_HEX.common!;
}

/**
 * Silhouette « Inventory » (teintable) représentant un modèle de forge (FORGE_BASES).
 * Une icône par MODÈLE d'arme. La grande épée devient une masse (choix visuel).
 * Les 3 armures utilisent pour l'instant `Armor01` (placeholder) — remplacées par
 * des silhouettes maison lourde/moyenne/légère (cf. ARMOR_ICON) une fois validées.
 * Valeur = nom passé à `syntyUrl.inv(...)`.
 */
export const FORGE_BASE_WEAPON: Record<string, string> = {
  grande_epee: 'Maces01',
  epee: 'Swords01',
  dague: 'Daggers01',
  marteau: 'Hammers01',
  sceptre: 'Staves01',
  arc: 'Bows01',
  plaques: 'Armor01',
  mailles: 'Armor01',
  tunique: 'Armor01',
};

export function forgeBaseUrl(baseId: string): string {
  return syntyUrl.inv(FORGE_BASE_WEAPON[baseId] ?? 'Swords01');
}

/**
 * Icône Synty par ressource (Icons_Resources).
 * - `src` seul → prop pleine couleur (rendu <img>).
 * - `tint` présent → silhouette teintée (mask CSS) : utilisé pour les gemmes de
 *   boss, chacune colorée selon son thème élémentaire (couleur garantie/distincte).
 * Cosmétique pur : repli emoji (resourceMeta) pour les clés non mappées.
 */
export type ResourceGlyph = { src: string; tint?: string };

/** Silhouette de gemme taillée, teintée par thème pour les gemmes de boss. */
const GEM_MASK = syntyUrl.resource('ICON_SM_Item_Gem_01');
const gemme = (tint: string): ResourceGlyph => ({ src: GEM_MASK, tint });
const res = (file: string): ResourceGlyph => ({ src: syntyUrl.resource(file) });

export const RESOURCE_ICON: Record<string, ResourceGlyph> = {
  // Matériaux de zone (props pleine couleur)
  ecorce: res('ICON_SM_Item_Wood_01'),
  cristal: res('ICON_SM_Item_Crystal_01'),
  sable_noir: res('ICON_SM_Item_Powder_01'),
  spore: res('ICON_SM_Item_Mushroom_01'),
  obsidienne: res('ICON_SM_Item_Rock_01'),
  rune: res('ICON_SM_Item_Parchment_01'),
  nacre_noire: res('ICON_SM_Item_Crystal_04'),
  plume_orage: res('ICON_SM_Item_Feather_01'),
  ombre_pure: res('ICON_SM_Item_Gem_05'),
  poussiere_etoile: res('ICON_SM_Item_Gem_02'),
  // Composants de boss
  coeur_sylve: res('ICON_SM_Item_Root_01'),
  givre_pur: res('ICON_SM_Item_Crystal_02'),
  oeil_sphinx: res('ICON_SM_Item_Eye_01'),
  coeur_hydre: res('ICON_SM_Item_Plant_01'),
  braise_eternelle: res('ICON_SM_Item_Crystal_05'),
  fragment_titan: res('ICON_SM_Item_Ingot_Iron_01'),
  encre_kraken: res('ICON_SM_Item_Bottle_01'),
  foudre_condensee: res('ICON_SM_Item_Crystal_03'),
  coeur_ombre: res('ICON_SM_Item_Gem_04'),
  essence_astrale: res('ICON_SM_Item_Gem_03'),
  // Gemmes de boss (silhouette teintée par thème élémentaire)
  gemme_seve: gemme('#5fd39b'),
  gemme_glace: gemme('#7dd3fc'),
  gemme_solaire: gemme('#f5b544'),
  gemme_venin: gemme('#8ade8a'),
  gemme_braise: gemme('#fb7185'),
  gemme_runique: gemme('#c084fc'),
  gemme_abyssale: gemme('#38bdf8'),
  gemme_orage: gemme('#facc15'),
  gemme_ombre: gemme('#94a3b8'),
  gemme_astrale: gemme('#ffd27a'),
  // Donjons (loot dédié)
  ossement: res('ICON_SM_Item_Bird_Skull_01'),
  fragment_relique: res('ICON_SM_Item_Gem_05'),
  sceau_catacombe: res('ICON_SM_Item_Key_01'),
  // Expéditions (matériaux uniques → futurs sets)
  seve_primordiale: res('ICON_SM_Item_Root_01'),
  ambre_vivant: gemme('#f5b544'),
  coeur_sylve_ancien: res('ICON_SM_Item_Plant_01'),
  poussiere_arcane: res('ICON_SM_Item_Powder_01'),
  tablette_oubliee: res('ICON_SM_Item_Parchment_01'),
  relique_noyee: res('ICON_SM_Item_Bottle_01'),
  minerai_stellaire: res('ICON_SM_Item_Ingot_Iron_01'),
  gemme_brute: gemme('#7dd3fc'),
  eclat_du_noyau: res('ICON_SM_Item_Crystal_03'),
  // Legacy
  iron: res('ICON_SM_Item_Ingot_Iron_01'),
  essence: res('ICON_SM_Item_Crystal_03'),
};

export function resourceIcon(key: string): ResourceGlyph | null {
  return RESOURCE_ICON[key] ?? null;
}

/** Silhouette d'inventaire (Clean, teintable) représentant chaque classe. */
export const CLASS_ICON_INV: Record<string, string> = {
  guerrier: 'Swords01',
  archer: 'Bows01',
  mage: 'Staves01',
  paladin: 'Shields01',
  soigneur: 'Scepters01',
};

/** URL de la silhouette (Clean) d'une classe, à teinter par sa couleur d'accent. */
export function classWeaponCleanUrl(classId: string): string {
  return syntyUrl.inv(CLASS_ICON_INV[classId] ?? 'Swords01');
}

/**
 * Icônes de carte « monstres » : la couche Underlay porte le trait gravé
 * (pleine image, rendu <img>), la couche Clean est une silhouette teintable.
 */
export const MAP_ART = {
  skull: syntyUrl.map('Skull01', 'Underlay'),
  monster: syntyUrl.map('Monster01', 'Underlay'),
  dragon: syntyUrl.map('Dragon01', 'Underlay'),
  treasure: syntyUrl.map('Treasure01', 'Underlay'),
  tower: syntyUrl.map('Target01', 'Underlay'),
} as const;

/** Icône (Clean, teintable) pour chaque stat de héros. */
export const STAT_GLYPH: Record<'hp' | 'atk' | 'def' | 'speed', string> = {
  hp: syntyUrl.stat('Health01'),
  atk: syntyUrl.inv('Daggers01'),
  def: syntyUrl.status('Defense01'),
  speed: syntyUrl.stat('Speed01'),
};

/** Icône (Clean, teintable) pour chaque statut de combat. */
export const STATUS_GLYPH: Record<string, string> = {
  poison: syntyUrl.status('Poisoned01'),
  burn: syntyUrl.status('Burninating01'),
  stun: syntyUrl.status('Shocked01'),
  weaken: syntyUrl.status('DefenseDown01'),
  taunt: syntyUrl.status('Targeted01'),
};

/**
 * Icône Synty (teintée) par nœud d'arbre de compétence, indexée par id de nœud.
 * Couvre TOUS les nœuds (aucun emoji résiduel) : silhouette de statut/stat/élément
 * teintée par le thème du nœud. Purement cosmétique/front — ne touche pas la data
 * `/shared`. Repli neutre via `skillNodeGlyph()` pour tout id inconnu.
 */
export const SKILL_NODE_GLYPH: Record<string, { src: string; color: string }> = {
  // -------- GUERRIER
  // Meneur
  g_men_faille: { src: syntyUrl.status('DefenseDown01'), color: '#c084fc' },
  g_men_banniere: { src: syntyUrl.status('AttackUp01'), color: '#e8b64a' },
  g_men_fureur: { src: syntyUrl.status('Burninating01'), color: '#fb7185' },
  g_men_assommant: { src: syntyUrl.status('Shocked01'), color: '#facc15' },
  g_men_cri: { src: syntyUrl.status('FortifiedAttack01'), color: '#e8b64a' },
  // Berserker
  g_ber_rage: { src: syntyUrl.status('AttackUp01'), color: '#fb7185' },
  g_ber_oeil: { src: syntyUrl.status('Critical01'), color: '#f5b544' },
  g_ber_sang: { src: syntyUrl.status('Bleeding01'), color: '#fb7185' },
  g_ber_brutale: { src: syntyUrl.status('DefenseBroken01'), color: '#f0934a' },
  g_ber_execution: { src: syntyUrl.status('Dead01'), color: '#f87171' },
  // Rempart
  g_rem_parade: { src: syntyUrl.status('Armour01'), color: '#56b6f4' },
  g_rem_aura: { src: syntyUrl.status('DefenseUp01'), color: '#3b82f6' },
  g_rem_contrecoup: { src: syntyUrl.status('Attack01'), color: '#56b6f4' },
  g_rem_provoc: { src: syntyUrl.status('Targeted01'), color: '#3b82f6' },
  g_rem_sacrifice: { src: syntyUrl.status('FortifiedDefense01'), color: '#3b82f6' },
  // -------- ARCHER
  // Vipère
  a_vip_poison: { src: syntyUrl.status('Poisoned01'), color: '#8ade8a' },
  a_vip_toxine: { src: syntyUrl.status('Cursed02'), color: '#5fd39b' },
  a_vip_epidemie: { src: syntyUrl.status('Entangled01'), color: '#22c55e' },
  a_vip_volee: { src: syntyUrl.status('Targeted01'), color: '#8ade8a' },
  a_vip_fleau: { src: syntyUrl.status('Dead01'), color: '#22c55e' },
  // Tempête
  a_tem_groupe: { src: syntyUrl.status('Targeted01'), color: '#06b6d4' },
  a_tem_rafale: { src: syntyUrl.status('Critical01'), color: '#f5b544' },
  a_tem_vent: { src: syntyUrl.status('AttackDown01'), color: '#7dd3fc' },
  a_tem_pluie: { src: syntyUrl.element('Air01'), color: '#06b6d4' },
  a_tem_ouragan: { src: syntyUrl.element('Air02'), color: '#22d3ee' },
  // Œil de faucon
  a_oeil_visee: { src: syntyUrl.status('Critical01'), color: '#f5b544' },
  a_oeil_faille: { src: syntyUrl.status('DefenseBroken01'), color: '#f59e0b' },
  a_oeil_grace: { src: syntyUrl.status('Dead01'), color: '#f59e0b' },
  a_oeil_perforante: { src: syntyUrl.status('Shocked01'), color: '#f59e0b' },
  a_oeil_destin: { src: syntyUrl.status('Targeted01'), color: '#f5b544' },
  // -------- MAGE
  // Brasier
  m_bra_etincelle: { src: syntyUrl.status('Burninating01'), color: '#fb923c' },
  m_bra_combustion: { src: syntyUrl.status('Burninating01'), color: '#f97316' },
  m_bra_surchauffe: { src: syntyUrl.element('Fire01'), color: '#f97316' },
  m_bra_vague: { src: syntyUrl.status('Burninating01'), color: '#fb7185' },
  m_bra_cataclysme: { src: syntyUrl.element('Fire01'), color: '#ef4444' },
  // Frimas
  m_fri_morsure: { src: syntyUrl.status('Cold01'), color: '#7dd3fc' },
  m_fri_fragilite: { src: syntyUrl.status('DefenseDown01'), color: '#7dd3fc' },
  m_fri_eclat: { src: syntyUrl.status('Critical01'), color: '#38bdf8' },
  m_fri_lance: { src: syntyUrl.element('Ice01'), color: '#7dd3fc' },
  m_fri_vent: { src: syntyUrl.status('Cold01'), color: '#38bdf8' },
  // Arcane
  m_arc_maitrise: { src: syntyUrl.stat('Magic01'), color: '#c084fc' },
  m_arc_marque: { src: syntyUrl.stat('Magic02'), color: '#c084fc' },
  m_arc_surcharge: { src: syntyUrl.status('Critical01'), color: '#a855f7' },
  m_arc_meteore: { src: syntyUrl.stat('Magic03'), color: '#c084fc' },
  m_arc_aneantissement: { src: syntyUrl.stat('Magic04'), color: '#a855f7' },
  // -------- PALADIN
  // Bastion
  p_bas_agro: { src: syntyUrl.status('Targeted01'), color: '#cbd5e1' },
  p_bas_volonte: { src: syntyUrl.status('Fortified01'), color: '#cbd5e1' },
  p_bas_inebranlable: { src: syntyUrl.status('FortifiedDefense01'), color: '#cbd5e1' },
  p_bas_provoc: { src: syntyUrl.status('Targeted01'), color: '#94a3b8' },
  p_bas_rempart: { src: syntyUrl.status('Armour01'), color: '#cbd5e1' },
  // Aegis
  p_aeg_benediction: { src: syntyUrl.status('Armour01'), color: '#fcd34d' },
  p_aeg_lumiere: { src: syntyUrl.status('Health01'), color: '#fde68a' },
  p_aeg_resilience: { src: syntyUrl.status('DefenseUp01'), color: '#fcd34d' },
  p_aeg_etreinte: { src: syntyUrl.status('Health02'), color: '#fcd34d' },
  p_aeg_jugement: { src: syntyUrl.status('Shocked01'), color: '#facc15' },
  // Paladin déchu
  p_dec_pacte: { src: syntyUrl.status('Bleeding01'), color: '#a855f7' },
  p_dec_regen: { src: syntyUrl.status('Health01'), color: '#a855f7' },
  p_dec_epines: { src: syntyUrl.status('Cursed01'), color: '#7c3aed' },
  p_dec_miroir: { src: syntyUrl.status('Cursed02'), color: '#7c3aed' },
  p_dec_vengeance: { src: syntyUrl.status('Dead01'), color: '#7c3aed' },
  // -------- SOIGNEUR
  // Lumière
  s_lum_soin: { src: syntyUrl.status('Health01'), color: '#5fd39b' },
  s_lum_grace: { src: syntyUrl.status('Health02'), color: '#fde68a' },
  s_lum_souffle: { src: syntyUrl.status('AttackUp01'), color: '#fde68a' },
  s_lum_rayon: { src: syntyUrl.status('Health02'), color: '#5fd39b' },
  s_lum_resurrection: { src: syntyUrl.status('Up01'), color: '#ffd27a' },
  // Bénédiction
  s_ben_benediction: { src: syntyUrl.status('Health01'), color: '#f9a8d4' },
  s_ben_rayonnement: { src: syntyUrl.status('Health02'), color: '#f9a8d4' },
  s_ben_echo: { src: syntyUrl.status('Health01'), color: '#f472b6' },
  s_ben_vague: { src: syntyUrl.status('Health02'), color: '#f9a8d4' },
  s_ben_sanctuaire: { src: syntyUrl.status('FortifiedHealth01'), color: '#f9a8d4' },
  // Oracle
  s_ora_puissance: { src: syntyUrl.status('AttackUp01'), color: '#60a5fa' },
  s_ora_fermete: { src: syntyUrl.status('DefenseUp01'), color: '#60a5fa' },
  s_ora_vitalite: { src: syntyUrl.status('FortifiedHealth01'), color: '#60a5fa' },
  s_ora_rituel: { src: syntyUrl.status('FortifiedAttack01'), color: '#60a5fa' },
  s_ora_concert: { src: syntyUrl.status('SpeedUp01'), color: '#60a5fa' },
};

/** Glyphe Synty d'un nœud de compétence, avec repli neutre si l'id est inconnu. */
export function skillNodeGlyph(id: string): { src: string; color: string } {
  return SKILL_NODE_GLYPH[id] ?? { src: syntyUrl.stat('Magic01'), color: 'currentColor' };
}

/* ============================================================================
   Icônes d'interface — 100% Synty (aucun emoji).
   Silhouettes « Clean » teintables, indexées par concept d'UI. Teinte par
   défaut incluse ; on peut la surcharger via la prop `color` de <UiIcon>.
   ========================================================================== */
export type Glyph = { src: string; tint?: string };

export const UI_GLYPH = {
  gold: { src: syntyUrl.inv('Currency01'), tint: '#f5b544' },
  xp: { src: syntyUrl.status('XP01'), tint: '#c084fc' },
  levelUp: { src: syntyUrl.status('Up01'), tint: '#5fd39b' },
  levelDown: { src: syntyUrl.status('Down01'), tint: '#fb7185' },
  attack: { src: syntyUrl.inv('Swords01') },
  attackEnemy: { src: syntyUrl.inv('Daggers01') },
  loop: { src: syntyUrl.status('Time01') },
  boss: { src: syntyUrl.map('Star01'), tint: '#f5b544' },
  lock: { src: syntyUrl.map('Lock01') },
  key: { src: syntyUrl.map('Key01') },
  materials: { src: syntyUrl.inv('Backpack01') },
  bag: { src: syntyUrl.inv('Backpack01') },
  squad: { src: syntyUrl.inv('Helmets01') },
  craft: { src: syntyUrl.inv('Hammers01') },
  forge: { src: syntyUrl.inv('Crafting01') },
  refine: { src: syntyUrl.inv('Minerals01'), tint: '#60a5fa' },
  jewel: { src: syntyUrl.inv('Necklaces01') },
  relic: { src: syntyUrl.inv('Magic01'), tint: '#c084fc' },
  book: { src: syntyUrl.inv('Notes02') },
  map: { src: syntyUrl.map('Flag01') },
  victory: { src: syntyUrl.map('Star01'), tint: '#f5b544' },
  defeat: { src: syntyUrl.map('Skull01'), tint: '#94a3b8' },
  skull: { src: syntyUrl.map('Skull01') },
  dragon: { src: syntyUrl.map('Dragon01') },
  power: { src: syntyUrl.status('Attack01'), tint: '#f5b544' },
  heart: { src: syntyUrl.status('Health01'), tint: '#fb7185' },
  bleed: { src: syntyUrl.status('Bleeding01'), tint: '#fb7185' },
  heal: { src: syntyUrl.status('Health01'), tint: '#5fd39b' },
  regenPct: { src: syntyUrl.status('Health01'), tint: '#5fd39b' },
  contribution: { src: syntyUrl.map('Star01'), tint: '#ffd27a' },
  tavern: { src: syntyUrl.map('Tavern01') },
  guild: { src: syntyUrl.hud('Symbol_LionHead01') },
  raid: { src: syntyUrl.map('Dragon01') },
  join: { src: syntyUrl.status('Up01'), tint: '#5fd39b' },
  leave: { src: syntyUrl.status('Down01'), tint: '#94a3b8' },
  promote: { src: syntyUrl.status('Up01'), tint: '#5fd39b' },
  demote: { src: syntyUrl.status('Down01'), tint: '#fb7185' },
  kick: { src: syntyUrl.status('Dead01'), tint: '#fb7185' },
  warning: { src: syntyUrl.status('Cursed01'), tint: '#fb7185' },
  auto: { src: syntyUrl.inv('Crafting01') },
  next: { src: syntyUrl.status('Up01'), tint: '#c084fc' },
  daily: { src: syntyUrl.map('Key01'), tint: '#f5b544' },
  leaderboard: { src: syntyUrl.map('Star01'), tint: '#ffd27a' },
  redeem: { src: syntyUrl.map('Key01'), tint: '#5fd39b' },
  changelog: { src: syntyUrl.inv('Notes02'), tint: '#8b7cf6' },
} as const satisfies Record<string, Glyph>;

export type UiIconName = keyof typeof UI_GLYPH;

/** Médailles de classement (or/argent/bronze) — étoile Synty teintée. */
export const MEDAL_TINT = ['#f5b544', '#c0c6d4', '#cd8145'] as const;

/** Icône de type d'objet (silhouette Clean teintable). */
export const ITEM_TYPE_GLYPH: Record<string, string> = {
  weapon: syntyUrl.inv('Swords01'),
  armor: syntyUrl.inv('Shields01'),
  jewel: syntyUrl.inv('Rings01'),
  relic: syntyUrl.inv('Magic01'),
};

/** Passif de bijou → glyphe de statut Synty (teinté par thème). */
export const PASSIVE_GLYPH: Record<string, Glyph> = {
  regen: { src: syntyUrl.status('Health01'), tint: '#5fd39b' },
  shield: { src: syntyUrl.status('Armour01'), tint: '#56b6f4' },
  crit: { src: syntyUrl.status('Critical01'), tint: '#f5b544' },
  venom: { src: syntyUrl.status('Poisoned01'), tint: '#8ade8a' },
  rage: { src: syntyUrl.status('AttackUp01'), tint: '#fb7185' },
  thorns: { src: syntyUrl.status('Cursed01'), tint: '#94a3b8' },
  lifesteal: { src: syntyUrl.status('Bleeding01'), tint: '#fb7185' },
  first_strike: { src: syntyUrl.status('Shocked01'), tint: '#facc15' },
  dodge: { src: syntyUrl.status('SpeedUp01'), tint: '#5fd39b' },
  execute: { src: syntyUrl.status('Dead01'), tint: '#fb7185' },
};

/** Modèle de relique → glyphe de statut Synty (repli si pas d'image dédiée). */
export const RELIC_GLYPH: Record<string, Glyph> = {
  talisman_vigueur: { src: syntyUrl.status('Health01'), tint: '#5fd39b' },
  idole_guerre: { src: syntyUrl.status('Attack01'), tint: '#fb7185' },
  egide_ancestrale: { src: syntyUrl.status('Armour01'), tint: '#56b6f4' },
};

/**
 * Image PLEINE COULEUR d'une relique par modèle : un artefact reconnaissable
 * (amulette / crâne / bouclier) plutôt qu'un symbole de statut.
 */
export const RELIC_IMAGE: Record<string, string> = {
  talisman_vigueur: syntyUrl.resource('ICON_SM_Item_Necklace_Flat_01'), // amulette (PV/vigueur)
  idole_guerre: syntyUrl.resource('ICON_SM_Item_Bird_Skull_01'), // crâne-idole (guerre/ATK)
  egide_ancestrale: syntyUrl.resource('ICON_SM_Item_Necklace_Flat_02'), // collier-égide (DEF)
};

/** Silhouette de gemme taillée pour les bijoux — teintée par le passif. */
export const JEWEL_GEM_MASK = syntyUrl.resource('ICON_SM_Item_Gem_01');

/**
 * Icône spéciale d'une pièce de set, par id de pièce.
 * `img: true` → sprite pleine couleur (SyntyImg) ; sinon silhouette teintée.
 * Rempli set par set au fil de la refonte des ensembles.
 */
export type SetIconDef = { src: string; tint?: string; img?: boolean };
export const SET_PIECE_ICON: Record<string, SetIconDef> = {
  // Panoplie du Colosse (lourd) — doré.
  colosse_weapon: { src: syntyUrl.weapon('ICON_SM_Wep_Hammer_06'), img: true },
  colosse_armor: { src: syntyUrl.weapon('ICON_SM_Wep_Shield_09'), img: true },
  colosse_jewel: { src: syntyUrl.inv('Necklaces01'), tint: '#f5b544' },
  colosse_relic: { src: syntyUrl.resource('ICON_SM_Item_Rock_01'), img: true },
  // Parure du Duelliste (moyen) — rouge cuivré.
  duelliste_weapon: { src: syntyUrl.weapon('ICON_SM_Wep_Sword_18'), img: true },
  duelliste_armor: { src: syntyUrl.weapon('ICON_SM_Wep_Shield_04'), img: true },
  duelliste_jewel: { src: syntyUrl.inv('Rings01'), tint: '#e07a52' },
  duelliste_relic: { src: syntyUrl.resource('ICON_SM_Item_Bracelet_03'), img: true },
  // Atours du Tacticien (léger) — cyan.
  tacticien_weapon: { src: syntyUrl.weapon('ICON_SM_Wep_Sceptre_07'), img: true },
  tacticien_armor: { src: syntyUrl.weapon('ICON_SM_Wep_Shield_03'), img: true },
  tacticien_jewel: { src: syntyUrl.inv('Necklaces01'), tint: '#56b6f4' },
  tacticien_relic: { src: syntyUrl.resource('ICON_SM_Item_Book_02'), img: true },
};

/** Icône d'une pièce de set — repli : emblème étoile doré (marque « set »). */
export function setPieceIconDef(pieceId: string): SetIconDef {
  return SET_PIECE_ICON[pieceId] ?? { src: syntyUrl.map('Star01'), tint: '#f5b544' };
}
