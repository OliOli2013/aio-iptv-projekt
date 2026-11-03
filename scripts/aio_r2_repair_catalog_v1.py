#!/usr/bin/env python3
"""AIO TunerHub: safe repair of missing *catalogue* objects in private R2.

Run in repository root. No bypass of Pages Functions/D1 policies. Existing
objects are NEVER overwritten; mismatching remote content is an error.

Modes:
  --audit   Local listing and source integrity (offline, default)
  --check   Read remote objects; report missing/mismatch; no writes
  --apply   As --check; upload ONLY objects positively identified as missing,
            then download again and verify SHA-256.

Requires Cloudflare Wrangler authenticated to the account holding the bucket.
"""
from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import json
import mimetypes
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
BUCKET = 'aio-downloads-private'
IMAGES = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.ico'}
DOWNLOAD_EXTENSIONS = {'.ipk', '.deb', '.apk', '.exe', '.zip', '.pdf', '.tar', '.gz', '.xz', '.7z', '.rar', '.bin', '.sh', '.m3u', '.m3u8'}
MISS_PATTERNS = (
    re.compile(r'\bnosuchkey\b', re.I),
    re.compile(r'\bobject\b.{0,100}\b(?:not found|does not exist|doesn.t exist)\b', re.I | re.S),
    re.compile(r'\b(?:key|file)\b.{0,100}\b(?:not found|does not exist|doesn.t exist)\b', re.I | re.S),
    re.compile(r'\b(?:not found|does not exist|doesn.t exist)\b.{0,100}\b(?:object|key)\b', re.I | re.S),
)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as inp:
        for part in iter(lambda: inp.read(1024 * 1024), b''):
            h.update(part)
    return h.hexdigest()


def key_of(value: str) -> str | None:
    if not isinstance(value, str) or not value or value.startswith('//'):
        return None
    try:
        u = urlsplit(value.strip())
        if u.scheme or u.netloc:
            return None
        path = unquote(u.path.lstrip('/'))
    except (ValueError, UnicodeError):
        return None
    # Do not accept directory traversal, control chars, percent-double-encoding,
    # or alternate separators. These are static repo paths, not user input.
    if not path.startswith('pliki/') or not path[6:] or len(path) > 500:
        return None
    if '\\' in path or '%' in path or any(ord(c) < 32 or ord(c) == 127 for c in path):
        return None
    parts = Path(path).parts
    if any(x in ('', '.', '..') for x in parts):
        return None
    if Path(path).suffix.lower() not in DOWNLOAD_EXTENSIONS:
        return None
    return path


