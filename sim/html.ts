/**
 * Generation du tableau de bord VISUEL (sim/reports/latest.html) : un fichier
 * HTML autonome (aucune dependance, aucun serveur) avec des graphes SVG faits
 * main. Double-clic -> s'ouvre dans le navigateur. Regenere a chaque `npm run sim`.
 *
 * Theme clair/sombre automatique (prefers-color-scheme).
 */
import {
  BALANCE_TARGETS,
  GEAR_PROFILES,
  SEEDS_PER_SCENARIO,
  SQUAD_COMP,
  type ClassId,
} from './config.ts';
import type { LevelStats, TowerRun, ZoneSquadRun } from './run.ts';
import type { GameData } from './loadData.ts';

const PROFILE_COLOR: Record<string, string> = {
  under: '#f59e0b', // ambre
  on: '#22c55e', // vert
  over: '#3b82f6', // bleu
};

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ------------------------------------------------------- CHART: LINE (0..1) -- */

type Series = { name: string; color: string; values: (number | null)[] };

function lineChart(xLabels: string[], series: Series[], opts: { targetBand?: [number, number] }): string {
  const W = 720;
  const H = 320;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = xLabels.length;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + (1 - v) * plotH;

  const parts: string[] = [];
  parts.push(`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">`);

  // Bande cible (optionnelle)
  if (opts.targetBand) {
    const [lo, hi] = opts.targetBand;
    parts.push(
      `<rect x="${padL}" y="${y(hi).toFixed(1)}" width="${plotW}" height="${(y(lo) - y(hi)).toFixed(1)}" fill="var(--band)" />`,
    );
  }

  // Grille horizontale + labels Y (0,25,50,75,100 %)
  for (const g of [0, 0.25, 0.5, 0.75, 1]) {
    const yy = y(g).toFixed(1);
    parts.push(`<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" class="grid" />`);
    parts.push(`<text x="${padL - 8}" y="${(y(g) + 4).toFixed(1)}" class="ylab">${Math.round(g * 100)}%</text>`);
  }

  // Labels X
  for (let i = 0; i < n; i++) {
    parts.push(`<text x="${x(i).toFixed(1)}" y="${H - padB + 20}" class="xlab">${esc(xLabels[i]!)}</text>`);
  }

  // Series
  for (const s of series) {
    const pts: string[] = [];
    for (let i = 0; i < s.values.length; i++) {
      const v = s.values[i];
      if (v == null) continue;
      pts.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    }
    if (pts.length > 1) {
      parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.5" />`);
    }
    for (let i = 0; i < s.values.length; i++) {
      const v = s.values[i];
      if (v == null) continue;
      parts.push(`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="${s.color}" />`);
    }
  }

  parts.push(`</svg>`);
  return parts.join('');
}

/* ----------------------------------------------- CHART: GROUPED BARS (tower) -- */

function towerBars(tower: TowerRun[]): string {
  const W = 720;
  const H = 340;
  const padL = 40;
  const padR = 16;
  const padT = 16;
  const padB = 54;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxFloor = 100;
  const y = (v: number) => padT + (1 - v / maxFloor) * plotH;

  const classes = SQUAD_COMP;
  const groupW = plotW / classes.length;
  const barW = (groupW * 0.8) / GEAR_PROFILES.length;

  const parts: string[] = [];
  parts.push(`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">`);

  for (const g of [0, 25, 50, 75, 100]) {
    const yy = y(g).toFixed(1);
    parts.push(`<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" class="grid" />`);
    parts.push(`<text x="${padL - 8}" y="${(y(g) + 4).toFixed(1)}" class="ylab">${g}</text>`);
  }

  classes.forEach((classId, ci) => {
    const gx = padL + ci * groupW + groupW * 0.1;
    GEAR_PROFILES.forEach((p, pi) => {
      const run = tower.find((t) => t.profile === p.id && t.classId === classId);
      const floor = run?.reachedFloor ?? 0;
      const bx = gx + pi * barW;
      const by = y(floor);
      const bh = padT + plotH - by;
      parts.push(
        `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${(barW * 0.9).toFixed(1)}" height="${bh.toFixed(1)}" fill="${PROFILE_COLOR[p.id]}" rx="2" />`,
      );
      if (floor > 0) {
        parts.push(
          `<text x="${(bx + barW * 0.45).toFixed(1)}" y="${(by - 4).toFixed(1)}" class="barval">${floor}</text>`,
        );
      }
    });
    parts.push(
      `<text x="${(padL + ci * groupW + groupW / 2).toFixed(1)}" y="${H - padB + 20}" class="xlab">${classId}</text>`,
    );
  });

  parts.push(`</svg>`);
  return parts.join('');
}

