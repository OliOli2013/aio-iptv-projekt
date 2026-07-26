-- ============================================================================
-- SPOŁECZNOŚĆ AIO — długie posty, historia moderacji i blokady bezpieczeństwa
-- Wersja: 2026-07-26 community5
-- Uruchom raz w Supabase -> SQL Editor -> New query -> Run.
-- Ten plik NIE zmienia prywatnego dostępu do postów i zdjęć.
-- ============================================================================

begin;

-- 1. Dłuższe wpisy i komentarze.
alter table public.community_posts
  drop constraint if exists community_posts_content_check;
alter table public.community_posts
  add constraint community_posts_content_check
  check (char_length(content) between 20 and 50000);

alter table public.community_comments
  drop constraint if exists community_comments_content_check;
alter table public.community_comments
  add constraint community_comments_content_check
  check (char_length(content) between 2 and 10000);

-- 2. Dodatkowe informacje o blokadach konta.
alter table public.community_profiles
  add column if not exists ban_reason text,
  add column if not exists banned_by uuid references public.community_profiles(id) on delete set null,
  add column if not exists banned_at timestamptz;

alter table public.community_profiles
  drop constraint if exists community_profiles_ban_reason_check;
alter table public.community_profiles
  add constraint community_profiles_ban_reason_check
  check (ban_reason is null or char_length(ban_reason) <= 500);

-- Ochrona pól administracyjnych przed zmianą przez zwykłego użytkownika.
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
      new.ban_reason := old.ban_reason;
      new.banned_by := old.banned_by;
      new.banned_at := old.banned_at;
    elsif not public.community_is_full_admin(auth.uid()) then
      new.role := old.role;
      if old.role = 'admin' then
        new.trusted := old.trusted;
        new.banned_until := old.banned_until;
        new.ban_reason := old.ban_reason;
        new.banned_by := old.banned_by;
        new.banned_at := old.banned_at;
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

-- 3. Historia adresów IP używanych podczas wejścia, publikowania i komentowania.
-- Dane są widoczne wyłącznie dla administratorów/moderatorów.
create table if not exists public.community_user_ips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.community_profiles(id) on delete cascade,
  ip_address inet not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  event_count integer not null default 1 check (event_count > 0),
  last_event text not null default 'access' check (last_event in ('access','post','comment','reaction','report','delete')),
  unique (user_id, ip_address)
);
create index if not exists community_user_ips_user_last_idx
  on public.community_user_ips(user_id, last_seen_at desc);
create index if not exists community_user_ips_ip_last_idx
  on public.community_user_ips(ip_address, last_seen_at desc);

-- 4. Blokady adresów IP. Adres IP jest zabezpieczeniem dodatkowym, ponieważ
-- może być dynamiczny, współdzielony lub zmieniony przez VPN.
create table if not exists public.community_ip_blocks (
  id uuid primary key default gen_random_uuid(),
  ip_address inet not null,
  reason text not null default 'Naruszenie zasad społeczności',
  permanent boolean not null default false,
  expires_at timestamptz,
  active boolean not null default true,
  target_user_id uuid references public.community_profiles(id) on delete set null,
  created_by uuid references public.community_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ip_address)
);
create index if not exists community_ip_blocks_active_idx
  on public.community_ip_blocks(active, permanent, expires_at);

alter table public.community_ip_blocks
  drop constraint if exists community_ip_blocks_reason_check;
alter table public.community_ip_blocks
  add constraint community_ip_blocks_reason_check
  check (char_length(reason) between 3 and 500);

-- 5. Dziennik czynności administratora i moderatorów.
create table if not exists public.community_moderation_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.community_profiles(id) on delete set null,
  target_user_id uuid references public.community_profiles(id) on delete set null,
  target_type text not null default 'user' check (target_type in ('user','post','comment','report','ip')),
  target_id text,
  action text not null,
  reason text,
  ip_address inet,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists community_moderation_log_created_idx
  on public.community_moderation_log(created_at desc);
create index if not exists community_moderation_log_target_user_idx
  on public.community_moderation_log(target_user_id, created_at desc);

-- 6. Automatyczne znaczniki czasu.
create or replace function public.community_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists community_ip_blocks_touch on public.community_ip_blocks;
create trigger community_ip_blocks_touch
before update on public.community_ip_blocks
for each row execute function public.community_touch_updated_at();

-- 7. Kontrola aktywnej blokady IP używana przez funkcje Edge.
create or replace function public.community_ip_is_blocked(client_ip inet)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_ip_blocks b
    where b.ip_address = client_ip
      and b.active = true
      and (b.permanent = true or b.expires_at is null or b.expires_at > now())
  );
$$;
revoke all on function public.community_ip_is_blocked(inet) from public;
grant execute on function public.community_ip_is_blocked(inet) to authenticated, service_role;

-- 8. RLS — informacje o IP i historii moderacji są prywatne.
alter table public.community_user_ips enable row level security;
alter table public.community_ip_blocks enable row level security;
alter table public.community_moderation_log enable row level security;

drop policy if exists community_user_ips_admin_read on public.community_user_ips;
create policy community_user_ips_admin_read
on public.community_user_ips for select to authenticated
using (public.community_is_admin());

drop policy if exists community_ip_blocks_admin_read on public.community_ip_blocks;
create policy community_ip_blocks_admin_read
on public.community_ip_blocks for select to authenticated
using (public.community_is_admin());

drop policy if exists community_moderation_log_admin_read on public.community_moderation_log;
create policy community_moderation_log_admin_read
on public.community_moderation_log for select to authenticated
using (public.community_is_admin());

-- Zapisy do tych tabel wykonują wyłącznie funkcje Edge przy użyciu service_role.
grant select on public.community_user_ips, public.community_ip_blocks, public.community_moderation_log to authenticated;
revoke insert, update, delete on public.community_user_ips, public.community_ip_blocks, public.community_moderation_log from anon, authenticated;

commit;

-- Kontrola:
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid in ('public.community_posts'::regclass, 'public.community_comments'::regclass)
--   and conname like '%content_check';
