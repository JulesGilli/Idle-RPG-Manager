/**
 * Dashboard VISUEL autonome (sim/reports/latest.html) : graphes SVG faits main,
 * aucune dependance, aucun serveur. Double-clic -> navigateur. Theme clair/sombre.
 * Regenere a chaque `npm run sim`.
 */
import { BALANCE_TARGETS, GEAR_PROFILES, SEEDS_PER_SCENARIO, SQUAD_COMP } from './config.ts';
import type { LevelStats, TowerRun, ZoneSquadRun } from './run.ts';
import type { SpecStats } from './lab.ts';
import type { ZoneEnemyStats } from './enemyStats.ts';
import type { ReportBundle } from './report.ts';

const PROFILE_COLOR: Record<string, string> = { under: '#f59e0b', on: '#22c55e', over: '#3b82f6', set: '#a855f7' };
const PROFILE_LABEL: Record<string, string> = { under: 'Sous-equipe', on: 'Calibre', over: 'Sur-equipe', set: 'Campagne (skills+sets)' };
const ROLE_COLOR: Record<string, string> = { st: '#ef4444', aoe: '#f97316', tank: '#3b82f6', heal: '#22c55e', hybrid: '#a855f7', buff: '#eab308' };

const avg = (n: number[]) => (n.length ? n.reduce((s, x) => s + x, 0) / n.length : 0);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR');

type Series = { name: string; color: string; values: (number | null)[]; dashed?: boolean };

/* ------------------------------------------------------- LINE CHART (0..1) -- */

function lineChart(xLabels: string[], series: Series[], targetBand?: [number, number]): string {
  const W = 720, H = 300, padL = 44, padR = 16, padT = 14, padB = 38;
  const plotW = W - padL - padR, plotH = H - padT - padB, n = xLabels.length;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + (1 - v) * plotH;
  const p: string[] = [`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">`];
  if (targetBand) p.push(`<rect x="${padL}" y="${y(targetBand[1]).toFixed(1)}" width="${plotW}" height="${(y(targetBand[0]) - y(targetBand[1])).toFixed(1)}" fill="var(--band)" />`);
  for (const g of [0, 0.25, 0.5, 0.75, 1]) {
    p.push(`<line x1="${padL}" y1="${y(g).toFixed(1)}" x2="${W - padR}" y2="${y(g).toFixed(1)}" class="grid" />`);
    p.push(`<text x="${padL - 8}" y="${(y(g) + 4).toFixed(1)}" class="ylab">${Math.round(g * 100)}%</text>`);
  }
  for (let i = 0; i < n; i++) p.push(`<text x="${x(i).toFixed(1)}" y="${H - padB + 18}" class="xlab">${esc(xLabels[i]!)}</text>`);
  for (const s of series) {
    const pts = s.values.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean) as string[];
    if (pts.length > 1) p.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.5"${s.dashed ? ' stroke-dasharray="5 3"' : ''} />`);
    s.values.forEach((v, i) => { if (v != null) p.push(`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${s.color}" />`); });
  }
  p.push(`</svg>`);
  return p.join('');
}

/* ------------------------------------------------ DUAL-AXIS : bars + line -- */

