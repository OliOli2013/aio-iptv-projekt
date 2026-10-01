# Audyt AIO-IPTV.pl — 01.10.2026

## Co zostało zachowane

- cała istniejąca struktura serwisu i wszystkie podstrony,
- Społeczność AIO wraz z istniejącymi stronami, skryptami i danymi,
- centrum pobierania, wtyczki, skiny, aplikacje Android/Windows,
- systemy Enigma2, listy kanałów, poradniki, narzędzia i baza błędów,
- pliki, grafiki, APK, IPK, PDF oraz zaplecze PWA,
- dotychczasowe adresy URL podstron.

Nie usunięto żadnego istniejącego działu serwisu. Usunięta została informacja o zbiórce Pomagam.pl / 38ggab ze strony głównej i nie ma już odwołań do niej w przygotowanym katalogu.

## Najważniejsze problemy poprzedniej strony głównej

1. **Za dużo równorzędnych sekcji.** Te same cele użytkownika (pobieranie, pomoc, społeczność, projekty) pojawiały się w kilku miejscach pod różnymi nazwami.
2. **Zbyt dużo ręcznie wpisywanych wersji.** Na jednej stronie występowały równolegle różne numery wersji tych samych projektów. To szybko prowadzi do niespójności.
3. **Długi skan strony.** Użytkownik musiał przewijać wiele rozbudowanych bloków, zanim znalazł właściwy dział.
4. **Nawigacja była poprawna funkcjonalnie, ale zbyt gęsta.** Główne menu oraz sekcje skrótów częściowo się dublowały.
5. **Strona główna mieszała funkcję portalu, katalogu projektów i tablicy aktualności.** Brakowało jednej dominującej ścieżki: „powiedz, czego szukasz”.
6. **Wyszukiwanie nie było najważniejszym elementem wejścia.** Przy tak dużej liczbie podstron wyszukiwarka powinna być jednym z pierwszych elementów interfejsu.
7. **PWA mogła utrzymywać starą stronę po aktualizacji.** Przy dużej przebudowie konieczne było podniesienie wersji cache Service Workera.

## Co zmieniono

- całkowicie przebudowano `index.html`,
- dodano nowy, odseparowany styl `assets/css/aio-home-next.css`,
- dodano nowy skrypt `assets/js/aio-home-next.js`,
- dodano wyszukiwarkę całego serwisu otwieraną także skrótem **Ctrl+K**,
- wyszukiwarka korzysta z istniejącego `data/search-index.json`,
- sekcja aktualności ładuje dane z `data/updates.json`,
- sekcja aktywnych projektów ładuje dane z `data/projects.json`,
- zachowano publiczne statystyki Społeczności AIO przez istniejący `community-home.js`,
- uporządkowano serwis według celu użytkownika: pobieranie / problem / projekt / społeczność / system / instalacja,
- dodano pełny katalog rzadziej używanych funkcji, więc żaden ważny dział nie został schowany „bez drogi dojścia”,
- poprawiono responsywność na telefonach i tabletach,
- zaktualizowano wersję cache w `service-worker.js` i dodano nowe pliki strony głównej do cache,
- usunięto widżet i tekst zbiórki Pomagam.pl.

## Kontrola techniczna

- sprawdzono 84 pliki HTML,
- brak brakujących lokalnych linków i zasobów w HTML,
- składnia nowego pliku JavaScript przeszła kontrolę `node --check`,
- `index.html` nie zawiera `pomagam.pl`, `38ggab` ani kodu widżetu zbiórki,
- zachowano wszystkie dotychczasowe podstrony z przesłanego archiwum.

## Dlaczego nie przebudowano automatycznie wszystkich 84 podstron

Społeczność, pobieranie, dostęp do plików i część narzędzi korzystają z własnych skryptów oraz selektorów CSS. Masowa podmiana nagłówków i układu na wszystkich stronach w jednym kroku dawałaby większe ryzyko regresji niż korzyści.

Nowa strona główna działa jako nowoczesny portal wejściowy, a istniejące podstrony pozostają funkcjonalnym zapleczem. Kolejny etap — jeśli będzie potrzebny — powinien polegać na stopniowym ujednolicaniu szablonu podstron grupami: projekty, poradniki, aplikacje, narzędzia, a na końcu społeczność.