/* ------------------------------------------------- CHART: HORIZONTAL BARS -- */

function hbars(rows: { label: string; value: number; color: string }[]): string {
  const W = 720;
  const rowH = 34;
  const H = rows.length * rowH + 16;
  const padL = 90;
  const padR = 60;
  const plotW = W - padL - padR;
  const parts: string[] = [`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">`];
  rows.forEach((r, i) => {
    const yy = 8 + i * rowH;
    parts.push(`<text x="${padL - 10}" y="${yy + rowH / 2}" class="hlab">${esc(r.label)}</text>`);
    parts.push(`<rect x="${padL}" y="${yy + 6}" width="${plotW}" height="${rowH - 16}" class="htrack" rx="4" />`);
    parts.push(
      `<rect x="${padL}" y="${yy + 6}" width="${(plotW * r.value).toFixed(1)}" height="${rowH - 16}" fill="${r.color}" rx="4" />`,
    );
    parts.push(`<text x="${W - padR + 8}" y="${yy + rowH / 2}" class="hval">${Math.round(r.value * 100)}%</text>`);
  });
  parts.push(`</svg>`);
  return parts.join('');
}

function legend(items: { name: string; color: string }[]): string {
  return (
    `<div class="legend">` +
    items
      .map((i) => `<span class="lg"><span class="dot" style="background:${i.color}"></span>${esc(i.name)}</span>`)
      .join('') +
    `</div>`
  );
}

/* -------------------------------------------------------------------- PAGE -- */

function bossWinByZone(squad: ZoneSquadRun[], profileId: string, zones: number[]): (number | null)[] {
  return zones.map((z) => {
    const run = squad.find((r) => r.profile === profileId && r.zone === z);
    const boss = run?.levels.find((l: LevelStats) => l.isBoss);
    return boss ? boss.winRate : null;
  });
}
function normalWinByZone(squad: ZoneSquadRun[], profileId: string, zones: number[]): (number | null)[] {
  return zones.map((z) => {
    const run = squad.find((r) => r.profile === profileId && r.zone === z);
    if (!run) return null;
    const norms = run.levels.filter((l) => !l.isBoss);
    return norms.length ? avg(norms.map((l) => l.winRate)) : null;
  });
}

