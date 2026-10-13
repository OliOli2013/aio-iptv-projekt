#!/usr/bin/env python3
"""Read-only catalog sanity audit for AIO. Does not touch downloads or D1/R2."""
from pathlib import Path
import hashlib,json,re,sys
from urllib.parse import urlsplit,unquote
ROOT=Path(__file__).resolve().parent.parent
p=ROOT/'data/downloads.json'
items=json.loads(p.read_text('utf-8'))
projects=json.loads((ROOT/'data/projects.json').read_text('utf-8'))
if not isinstance(items,list) or not isinstance(projects,list):sys.exit('BŁĄD: katalogi JSON nie są listami')
errors=[];warnings=[];checked_hashes=0
for i,x in enumerate(items,1):
    if not isinstance(x,dict):errors.append(f'Wpis {i}: nieprawidłowy typ');continue
    href=str(x.get('href') or '')
    if not href:errors.append(f'Wpis {i}: brak href');continue
    u=urlsplit(href)
    if u.scheme or u.netloc:continue
    target=(ROOT/unquote(u.path).lstrip('/')).resolve()
    if not target.is_relative_to(ROOT.resolve()):errors.append(f'Niebezpieczna ścieżka: {href}');continue
    if not target.is_file() and not (not target.suffix and target.with_suffix('.html').is_file()):errors.append(f'Brak pliku: {href}');continue
    digest=str(x.get('sha256') or '').lower()
    if len(digest)==64 and re.fullmatch(r'[0-9a-f]{64}',digest) and target.is_file():
        h=hashlib.sha256()
        with target.open('rb') as f:
            for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
        checked_hashes+=1
        if h.hexdigest()!=digest:warnings.append(f'SHA-256 różna od opisu: {href}')
for x in projects:
    if not isinstance(x,dict):continue
    page=x.get('page')
    if page and not (ROOT/str(page)).is_file():errors.append(f'Projekt {x.get("id")}: brak {page}')
print(f'AIO KATALOG: {len(items)} pozycji, {len(projects)} projektów, {checked_hashes} sprawdzonych SHA-256.')
for err in errors[:50]:print('BŁĄD:',err)
for warning in warnings[:50]:print('UWAGA:',warning)
if errors:sys.exit(1)
print('AIO KATALOG: STRUKTURA OK')
