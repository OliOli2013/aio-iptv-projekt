-- ============================================================================
-- SPOŁECZNOŚĆ AIO — rodzaje wpisów i edycja przez administrację
-- Wersja: 2026-07-28 community10
-- Uruchom raz w Supabase -> SQL Editor -> New query -> Run.
-- Skrypt nie usuwa użytkowników, postów, komentarzy, zdjęć ani reakcji.
-- ============================================================================

begin;

alter table public.community_posts
  add column if not exists post_type text not null default 'problem',
  add column if not exists edited_at timestamptz,
  add column if not exists edited_by uuid references public.community_profiles(id) on delete set null,
  add column if not exists edit_reason text;

alter table public.community_posts
  drop constraint if exists community_posts_post_type_check;
alter table public.community_posts
  add constraint community_posts_post_type_check
  check (post_type in ('problem','information','update','guide','discussion'));

alter table public.community_posts
  drop constraint if exists community_posts_edit_reason_check;
alter table public.community_posts
  add constraint community_posts_edit_reason_check
  check (edit_reason is null or char_length(edit_reason) <= 300);

-- Dotychczasowe wpisy oficjalne traktujemy jako aktualizacje/komunikaty.
update public.community_posts
set post_type = 'update'
where kind = 'official' and post_type = 'problem';

create index if not exists community_posts_type_status_idx
  on public.community_posts(post_type, status, created_at desc);
create index if not exists community_posts_edited_idx
  on public.community_posts(edited_at desc)
  where edited_at is not null;

commit;

-- Kontrola:
-- select id, title, post_type, edited_at, edit_reason
-- from public.community_posts order by created_at desc limit 20;
