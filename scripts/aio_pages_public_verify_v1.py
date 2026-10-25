#!/usr/bin/env python3
"""Verify build contains required assets but no technical repo files."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'dist'
REQUIRED = (
    'index.html', 'community.html', 'konto.html', 'community-admin.html',
    'downloads.html', '_headers', '_routes.json', '_redirects',
    'assets/js', 'data/downloads.json', '.well-known/security.txt',
)
FORBIDDEN = (
    'AUDYT_TRANSFERU.md', 'AUDYT_STRONY_2026-10-01.md',
    'apply_cleanup.sh', 'apply_content_protection.sh', 'README.md',
    'SECURITY.md', '.gitignore', '.wrangler', '.github',
    'scripts', 'tests', 'supabase', 'worker', 'functions',
    'archiwum', 'node_modules',
)


def check() -> None:
    if not PUBLIC.is_dir():
        raise RuntimeError('Brak katalogu dist/: uruchom najpierw skrypt build')
    for rel in REQUIRED:
        if not (PUBLIC / rel).exists():
            raise RuntimeError(f'Brak zasobu publicznego: {rel}')
    for rel in FORBIDDEN:
        if (PUBLIC / rel).exists():
            raise RuntimeError(f'Plik techniczny w wyniku builda: {rel}')
    bad = [p.relative_to(PUBLIC).as_posix() for p in PUBLIC.rglob('*')
           if p.is_file() and (p.name.startswith('.env') or p.name.startswith('.dev.vars'))]
    if bad:
        raise RuntimeError(f'Potencjalne sekrety w dist: {bad[:5]}')
    print('AIO Pages Public Verify V1: OK; zasoby publiczne sa, pliki techniczne pominiete')


if __name__ == '__main__':
    try:
        check()
    except Exception as error:
        print(f'AIO Pages Public Verify V1: BLAD: {error}', file=sys.stderr)
        sys.exit(1)
