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

## Check-list — Spés (labo, `sim/lab.ts`)

- [ ] **Aucune spé morte** : chaque branche a un axe où elle brille (mono/AOE/tank/HPS).
- [ ] **DPS mono cohérent** : les spés ST (Berserker, Œil, Arcane, Frimas) > les tanks/heals.
- [ ] **DPS AOE cohérent** : les spés AOE (Brasier, Tempête, Vipère) dominent sur 5 cibles.
- [ ] **Tanks tiennent** : Rempart/Bastion/Aegis survivent nettement plus que les DPS.
- [ ] ⚠️ **Paladin déchu** : "tank" qui ne tient que ~5 rounds (passif Pacte = DEF négative). À revoir.
- [ ] **Heals** : Lumière/Bénédiction ont le meilleur HPS ; Oracle (buff) est faible en solo (normal).
- [ ] **Soigneur offensif** : le set Âme Offerte double le DPS (223→462) sans perdre de soin.

## Check-list — Data ennemis (`sim/enemyStats.ts`)

- [ ] **Ratio ATK/PV des boss** : monte de 3,5% (Z1) à 7,5% (Z10) → boss de plus en plus
      "glass-cannon". Hypothèse "trop d'ATK/pas assez de PV" **confirmée**. Piste : baisser
      l'ATK des boss tardifs et/ou monter leurs PV pour aplatir la courbe.
- [ ] **Scaling des mobs** : vérifier que `scaleNormalMonster` (×2,1 PV) ne crée pas de pics.

## Roadmap (phases suivantes)

- [x] **Phase 2 — Compétences & sets** : 15 branches-spés testées sur 4 axes + builds à sets
      de campagne + cas soigneur offensif. FAIT (2026-07-11).
- [ ] **Phase 2b — Rework boss** : tester des variantes de stats de boss (−ATK / +PV) et
      comparer la courbe avant/après pour caler la fenêtre calibré↔campagne.
- [ ] **Phase 3 — Donjons** : brancher `shared/progression/dungeon.ts`.
- [ ] **Phase 4 — Arène (PvP)** : matrice classe vs classe.
- [ ] **Phase 5 — Boss d'arc & expéditions**.
- [ ] **Phase 6 — Sensibilité** : faire varier un paramètre et tracer l'effet automatiquement.

## Journal des passes

| Date | Source | Écarts majeurs | Notes |
|------|--------|----------------|-------|
| 2026-07-11 | snapshot | Bosses z1-6 triviaux ; z7-10 infranchissables (calibré) | Baseline initiale. |
| 2026-07-11 | snapshot | Fenêtre de tuning cassée : forge-sans-skills mur à Z7, campagne (skills+sets) fond les boss en ~2 rounds. Ratio ATK/PV boss 3,5%→7,5%. Paladin déchu tank = 5 rounds. | Extension : spés + sets + data boss. |
