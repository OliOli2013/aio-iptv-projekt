-- 1. Zastąp adres e-mail i uruchom po pierwszym logowaniu na community.html.
update public.community_profiles
set role = 'admin', trusted = true, banned_until = null
where id = (
  select id from auth.users
  where email = 'TWOJ-EMAIL@DOMENA.PL'
  limit 1
);

-- 2. Opcjonalnie: dodaj pierwszy oficjalny wpis powitalny.
-- Uruchom dopiero po poprawnym nadaniu roli administratora.
insert into public.community_posts (
  author_id, kind, category, title, content, status, pinned, featured, published_at
)
select
  id,
  'official',
  'inne',
  'Witamy w Społeczności AIO',
  'To niezależna przestrzeń dla użytkowników Enigma2. Możesz tutaj zadawać pytania, dodawać zdjęcia błędów, komentować, dzielić się wynikami testów i śledzić oficjalne aktualności AIO-IPTV.pl. Przed publikacją zapoznaj się z regulaminem i nie udostępniaj danych dostępowych.',
  'published',
  true,
  true,
  now()
from public.community_profiles
where role = 'admin'
order by created_at
limit 1;
