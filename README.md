# Idle-RPG Manager

Jeu web idle-RPG de gestion (inspiré de Panoptyca). Le joueur dirige une escouade
de héros à travers des donjons, combat auto-résolu **côté serveur**, avec un
classement global asynchrone. 100% PvE, aucune interaction directe entre joueurs.

## Stack

- **Front** : React 18 + TypeScript strict + Vite + Tailwind v4
- **State** : Zustand (session) + TanStack Query (data/cache)
- **Backend** : Supabase (Postgres + Auth + RLS + Edge Function Deno)
- **Auth** : email / magic-link (Google OAuth branchable ensuite)

## Architecture

```
/shared            code TS pur partagé front + Edge Function (source unique)
  /combat          resolveCombat() déterministe (PRNG seedé) + types
  /progression     stats effectives, XP/level-up, loot seedé
/src
  /components       UI réutilisable (HeroCard, AppLayout…)
  /features         auth / heroes / dungeons / leaderboard
  /hooks            hooks React Query
  /store            stores Zustand (authStore)
  /lib              supabaseClient + database.types (générés)
/supabase
  /functions/resolve-dungeon-run   Edge Function (combat côté serveur)
  /migrations                      SQL versionné
```

**Anti-triche** : les tables `heroes` / `items` / `dungeon_runs` sont **SELECT-only**
côté client (RLS). Toute mutation de progression passe par l'Edge Function
(service role) ou par les RPC `equip_item` / `unequip_item` (SECURITY DEFINER avec
validation d'ownership). Le client n'envoie qu'une intention ; le serveur calcule.

## Démarrage local

1. `npm install`
2. Copier `.env.example` → `.env.local` et renseigner l'URL + la clé publishable
   Supabase (déjà fait en local ; voir dashboard Supabase → Project Settings → API).
3. `npm run dev` → http://localhost:5173

### Premier login (action manuelle requise)

L'auth se fait par **lien magique** : saisis ton email, ouvre le mail reçu, clique
le lien. À la première connexion, un trigger crée automatiquement ton profil + une
escouade de départ (Tank / DPS / Soigneur). Lance ensuite un donjon depuis l'onglet
**Donjons**.

## Scripts

| Commande         | Effet                     |
| ---------------- | ------------------------- |
| `npm run dev`    | Serveur de dev Vite       |
| `npm run build`  | Typecheck + build de prod |
| `npm test`       | Tests unitaires (Vitest)  |
| `npm run lint`   | ESLint                    |
| `npm run format` | Prettier                  |

## Backend (Supabase Cloud)

- Projet : `idle-rpg-manager` (ref `vbfguqzfhedcuaygzhez`, région eu-west-3).
- Migrations dans `supabase/migrations/` (appliquées sur le cloud).
- Edge Function principale (`verify_jwt` activé) :
  - `resolve-deployment` — cœur idle maps/niveaux (deploy/undeploy/setmode/claim).
    Au claim, simule les combats accumulés depuis `last_resolved_at` pour chaque
    groupe (victoire→loot/xp/ressources/déblocage/avance, défaite→recul, full vie),
    plafond hors-ligne, dernier combat stocké pour le replay.
  - `resolve-dungeon-run` / `resolve-expedition` — legacy (systèmes remplacés).

## Choix & compromis assumés

- **Leaderboard = vue `security definer`** : l'advisor Supabase la signale (ERROR)
  car elle contourne la RLS. C'est **intentionnel** — c'est le pattern documenté
  pour exposer des agrégats cross-joueurs ; elle n'expose que `display_name` +
  puissance/progression. Alternative pour la V2 : table `player_stats` dénormalisée
  maintenue côté serveur (meilleure scalabilité, sans le lint).
- **RNG seedé** : la seed de chaque combat est stockée dans `dungeon_runs.seed`,
  les combats sont donc rejouables et les tests déterministes.

## Boucle de jeu (maps / niveaux idle)

- **Carte** : 2 maps × 5 niveaux, difficulté croissante. On déploie des groupes
  de héros (jusqu'à 5) sur les niveaux — séparés ou ensemble.
- **Idle auto** : chaque groupe enchaîne les combats en continu. Mode **Avancer**
  (progresse au niveau suivant sur victoire) ou **Boucle** (farm le même niveau).
  Full vie à chaque combat ; défaite = recul d'un niveau (le suivant reste
  débloqué une fois battu au moins une fois). Gains réclamés d'un clic + **replay**
  du dernier combat.
- **Village** : or, fer, essence (ressources de craft). Forge & amélioration à venir.
- **Équipement** : 4 slots par héros (arme, armure, bijou, relique), drops en
  farmant. L'or et la puissance alimentent le classement.

## Hors scope (archi laissée ouverte)

Guildes, craft, >3 classes, monétisation, sink pour l'or (upgrades).
**PvP : choix de design, jamais implémenté.**
