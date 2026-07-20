# Roadmap contenu — session du 2026-07-20

Notes de travail pour la suite (à faire "ce soir" selon Jules). Ordre = ordre
d'attaque décidé pendant la session.

## ✅ Déjà fait cette session

- Rotation d'events : week-end double XP/butin sur la carte, bandeau piloté par
  l'heure serveur.
- Scaffold du **boss de la semaine** (`supabase/functions/world-boss`) — TODOs
  marqués dans le code, à finir par Jules.
- Refonte complète du **Nécromancien** : branches Légion d'os (invocation
  aléatoire multi-squelettes) + Colosse d'os (stacks d'os → créature mortuaire).
- Skins visuels des invocations (squelettes sbire/héros/colosse).
- Arène de combat : rangées >5, invocations affichées comme des combattants
  normaux, barres de vie imbriquées sous l'invocateur.
- Bestiaire : noms des monstres des zones 3-10 (fini les "Rôdeur" génériques).
- **Sets réservés par ARC** : un set d'Arc 1 n'est plus forgeable en Arc 2 (et
  réciproquement) — `ItemSet.arc`, verrou serveur (`forge/index.ts`) + filtrage
  front (Forge/Joaillerie/Autel).

## 🔜 À faire, dans l'ordre

### 1. Matériaux spéciaux d'event (drop dégressif)

Chaque activité d'event lâche SA ressource dédiée, distribuée en **classement
décroissant** (top 10) :

| Activité | Matériau d'event | Débloque (Arc 2 uniquement, cf. Forge Sacrée) |
|---|---|---|
| Boss de la semaine | Éclat sacré | Relique divine |
| Gauntlet (vagues) | Gemme brute ancienne | Bijou divin |
| Défense du village | Fragment de guerre | Arme divine |
| Week-end bonus | Poussière bénie | Armure divine |

Règle de distribution : **top 5 doit pouvoir crafter au moins 1 objet** avec les
récompenses d'UNE semaine (le top 10 reçoit une quantité décroissante, mais les
joueurs ne sont utilisables qu'une fois en Arc 2 — la ressource s'accumule en
attendant si le joueur est encore en Arc 1).

### 2. Catalogue de sets Arc 2 (10-15 sets)

- Contrairement à l'Arc 1 (sets à 4 pièces, armes+armures typées par poids),
  les sets Arc 2 sont **tous des sets à 2 pièces** (bijou + relique,
  universels — cf. le pattern `effectAt: 2` déjà utilisé par les petits sets
  Arc 1). Ça libère la Forge Sacrée pour ne faire QUE arme + armure divines.
- Toutes les classes doivent avoir accès à au moins un set adapté.
- Montée en puissance liée à la difficulté d'expédition : l'Arc 2 passe de 3 à
  **4 expéditions**. Les sets des expés faciles sont simples (+20% dégâts style),
  les sets des expés difficiles donnent des passifs uniques et un peu "bizarres"
  liés à une classe (ex. augmenter le stack max de poison de 5 à 10).
- Prévoir ~10-15 sets distincts au total.

### 3. Nouvelle activité : Défense du village

- Remplace l'idée initiale "bataille 10v10" — thème village qui se défend.
- Plusieurs niveaux de difficulté (comme les donjons), cooldown par défense
  (comme les donjons).
- Récompense : ressource unique nécessaire à l'armure divine (Forge Sacrée).
- Le moteur de combat et l'arène supportent déjà les gros effectifs (jusqu'à
  20 combattants, rangées denses) — pas de gros chantier moteur attendu ici,
  surtout du contenu (configs d'ennemis, UI d'activité, cooldown, récompenses).

### 4. Forge Sacrée — qualité Divine

Nouvelle station, au-dessus d'Ultime en stats **mais pas over-pété**. Recette :

