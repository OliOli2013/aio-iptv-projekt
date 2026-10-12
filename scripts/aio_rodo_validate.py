#!/usr/bin/env python3
"""Read-only RODO regression smoke test for the AIO static bundle."""
from pathlib import Path
import re, sys
ROOT=Path(__file__).resolve().parents[1]
issues=[]

def check(ok,message):
    if not ok: issues.append(message)

pages=['privacy-community.html','cookies.html','rodo-rights.html','community.html','ai-chat.html','index.html']
for name in pages:
    p=ROOT/name
    check(p.is_file(),f'Brak: {name}')
    if not p.is_file():continue
    s=p.read_text(encoding='utf-8')
    check('privacy-community.html' in s,f'Brak linku prywatności: {name}')
    check('cookies.html' in s,f'Brak linku do cookies: {name}')
    check('rodo-rights.html' in s,f'Brak linku do praw RODO: {name}')
for name in pages[:3]:
    p=ROOT/name
    if not p.is_file():continue
    s=p.read_text(encoding='utf-8')
    check('aio-legal-main' in s,f'Brak treści dokumentu: {name}')
    check('aio-legal.css' in s,f'Brak arkusza CSS: {name}')
    check('__CONTROLLER_' not in s and '__CONTACT_' not in s,f'Nieuzupełnione dane administratora: {name}')
    check(len(re.findall(r'<main\b',s))==1 and len(re.findall(r'</main>',s))==1,f'Podwójny main: {name}')
source={}
for name in ['assets/js/user-premium.js','assets/js/auto-language.js','assets/js/community-core.js','assets/js/aio-site-stats.js']:
    p=ROOT/name
    check(p.is_file(),f'Brak: {name}')
    if p.is_file():source[name]=p.read_text(encoding='utf-8')
check('aio_privacy_stats_consent_v1' in source.get('assets/js/user-premium.js',''), 'Brak kontroli statystyk')
check('aio-privacy-choice-changed' in source.get('assets/js/user-premium.js',''), 'Brak zmiany zgody w locie')
check('aio_privacy_translate_yes_v1' in source.get('assets/js/auto-language.js',''), 'Brak kontroli Google Translate')
check('data-aio-privacy-registration' in source.get('assets/js/community-core.js',''), 'Brak informacji przy rejestracji')
check('aio-rodo-ai-disclosure' in (ROOT/'ai-chat.html').read_text(encoding='utf-8'), 'Brak ostrzeżenia AI Chat')
for entry in ['cookies','rodo-rights']:
    s=(ROOT/'sitemap.xml').read_text(encoding='utf-8')
    check(f'https://aio-iptv-projekt.pages.dev/{entry}</loc>' in s, 'Sitemap bez '+entry)
check(not (ROOT/'PRYWATNE_PROCEDURY').exists(), 'Dokumenty prywatne wewnątrz publicznego repozytorium')
# Dodatkowa kontrola AIO RODO V2: nie przedstawiaj marki jako firmy ani e-maila jako adresu pocztowego.
privacy_page=(ROOT/'privacy-community.html').read_text(encoding='utf-8') if (ROOT/'privacy-community.html').is_file() else ''
check('Administratorem danych osobowych przetwarzanych w ramach AIO-IPTV.pl jest <strong>MSiSystem</strong>' not in privacy_page,
      'MSiSystem nie jest zarejestrowaną firmą — popraw dane administratora')
check('Adres do korespondencji: <strong>aio-iptv@wp.pl</strong>' not in privacy_page,
      'E-mail jest błędnie oznaczony jako adres pocztowy')
if issues:
    for issue in issues:print('BŁĄD:',issue)
    sys.exit(1)
print('AIO RODO VALIDATION: OK — kontrole techniczne i treści; to NIE certyfikat zgodności prawnej')
