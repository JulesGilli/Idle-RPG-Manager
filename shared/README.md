# /shared

Code TypeScript pur **partagé entre le front (Vite) et les Edge Functions Supabase (Deno)**.

Règles :

- **Zéro dépendance** sur React, le DOM, `import.meta.env`, ou le runtime Deno/Node. Uniquement du TS standard.
- Pas d'I/O (pas de fetch, pas d'accès DB). Fonctions pures uniquement.
- Importé côté front via l'alias `@shared/*` (voir `vite.config.ts` / `tsconfig.app.json`).
- Importé côté Edge Function via un chemin relatif direct (Deno résout le `.ts`).

Contenu prévu :

- `combat/` — types de combat + `resolveCombat()` (simulateur pur, seedé) — PR3.
- `progression/` — formules XP / loot / puissance — PR3/PR4.
