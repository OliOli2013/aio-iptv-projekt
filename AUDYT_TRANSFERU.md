# Audyt transferu AIO-IPTV.pl — 07.10.2026

## Wniosek

Główne źródło problemu nie leży w liczbie użytkowników, bazie danych ani Edge Functions, lecz w multimediach Społeczności AIO pobieranych z prywatnego Supabase Storage.

Stan z panelu Supabase:
- Egress: 8,562 / 5 GB — 171%
- Cached Egress: 0,208 / 5 GB — 4%
- Database Size: 0,033 / 0,5 GB
- Storage Size: 0,12 / 1 GB
- Edge Function Invocations: 1909 / 500 000
- Monthly Active Users: 50 / 50 000

Tak niski Cached Egress przy wysokim zwykłym Egress jest zgodny z obecnym sposobem używania prywatnych zdjęć przez signed URL.

## Co generowało niepotrzebny transfer

1. Strona główna pobierała pierwsze zdjęcie najnowszego wpisu z Supabase Storage.
2. Lista społeczności przygotowywała signed URL-e dla wszystkich zdjęć widocznych postów.
3. Zdjęcia mogły mieć do 5 MB.
4. Każde przejście między stronami tworzyło nowe signed URL-e w pamięci tylko dla bieżącego widoku.
5. Cache podpisanych URL-i nie był zachowywany między przejściami po stronie.
6. Nie istniała osobna miniatura do feedu.
7. Nowe zdjęcia trafiały do Storage praktycznie w oryginalnym rozmiarze.
8. Strona główna odpytywała publiczne statystyki przy każdym wejściu.

## Zastosowana korekta

- cache podpisanych URL-i w localStorage;
- dłuższy czas życia tego samego signed URL;
- kompresja nowych JPEG/PNG/WebP do maks. 1600 px dłuższego boku;
- miniatura WebP maks. 640 px;
- avatar maks. 512 px;
- feed pobiera miniaturę zamiast pełnego obrazu;
- stare duże obrazy są pomijane w feedzie, ale pozostają w konkretnym poście;
- strona główna pobiera tylko miniaturę nowych wpisów;
- dla starych wpisów pozostaje lokalny obraz zastępczy z GitHub Pages;
- cache metadanych najnowszego wpisu: 15 minut;
- cache statystyk strony głównej: 30 minut;
- przyjazna obsługa HTTP 402 / exceed_egress_quota.

## Elementy pozostawione bez zmian

Pozostałe części strony są w większości statyczne i korzystają z GitHub Pages. AI Chat i AIO Connect używają Edge Functions dopiero po wykonaniu konkretnej akcji użytkownika; przy pokazanym zużyciu nie są wiarygodnym źródłem wielogigabajtowego egress.

Zmiana nie ingeruje w SQL, RLS, treść bazy, istniejące wpisy, komentarze ani konta.
