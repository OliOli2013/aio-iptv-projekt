#!/usr/bin/env python3
"""AIO Catalog Sync & Search V2: read-only integrity checks.
No network, Cloudflare, or database write access is required.
"""
import html
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit

ARTICLE_SYSTEM = re.compile(r'<article\b[^>]*class="system-card"[^>]*>[\s\S]*?</article\s*>', re.I)
ARTICLE_DOWNLOAD = re.compile(r'<article\b[^>]*class="download-card"[^>]*>[\s\S]*?</article\s*>', re.I)


def read(root, path):
    return (root / path).read_text(encoding='utf-8')


def system_entries(source):
    entries = []
    for part in ARTICLE_SYSTEM.findall(source):
        title = re.search(r'<h3\b[^>]*>([^<]+)</h3>', part, re.I)
        link = re.search(r'<a\b[^>]*href="(https?://multi-click\.pl/[^\"]+)"', part, re.I)
        if not title or not link:
            raise ValueError('Karta systemu Multi-Click bez nazwy lub adresu pobierania')
        version = re.search(r'OpenATV\s+(\d+(?:\.\d+)+)', html.unescape(title.group(1)))
        if not version:
            raise ValueError('Brak wersji OpenATV w karcie systemu')
        url = html.unescape(link.group(1))
        if not re.search(r'(?:\?|&)id_attachment=\d+(?:&|$)', url):
            raise ValueError('Nieprawidłowy link Multi-Click: ' + url)
        entries.append({'title': html.unescape(title.group(1)), 'href': url, 'version': version.group(1)})
    return entries


def is_multiclick(url):
    parts = urlsplit(html.unescape(str(url or '')))
    return parts.hostname in ('multi-click.pl','www.multi-click.pl') and 'id_attachment=' in parts.query


def page_key(address):
    path = urlsplit(html.unescape(str(address or ''))).path.strip('/')
    if not path or path == 'index' or path == 'index.html':
        return 'index'
    return re.sub(r'\.html$', '', path).lower()


def public_pages(root):
    rootxml = ET.fromstring(read(root, 'sitemap.xml'))
    paths = set()
    for node in rootxml.findall('.//{*}loc'):
        target = page_key(node.text or '')
        if (root / (target + '.html')).is_file() or (target == 'index' and (root/'index.html').is_file()):
            paths.add(target)
    if (root/'community-chat.html').is_file():
        paths.add('community-chat')
    return paths


def run(root):
    errors = []
    def check(test, message):
        if not test:
            errors.append(message)
    try:
        current = system_entries(read(root, 'systems.html'))
        check(len(current) >= 10, 'Za mało kart Multi-Click na stronie systemów')
        expected = {entry['href']: entry for entry in current}
        check(len(expected) == len(current), 'Powielone linki Multi-Click w systems.html')
        download_html = read(root, 'downloads.html')
        cards = [card for card in ARTICLE_DOWNLOAD.findall(download_html) if 'multi-click.pl' in card]
        found_cards = {}
        for card in cards:
            links = re.findall(r'href="(https?://multi-click\.pl/[^\"]+)"', card, re.I)
            title_match = re.search(r'<h3\b[^>]*>([^<]+)</h3>', card, re.I)
            if len(links) != 1 or not title_match:
                errors.append('Karta pobierania Multi-Click nie ma dokładnie jednego linku i nazwy')
                continue
            link = html.unescape(links[0]); title = html.unescape(title_match[1])
            check(link not in found_cards, 'Zduplikowany link w downloads.html: ' + link)
            found_cards[link] = title
        check(set(found_cards) == set(expected), 'Linki Multi-Click w downloads.html różnią się od systems.html')
        for link, title in found_cards.items():
            if link in expected:
                check(title == expected[link]['title'], 'Nazwa systemu niezgodna w downloads.html: ' + title)

        catalog = json.loads(read(root, 'data/downloads.json'))
        check(isinstance(catalog, list), 'data/downloads.json nie jest listą')
        listed = [x for x in catalog if is_multiclick(x.get('href', ''))]
        found_json = {x['href']: x for x in listed}
        check(len(listed) == len(found_json), 'Powielone adresy Multi-Click w katalogu JSON')
        check(set(found_json) == set(expected), 'Linki Multi-Click w downloads.json różnią się od systems.html')
        for link, item in found_json.items():
            if link in expected:
                e = expected[link]
                check(item.get('title') == e['title'], 'Niezgodna nazwa Multi-Click w JSON: ' + link)
                check(item.get('version') == e['version'], 'Niezgodna wersja Multi-Click w JSON: ' + link)

        database = json.loads(read(root,'data/tuners.json'))
        tuners = database.get('tuners', [])
        check(isinstance(tuners,list) and len(tuners) >= 50, 'Niepełna baza tunerów')
        check(database.get('count') == len(tuners), 'Pole count nie zgadza się z bazą tunerów')
        keys = [re.sub(r'\s+', ' ', str(t.get('brand','')).strip()).casefold() + '|' +
                re.sub(r'\s+', ' ', str(t.get('model','')).strip()).casefold() for t in tuners]
        check(len(set(keys)) == len(keys), 'Powtórzone marki/modele w data/tuners.json')
        check(all(t.get('brand') and t.get('model') for t in tuners), 'Model tunera bez marki lub nazwy')

        index = json.loads(read(root,'data/search-index.json'))
        check(isinstance(index,list), 'Indeks wyszukiwania nie jest listą')
        indexed = {page_key(x.get('url','')) for x in index if x.get('url')}
        missing = public_pages(root) - indexed
        check(not missing, 'Strony nieobecne w wyszukiwarce: '+', '.join(sorted(missing)[:25]))
        check((root/'scripts/aio_catalog_sync_verify.py').is_file(), 'Brak nowego skryptu kontroli w scripts/')
        check((root/'.github/workflows/aio-catalog-sync.yml').is_file(), 'Brak workflow GitHub Actions')
        print('AIO CATALOG SYNC V2: %d systemów, %d kart pobierania, %d wpisów JSON, %d tunerów, %d adresów w wyszukiwarce.' %
              (len(current),len(cards),len(listed),len(tuners),len(indexed)))
    except (ValueError, OSError, TypeError, KeyError, ET.ParseError, json.JSONDecodeError) as error:
        errors.append(str(error))
    if errors:
        for error in errors:
            print('BŁĄD:', error, file=sys.stderr)
        return 1
    print('WERYFIKACJA AIO CATALOG SYNC & SEARCH V2: OK')
    return 0

if __name__ == '__main__':
    if len(sys.argv) > 2:
        sys.exit('Użycie: python3 aio_catalog_sync_verify.py [ścieżka-do-repo]')
    sys.exit(run(Path(sys.argv[1]).resolve() if len(sys.argv) == 2 else Path(__file__).resolve().parents[1]))