function dualAxis(labels: string[], bars: number[], line: number[], barColor: string, lineColor: string): string {
  const W = 720, H = 300, padL = 52, padR = 52, padT = 14, padB = 38;
  const plotW = W - padL - padR, plotH = H - padT - padB, n = labels.length;
  const barMax = Math.max(...bars, 1), lineMax = Math.max(...line, 1);
  const bx = (i: number) => padL + (i + 0.5) * (plotW / n);
  const byBar = (v: number) => padT + (1 - v / barMax) * plotH;
  const byLine = (v: number) => padT + (1 - v / lineMax) * plotH;
  const barW = (plotW / n) * 0.6;
  const p: string[] = [`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">`];
  for (const g of [0, 0.25, 0.5, 0.75, 1]) {
    const yy = padT + (1 - g) * plotH;
    p.push(`<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" class="grid" />`);
    p.push(`<text x="${padL - 8}" y="${(yy + 4).toFixed(1)}" class="ylab" fill="${barColor}">${fmt(barMax * g)}</text>`);
    p.push(`<text x="${W - padR + 8}" y="${(yy + 4).toFixed(1)}" class="ylab" style="text-anchor:start" fill="${lineColor}">${fmt(lineMax * g)}</text>`);
  }
  labels.forEach((lb, i) => {
    p.push(`<rect x="${(bx(i) - barW / 2).toFixed(1)}" y="${byBar(bars[i]!).toFixed(1)}" width="${barW.toFixed(1)}" height="${(padT + plotH - byBar(bars[i]!)).toFixed(1)}" fill="${barColor}" opacity="0.85" rx="2" />`);
    p.push(`<text x="${bx(i).toFixed(1)}" y="${H - padB + 18}" class="xlab">${esc(lb)}</text>`);
  });
  const pts = line.map((v, i) => `${bx(i).toFixed(1)},${byLine(v).toFixed(1)}`).join(' ');
  p.push(`<polyline points="${pts}" fill="none" stroke="${lineColor}" stroke-width="2.5" />`);
  line.forEach((v, i) => p.push(`<circle cx="${bx(i).toFixed(1)}" cy="${byLine(v).toFixed(1)}" r="3" fill="${lineColor}" />`));
  p.push(`</svg>`);
  return p.join('');
}

/* ------------------------------------------------ HORIZONTAL BARS (raw) -- */

function hbarsRaw(rows: { label: string; value: number; color: string; display?: string }[]): string {
  const W = 720, rowH = 26, H = rows.length * rowH + 12, padL = 150, padR = 66;
  const plotW = W - padL - padR, max = Math.max(...rows.map((r) => r.value), 1);
  const p: string[] = [`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">`];
  rows.forEach((r, i) => {
    const yy = 6 + i * rowH;
    p.push(`<text x="${padL - 8}" y="${yy + rowH / 2}" class="hlab">${esc(r.label)}</text>`);
    p.push(`<rect x="${padL}" y="${yy + 4}" width="${plotW}" height="${rowH - 12}" class="htrack" rx="3" />`);
    p.push(`<rect x="${padL}" y="${yy + 4}" width="${(plotW * (r.value / max)).toFixed(1)}" height="${rowH - 12}" fill="${r.color}" rx="3" />`);
    p.push(`<text x="${W - padR + 8}" y="${yy + rowH / 2}" class="hval">${esc(r.display ?? fmt(r.value))}</text>`);
  });
  p.push(`</svg>`);
  return p.join('');
}

/* ---------------------------------------------------- TOWER GROUPED BARS -- */

function towerBars(tower: TowerRun[]): string {
  const W = 720, H = 320, padL = 40, padR = 16, padT = 14, padB = 52;
  const plotW = W - padL - padR, plotH = H - padT - padB, maxFloor = 100;
  const y = (v: number) => padT + (1 - v / maxFloor) * plotH;
  const classes = SQUAD_COMP, groupW = plotW / classes.length, barW = (groupW * 0.8) / GEAR_PROFILES.length;
  const p: string[] = [`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">`];
  for (const g of [0, 25, 50, 75, 100]) {
    p.push(`<line x1="${padL}" y1="${y(g).toFixed(1)}" x2="${W - padR}" y2="${y(g).toFixed(1)}" class="grid" />`);
    p.push(`<text x="${padL - 8}" y="${(y(g) + 4).toFixed(1)}" class="ylab">${g}</text>`);
  }
  classes.forEach((classId, ci) => {
    const gx = padL + ci * groupW + groupW * 0.1;
    GEAR_PROFILES.forEach((pf, pi) => {
      const run = tower.find((t) => t.profile === pf.id && t.classId === classId);
      const floor = run?.reachedFloor ?? 0, bx = gx + pi * barW, by = y(floor);
      p.push(`<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${(barW * 0.9).toFixed(1)}" height="${(padT + plotH - by).toFixed(1)}" fill="${PROFILE_COLOR[pf.id]}" rx="2" />`);
      p.push(`<text x="${(bx + barW * 0.45).toFixed(1)}" y="${(floor > 0 ? by - 4 : padT + plotH - 4).toFixed(1)}" class="barval"${floor === 0 ? ' fill="var(--muted)"' : ''}>${floor}</text>`);
    });
    p.push(`<text x="${(padL + ci * groupW + groupW / 2).toFixed(1)}" y="${H - padB + 18}" class="xlab">${classId}</text>`);
  });
  p.push(`</svg>`);
  return p.join('');
}

