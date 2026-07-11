/**
 * Generation des rapports : dashboard visuel HTML (latest.html), Markdown
 * (latest.md, versionne = baseline), et CSV bruts pour Excel. Le Markdown porte
 * un VERDICT automatique (ecarts vs cibles de config.ts).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { BALANCE_TARGETS, GEAR_PROFILES, SEEDS_PER_SCENARIO, SQUAD_COMP } from './config.ts';
import type { LevelStats, TowerRun, ZoneSoloRun, ZoneSquadRun } from './run.ts';
import type { SpecStats } from './lab.ts';
import type { ZoneEnemyStats } from './enemyStats.ts';
import type { GameData } from './loadData.ts';
import { buildHtml } from './html.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = resolve(HERE, 'reports');

export type ReportBundle = {
  data: GameData;
  squad: ZoneSquadRun[]; // forge under/on/over, sans skills
  setSquad: ZoneSquadRun[]; // campagne : skills + sets
  solo: ZoneSoloRun[];
  tower: TowerRun[];
  specMatrix: SpecStats[];
  offensiveHealer: { label: string; stDps: number; hps: number; tankRounds: number }[];
  enemyStats: ZoneEnemyStats[];
  generatedAt: string;
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const one = (x: number) => x.toFixed(1);
const round = (x: number) => Math.round(x).toLocaleString('fr-FR');

function normalLevels(levels: LevelStats[]): LevelStats[] {
  return levels.filter((l) => !l.isBoss);
}
function bossLevel(levels: LevelStats[]): LevelStats | undefined {
  return levels.find((l) => l.isBoss);
}
function avg(nums: number[]): number {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}

/* --------------------------------------------------------------- VERDICT -- */

function computeIssues(squad: ZoneSquadRun[]): string[] {
  const issues: string[] = [];
  for (const run of squad.filter((r) => r.profile === 'on')) {
    const norm = normalLevels(run.levels);
    const boss = bossLevel(run.levels);
    const normWin = avg(norm.map((l) => l.winRate));
    if (normWin < BALANCE_TARGETS.onNormalMinWin) {
      issues.push(`Zone ${run.zone} (${run.mapName}) : niveaux normaux trop durs pour un stuff calibre (${pct(normWin)} < ${pct(BALANCE_TARGETS.onNormalMinWin)}).`);
    }
    if (boss) {
      if (boss.winRate < BALANCE_TARGETS.onBossMinWin) {
        issues.push(`Zone ${run.zone} (${run.mapName}) : BOSS trop dur pour un stuff calibre (${pct(boss.winRate)} < ${pct(BALANCE_TARGETS.onBossMinWin)}).`);
      } else if (boss.winRate > BALANCE_TARGETS.onBossMaxWin) {
        issues.push(`Zone ${run.zone} (${run.mapName}) : BOSS trivial pour un stuff calibre (${pct(boss.winRate)} > ${pct(BALANCE_TARGETS.onBossMaxWin)}).`);
      }
    }
  }
  return issues;
}

/* --------------------------------------------------------------- MARKDOWN -- */

function zoneTable(L: string[], runs: ZoneSquadRun[]): void {
  L.push(`| Zone | Niv. | Normaux | Boss | Boss rounds | Boss PV rest. |`);
  L.push(`|------|------|---------|------|-------------|---------------|`);
  for (const run of runs) {
    const norm = normalLevels(run.levels);
    const boss = bossLevel(run.levels);
    const bw = boss ? pct(boss.winRate) : '—';
    const br = boss ? one(boss.avgRounds) : '—';
    const bh = boss && boss.winRate > 0 ? pct(boss.avgAllyHpPctOnWin) : '—';
    L.push(`| ${run.zone} ${run.mapName} | ${run.heroLevel} | ${pct(avg(norm.map((l) => l.winRate)))} | ${bw} | ${br} | ${bh} |`);
  }
  L.push('');
}

function buildMarkdown(b: ReportBundle, issues: string[]): string {
  const L: string[] = [];
  L.push(`# Rapport d'equilibrage — Idle RPG Manager`);
  L.push('');
  L.push(`- **Genere le** : ${b.generatedAt}`);
  L.push(`- **Source** : ${b.data.source === 'live' ? 'DB live' : 'snapshot'}`);
  L.push(`- **Combats/scenario** : ${SEEDS_PER_SCENARIO} seeds (deterministe)`);
  L.push(`- **Escouade** : ${SQUAD_COMP.join(', ')}`);
  L.push('');

  L.push(`## Verdict rapide`);
  L.push('');
  if (issues.length === 0) L.push(`Aucun ecart majeur (profil calibre). Courbe saine.`);
  else for (const i of issues) L.push(`- ⚠️ ${i}`);
  L.push('');

  L.push(`## Zones — escouade forge (sans skills)`);
  L.push('');
  for (const profile of GEAR_PROFILES) {
    L.push(`### ${profile.label} (${profile.id})`);
    L.push('');
    zoneTable(L, b.squad.filter((r) => r.profile === profile.id));
  }

  L.push(`## Zones — escouade CAMPAGNE (skills + sets 4 pieces)`);
  L.push('');
  L.push(`La difficulte est calibree pour ces builds. A comparer au forge calibre ci-dessus.`);
  L.push('');
  zoneTable(L, b.setSquad);

  L.push(`## Labo — matrice classe x spe (gear identique, niv 30)`);
  L.push('');
  L.push(`DPS mono/AOE = degats infliges par round. Tank = rounds survecus (attaquants standard). HPS = soin/round.`);
  L.push('');
  L.push(`| Classe | Branche | Role | DPS mono | DPS AOE | Tank (rounds) | HPS |`);
  L.push(`|--------|---------|------|----------|---------|---------------|-----|`);
  for (const s of b.specMatrix) {
    L.push(`| ${s.classId} | ${s.branch} | ${s.role} | ${round(s.stDps)} | ${round(s.aoeDps)} | ${one(s.tankRounds)} | ${round(s.hps)} |`);
  }
  L.push('');

  L.push(`## Soigneur offensif (set Ame Offerte = heal→degats)`);
  L.push('');
  L.push(`| Build | DPS mono | HPS | Tank (rounds) |`);
  L.push(`|-------|----------|-----|---------------|`);
  for (const o of b.offensiveHealer) {
    L.push(`| ${o.label} | ${round(o.stDps)} | ${round(o.hps)} | ${one(o.tankRounds)} |`);
  }
  L.push('');

  L.push(`## Stats des ennemis par zone (courbe de difficulte)`);
  L.push('');
  L.push(`| Zone | Diff. | Boss PV | Boss ATK | Boss DEF | ATK/PV boss | Mob PV (design) | Mob PV (jeu) | Mob ATK (jeu) |`);
  L.push(`|------|-------|---------|----------|----------|-------------|-----------------|--------------|---------------|`);
  for (const e of b.enemyStats) {
    L.push(`| ${e.zone} ${e.mapName} | ${e.difficultyBoss} | ${round(e.boss.hp)} | ${round(e.boss.atk)} | ${round(e.boss.def)} | ${(e.bossAtkToHp * 100).toFixed(1)}% | ${round(e.normalRaw.hp)} | ${round(e.normalScaled.hp)} | ${round(e.normalScaled.atk)} |`);
  }
  L.push('');

  return L.join('\n') + '\n';
}

