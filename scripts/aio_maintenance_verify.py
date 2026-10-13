#!/usr/bin/env python3
"""Read-only verification of the AIO Maintenance V1 package (not live runtime test)."""
from pathlib import Path
import re
import sys
root=Path(__file__).resolve().parent.parent
required={
 'functions/api/community-media.js':['aio-maint-media-check-v1','canReadMember','Nie masz dostępu do tego pliku'],
 'functions/api/owner-admin.js':['aio-maintenance-owner-v1','maintenance_cleanup_expired','tab === "maintenance"','tab === "media_audit"'],
 'assets/js/site.js':['aio-maint-analytics-consent-v1'],
 'assets/js/stats-nav.js':['aio-maint-analytics-consent-v1'],
 'assets/js/aio-site-stats.js':['aio-maint-stats-revocation-v1'],
 'assets/js/content-protection.js':['aio-maint-accessibility-v1'],
 'community-admin.html':['href="aio-maintenance.html"'],
 'aio-maintenance.html':['id="aioMaintPrivate"','name="robots"'],
 'assets/js/aio-maintenance-panel.js':['maintenance_cleanup_expired','fetch('],
 'scripts/aio_maintenance_backup.sh':['--dry-run','--remote','--d1-only'],
 'scripts/aio_privacy_maintenance.sql':['SELECT','90 days'],
 'scripts/aio_optimize_images.py':['--apply','--report'],
}
errors=[]
for name,tokens in required.items():
 f=root/name
 if not f.is_file():errors.append('Brak: '+name);continue
 s=f.read_text('utf-8')
 for tok in tokens:
  if tok not in s:errors.append(name+': brak '+tok)
for legal in ['privacy-community.html','cookies.html','rodo-rights.html']:
 if not (root/legal).is_file():errors.append('Brak dokumentu: '+legal)
# Credentials must never be embedded in public dashboard.
panel=(root/'assets/js/aio-maintenance-panel.js').read_text('utf-8')
for forbidden in ['OPENAI_API_KEY','D1_API_TOKEN','CLOUDFLARE_API_TOKEN']:
 if forbidden in panel:errors.append('Podejrzany klucz w JS: '+forbidden)
for e in errors:print('BŁĄD:',e)
print('AIO MAINTENANCE STATIC CHECK:', 'OK' if not errors else 'BŁĘDY')
sys.exit(1 if errors else 0)
