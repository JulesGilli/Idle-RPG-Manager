/**
 * Helpers pour les assets UI Synty « Fantasy Warrior ».
 * Les PNG sont servis statiquement depuis public/synty/Sprites/… (URL absolues).
 * On ne touche à aucune logique de jeu : ce module ne fait que construire des URLs.
 */
const BASE = '/synty/Sprites';

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

/** Icône pleine couleur représentant un modèle de forge (FORGE_BASES). */
export const FORGE_BASE_WEAPON: Record<string, string> = {
  grande_epee: 'ICON_SM_Wep_Sword_02',
  epee: 'ICON_SM_Wep_Sword_01',
  dague: 'ICON_SM_Wep_Dagger_01',
  marteau: 'ICON_SM_Wep_Hammer_01',
  sceptre: 'ICON_SM_Wep_Sceptre_01',
  arc: 'ICON_SM_Prop_Bow_01',
  plaques: 'ICON_SM_Wep_Shield_01',
  mailles: 'ICON_SM_Wep_Shield_02',
  tunique: 'ICON_SM_Wep_Shield_03',
};

export function forgeBaseUrl(baseId: string): string {
  return syntyUrl.weapon(FORGE_BASE_WEAPON[baseId] ?? 'ICON_SM_Wep_Sword_01');
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
  // Legacy
  iron: res('ICON_SM_Item_Ingot_Iron_01'),
  essence: res('ICON_SM_Item_Crystal_03'),
};

export function resourceIcon(key: string): ResourceGlyph | null {
  return RESOURCE_ICON[key] ?? null;
}

/** Silhouette d'arme (calque Clean, teintable) représentant chaque classe. */
export const CLASS_WEAPON_CLEAN: Record<string, string> = {
  guerrier: 'ICON_SM_Wep_Sword_01_Clean',
  archer: 'ICON_SM_Prop_Bow_01_Clean',
  mage: 'ICON_SM_Wep_Staff_01_Clean',
  paladin: 'ICON_SM_Wep_Shield_01_Clean',
  soigneur: 'ICON_SM_Wep_Sceptre_01_Clean',
};

/** URL de la silhouette d'arme (Clean) d'une classe, à teinter par sa couleur d'accent. */
export function classWeaponCleanUrl(classId: string): string {
  return syntyUrl.weapon(CLASS_WEAPON_CLEAN[classId] ?? 'ICON_SM_Wep_Sword_01_Clean');
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
} as const;

/** Icône (Clean, teintable) pour chaque stat de héros. */
export const STAT_GLYPH: Record<'hp' | 'atk' | 'def' | 'speed', string> = {
  hp: syntyUrl.stat('Health01'),
  atk: syntyUrl.stat('Strength01'),
  def: syntyUrl.status('Defense01'),
  speed: syntyUrl.stat('Speed01'),
};

/** Icône (Clean, teintable) pour chaque statut de combat. */
export const STATUS_GLYPH: Record<string, string> = {
  poison: syntyUrl.status('Poisoned01'),
  burn: syntyUrl.status('Burninating01'),
  stun: syntyUrl.status('Shocked01'),
  weaken: syntyUrl.status('DefenseDown01'),
};

/**
 * Icône Synty (teintée) par nœud d'arbre de compétence, par id de nœud.
 * Purement cosmétique/front — ne modifie PAS la data `/shared` (l'emoji du nœud
 * reste le repli pour les effets sans équivalent Synty : épines, esquive, AOE…).
 */
