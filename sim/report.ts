/**
 * Generation du rapport : Markdown lisible (sim/reports/latest.md) + CSV pour
 * Excel (sim/reports/*.csv). Le Markdown inclut un VERDICT automatique qui
 * pointe les zones/etages ou l'equilibrage s'ecarte des cibles (config.ts).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  BALANCE_TARGETS,
  GEAR_PROFILES,
  SEEDS_PER_SCENARIO,
  SQUAD_COMP,
  type ClassId,
} from './config.ts';
import type { LevelStats, TowerRun, ZoneSoloRun, ZoneSquadRun } from './run.ts';
import type { GameData } from './loadData.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = resolve(HERE, 'reports');

const pct = (x: number) => `${Math.round(x * 100)}%`;
const one = (x: number) => x.toFixed(1);

function normalLevels(levels: LevelStats[]): LevelStats[] {
  return levels.filter((l) => !l.isBoss);
}
function bossLevel(levels: LevelStats[]): LevelStats | undefined {
  return levels.find((l) => l.isBoss);
}
function avg(nums: number[]): number {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}

/* --------------------------------------------------------------- MARKDOWN -- */

export function buildMarkdown(
  data: GameData,
  squad: ZoneSquadRun[],
  solo: ZoneSoloRun[],
  tower: TowerRun[],
  generatedAt: string,
): { markdown: string; issues: string[] } {
  const L: string[] = [];
  const issues: string[] = [];

  L.push(`# Rapport d'equilibrage — Idle RPG Manager`);
  L.push('');
  L.push(`- **Genere le** : ${generatedAt}`);
  L.push(`- **Source des ennemis** : ${data.source === 'live' ? 'DB live' : 'snapshot'}`);
  L.push(`- **Combats par scenario** : ${SEEDS_PER_SCENARIO} seeds (deterministe)`);
  L.push(
    `- **Profils de stuff** : ${GEAR_PROFILES.map((p) => `${p.id} (${p.label})`).join(', ')}`,
  );
  L.push(`- **Escouade type** : ${SQUAD_COMP.join(', ')}`);
  L.push('');

  /* ---- VERDICT ---- */
  L.push(`## Verdict rapide`);
  L.push('');
  for (const run of squad.filter((r) => r.profile === 'on')) {
    const norm = normalLevels(run.levels);
    const boss = bossLevel(run.levels);
    const normWin = avg(norm.map((l) => l.winRate));
    if (normWin < BALANCE_TARGETS.onNormalMinWin) {
      const msg = `Zone ${run.zone} (${run.mapName}) : niveaux normaux trop durs pour un stuff calibre (${pct(normWin)} < ${pct(BALANCE_TARGETS.onNormalMinWin)}).`;
      issues.push(msg);
    }
    if (boss) {
      if (boss.winRate < BALANCE_TARGETS.onBossMinWin) {
        issues.push(
          `Zone ${run.zone} (${run.mapName}) : BOSS trop dur pour un stuff calibre (${pct(boss.winRate)} < ${pct(BALANCE_TARGETS.onBossMinWin)}).`,
        );
      } else if (boss.winRate > BALANCE_TARGETS.onBossMaxWin) {
        issues.push(
          `Zone ${run.zone} (${run.mapName}) : BOSS trivial pour un stuff calibre (${pct(boss.winRate)} > ${pct(BALANCE_TARGETS.onBossMaxWin)}).`,
        );
      }
    }
  }
  if (issues.length === 0) {
    L.push(`Aucun ecart majeur detecte sur le profil calibre. Courbe globalement saine.`);
  } else {
    for (const i of issues) L.push(`- ⚠️ ${i}`);
  }
  L.push('');

  /* ---- ZONES (escouade) ---- */
  L.push(`## Zones — escouade (5 heros, une de chaque classe)`);
  L.push('');
  for (const profile of GEAR_PROFILES) {
    L.push(`### Profil : ${profile.label} (${profile.id})`);
    L.push('');
    L.push(`| Zone | Niv. héros | Normaux (win%) | Boss (win%) | Boss rounds | Boss PV restants |`);
    L.push(`|------|-----------|----------------|-------------|-------------|------------------|`);
    for (const run of squad.filter((r) => r.profile === profile.id)) {
      const norm = normalLevels(run.levels);
      const boss = bossLevel(run.levels);
      const normWin = pct(avg(norm.map((l) => l.winRate)));
      const bossWin = boss ? pct(boss.winRate) : '—';
      const bossRounds = boss ? one(boss.avgRounds) : '—';
      const bossHp = boss && boss.winRate > 0 ? pct(boss.avgAllyHpPctOnWin) : '—';
      L.push(
        `| ${run.zone} ${run.mapName} | ${run.heroLevel} | ${normWin} | ${bossWin} | ${bossRounds} | ${bossHp} |`,
      );
    }
    L.push('');
  }

  /* ---- Contribution par classe (dans l'escouade, profil calibre) ---- */
  L.push(`## Contribution par classe (escouade calibree)`);
  L.push('');
  L.push(`Part de degats et taux de survie moyens sur l'ensemble des zones (profil "on").`);
  L.push('');
  L.push(`| Classe | Part de degats | Taux de survie |`);
  L.push(`|--------|----------------|----------------|`);
  const onRuns = squad.filter((r) => r.profile === 'on');
  for (let i = 0; i < SQUAD_COMP.length; i++) {
    const classId = SQUAD_COMP[i]!;
    const allyId = `${classId}-${i}`;
    const shares: number[] = [];
    const survs: number[] = [];
    for (const run of onRuns) {
      for (const lvl of run.levels) {
        const pa = lvl.perAlly[allyId];
        if (pa) {
          shares.push(pa.dmgShare);
          survs.push(pa.survival);
        }
      }
    }
    L.push(`| ${classId} | ${pct(avg(shares))} | ${pct(avg(survs))} |`);
  }
  L.push('');

  /* ---- Probe solo (puissance brute de classe) ---- */
  L.push(`## Probe solo — puissance brute par classe (profil calibre)`);
  L.push('');
  L.push(
    `Chaque classe SEULE affronte le contenu de zone (conçu pour une escouade) : ` +
      `attendez-vous a des echecs sur les boss. Utile pour comparer les classes ENTRE elles, pas comme pass/fail.`,
  );
  L.push('');
  const zones = [...new Set(solo.map((s) => s.zone))].sort((a, b) => a - b);
  L.push(`| Classe | ${zones.map((z) => `Z${z}`).join(' | ')} |`);
  L.push(`|--------|${zones.map(() => '----').join('|')}|`);
  for (const classId of SQUAD_COMP) {
    const cells = zones.map((z) => {
      const run = solo.find((s) => s.profile === 'on' && s.classId === classId && s.zone === z);
      if (!run) return '—';
      return pct(avg(run.levels.map((l) => l.winRate)));
    });
    L.push(`| ${classId} | ${cells.join(' | ')} |`);
  }
  L.push('');

  /* ---- Tour ---- */
  L.push(`## Tour — solo par classe (etage max atteint)`);
  L.push('');
  L.push(`Heros equipe endgame (zone 10). Etage moyen [min–max] sur seeds.`);
  L.push('');
  L.push(`| Classe | ${GEAR_PROFILES.map((p) => p.id).join(' | ')} |`);
  L.push(`|--------|${GEAR_PROFILES.map(() => '----').join('|')}|`);
  for (const classId of SQUAD_COMP) {
    const cells = GEAR_PROFILES.map((p) => {
      const run = tower.find((t) => t.profile === p.id && t.classId === classId);
      if (!run) return '—';
      return `${run.reachedFloor} [${run.reachedFloorMin}–${run.reachedFloorMax}]`;
    });
    L.push(`| ${classId} | ${cells.join(' | ')} |`);
  }
  L.push('');

  return { markdown: L.join('\n') + '\n', issues };
}

