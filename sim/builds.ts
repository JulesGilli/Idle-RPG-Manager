/**
 * Catalogue des BUILDS testables :
 *  - 15 branches-spes (3 par classe) : chaque branche = ses 3 passifs maxes (15 pts)
 *    + son actif max (3) + son ultime max (2) = 20 pts (cap niv 30 = 29 pts dispo).
 *  - builds a SETS de campagne (Colosse/Duelliste/Tacticien) equipes en 4 pieces.
 *
 * Les ids de noeuds viennent directement de shared/progression/skills.ts.
 * `role` sert au tri/affichage ; les 4 axes (mono/aoe/tank/heal) sont TOUS mesures.
 */
import { craftSetPieceStats, SET_PIECES } from '../shared/progression/sets.ts';
import { FORGE_MATERIALS } from '../shared/progression/forge.ts';
import type { ClassId } from './config.ts';

export type BuildRole = 'st' | 'aoe' | 'tank' | 'heal' | 'hybrid' | 'buff';

export type BranchBuild = {
  id: string;
  classId: ClassId;
  branch: string; // nom lisible
  role: BuildRole;
  learned: Record<string, number>;
  activeId: string;
  ultimateId: string;
};

/** Construit le `learned` d'une branche pleine : 3 passifs x5, actif x3, ultime x2. */
function fullBranch(
  passives: [string, string, string],
  active: string,
  ultimate: string,
): Record<string, number> {
  return {
    [passives[0]]: 5,
    [passives[1]]: 5,
    [passives[2]]: 5,
    [active]: 3,
    [ultimate]: 2,
  };
}

function build(
  classId: ClassId,
  branch: string,
  role: BuildRole,
  passives: [string, string, string],
  active: string,
  ultimate: string,
): BranchBuild {
  return { id: `${classId}:${branch}`, classId, branch, role, learned: fullBranch(passives, active, ultimate), activeId: active, ultimateId: ultimate };
}

export const BRANCH_BUILDS: BranchBuild[] = [
  // GUERRIER
  build('guerrier', 'Meneur', 'st', ['g_men_faille', 'g_men_banniere', 'g_men_fureur'], 'g_men_assommant', 'g_men_cri'),
  build('guerrier', 'Berserker', 'st', ['g_ber_rage', 'g_ber_oeil', 'g_ber_sang'], 'g_ber_brutale', 'g_ber_execution'),
  build('guerrier', 'Rempart', 'tank', ['g_rem_parade', 'g_rem_aura', 'g_rem_contrecoup'], 'g_rem_provoc', 'g_rem_sacrifice'),
  // PALADIN
  build('paladin', 'Bastion', 'tank', ['p_bas_agro', 'p_bas_volonte', 'p_bas_ralliement'], 'p_bas_provoc', 'p_bas_rempart'),
  build('paladin', 'Aegis', 'hybrid', ['p_aeg_benediction', 'p_aeg_lumiere', 'p_aeg_resilience'], 'p_aeg_etreinte', 'p_aeg_jugement'),
  build('paladin', 'Paladin dechu', 'tank', ['p_dec_pacte', 'p_dec_regen', 'p_dec_epines'], 'p_dec_miroir', 'p_dec_vengeance'),
  // ARCHER
  build('archer', 'Vipere', 'aoe', ['a_vip_poison', 'a_vip_toxine', 'a_vip_epidemie'], 'a_vip_volee', 'a_vip_fleau'),
  build('archer', 'Tempete', 'aoe', ['a_tem_groupe', 'a_tem_rafale', 'a_tem_vent'], 'a_tem_pluie', 'a_tem_ouragan'),
  build('archer', 'Oeil de faucon', 'st', ['a_oeil_visee', 'a_oeil_faille', 'a_oeil_grace'], 'a_oeil_perforante', 'a_oeil_destin'),
  // MAGE
  build('mage', 'Brasier', 'aoe', ['m_bra_etincelle', 'm_bra_combustion', 'm_bra_surchauffe'], 'm_bra_vague', 'm_bra_cataclysme'),
  build('mage', 'Frimas', 'st', ['m_fri_morsure', 'm_fri_fragilite', 'm_fri_eclat'], 'm_fri_lance', 'm_fri_vent'),
  build('mage', 'Arcane', 'st', ['m_arc_maitrise', 'm_arc_marque', 'm_arc_surcharge'], 'm_arc_meteore', 'm_arc_aneantissement'),
  // SOIGNEUR
  build('soigneur', 'Lumiere', 'heal', ['s_lum_soin', 's_lum_grace', 's_lum_souffle'], 's_lum_rayon', 's_lum_resurrection'),
  build('soigneur', 'Benediction', 'heal', ['s_ben_benediction', 's_ben_rayonnement', 's_ben_echo'], 's_ben_vague', 's_ben_sanctuaire'),
  build('soigneur', 'Oracle', 'buff', ['s_ora_puissance', 's_ora_fermete', 's_ora_vitalite'], 's_ora_rituel', 's_ora_concert'),
];

export function branchBuildsFor(classId: ClassId): BranchBuild[] {
  return BRANCH_BUILDS.filter((b) => b.classId === classId);
}

/* --------------------------------------------------------- BUILDS A SETS -- */

/** Branche jouee en campagne par classe (le build "realiste" d'un joueur). */
export const CAMPAIGN_BRANCH: Record<ClassId, string> = {
  paladin: 'paladin:Bastion', // tank
  guerrier: 'guerrier:Berserker', // DPS bruiser
  archer: 'archer:Tempete', // AOE (groupes)
  mage: 'mage:Brasier', // AOE (groupes)
  soigneur: 'soigneur:Benediction', // soin d'equipe
};

export function campaignBuild(classId: ClassId): BranchBuild {
  return BRANCH_BUILDS.find((b) => b.id === CAMPAIGN_BRANCH[classId])!;
}

/** Set de campagne "par defaut" d'une classe (4 pieces, poids adapte). */
export const CAMPAIGN_SET: Record<ClassId, string> = {
  paladin: 'colosse', // lourd, tank-bruiser (hp_strike)
  guerrier: 'duelliste', // moyen, DPS (double_strike)
  archer: 'duelliste', // moyen, DPS (double_strike)
  mage: 'tacticien', // leger, casters (cdr)
  soigneur: 'tacticien', // leger, soins plus frequents (cdr)
};

/** Materiau de forge d'une zone (borne 1..10). */
function matForZone(zone: number) {
  const z = Math.max(1, Math.min(FORGE_MATERIALS.length, zone));
  return FORGE_MATERIALS.find((m) => m.zone === z)!;
}

/**
 * Bonus (atk/def/hp) + setIds d'un build a set 4 pieces pour (classe, zone).
 * On equipe les 4 pieces du set de campagne, forgees avec le materiau de la zone
 * (rarete ultime, cf. craftSetPieceStats). setIds = [setId x4] pour declencher
 * bonus 2 pieces + effet 4 pieces.
 */
export function setBuild(
  classId: ClassId,
  zone: number,
): { bonuses: { atk: number; def: number; hp: number }; setIds: string[] } {
  const setId = CAMPAIGN_SET[classId];
  const mat = matForZone(zone);
  const pieces = SET_PIECES.filter((p) => p.setId === setId);
  const bonuses = { atk: 0, def: 0, hp: 0 };
  for (const piece of pieces) {
    const s = craftSetPieceStats(piece, mat);
    bonuses.atk += s.atk;
    bonuses.def += s.def;
    bonuses.hp += s.hp;
  }
  return { bonuses, setIds: pieces.map(() => setId!) };
}