export const SKILL_NODE_GLYPH: Record<string, { src: string; color: string }> = {
  // Guerrier
  g_penetration: { src: syntyUrl.status('DefenseBroken01'), color: '#f0934a' },
  g_entaille: { src: syntyUrl.status('DefenseDown01'), color: '#c084fc' },
  g_execution: { src: syntyUrl.status('Dead01'), color: '#f87171' },
  g_rage: { src: syntyUrl.status('AttackUp01'), color: '#fb7185' },
  g_soif: { src: syntyUrl.status('Bleeding01'), color: '#fb7185' },
  g_epines: { src: syntyUrl.status('Cursed01'), color: '#94a3b8' },
  g_broyeur: { src: syntyUrl.status('AttackBroken01'), color: '#f5b544' },
  // Archer
  a_poison: { src: syntyUrl.status('Poisoned01'), color: '#8ade8a' },
  a_venin: { src: syntyUrl.status('Poisoned01'), color: '#5fd39b' },
  a_toxine: { src: syntyUrl.status('Poisoned01'), color: '#f5b544' },
  a_affaiblir: { src: syntyUrl.status('AttackDown01'), color: '#c084fc' },
  a_precision: { src: syntyUrl.status('Critical01'), color: '#f5b544' },
  a_volee: { src: syntyUrl.status('Targeted01'), color: '#56b6f4' },
  a_pluie: { src: syntyUrl.status('Poisoned01'), color: '#8ade8a' },
  // Mage
  m_embrasement: { src: syntyUrl.status('Burninating01'), color: '#fb923c' },
  m_combustion: { src: syntyUrl.status('Burninating01'), color: '#f97316' },
  m_immolation: { src: syntyUrl.status('Burninating01'), color: '#f5b544' },
  m_givre: { src: syntyUrl.status('Cold01'), color: '#7dd3fc' },
  m_bouclier: { src: syntyUrl.status('Armour01'), color: '#56b6f4' },
  m_mirage: { src: syntyUrl.status('Wet01'), color: '#94a3b8' },
  m_deflagration: { src: syntyUrl.status('Burninating01'), color: '#fb7185' },
  // Paladin
  p_ferveur: { src: syntyUrl.status('FortifiedHealth01'), color: '#5fd39b' },
  p_zele: { src: syntyUrl.status('Bleeding01'), color: '#f5b544' },
  p_renaissance: { src: syntyUrl.status('Up01'), color: '#ffd27a' },
  p_egide: { src: syntyUrl.status('Armour01'), color: '#56b6f4' },
  p_represailles: { src: syntyUrl.status('Cursed01'), color: '#94a3b8' },
  p_riposte: { src: syntyUrl.status('AttackDown01'), color: '#c084fc' },
  p_jugement: { src: syntyUrl.status('Shocked01'), color: '#facc15' },
  // Soigneur
  s_regen: { src: syntyUrl.status('Health01'), color: '#5fd39b' },
  s_egide: { src: syntyUrl.status('Armour01'), color: '#56b6f4' },
  s_intervention: { src: syntyUrl.status('Up01'), color: '#ffd27a' },
  s_grace: { src: syntyUrl.status('SpeedUp01'), color: '#5fd39b' },
  s_chatiment: { src: syntyUrl.status('AttackDown01'), color: '#c084fc' },
  s_drain: { src: syntyUrl.status('Bleeding01'), color: '#c084fc' },
  s_nova: { src: syntyUrl.status('Critical01'), color: '#ffd27a' },
};

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
  craft: { src: syntyUrl.inv('Hammers01') },
  forge: { src: syntyUrl.inv('Crafting01') },
  refine: { src: syntyUrl.inv('Minerals01'), tint: '#60a5fa' },
  jewel: { src: syntyUrl.inv('Rings01') },
  relic: { src: syntyUrl.inv('Magic01'), tint: '#c084fc' },
  book: { src: syntyUrl.inv('Spellbooks01') },
  map: { src: syntyUrl.map('Quest01') },
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
  guild: { src: syntyUrl.map('Flag01') },
  raid: { src: syntyUrl.map('Dragon01') },
  join: { src: syntyUrl.status('Up01'), tint: '#5fd39b' },
  leave: { src: syntyUrl.status('Down01'), tint: '#94a3b8' },
  promote: { src: syntyUrl.status('Up01'), tint: '#5fd39b' },
  demote: { src: syntyUrl.status('Down01'), tint: '#fb7185' },
  kick: { src: syntyUrl.status('Dead01'), tint: '#fb7185' },
  warning: { src: syntyUrl.status('Cursed01'), tint: '#fb7185' },
  auto: { src: syntyUrl.inv('Crafting01') },
  next: { src: syntyUrl.status('Up01'), tint: '#c084fc' },
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

/** Modèle de relique → glyphe de statut Synty. */
export const RELIC_GLYPH: Record<string, Glyph> = {
  talisman_vigueur: { src: syntyUrl.status('Health01'), tint: '#5fd39b' },
  idole_guerre: { src: syntyUrl.status('Attack01'), tint: '#fb7185' },
  egide_ancestrale: { src: syntyUrl.status('Armour01'), tint: '#56b6f4' },
};