function legend(items: { name: string; color: string }[]): string {
  return `<div class="legend">` + items.map((i) => `<span class="lg"><span class="dot" style="background:${i.color}"></span>${esc(i.name)}</span>`).join('') + `</div>`;
}

/* ------------------------------------------------------------ DATA HELPERS -- */

function bossWin(squad: ZoneSquadRun[], profileId: string, zones: number[]): (number | null)[] {
  return zones.map((z) => {
    const run = squad.find((r) => r.profile === profileId && r.zone === z);
    const boss = run?.levels.find((l: LevelStats) => l.isBoss);
    return boss ? boss.winRate : null;
  });
}
function normalWin(squad: ZoneSquadRun[], profileId: string, zones: number[]): (number | null)[] {
  return zones.map((z) => {
    const run = squad.find((r) => r.profile === profileId && r.zone === z);
    if (!run) return null;
    const norms = run.levels.filter((l) => !l.isBoss);
    return norms.length ? avg(norms.map((l) => l.winRate)) : null;
  });
}

function specChart(specs: SpecStats[], metric: (s: SpecStats) => number, fmtVal: (v: number) => string): string {
  const rows = [...specs]
    .sort((a, b) => metric(b) - metric(a))
    .map((s) => ({ label: `${s.classId} · ${s.branch}`, value: metric(s), color: ROLE_COLOR[s.role] ?? '#64748b', display: fmtVal(metric(s)) }));
  return hbarsRaw(rows);
}

/* -------------------------------------------------------------------- PAGE -- */

