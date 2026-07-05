-- 0039_chat.sql
-- CHAT temps réel : trois canaux — général (tous), guilde (membres) et messages
-- privés (entre deux joueurs). Les messages sont insérés directement par le
-- client (RLS), et diffusés via Supabase Realtime. Le nom de l'expéditeur est
-- posé côté serveur (trigger) pour éviter l'usurpation.

create table public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  channel      text not null check (channel in ('general', 'guild', 'dm')),
  guild_id     uuid references public.guilds (id) on delete cascade,
  sender_id    uuid not null references public.profiles (id) on delete cascade,
  sender_name  text not null default '',
  recipient_id uuid references public.profiles (id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 500),
  created_at   timestamptz not null default now(),
  -- Cohérence des canaux.
  constraint chat_guild_ok check (channel <> 'guild' or guild_id is not null),
  constraint chat_dm_ok    check (channel <> 'dm' or recipient_id is not null)
);

create index chat_general_idx on public.chat_messages (created_at desc) where channel = 'general';
create index chat_guild_idx   on public.chat_messages (guild_id, created_at desc) where channel = 'guild';
create index chat_dm_idx      on public.chat_messages (sender_id, recipient_id, created_at desc) where channel = 'dm';
create index chat_dm_recipient_idx on public.chat_messages (recipient_id, created_at desc) where channel = 'dm';

-- Nom d'expéditeur autoritatif (anti-usurpation).
create or replace function public.set_chat_sender_name()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  new.sender_name := coalesce(
    (select display_name from public.profiles where id = new.sender_id),
    'Joueur'
  );
  return new;
end;
$function$;

create trigger chat_sender_name
  before insert on public.chat_messages
  for each row execute function public.set_chat_sender_name();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.chat_messages enable row level security;

-- Lecture : général = tous ; guilde = membres de la guilde ; privé = expéditeur
-- ou destinataire.
create policy "chat select" on public.chat_messages
  for select to authenticated using (
    channel = 'general'
    or (
      channel = 'guild'
      and guild_id in (select gm.guild_id from public.guild_members gm where gm.player_id = (select auth.uid()))
    )
    or (channel = 'dm' and ((select auth.uid()) in (sender_id, recipient_id)))
  );

-- Écriture : on n'envoie qu'en son propre nom, sur un canal autorisé.
create policy "chat insert" on public.chat_messages
  for insert to authenticated with check (
    sender_id = (select auth.uid())
    and (
      channel = 'general'
      or (
        channel = 'guild'
        and guild_id in (select gm.guild_id from public.guild_members gm where gm.player_id = (select auth.uid()))
      )
      or (channel = 'dm' and recipient_id is not null and recipient_id <> sender_id)
    )
  );

-- -----------------------------------------------------------------------------
-- Realtime : diffuse les inserts (le filtrage suit la RLS ci-dessus).
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.chat_messages;
