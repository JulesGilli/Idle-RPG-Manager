# Refonte V2 — Spec de travail

> Doc vivant. On capture toutes les idées ici, on tranche les points ouverts, puis on
> découpe en migrations (additives = déployables avant / destructives = jour J) + script de reset.
> Stratégie : **Option B** (1 seul projet prod, changements additifs + gated `release_at`) **avec reset de progression assumé au lancement**.

Statut légende : 🟢 clair · 🟡 à trancher · 🔴 conflit à résoudre

---

## 1. Rareté → capacité de compétences 🟢

La rareté du héros détermine **combien** de nœuds il peut débloquer (donne du sens à la qualité au-delà des stats brutes) :

| Rareté | Passifs | Actifs | Ultime |
|--------|:-------:|:------:|:------:|
| D      | 3       | 1      | 0      |
| C      | 4       | 1      | 0      |
| B      | 4       | 1      | 1      |
| A      | 5       | 1      | 1      |
| S      | 6       | 2      | 1      |

### Mécanique actuelle (à conserver — le code la porte déjà)
- Chaque niveau donne `SKILL_POINTS_PER_LEVEL` **point(s)** (1/niveau, seed = `level-1`) **ET** monte les **stats** de base du héros.
- Arbre = **3 branches** × (3 passifs r5 + 1 actif r3 + 1 **ultime** r2) = **20 pts/branche, 60 max**.
- L'**ultime** est le **capstone en bout de branche**, débloqué à **15 pts investis dans SA branche** (`ULTIMATE_GATE`) → spécialisation forcée. **Déjà en jeu.**
- Les points se dépensent 1-par-1 pour **monter le rang** d'un nœud (donc oui, les points montent la puissance). Cap global actuel : `PASSIVE_LIMIT = 5`.

### Changements V2 🟢
- **Niveau max 30 → 40** : plus de points ET plus de stats → monter à 40 reste utile quelle que soit la rareté.
- **Plafond de rareté par-dessus** (remplace le `PASSIVE_LIMIT` fixe) : la rareté **limite le nombre de nœuds DISTINCTS** activables par type, pas la dépense de points.

| Rareté | Passifs distincts | Actifs distincts | Ultime |
|--------|:-----------------:|:----------------:|:------:|
| D | 3 | 1 | ❌ |
| C | 4 | 1 | ❌ |
| B | 4 | 1 | ✅ (1) |
| A | 5 | 1 | ✅ (1) |
| S | 6 | 1 | ✅ (1) |

- **Actif toujours = 1**, quelle que soit la rareté (simple). L'échelle de rareté joue sur les **passifs (3→6)** + le **droit à l'ultime**.
- **Ultime** = double condition : **rareté ≥ B** **ET** 15 pts dans la branche. Un D/C voit l'ultime mais reste **bloqué faute de rareté** (comportement voulu par Jules).
- 🟢 **`SKILL_POINTS_PER_LEVEL = 1`** conservé → ~39 pts à niv 40. Comme le loadout n'équipe qu'1 actif + 1 ultime en combat (`resolveLoadout`), rien à toucher côté moteur.
- **Pourquoi 40 pts restent utiles même en basse rareté** : la rareté plafonne la *diversité* (nb de nœuds distincts), pas la dépense. Un D concentre ses points sur **moins de nœuds mais à rang plus élevé** ; un S les étale sur plus de nœuds. Le niveau = toujours utile (stats + rangs).

---

## 2. Types d'attaque + refonte des armes 🟡

Objectif : rendre **physique / magique** structurants pour forcer des builds orientés. Chaque arme = une **stat d'attaque** + un **% de bonus** selon le type de dégât.

Roster d'armes (8) 🟢 :

