/**
 * Extraction des stats d'ennemis par zone, pour VISUALISER la courbe de
 * difficulte (pas de simulation ici — c'est de la data brute + metriques
 * derivees). Permet de voir d'un coup la progression HP/ATK/DEF des boss et
 * des monstres, et de tester l'hypothese "les boss ont trop d'ATK, pas assez de PV".
 */
import { scaleNormalMonster } from '../shared/combat/difficulty.ts';
import type { CombatantInput } from '../shared/combat/types.ts';
import type { GameData, LevelRow } from './loadData.ts';
import { levelsByMap } from './loadData.ts';

export type ZoneEnemyStats = {
  zone: number;
  mapId: string;
  mapName: string;
  difficultyBoss: number;
  boss: { hp: number; atk: number; def: number; armor: number };
  /** Monstre normal representatif (dernier niveau normal), stats DESIGN (avant scaling). */
  normalRaw: { hp: number; atk: number; def: number; armor: number };
  /** Le meme monstre APRES le scaling applique en jeu (scaleNormalMonster). */
  normalScaled: { hp: number; atk: number; def: number; armor: number };
  /** ATK du boss en % de ses PV : proxy "burst vs encaisse" (haut = boss glass-cannon). */
  bossAtkToHp: number;
};

function firstEnemy(level: LevelRow): CombatantInput | undefined {
  const e = level.enemy_config.enemies[0];
  if (!e) return undefined;
  return { id: 'x', name: e.name, role: 'enemy', hp: e.hp, atk: e.atk, def: e.def, speed: e.speed, armor: e.armor };
}

export function zoneEnemyStats(data: GameData): ZoneEnemyStats[] {
  const byMap = levelsByMap(data);
  const out: ZoneEnemyStats[] = [];

  for (const map of data.maps) {
    const levels = byMap.get(map.id) ?? [];
    const bossLvl = levels.find((l) => l.is_boss);
    const normals = levels.filter((l) => !l.is_boss);
    const lastNormal = normals[normals.length - 1];
    if (!bossLvl || !lastNormal) continue;

    const bossE = firstEnemy(bossLvl)!;
    const normE = firstEnemy(lastNormal)!;
    const scaled = scaleNormalMonster(normE);

    out.push({
      zone: map.sort,
      mapId: map.id,
      mapName: map.name,
      difficultyBoss: bossLvl.difficulty,
      boss: { hp: bossE.hp, atk: bossE.atk, def: bossE.def, armor: bossE.armor ?? 0 },
      normalRaw: { hp: normE.hp, atk: normE.atk, def: normE.def, armor: normE.armor ?? 0 },
      normalScaled: { hp: scaled.hp, atk: scaled.atk, def: scaled.def, armor: scaled.armor ?? 0 },
      bossAtkToHp: bossE.hp > 0 ? bossE.atk / bossE.hp : 0,
    });
  }

  out.sort((a, b) => a.zone - b.zone);
  return out;
}
