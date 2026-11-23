# AIO TunerHub — bezpieczeństwo i dostęp: wdrożenie przez GitKrakena
Data paczki: 23.11.2026. Repozytorium: OliOli2013/aio-iptv-projekt. Źródła bazowe: ed38816cfc4372ed274ccf79361bc7e37c411c94. Ta paczka nie wdraża produkcji, nie zawiera danych użytkowników i nie zmienia żadnego rzeczywistego konta.

## 1. GitKraken: przygotuj gałąź i pull request
Zapisz ZIP w ~/Pobrane. Najpierw upewnij się, że podgląd gałęzi Cloudflare Pages używa OSOBNYCH zasobów D1/R2 i nie wysyła prawdziwych wiadomości. Jeśli tego nie wiesz, przygotuj lokalną gałąź, ale wstrzymaj push.
W terminalu GitKrakena wklej:

~~~bash
cd "$HOME/AIO projekt/aio-iptv-projekt" &&
AIO_PACZKA="$(mktemp -d)" &&
unzip -q "$HOME/Pobrane/AIO_TunerHub_GitKraken_2026-11-23.zip" -d "$AIO_PACZKA" &&
bash "$AIO_PACZKA/PRZYGOTUJ.sh"
~~~

Skrypt sprawdza sumy, repozytorium i czysty katalog roboczy, pobiera main bez przepisywania historii, sprawdza cały patch i tworzy gałąź security/owner-desk-v1. Na końcu pokazuje zakres przygotowanego commita. Nie wykonuje commit, push, migracji ani zapisu w R2. Jeśli jest konflikt lub gałąź już istnieje — zatrzymaj się, nie używaj --force, --reject ani reset --hard. Nic nie trzeba ręcznie dodawać przez „Stage All”.
Po przejrzeniu „Staged Files” i potwierdzeniu izolacji Preview:

~~~bash
git diff --cached --check &&
git commit -m "feat(security): centralize owner controls and guard private downloads" &&
git push -u origin security/owner-desk-v1
~~~

Jeśli terminal nie ma uwierzytelnienia GitHuba, wykonaj sam commit, następnie użyj „Push” w GitKrakenie z podłączonym kontem GitHub (origin / security/owner-desk-v1). Nie wklejaj do czatu tokena ani hasła. Na GitHubie utwórz PR: base main, compare security/owner-desk-v1. Nie scalaj do czasu odbioru opisanego niżej.

## 2. Co wdrażasz
- Centrum Właściciela → Bezpieczeństwo i dostęp (/owner-safety): aktywne ograniczenia w sześciu rejestrach, liczba odrębnych kont, sygnalizacja niepełnego odczytu, wyszukanie konta, wszystkie dostępne przyczyny w szczegółach, stan VPN i R2. Pozostają odwołania i dotychczasowe narzędzia.
- Przy konkretnym koncie: zapisana pula indywidualna lub współdzielona, data jej odnowienia oraz osobno termin VIP i 7D. Odczyt niczego nie nalicza ani nie odnawia w bazie. Braku wpisu lub odczytu nie przedstawia jako wykorzystanego limitu; źródłem uprawnień nadal jest serwer pobrań.
- „Skanuj konta”: partie po 30, zwykłe konta, ostatnie 7 dni (≥5 błędnych logowań lub ≥3 odmowy z powodu limitu). Nie używa e-maila, wspólnego IP ani VPN jako dowodu winy, nie wykonuje zapytań do dostawcy VPN i nie zakłada blokad. Możesz zatrzymać skan. „Obserwuj” i „Wyjaśniono” zapisują ocenę z uzasadnieniem; nowe zdarzenia wymagają nowej oceny. Bez dostępu do rejestru nie ma wyniku, zamiast pozornego zera.
- Osobno: ręczna blokada profilu na 30 dni z wycofaniem jego sesji, zdjęcie wyłącznie blokady profilu, dotychczasowe przywrócenie dostępu we wszystkich dozwolonych warstwach. Każda wymaga potwierdzenia i powodu. Pełne odblokowanie odmawia przy cudzym przypisaniu, współdzielonej sieci lub globalnej blokadzie. Nie resetuj limitu ani nie zatwierdzaj adresu e-mail zamiast użytkownika.
- Sprawdzanie VPN podczas rejestracji i po potwierdzeniu tożsamości przy zwykłym logowaniu i logowaniu społecznościowym. W trybie egzekwowania wykryty VPN/proxy/Tor daje komunikat z drogą kontaktu, nie ban konta; brak wyniku daje osobny komunikat o chwilowej niedostępności. W trybie obserwacji wykrycie jest sygnalizowane bez odmowy. Nie gwarantuje rozpoznania każdego VPN. Samo łącze mobilne, sieć firmowa, współdzielony IP lub żądanie resetu to nie dowód nadużycia. Dotychczasowa ścieżka odwołania pozostaje.
- Rejestracja publiczna nigdy nie przyznaje roli właściciela, także w pustej bazie. Zachowaj istniejącego administratora i serwerowe powiązanie właściciela. Okna dla prób rejestracji i resetu są liczone atomowo. Nie zmienia to Twojego hasła ani hasła żadnego użytkownika.
- Standardowy najnowszy IPK AIO Panel pozostaje publiczny i ma osobny licznik przekierowań. DEB z portalu, również pod poprzednim adresem, przechodzi przez autoryzację. Prywatne pliki są wydawane z R2. Brak obiektu lub awaria nie obciąża darmowej puli i nie uruchamia kopii statycznej. Darmowe konto: 3 wydania, odnowienie miesiąc kalendarzowy od trzeciego; VIP, aktywny 7D i właściciel nie zużywają puli. Wczesne przerwanie poprawnie rozpoczętego transferu nie zwraca wykorzystanego wydania.
- Wyjście publicznego builda nie zawiera instalatorów z pliki/ i assets/releases/. PR kontroluje nowe i zmienione pliki w obu miejscach. Nie jest to gwarancja prywatności danych, które ktoś wcześniej wypchnął do publicznego GitHuba. Nie dodawaj prywatnych plików nawet do publicznej gałęzi roboczej. Publiczne wydania innych projektów i adresy cudzych serwerów pozostają poza kontrolą AIO.