- **Ressource d'event** (top 10 du classement) → ce qui rend l'objet DIVIN.
- **Ressource de zone** (comme aujourd'hui) → définit les stats de BASE.
- **Une gemme** → donne l'EFFET UNIQUE de l'objet (via le système d'`Ability`
  existant, pas des stats brutes — pour éviter l'inflation).

Slots concernés :
- Relique divine ← Éclat sacré (boss de semaine)
- Bijou divin ← Gemme brute ancienne (Gauntlet)
- Arme divine ← Fragment de guerre (Défense du village)
- Armure divine ← Poussière bénie (week-end)

Garde-fous économie déjà actés :
- Débit limité par la cadence des events (pas de flood).
- 1 divin par slot, montée progressive.
- Les mats de zone restent la SEULE voie de niveau — le farm de zone garde sa
  valeur.

## 🩹 Correctifs & QoL — file d'attente (notée le 2026-07-20)

Ordre d'attaque validé : bugs d'abord (les données mal taguées s'accumulent),
équilibrage en dernier (sinon on équilibre deux fois, avant et après les
nouveaux systèmes).

### 🔴 Bugs

- **B1 — Zone des items de set au craft.** Un item crafté avec des matériaux de
  zone 1 doit s'afficher **Z1**, et son amélioration doit réclamer des
  ressources de **zone 1**. Aujourd'hui la zone est fausse. Prévoir un backfill
  SQL des items déjà craftés si la zone est stockée en base.
- **B2 — L'autel de reliques ne gagne pas de niveau** au craft/upgrade.
- **B3 — La joaillerie monte beaucoup trop lentement** (toujours niveau 1).
  Probablement la même cause que B2 (gain d'XP de station non appliqué selon le
  type d'item) → sans doute un seul correctif.
- **B4 — Équipement verrouillé en expédition.** Un héros parti en expédition ne
  doit pas pouvoir être déséquipé : message d'erreur explicite + cadenas sur
  l'item dans l'inventaire.

### 🟠 QoL

- **Q1** — Confirmation avant « tout recycler » (`ConfirmDialog`, jamais de
  `confirm()` natif).
- **Q2** — Tri d'inventaire par **zone** et par **poids**.
- **Q3** — Arbre de compétences : **mode édition** (on place tous les points,
  un seul appel API à la validation au lieu d'un appel par point) + bouton
  « remplir une branche ».
- **Q4** — Taverne : afficher les **bonus de stats** (comme la fiche perso)
  plutôt que les stats globales.
- **Q5** — Arène : refonte UI/UX, **podium des champions** de la semaine
  précédente, et `x20` affiché sur les quantités de récompenses.

### 🟡 Systèmes

- **S1** — Donjons : **cooldown proportionnel à la progression** (donjon fait à
  50% → 50% du cooldown).
- **S2** — Donjons : **skip** possible si déjà réussi auparavant.
- **S3** — Pantin d'entraînement : combats illimités pour tester et ajuster une
  compo.
- **S4** — Expéditions : **arbre de compétences dédié** + possibilité de lancer
  une expédition sans immobiliser les héros.

### 🔵 Équilibrage (avec `npm run sim`, pas à l'œil)

- **E1** — **Nerf des soins.**
- **E2** — Rééquilibrer la puissance des classes pour qu'elle reflète leur rôle.

### ⚫ Infra

- **I1** — **Connexion Google** (OAuth). Demande une action manuelle : créer le
  client OAuth sur Google Cloud et le renseigner dans Supabase → Auth →
  Providers. Le code front ne suffit pas.

## 📋 Backlog (pas pour ce soir, mais évoqué)

- **Sprites du bestiaire** : donner un vrai design à chaque monstre de carte
  (Loup, Gobelin, Ogre, Kraken…), en réutilisant le système d'archétypes SVG
  déjà en place pour les squelettes (`FighterSprite.tsx`/`skeletonVariant`).
  Effort estimé : ~15-30 min par espèce, une fois le mapping nom→espèce posé.
- **Boss Rush / champ de bataille multi-boss** (2-3 boss simultanés, chacun sa
  mécanique) — évoqué comme idée à fort impact visuel, pas encore designé.
- **Bestiaire/Codex joueur** : suivi des espèces tuées + petit bonus permanent
  par espèce maîtrisée.
- **Affinités de type** (pierre-feuille-ciseaux entre dégâts et familles de
  monstres).
- **Boutique d'event** : dépenser la monnaie d'event contre des cosmétiques.
- Finir le boss de la semaine (`supabase/functions/world-boss/index.ts`) : les
  TODO marqués dans le fichier (résolution du combat de la frappe, payout des
  paliers communs, finalisation hebdo du classement + titres, application du
  % de stats du titre en combat).

## ⚠️ Rappel technique (piège déjà rencontré)

`supabase db push` est cassé sur ce projet (historique de migrations distant en
timestamps, fichiers locaux numérotés `00XX` — divergence jamais réconciliée).
**Ne pas lancer `supabase migration repair --status reverted ...`** (détruirait
l'historique distant). Appliquer les nouvelles migrations en collant leur SQL
dans **Supabase → SQL Editor → Run** (elles sont écrites idempotentes : `if not
exists` / `or replace` / `on conflict do nothing`).
