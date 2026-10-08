#!/usr/bin/env bash
set -euo pipefail

OLD_BASE='https://olioli2013.github.io/aio-iptv-projekt'
NEW_BASE='https://aio-iptv-projekt.pages.dev'
SUPABASE_TAG_1='<script crossorigin="anonymous" src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/dist/umd/supabase.min.js"></script>'
SUPABASE_TAG_2='<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/dist/umd/supabase.min.js" crossorigin="anonymous"></script>'

if [[ ! -f index.html || ! -f assets/js/community-core.js || ! -f functions/api/community.js ]]; then
  echo 'BŁĄD: uruchom ten skrypt w głównym katalogu repozytorium aio-iptv-projekt.' >&2
  exit 1
fi

echo '1/5 Aktualizacja adresu strony w metadanych...'
python3 - <<'PY'
from pathlib import Path
old='https://olioli2013.github.io/aio-iptv-projekt'
new='https://aio-iptv-projekt.pages.dev'
files=[]
files += list(Path('.').glob('*.html'))
for name in ['README.md','sitemap.xml','robots.txt']:
    p=Path(name)
    if p.exists(): files.append(p)
for p in files:
    try:
        text=p.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        continue
    changed=text.replace(old,new)
    if changed!=text:
        p.write_text(changed,encoding='utf-8')
        print('  URL:',p)
PY

echo '2/5 Usuwanie zbędnego supabase-js tylko ze stron przeniesionej Społeczności...'
python3 - <<'PY'
from pathlib import Path
scripts=[
'<script crossorigin="anonymous" src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/dist/umd/supabase.min.js"></script>',
'<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/dist/umd/supabase.min.js" crossorigin="anonymous"></script>'
]
# AI Chat pozostaje celowo nietknięty — nadal używa Supabase Edge Function.
for name in ['index.html','community.html','post.html','profile.html','community-admin.html','news.html']:
    p=Path(name)
    if not p.exists(): continue
    text=p.read_text(encoding='utf-8')
    changed=text
    for s in scripts:
        changed=changed.replace(s,'')
    if changed!=text:
        p.write_text(changed,encoding='utf-8')
        print('  CDN:',p)
PY

echo '3/5 Ujednolicenie wersji plików Cloudflare w HTML...'
python3 - <<'PY'
from pathlib import Path
repl={
'assets/js/aio-experience.js?v=20260816-community-first':'assets/js/aio-experience.js?v=20261008-cloudflare-clean1',
'assets/js/community-core.js?v=20260914-community12-unified1':'assets/js/community-core.js?v=20261008-cloudflare-clean1',
'assets/js/community-feed.js?v=20260728-community10-aio-connect':'assets/js/community-feed.js?v=20261008-cloudflare1',
'assets/js/community-feed.js?v=20260728-community10':'assets/js/community-feed.js?v=20261008-cloudflare1',
'assets/js/community-post.js?v=20260728-community10-aio-connect':'assets/js/community-post.js?v=20261008-cloudflare-edit2',
'assets/js/community-post.js?v=20260728-community10':'assets/js/community-post.js?v=20261008-cloudflare-edit2',
'assets/js/community-profile.js?v=20260726-community8':'assets/js/community-profile.js?v=20261008-cloudflare1',
'assets/js/community-admin.js?v=20260728-community10-aio-connect':'assets/js/community-admin.js?v=20261008-cloudflare-edit2',
'assets/js/community-admin.js?v=20260728-community10':'assets/js/community-admin.js?v=20261008-cloudflare-edit2',
'assets/js/community-home.js?v=20260728-community10-aio-connect':'assets/js/community-home.js?v=20261008-cloudflare1',
'assets/js/community-home.js?v=20260728-community10':'assets/js/community-home.js?v=20261008-cloudflare1',
'assets/js/community-home-latest.js?v=20261001-latest1':'assets/js/community-home-latest.js?v=20261008-cloudflare1'
}
for p in Path('.').glob('*.html'):
    text=p.read_text(encoding='utf-8')
    changed=text
    for a,b in repl.items(): changed=changed.replace(a,b)
    if changed!=text:
        p.write_text(changed,encoding='utf-8')
        print('  VER:',p)
PY

echo '4/5 Wersja konfiguracji Społeczności...'
python3 - <<'PY'
from pathlib import Path
p=Path('assets/js/community-core.js')
text=p.read_text(encoding='utf-8')
changed=text.replace('data/community_config.json?v=20261008-cloudflare1','data/community_config.json?v=20261008-cloudflare-clean1')
changed=changed.replace('data/community_config.json?v=20260728-community10-aio-connect','data/community_config.json?v=20261008-cloudflare-clean1')
if changed!=text:
    p.write_text(changed,encoding='utf-8')
    print('  CFG:',p)
PY

echo '5/5 Kontrola bezpieczeństwa...'
python3 - <<'PY'
from pathlib import Path
import json
json.loads(Path('data/community_config.json').read_text(encoding='utf-8'))
assert 'https://aio-iptv-projekt.pages.dev' in Path('robots.txt').read_text(encoding='utf-8')
assert 'https://aio-iptv-projekt.pages.dev' in Path('sitemap.xml').read_text(encoding='utf-8')
# AI Chat ma pozostać na Supabase, dopóki nie zostanie osobno zmigrowany.
ai=Path('ai-chat.html').read_text(encoding='utf-8')
assert '@supabase/supabase-js' in ai
print('  OK: konfiguracja JSON, sitemap, robots i AI Chat sprawdzone.')
PY

echo
echo 'GOTOWE. Sprawdź zmiany w GitKraken przed commitem.'
echo 'AI Chat NIE został przeniesiony ani wyłączony.'