## 3. Cloudflare: warunki przed wdrożeniem
1. W projekcie Pages sprawdź Production i Preview **oddzielnie**. Preview: osobna testowa D1 z bazowym schematem portalu, istniejący syntetyczny właściciel, testowe R2, poświadczenia testowe; nie klonuj danych użytkowników na publiczny podgląd. Ogranicz dostęp do adresów podglądu. Sprawdź backup produkcji (w tym działającą możliwość odzyskania), zapisz bieżący identyfikator wdrożenia i ustawienia przed zmianą. Włącz MFA/passkey na kontach GitHub i Cloudflare.
2. Bindings: D1 o nazwie COMMUNITY_DB; R2 o nazwie AIO_PRIVATE_FILES. Ustaw AIO_DOWNLOAD_STORAGE_MODE=r2. W prywatnym buckecie sprawdź, że ani Public Development URL (r2.dev), ani żadna domena niestandardowa nie udostępniają plików. Nie zmieniaj publicznego IPK ani oficjalnych wydań GitHuba. Flaga AIO_ALLOW_LEGACY_PUBLIC_MIRRORS domyślnie wyłączona — pozostaw ją wyłączoną dla chronionych plików.
3. W ustawieniach właściciela sprawdź COMMUNITY_OWNER_USER_ID zgodny z istniejącym kontem w roli admin. W nowej bazie Preview przygotuj osobny profil właściciela bezpośrednio w kontrolowanym procesie; rejestracja publiczna nie służy do zakładania administratora.
4. W ustawieniach środowiska sprawdź AIO_VPN_GUARD_API_KEY i AIO_VPN_GUARD_HMAC_SECRET (wartości tylko jako sekrety); zachowaj dotychczasowy sekret HMAC. Rejestracja: zachowaj obowiązujący AIO_VPN_GUARD_MODE (w eksporcie: enforce). Logowanie: **jawnie ustaw AIO_VPN_LOGIN_MODE=monitor przed pierwszym wdrożeniem**. Bez tej zmiennej dziedziczony jest tryb rejestracji. Po pilotażu włącz enforce dla loginu, tylko jeśli masz zapas budżetu i działający kontakt. Skan sieci historycznych może wykorzystać budżet do progu 50%, logowania do 80%, rejestracje do 100% całkowitego budżetu dnia UTC; trafienia w cache nie kosztują zapytania. Przy 900/dzień progi to 450/720/900, nie trzy osobne pule. Po przekroczeniu progu nowe niesklasyfikowane połączenia w enforce mogą być odrzucone przejściowo, także bez VPN. Nie podnoś AIO_VPN_GUARD_DAILY_BUDGET ponad plan dostawcy. Sprawdź Turnstile, SMTP i formularz odwołań; nie zmieniaj kluczy ani domen produkcyjnych dla testu.
5. Użyj normalnie uwierzytelnionego Wranglera, z katalogu repozytorium na gałęzi ze zmianami. Przed komendą zweryfikuj nazwę widoczną w dashboardzie. Na Preview:

~~~bash
read -r -p "Nazwa bazy TESTOWEJ D1: " AIO_PREVIEW_DB
test -n "$AIO_PREVIEW_DB" &&
wrangler d1 execute "$AIO_PREVIEW_DB" --remote --file=scripts/migrations/2026-11-22-owner-safety.sql
~~~

Migracja jest powtarzalna: 2 nowe tabele i indeks, bez zmian starych rekordów i uprawnień. Liczniki VPN nie zawierają adresów IP ani e-maili; historia decyzji zawiera identyfikatory i notatkę właściciela. W notatkach nie zapisuj haseł, kodów ani pełnych adresów IP. Samo wysłanie commita **nie wykonuje tej migracji**.
6. W pełnym klonie porównaj pliki i ich sumy z prywatnym R2 (tylko odczyt z Cloudflare; pobiera obiekty do tymczasowego katalogu). Najpierw na Preview, a przed scaleniem również dla właściwego produkcyjnego bucketu:

~~~bash
read -r -p "Dokładna nazwa bucketu do sprawdzenia: " AIO_CHECK_BUCKET
test -n "$AIO_CHECK_BUCKET" &&
python3 scripts/aio_r2_repair_catalog_v1.py --check --all-private --bucket "$AIO_CHECK_BUCKET"
~~~

Brak pliku, konflikt SHA-256, brak uprawnień albo brak lokalnego, zaufanego źródła = **STOP**. Nie włączaj publikacji z takim wynikiem. Dla obecnego DEB źródłem lokalnym jest assets/releases/enigma2-plugin-extensions-panelaio_18.2.1_all.deb, kluczem w R2 — pliki/enigma2-plugin-extensions-panelaio_18.2.1_all.deb. Oczekiwana suma: 4b17c8eb81502832a5c6fbb024904eded2403a7f73bef3550272a449793cc48c. Właściciel może jawnie uzupełnić tylko potwierdzony brak ze sprawdzonej kopii: python3 scripts/aio_r2_repair_catalog_v1.py --apply --only 'pliki/DOKLADNA-NAZWA' --bucket "$AIO_CHECK_BUCKET". Nie uruchamiaj automatycznie; narzędzie nie zastępuje konfliktującego obiektu. Przy niezgodności starszej pozycji z katalogiem najpierw ustal prawidłowy oryginał i sumę. Kontrola dotyczy katalogu/plików źródłowych i znanego manifestu: sprawdź osobno materiały dostępne wyłącznie z postów lub innych magazynów.
Jeżeli zaufany plik nowej pozycji znajduje się poza Gitem, dopisz do komendy --source-dir "/dokładna/ścieżka/do/kopii". Ten katalog powinien zawierać pliki/ z identyczną ścieżką klucza; narzędzie wykorzysta materiał tylko dla nazw jawnie wskazanych w katalogu lub manifeście. Po usunięciu z Git bieżąca kontrola sum może działać na zapisanym manifeście. Nie przenoś do repozytorium prywatnych plików dla potrzeb CI.
7. Pages: root projektu jak dotąd, Functions w functions/, katalog publikacji **dist** (nie katalog repo). Polecenie build: python3 scripts/aio_pages_public_build_v1.py && python3 scripts/aio_pages_public_verify_v1.py. Zachowaj pozostałe wymagane kroki istniejącego procesu. Build nie kasuje źródeł, generuje dist od nowa.

