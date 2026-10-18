#!/usr/bin/env python3
"""Read-only active-site audit: links, downloads, hashes, and sitemap.

The preserved archiwum/ folder contains a historical snapshot with obsolete,
relative paths and is intentionally excluded from release validation.
To inspect that snapshot explicitly, use --include-archive.
"""
import argparse,hashlib,html.parser,json,sys,xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit,unquote
ROOT=Path(__file__).resolve().parents[1]
class Parser(html.parser.HTMLParser):
 def __init__(self):super().__init__();self.refs=[]
 def handle_starttag(self,tag,attrs):
  attrs=dict(attrs)
  for key in ['src','href','poster']:
   if attrs.get(key):self.refs.append((key,attrs[key]))
  if attrs.get('srcset'):
   for x in attrs['srcset'].split(','):
    if x.strip():self.refs.append(('srcset',x.strip().split()[0]))

# AIO STABILNOSC V2: Cloudflare Pages Functions are URLs, not static files.
# Accept only exact, explicitly included routes backed by a matching handler.
def declared_function_route(path):
 if not path.startswith('/') or path.endswith('/') or Path(path).suffix:return False
 rules_file=ROOT/'_routes.json'
 if not rules_file.is_file():return False
 try:
  rules=json.loads(rules_file.read_text(encoding='utf-8'))
  includes=rules.get('include',[])
 except (ValueError,OSError,TypeError):return False
 if not isinstance(includes,list) or path not in includes:return False
 rel=Path(path.lstrip('/'))
 if '..' in rel.parts:return False
 handler=ROOT/'functions'/rel.with_suffix('.js')
 return handler.is_file()

def missing(source,ref):
 ref=ref.strip()
 if not ref or ref.startswith(('#','//','/api/')) or '${' in ref or '{{' in ref:return None
 u=urlsplit(ref)
 if u.scheme or u.netloc or not u.path:return None
 p=unquote(u.path)
 if p.endswith('/'):return None
 dest=((ROOT/p.lstrip('/')) if p.startswith('/') else (source.parent/p)).resolve()
 if not dest.is_relative_to(ROOT.resolve()):return 'Zewnętrzna ścieżka względna: '+p
 if dest.is_file() or (not dest.suffix and dest.with_suffix('.html').is_file()):return None
 if declared_function_route(p):return None
 return p

def audit(sha,strict,include_archive=False):
 bad=[];warn=[];pages=0;skipped_archive=0
 for page in ROOT.rglob('*.html'):
  rel=page.relative_to(ROOT)
  if '.git' in rel.parts:continue
  # Historical 2026 legacy site is preserved for reference, not published
  # as a supported section of the current AIO site. Do not treat its old
  # relative paths as faults of the active pages.
  if not include_archive and rel.parts and rel.parts[0]=='archiwum':
   skipped_archive+=1
   continue
  pages+=1;p=Parser()
  try:p.feed(page.read_text('utf-8',errors='replace'))
  except Exception as e:warn.append(f'{page.relative_to(ROOT)} parser: {e}');continue
  for kind,link in p.refs:
   m=missing(page,link)
   if m:bad.append(f'{page.relative_to(ROOT)} {kind}={link}: brak {m}')
 cat=ROOT/'data/downloads.json';items=[]
 if cat.exists():
  try:items=json.loads(cat.read_text('utf-8'))
  except Exception as e:bad.append('data/downloads.json błędny JSON: '+str(e))
  for x in items:
   href=str(x.get('href',''));m=missing(ROOT/'index.html',href)
   if m:bad.append('downloads.json '+href+' → '+m)
   if sha and not m and not urlsplit(href).scheme and len(str(x.get('sha256','')))==64:
    f=ROOT/href.lstrip('/').split('?')[0]
    if f.is_file():
     h=hashlib.sha256()
     with f.open('rb') as inp:
      for chunk in iter(lambda:inp.read(1024*1024),b''):h.update(chunk)
     if h.hexdigest().lower()!=str(x['sha256']).lower():warn.append('Niezgodna suma SHA (zweryfikuj metadane): '+href)
 if (ROOT/'sitemap.xml').exists():
  try:ET.parse(ROOT/'sitemap.xml')
  except ET.ParseError as e:bad.append('sitemap.xml XML: '+str(e))
 for line in bad[:100]:print('BŁĄD:',line)
 for line in warn[:100]:print('UWAGA:',line)
 print(f'HTML aktywne: {pages}; archiwum pominięte: {skipped_archive}; katalog: {len(items)}; błędne odwołania: {len(bad)}; ostrzeżenia: {len(warn)}')
 return 1 if strict and bad else 0
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--strict-links',action='store_true');p.add_argument('--sha',action='store_true');p.add_argument('--include-archive',action='store_true',help='Inspect historic archiwum/ links (not included in release checks)');a=p.parse_args();sys.exit(audit(a.sha,a.strict_links,a.include_archive))
