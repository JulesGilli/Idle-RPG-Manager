-- LIEN DE SOUTIEN (don) — piloté par `app_config`, comme la date de release.
--
-- Aucun paiement ne traverse le jeu : le bouton ouvre une page externe (Ko-fi,
-- PayPal, Stripe…). Le jeu ne voit ni carte, ni montant, ni identité — rien à
-- sécuriser côté serveur, et rien à stocker sur le joueur.
--
-- L'URL vit en base plutôt qu'en dur dans le bundle pour deux raisons :
--   • la changer (ou la RETIRER) ne demande aucun redéploiement ;
--   • tant qu'aucune URL n'est configurée, le bouton n'existe pas du tout.
--
-- `app_config` n'est pas lisible par le client (aucune policy de select) : d'où
-- ce RPC, calqué sur `release_info`, qui n'expose QUE ces deux clés.

create or replace function public.donate_info()
returns table (url text, label text)
language sql
security definer
set search_path = public
as $$
  select
    (select value from public.app_config where key = 'donate_url'),
    (select value from public.app_config where key = 'donate_label');
$$;

-- Lecture publique assumée : ce sont deux valeurs destinées à être affichées.
revoke all on function public.donate_info() from public;
grant execute on function public.donate_info() to anon, authenticated;
