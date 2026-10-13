#!/usr/bin/env python3
"""Read-only assertions for AIO Stability and Convenience V1."""
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parent.parent
rules={
 'functions/api/aio-health.js':['onRequestGet','SELECT 1 AS ready','COMMUNITY_MEDIA'],
 'assets/js/aio-catalog-version-v1.js':['data/projects.json','.aio-v2-projects'],
 'assets/css/aio-stability-v1.css':['aio-edit-dialog-v1'],
 'assets/js/community-post.js':['aio-edit-dialog-v1'],
 'assets/js/community-core.js':['openPasswordReset','openPasswordResetConfirm'],
 'functions/api/community-auth.js':['AIO_RESET_FROM_EMAIL','RESEND_API_KEY','request_reset'],
 'index.html':['aio-catalog-version-v1.js'],
 'post.html':['aio-stability-v1.css'],
 '.github/workflows/aio-uptime.yml':['aio-health','schedule:'],
}
errors=[]
for path,needles in rules.items():
    p=ROOT/path
    if not p.is_file():errors.append(f'Brak {path}');continue
    s=p.read_text('utf-8')
    for n in needles:
        if n not in s:errors.append(f'Brak znacznika {n} w {path}')
for e in errors:print('BŁĄD:',e)
if errors:sys.exit(1)
print('AIO STABILITY STATIC CHECK: OK')
