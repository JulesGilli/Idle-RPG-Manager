/**
 * Banc de test des CHAMPS DE BATAILLE (arc 2).
 *
 *   npm run sim:bf
 *
 * Passe rapide et lisible en console : taux de victoire par bataille et par
 * étalon d'escouade, puis les verdicts d'équilibrage. Séparé de `npm run sim`
 * (qui couvre zones/tour/donjons de l'arc 1) parce qu'on itère dessus seul
 * pendant le calibrage.
 */
import { loadGameData } from './loadData.ts';
import { runBattlefields, battlefieldVerdicts } from './battlefields.ts';

const data = await loadGameData();
console.log(`[sim:bf] Donnees chargees (${data.source}).\n`);

const runs = runBattlefields(data);

for (const r of runs) {
  const cells = r.cells
    .map((c) => `B${c.idx}:${String(c.winPct).padStart(3)}%`)
    .join('  ');
  console.log(`${r.label.padEnd(46)} (${String(r.teamSize).padStart(2)} heros)  ${cells}`);
}

// Détail du profil de référence : longueur des combats + usure de l'escouade.
const real = runs.find((r) => r.profile === 'set');
if (real) {
  console.log('\nDetail etalon set (manches / PV restants en cas de victoire) :');
  for (const c of real.cells) {
    console.log(
      `  B${c.idx} ${c.name.padEnd(26)} ${String(c.winPct).padStart(3)}%  ${String(c.rounds).padStart(3)} manches  ${String(c.hpLeftPct).padStart(3)}% PV`,
    );
  }
}

const verdicts = battlefieldVerdicts(runs);
console.log('\nVERDICTS :');
console.log(
  verdicts.length
    ? verdicts.map((v) => `  - ${v}`).join('\n')
    : '  - aucun : equilibrage dans la cible.',
);
