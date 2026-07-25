# Idle-RPG Manager

Jeu web idle-RPG de gestion. Le joueur recrute et équipe une escouade de héros,
la déploie sur des activités (carte, tour, donjons, expéditions, événements) et
récolte le fruit de son farm — tous les combats sont résolus **côté serveur**.
Le jeu est PvE, complété par une arène PvP **asynchrone** (on affronte un
instantané figé de l'équipe adverse, jamais le joueur en direct).

Contenu en cours et backlog : voir [ROADMAP.md](ROADMAP.md).

## Stack technique

| Couche | Technologies |
| --- | --- |
| Front | React 18, TypeScript strict, Vite, Tailwind CSS v4 |
| État client | Zustand (session), TanStack Query (données serveur, cache, invalidation) |
| Backend | Supabase : Postgres (RLS), Auth, Edge Functions (Deno) |
| Logique de jeu | TypeScript pur dans `/shared`, partagé front + Edge Functions |
| Tests | Vitest (environ 1000 tests : moteur de combat, progression, économie, UI) |
| Simulation | Harnais `npm run sim` (tsx) pour l'équilibrage hors ligne |
| CI/CD | Build et déploiement du front automatiques sur push `main` (GitHub Actions) |

## Architecture

```
/shared                 Logique de jeu PURE et déterministe (aucune I/O).
  /combat               resolveCombat() : moteur au tour par tour, PRNG seedé,
                        capacités, statuts, invocations. Rejouable depuis une seed.
  /progression          Stats effectives, XP, loot, forge, sets, runes, divin,
                        donjons, tour, gauntlet, arcs (New Game+), guildes...
/src
  /components           UI réutilisable (CombatReplay, AppLayout, icônes...)
  /features             Un dossier par activité ou écran (maps, tower, dungeon,
                        expedition, arena, guild, worldboss, battlefield,
                        gauntlet, forge, heroes, runes, changelog...)
  /hooks                Hooks TanStack Query transverses (ressources, profil,
                        alertes d'action)
  /store                Stores Zustand (auth, alertes vues)
  /lib                  Client Supabase, types generes, helpers d'affichage
/supabase
  /functions            Une Edge Function par domaine (~25) : resolve-deployment,
                        forge, gauntlet, world-boss, arena, guild-actions...
                        Chaque fonction embarque SA copie de /shared au deploiement.
  /migrations           SQL versionne, ecrit idempotent
/sim                    Scenarios d'equilibrage executes hors ligne
/scripts                deploy-functions.mjs : deploiement groupe des fonctions
```

### Le principe central : `/shared`

Toute règle de jeu (dégâts, loot, coûts, courbes) vit dans `/shared` en
TypeScript pur, sans effet de bord, déterministe à seed donnée. Le front s'en
sert pour **afficher** (aperçus de coûts, prévisions), les Edge Functions pour
**décider** (résolution réelle). Une règle n'est donc jamais écrite deux fois,
et l'affichage ne peut pas promettre autre chose que ce que le serveur applique.

Corollaire : chaque Edge Function embarque sa propre copie de `/shared` au
déploiement. Un changement d'équilibrage impose de redéployer toutes les
fonctions concernées — c'est le rôle de `npm run deploy -- combat|all`, qui
groupe les fonctions pour éviter qu'une version périmée des règles ne tourne
sur une activité.

### Anti-triche

- Les tables de progression (`heroes`, `items`, `deployments`, ressources...)
  sont **SELECT-only** côté client (RLS). Le client n'envoie qu'une intention ;
  le serveur calcule, valide et écrit (service role ou RPC `SECURITY DEFINER`
  avec validation d'ownership).
- Les combats sont résolus côté serveur avec une **seed serveur**, stockée pour
  le replay : le client rejoue le combat à l'identique, il ne le calcule jamais.
- Les compteurs partagés (or, ressources, XP de compte) passent par des RPC
  atomiques (`x = x + n`). Les fenêtres de farm et les récompenses utilisent des
  compare-and-swap : deux onglets simultanés ne créditent jamais deux fois.
- Cooldowns et horloges : uniquement l'heure serveur.

## Systèmes de jeu

- **Carte** : le cœur du farm idle. Groupes en mode boucle (accumulation hors
  ligne, plafond 12 h) ou assauts manuels avec replay.
- **Activités** : la Tour (étages solo par poids), les donjons (chaînes de
  combats sans régénération), les expéditions (missions longues), le pantin
  (DPS check quotidien), les champs de bataille (10 contre 10).
- **Événements** : boss de la semaine (communautaire, classement hebdomadaire),
  le Gauntlet (vagues sans fin, rente quotidienne d'Éclat d'Éternité indexée sur
  le record), événements de week-end.
- **Social** : guildes (arbre de compétences, raids, garnison de prêt de héros),
  arène PvP asynchrone, classements.
- **Équipement** : craft uniquement (pas de drop d'équipement) — forge, sets,
  gemmes, runes, bénédiction, et qualité divine en fin de jeu.
- **Arcs (New Game+)** : le monde se rejoue en difficulté supérieure avec ses
  propres matériaux, sets et paliers de puissance.

## Démarrage local

1. `npm install`
2. Copier `.env.example` en `.env.local` et renseigner l'URL du projet Supabase
   et la clé publishable (dashboard Supabase, Project Settings, API).
3. `npm run dev` puis ouvrir http://localhost:5173

L'authentification se fait par lien magique (Google OAuth disponible). À la
première connexion, un trigger crée le profil et une escouade de départ.

## Scripts

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement Vite |
| `npm run build` | Typecheck + build de production |
| `npm run typecheck` | `tsc -b` seul |
| `npm test` | Tests unitaires (Vitest) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run sim` | Simulateur d'équilibrage (combats hors ligne) |
| `npm run deploy -- combat` | Déploie les fonctions qui résolvent du combat |
| `npm run deploy -- all` | Déploie toutes les Edge Functions |

## Backend (Supabase Cloud)

- Projet `idle-rpg-manager`, région eu-west-3.
- Toutes les fonctions exigent un JWT (`verify_jwt = true`, épinglé dans
  `supabase/config.toml`), à l'exception de `guild-raid` qui implémente sa
  propre authentification.
- **Migrations** : `supabase db push` est inutilisable sur ce projet (historique
  distant en timestamps, fichiers locaux numérotés — divergence jamais
  réconciliée). Les nouvelles migrations s'appliquent en collant leur SQL dans
  le SQL Editor du dashboard ; elles sont écrites idempotentes (`if not
  exists`, `or replace`, `on conflict`) pour être rejouables sans risque.
- Compromis assumé : le classement est exposé par une vue `security definer`
  (signalée par l'advisor Supabase). C'est le pattern documenté pour des
  agrégats cross-joueurs ; elle n'expose que nom d'affichage, puissance et
  progression.

## Déploiement

- **Front** : push sur `main` déclenche le build et le déploiement (GitHub
  Actions).
- **Edge Functions** : `npm run deploy -- <groupe|fonction...>` via le CLI
  Supabase. Toujours déployer le groupe `combat` après un changement dans
  `/shared/combat` ou `/shared/progression`.
