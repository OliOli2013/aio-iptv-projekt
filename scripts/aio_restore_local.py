#!/usr/bin/env python3
"""Non-production D1 restore drill in RAM; no production Cloudflare writes."""
from pathlib import Path
import hashlib,os,sqlite3,sys
HOME=Path.home()
base=HOME/'AIO_PRIVATE_BACKUPS'
if not base.is_dir():
    print('AIO RESTORE: brak lokalnego katalogu kopii; pominięto test.');sys.exit(0)
shots=sorted((p for p in base.iterdir() if p.is_dir() and (p/'community-d1.sql').is_file()),reverse=True)
if not shots:
    print('AIO RESTORE: brak pełnego eksportu D1; pominięto test.');sys.exit(0)
dir=shots[0]
sql=dir/'community-d1.sql'
checks=dir/'community-d1.sha256'
if not checks.is_file():sys.exit('AIO RESTORE: brak sumy SHA-256 D1')
checksum=checks.read_text('utf-8').split()[0]
h=hashlib.sha256(sql.read_bytes()).hexdigest()
if h!=checksum:sys.exit('AIO RESTORE: BŁĄD sumy SHA-256 D1')
# SQLite in-memory only. Never create another Cloudflare database and never print rows.
con=sqlite3.connect(':memory:')
try:
    con.executescript(sql.read_text('utf-8-sig'))
    result=con.execute('PRAGMA integrity_check').fetchone()[0]
    names={r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    required={'community_auth','community_profiles','community_posts','community_sessions'}
    if result!='ok' or not required.issubset(names):
        sys.exit('AIO RESTORE: BŁĄD integralności albo brak wymaganych tabel')
finally:con.close()
print('AIO RESTORE: OK, odtworzono strukturę i dane w pamięci RAM, PRAGMA integrity_check=ok.')
print('Brak jakichkolwiek zmian w produkcyjnej Cloudflare D1.')
