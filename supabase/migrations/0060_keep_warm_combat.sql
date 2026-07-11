-- 0060_keep_warm_combat.sql
-- Anti « cold start » : les edge functions de combat s'endorment après quelques
-- minutes d'inactivité, ce qui donne un délai sur la 1re action d'un joueur qui
-- revient. On les garde au chaud avec un ping léger toutes les 4 minutes via
-- pg_cron + pg_net (déjà installés). Le ping utilise la clé ANON (publique, déjà
-- présente dans le front) : elle passe la passerelle, réveille l'isolat, puis la
-- fonction répond 401 (aucun user) — aucun effet de bord, juste de la chaleur.
--
-- Ne touche PAS au code de combat. Pour changer la cadence : modifier le cron ci-
-- dessous. Pour désactiver : select cron.unschedule('keep-warm-combat');

select cron.schedule(
  'keep-warm-combat',
  '*/4 * * * *',
  $$
  select net.http_post(
    url     := 'https://vbfguqzfhedcuaygzhez.supabase.co/functions/v1/' || fn,
    body    := '{"action":"__warm"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZiZmd1cXpmaGVkY3VheWd6aGV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MTA3NTYsImV4cCI6MjA5ODQ4Njc1Nn0.eBQH_QX7NNWZ3GvFekN4iuEAsiVWQMS5CFOZL2GterQ'
    ),
    timeout_milliseconds := 4000
  )
  from unnest(array[
    'resolve-deployment',
    'resolve-dungeon-run',
    'resolve-tower',
    'resolve-arc-boss',
    'arena'
  ]) as fn;
  $$
);
