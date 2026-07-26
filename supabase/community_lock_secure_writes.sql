-- ============================================================================
-- SPOŁECZNOŚĆ AIO — wymuszenie bezpiecznych zapisów przez funkcję Edge
-- Wersja: 2026-07-26 community5
-- URUCHOM DOPIERO PO wdrożeniu i przetestowaniu funkcji Edge community-write.
-- ============================================================================

begin;

-- Posty: od tej chwili tworzenie, usuwanie i zmiany wykonywane są przez Edge.
drop policy if exists community_posts_authenticated_insert on public.community_posts;
drop policy if exists community_posts_owner_admin_update on public.community_posts;
drop policy if exists community_posts_owner_admin_delete on public.community_posts;
revoke insert, update, delete on public.community_posts from authenticated;

-- Komentarze.
drop policy if exists community_comments_authenticated_insert on public.community_comments;
drop policy if exists community_comments_owner_admin_update on public.community_comments;
drop policy if exists community_comments_owner_admin_delete on public.community_comments;
revoke insert, update, delete on public.community_comments from authenticated;

-- Reakcje.
drop policy if exists community_reactions_own_insert on public.community_reactions;
drop policy if exists community_reactions_own_update on public.community_reactions;
drop policy if exists community_reactions_own_delete on public.community_reactions;
revoke insert, update, delete on public.community_reactions from authenticated;

-- Zgłoszenia moderacyjne.
drop policy if exists community_reports_own_insert on public.community_reports;
drop policy if exists community_reports_admin_update on public.community_reports;
revoke insert, update on public.community_reports from authenticated;

commit;

-- Po uruchomieniu publikowanie musi działać przez funkcję Edge community-write.
-- Cofnięcie awaryjne: ponownie uruchom community_setup.sql, a następnie
-- community_private_access.sql i community_moderation_long_posts.sql.