export function buildHtml(
  data: GameData,
  squad: ZoneSquadRun[],
  tower: TowerRun[],
  issues: string[],
  generatedAt: string,
): string {
  const zones = [...new Set(squad.map((r) => r.zone))].sort((a, b) => a - b);
  const zoneLabels = zones.map((z) => `Z${z}`);
  const profileSeries = (fn: typeof bossWinByZone): Series[] =>
    GEAR_PROFILES.map((p) => ({ name: p.label, color: PROFILE_COLOR[p.id]!, values: fn(squad, p.id, zones) }));

  // Contribution par classe (escouade calibree)
  const onRuns = squad.filter((r) => r.profile === 'on');
  const contrib = SQUAD_COMP.map((classId: ClassId, i) => {
    const allyId = `${classId}-${i}`;
    const shares: number[] = [];
    const survs: number[] = [];
    for (const run of onRuns)
      for (const lvl of run.levels) {
        const pa = lvl.perAlly[allyId];
        if (pa) {
          shares.push(pa.dmgShare);
          survs.push(pa.survival);
        }
      }
    return { classId, dmg: avg(shares), surv: avg(survs) };
  });

  const legendProfiles = legend(GEAR_PROFILES.map((p) => ({ name: p.label, color: PROFILE_COLOR[p.id]! })));

  const issuesHtml =
    issues.length === 0
      ? `<div class="ok">✅ Aucun ecart majeur (profil calibre) vs les cibles.</div>`
      : `<ul class="issues">${issues.map((i) => `<li>⚠️ ${esc(i)}</li>`).join('')}</ul>`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Equilibrage — Idle RPG Manager</title>
<style>
  :root {
    --bg: #f8fafc; --card: #ffffff; --fg: #0f172a; --muted: #64748b;
    --grid: #e2e8f0; --track: #eef2f7; --band: rgba(34,197,94,.10); --border: #e2e8f0;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0b1220; --card:#111a2e; --fg:#e5edf7; --muted:#8aa0bd;
      --grid:#1e2a44; --track:#17223a; --band:rgba(34,197,94,.14); --border:#1e2a44; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px; background:var(--bg); color:var(--fg);
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .wrap { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 17px; margin: 28px 0 10px; }
  .meta { color: var(--muted); font-size: 13px; margin-bottom: 16px; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:14px;
    padding:16px 18px; margin-bottom:16px; }
  .chart { width:100%; height:auto; display:block; }
  .grid { stroke: var(--grid); stroke-width:1; }
  .ylab { fill: var(--muted); font-size:11px; text-anchor:end; }
  .xlab { fill: var(--muted); font-size:11px; text-anchor:middle; }
  .barval { fill: var(--fg); font-size:10px; text-anchor:middle; }
  .hlab { fill: var(--fg); font-size:12px; text-anchor:end; dominant-baseline:middle; }
  .hval { fill: var(--muted); font-size:12px; dominant-baseline:middle; }
  .htrack { fill: var(--track); }
  .legend { display:flex; gap:16px; flex-wrap:wrap; margin-top:8px; font-size:12px; color:var(--muted); }
  .lg { display:inline-flex; align-items:center; gap:6px; }
  .dot { width:10px; height:10px; border-radius:3px; display:inline-block; }
  .hint { color:var(--muted); font-size:12.5px; margin:0 0 6px; }
  .issues { margin:0; padding-left:20px; }
  .issues li { margin:3px 0; }
  .ok { color:#16a34a; font-weight:600; }
  .tag { display:inline-block; background:var(--track); color:var(--muted);
    border-radius:6px; padding:2px 8px; font-size:12px; margin-right:6px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Rapport d'equilibrage</h1>
  <div class="meta">
    <span class="tag">${esc(generatedAt)}</span>
    <span class="tag">source: ${data.source === 'live' ? 'DB live' : 'snapshot'}</span>
    <span class="tag">${SEEDS_PER_SCENARIO} seeds/scenario</span>
    <span class="tag">escouade: ${SQUAD_COMP.join(', ')}</span>
  </div>

  <div class="card">
    <h2 style="margin-top:0">Verdict rapide</h2>
    ${issuesHtml}
  </div>

  <div class="card">
    <h2 style="margin-top:0">Boss de zone — taux de victoire</h2>
    <p class="hint">Le graph cle : ou la courbe casse, c'est le mur. Bande verte = cible pour un stuff calibre (${Math.round(
      BALANCE_TARGETS.onBossMinWin * 100,
    )}–${Math.round(BALANCE_TARGETS.onBossMaxWin * 100)}%).</p>
    ${lineChart(zoneLabels, profileSeries(bossWinByZone), { targetBand: [BALANCE_TARGETS.onBossMinWin, BALANCE_TARGETS.onBossMaxWin] })}
    ${legendProfiles}
  </div>

  <div class="card">
    <h2 style="margin-top:0">Niveaux normaux — taux de victoire</h2>
    <p class="hint">Un joueur calibre devrait rouler dessus (cible ≥ ${Math.round(
      BALANCE_TARGETS.onNormalMinWin * 100,
    )}%).</p>
    ${lineChart(zoneLabels, profileSeries(normalWinByZone), { targetBand: [BALANCE_TARGETS.onNormalMinWin, 1] })}
    ${legendProfiles}
  </div>

  <div class="card">
    <h2 style="margin-top:0">Tour — etage atteint par classe</h2>
    <p class="hint">Solo, heros equipe endgame. 100 = sommet. under / calibre / sur-equipe.</p>
    ${towerBars(tower)}
    ${legendProfiles}
  </div>

  <div class="card">
    <h2 style="margin-top:0">Contribution par classe (escouade calibree)</h2>
    <p class="hint">Part de degats infliges — un DPS a ~0% est un signal.</p>
    ${hbars(contrib.map((c) => ({ label: c.classId, value: c.dmg, color: '#8b5cf6' })))}
    <p class="hint" style="margin-top:12px">Taux de survie</p>
    ${hbars(contrib.map((c) => ({ label: c.classId, value: c.surv, color: '#06b6d4' })))}
  </div>

  <div class="meta">Genere par <code>npm run sim</code>. Donnees brutes : zones.csv / solo.csv / tower.csv. Details : latest.md.</div>
</div>
</body>
</html>
`;
}