export function buildHtml(b: ReportBundle, issues: string[]): string {
  const { data, squad, setSquad, tower, specMatrix, offensiveHealer, enemyStats, generatedAt } = b;
  const zones = [...new Set(squad.map((r) => r.zone))].sort((a, b) => a - b);
  const zoneLabels = zones.map((z) => `Z${z}`);

  // Boss win : forge under/on/over + campagne (set)
  const bossSeries: Series[] = [
    ...GEAR_PROFILES.map((p) => ({ name: PROFILE_LABEL[p.id]!, color: PROFILE_COLOR[p.id]!, values: bossWin(squad, p.id, zones) })),
    { name: PROFILE_LABEL.set!, color: PROFILE_COLOR.set!, values: bossWin(setSquad, 'set', zones), dashed: false },
  ];
  const normalSeries: Series[] = [
    ...GEAR_PROFILES.map((p) => ({ name: PROFILE_LABEL[p.id]!, color: PROFILE_COLOR[p.id]!, values: normalWin(squad, p.id, zones) })),
    { name: PROFILE_LABEL.set!, color: PROFILE_COLOR.set!, values: normalWin(setSquad, 'set', zones) },
  ];
  const profLegend = legend([...GEAR_PROFILES.map((p) => ({ name: PROFILE_LABEL[p.id]!, color: PROFILE_COLOR[p.id]! })), { name: PROFILE_LABEL.set!, color: PROFILE_COLOR.set! }]);

  // Contribution par classe (escouade forge calibree)
  const onRuns = squad.filter((r) => r.profile === 'on');
  const contrib = SQUAD_COMP.map((classId, i) => {
    const allyId = `${classId}-${i}`;
    const shares: number[] = [];
    for (const run of onRuns) for (const lvl of run.levels) { const pa = lvl.perAlly[allyId]; if (pa) shares.push(pa.dmgShare); }
    return { classId, dmg: avg(shares) };
  });

  const roleLegend = legend(Object.entries(ROLE_COLOR).map(([name, color]) => ({ name, color })));
  const enemyLabels = enemyStats.map((e) => `Z${e.zone}`);

  const issuesHtml = issues.length === 0
    ? `<div class="ok">✅ Aucun ecart majeur (profil calibre) vs les cibles.</div>`
    : `<ul class="issues">${issues.map((i) => `<li><span class="sev"></span>${esc(i)}</li>`).join('')}</ul>`;

  const card = (title: string, hint: string, body: string) =>
    `<div class="card"><h2>${esc(title)}</h2>${hint ? `<p class="hint">${hint}</p>` : ''}${body}</div>`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Equilibrage — Idle RPG Manager</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --fg:#0f172a; --muted:#64748b; --grid:#e6eaf0; --track:#eef2f7; --band:rgba(34,197,94,.10); --border:#e6eaf0; --warn:#b45309; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0b1220; --card:#111a2e; --fg:#e5edf7; --muted:#8aa0bd; --grid:#1e2a44; --track:#17223a; --band:rgba(34,197,94,.14); --border:#1e2a44; --warn:#fbbf24; } }
  :root[data-theme="light"] { --bg:#f6f7f9; --card:#fff; --fg:#0f172a; --muted:#64748b; --grid:#e6eaf0; --track:#eef2f7; --band:rgba(34,197,94,.10); --border:#e6eaf0; --warn:#b45309; }
  :root[data-theme="dark"] { --bg:#0b1220; --card:#111a2e; --fg:#e5edf7; --muted:#8aa0bd; --grid:#1e2a44; --track:#17223a; --band:rgba(34,197,94,.14); --border:#1e2a44; --warn:#fbbf24; }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px; background:var(--bg); color:var(--fg); font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; font-variant-numeric:tabular-nums; }
  .wrap { max-width:880px; margin:0 auto; }
  h1 { font-size:24px; margin:0 0 6px; letter-spacing:-.01em; }
  h2 { font-size:16px; margin:0 0 8px; letter-spacing:-.005em; }
  .meta { color:var(--muted); font-size:13px; margin-bottom:16px; display:flex; flex-wrap:wrap; gap:6px; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:16px 18px; margin-bottom:14px; }
  .chart { width:100%; height:auto; display:block; overflow:visible; }
  .grid { stroke:var(--grid); stroke-width:1; }
  .ylab { fill:var(--muted); font-size:11px; text-anchor:end; }
  .xlab { fill:var(--muted); font-size:11px; text-anchor:middle; }
  .barval { fill:var(--fg); font-size:10px; text-anchor:middle; font-weight:600; }
  .hlab { fill:var(--fg); font-size:11.5px; text-anchor:end; dominant-baseline:middle; }
  .hval { fill:var(--muted); font-size:11.5px; dominant-baseline:middle; font-weight:600; }
  .htrack { fill:var(--track); }
  .legend { display:flex; gap:14px; flex-wrap:wrap; margin-top:10px; font-size:12px; color:var(--muted); }
  .lg { display:inline-flex; align-items:center; gap:6px; }
  .dot { width:10px; height:10px; border-radius:3px; display:inline-block; }
  .hint { color:var(--muted); font-size:12.5px; margin:0 0 8px; max-width:66ch; }
  .issues { margin:0; padding:0; list-style:none; display:grid; gap:5px; }
  .issues li { display:flex; gap:8px; align-items:baseline; font-size:13.5px; }
  .sev { flex:0 0 auto; width:8px; height:8px; border-radius:50%; background:var(--warn,#f59e0b); margin-top:6px; }
  .ok { color:#16a34a; font-weight:600; }
  .tag { display:inline-block; background:var(--track); color:var(--muted); border-radius:6px; padding:2px 8px; font-size:12px; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  @media (max-width:640px){ .grid2 { grid-template-columns:1fr; } }
  .grid2 .card { margin-bottom:0; }
  code { background:var(--track); padding:1px 5px; border-radius:5px; font-size:12.5px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Rapport d'equilibrage</h1>
  <div class="meta">
    <span class="tag">${esc(generatedAt)}</span>
    <span class="tag">source : ${data.source === 'live' ? 'DB live' : 'snapshot'}</span>
    <span class="tag">${SEEDS_PER_SCENARIO} seeds/scenario</span>
    <span class="tag">escouade : ${SQUAD_COMP.join(', ')}</span>
  </div>

  ${card('Verdict rapide', '', issuesHtml)}

  ${card(
    'Boss de zone — taux de victoire',
    `Le graphe cle : ou la courbe casse, c'est le mur. Bande verte = cible calibree (${Math.round(BALANCE_TARGETS.onBossMinWin * 100)}–${Math.round(BALANCE_TARGETS.onBossMaxWin * 100)}%). La ligne <b>violette</b> = escouade de campagne (skills + sets), pour voir si les vrais builds passent le mur.`,
    lineChart(zoneLabels, bossSeries, [BALANCE_TARGETS.onBossMinWin, BALANCE_TARGETS.onBossMaxWin]) + profLegend,
  )}

  ${card(
    'Niveaux normaux — taux de victoire',
    `Un joueur calibre devrait rouler dessus (cible ≥ ${Math.round(BALANCE_TARGETS.onNormalMinWin * 100)}%).`,
    lineChart(zoneLabels, normalSeries, [BALANCE_TARGETS.onNormalMinWin, 1]) + profLegend,
  )}

  ${card(
    'Stats des boss par zone — PV vs ATK',
    `Barres = PV du boss (axe gauche), ligne = ATK du boss (axe droite). Si l'ATK grimpe plus vite que les PV, les boss deviennent des glass-cannons (burst qui tue vite, peu a encaisser).`,
    dualAxis(enemyLabels, enemyStats.map((e) => e.boss.hp), enemyStats.map((e) => e.boss.atk), '#3b82f6', '#ef4444') +
      legend([{ name: 'PV boss', color: '#3b82f6' }, { name: 'ATK boss', color: '#ef4444' }]),
  )}

  ${card(
    'Ratio ATK/PV du boss — trop d’attaque, pas assez de vie ?',
    `ATK du boss en % de ses PV. Si ça monte avec les zones, le combat devient une course au burst (le boss te tue avant que tu le tues). Utile pour rebalancer : baisser l'ATK ou monter les PV aplatit cette courbe.`,
    lineChart(enemyLabels, [{ name: 'ATK/PV', color: '#ef4444', values: enemyStats.map((e) => Math.min(1, e.bossAtkToHp / 0.1)) }]) +
      `<p class="hint" style="margin-top:6px">Echelle : 100% = ratio 0,10 (ATK = 10% des PV). Valeurs actuelles : ${enemyStats.map((e) => `Z${e.zone} ${(e.bossAtkToHp * 100).toFixed(1)}%`).join(' · ')}.</p>`,
  )}

  <div class="card">
    <h2>Labo — chaque classe x spe sur 4 axes</h2>
    <p class="hint">Gear identique (niv 30, endgame calibre) : seule la spe change. Barres normalisees au max de chaque axe ; couleur = role de la branche.</p>
    ${roleLegend}
    <div style="margin-top:12px"></div>
    <div class="grid2">
      ${card('DPS mono-cible (dgts/round)', '', specChart(specMatrix, (s) => s.stDps, fmt))}
      ${card('DPS AOE (dgts/round, 5 cibles)', '', specChart(specMatrix, (s) => s.aoeDps, fmt))}
    </div>
    <div style="margin-top:14px"></div>
    <div class="grid2">
      ${card('Tankiness (rounds survecus)', '', specChart(specMatrix, (s) => s.tankRounds, (v) => v.toFixed(0)))}
      ${card('Soin (HPS, soin/round)', '', specChart(specMatrix, (s) => s.hps, fmt))}
    </div>
  </div>

  ${card(
    'Soigneur offensif — set Ame Offerte (heal→degats)',
    `Reponse au "soigneur fait 0 en solo" : avec le set Ame Offerte, une partie des soins devient des degats. Voici son DPS mono avec vs sans le set (meme spe Lumiere).`,
    hbarsRaw(offensiveHealer.map((o) => ({ label: o.label.replace('Soigneur ', ''), value: o.stDps, color: '#a855f7', display: `${fmt(o.stDps)} dps` }))),
  )}

  ${card(
    'Contribution par classe — escouade calibree',
    `Part de degats infliges, moyenne toutes zones. Un DPS a ~0% est un signal.`,
    hbarsRaw(contrib.map((c) => ({ label: c.classId, value: c.dmg, color: '#8b5cf6', display: `${Math.round(c.dmg * 100)}%` }))),
  )}

  ${card(
    'Tour — etage atteint par classe',
    `Solo, heros equipe endgame. 100 = sommet. under / calibre / sur-equipe.`,
    towerBars(tower) + profLegend,
  )}

  <div class="meta" style="margin-top:4px">Genere par <code>npm run sim</code> — rejoue le vrai moteur de combat. CSV : zones / solo / tower / specs / enemies. Detail : latest.md.</div>
</div>
</body>
</html>
`;
}
