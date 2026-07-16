-- Acharnement : échecs CONSÉCUTIFS encaissés sur un objet, remis à zéro dès la
-- première réussite. Chaque échec ajoute des points de réussite au tentative
-- suivante (PITY_STEP, shared/progression/forge.ts) — sans ça, le renforcement
-- est une marche aléatoire à dérive négative que rien ne borne : au palier
-- +9→+10 (32 % de base), une série noire fait payer plusieurs fois le coût et
-- finir plus bas qu'au départ.
--
-- Une seule colonne pour les deux mécaniques de recul : un objet est soit un
-- bijou (raffinage), soit une arme/armure/relique (renforcement), jamais les
-- deux — exactement comme `upgrade_level`, qu'elles partagent déjà.
alter table public.items
  add column if not exists upgrade_fails smallint not null default 0;

-- Lecture seule côté client : le compteur n'est écrit que par l'Edge Function
-- forge (service_role), qui est aussi la seule à tirer le dé. Aucun grant
-- d'écriture n'est ajouté.
