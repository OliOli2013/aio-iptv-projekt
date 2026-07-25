-- ============================================================
-- SPOŁECZNOŚĆ AIO — kompletna konfiguracja Supabase
-- Wersja: 2026-07-25 community1
-- Uruchom cały plik w: Supabase -> SQL Editor -> New query -> Run
-- Plik można uruchomić ponownie; większość operacji jest idempotentna.
-- ============================================================

create extension if not exists pgcrypto;

-- 1. PROFILE UŻYTKOWNIKÓW
create table if not exists public.community_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Użytkownik' check (char_length(display_name) between 2 and 60),
  avatar_url text,
  tuner_model text,
  system_name text,
  system_version text,
  python_version text,
  bio text check (bio is null or char_length(bio) <= 600),
  role text not null default 'user' check (role in ('user','moderator','admin')),
  trusted boolean not null default false,
  banned_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.community_is_admin(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.community_profiles
    where id = user_id
      and role in ('admin','moderator')
      and (banned_until is null or banned_until <= now())
  );
$$;

create or replace function public.community_is_full_admin(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.community_profiles
    where id = user_id
      and role = 'admin'
      and (banned_until is null or banned_until <= now())
  );
$$;

create or replace function public.community_is_banned(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.community_profiles
    where id = user_id and banned_until is not null and banned_until > now()
  );
$$;

create or replace function public.community_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.community_profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'Użytkownik'), 60),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists community_create_profile_after_signup on auth.users;
create trigger community_create_profile_after_signup
after insert on auth.users
for each row execute function public.community_new_user_profile();

-- Uzupełnienie profili dla istniejących kont Auth.
insert into public.community_profiles (id, display_name, avatar_url)
select id,
       left(coalesce(raw_user_meta_data->>'display_name', raw_user_meta_data->>'full_name', split_part(email, '@', 1), 'Użytkownik'), 60),
       raw_user_meta_data->>'avatar_url'
from auth.users
on conflict (id) do nothing;

-- 2. POSTY
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.community_profiles(id) on delete cascade,
  kind text not null default 'community' check (kind in ('community','official')),
  category text not null default 'inne' check (category in ('pomoc','aio-panel','iptv','kanaly','picony','oscam','systemy','wtyczki','aplikacje','testy','inne')),
  title text not null check (char_length(title) between 6 and 140),
  content text not null check (char_length(content) between 20 and 6000),
  status text not null default 'pending' check (status in ('pending','published','rejected','hidden')),
  pinned boolean not null default false,
  featured boolean not null default false,
  locked boolean not null default false,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists community_posts_status_created_idx on public.community_posts(status, created_at desc);
create index if not exists community_posts_author_idx on public.community_posts(author_id, created_at desc);
create index if not exists community_posts_kind_idx on public.community_posts(kind, status, pinned desc, created_at desc);
create index if not exists community_posts_category_idx on public.community_posts(category, status, created_at desc);

