#!/usr/bin/env node
/**
 * Déploiement groupé des Edge Functions.
 *
 * POURQUOI CE SCRIPT. Chaque fonction embarque sa PROPRE copie de `shared/` au
 * moment du déploiement. Un changement d'équilibrage touche donc jusqu'à neuf
 * fonctions à la fois, et en oublier une produit un bug indétectable à la
 * lecture du code : le jeu tourne avec deux versions des règles selon l'activité.
 * C'est arrivé deux fois — le nécromancien, puis les sets universels refusés à un
 * Voleur parce que les fonctions de combat dataient d'avant le commit.
 *
 * Usage :
 *   npm run deploy -- combat      # les 9 fonctions qui résolvent du combat
 *   npm run deploy -- all         # toutes
 *   npm run deploy -- forge recruit
 *   npm run deploy -- combat --dry   # affiche sans exécuter
 */
import { execFileSync } from 'node:child_process';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'vbfguqzfhedcuaygzhez';

/**
 * Fonctions qui résolvent un combat : toutes importent `resolveCombat` et donc
 * l'arbre `shared/combat` + `shared/progression`. Un changement de compétence,
 * de set ou de scaling les concerne TOUTES.
 */
const COMBAT = [
  'resolve-deployment',
  'resolve-dungeon-run',
  'resolve-tower',
  'resolve-arc-boss',
  'arena',
  'arc-event',
  'world-boss',
  'daily-dummy',
  'guild-raid',
];

/** Le reste : progression, ateliers, social, administration. */
const OTHER = [
  'forge',
  'recruit',
  'skills',
  'runes',
  'titles',
  'resolve-expedition',
  'garrison-actions',
  'guild-actions',
  'list-loanable-heroes',
  'daily-reward',
  'redeem-code',
  'admin-actions',
  'arc',
];

/**
 * Fonctions qui doivent rester en `verify_jwt = false`.
 *
 * Sans `--no-verify-jwt`, le CLI les repasse à `true` (il n'y a pas de
 * `config.toml` ici pour porter le réglage) et la fonction cesse de répondre.
 * `guild-raid` s'appelle entre joueurs sans JWT du demandeur.
 */
const NO_VERIFY_JWT = new Set(['guild-raid']);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const groups = args.filter((a) => !a.startsWith('--'));

if (groups.length === 0) {
  console.error(
    'Précise ce qu’il faut déployer :\n' +
      '  npm run deploy -- combat        (les 9 fonctions de combat)\n' +
      '  npm run deploy -- all           (toutes)\n' +
      '  npm run deploy -- forge recruit (une liste explicite)\n',
  );
  process.exit(1);
}

const targets = [];
for (const g of groups) {
  if (g === 'combat') targets.push(...COMBAT);
  else if (g === 'all') targets.push(...COMBAT, ...OTHER);
  else targets.push(g);
}
const unique = [...new Set(targets)];

const known = new Set([...COMBAT, ...OTHER]);
const unknown = unique.filter((t) => !known.has(t));
if (unknown.length > 0) {
  // Un slug mal orthographié partirait sinon au déploiement et échouerait après
  // coup, au milieu d'une série — autant refuser tout de suite.
  console.error(`Fonction(s) inconnue(s) : ${unknown.join(', ')}`);
  console.error(`Connues : ${[...known].sort().join(', ')}`);
  process.exit(1);
}

console.log(`Projet ${PROJECT_REF} — ${unique.length} fonction(s) :`);
for (const fn of unique) console.log(`  · ${fn}${NO_VERIFY_JWT.has(fn) ? '  (--no-verify-jwt)' : ''}`);
if (dryRun) {
  console.log('\n--dry : rien n’a été déployé.');
  process.exit(0);
}

const failed = [];
for (const [i, fn] of unique.entries()) {
  const flags = ['functions', 'deploy', fn, '--project-ref', PROJECT_REF];
  if (NO_VERIFY_JWT.has(fn)) flags.push('--no-verify-jwt');
  console.log(`\n[${i + 1}/${unique.length}] ${fn}…`);
  try {
    execFileSync('npx', ['supabase', ...flags], { stdio: 'inherit', shell: true });
  } catch {
    // On continue : un échec isolé (réseau, quota) ne doit pas laisser les
    // suivantes non déployées, ce qui recréerait justement l'incohérence qu'on
    // cherche à éviter. Le récapitulatif final liste ce qui reste à reprendre.
    failed.push(fn);
    console.error(`  ✗ échec sur ${fn} — on poursuit.`);
  }
}

if (failed.length > 0) {
  console.error(`\n${failed.length} échec(s) : ${failed.join(', ')}`);
  console.error(`Relance : npm run deploy -- ${failed.join(' ')}`);
  process.exit(1);
}
console.log(`\n${unique.length} fonction(s) déployée(s).`);
