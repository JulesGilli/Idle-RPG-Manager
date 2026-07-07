-- 0050_redeem_codes.sql
-- Codes de redeem : codes secrets → récompenses exclusives (or / matériaux / objet
-- ultime), 1 réclamation par joueur et par code. Codes non lisibles côté client
-- (secrets) : aucune policy select sur redeem_codes → seul le service_role y accède.

create table public.redeem_codes (
  code       text primary key,                 -- déjà normalisé (majuscules)
  reward     jsonb not null,                    -- { gold?, materials?: [{key,qty}], item? }
  max_uses   int,                               -- null = illimité
  uses       int  not null default 0,
  expires_at timestamptz,                       -- null = pas d'expiration
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.redeem_codes enable row level security;
-- Volontairement AUCUNE policy : les codes restent secrets (service_role only).

create table public.redeem_claims (
  code       text not null references public.redeem_codes (code) on delete cascade,
  player_id  uuid not null references public.profiles (id) on delete cascade,
  granted    jsonb not null,
  created_at timestamptz not null default now(),
  primary key (code, player_id)
);

create index redeem_claims_player_idx on public.redeem_claims (player_id);

alter table public.redeem_claims enable row level security;

-- Le joueur voit ses propres réclamations (pour l'historique). Écriture service_role.
create policy "redeem_claims own" on public.redeem_claims
  for select to authenticated using (player_id = auth.uid());
