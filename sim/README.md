# Banc de test d'équilibrage (`sim/`)

Simulateur **headless** qui rejoue le **vrai moteur de combat** du jeu
(`shared/combat/resolveCombat.ts` + `shared/progression/*`) sur tout le contenu,
pour tester l'équilibrage sans lancer l'app. Déterministe : deux passes
identiques donnent exactement les mêmes chiffres.

## Lancer

```bash
npm run sim                    # passe complète → sim/reports/latest.md + CSV
npm run sim -- --snapshot      # force le snapshot (ignore la DB live)
npm run sim -- --refresh-snapshot   # régénère le snapshot depuis la DB (service key requise)
```

Durée ~2-3 s. Résultats dans `sim/reports/` :
- `latest.md` — rapport lisible (tables + verdict automatique). **Versionné** = baseline pour diff.
- `zones.csv`, `solo.csv`, `tower.csv` — données brutes pour Excel.

## Source des données (ennemis, classes, zones)

1. **Live** — si `SUPABASE_SERVICE_ROLE_KEY` est dans `.env.local`, lecture DB
   en direct (bypass le RLS `authenticated only`). Toujours à jour avec la prod.
2. **Snapshot** — sinon, lecture de `sim/data/enemies.snapshot.json` (fallback
   versionné). Rafraîchi via l'agent (accès Supabase MCP) ou `--refresh-snapshot`.

Pour activer le mode live : copie ta `service_role` key (dashboard Supabase →
Project Settings → API) dans `.env.local` :

```
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

⚠️ Clé **secrète** — `.env.local` est déjà gitignored, ne jamais la commit.

## Ce qui est testé (v1 : Zones + Tour)

- **Zones — escouade** : 5 héros (une de chaque classe) × 3 profils de stuff ×
  10 zones × 5 niveaux. C'est le contenu réel des maps.
- **Zones — probe solo** : chaque classe seule contre le contenu de zone. Sert à
  comparer la **puissance brute des classes entre elles** (pas un pass/fail).
- **Tour** : chaque classe grimpe sa tour en solo × 3 profils → étage max atteint.

### Les 3 profils de stuff

| Profil | Matériau forge | Rareté | Amélioration | Représente |
|--------|----------------|--------|--------------|------------|
| under  | zone −1        | common | +0           | joueur qui rush, sous-équipé |
| on     | zone           | uncommon | +2         | stuff attendu, calibré |
| over   | zone           | ultimate | +5         | joueur qui farm avant d'avancer |

Le stuff est généré via les **vraies formules de forge** (`craftItemAtRarity`,
`rollBonuses`, `effectiveBonus`), donc un héros simulé = un vrai héros équipé.

## Régler ce qui est testé

Tout est dans **`sim/config.ts`** (un seul fichier) :
- `GEAR_PROFILES` — matériau/rareté/amélioration de chaque profil.
- `LEVEL_FOR_ZONE` — niveau de héros attendu par zone.
- `SQUAD_COMP` — composition de l'escouade type.
- `SEEDS_PER_SCENARIO` — nombre de combats par scénario (précision vs vitesse).
- `BALANCE_TARGETS` — cibles qui pilotent le verdict automatique.

## Limites connues (v1)

- **Compétences** : héros testés **sans arbre de compétence** (baseline brute).
  Câbler un build par classe = phase 2 (voir `TEST_PLAN.md`).
- **Sets** : aucun set équipé (baseline). Phase 2.
- **Contenu** : donjons, arène, boss d'arc, expéditions = pas encore couverts.
- Le snapshot doit être rafraîchi après un changement d'équilibrage en DB (ou
  utiliser le mode live).

Voir `TEST_PLAN.md` pour la check-list complète et la roadmap.
