#!/usr/bin/env python3
"""Static regression checks: privacy, catalogue reuse, deferred home DB reads, lazy community images."""
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
def read(p):return (ROOT/p).read_text(encoding='utf-8')
S={p:read(p) for p in ['assets/js/aio-home-v2.js','assets/js/community-home.js','assets/js/aio-catalog-version-v1.js','assets/js/community-feed.js','index.html','community.html','news.html']}
checks=[
 ('Home API feed is guarded by scroll visibility',"nearViewport('[data-aio-community-latest]',latestCommunity)" in S['assets/js/aio-home-v2.js'] and "rootMargin:'320px 0px'" in S['assets/js/aio-home-v2.js']),
 ('Home stats defer D1 until visible',"rootMargin:'220px 0px'" in S['assets/js/community-home.js'] and 'observer.disconnect()' in S['assets/js/community-home.js']),
 ('Home catalog shared without duplicate projects GET', 'window.AIOHomeCatalogV1 = loadUnifiedCatalog' in S['assets/js/aio-home-v2.js'] and 'window.AIOHomeCatalogV1()' in S['assets/js/aio-catalog-version-v1.js']),
 ('Legacy projects version fallback retained', "fetch('data/projects.json'" in S['assets/js/aio-catalog-version-v1.js']),
 ('Feed images use native lazy loading', 'alt="Zdjęcie do wpisu" loading="lazy" decoding="async" data-community-image' in S['assets/js/community-feed.js']),
 ('No modification to VIP, auth and access', all('user-premium.js' in S[p] for p in ['index.html','community.html','news.html'])),
 ('Home cache busts', all('v=20261018-performance-v1' in S[p] for p in ['index.html','community.html','news.html'])),
 ('Access still defined only by login in feed', 'Boolean(AIOCommunity.user)' in S['assets/js/community-feed.js']),
]
for label,ok in checks:
    print(('OK: ' if ok else 'BŁĄD: ')+label)
if not all(x[1] for x in checks):sys.exit(1)
print(f'AIO PERFORMANCE V1: testów statycznych: {len(checks)} / {len(checks)} OK.')
