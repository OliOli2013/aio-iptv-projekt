AIO-IPTV.pl — COMMUNITY FIRST
Wersja przebudowy: 16.08.2026

CEL
----
Ta aktualizacja zmienia główną hierarchię serwisu:
Społeczność -> nawigacja -> pomoc/wsparcie -> aktualności -> projekty.

NAJWAŻNIEJSZE ZMIANY
--------------------
- nowa strona główna skupiona na Społeczności AIO,
- stały przycisk „Społeczność AIO” w nagłówku,
- nowe menu główne na wszystkich podstronach,
- nowa sekcja „Dokąd chcesz przejść?”,
- pełna, osobna strona support.html,
- widoczne Wsparcie w głównym menu,
- rozdzielenie pomocy technicznej, wsparcia projektu i Kontaktu,
- projekty przesunięte niżej i pokazane w kompaktowej formie,
- nowa wersja cache PWA.

INSTALACJA NA OBECNEJ WERSJI AIO NOVA 2
----------------------------------------
1. Zrób kopię repozytorium.
2. Rozpakuj AIO_COMMUNITY_FIRST_PATCH.zip.
3. Otwórz katalog AIO_COMMUNITY_FIRST_PATCH.
4. Skopiuj jego zawartość do katalogu głównego repozytorium.
5. Zezwól na nadpisanie istniejących plików.
6. Nie usuwaj katalogu pliki/ ani data/.
7. Commit + push do GitHuba.
8. Po wdrożeniu odśwież stronę z pominięciem cache / zamknij i otwórz PWA ponownie.

PATCH JEST PRZEZNACZONY DO NAŁOŻENIA NA AIO NOVA 2.

KONTROLA
--------
- 63 strony z jednym wariantem nawigacji,
- 0 brakujących lokalnych href/src,
- poprawna składnia zmienionych skryptów JS,
- render desktop i mobile sprawdzony w Chromium.
