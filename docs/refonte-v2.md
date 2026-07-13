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

**À définir :**
- 🟡 Liste initiale de succès (catégories : progression, PvP, collection, donjons…).
- 🟡 Où s'affiche le titre (profil, arène, guilde ?). Un seul titre équipé à la fois ?
- 🟡 Récompenses au-delà du titre (cosmétique only, ou stats/ressources ?).

---

## 5. Activité journalière — le Pantin 🟡

- Combat contre un **pantin** qui ne riposte **jamais**, pendant **50 tours**.
- Les **dégâts infligés** sont convertis en score.
- Faisable **1×/jour**.

**À trancher :**
- 🟡 Le score se convertit en **quoi** ? (récompense fixe par palier de dégâts, classement/leaderboard hebდo, monnaie dédiée ?)
- 🟡 Le pantin scale-t-il (pv/résistances) selon la progression du joueur, ou score pur ?

---

## 6. Slots de personnage progressifs 🟢

- Le joueur commence avec **5 slots** de perso.
- Chaque **donjon terminé pour la 1re fois** → **+1 slot d'équipe** (roster/collection, **pas** slots de combat).

**À trancher :**
- 🟡 Combien de donjons existent → slot max ? (roster actuel = 9). On aligne le nombre de donjons sur le cap de slots voulu.

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

## 14. Script de reset (squelette — à finaliser)

One-shot SQL lancé au jour J (**pas** une migration), style `cleanup_ghost_heroes.sql`. À exécuter **après** les migrations comportementales, **avant** d'ouvrir le front.

> ⚠️ Liste des tables à **énumérer précisément** avant de figer (via `list_tables`), pour n'oublier aucune table de progression et respecter l'ordre des FK.

**Garder** : `auth.users`, codes promo, `app_config`, guildes (à confirmer : garder la structure de guilde, wiper leur progression).

**Wiper (progression joueur)** — familles à couvrir :
- héros (`heroes`) + compétences apprises.
- items / bijoux / équipements / **runes**.
- déploiements (`deployments`), expéditions (`expedition_runs`).
- arène (classements/défenses), raids de guilde (`guild_raid_*`), garnison.
- progression cartes / donjons / tour.
- presets d'équipe (`team_presets`).
- inventaires / ressources / monnaies hors compte.

**Remettre à zéro (garder la ligne)** : `profiles` → or/gems/xp/niveau/slots à valeurs de départ (5 slots), `last_map_fight_at` = null.

---

## 15. Avancement (journal de dev)

- ✅ **Bloc 1 — Fondations** (commit `b4467cb`, branche `v2.0`) : poids 1-par-classe pour les 8 classes (`CLASS_ALLOWED_WEIGHTS`), base de dégâts des 3 nouvelles classes (`CLASS_DAMAGE_BASE`), roster 8 armes dans `FORGE_BASES` (arc→léger, +faux +bâton) avec champ `typeBonus` (physique/magique/soin), mapping d'icônes Synty (faux→Spears, bâton→Staves, sceptre→Scepters + icônes des 3 classes). 242 tests + build OK.
  - **Reste à câbler plus tard** : l'**application en combat** du `typeBonus` d'arme (amplifie les dégâts/soins du bon type) — étape avec le moteur de combat + passe `npm run sim`. Le profil « pv sur grande épée / def sur marteau » (armes qui rollent hp/def) est aussi à faire à ce moment (aujourd'hui `rollBonuses('weapon')` ne donne que de l'atk).
- ✅ **Bloc 2 — Les 3 nouvelles classes** : migration `0071_v2_new_classes.sql` (lignes `hero_classes` voleur/nécro/inquisiteur + renommage Soigneur→Oracle + alignement `weight`), métadonnées front `CLASS_META` (label/accent/badge des 3 classes + label Oracle). `combatRole` les met en `dps` par défaut (rien à changer). Arbres de compétences vides pour l'instant (fallback `?? []`) → remplis au bloc 3. Build + 242 tests OK.
  - ⚠️ Migration `0071` = **Vague 2 / jour J STRICT** : l'appliquer en prod déclencherait le recrutement forcé « une de chaque » → fuite V2 (noté dans l'entête du fichier).
  - Stats de base = points de départ, à affiner avec `npm run sim`.
- ⬜ Bloc 3 — Arbres de compétences des 3 classes + système de rareté (cap + niveau 40).
- ⬜ Bloc 4 — Refonte des sets. ⬜ Bloc 5 — Bénédiction. ⬜ Bloc 6 — Éveil+runes. ⬜ Bloc 7 — Slots progressifs. ⬜ Bloc 8 — Pantin. ⬜ Bloc 9 — Succès/titres. ⬜ Bloc 10 — Migrations + reset.

## Backlog d'idées (à compléter par Jules)

- _(zone libre pour les idées qui viennent en vrac)_