-- 3. KOMENTARZE
create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.community_profiles(id) on delete cascade,
  parent_id uuid references public.community_comments(id) on delete cascade,
  content text not null check (char_length(content) between 2 and 3000),
  status text not null default 'published' check (status in ('pending','published','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists community_comments_post_idx on public.community_comments(post_id, created_at);
create index if not exists community_comments_author_idx on public.community_comments(author_id, created_at desc);

-- 4. REAKCJE
create table if not exists public.community_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.community_profiles(id) on delete cascade,
  type text not null check (type in ('helpful','works','thanks')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists community_reactions_post_idx on public.community_reactions(post_id);

-- 5. OBSERWOWANIE WPISÓW
create table if not exists public.community_subscriptions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- 6. ZGŁOSZENIA MODERACYJNE
create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.community_profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','profile')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 3 and 120),
  details text check (details is null or char_length(details) <= 1200),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  reviewed_by uuid references public.community_profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists community_reports_status_idx on public.community_reports(status, created_at);

-- 7. POWIADOMIENIA
create table if not exists public.community_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.community_profiles(id) on delete cascade,
  actor_id uuid references public.community_profiles(id) on delete set null,
  type text not null check (type in ('comment','reply','post_approved','post_rejected','moderation')),
  post_id uuid references public.community_posts(id) on delete cascade,
  comment_id uuid references public.community_comments(id) on delete cascade,
  message text not null check (char_length(message) <= 300),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists community_notifications_user_idx on public.community_notifications(user_id, read_at, created_at desc);

-- 8. FUNKCJE WALIDUJĄCE I LIMITY
create or replace function public.community_prepare_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean := public.community_is_admin(auth.uid());
  v_trusted boolean := false;
  v_count integer := 0;
begin
  if auth.uid() is not null and public.community_is_banned(auth.uid()) then
    raise exception 'Publikowanie z tego konta jest czasowo zablokowane.';
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      if new.author_id is null then new.author_id := auth.uid(); end if;
      if new.author_id <> auth.uid() and not v_admin then
        raise exception 'Nie możesz publikować jako inny użytkownik.';
      end if;
      if not v_admin then
        select count(*) into v_count from public.community_posts
        where author_id = auth.uid() and created_at > now() - interval '1 hour';
        if v_count >= 5 then raise exception 'Limit: maksymalnie 5 nowych wpisów na godzinę.'; end if;
        select trusted into v_trusted from public.community_profiles where id = auth.uid();
        new.kind := 'community';
        new.pinned := false;
        new.featured := false;
        new.locked := false;
        new.status := case when coalesce(v_trusted, false) then 'published' else 'pending' end;
      elsif new.status is null or new.status = 'pending' then
        new.status := 'published';
      end if;
    end if;
    if new.status = 'published' then new.published_at := coalesce(new.published_at, now()); end if;
  elsif tg_op = 'UPDATE' and auth.uid() is not null and not v_admin then
    new.author_id := old.author_id;
    new.kind := old.kind;
    new.status := old.status;
    new.pinned := old.pinned;
    new.featured := old.featured;
    new.locked := old.locked;
    new.published_at := old.published_at;
  end if;
  if jsonb_typeof(coalesce(new.attachments, '[]'::jsonb)) <> 'array' then
    raise exception 'Nieprawidłowy format załączników.';
  end if;
  if jsonb_array_length(coalesce(new.attachments, '[]'::jsonb)) > 4 then
    raise exception 'Można dodać maksymalnie 4 zdjęcia.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(new.attachments, '[]'::jsonb)) item
    where coalesce(item->>'path','') not like new.author_id::text || '/%'
       or coalesce(item->>'type','') not like 'image/%'
  ) then
    raise exception 'Załączniki muszą pochodzić z własnego katalogu community-media.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists community_posts_prepare on public.community_posts;
create trigger community_posts_prepare
before insert or update on public.community_posts
for each row execute function public.community_prepare_post();

create or replace function public.community_prepare_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean := public.community_is_admin(auth.uid());
  v_locked boolean := false;
  v_parent_post uuid;
  v_count integer := 0;
begin
  if auth.uid() is not null and public.community_is_banned(auth.uid()) then
    raise exception 'Komentowanie z tego konta jest czasowo zablokowane.';
  end if;
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      if new.author_id is null then new.author_id := auth.uid(); end if;
      if new.author_id <> auth.uid() and not v_admin then raise exception 'Nie możesz komentować jako inny użytkownik.'; end if;
      select count(*) into v_count from public.community_comments
      where author_id = auth.uid() and created_at > now() - interval '1 hour';
      if v_count >= 30 and not v_admin then raise exception 'Limit: maksymalnie 30 komentarzy na godzinę.'; end if;
    end if;
    select locked into v_locked from public.community_posts where id = new.post_id;
    if coalesce(v_locked, false) and not v_admin then raise exception 'Komentarze do tego wpisu są zablokowane.'; end if;
    if new.parent_id is not null then
      select post_id into v_parent_post from public.community_comments where id = new.parent_id;
      if v_parent_post is null or v_parent_post <> new.post_id then raise exception 'Odpowiedź musi dotyczyć komentarza z tego samego wpisu.'; end if;
    end if;
    new.status := 'published';
  elsif tg_op = 'UPDATE' and auth.uid() is not null and not v_admin then
    new.post_id := old.post_id;
    new.author_id := old.author_id;
    new.parent_id := old.parent_id;
    new.status := old.status;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists community_comments_prepare on public.community_comments;
create trigger community_comments_prepare
before insert or update on public.community_comments
for each row execute function public.community_prepare_comment();

create or replace function public.community_profile_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null then
    if not public.community_is_admin(auth.uid()) then
      new.role := old.role;
      new.trusted := old.trusted;
      new.banned_until := old.banned_until;
    elsif not public.community_is_full_admin(auth.uid()) then
      -- Moderator może oznaczać zwykłe konta jako zaufane i nakładać blokady,
      -- ale nie może nadawać ról ani modyfikować kont administratorów.
      new.role := old.role;
      if old.role = 'admin' then
        new.trusted := old.trusted;
        new.banned_until := old.banned_until;
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists community_profiles_guard on public.community_profiles;
create trigger community_profiles_guard
before update on public.community_profiles
for each row execute function public.community_profile_guard();

-- 9. POWIADOMIENIA PO KOMENTARZU I MODERACJI
create or replace function public.community_notify_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_author uuid;
  v_post_title text;
  v_parent_author uuid;
  v_actor_name text;
begin
  if new.status <> 'published' then return new; end if;
  select author_id, title into v_post_author, v_post_title from public.community_posts where id = new.post_id;
  select display_name into v_actor_name from public.community_profiles where id = new.author_id;

  if v_post_author is not null and v_post_author <> new.author_id then
    insert into public.community_notifications(user_id, actor_id, type, post_id, comment_id, message)
    values (v_post_author, new.author_id, 'comment', new.post_id, new.id,
      coalesce(v_actor_name,'Użytkownik') || ' odpowiedział w: ' || left(v_post_title, 150));
  end if;

  if new.parent_id is not null then
    select author_id into v_parent_author from public.community_comments where id = new.parent_id;
    if v_parent_author is not null and v_parent_author <> new.author_id and v_parent_author <> v_post_author then
      insert into public.community_notifications(user_id, actor_id, type, post_id, comment_id, message)
      values (v_parent_author, new.author_id, 'reply', new.post_id, new.id,
        coalesce(v_actor_name,'Użytkownik') || ' odpowiedział na Twój komentarz.');
    end if;
  end if;

  insert into public.community_notifications(user_id, actor_id, type, post_id, comment_id, message)
  select s.user_id, new.author_id, 'comment', new.post_id, new.id,
         coalesce(v_actor_name,'Użytkownik') || ' dodał odpowiedź w obserwowanym wpisie.'
  from public.community_subscriptions s
  where s.post_id = new.post_id
    and s.user_id <> new.author_id
    and s.user_id <> coalesce(v_post_author, '00000000-0000-0000-0000-000000000000'::uuid)
    and s.user_id <> coalesce(v_parent_author, '00000000-0000-0000-0000-000000000000'::uuid);
  return new;
end;
$$;

drop trigger if exists community_comment_notification on public.community_comments;
create trigger community_comment_notification
after insert on public.community_comments
for each row execute function public.community_notify_comment();

create or replace function public.community_notify_post_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = new.status then return new; end if;
  if new.status = 'published' and old.status = 'pending' then
    insert into public.community_notifications(user_id, type, post_id, message)
    values (new.author_id, 'post_approved', new.id, 'Twój wpis „' || left(new.title, 150) || '” został zatwierdzony.');
  elsif new.status = 'rejected' and old.status = 'pending' then
    insert into public.community_notifications(user_id, type, post_id, message)
    values (new.author_id, 'post_rejected', new.id, 'Twój wpis „' || left(new.title, 150) || '” nie został opublikowany.');
  end if;
  return new;
end;
$$;

drop trigger if exists community_post_status_notification on public.community_posts;
create trigger community_post_status_notification
after update of status on public.community_posts
for each row execute function public.community_notify_post_status();

-- Usuwanie zdjęć wpisu z magazynu po usunięciu wpisu.
create or replace function public.community_cleanup_post_media()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  delete from storage.objects
  where bucket_id = 'community-media'
    and name in (
      select item->>'path'
      from jsonb_array_elements(coalesce(old.attachments, '[]'::jsonb)) item
      where item ? 'path'
    );
  return old;
end;
$$;

drop trigger if exists community_post_media_cleanup on public.community_posts;
create trigger community_post_media_cleanup
after delete on public.community_posts
for each row execute function public.community_cleanup_post_media();

-- 10. ROW LEVEL SECURITY
alter table public.community_profiles enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_reactions enable row level security;
alter table public.community_subscriptions enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_notifications enable row level security;

-- Profile
drop policy if exists community_profiles_public_read on public.community_profiles;
create policy community_profiles_public_read on public.community_profiles for select using (true);
drop policy if exists community_profiles_own_insert on public.community_profiles;
create policy community_profiles_own_insert on public.community_profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists community_profiles_own_or_admin_update on public.community_profiles;
create policy community_profiles_own_or_admin_update on public.community_profiles for update to authenticated using (id = auth.uid() or public.community_is_admin()) with check (id = auth.uid() or public.community_is_admin());

-- Posty
drop policy if exists community_posts_visible_read on public.community_posts;
create policy community_posts_visible_read on public.community_posts for select using (status = 'published' or author_id = auth.uid() or public.community_is_admin());
drop policy if exists community_posts_authenticated_insert on public.community_posts;
create policy community_posts_authenticated_insert on public.community_posts for insert to authenticated with check (author_id = auth.uid() and not public.community_is_banned());
drop policy if exists community_posts_owner_admin_update on public.community_posts;
create policy community_posts_owner_admin_update on public.community_posts for update to authenticated using (author_id = auth.uid() or public.community_is_admin()) with check (author_id = auth.uid() or public.community_is_admin());
drop policy if exists community_posts_owner_admin_delete on public.community_posts;
create policy community_posts_owner_admin_delete on public.community_posts for delete to authenticated using (author_id = auth.uid() or public.community_is_admin());

-- Komentarze
drop policy if exists community_comments_visible_read on public.community_comments;
create policy community_comments_visible_read on public.community_comments for select using (status = 'published' or author_id = auth.uid() or public.community_is_admin());
drop policy if exists community_comments_authenticated_insert on public.community_comments;
create policy community_comments_authenticated_insert on public.community_comments for insert to authenticated with check (author_id = auth.uid() and not public.community_is_banned());
drop policy if exists community_comments_owner_admin_update on public.community_comments;
create policy community_comments_owner_admin_update on public.community_comments for update to authenticated using (author_id = auth.uid() or public.community_is_admin()) with check (author_id = auth.uid() or public.community_is_admin());
drop policy if exists community_comments_owner_admin_delete on public.community_comments;
create policy community_comments_owner_admin_delete on public.community_comments for delete to authenticated using (author_id = auth.uid() or public.community_is_admin());

-- Reakcje
drop policy if exists community_reactions_public_read on public.community_reactions;
create policy community_reactions_public_read on public.community_reactions for select using (true);
drop policy if exists community_reactions_own_insert on public.community_reactions;
create policy community_reactions_own_insert on public.community_reactions for insert to authenticated with check (user_id = auth.uid() and not public.community_is_banned());
drop policy if exists community_reactions_own_update on public.community_reactions;
create policy community_reactions_own_update on public.community_reactions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists community_reactions_own_delete on public.community_reactions;
create policy community_reactions_own_delete on public.community_reactions for delete to authenticated using (user_id = auth.uid());

-- Obserwowanie
drop policy if exists community_subscriptions_own_read on public.community_subscriptions;
create policy community_subscriptions_own_read on public.community_subscriptions for select to authenticated using (user_id = auth.uid());
drop policy if exists community_subscriptions_own_insert on public.community_subscriptions;
create policy community_subscriptions_own_insert on public.community_subscriptions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists community_subscriptions_own_delete on public.community_subscriptions;
create policy community_subscriptions_own_delete on public.community_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Zgłoszenia
drop policy if exists community_reports_own_admin_read on public.community_reports;
create policy community_reports_own_admin_read on public.community_reports for select to authenticated using (reporter_id = auth.uid() or public.community_is_admin());
drop policy if exists community_reports_own_insert on public.community_reports;
create policy community_reports_own_insert on public.community_reports for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists community_reports_admin_update on public.community_reports;
create policy community_reports_admin_update on public.community_reports for update to authenticated using (public.community_is_admin()) with check (public.community_is_admin());

-- Powiadomienia
drop policy if exists community_notifications_own_read on public.community_notifications;
create policy community_notifications_own_read on public.community_notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists community_notifications_own_update on public.community_notifications;
create policy community_notifications_own_update on public.community_notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists community_notifications_own_delete on public.community_notifications;
create policy community_notifications_own_delete on public.community_notifications for delete to authenticated using (user_id = auth.uid());

-- 11. UPRAWNIENIA API
grant usage on schema public to anon, authenticated;
grant select on public.community_profiles, public.community_posts, public.community_comments, public.community_reactions to anon, authenticated;
grant insert, update on public.community_profiles to authenticated;
grant insert, update, delete on public.community_posts, public.community_comments, public.community_reactions, public.community_subscriptions to authenticated;
grant select on public.community_subscriptions, public.community_reports, public.community_notifications to authenticated;
grant insert on public.community_reports to authenticated;
grant update on public.community_reports, public.community_notifications to authenticated;
grant delete on public.community_notifications to authenticated;
grant execute on function public.community_is_admin(uuid) to anon, authenticated;
grant execute on function public.community_is_full_admin(uuid) to anon, authenticated;
grant execute on function public.community_is_banned(uuid) to anon, authenticated;

-- 12. PUBLICZNY MAGAZYN ZDJĘĆ
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-media', 'community-media', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists community_media_public_read on storage.objects;
create policy community_media_public_read on storage.objects for select using (bucket_id = 'community-media');
drop policy if exists community_media_own_insert on storage.objects;
create policy community_media_own_insert on storage.objects for insert to authenticated with check (bucket_id = 'community-media' and (storage.foldername(name))[1] = auth.uid()::text and not public.community_is_banned());
drop policy if exists community_media_own_update on storage.objects;
create policy community_media_own_update on storage.objects for update to authenticated using (bucket_id = 'community-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.community_is_admin())) with check (bucket_id = 'community-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.community_is_admin()));
drop policy if exists community_media_own_delete on storage.objects;
create policy community_media_own_delete on storage.objects for delete to authenticated using (bucket_id = 'community-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.community_is_admin()));

-- 13. REALTIME
-- Dodanie tabel do publikacji, tylko jeśli nie zostały dodane wcześniej.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='community_posts') then
    execute 'alter publication supabase_realtime add table public.community_posts';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='community_comments') then
    execute 'alter publication supabase_realtime add table public.community_comments';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='community_reactions') then
    execute 'alter publication supabase_realtime add table public.community_reactions';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='community_notifications') then
    execute 'alter publication supabase_realtime add table public.community_notifications';
  end if;
end $$;

-- ============================================================
-- PO PIERWSZYM LOGOWANIU NADAJ SOBIE ROLĘ ADMINISTRATORA.
-- Zastąp adres poniżej adresem użytym do logowania i uruchom osobno:
--
-- update public.community_profiles
-- set role = 'admin', trusted = true
-- where id = (select id from auth.users where email = 'TWOJ-EMAIL@DOMENA.PL');
--
-- Następnie odśwież community-admin.html.
-- ============================================================
