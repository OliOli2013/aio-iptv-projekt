#!/usr/bin/env python3
"""AIO Catalog V1: non-destructive aggregate of legacy assets + explicit publications.

Legacy downloads.json/projects.json remain unchanged and authoritative for old records.
Only data/aio-publications-v1.json is the authoring input for NEW releases.
Output: data/aio-catalog-v1.json consumed by the homepage, search and Smart Tuner.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = 'data/aio-catalog-v1.json'
PUBLICATIONS = 'data/aio-publications-v1.json'


def read(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8'))


def slug(value):
    value = unicodedata.normalize('NFKD', str(value)).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', value)).strip('-') or 'release'


def iso_date(value, required=False):
    from datetime import datetime
    value = str(value or '').strip()
    for fmt in ('%Y-%m-%d', '%d.%m.%Y'):
        try:
            return datetime.strptime(value,fmt).date().isoformat()
        except ValueError:
            pass
    if value and required:
        raise ValueError('Niepoprawna data wydania: '+value+' (RRRR-MM-DD)')
    if required:
        raise ValueError('Data wydania jest wymagana')
    return None


def valid_url(url, local_exists=False):
    url = str(url or '').strip()
    if not url or '\\' in url or any(ord(c) < 32 for c in url) or url.startswith('//'):
        raise ValueError('Nieprawidłowy adres pliku: '+repr(url))
    parsed=urlsplit(url)
    if parsed.scheme in ('http','https') and parsed.netloc:
        return url
    if parsed.scheme or parsed.netloc or parsed.fragment or parsed.path.startswith('/'):
        raise ValueError('Wymagany względny URL pliku albo adres https: '+url)
    rel=unquote(parsed.path)
    candidate=(ROOT/rel).resolve()
    if not candidate.is_relative_to(ROOT) or '..' in Path(rel).parts:
        raise ValueError('Niebezpieczna ścieżka: '+url)
    if local_exists and not candidate.is_file():
        raise ValueError('Lokalny plik nie istnieje: '+url)
    return url


def create_catalog():
    base_projects=read('data/projects.json')
    base_files=read('data/downloads.json')
    publication_rows=read(PUBLICATIONS)
    if not all(isinstance(x,list) for x in (base_projects,base_files,publication_rows)):
        raise ValueError('Katalogi i publikacje muszą być listami JSON.')
    if not base_projects or not base_files:
        raise ValueError('Brak istniejących danych projektów lub plików.')
    projects=[copy.deepcopy(p) for p in base_projects]
    files=[copy.deepcopy(x) for x in base_files]
    ids={p['id'] for p in projects}
    page_to_id={str(p.get('page','')).lower():p['id'] for p in projects if p.get('page')}
    releases=[]
    project_lookup={p['id']:p for p in projects}
    file_hrefs={str(f.get('href','')).strip() for f in files}
    for index, item in enumerate(files):
        name=str(item.get('sourceTitle') or item.get('title') or 'Plik AIO')
        page=str(item.get('sourcePage') or '')
        pid=page_to_id.get(page.lower()) or slug(page.removesuffix('.html') or name)
        version=str(item.get('version') or '').strip()
        file_id='legacy-'+hashlib.sha256(str(item.get('href','')).encode()).hexdigest()[:16]
        item['project_id']=pid
        item['release_id']=file_id
        item['origin']='legacy'
        item['published_at']=None
        item['verified_at']=None
        item['access']='konto_AIO' if str(item.get('href','')).startswith('pliki/') else 'zgodnie_ze_zrodlem'
        release={
            'id':file_id,'project_id':pid,'project_name':project_lookup.get(pid,{}).get('name') or name,
            'version':version,'date':iso_date(item.get('date')),
            'title':str(item.get('title') or name),'summary':project_lookup.get(pid,{}).get('summary',''),
            'page':page or 'downloads.html','channel':'legacy','origin':'legacy','published_at':None,'verified_at':None,
            'files':[str(item.get('href') or '')],
        }
        releases.append(release)

    known_pub_ids=set()
    for row in publication_rows:
        if not isinstance(row,dict):raise ValueError('Publikacja nie jest obiektem JSON.')
        required=('id','project_id','name','version','date','page','summary','category','platform')
        for key in required:
            if not isinstance(row.get(key),str) or not row[key].strip():
                raise ValueError('Brak pola '+key+' w publikacji '+str(row.get('id','?')))
        release_id=str(row['id']).strip()
        if not re.fullmatch('[a-z0-9][a-z0-9-]{2,110}',release_id) or release_id in known_pub_ids:
            raise ValueError('Powielone lub niepoprawne ID publikacji: '+release_id)
        known_pub_ids.add(release_id)
        date=iso_date(row['date'],required=True)
        page=str(row['page'])
        if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]*\.html',page) or not (ROOT/page).is_file():
            raise ValueError('Strona opisu nie istnieje: '+page)
        project_id=str(row['project_id'])
        if not re.fullmatch('[a-z0-9][a-z0-9-]{2,100}',project_id):
            raise ValueError('Niepoprawny project_id: '+project_id)
        published_files=row.get('files')
        if not isinstance(published_files,list) or not published_files:
            raise ValueError('Publikacja wymaga przynajmniej jednego pliku/linku: '+release_id)
        if project_id not in ids:
            new_proj={
                'id':project_id,'name':row['name'],'version':row['version'],'page':page,
                'category':row['category'],'status':'active','statusLabel':'Nowe wydanie',
                'updated':date,'summary':row['summary'],
                'tested':'Zgodność nie została niezależnie potwierdzona','next':'Sprawdź wymagania na stronie projektu.'
            }
            projects.append(new_proj);project_lookup[project_id]=new_proj;ids.add(project_id)
        else:
            item=project_lookup[project_id]
            # Update latest version only when the publication is newer than the stored release date.
            old_date=iso_date(item.get('updated'))
            if not old_date or date>=old_date:
                item['version']=row['version'];item['updated']=date
                item['summary']=row['summary']
        asset_urls=[]
        for asset in published_files:
            if not isinstance(asset,dict):raise ValueError('Nieprawidłowy plik publikacji '+release_id)
            href=valid_url(asset.get('href'),local_exists=True)
            if href in file_hrefs:
                raise ValueError('Adres pliku już jest w katalogu: '+href+' — nie duplikuj starszego wydania')
            file_hrefs.add(href)
            sha=str(asset.get('sha256') or '').strip().lower()
            if sha and not re.fullmatch('[0-9a-f]{64}',sha):
                raise ValueError('SHA-256 musi mieć 64 znaki hex: '+href)
            if sha and not urlsplit(href).scheme:
                h=hashlib.sha256()
                with (ROOT/unquote(urlsplit(href).path)).open('rb') as inp:
                    for chunk in iter(lambda:inp.read(1024*1024),b''):
                        h.update(chunk)
                if h.hexdigest()!=sha:
                    raise ValueError('Niezgodna suma SHA-256 nowego wydania: '+href)
            kind=str(asset.get('kind') or Path(urlsplit(href).path).suffix.lstrip('.').upper() or 'LINK')
            title=str(asset.get('title') or f"{row['name']} {row['version']} — {kind}")
            file_record={
                'title':title,'href':href,'category':row['category'],'platform':row['platform'],
                'version':row['version'],'date':date,'status':'Aktualna',
                'sourcePage':page,'sourceTitle':row['name'],'kind':kind,
                'size':str(asset.get('size') or ''),'sha256':sha,
                'official':str(asset.get('source') or 'Wydanie AIO — sprawdź źródło'),
                'project_id':project_id,'release_id':release_id,'origin':'aio_v1',
                'access':'konto_AIO' if href.startswith('pliki/') else 'zgodnie_ze_zrodlem',
                'published_at':str(row.get('published_at') or date),
                'verified_at':str(row.get('verified_at') or '') or None
            }
            files.append(file_record);asset_urls.append(href)
        releases.append({
            'id':release_id,'project_id':project_id,'project_name':row['name'],'version':row['version'],
            'date':date,'title':row.get('title') or f"{row['name']} {row['version']}",
            'summary':row['summary'],'page':page,'channel':row.get('channel') or 'stable',
            'origin':'aio_v1','files':asset_urls,
            'published_at':str(row.get('published_at') or date),
            'verified_at':str(row.get('verified_at') or '') or None
        })
    return {
        'schema_version':1,
        'note':'Katalog scalony: dawne dane zachowane; nowe wydania publikuj tylko przez data/aio-publications-v1.json. Nie edytuj tego pliku wynikowego.',
        'projects':projects,'files':files,'releases':releases,
        'counts':{'projects':len(projects),'files':len(files),'releases':len(releases),'new_publications':len(publication_rows)}
    }


def serialized(data):
    return json.dumps(data,ensure_ascii=False,indent=2)+'\n'


def build(check):
    content=serialized(create_catalog())
    path=ROOT/OUTPUT
    if check:
        if not path.is_file() or path.read_text('utf-8')!=content:
            raise ValueError('Katalog wynikowy jest nieaktualny. Uruchom: python3 scripts/aio_catalog_v1.py build')
        print('AIO KATALOG V1: sprawdzono poprawność oraz zgodność katalogu: OK')
    else:
        path.write_text(content,encoding='utf-8')
        data=json.loads(content)
        print('AIO KATALOG V1: %d projektów, %d plików, %d nowych publikacji' % (
            data['counts']['projects'],data['counts']['files'],data['counts']['new_publications']))


def add():
    print('\nAIO KATALOG V1 — dodaj nowe wydanie. Uwaga: plik lokalny musi istnieć w repozytorium.\n')
    def ask(name,optional=False,default=''):
        value=input(name+(f' [{default}]' if default else '')+': ').strip()
        value=value or default
        if not value and not optional:raise ValueError('Wymagana wartość: '+name)
        return value
    items=read(PUBLICATIONS)
    name=ask('Nazwa projektu (np. AIO Panel)')
    project_id=ask('ID projektu (np. aio-panel)',default=slug(name))
    version=ask('Wersja (np. 18.0.0)')
    id_=ask('ID wydania',default=slug(name+'-'+version))
    date=ask('Data wydania (RRRR-MM-DD)')
    page=ask('Strona opisu (np. plugin-aio-panel.html)')
    summary=ask('Krótki opis zmian')
    category=ask('Kategoria (np. Wtyczki)',default='Wtyczki')
    platform=ask('Platforma (np. Enigma2)',default='Enigma2')
    href=ask('Adres do pliku lub https://...')
    kind=ask('Format (np. IPK)',default=Path(urlsplit(href).path).suffix.lstrip('.').upper() or 'LINK')
    size=ask('Rozmiar (opcjonalnie)',optional=True)
    sha=ask('SHA-256 (opcjonalnie)',optional=True)
    if id_ in {p.get('id') for p in items}:raise ValueError('To ID wydania już istnieje.')
    item={'id':id_,'project_id':project_id,'name':name,'version':version,
          'date':date,'page':page,'summary':summary,'category':category,
          'platform':platform,'channel':'stable','files':[{'href':href,'kind':kind,'size':size,'sha256':sha}]}
    items.append(item)
    orig=(ROOT/PUBLICATIONS).read_text('utf-8')
    (ROOT/PUBLICATIONS).write_text(serialized(items),encoding='utf-8')
    try:build(check=False)
    except Exception:
        (ROOT/PUBLICATIONS).write_text(orig,encoding='utf-8')
        raise
    print('Zapisano wydanie. Teraz GitKraken Stage → Commit → Push.')


if __name__=='__main__':
    p=argparse.ArgumentParser(description='AIO Catalog V1 — generator z walidacją.')
    p.add_argument('command',choices=['build','check','add'])
    args=p.parse_args()
    try:
        {'build':lambda:build(False),'check':lambda:build(True),'add':add}[args.command]()
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print('BŁĄD AIO KATALOG V1:',exc,file=sys.stderr)
        sys.exit(1)
