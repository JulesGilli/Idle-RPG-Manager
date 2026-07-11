/**
 * Point d'entree du banc de test d'equilibrage.
 *
 *   npm run sim                     # passe complete -> sim/reports/latest.html + .md + CSV
 *   npm run sim -- --refresh-snapshot   # regenere le snapshot depuis la DB (service key requise)
 *
 * Chaque combat rejoue le VRAI moteur du jeu (resolveCombat), donc le rapport
 * reflete exactement la prod. Deterministe : deux passes identiques = memes chiffres.
 */
import { loadGameData, refreshSnapshot } from './loadData.ts';
import { runTower, runZonesSetBuild, runZonesSolo, runZonesSquad } from './run.ts';
import { runOffensiveHealer, runSpecMatrix } from './lab.ts';
import { zoneEnemyStats } from './enemyStats.ts';
import { writeReports } from './report.ts';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--refresh-snapshot')) {
    await refreshSnapshot();
    return;
  }

  const forceSnapshot = args.includes('--snapshot');
  const t0 = Date.now();
  const data = await loadGameData({ forceSnapshot });
  console.log(
    `[sim] Donnees chargees (${data.source}) : ${Object.keys(data.heroClasses).length} classes, ${data.maps.length} zones, ${data.levels.length} niveaux.`,
  );

  console.log('[sim] Zones — escouade (forge, sans skills)...');
  const squad = runZonesSquad(data);
  console.log('[sim] Zones — escouade campagne (skills + sets)...');
  const setSquad = runZonesSetBuild(data);
  console.log('[sim] Zones — probe solo...');
  const solo = runZonesSolo(data);
  console.log('[sim] Tour — solo par classe...');
  const tower = runTower(data);
  console.log('[sim] Labo — matrice classe x spe (mono/aoe/tank/heal)...');
  const specMatrix = runSpecMatrix(data);
  const offensiveHealer = runOffensiveHealer(data);
  console.log('[sim] Stats des ennemis par zone...');
  const enemyStats = zoneEnemyStats(data);

  const generatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const { issues, dir } = writeReports({
    data,
    squad,
    setSquad,
    solo,
    tower,
    specMatrix,
    offensiveHealer,
    enemyStats,
    generatedAt,
  });

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('');
  console.log(`[sim] Termine en ${dt}s. Dashboard visuel : ${dir}\\latest.html`);
  console.log(`[sim] Aussi : latest.md + zones.csv / solo.csv / tower.csv / specs.csv / enemies.csv`);
  console.log('');
  if (issues.length === 0) {
    console.log('[sim] ✅ Aucun ecart majeur (profil calibre) vs les cibles.');
  } else {
    console.log(`[sim] ⚠️  ${issues.length} ecart(s) detecte(s) — details dans le rapport.`);
  }
}

main().catch((e) => {
  console.error('[sim] Erreur :', e);
  process.exit(1);
});
