# 📺 AIO TunerHub

### Enigma2 • IPTV • Wtyczki • Skiny • Listy kanałów • Narzędzia

![Enigma2](https://img.shields.io/badge/Enigma2-OpenATV%20%7C%20OpenPLi-blue?style=for-the-badge&logo=linux)
![Python](https://img.shields.io/badge/Python-2%20%7C%203-yellow?style=for-the-badge&logo=python)
![Status](https://img.shields.io/badge/Status-Active-success?style=for-the-badge)
![AIO Panel](https://img.shields.io/badge/AIO%20Panel-17.0.2-00bcd4?style=for-the-badge)
![AIOHD NEXT](https://img.shields.io/badge/AIOHD%20NEXT-3.2.1-f0b84b?style=for-the-badge)

---

## 🚀 AIO TunerHub

**AIO TunerHub** to rozwijany zestaw autorskich projektów dla odbiorników **Enigma2**.

W jednym miejscu znajdziesz wtyczki, skin, listy kanałów, narzędzia systemowe, poradniki, instalatory oraz rozwiązania przygotowane z myślą o codziennym użytkowaniu tunerów Enigma2.

### 👉 [OTWÓRZ AIO TunerHub](https://aio-iptv-projekt.pages.dev/)

---

## ⭐ Najnowsze aktualizacje


### 🔄 09.10.2026 — Simple IPTV EPG 3.1.0 r1

Nowa wersja poprawia obsługę EPG dla list IPTV i dokładność mapowania kanałów.

- automatyczne wykrywanie źródeł **BouquetMakerXtream** i mapowania XMLTV ID;
- poprawione `eEPGCache.importEvents` oraz obsługa referencji IPTV `4097 / 5001 / 5002`;
- lepsza obsługa XMLTV / XMLTV.GZ i kompresji GZIP;
- mniejsze zużycie pamięci przy dużych źródłach;
- rozszerzona diagnostyka i kontrola widoczności EPG;
- aktualizacja dostępna bezpośrednio z poziomu wtyczki oraz przez **AIO Panel**.

[Pobierz IPK 3.1.0 r1](pliki/enigma2-plugin-extensions-simpleiptvepg_3.1.0-r1_all.ipk) • [Opis i instrukcja](plugin-simple-iptv-epg.html)


### 🧹 09.10.2026 — porządkowanie i optymalizacja AIO TunerHub

Przeprowadzono techniczne porządki strony i repozytorium bez usuwania bieżącej zawartości ani Społeczności AIO.

- ujednolicono aktywne adresy strony pod Cloudflare Pages;
- ograniczono zbędne zapisy do Cloudflare D1 i liczbę niepotrzebnych wywołań backendu;
- dodano jawne trasy Pages Functions oraz podstawowe nagłówki bezpieczeństwa;
- wzmocniono ochronę rejestracji i resetu hasła przed nadużyciami;
- usunięto stare kopie robocze, zbędne pliki pomocnicze i nieużywane paczki instalacyjne;
- zachowano aktualne wydania, pliki wymagane przez stronę oraz potrzebne elementy archiwalne.

Repozytorium jest porządkowane etapami, z kontrolą odwołań przed każdym usunięciem, aby nie uszkodzić działającej strony.



### 🔐 E2 Security 1.1.1 — nowy projekt

Ochrona sieciowa tunera Enigma2: zapora IPv4/IPv6, profile DOM, ZAUFANE i LOCKDOWN, audyt oraz ochrona logowania SSH. Python 2/3, interfejs PL/EN.

[Opis i instrukcja](plugin-e2-security.html) • [Pobierz IPK](pliki/E2-Security_1.1.1_all.ipk)

Aktywna zapora wymaga modułów netfilter. E2 Security nie zastępuje zabezpieczeń routera.


### 🔷 AIO Panel 17.0.2

AIO Panel to rozbudowane centrum zarządzania odbiornikiem Enigma2. W wersji 17.0.2 poprawiono instalację E2iPlayer na wybranych image, zgodność z Pythonem 3.14 oraz dodano OpenCamView 2.0.1 do Wtyczek Online.

Aktualizacja **17.0.2 — 2026-10-23**

- Poprawiono instalację E2iPlayer na części systemów Enigma2.
- Poprawiono zgodność z Pythonem 3.14 i walidację składni przy brakujących modułach.
- Dodano autorską wtyczkę OpenCamView 2.0.1 (Python 3) do sekcji Wtyczki Online.
- Usprawniono walidację instalatorów i pakiety IPK/DEB, sprawdzono SHA-256.
- Zachowano dotychczasowe funkcje z wersji 17.0.1.

[Pobierz IPK 17.0.2](pliki/enigma2-plugin-extensions-panelaio_17.0.2_all.ipk) • [Opis i instalacja](plugin-aio-panel.html)

### 📹 OpenCamView 2.0.1 — Python 3

Kamery IP w Enigma2: RTSP, ONVIF, PTZ, JPEG, PiP, ściana 4 kamer, patrol, skan sieci LAN, bukiety i M3U. Ulepszony interfejs oraz poprawka zawieszania Enigma2 podczas dodawania kamery. Dostępne pakiety IPK i DEB. [Opis i instalacja](plugin-opencamview.html).

AIO Panel oferuje m.in.:

- instalację i aktualizację list kanałów,
- obsługę piconów,
- narzędzia OSCam / Softcam,
- instalatory wtyczek,
- backup i przywracanie ustawień,
- narzędzia systemowe i diagnostyczne,
- AIO Connect,
- obsługę aktualizacji projektów AIO,
- interfejs PL / EN,
- wsparcie dla wielu popularnych obrazów Enigma2.

---

## 🎨 NOWY PROJEKT — AIOHD NEXT 3.2.1

**AIOHD NEXT** to nowoczesny skin Full HD dla **OpenATV / Enigma2**, rozwijany z naciskiem na czytelność, funkcjonalność i wygodne wykorzystanie informacji EPG.

Najważniejsze możliwości:

- nowoczesna lista kanałów z podglądem TV,
- rozbudowany panel EPG,
- opis aktualnie emitowanego programu,
- cztery kolejne audycje dla wybranego kanału,
- kompaktowy InfoBar z opisem bieżącego wydarzenia,
- pełne Event Information,
- graficzny Program TV / MultiEPG,
- picony i paski postępu,
- informacje o sygnale, tunerze i rozdzielczości,
- pogoda wyświetlana bezpośrednio w skinie,
- konfiguracja źródła danych pogodowych,
- trzy wielkości listy kanałów:
  **Standard – 18 kanałów**,  
  **Duża – 15 kanałów**,  
  **Bardzo duża – 14 kanałów**,
- trzy warianty kolorystyczne:
  **Aurora • Amber • Violet**.

Skin posiada własny panel ustawień dostępny z poziomu wtyczek Enigma2.

---

## 📡 IPTV Dream

**IPTV Dream** to rozbudowane narzędzie do obsługi IPTV i tworzenia standardowych bukietów Enigma2.

Obsługiwane są m.in.:

**M3U • Xtream Codes • MAC / Stalker**

Aktualna linia **8.x** zawiera poprawiony eksport kanałów, EPG, picony, obsługę dużych list oraz stabilniejsze generowanie bukietów.

---

## 🩺 E2 Doctor

Narzędzie diagnostyczne i optymalizacyjne dla Enigma2.

Pozwala sprawdzić stan systemu, wykrywać problemy oraz wykonywać bezpieczne operacje konserwacyjne bez konieczności ręcznego przeszukiwania systemu.

---

## 🖼️ PiconUpdater

Wtyczka ułatwiająca pobieranie i aktualizowanie piconów bezpośrednio na odbiorniku.

Projekt jest rozwijany jako część ekosystemu AIO i współpracuje z codziennym użytkowaniem list kanałów Enigma2.

---

## 📺 Listy kanałów AIO Team

Aktualizowane zestawy kanałów dla popularnych pozycji satelitarnych, przygotowywane z zachowaniem własnej kolejności i struktury AIO.

Dostępne są m.in. konfiguracje dla:

**13°E • 19.2°E • 16°E • 23.5°E • 28.2°E**

Listy obejmują polskie platformy, kanały FTA, sport, radio oraz dodatkowe bukiety tematyczne.

---

## 🌐 Co znajdziesz na stronie AIO TunerHub?

Strona projektu zawiera:

**Wtyczki • Skiny • Listy kanałów • Systemy Enigma2 • Aplikacje • Programy • Poradniki • Aktualizacje • Pobieranie • Wsparcie • Społeczność AIO • AI Chat**

Wszystkie najważniejsze projekty posiadają własne strony z opisem, aktualną wersją, materiałami oraz plikami do pobrania.

---

## ⚙️ Zgodność

Projekty AIO są tworzone głównie dla odbiorników **Enigma2**.

W zależności od konkretnego projektu obsługiwane są systemy takie jak:

**OpenATV • OpenPLi • OpenViX • OpenBH • Egami • Pure2 oraz inne obrazy Enigma2**

Nie wszystkie projekty mają identyczne wymagania dotyczące wersji Pythona. Szczegółowe informacje znajdują się na stronie danego projektu.

---

## 📥 Pobieranie

Aktualne wersje projektów są dostępne na:

### 👉 https://aio-iptv-projekt.pages.dev/

oraz w odpowiednich repozytoriach GitHub projektu.

Zalecane jest korzystanie z aktualnych wydań publikowanych na stronie lub w GitHub Releases.

---

## 🧑‍💻 Autor

**Paweł Pawełek**

GitHub: **OliOli2013**

🌐 [AIO TunerHub](https://aio-iptv-projekt.pages.dev/)

> Projekty powstają z myślą o użytkownikach Enigma2 i są rozwijane na podstawie rzeczywistych testów, zgłoszeń użytkowników oraz codziennego korzystania z odbiorników.

---

## ❤️ Projekt jest aktywnie rozwijany

Jeżeli korzystasz z AIO Panel, IPTV Dream, AIOHD NEXT lub innych projektów AIO, warto regularnie sprawdzać stronę projektu.

Pojawiają się tam:

**nowe wersje • poprawki • nowe funkcje • aktualizacje list kanałów • poradniki • nowe projekty**

---

### AIO TunerHub
**Enigma2 tworzone dla użytkowników Enigma2.**

**by Paweł Pawełek**
