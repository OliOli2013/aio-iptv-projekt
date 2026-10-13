#!/usr/bin/env python3
"""AIO Smart Tuner static deployment checks; no Cloudflare/API writes."""
import json, re, sys, xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
errors=[]
def ck(test, msg):
    if not test:errors.append(msg)
def read(path):
    p=ROOT/path
    ck(p.is_file(),f'Brak pliku: {path}')
    return p.read_text('utf-8') if p.is_file() else ''
page=read('smart-tuner.html')
style=read('assets/css/aio-smart-tuner.css')
logic=read('assets/js/aio-smart-tuner-core.js')
app=read('assets/js/aio-smart-tuner.js')
data=json.loads(read('data/smart-tuner-compat.json') or '{}')
tuners=json.loads(read('data/tuners.json') or '{}')
projects=json.loads(read('data/projects.json') or '[]')
sitemap=read('sitemap.xml')
for k in ['stForm','stModel','stSystem','stPython','stResults','stHardware','stSave','stCategory','stConfidence','stProjectSearch']:
    ck(f'id="{k}"' in page,'Brak pola UI: '+k)
ck('aio-header-v2.css' in page and 'assets/js/aio-header-v2.js' in page,'Header V6 nie został zachowany')
ck('aio-smart-tuner-core.js' in page and 'aio-smart-tuner.js' in page,'Brak JS Smart Tuner')
ck('aio-smart-tuner.css' in page,'Brak CSS Smart Tuner')
ck('aio_tuner_profile_v1' in app,'Brak integracji z Moim tunerem')
ck('localStorage.setItem' in app and 'data/tuners.json' in app,'Brak katalogu lub profilu')
ck('AIOSmartTunerCore' in logic,'Brak silnika zgodności')
tuner_rows=tuners.get('tuners') if isinstance(tuners,dict) else None
ck(isinstance(tuner_rows,list) and any(isinstance(t,dict) and t.get('brand') and t.get('model') for t in tuner_rows or []),
   'Brak poprawnych modeli w bazie tunerów')
unique_models={str(t.get('brand','')).strip().casefold()+' '+str(t.get('model','')).strip().casefold()
    for t in (tuner_rows or []) if isinstance(t,dict) and t.get('brand') and t.get('model')}
if isinstance(tuners,dict) and tuners.get('count') not in (None,len(tuner_rows or [])):
    print('UWAGA: metadane count w data/tuners.json nie zgadzają się z liczbą wpisów; nie zmieniam bazy.')
ids={x.get('id') for x in projects}
rules=data.get('rules',{})
ck(len(rules)>=14,'Zbyt mało reguł zgodności')
ck(not (set(rules)-ids),'Nieznane projekty w regułach: '+str(set(rules)-ids))
for project in projects:
    if project.get('id') not in rules:continue
    path=project.get('page','')
    ck(bool(re.fullmatch(r'[a-zA-Z0-9_.-]+\.html',path)) and (ROOT/path).is_file(),f'Zła strona projektu {project.get("id")}: {path}')
for name in ['my-tuner.html','index.html','compatibility.html']:
    ck('href="smart-tuner.html"' in read(name),'Brak linku z '+name)
try:ET.fromstring(sitemap)
except ET.ParseError as e:errors.append('Sitemap: '+str(e))
ck('https://aio-iptv-projekt.pages.dev/smart-tuner</loc>' in sitemap,'Brak Smart Tunera w sitemap')
ck('functions/api/' not in str(ROOT/'smart-tuner.html'),'Błąd ścieżki')
for f in [p for p in ROOT.glob('data/*.json') if p.name in ('smart-tuner-compat.json','projects.json','tuners.json')]:
    try:json.loads(f.read_text('utf-8'))
    except Exception as e:errors.append(f'Błędny JSON {f.name}: {e}')
if errors:
    for e in errors:print('BŁĄD:',e)
    sys.exit(1)
print(f'AIO SMART TUNER: OK — {len(tuner_rows or [])} wpisów, {len(unique_models)} unikalnych modeli; {len(rules)} reguł; {len(projects)} projektów.')
print('Tryb bezpieczny: brak zapisów do D1/R2; pełna zgodność sprzętowa wymaga weryfikacji.')