class Links(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.paths: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag not in ('a', 'button'):
            return
        for name, value in attrs:
            if name in ('href', 'data-href', 'data-url', 'data-download') and value:
                key = key_of(value)
                if key:
                    self.paths.add(key)


def catalogue() -> tuple[dict[str, set[str]], dict[str, str]]:
    refs: dict[str, set[str]] = {}
    stated_hash: dict[str, str] = {}
    json_path = ROOT / 'data/downloads.json'
    if not json_path.is_file():
        raise RuntimeError('Brak data/downloads.json. Uruchom w repozytorium AIO.')
    entries = json.loads(json_path.read_text('utf-8'))
    if not isinstance(entries, list):
        raise RuntimeError('data/downloads.json nie jest tablica JSON')
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        key = key_of(entry.get('href', ''))
        if key:
            refs.setdefault(key, set()).add('data/downloads.json')
            digest = str(entry.get('sha256') or '').lower().strip()
            if re.fullmatch('[0-9a-f]{64}', digest):
                stated_hash[key] = digest
    # Covers direct links on project pages, including items absent from
    # downloads.json. No data from 'Najnowsze posty' is enumerated.
    for page in sorted(ROOT.glob('*.html')):
        if page.name.startswith(('latest-posts', 'community-post')):
            continue
        parser = Links()
        parser.feed(page.read_text('utf-8', errors='replace'))
        for key in parser.paths:
            refs.setdefault(key, set()).add(page.name)
    return refs, stated_hash


def wrangler_command() -> list[str]:
    if shutil.which('wrangler'):
        return ['wrangler']
    # --no-install never fetches an unapproved package from the Internet.
    if shutil.which('npx'):
        return ['npx', '--no-install', 'wrangler']
    raise RuntimeError('Brak Wrangler. Zainstaluj Node.js i Wrangler, potem wykonaj wrangler login.')


def run_wrangler(base: list[str], *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run([*base, *args], cwd=ROOT, text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          errors='replace', check=False)


def error_is_missing(proc: subprocess.CompletedProcess[str]) -> bool:
    output = (proc.stdout + '\n' + proc.stderr).lower()
    # Guard against a missing bucket/authentication being mistaken for a
    # missing object. No write is attempted on unknown errors.
    blocked = ('nosuchbucket', 'bucket does not exist', 'bucket not found',
               'unauthorized', 'authentication', 'not logged in',
               'accessdenied', 'forbidden', 'permission', 'invalid token',
               'not authorized', 'account not found', 'signature')
    if any(w in output for w in blocked):
        return False
    return any(pattern.search(output) for pattern in MISS_PATTERNS)


def content_type(path: Path) -> str:
    typ, _ = mimetypes.guess_type(path.name)
    if path.suffix.lower() in ('.ipk', '.deb', '.apk', '.exe', '.bin'):
        return 'application/octet-stream'
    return typ or 'application/octet-stream'


def check_one(base: list[str], key: str, source: Path, digest: str, temporary: Path) -> str:
    target = temporary / 'object.bin'
    target.unlink(missing_ok=True)
    result = run_wrangler(base, 'r2', 'object', 'get', f'{BUCKET}/{key}',
                          '--remote', '--file', str(target))
    if result.returncode == 0:
        if not target.is_file():
            return 'ERROR: Wrangler zakonczyl bez zapisanego pliku'
        return 'OK' if sha256(target) == digest else 'CONFLICT: inne bajty w R2 (nie nadpisano)'
    if error_is_missing(result):
        return 'MISSING'
    # Avoid outputting raw remote messages, which might contain sensitive URLs.
    return f'ERROR: odczyt R2 nieudany (kod procesu {result.returncode}; brak pewnosci, ze obiekt nie istnieje)'


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = p.add_mutually_exclusive_group()
    mode.add_argument('--audit', action='store_true', help='sprawdz tylko pliki repozytorium (domyslnie)')
    mode.add_argument('--check', action='store_true', help='porownaj odczyt R2 bez zmian')
    mode.add_argument('--apply', action='store_true', help='uzupelnij tylko brakujace obiekty i zweryfikuj')
    p.add_argument('--only', action='append', metavar='NAZWA_LUB_KLUCZ',
                   help='ogranicz do wskazanego pliku (mozna powtarzac)')
    args = p.parse_args()
    if not (ROOT / 'functions/pliki/[[path]].js').is_file():
        print('BLAD: Nie znaleziono functions/pliki/[[path]].js. Uruchom w repo AIO.', file=sys.stderr)
        return 2
    try:
        refs, metadata_hashes = catalogue()
    except Exception as err:
        print('BLAD: '+str(err), file=sys.stderr)
        return 2
    if args.only:
        names = set(args.only)
        refs = {k: v for k, v in refs.items() if k in names or Path(k).name in names}
        if not refs:
            print('BLAD: Wskazane pliki nie wystepuja w katalogu HTML/JSON.', file=sys.stderr)
            return 2
    if not refs:
        print('BLAD: Katalog nie zawiera plikow w /pliki/', file=sys.stderr)
        return 2
    checked: list[tuple[str, Path, str]] = []
    errors = 0
    print(f'AIO R2: tryb={"APPLY" if args.apply else "CHECK" if args.check else "AUDIT"}; bucket={BUCKET}; laczy={len(refs)}')
    for key in sorted(refs):
        source = (ROOT / key)
        if not source.is_file() or source.is_symlink():
            print(f'BRAK LOKALNIE: {key} (odsylacze: {", ".join(sorted(refs[key]))})')
            errors += 1
            continue
        actual = sha256(source)
        meta = metadata_hashes.get(key)
        if meta and meta != actual:
            # Metadata in this repository has known legacy discrepancies.
            # Do not silently accept that as an authoritative digest.
            print(f'UWAGA SHA katalogu: {key} (w pliku data/downloads.json jest inna suma)')
        checked.append((key, source, actual))
    if errors:
        print(f'UWAGA: {errors} plikow z HTML/JSON brak w lokalnym repo. Nie da sie ich przeslac; pozostale beda sprawdzane.', file=sys.stderr)
    if not checked:
        print('BLAD: brak jakichkolwiek poprawnych plikow lokalnych.', file=sys.stderr)
        return 3
    if not (args.check or args.apply):
        print(f'AUDIT: {len(checked)} plikow lokalnie, {errors} brakow. Nie zmieniono R2.')
        return 3 if errors else 0
    try:
        base = wrangler_command()
    except RuntimeError as err:
        print('BLAD: '+str(err), file=sys.stderr)
        return 2
    counts = {'OK': 0, 'MISSING': 0, 'UPLOAD': 0, 'ERROR': 0, 'CONFLICT': 0}
    with tempfile.TemporaryDirectory(prefix='aio-r2-repair-') as tmp:
        work = Path(tmp)
        for index, (key, source, digest) in enumerate(checked, start=1):
            result = check_one(base, key, source, digest, work)
            status = result.split(':', 1)[0]
            if result == 'OK':
                counts['OK'] += 1
                print(f'[{index}/{len(checked)}] OK      {key}')
                continue
            if result == 'MISSING':
                counts['MISSING'] += 1
                if not args.apply:
                    print(f'[{index}/{len(checked)}] BRAK R2 {key}')
                    continue
                upload = run_wrangler(base, 'r2', 'object', 'put', f'{BUCKET}/{key}',
                    '--remote', '--file', str(source), '--content-type', content_type(source))
                if upload.returncode != 0:
                    counts['ERROR'] += 1
                    print(f'[{index}/{len(checked)}] BLAD UPLOAD {key} (kod procesu {upload.returncode})')
                    continue
                after = check_one(base, key, source, digest, work)
                if after == 'OK':
                    counts['UPLOAD'] += 1
                    print(f'[{index}/{len(checked)}] NAPRAWIONO {key} (SHA-256 OK)')
                else:
                    counts['ERROR'] += 1
                    print(f'[{index}/{len(checked)}] BLAD WERYFIKACJI {key}: {after}')
                continue
            counts['CONFLICT' if status == 'CONFLICT' else 'ERROR'] += 1
            print(f'[{index}/{len(checked)}] {result} {key}')
    print('WYNIK:', ', '.join(f'{k}={v}' for k, v in counts.items()))
    if counts['ERROR'] or counts['CONFLICT'] or errors:
        print('Nie zmieniaj ustawien Cloudflare i nie omijaj funkcji ochronnych. Sprawdz bledy i binding R2.', file=sys.stderr)
        return 4
    if counts['MISSING'] and not args.apply:
        print('Brakujace pliki R2 mozna uzupelnic przez --apply; --check nic nie zmienil.')
    if args.apply:
        print('R2 uzupelnione. Test strony wykonaj po zalogowaniu na konto AIO, bez zmiany limitow.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
