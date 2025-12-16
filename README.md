📺 AIO-IPTV Project

Autorskie narzędzia, wtyczki, poradniki i listy dla Enigma2
Strona projektu: AIO-IPTV.pl (GitHub Pages) + repozytorium z plikami do pobrania i dokumentacją.








🚀 Oficjalna strona (pobieranie, poradniki, narzędzia)

Na stronie znajdziesz:

aktualne pliki do pobrania (wtyczki/listy/paczki),

poradniki i mini-tutoriale,

narzędzia i gotowe komendy dla Enigma2,

system powiadomień o zmianach,

AI-Chat Enigma2 (tryb offline, GitHub Pages).

👉 Wejdź na stronę projektu:
AIO-IPTV.pl

✅ Co jest w tym repozytorium?

Repozytorium zawiera:

Stronę statyczną (GitHub Pages) – nowoczesny panel z sekcjami:

Wtyczki / Listy / Poradniki

Centrum wiedzy Enigma2 (wyszukiwarka + tagi + „kopiuj komendę”)

Narzędzia Enigma2 (szybkie moduły + komendy)

Systemy (OpenATV / OpenPLi / Egami / OSCam – karty + checklisty)

Powiadomienia (dzwoneczek – log zmian, pamięć nieprzeczytanych)

AI-Chat Enigma2 (działa statycznie, offline)

Pliki do pobrania (np. paczki/wtyczki/listy – w zależności od aktualnych wydań)

Dokumentację i opisy funkcji dla użytkowników Enigma2

🧠 AI-Chat (Enigma2) – jak działa?

AI-Chat w tym projekcie działa w 100% statycznie (GitHub Pages), bez backendu i bez kluczy API:

podpowiada na podstawie wbudowanej bazy wiedzy (offline),

kieruje do poradników i narzędzi,

nadaje się do szybkich odpowiedzi: picony, listy, OSCam, logi, restart GUI, satellites.xml itp.

🔔 Powiadomienia (dzwoneczek)

Panel powiadomień pokazuje wszystkie zmiany dodane do pliku:

data/updates.json

Dodatkowo:

licznik nieprzeczytanych jest zapamiętywany w localStorage,

możesz „oznaczyć wszystko jako przeczytane”.

📦 PWA / Offline

Strona wspiera tryb PWA:

manifest.json

service-worker.js

offline.html

Dzięki temu:

część treści działa offline,

zasoby są cache’owane (szybsze ładowanie).

🧱 Struktura katalogów (skrót)

Przykładowo:

index.html – strona główna

home_modern.css / style.css – styl i UI

script_modern.js – logika UI (menu, chat, powiadomienia, wiedza, narzędzia)

data/knowledge.json – baza wiedzy Enigma2

data/tools.json – narzędzia/komendy

data/updates.json – changelog pod dzwoneczek

data/systems.json – karty systemów + checklisty

assets/ – grafiki/logotypy/ikony

🛠️ Jak uruchomić lokalnie?

Najprościej:

Pobierz repozytorium

Otwórz index.html w przeglądarce
(dla PWA/SW zalecany lokalny serwer, np. VS Code Live Server)

📌 Wymagania / zgodność

Strona: dowolna nowoczesna przeglądarka

Hosting: GitHub Pages (statycznie, bez backendu)

Tematyka: Enigma2, OpenATV, OpenPLi, Egami, OSCam i narzędzia sat/iptv

📜 Licencja

Projekt udostępniony na licencji MIT (szczegóły w LICENSE).

👤 Autor

Paweł Pawełek
Kontakt: msisystem@t.pl