## 4. Odbiór na Preview i produkcja
- Dwie własne sesje testowe: bez sesji i zwykłe konto nie dostają panelu; właściciel widzi „Bezpieczeństwo i dostęp”. Uruchom skan, zapisz ocenę i sprawdź, że profil nie zmienił dostępu. Na syntetycznym koncie sprawdź ręczną blokadę, odwołanie i cofnięcie. Nigdy nie testuj na prawdziwym użytkowniku.
- Na zwykłym koncie sprawdź znany plik testowy: HEAD i brakujący obiekt nie obciążają licznika. Trzy poprawne wydania są policzone; czwarta próba nie daje pliku. DEB z katalogu i dotychczasowego adresu podlega tej samej zasadzie. IPK otwiera się bez logowania. Zweryfikowany VIP/7D zachowuje dostęp. Sprawdź także link lokalny z posta: jedno wydanie, nie dwa. Zewnętrzne linki z postów rozliczają przekierowanie, nie transfer na obcym serwerze.
- Na Preview sprawdź zwykłe logowanie i rejestrację oraz używane logowania Google/Facebook w trybach monitor/enforce. Kontrolowana, znana klasyfikacja VPN ma dać informację; brak wyniku ma dać odrębny komunikat, a nie oskarżenie o użycie VPN. Sprawdź normalne łącze, telefon i odwołanie. Skaner historyczny nie decyduje za właściciela.
- Dopiero po zielonych testach, pełnej zgodności R2, działającym zapasowym dostępie właściciela i zatwierdzonej kopii zapasowej: wykonaj tę samą migrację na wybranej produkcyjnej D1, ustaw bindings/tryby produkcyjne, scal PR i sprawdź wynik Pages. W przeglądarce sprawdź widok mobilny, odwołanie oraz poprawną wiadomość VPN. Obserwuj 403 VPN osobno od 503 (odmowy techniczne), odczyt magazynu, nowe skargi i budżet. Sprawdź wcześniejsze wdrożenia Pages i cache starych publicznych plików. Nie zakładaj, że stara kopia przestała działać po samym merge.

## 5. Osobny etap: pliki kiedyś śledzone w publicznym GitHubie
Pierwszy PR nie usuwa historycznych plików i nie zmienia historii. Dopiero po udanym odbiorze, zweryfikowaniu niezależnej kopii zapasowej oraz kompletności **produkcyjnego prywatnego R2**:
- Na osobnej gałęzi wykonaj --check --all-private --bucket NAZWA_PRODUKCYJNEGO_BUCKETU --save-inventory za pomocą tego samego skryptu. W R2 to tylko odczyt. Lokalnie powstaje integrity/aio-protected-downloads-v1.json z nazwą, rozmiarem i sprawdzoną sumą. Odróżnij pliki, które chcesz nadal legalnie publikować, od tych, które mają być prywatne.
- python3 scripts/aio_private_cutover_plan.py wypisze WYŁĄCZNIE propozycje dla śledzonych plików ze zgodną sumą. Nie zmienia ani indeksu Git, ani dysku. Przejrzyj listę; nie przekazuj jej do powłoki jako skryptu. Tylko dla rzeczywiście wybranych pozycji wykonaj jawne git rm --cached -- "dokładna/ścieżka". To pozostawia Twoją lokalną kopię, ale po scaleniu przestaje ona należeć do najnowszego drzewa Git; w innych klonach aktualizacja gałęzi może usunąć roboczą kopię. Dodaj wskazany manifest, przejrzyj staged files i wyślij do osobnego PR. Nie używaj git add . i nie dodawaj prywatnych archiwów do żadnej zdalnej gałęzi. Nowe prywatne wydania: źródło przechowuj poza publicznym Gitem, wrzucaj do prywatnego R2 i publikuj tylko metadane ze sprawdzonym SHA-256; dla katalogu publikacji zgodność wpisu manifestu i deklarowanej sumy jest obowiązkowa.
- Starsze commity, tagi, publiczne wydania, cudze kopie i pliki już pobrane pozostają poza limitem portalu. Tam, gdzie poufność jest konieczna, przyszłe wersje trzymaj wyłącznie prywatnie. Nie wykonuj force-push ani przepisywania historii na podstawie tej instrukcji.

## 6. Wycofanie
W razie fałszywych alarmów loginu: przywróć AIO_VPN_LOGIN_MODE=monitor i zastosuj konfigurację w Pages, bez odblokowywania kont i bez kasowania logów. Przy awarii R2 pozostaw prywatną trasę zamkniętą i napraw binding/obiekt; nie cofaj do publicznego pliku zastępczego. Pełny rollback: użyj ostatniego sprawdzonego deploymentu lub PR cofającego konkretny commit, po zabezpieczeniu starych adresów. Nowe tabele są dodatkiem; w zwykłym rollbacku nie kasuj ich. Dla brakujących uprawnień nie używaj danych innych osób. Dokumentacja: https://developers.cloudflare.com/pages/functions/bindings/ · https://developers.cloudflare.com/r2/buckets/public-buckets/ · https://developers.cloudflare.com/d1/wrangler-commands/
