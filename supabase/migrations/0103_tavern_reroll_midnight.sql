-- 0103_tavern_reroll_midnight.sql
-- Le prix du reroll de taverne se réinitialise à MINUIT, plus au renouvellement
-- du pool (22 h).
--
-- `paid_rerolls` était adossé à `tavern_state.day`, dont la période court de 22 h
-- à 22 h : le prix repartait donc à 1 en même temps que les recrues changeaient.
-- Il lui faut sa propre journée, sinon les deux horloges resteraient confondues.
--
-- Conséquence assumée : entre 22 h et minuit, le pool est neuf mais le compteur
-- de prix court encore. Un joueur qui a rerollé trois fois dans la soirée paiera
-- toujours 4 plumes à 22 h 05, et retombera à 1 seulement à minuit.
alter table public.tavern_state
  add column if not exists paid_rerolls_day text;

comment on column public.tavern_state.paid_rerolls_day is
  'Journee civile de Paris (YYYY-MM-DD, bornee a MINUIT) a laquelle se rapporte paid_rerolls. Distincte de `day`, qui suit la periode 22h-22h du pool de recrues.';

-- Les compteurs existants se rapportaient à la période 22 h : on les remet à zéro
-- plutôt que de deviner à quelle journée civile ils appartenaient. Au pire un
-- joueur gagne un reroll à 1 plume, ce qui est le bon sens de l'erreur.
update public.tavern_state set paid_rerolls = 0, paid_rerolls_day = null;
