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