| Arme        | Poids  | Profil                                        |
|-------------|--------|-----------------------------------------------|
| Grande épée | Lourd  | dégât élevé + **pv** + **bonus dégât physique** (arme de l'Inquisiteur) |
| Marteau     | Lourd  | dégât moyen + def + **bonus dégât magique**   |
| Épée        | Moyen  | dégât élevé + **bonus dégât physique**        |
| Faux        | Moyen  | dégât + **bonus dégât magique** (arme du Nécromancien) |
| Arc         | Léger  | dégât élevé + **bonus dégât physique**        |
| Dague       | Léger  | dégât + **bonus dégât physique**              |
| Sceptre     | Léger  | dégât élevé + **bonus dégât magique**         |
| Bâton       | Léger  | dégât faible + **augmente le heal**           |

Règle de poids : **1 poids par classe** (voir table §11).

**À trancher :**
- 🟡 Le « % bonus de type » s'applique à quoi exactement : à tous les dégâts du héros, ou seulement à ses attaques de ce type ?
- 🟡 Une classe « léger » a 4 armes possibles (arc/dague/sceptre/bâton). Toutes équipables par toute classe légère, ou arme filtrée aussi par classe (ex : soigneur = bâton, mage = sceptre) ?

---

## 3. Niveaux de set 🟢

Deux niveaux de rareté de set :
- **Sets classiques** = **2 items** (bonus plus modeste, nombreux).
- **Sets épiques** = **4 items** — on en vise **5 gros**, 1 pensé par classe (de base) pour l'instant.

Les sets épiques (4 pièces) sont le end-game ; les sets classiques (2 pièces) restent en parallèle.

**À trancher :**
- 🟡 Quels 5 sets épiques (dérivés/renommés des sets actuels : colosse, duelliste, tacticien, provocateur, ame_offerte, pyromane, empoisonneur, arcaniste, brute) ?
- 🟡 Lesquels des sets actuels deviennent des sets classiques 2 pièces ?
- 🟡 Mapping set → poids (cf. table §11) sous le nouveau schéma 1-poids/classe.

---

## 4. Succès + titres 🟡

Système de succès (achievements) qui débloquent des **titres**.

**Décidé (choix dev, ajustable) :**
- 🟢 **12 succès** dérivés de l'état actuel (pas d'événement journalisé), en 4 catégories (progression / collection / arène / maîtrise) : premier héros, effectif 9, grade S, une de chaque classe, niveau 40, 4 donjons, top arène, arme bénie, forge +10, 50 objets, pantin ≥1M, difficulté 30. Chacun donne **un titre**.
- 🟢 **1 seul titre équipé** à la fois (`profiles.title`), validé serveur (on ne peut équiper qu'un titre débloqué). Affiché sur la **ProfileCard** du Village.
- 🟢 Récompense = **le titre uniquement** (cosmétique) pour l'instant.
- 🟡 (plus tard) afficher le titre en arène/leaderboard, récompenses matérielles.

---

## 5. Activité journalière — le Pantin 🟡

- Combat contre un **pantin** qui ne riposte **jamais**, pendant **50 tours**.
- Les **dégâts infligés** sont convertis en score.
- Faisable **1×/jour**.

**Décidé (choix dev, ajustable) :**
- 🟢 Le score (total de dégâts en 50 tours) se convertit en **or** : `pantinReward` = `score × 0.01`, borné **[500, 30 000]**. Le meilleur score est mémorisé (`pantin_runs.best_score`) pour l'affichage.
- 🟢 Pantin à PV « infinis » (1e12) → il ne meurt jamais en 50 tours, le score n'est pas plafonné par sa mort. Pas de scaling : c'est un **DPS check** pur (le score reflète la puissance du build).
- 🟡 (plus tard) éventuel classement hebdo des meilleurs scores.

---

## 6. Slots de personnage progressifs 🟢

- Le joueur commence avec **5 slots** de perso.
- Chaque **donjon terminé pour la 1re fois** → **+1 slot d'équipe** (roster/collection, **pas** slots de combat).

**Résolu :** 4 donjons existants (`dj_catacombes`, `dj_necropole`, `dj_forteresse`, `dj_abysse`) → cap **5 + 4 = 9**, exactement le `MAX_ROSTER` actuel. Le design s'aligne pile.

---

## 7. Bénédiction d'arme (Arc 2) 🟢

Nouvelle voie d'amélioration, parallèle au renforcement.

- Nouvelle **ressource ultra-rare**, droppable dans **tous les niveaux de toutes les zones**.
- Chaque matériau porte le **niveau de sa zone**, et sert à améliorer le **bonus de type d'attaque** d'une arme.
- **10 niveaux de bénédiction** max, représentés par des **étoiles rouges** (vs étoiles normales du renforcement).
- **Condition** : l'arme doit avoir été **renforcée** d'abord. Le niveau de bénédiction est plafonné par le niveau de renforcement atteint (ex : épée +5 renfo → jusqu'à +5 bénédiction).
- Une fois une arme **bénie**, elle **ne peut plus être renforcée**.

**À trancher :**
- 🟡 La bénédiction ne booste **que** le % de bonus de type (physique/magique/heal), ou aussi le dégât de base ?
- 🟡 1 ressource unique commune, ou 1 par zone (le « niveau de zone » du matériau) — et il faut le matériau du **bon niveau** pour bénir ?

---

## 8. Nouvelle classe — Nécromancien 🟡

Archétype « guerrier » qui **invoque**. Chaque branche change le type d'invocation :
- Branche A : invocation de **petits monstres**.
- Branche B : invocation d'un **héros**.
- Branche C : **pas d'invocation**, à la place du **vol de vie** (life steal).

**À trancher :**
- 🟡 Poids/arme du nécro. Les invocations : entités de combat séparées avec leurs propres pv/dégâts ? durée/limite ?

---

## 9. Nouvelle classe — Inquisiteur 🟡

Gros **DPS** à **énorme épée élémentaire** → **grande épée**, poids **lourd** (§2). Chaque branche = un **élément** :
- Feu · Foudre · Givre.

**À trancher :**
- 🟡 Les éléments (feu/foudre/givre) : nouveau 3e axe de dégât en plus de physique/magique, ou sous-catégorie du magique ? Effets par élément (brûlure/paralysie/gel) ?

---

## 10. Impact reset (rappel Option B + wipe)

Presque tout ci-dessus = **changement de schéma** → confirme que le **wipe de progression** est la bonne voie (aucun code de migration de sauvegarde à écrire).

- **Garder** : comptes (`auth.users`), codes promo, guildes (à confirmer).
- **Wipe** : héros, items/bijoux, équipements, déploiements, expéditions, arène, raids, progression tour/donjon, inventaires, ressources.
- Reset via **1 script SQL one-shot** versionné (style `cleanup_ghost_heroes.sql`), lancé le jour J — **pas** une migration.

---

## 11. Table de synthèse — classe → poids → arme 🟡

| Classe       | Poids | Arme(s)       | Set dédié |
|--------------|-------|---------------|-----------|
| Paladin      | Lourd | ?             | ?         |
| Guerrier     | Moyen | Épée          | ?         |
| Archer       | Léger | Arc           | ?         |
| Voleur       | Léger | Dague         | —         |
| Mage         | Léger | Sceptre ?     | ?         |
| Oracle\*     | Léger | Bâton ?       | ?         |
| Nécromancien | Moyen | Faux          | —         |
| Inquisiteur  | Lourd | Grande épée   | —         |

\* **« Oracle »** = nouveau nom du **Soigneur**. 🟢 L'**id interne reste `soigneur`** (aucune migration de données) ; seul le **libellé affiché** change → « Oracle ».

**Classes V2** : 3 nouvelles confirmées → **Voleur** (dague, léger), **Nécromancien** (faux, moyen), **Inquisiteur** (grande épée, lourd). Total = 8 classes.

---

## 12. Éveil des héros + Runes (end-game) 🟡

Boucle end-game qui donne un sens au **S** et au **niveau max**.

**L'Éveil**
- Condition : héros **rareté S** **ET niveau max (40)**.
- L'éveil débloque un **slot de rune** sur le héros (slot spécial, en plus de l'équipement classique).
- Seuls les héros **éveillés** peuvent porter une rune.

**Les Runes** (nouveau bâtiment : Forge/Autel de runes)
- Principe : on **craft un set complet**, puis on **sacrifie tout le set** (toutes les pièces) **+ beaucoup de matériaux rares** pour **extraire l'effet de set** et le **sceller dans une rune**.
- La rune, posée sur un héros éveillé, lui **accorde cet effet de set** — sans avoir à porter le set.
- Intérêt : un S éveillé peut cumuler **l'effet d'un set via sa rune** + **porter un autre set** sur son équipement → build ultime réservé au end-game.

**Décidé :**
- 🟢 L'éveil donne **1 seul slot** : le **slot de rune** (pas de 2e slot).
- 🟢 Extraction limitée aux **sets classiques (2 pièces)** pour commencer (évite que le end-game explose avec des 4-pièces en rune). Les épiques resteront potentiellement extractibles plus tard, à équilibrer.
- 🟢 Coût = **set entier détruit + mats rares** → gros puits d'or/matériaux, cohérent end-game.

**À trancher (plus tard, au design des sets) :**
- 🟡 La rune donne l'effet 2-pièces **plein** ou légèrement atténué ?
- 🟡 Runes améliorables (niveau/qualité) ou effet fixe = celui du set source ?

---

## 13. Découpage technique (plan de bataille V2)

Principe Option B : tout ce qui **ajoute** (nouvelles tables/colonnes/fonctions) se déploie **quand on veut**, invisible, gardé derrière le gate `release_at` côté front. Tout ce qui **change le comportement du jeu live** (règles de poids, sets, types de dégât, cap de niveau, taille du roster) atterrit **au lancement (jour J)**, dans la fenêtre de bascule, juste autour du script de reset — comme ça aucun joueur n'est en combat avec les anciennes règles.

### Vague 1 — Additif pur (déployable dès maintenant, invisible)
Rien ici ne touche le jeu actuel ; tout est inerte tant que le front V2 n'est pas exposé.
- **Migrations (colonnes/tables nouvelles)** :
  - `items.blessing_level int default 0` (§7 bénédiction).
  - `heroes.awakened bool default false` + table `runes` + `heroes.rune_id` (§12).
  - `heroes.unlocked_slots` (ou compteur profil) pour les slots progressifs (§6).
  - tables `achievements` / `player_titles` (§4).
  - table `daily_dummy_runs` (§5).
  - lignes `class_base` pour **voleur / necromancien / inquisiteur** (§8-9) — inertes.
  - types d'items : nouvelle **ressource ultra-rare** de bénédiction (par niveau de zone), **faux**, **dague** si absente.
- **Nouvelles edge functions** (déployées mais inatteignables depuis le front live) : `runes`, `awaken`, `daily-dummy`, `achievements`.
- **Front V2** : tous les nouveaux écrans derrière le gate `isReleasedFor(release_at, …)`.

### Vague 2 — Bascule jour J (change le live, dans la fenêtre de lancement)
Ordre strict :
1. **Annonce + fenêtre de maintenance** (via `app_config`, déjà en place).
2. **Migrations comportementales** :
   - recrée `equip_item` avec les **nouvelles règles de poids** (1 poids/classe, table §11).
   - éventuels ajustements de contraintes liées aux sets/armes.
3. **Script de reset one-shot** (voir §14) — wipe progression.
4. **Deploy des fonctions de combat** portant : types de dégât par arme (§2), refonte des sets (§3), **rareté→cap compétences + niveau 40** (§1), loot V2.
5. **Flip `release_at`** → le front V2 s'ouvre pour tous.
6. **Déploie le front** V2.

### Points d'attention
- **`main` gelé** pendant le dev V2 (hotfix critiques only, cherry-pick sur `v2` le jour même). Cf. [[refonte-v2]].
- **Niveau 40 / cap rareté** : le passage 30→40 et le gate de rareté modifient le live → **Vague 2** (pas avant), sinon des héros dépassent 30 en prod avant l'heure.
- **Règles de poids** : `equip_item` est une fonction unique non-gatable par joueur → **Vague 2**.
- **Sets & types de dégât** : résolus au combat → changer le calcul en live modifierait tous les builds → **Vague 2**.
- **Migrations = append-only** : les colonnes de Vague 1 partent en prod bien avant le reste ; ne jamais les *modifier* ensuite, seulement en rajouter.

## 14. Script de reset (ÉCRIT) + plan de bascule jour J

Script prêt : **`supabase/reset_for_launch_v2.sql`** (racine `supabase/`, **pas** une migration → ne se rejoue pas). One-shot au jour J. Basé sur le reset V1, complété des tables V2. Wipe toute la progression joueur (héros, items, ressources, déploiements, expéditions, arène, donjons+cooldowns, tours+tours-de-classe, raids/guildes, pantin, arc joueur, hits d'event), remet `profiles` (or=500, xp=0, **title=null**), ré-octroie 1 Guerrier « Garde ». Garde comptes/pseudos + tout le contenu statique (maps/levels/dungeons/classes/codes/arc_world…).

**Ordre de bascule jour J** (récap consolidé) :
1. Fenêtre de maintenance (`app_config.release_at`).
2. Migrations **comportementales** V2 : **`0074`** (classes) puis **`0078`** (equip_item poids 1/classe). *(Les additives `0075` blessing / `0076` pantin / `0077` title peuvent déjà être en prod — Vague 1.)*
3. Exécuter **`reset_for_launch_v2.sql`**.
4. Déployer les **fonctions edge** : les 8 combat (arena, garrison-actions, guild-raid, resolve-arc-boss, resolve-deployment, resolve-dungeon-run, resolve-expedition, resolve-tower) + **recruit**, **forge**, **skills** (modifiées) + **daily-dummy**, **titles** (nouvelles).
5. Flip `release_at` → front V2 ouvert. Déployer le front.

### Inventaire migrations V2 (état actuel)
| # | Rôle | Vague |
|---|------|-------|
| 0074 | 3 classes + Oracle | 2 (jour J — recrutement forcé) |
| 0075 | `items.blessing_level` | 1 (additive) |
| 0076 | `pantin_runs` | 1 (additive) |
| 0077 | `profiles.title` | 1 (additive) |
| 0078 | `equip_item` poids 1/classe | 2 (jour J — change l'équip live) |

---

## 15. Avancement (journal de dev)

- ✅ **Bloc 1 — Fondations** (commit `b4467cb`, branche `v2.0`) : poids 1-par-classe pour les 8 classes (`CLASS_ALLOWED_WEIGHTS`), base de dégâts des 3 nouvelles classes (`CLASS_DAMAGE_BASE`), roster 8 armes dans `FORGE_BASES` (arc→léger, +faux +bâton) avec champ `typeBonus` (physique/magique/soin), mapping d'icônes Synty (faux→Spears, bâton→Staves, sceptre→Scepters + icônes des 3 classes). 242 tests + build OK.
  - **Reste à câbler plus tard** : l'**application en combat** du `typeBonus` d'arme (amplifie les dégâts/soins du bon type) — étape avec le moteur de combat + passe `npm run sim`. Le profil « pv sur grande épée / def sur marteau » (armes qui rollent hp/def) est aussi à faire à ce moment (aujourd'hui `rollBonuses('weapon')` ne donne que de l'atk).
- ✅ **Bloc 2 — Les 3 nouvelles classes** : migration `0074_v2_new_classes.sql` (lignes `hero_classes` voleur/nécro/inquisiteur + renommage Soigneur→Oracle + alignement `weight`), métadonnées front `CLASS_META` (label/accent/badge des 3 classes + label Oracle). `combatRole` les met en `dps` par défaut (rien à changer). Arbres de compétences vides pour l'instant (fallback `?? []`) → remplis au bloc 3. Build + 242 tests OK.
  - ⚠️ Migration `0074` = **Vague 2 / jour J STRICT** : l'appliquer en prod déclencherait le recrutement forcé « une de chaque » → fuite V2 (noté dans l'entête du fichier).
  - Stats de base = points de départ, à affiner avec `npm run sim`.
- ✅ **Bloc 3 — Compétences (rareté + niveau 40 + arbres des 3 classes)** :
  - **3a — mécanique** : `MAX_LEVEL = 40` + cap dans `applyXpGain` (formulas.ts) ; `GRADE_SKILL_CAPS` (D=3p/1a/0u … S=6p/1a/1u) + `learnedSlotCount` (skills.ts) ; `validateLearn(classId, learned, nodeId, grade?)` applique le plafond de passifs/actifs distincts + réserve l'ultime au grade B+ (repli historique si pas de grade) ; edge function `skills` recalcule le grade serveur (bonus de naissance + base de classe) → anti-triche ; `LibraryScreen` affiche « Passifs X/N » selon le grade et grise l'ultime pour D/C.
  - **3b — arbres** : Voleur (Assassin/Ombre/Lames), Nécromancien (Charnier/Liche/Faucheur), Inquisiteur (Feu/Foudre/Givre), 15 nœuds chacun, câblés sur les mécaniques existantes. Tests : caps par grade + intégrité des arbres. Build + 247 tests OK.
  - ⚠️ **Nœuds d'invocation du Nécromancien `pending`** (n_cha_leve, n_cha_armee, n_lic_serviteur, n_lic_avatar) : le moteur de combat n'a **pas** de mécanique d'invocation → visibles mais pas apprenables. La branche Faucheur (vol de vie) + les 3 passifs de chaque branche sont, eux, jouables. **Nouveau bloc à planifier : Bloc 3b-bis — moteur d'invocation** (ajout de combattants en cours de combat).
  - Valeurs des nœuds = points de départ, à équilibrer avec `npm run sim`.
- ✅ **Bloc 5 — Bénédiction d'arme** : migration `0075` (`items.blessing_level`, additive) ; `shared/progression/blessing.ts` (BLESSING_MAX=10, `blessedTypeBonusPct` ×2.5 au max, `blessingCost`, `validateBless`, `baseIdOfName`) + tests ; action `bless` dans la fonction forge (déterministe, gatée **Arc ≥ 2**, plafonnée par le renfo) + **verrou renfo** (`upgrade` refuse une arme bénie) ; UI ForgeScreen (panneau « Bénir » + **étoiles rouges** `BlessingStars`, verrou renfo affiché). Build + 257 tests OK.
  - **Décisions prises** (ajustables) : 1 ressource unique `larme_astrale` (pas une par zone) ; bénédiction **déterministe** (la ressource rare = le coût, pas de jet d'échec) ; boost = l'amplificateur de type de l'arme (`blessedTypeBonusPct`).
  - ⚠️ **Effet numérique en combat pas encore branché** : `blessedTypeBonusPct` scale le `typeBonus` d'arme, qui n'est pas encore appliqué au combat (même dépendance que le typeBonus du bloc 1). S'active avec le **bloc « types de dégât en combat »**.
  - ⚠️ **Drop de `larme_astrale` non câblé** (contenu Arc 2 : la ressource doit dropper dans toutes les zones). À faire avec le contenu Arc 2 ; admin peut en accorder pour tester.
- ✅ **Bloc « Types de dégât en combat »** : le `typeBonus` d'arme (bloc 1) + la **bénédiction** (bloc 5) prennent enfin effet en combat. `weaponCombatAmp` (heroLoan.ts) mappe l'arme équipée (nom→modèle→typeBonus, × bénédiction) vers `dmgAmp` (physique/magique) ou une abilité `heal_amp` (bâton). Câblé dans `buildHeroSnapshot` + les 8 fonctions à `toSnapshotInput` (select arme enrichi `name, blessing_level`) + `resolve-deployment.buildAllies` (inline) + `sim/hero.ts`. Build + 257 tests OK ; `npm run sim` tourne.
  - **Impact équilibrage** : +10 % de dégâts de type = buff héros **uniforme et modeste**. Le sim montre les **déséquilibres pré-existants** (cf. [[balance-analysis]] : boss cartes 1-6 triviaux, boss 7-10 trop durs) — aucune catégorie de verdict ne bascule avec +10 %. À traiter dans une **passe de ré-équilibrage V2 dédiée** (retune des ennemis), pas ici.
  - ⚠️ Toutes les fonctions de combat sont modifiées → **redeploy complet au jour J** (déjà prévu Vague 2). L'arène rejoue des snapshots figés : les anciens n'ont pas le `dmgAmp` (sans effet, et le reset V2 les efface).
- ✅ **Bloc 7 — Slots de perso progressifs** : `ROSTER_BASE = 5` + `maxRosterFor(dungeonsCleared) = min(9, 5 + cleared)` (recruit.ts) + test ; fonction `recruit` calcule les donjons distincts terminés (`dungeon_runs` success=true, dédupliqué — aucune table dédiée) et applique le cap dynamique au pool (`max_roster`) et au recrutement (message « termine un donjon pour débloquer un slot »). Front inchangé (lit `max_roster` de la réponse). Build + 258 tests OK.
- ⚠️ **Renumérotation migrations** : le repo était en fait à **0073** (système d'arc ajouté depuis). Mes migrations V2 renommées pour éviter la collision : `0071_v2_new_classes`→**`0074_v2_new_classes`**, `0072_item_blessing`→**`0075_item_blessing`**. Prochaine migration V2 = `0076+`.
- ✅ **Bloc 8 — Pantin journalier** : migration `0076` (`pantin_runs` : gate jour + best_score) ; `shared/progression/pantin.ts` (buildPantin, `pantinScore` = maxHp−hp, `pantinReward`) + tests ; edge function `daily-dummy` (actions `status`/`run`, gate atomique CAS anti-multitab, réutilise `buildHeroSnapshot` + `resolveCombat` 50 tours) ; front : `PantinScreen` (sélection d'équipe + résultat) + hook `useDailyDummy` + route `/pantin` + carte d'activité. Build + 261 tests OK.
  - Détail moteur trouvé : les PV ennemis sont scalés ×4 (`HERO_HP_SCALE`) → le score se lit sur `maxHp−hp` du finalState, jamais `PANTIN_HP−hp`.
  - ⚠️ Nouvelle fonction `daily-dummy` à **déployer** au jour J (avec les autres).
- ✅ **Bloc 9 — Succès + Titres** : migration `0077` (`profiles.title`) ; `shared/progression/achievements.ts` (catalogue de 12 succès + `unlockedAchievements`/`titleUnlocked`) + tests ; edge function `titles` (actions `status`/`equip`, calcule l'instantané de stats du joueur, valide le titre serveur) ; front : `AchievementsScreen` (succès par catégorie + équiper) + hook `useAchievements` + route `/achievements` + titre & lien dans la ProfileCard du Village. Build + 267 tests OK.
  - ⚠️ Nouvelle fonction `titles` à **déployer** au jour J.
- ✅ **Bloc 3b-bis — Moteur d'invocation** : nouvelle abilité combat `summon` (types.ts) ; `resolveCombat` la traite **au setup** → chaque allié invocateur ajoute `count` créatures de son côté, stats dérivées du lanceur (fractions hp/atk/def), qui combattent comme des alliés (peuvent mourir) ; ids `~summon~` → aucune récompense/XP attribuée. Câblé dans `skills.ts` (AbilitySpec + buildAbility + merge + describe) ; les **4 nœuds nécro** (Lève les morts / Armée des ombres / Serviteur d'os / Avatar de la Liche) passent de `pending` → vraies invocations. Tests : spawn + stats dérivées ; `formatAbility` (HeroScreen) gère `summon`. Build + 268 tests OK. **Le Nécromancien est complet.**
  - Zéro impact sur les combats existants (le scan `summon` n'agit que si l'abilité est présente).
- ✅ **Bloc 10 (partiel) — Reset + consolidation migrations** : `supabase/reset_for_launch_v2.sql` écrit (wipe progression V2 complet, tables énumérées) + migration **`0078_equip_weight_v2.sql`** (recrée `equip_item` avec les poids 1/classe — comble le trou du bloc 1 où seul `loot.ts` avait changé, pas le SQL) + plan de bascule jour J consolidé (§14). Reste dans le bloc 10 : réintégrer le wipe des tables **éveil/runes** quand elles existeront (dépend du bloc 4).
- ✅ **Bloc 6 — Éveil + Runes** (décision Jules : runes = **sets 2-pièces uniquement**, les gros 4-pièces = MAJ ultérieure) :
  - **Mécanique + combat** : migration `0079` (`runes` table + `heroes.awakened`/`rune_id`) ; `shared/runes.ts` (`canAwaken` S+niv40, `runeExtractableSets` = les 6 sets `effectAt:2`, `runeAbilities` = effet 2-pièces extrait, ignore la restriction de poids) + tests ; edge fn `runes` (awaken / craft = sacrifie 2 pièces + mats / equip 1 rune) ; câblage combat : `runeAbilities` dans `buildHeroSnapshot` + `runeSetId` propagé aux 9 sites + resolve-deployment inline.
  - **UI** : `RunesScreen` (Autel : éveil + sceller une rune + équiper sur héros éveillé) + hook `useRunes` + route `/runes` + lien Village ; `useHeroes` expose `awakened`/`runeId` ; `database.types` (heroes + table runes). Build + 273 tests OK.
  - Coûts : éveil 50k or + 3 larmes astrales ; rune 20k or + 2 larmes + les 2 pièces du set. ⚠️ Nouvelle fn `runes` à déployer ; `runes` ajoutée au reset.
- ⬜ **Bloc 4 — Refonte des sets épiques (4 pièces)** → **reporté à une MAJ ultérieure** (décision Jules).
- ✅ **Verrou « Préparation de la V2 »** : migration `0080` (flag `app_config.full_lock` + `release_info` RPC étendu avec `locked`) ; `useRelease` expose `locked` ; `V2PrepGate` (entre `RequireAuth` et les routes) → si `full_lock='true'` ET sortie non atteinte ET **non-admin** → écran plein-écran compte à rebours (réutilise l'horloge serveur + bypass admin déjà en place). L'inscription reste possible (verrou après l'auth). Build + tests OK.
  - **Activation jour de bascule** : `app_config` → `full_lock='true'`, `release_at`=date V2, `release_title`=message. **Déverrouiller** : `full_lock='false'`. → permet d'appliquer la V2 en prod (migrations + fonctions) **sans fuite** (joueurs bloqués) et de **tester en admin** dans le vrai environnement. ✅ **Récompense exclusive pré-lancement** = 1 héros de classe aléatoire **grade A** (bonus = 0.26 × base, facteur vérifié), ajoutée au script de reset (« Pionnier », offert à tous les comptes présents au reset).
- ⬜ Passe d'équilibrage `npm run sim` (retune ennemis + profils de stats d'arme).

## Backlog d'idées (à compléter par Jules)

- _(zone libre pour les idées qui viennent en vrac)_
