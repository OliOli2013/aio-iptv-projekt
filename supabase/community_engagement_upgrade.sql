-- ============================================================================
-- SPOŁECZNOŚĆ AIO — filtry, rozwiązane tematy, najlepsze odpowiedzi i statystyki
-- Wersja: 2026-07-27 community9
-- Uruchom raz w Supabase -> SQL Editor -> New query -> Run.
-- Skrypt nie usuwa użytkowników, postów, komentarzy ani istniejących reakcji.
-- ============================================================================

begin;

alter table public.community_posts
  add column if not exists solved boolean not null default false,
  add column if not exists best_comment_id uuid,
  add column if not exists solved_at timestamptz,
  add column if not exists solved_by uuid references public.community_profiles(id) on delete set null,
  add column if not exists comment_count integer not null default 0,
  add column if not exists reaction_count integer not null default 0;

alter table public.community_posts
  drop constraint if exists community_posts_comment_count_check;
alter table public.community_posts
  add constraint community_posts_comment_count_check check (comment_count >= 0);
alter table public.community_posts
  drop constraint if exists community_posts_reaction_count_check;
alter table public.community_posts
  add constraint community_posts_reaction_count_check check (reaction_count >= 0);

create index if not exists community_posts_solved_idx
  on public.community_posts(status, solved, created_at desc);
create index if not exists community_posts_unanswered_idx
  on public.community_posts(status, solved, comment_count, created_at desc);
create index if not exists community_posts_popular_idx
  on public.community_posts(status, reaction_count desc, comment_count desc, created_at desc);

-- Uzupełnienie liczników dla dotychczasowych danych.
update public.community_posts p
set comment_count = (
      select count(*)::integer from public.community_comments c
      where c.post_id = p.id and c.status = 'published'
    ),
    reaction_count = (
      select count(*)::integer from public.community_reactions r
      where r.post_id = p.id
    );

create or replace function public.community_sync_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_post uuid;
  previous_post uuid;
begin
  current_post := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
  previous_post := case when tg_op = 'UPDATE' then old.post_id else null end;

  if current_post is not null then
    update public.community_posts p
    set comment_count = (
      select count(*)::integer from public.community_comments c
      where c.post_id = current_post and c.status = 'published'
    )
    where p.id = current_post;
  end if;

  if previous_post is not null and previous_post is distinct from current_post then
    update public.community_posts p
    set comment_count = (
      select count(*)::integer from public.community_comments c
      where c.post_id = previous_post and c.status = 'published'
    )
    where p.id = previous_post;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists community_comments_sync_count on public.community_comments;
create trigger community_comments_sync_count
after insert or delete or update of status, post_id on public.community_comments
for each row execute function public.community_sync_comment_count();

create or replace function public.community_sync_reaction_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_post uuid;
  previous_post uuid;
begin
  current_post := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
  previous_post := case when tg_op = 'UPDATE' then old.post_id else null end;

  if current_post is not null then
    update public.community_posts p
    set reaction_count = (
      select count(*)::integer from public.community_reactions r
      where r.post_id = current_post
    )
    where p.id = current_post;
  end if;

  if previous_post is not null and previous_post is distinct from current_post then
    update public.community_posts p
    set reaction_count = (
      select count(*)::integer from public.community_reactions r
      where r.post_id = previous_post
    )
    where p.id = previous_post;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists community_reactions_sync_count on public.community_reactions;
create trigger community_reactions_sync_count
after insert or delete or update of post_id, type on public.community_reactions
for each row execute function public.community_sync_reaction_count();

-- Publiczna funkcja udostępnia wyłącznie zbiorcze liczniki, nigdy treść postów,
-- adresy e-mail, profile, zdjęcia ani adresy IP.
create or replace function public.community_public_stats()
returns table (
  users bigint,
  posts bigint,
  comments bigint,
  reactions bigint,
  solved bigint,
  unanswered bigint,
  new_posts_7d bigint,
  new_comments_7d bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.community_profiles),
    (select count(*) from public.community_posts where status = 'published'),
    (select count(*) from public.community_comments where status = 'published'),
    (select count(*) from public.community_reactions),
    (select count(*) from public.community_posts where status = 'published' and kind = 'community' and solved = true),
    (select count(*) from public.community_posts where status = 'published' and kind = 'community' and solved = false and comment_count = 0),
    (select count(*) from public.community_posts where status = 'published' and created_at >= now() - interval '7 days'),
    (select count(*) from public.community_comments where status = 'published' and created_at >= now() - interval '7 days');
$$;

revoke all on function public.community_public_stats() from public;
grant execute on function public.community_public_stats() to anon, authenticated, service_role;

commit;

-- Kontrola:
-- select * from public.community_public_stats();
-- select id, title, solved, best_comment_id, comment_count, reaction_count
-- from public.community_posts order by created_at desc limit 10;