/* -------------------------------------------------------------------- CSV -- */

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\n') + '\n';
}

export function buildZonesCsv(squad: ZoneSquadRun[]): string {
  const rows: (string | number)[][] = [
    ['profile', 'zone', 'map', 'level_id', 'level_index', 'difficulty', 'is_boss', 'win_rate', 'avg_rounds', 'ally_hp_pct_on_win'],
  ];
  for (const run of squad) {
    for (const l of run.levels) {
      rows.push([
        run.profile,
        run.zone,
        run.mapId,
        l.levelId,
        l.levelIndex,
        l.difficulty,
        l.isBoss ? 1 : 0,
        l.winRate.toFixed(4),
        l.avgRounds.toFixed(2),
        l.avgAllyHpPctOnWin.toFixed(4),
      ]);
    }
  }
  return toCsv(rows);
}

export function buildSoloCsv(solo: ZoneSoloRun[]): string {
  const rows: (string | number)[][] = [
    ['profile', 'class', 'zone', 'map', 'level_id', 'difficulty', 'is_boss', 'win_rate', 'avg_rounds'],
  ];
  for (const run of solo) {
    for (const l of run.levels) {
      rows.push([
        run.profile,
        run.classId,
        run.zone,
        run.mapId,
        l.levelId,
        l.difficulty,
        l.isBoss ? 1 : 0,
        l.winRate.toFixed(4),
        l.avgRounds.toFixed(2),
      ]);
    }
  }
  return toCsv(rows);
}

export function buildTowerCsv(tower: TowerRun[]): string {
  const rows: (string | number)[][] = [
    ['profile', 'class', 'reached_floor', 'reached_min', 'reached_max', 'zone_reached'],
  ];
  for (const t of tower) {
    rows.push([t.profile, t.classId, t.reachedFloor, t.reachedFloorMin, t.reachedFloorMax, t.zoneReached]);
  }
  return toCsv(rows);
}

/* ------------------------------------------------------------------ WRITE -- */

export function writeReports(
  data: GameData,
  squad: ZoneSquadRun[],
  solo: ZoneSoloRun[],
  tower: TowerRun[],
  generatedAt: string,
): { issues: string[]; dir: string } {
  mkdirSync(REPORT_DIR, { recursive: true });
  const { markdown, issues } = buildMarkdown(data, squad, solo, tower, generatedAt);
  writeFileSync(resolve(REPORT_DIR, 'latest.md'), markdown);
  writeFileSync(resolve(REPORT_DIR, 'zones.csv'), buildZonesCsv(squad));
  writeFileSync(resolve(REPORT_DIR, 'solo.csv'), buildSoloCsv(solo));
  writeFileSync(resolve(REPORT_DIR, 'tower.csv'), buildTowerCsv(tower));
  return { issues, dir: REPORT_DIR };
}
