#!/usr/bin/env python3
"""AIO Security Core V1: read-only local coverage audit, no network/D1/R2.
Raises on uncontrolled newly added debit routes or missing foundational controls.
Cannot prove that public R2 domains or third-party file mirrors are private.
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path

root=Path(__file__).resolve().parents[1]
read=lambda p:(root/p).read_text('utf-8')
required={
 'functions/_aio_account_access.js':'coreAdmitDownload(env,request,userId,status)',
 'functions/pliki/[[path]].js':'consumeFree(env,user.id,fileKey,request)',
 'functions/api/aio-post-link.js':'consumeFree(env,user.id,fileKey,request)',
 'functions/api/aio-external-download.js':'consumeFree(env,user.id,fileKey,request)',
 'functions/api/aio-account-access.js':'consumeFree(env,user.id,null,request)',
 'functions/_aio_monthly_access.js':'used>=0 AND used<3',
 'functions/api/aio-panel-ipk.js':'PUBLIC',
 'functions/_aio_security_core_v1.js':'coreAdmitDownload',
 'functions/api/aio-security-core.js':'requireAdmin',
 'functions/_middleware.js':'isAioInternalRepoPath',
}
failures=[]
for path,marker in required.items():
    try:
        if marker.lower() not in read(path).lower():failures.append('Brak integracji '+path+' ('+marker+')')
    except FileNotFoundError:failures.append('Brak pliku '+path)
try:
    gateway=read('functions/pliki/[[path]].js')
    if re.search(r"if\(request\.method==='HEAD'\)return new Response\(null,\{status:302,headers:\{Location:mirror",gateway):
        failures.append('KRYTYCZNE: HEAD zdradza chroniony mirror bez naliczenia')
    if 'status:204' not in gateway:failures.append('Brak bezpiecznego HEAD dla legacy mirror')
    if gateway.count('consumeFree(env,user.id,fileKey,request)') != 3:
        failures.append('Mirror, pierwszy HTTP 206 i HTTP 200 nie przechodzą przez Core')
    if gateway.count("if(!permit.allowed)return permit.reason==='limit'?redirectToInformation") != 1:
        failures.append('Brak kontroli odmowy dla chronionego mirror')
    if "if(!permit.allowed){" not in gateway or "if(permit.reason==='network')" not in gateway:
        failures.append('Brak kontroli odmowy sieci dla R2')
    if 'asset.status===206' not in gateway or 'authorizeRange(env,request,user.id,fileKey' not in gateway:
        failures.append('Brak kontroli naliczania fragmentów HTTP 206')
    if 'consumeFree(env,user.id,fileKey)' in gateway:
        failures.append('Pozostało przestarzałe naliczenie bez Request w pliki/')
except FileNotFoundError:pass
# External proxy must retain authenticated admission on both paths and every debit.
try:
    external=read('functions/api/aio-external-download.js')
    markers=('coreAdmitDownload(env,request,user.id,state)',
             'coreAdmitDownload(env,request,user.id,fresh)',
             'if(!admission.allowed)return denied(admission)',
             'if(!freshAdmission.allowed)return denied(freshAdmission)',
             'verifyTicketSource(env,t,url.origin)', 'takeTicket(env,token,user.id)',
             'claimSpeedLease(env,user.id)', 'speedResponse(asset,config,lease,context)',
             'if(premiumOnly && state.active!==true)', 'if(premiumOnly && fresh.active!==true)')
    if any(marker not in external for marker in markers):
        failures.append('Brak wymaganych kontroli w zewnetrznej bramce transferu')
    if external.count('consumeFree(env,user.id,fileKey,request)')!=2 or external.count('if(!permit.allowed)return denied(permit)')!=2:
        failures.append('Niezweryfikowane naliczenie lub odmowa w zewnetrznej bramce')
except FileNotFoundError:pass
# Megawrzuta entitlement must be checked before either managed or legacy handoff.
for path in ('functions/api/aio-post-link.js','functions/api/aio-link-handoff.js'):
    source=read(path)
    guard=source.find('megawrzutaPaidDenied(clicked.href,status)')
    prepare=source.find('const managed=await prepareExternal(')
    debit=source.find('consumeFree(env,user.id,fileKey,request)')
    if not (0 <= guard < prepare < debit):failures.append('Brak kontroli dostepu Megawrzuta: '+path)
# Every call to consumeFree outside the shared implementation must include Request.
allowed={'functions/pliki/[[path]].js','functions/api/aio-post-link.js','functions/api/aio-account-access.js','functions/api/aio-link-handoff.js','functions/api/aio-external-download.js'}
found=[]
for p in sorted((root/'functions').rglob('*.js')):
    path=p.relative_to(root).as_posix()
    src=p.read_text('utf-8')
    if path=='functions/_aio_account_access.js':continue
    if re.search(r'\bconsumeFree\s*\(',src):
        found.append(path)
        if path not in allowed:failures.append('Niezweryfikowana nowa ścieżka naliczenia: '+path)
        for row in src.splitlines():
            if re.search(r'\bconsumeFree\s*\(',row) and 'request)' not in row:
                failures.append('Naliczenie bez Request: '+path)
# Scan for accidental access to the atomic quota primitive outside current trusted module.
quota=[]
for p in (root/'functions').rglob('*.js'):
    path=p.relative_to(root).as_posix()
    if path=='functions/_aio_monthly_access.js':continue
    src=p.read_text('utf-8')
    if re.search(r'\bconsumeMonthly\s*\(',src):quota.append(path)
for path in quota:
    if path!='functions/_aio_account_access.js':failures.append('Nowa ścieżka bezpośredniego zużywania limitu: '+path)
tracked_backup=False
try:
    import subprocess
    if (root/'.git').exists():
        g=subprocess.run(['git','ls-files','--','.aio-local-backups'],cwd=root,capture_output=True,text=True,check=False)
        tracked_backup=bool(g.stdout.strip())
        if tracked_backup:failures.append('Śledzone lokalne kopie w .aio-local-backups: popraw git rm --cached')
except Exception:pass
report={
 'version':'AIO_SECURITY_CORE_V1_20261114',
 'scope':'read-only static source audit; no live endpoint/Cloudflare validation',
 'authorized_metered_routes':sorted(allowed),
 'discovered_metered_routes':found,
 'monthly_debit_consumers':sorted(quota),
 'r2_external_public_access_checked':False,
 'external_host_file_delivery_controlled':False,
 'tracked_backup_files':tracked_backup,
 'problems':failures,
 'result':'PASS' if not failures else 'FAIL'
}
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(1 if failures else 0)
