/**
 * Point d'entree du banc de test d'equilibrage.
 *
 *   npm run sim                     # passe complete -> sim/reports/latest.md + CSV
 *   npm run sim -- --refresh-snapshot   # regenere le snapshot depuis la DB (service key requise)
 *
 * Chaque combat rejoue le VRAI moteur du jeu (resolveCombat), donc le rapport
 * reflete exactement la prod. Deterministe : deux passes identiques = memes chiffres.
 */
import { loadGameData, refreshSnapshot } from './loadData.ts';
import { runTower, runZonesSolo, runZonesSquad } from './run.ts';
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

  console.log('[sim] Zones — escouade...');
  const squad = runZonesSquad(data);
  console.log('[sim] Zones — probe solo...');
  const solo = runZonesSolo(data);
  console.log('[sim] Tour — solo par classe...');
  const tower = runTower(data);

  const generatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const { issues, dir } = writeReports(data, squad, solo, tower, generatedAt);

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('');
  console.log(`[sim] Termine en ${dt}s. Rapport : ${dir}\\latest.md`);
  console.log(`[sim] CSV : zones.csv, solo.csv, tower.csv`);
  console.log('');
  if (issues.length === 0) {
    console.log('[sim] ✅ Aucun ecart majeur (profil calibre) vs les cibles.');
  } else {
    console.log(`[sim] ⚠️  ${issues.length} ecart(s) detecte(s) :`);
    for (const i of issues) console.log(`      - ${i}`);
  }
}

main().catch((e) => {
  console.error('[sim] Erreur :', e);
  process.exit(1);
});
