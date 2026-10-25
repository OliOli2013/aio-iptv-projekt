#!/usr/bin/env python3
"""AIO Pages public-only static output. Functions stay at repository root.

Run by Cloudflare Pages as a build command. The allowlist prevents publishing
root-level scripts, audits, repository internals, historical dumps or caches.
This builder intentionally preserves /pliki/ for legacy and R2 modes; Pages
Functions must still mediate private downloads (see _routes.json).
"""
from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'dist'
PUBLIC_FOLDERS = ('assets', 'data', 'pliki', 'traffic')
ROOT_NAMED = {
    '_headers', '_redirects', '_routes.json', 'robots.txt', 'sitemap.xml',
    'service-worker.js', 'manifest.json', 'favicon.ico',
    'app_final.js', 'i18n.js', 'style.css', 'home_modern.css',
}
ROOT_IMAGE_EXT = {'.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.avif', '.ico'}


def copy_safe_file(source: Path, target: Path) -> None:
    if source.is_symlink() or not source.is_file():
        raise RuntimeError(f'Zabroniony lub nieprawidlowy plik: {source}')
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def copy_safe_tree(source: Path, target: Path) -> None:
    if source.is_symlink() or not source.is_dir():
        raise RuntimeError(f'Katalog jest dowiazaniem lub nie istnieje: {source}')
    for candidate in source.rglob('*'):
        if candidate.is_symlink():
            raise RuntimeError(f'Dowiazanie symboliczne w zasobach publicznych: {candidate}')
        relative = candidate.relative_to(source)
        if any(part.startswith('.') for part in relative.parts):
            # Deliberately skip hidden files, e.g. development tooling.
            continue
        if candidate.is_dir():
            (target / relative).mkdir(parents=True, exist_ok=True)
        elif candidate.is_file():
            copy_safe_file(candidate, target / relative)
        else:
            raise RuntimeError(f'Nieobslugiwany typ zasobu: {candidate}')


def validate_routes() -> None:
    cfg = json.loads((ROOT / '_routes.json').read_text('utf-8'))
    includes = cfg.get('include', [])
    excludes = cfg.get('exclude', [])
    if '/*' not in includes:
        raise RuntimeError('Brak catch-all Pages Functions w _routes.json')
    if any(x == '/pliki/*' or x.startswith('/pliki/') for x in excludes):
        raise RuntimeError('Prywatne pliki nie moga byc w exclude Pages Functions')
    for required in ['functions/_middleware.js', 'functions/pliki/[[path]].js', 'functions/api/community-auth.js']:
        if not (ROOT / required).is_file():
            raise RuntimeError(f'Brak funkcji bezpieczenstwa: {required}')


def build() -> None:
    validate_routes()
    if DEST.is_symlink():
        raise RuntimeError('dist jest dowiazaniem symbolicznym; przerwano')
    with tempfile.TemporaryDirectory(prefix='.aio-public-build-v1-', dir=ROOT) as tmp:
        stage = Path(tmp) / 'site'
        stage.mkdir()
        for item in ROOT.iterdir():
            if item.is_file() and not item.is_symlink():
                if item.name in ROOT_NAMED or item.suffix.lower() in ROOT_IMAGE_EXT or item.suffix.lower() == '.html':
                    copy_safe_file(item, stage / item.name)
            elif item.is_symlink():
                if item.name in ROOT_NAMED or item.suffix.lower() in ROOT_IMAGE_EXT or item.suffix.lower() == '.html':
                    raise RuntimeError(f'Zasob publiczny jest dowiazaniem symbolicznym: {item}')
        for name in PUBLIC_FOLDERS:
            source = ROOT / name
            if source.exists():
                copy_safe_tree(source, stage / name)
        source = ROOT / '.well-known' / 'security.txt'
        if source.exists():
            copy_safe_file(source, stage / '.well-known' / 'security.txt')
        if not (stage / 'index.html').is_file():
            raise RuntimeError('Brakuje index.html w buildzie')
        if not (stage / '_routes.json').is_file():
            raise RuntimeError('Brakuje _routes.json; ochrona tras musi pozostac aktywna')
        if DEST.exists():
            if not DEST.is_dir():
                raise RuntimeError('dist istnieje, ale nie jest katalogiem')
            shutil.rmtree(DEST)
        shutil.move(str(stage), str(DEST))
    files = sum(p.is_file() for p in DEST.rglob('*'))
    print(f'AIO Pages Public Build V1: OK; {files} plikow w dist/; funkcje zostaja w functions/')


if __name__ == '__main__':
    try:
        build()
    except Exception as error:
        print(f'AIO Pages Public Build V1: BLAD: {error}', file=sys.stderr)
        sys.exit(1)
