# Plan de test d'équilibrage

Check-list vivante pour ne rien louper à chaque passe. On la coche/complète au fil
du temps. Chaque item = une question d'équilibrage + la cible attendue + où la lire
dans le rapport (`sim/reports/latest.md`).

## Comment on l'utilise

1. `npm run sim` (mode live si la service key est posée, sinon snapshot rafraîchi).
2. Lire `latest.md` → section **Verdict rapide** d'abord (écarts vs cibles).
3. Parcourir la check-list ci-dessous, cocher ce qui est OK, noter les écarts.
4. Ajuster les chiffres du jeu (DB / `shared/progression`), relancer, comparer au
   `latest.md` précédent (versionné) pour voir l'effet.

## Cibles d'équilibrage (profil « calibré » = joueur normal)

Réglables dans `sim/config.ts` → `BALANCE_TARGETS`.

| Situation | Attendu |
|-----------|---------|
| Niveaux **normaux**, stuff calibré | ≥ 90 % de victoires |
| **Boss** de zone, stuff calibré | 55–95 % (gagnable mais coûte des PV) |
| Boss de zone, **sous-équipé** | doit galérer (< 50 %) → incite à farmer |
| Boss de zone, **sur-équipé** | ~100 % (le farm paie) |
| PV restants escouade après un boss calibré | idéalement 30–70 % (combat « juste ») |

## Check-list — Zones (escouade)

- [ ] **Courbe de difficulté monotone** : pas de zone plus dure que la suivante à profil égal.
- [ ] **Pas de mur** : aucune zone où le profil calibré tombe sous 55 % au boss.
- [ ] **Pas de trivialité** : aucun boss calibré à 100 % avec >85 % PV restants (trop facile).
- [ ] **Transitions de zone** : le passage zone N→N+1 ne fait pas chuter le calibré de >30 pts.
- [ ] **Sous-équipé cohérent** : perd les boss, mais peut farmer les normaux (≥ 50 %).
- [ ] **Sur-équipé récompensé** : clear net, sans être instantané partout (garder du gameplay).
- [ ] **Niveaux boss vs normaux** : le boss est un vrai pic, pas juste un mob normal +HP.

### Points chauds connus (à surveiller)
- ⚠️ **Falaise z6→z7** : bosses de map triviaux jusqu'à z6 puis infranchissables dès z7
  au profil calibré (0 %). Cliff de stats des boss (HP ×~1.5 + atk ×~1.7 entre z6 et z7).
  → chantier d'équilibrage prioritaire.

## Check-list — Classes

- [ ] **Aucune classe morte** : chaque DPS a une part de dégâts non-négligeable en escouade.
- [ ] **Rôles respectés** : tanks survivent le plus, healer soutient (part de dégâts basse OK).
- [ ] **Probe solo** : classer les classes par puissance brute ; écart raisonnable (pas 1 classe x2).
- [ ] **Berserker (branche Guerrier)** : vérifier le DPS soutenu quand les builds seront câblés (phase 2).
- [ ] **Soigneur** : ne peut pas solo (normal), mais doit tenir/soutenir en escouade.

## Check-list — Tour (solo)

- [ ] **Progression par profil** : under < on < over en étage atteint, pour chaque classe.
- [ ] **Pas de classe bloquée trop tôt** : aucune classe (hors soigneur) sous ~floor 70 en calibré.
- [ ] **Endgame** : le profil sur-équipé approche le floor 100 sans le trivialiser dès le calibré.
- [ ] **Soigneur en tour** : cas connu — ne progresse pas en solo (DPS trop bas). Décider si voulu.
- [ ] **Paliers de boss (tous les 10)** : repérer les étages où ça casse (via `tower.csv`).

## Roadmap (phases suivantes)

- [ ] **Phase 2 — Compétences & sets** : câbler un build d'arbre représentatif par classe
      (`learned` + `loadout`) et des sets équipés dans `buildHero`, tester leur impact.
- [ ] **Phase 3 — Donjons** : brancher `shared/progression/dungeon.ts` (enchaînement de
      combats, regen partielle, mini-boss/boss, cooldown par tier).
- [ ] **Phase 4 — Arène (PvP)** : matrice classe vs classe, équilibrage 1v1/3v3.
- [ ] **Phase 5 — Boss d'arc & expéditions**.
- [ ] **Phase 6 — Sensibilité** : faire varier un paramètre (ex. scaling boss) et tracer
      l'effet sur la courbe, pour trouver le bon réglage automatiquement.

## Journal des passes

| Date | Source | Écarts majeurs | Notes |
|------|--------|----------------|-------|
| 2026-07-11 | snapshot | Bosses z1-6 triviaux ; z7-10 infranchissables (calibré) | Baseline initiale du banc de test. |
