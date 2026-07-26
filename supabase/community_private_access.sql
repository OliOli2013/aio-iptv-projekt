-- ============================================================
-- SPOŁECZNOŚĆ AIO — prywatne posty, komentarze, profile i zdjęcia
-- Wersja: 2026-07-26 community4
-- Uruchom TEN PLIK RAZ w Supabase -> SQL Editor -> New query -> Run
-- Nie uruchamiaj ponownie starego community_setup.sql po tej migracji,
-- ponieważ stary plik ponownie ustawia publiczny dostęp.
-- ============================================================

begin;

-- Profile są dostępne wyłącznie po zalogowaniu.
drop policy if exists community_profiles_public_read on public.community_profiles;
drop policy if exists community_profiles_authenticated_read on public.community_profiles;
create policy community_profiles_authenticated_read
on public.community_profiles for select to authenticated
using (true);

-- Anonimowo dostępne są wyłącznie opublikowane wpisy oficjalne.
drop policy if exists community_posts_visible_read on public.community_posts;
drop policy if exists community_posts_public_official_read on public.community_posts;
drop policy if exists community_posts_authenticated_read on public.community_posts;
create policy community_posts_public_official_read
on public.community_posts for select to anon
using (status = 'published' and kind = 'official');
create policy community_posts_authenticated_read
on public.community_posts for select to authenticated
using (status = 'published' or author_id = auth.uid() or public.community_is_admin());

-- Komentarze są dostępne wyłącznie po zalogowaniu.
drop policy if exists community_comments_visible_read on public.community_comments;
drop policy if exists community_comments_authenticated_read on public.community_comments;
create policy community_comments_authenticated_read
on public.community_comments for select to authenticated
using (status = 'published' or author_id = auth.uid() or public.community_is_admin());

-- Reakcje do oficjalnych aktualności mogą być zliczane publicznie.
-- Pozostałe reakcje są widoczne tylko po zalogowaniu.
drop policy if exists community_reactions_public_read on public.community_reactions;
drop policy if exists community_reactions_public_official_read on public.community_reactions;
drop policy if exists community_reactions_authenticated_read on public.community_reactions;
create policy community_reactions_public_official_read
on public.community_reactions for select to anon
using (exists (
  select 1 from public.community_posts p
  where p.id = community_reactions.post_id
    and p.kind = 'official'
    and p.status = 'published'
));
create policy community_reactions_authenticated_read
on public.community_reactions for select to authenticated
using (true);

-- Funkcja określająca, czy zdjęcie należy do publicznej aktualności oficjalnej.
create or replace function public.community_media_is_public(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_posts p,
         lateral jsonb_array_elements(coalesce(p.attachments, '[]'::jsonb)) attachment
    where p.kind = 'official'
      and p.status = 'published'
      and coalesce(attachment->>'path', attachment->>'url') = object_name
  );
$$;
revoke all on function public.community_media_is_public(text) from public;
grant execute on function public.community_media_is_public(text) to anon, authenticated;

-- Magazyn zdjęć zostaje prywatny. Obrazy są podawane przez czasowe podpisane URL.
update storage.buckets
set public = false
where id = 'community-media';

drop policy if exists community_media_public_read on storage.objects;
drop policy if exists community_media_authenticated_read on storage.objects;
drop policy if exists community_media_public_official_read on storage.objects;
create policy community_media_authenticated_read
on storage.objects for select to authenticated
using (bucket_id = 'community-media');
create policy community_media_public_official_read
on storage.objects for select to anon
using (bucket_id = 'community-media' and public.community_media_is_public(name));

-- Jawne ograniczenie uprawnień API dla roli anonimowej.
revoke select on public.community_profiles from anon;
revoke select on public.community_comments from anon;
grant select on public.community_posts, public.community_reactions to anon;
grant select on public.community_profiles, public.community_posts, public.community_comments, public.community_reactions to authenticated;

commit;

-- Kontrola po uruchomieniu:
-- select id, public from storage.buckets where id='community-media';
-- wynik powinien mieć public = false
