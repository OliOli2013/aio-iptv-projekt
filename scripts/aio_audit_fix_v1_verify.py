#!/usr/bin/env python3
"""Read-only regression assertions for AIO Audit Fix V1.

This is a static contract check. It is not an E2E/D1/Cloudflare integration test.
"""
from pathlib import Path
import re
import sys

root=Path(__file__).resolve().parents[1]

def load(name):
    return (root/name).read_text(encoding='utf-8')

def ensure(condition,message):
    if not condition: raise AssertionError(message)

try:
    api=load('functions/api/community.js')
    mode=api.split('if (action === "feed")',1)[1].split('if (action === "post")',1)[0]
    guest=mode.split('if (!user) {',1)[1].split('} else if (mode === "official")',1)[0]
    ensure("mode === 'official'" in guest and "p.kind='official'" in guest,'Brak serwerowego filtra official dla gości')
    ensure("if (mode === 'mine') where.push('1=0');" in guest,'Tryb Moje musi być ukryty dla gości')
    ensure('guestPostTeaser(rawRows[i])' in mode,'Gość może otrzymać tylko bezpieczny teaser')
    ensure("if (!user && row?.status==='published' && row.kind==='community')" in api,'Podgląd tylko opublikowanych postów')
    core=load('assets/js/community-core.js')
    ensure('async apiGet(action, params={}, options={})' in core,'API GET nie wspiera opcjonalnych opcji')
    ensure("cache:'no-store',signal:options.signal" in core,'Brak AbortSignal')
    feed=load('assets/js/community-feed.js')
    ensure('state.requestSeq++' in feed and 'state.activeController.abort()' in feed,'Brak anulowania starszego zapytania')
    ensure('controller.signal.aborted||seq!==state.requestSeq' in feed,'Brak zabezpieczenia przed nieaktualnymi wynikami')
    ensure('!reset&&state.loading' in feed,'Paginacja musi chronić przed wielokrotnym pobraniem')
    ensure('page=page+1' in feed,'Nieprawidłowa paginacja')
    cat=load('assets/js/aio-catalog-downloads-v1.js')
    ensure("new CustomEvent('aio:download-catalog-updated'" in cat,'Katalog nie zgłasza zmiany kart')
    ensure("document.querySelector('#downloadSearch')?.dispatchEvent" in cat,'Brak kompatybilności ze starymi filtrami')
    v2=load('assets/js/aio-downloads-v2.js')
    ensure("document.addEventListener('aio:download-catalog-updated',scheduleRefresh);" in v2,'V2 nie reaguje na aktualizację')
    ensure("cards=$$('[data-download-card]');" in v2.split('function refresh(){',1)[1].split('function scheduleRefresh()',1)[0],
           'V2 musi pobierać AKTUALNĄ listę kart przy odświeżaniu')
    pro=load('assets/js/pro-suite.js')
    part=pro.split('function initDownloadFilters(){',1)[1].split('function initCompatibilityFilters(){',1)[0]
    ensure("document.addEventListener('aio:download-catalog-updated',run);" in part,'Starsze filtry nie reagują na aktualizację')
    ensure("function run(){const cards=$$('[data-download-card]');" in part,'Starsze filtry muszą mieć dynamiczną listę kart')
    print('AIO AUDIT FIX V1: statyczne testy regresji i kontraktów: OK (3 obszary).')
except Exception as error:
    print('BŁĄD AUDIT FIX V1:',error,file=sys.stderr)
    sys.exit(1)
