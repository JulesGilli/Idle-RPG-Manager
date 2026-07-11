# Système d'Arcs (New Game+ / régions) — spec & plan de build

## Vision
Un **arc** = une « région » : la **même carte du monde**, mais difficulté et **tier de loot** au palier au-dessus. Chaque arc supérieur est débloqué par un **event de boss communautaire** qui fait avancer le *front du serveur*.

### Décisions actées
- **Pistes parallèles switchables** : on peut revenir en arc 1 ; chaque arc a **sa propre progression de carte**. Pas de reset.
- **Partagé entre arcs** : roster, équipement, or, XP de compte, skills. **Par arc** : progression de carte, tier de loot, difficulté.
- **Tier = numéro d'arc** : en arc N, tout drop/craft est estampillé `tier = N`. Ressources stockées par `(player_id, resource, tier)` — T1 et T2 sont des piles distinctes.
- **Déblocage** : quand la communauté tue le boss d'un arc, l'arc suivant s'ouvre **pour tout le serveur, à jamais**. L'entrée reste gatée par la **progression perso** (avoir fini la carte). Les retardataires ne sont jamais bloqués ; ils loupent juste le loot d'event.
- **UI** : bouton « changer d'arc » → écran épuré (retour + sélection d'arc). Arc 2 = même UI **teintée rouge**. Inventaire : **filtre par tier** (défaut = tier de l'arc actif).
- **L'arc scale TOUT le PvE** : carte, donjons, tour, expéditions, boss d'arc → ×`enemyHpMult/AtkMult`, loot `tier=arc`, seuils de puissance ×`powerReqMult`.
- **Progression persistante scopée par arc** : carte (`level_progress`) ET **tour** (`class_tower_progress`) → par `(…, arc)`. Sinon ×22 + progrès reporté = joueur bloqué.
- **Arène = HORS-ARC** : PvP partagé entre tous les arcs, pas de ×22 (le scaling ne vise que le PvE ; on ne scale pas des snapshots de joueurs). Classement/récompense arène globaux.

### L'event de boss d'arc (« Cloche du Désespoir »)
1. **Cloche** : il faut **5 joueurs ayant fini la zone 10** pour pouvoir la sonner.
2. **Invocation** : annonce ; on **fige** le nombre de joueurs ayant fini la carte → **PV du boss ∝ ce nombre**.
3. **Combat** : chaque joueur peut taper **1×/jour** (vrai combat rejouable, dégâts ∝ puissance d'escouade). Réutilise le pattern **raid de guilde** (`simulateDungeonRun` + pool de PV + contributions + classement).
4. **Kill garanti** : fenêtre bornée / décroissance des PV en fin d'event → le serveur ne cale JAMAIS.
5. **Kill** : `arc_world.opened = true` pour l'arc suivant ; participants → loot + classement + accès immédiat.

## Difficulté de l'arc 2 (et +)
La dureté vient d'abord des **mécaniques**, pas des gros chiffres :
1. **Densité de mécaniques** — mobs normaux « élite » avec abilité offensive (`eliteAbilityChance`), plus de boss à spéciales.
2. **Friction d'économie** — `forgeCostMult` : le T2 coûte nettement plus.
3. **Stat scaling en soutien** — `enemyHpMult` / `enemyAtkMult` (dosés).
Tout est data-driven dans `ARC_TUNING` (`shared/progression/arc.ts`) → les « nouvelles choses » se branchent en config.

## Plan de build (par phases, rien déployé avant le lot complet)

- [x] **Phase 1 — Fondation data** *(en cours)*
  - Migration `0071_arc_system.sql` : `items.tier`, `player_resources` PK `(player_id, resource, tier)`, `level_progress` PK `(…, arc)`, `deployments.arc`, tables `arc_world` + `player_arc`.
  - Modèle `shared/progression/arc.ts` (MAX_ARC, tierOfArc, ARC_TUNING, thème).
- [ ] **Phase 2 — TOUT arc-aware** *(⚠️ doit accompagner la migration)*
  - **L'arc scale TOUTE l'activité** (décision utilisateur) : en arc N, carte + donjons + tour + expéditions + arène sont **×`enemyHpMult/AtkMult`** et **droppent `tier = N`** ; les seuils de puissance (expéditions) ×`powerReqMult`. Helper partagé `scaleEnemyStatsForArc` (dans `arc.ts`).
  - `resolve-deployment` : lit l'arc courant → `resolveDeploymentBatch({arc})` (FAIT côté logique), progression sur `(player_id, level_id, arc)`, drops `tier=arc`.
  - `resolve-dungeon-run`, `resolve-tower`, `resolve-arc-boss` : enemies ×arc, loot `tier=arc`. Progression persistante (tour = best_floor/classe) **scopée par arc** (sinon ×22 + progrès reporté = bloqué).
  - `resolve-expedition` : puissance requise ×`powerReqMult`, loot `tier=arc`.
  - **TOUTES** les écritures de ressources : `onConflict 'player_id,resource'` → `'player_id,resource,tier'` avec `tier = arc courant` (recruit, resolve-tower, resolve-dungeon-run, resolve-expedition, arena, daily-reward, forge, guild-raid, garrison…). Reads filtrés par tier.
  - `forge` : consomme/produit `tier = arc`, stats ×`gearStatMult`, coût ×`forgeCostMult`.
  - Endpoint « changer d'arc » (garde `current_arc ≤ max_arc`).
- [ ] **Phase 3 — Event de boss communautaire**
  - Tables : compteur de cloche, instance de boss (PV dynamiques, statut, fenêtre), contributions/jour, classement.
  - Fonction `arc-boss` : sonner / invoquer / taper (1×/jour) / résoudre dégâts / kill garanti → ouvrir l'arc suivant + `player_arc.max_arc`.
  - (Remplace le `0033_arc_bosses` solo, non appliqué → à repenser en event.)
- [ ] **Phase 4 — Front**
  - Écran de sélection d'arc (épuré) + bouton changer d'arc.
  - Thème arc (accent rouge en arc 2) piloté par `arcTuning(arc).accent`.
  - Filtre par tier dans l'inventaire (défaut = tier de l'arc actif).
  - UI event : compte à rebours, barre de PV du boss, bouton contribuer, classement.

## Notes de risque
- Le changement de PK `player_resources` casse les upserts existants → Phase 1 **et** Phase 2 doivent être appliquées ensemble.
- Kill du boss **garanti** (sinon serveur bloqué).
- PV de l'event calés sur les **actifs réels** (fraction des éligibles), pas le total.