/* -------------------------------------------------------------------- CSV -- */

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\n') + '\n';
}

function buildZonesCsv(all: ZoneSquadRun[]): string {
  const rows: (string | number)[][] = [
    ['profile', 'zone', 'map', 'level_id', 'level_index', 'difficulty', 'is_boss', 'win_rate', 'avg_rounds', 'ally_hp_pct_on_win'],
  ];
  for (const run of all)
    for (const l of run.levels)
      rows.push([run.profile, run.zone, run.mapId, l.levelId, l.levelIndex, l.difficulty, l.isBoss ? 1 : 0, l.winRate.toFixed(4), l.avgRounds.toFixed(2), l.avgAllyHpPctOnWin.toFixed(4)]);
  return toCsv(rows);
}
function buildSoloCsv(solo: ZoneSoloRun[]): string {
  const rows: (string | number)[][] = [['profile', 'class', 'zone', 'map', 'level_id', 'difficulty', 'is_boss', 'win_rate', 'avg_rounds']];
  for (const run of solo)
    for (const l of run.levels)
      rows.push([run.profile, run.classId, run.zone, run.mapId, l.levelId, l.difficulty, l.isBoss ? 1 : 0, l.winRate.toFixed(4), l.avgRounds.toFixed(2)]);
  return toCsv(rows);
}
function buildTowerCsv(tower: TowerRun[]): string {
  const rows: (string | number)[][] = [['profile', 'class', 'reached_floor', 'reached_min', 'reached_max', 'zone_reached']];
  for (const t of tower) rows.push([t.profile, t.classId, t.reachedFloor, t.reachedFloorMin, t.reachedFloorMax, t.zoneReached]);
  return toCsv(rows);
}
function buildSpecsCsv(specs: SpecStats[]): string {
  const rows: (string | number)[][] = [['class', 'branch', 'role', 'st_dps', 'aoe_dps', 'tank_rounds', 'hps']];
  for (const s of specs) rows.push([s.classId, s.branch, s.role, s.stDps.toFixed(1), s.aoeDps.toFixed(1), s.tankRounds.toFixed(1), s.hps.toFixed(1)]);
  return toCsv(rows);
}
function buildEnemiesCsv(e: ZoneEnemyStats[]): string {
  const rows: (string | number)[][] = [
    ['zone', 'map', 'difficulty', 'boss_hp', 'boss_atk', 'boss_def', 'boss_armor', 'boss_atk_to_hp', 'mob_hp_design', 'mob_atk_design', 'mob_hp_ingame', 'mob_atk_ingame'],
  ];
  for (const z of e)
    rows.push([z.zone, z.mapId, z.difficultyBoss, z.boss.hp, z.boss.atk, z.boss.def, z.boss.armor, z.bossAtkToHp.toFixed(4), z.normalRaw.hp, z.normalRaw.atk, z.normalScaled.hp, z.normalScaled.atk]);
  return toCsv(rows);
}

/* ------------------------------------------------------------------ WRITE -- */

export function writeReports(b: ReportBundle): { issues: string[]; dir: string } {
  mkdirSync(REPORT_DIR, { recursive: true });
  const issues = computeIssues(b.squad);
  writeFileSync(resolve(REPORT_DIR, 'latest.md'), buildMarkdown(b, issues));
  writeFileSync(resolve(REPORT_DIR, 'latest.html'), buildHtml(b, issues));
  writeFileSync(resolve(REPORT_DIR, 'zones.csv'), buildZonesCsv([...b.squad, ...b.setSquad]));
  writeFileSync(resolve(REPORT_DIR, 'solo.csv'), buildSoloCsv(b.solo));
  writeFileSync(resolve(REPORT_DIR, 'tower.csv'), buildTowerCsv(b.tower));
  writeFileSync(resolve(REPORT_DIR, 'specs.csv'), buildSpecsCsv(b.specMatrix));
  writeFileSync(resolve(REPORT_DIR, 'enemies.csv'), buildEnemiesCsv(b.enemyStats));
  return { issues, dir: REPORT_DIR };
}
