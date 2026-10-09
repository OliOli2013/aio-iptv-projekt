#!/usr/bin/env bash
set -euo pipefail

echo "AIO-IPTV.pl — instalacja ochrony treści"
echo "--------------------------------------"

if [[ ! -f "index.html" ]]; then
  echo "BŁĄD: uruchom ten skrypt w głównym katalogu repozytorium (tam gdzie index.html)."
  exit 1
fi

python3 - <<'PY'
from pathlib import Path
import re

css_href="assets/css/content-protection.css?v=20261009-protect1"
js_src="assets/js/content-protection.js?v=20261009-protect1"

changed=[]
for path in Path(".").glob("*.html"):
    text=path.read_text(encoding="utf-8")
    text=re.sub(r'\s*<link[^>]+href=["\']assets/css/content-protection\.css[^"\']*["\'][^>]*>\s*','\n',text,flags=re.I)
    text=re.sub(r'\s*<script[^>]+src=["\']assets/js/content-protection\.js[^"\']*["\'][^>]*>\s*</script>\s*','\n',text,flags=re.I)

    if "</head>" not in text or "</body>" not in text:
        print("POMINIĘTO:",path)
        continue

    text=text.replace("</head>",f'<link rel="stylesheet" href="{css_href}"/>\n</head>',1)
    text=text.replace("</body>",f'<script defer src="{js_src}"></script>\n</body>',1)
    path.write_text(text,encoding="utf-8")
    changed.append(str(path))

print("Zaktualizowano stron HTML:",len(changed))
for x in changed:
    print("  +",x)
PY

if [[ -f service-worker.js ]]; then
python3 - <<'PY'
from pathlib import Path
import re
p=Path("service-worker.js")
s=p.read_text(encoding="utf-8")
s=re.sub(r"const CACHE='[^']+';","const CACHE='aio-iptv-pro-20261009-content-protection1';",s,count=1)
if "content-protection.css" not in s and "const CORE=[" in s:
    s=s.replace("const CORE=[","const CORE=[\n  './assets/css/content-protection.css?v=20261009-protect1','./assets/js/content-protection.js?v=20261009-protect1',",1)
p.write_text(s,encoding="utf-8")
print("Zaktualizowano service-worker.js")
PY
fi

echo
echo "Gotowe."
echo "Sprawdź zmiany w GitKraken, zrób commit i push."
echo "Po wdrożeniu Cloudflare wykonaj Ctrl+F5."
