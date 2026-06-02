# AIO-IPTV.pl — nowa strona od podstaw

Data przygotowania: 02.06.2026
Autor/stopka: Paweł Pawełek
Kontakt: aio-iptv@wp.pl

## Co zostało zrobione
- nowa struktura strony bez kopiowania starego układu jako podstron,
- grupa **Moje wtyczki** + osobna strona dla każdej wtyczki,
- grupa **Poradniki** + osobne strony dla poradników z obecnej strony,
- jedna strona **Multi-Click i systemy** z linkami do czystych image,
- osobna strona **Listy kanałów** z dynamicznym manifestem list,
- czytelny **One-Liner / FTP** z gotowymi poleceniami,
- jedna strona **Kontakt / Wsparcie / Statystyki**,
- **AI Chat pozostawiony jako ai-chat.html** razem z wymaganymi zasobami.

## Jak wrzucić na GitHub Pages
1. Zrób kopię obecnego repozytorium.
2. Usuń stare pliki HTML, które nie są potrzebne, albo zostaw tylko przekierowania z tej paczki.
3. Wgraj zawartość tej paczki do głównego katalogu repozytorium.
4. Zachowaj katalog `pliki`, bo zawiera IPK, PDF, ZIP i obrazki.
5. Zachowaj katalogi `assets`, `data`, `traffic`, `worker`, bo są potrzebne dla wyglądu, AI Chat i statystyk.

## Najważniejsze nowe pliki HTML
- index.html
- plugins.html
- plugin-aio-panel.html
- plugin-iptv-dream.html
- plugin-neoradio.html
- plugin-opencamview.html
- plugin-dreamosatx-signal.html
- plugin-nagrania-on-demand.html
- plugin-picon-updater.html
- plugin-myupdater.html
- plugin-simple-iptv-epg.html
- plugin-dodatki-systemowe.html
- guides.html
- guide-openatv-76.html
- guide-terminal-openwebif.html
- guide-oscam.html
- guide-xstremity.html
- guide-instalacja-image.html
- guide-pamiec-zgemma.html
- guide-diagnostyka-enigma2.html
- systems.html
- channel-lists.html
- one-liner.html
- contact.html
- ai-chat.html
- 404.html
- support.html
- stats.html
- downloads.html
- tools.html
- image-installation.html
- knowledge.html
- poradniki-praktyczne.html
- nowe-projekty.html
- config-builder.html
- kreator.html
- porownywarka.html
- porownywarka_legacy.html
- tuner-compare.html
- error-scan.html
- future-lab.html
- updates.html
- multi-click.html

## Uwaga o starych adresach
W paczce są małe przekierowania dla starych adresów typu `downloads.html`, `support.html`, `stats.html`, `tools.html`. Nie zawierają starego układu strony — tylko kierują do nowej struktury, żeby użytkownicy nie trafiali na błąd 404.
