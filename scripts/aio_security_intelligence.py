#!/usr/bin/env python3
"""Scheduled AIO audit. Read operational data; write only a bounded private report.
No account changes, no raw IP/email/token/UA output. Standard library only.
"""
import base64, datetime as dt, hashlib, ipaddress, json, os, re, sys, unicodedata
from collections import defaultdict, Counter
from pathlib import Path
from urllib.request import Request, urlopen

UTC=dt.timezone.utc
DBS={'production':'218b6d0e-8be5-4265-90fe-f51158f8e2e6','preview':'6cabd0f2-ab23-4ad7-821a-3197143ce2b6'}
UUID=re.compile(r'^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$',re.I)
FULL=re.compile(r'^[A-Za-z0-9_-]{43}$')
HEX=re.compile(r'^[0-9a-f]{64}$')
AUTH_EVENTS={'register_ok','login_ok','login_review_blocked'}
MAX_ROWS=200_000
MAX_CASES=300
PAGE=500
ROOT=Path(__file__).resolve().parents[1]

def moment(v):
    try:
        t=dt.datetime.fromisoformat(str(v).replace('Z','+00:00'))
        return t.replace(tzinfo=UTC) if t.tzinfo is None else t.astimezone(UTC)
    except (ValueError,TypeError): return None

def iso(t): return t.astimezone(UTC).isoformat(timespec='milliseconds').replace('+00:00','Z')
def digest(s): return hashlib.sha256(s.encode()).hexdigest()
def fingerprint(s): return base64.urlsafe_b64encode(hashlib.sha256(('aio-security-ip-v1:'+s).encode()).digest()).decode().rstrip('=')
def namekey(s): return unicodedata.normalize('NFKC',str(s or '')).strip().casefold()
def emhash(s): return digest(str(s or '').strip().lower())
def blocked(p,now): return bool(moment(p.get('banned_until')) and moment(p['banned_until'])>now)
def evidence_event(r): return r['event'] in AUTH_EVENTS or (r['event']=='download_denied' and str(r.get('detail') or '').lower().startswith('limit'))

class D1:
    def __init__(self,target,account,token):
        if target not in DBS or not re.fullmatch(r'[0-9a-fA-F]{32}',account or '') or not token: raise ValueError('Brak konfiguracji D1')
        self.url=f'https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{DBS[target]}/query'
        self.token=token
    def query(self,sql,params=()):
        data=json.dumps({'sql':sql,'params':[str(x) if x is not None else None for x in params]}).encode()
        req=Request(self.url,data,headers={'Authorization':'Bearer '+self.token,'Content-Type':'application/json'},method='POST')
        # Do not log request, SQL, response body or exception text from the provider.
        try:
            with urlopen(req,timeout=60) as r: payload=json.load(r)
            result=payload['result']
            if not payload.get('success') or len(result)!=1 or not result[0].get('success'): raise RuntimeError('D1 query failed')
            return result[0].get('results',[])
        except Exception: raise RuntimeError('Nieudane zapytanie D1') from None
    def scan(self,select,source,where='1=1',params=()):
        # Bound the scan at start; concurrent changes do not constitute a transactional snapshot.
        end=int(self.query(f'SELECT COALESCE(MAX(rowid),0) AS n FROM {source.split()[0]}')[0]['n'])
        rows=[]; after=0
        while after<end:
            part=self.query(f'SELECT t.rowid AS _r,{select} FROM {source} WHERE t.rowid>? AND t.rowid<=? AND ({where}) ORDER BY t.rowid LIMIT {PAGE}',(after,end,*params))
            if not part: break
            next_row=int(part[-1]['_r'])
            if next_row<=after or next_row>end: raise RuntimeError('Niepoprawna paginacja')
            rows.extend(part); after=next_row
            if len(rows)>MAX_ROWS: raise RuntimeError('Przekroczono limit odczytu; raport niepelny')
        return rows

def analyse(profiles,ips,journal,archives,historical,checks,now,seen=()):
    """Pure analysis; case keys do not expose network fingerprints."""
    p={r['id']:r for r in profiles if r['role']=='user'}
    active={uid for uid,row in p.items() if not blocked(row,now)}
    issues={}; warnings=[]
    def add(kind,severity,users,identity,detail,when=None):
        users=sorted(set(users)); key=digest(json.dumps([kind,identity,users],ensure_ascii=False,sort_keys=True))
        # Up to 30 displayed users; count is kept separately. Never silently omit the existence of a case.
        people=[{'id':u,'name':str(p[u].get('display_name') or '')[:100],'blocked':u not in active} for u in users[:30] if u in p]
        issues[key]={'key':key,'kind':kind,'severity':severity,'users':people,'user_count':len(users),'detail':detail,'at':when}
    groups=defaultdict(set); covered=set(); invalid_ip=0
    for r in ips:
        u=r['user_id']; raw=str(r.get('ip_address') or '')
        if u not in p: continue
        try: ip=ipaddress.ip_address(raw.strip())
        except ValueError: invalid_ip+=1; continue
        covered.add(u); groups[('ip',str(ip))].add(u); groups[('hash',fingerprint(raw))].add(u)
        if ip.version==6: groups[('v6',str(ipaddress.ip_network(f'{ip}/64',strict=False)))].add(u)
    day=now-dt.timedelta(days=1); metrics=Counter(); weak_groups=defaultdict(set)
    for r in journal:
        u=r.get('user_id'); event=r['event']; t=moment(r['created_at']); h=str(r.get('ip_fingerprint') or '')
        if t and day<=t<=now: metrics[event]+=1
        if u not in p or not FULL.fullmatch(h): continue
        if evidence_event(r): groups[('hash',h)].add(u); covered.add(u)
        elif event=='login_failed': weak_groups[h].add(u)
    # Group equivalent account sets, so the exact IP and its SHA-256 are not counted twice.
    merged=defaultdict(set); weak_count=0; closed=0
    for (kind,key),members in groups.items():
        if len(members)<2: continue
        if not members & active: closed+=1; continue
        merged[tuple(sorted(members))].add((kind,digest(key)))
    for h,members in weak_groups.items():
        peers=groups.get(('hash',h),set()); unmatched=members-peers
        if unmatched and peers and (unmatched|peers)&active: weak_count+=1
    for users,kinds in merged.items():
        labels={'ip':'dokładny IP','hash':'pełny skrót IP','v6':'IPv6 /64'}
        add('network','review',users,[list(users),sorted(kinds)],'Wspólna historyczna sieć: '+', '.join(labels[k] for k in sorted({k for k,_ in kinds}))+'. Nie jest dowodem wspólnej tożsamości.')
    for r in historical:
        u=r['user_id']; peer=r['peer_id']
        if u in active and peer in p:
            add('history_v2','high',[u,peer],[u,peer,r['event'],r['evidence_at'],r['registration_at']],f"Kandydat Anti-Abuse V2: {r['event']}; wcześniejsze zdarzenie o {r['seconds_before']} s. Wymaga decyzji właściciela.",r['registration_at'])
    archived_hashes=0; archived_names=0; archive_valid=0
    for r in archives:
        try:
            m=json.loads(r['metadata']); t=moment(r['created_at']); old=r['target_id']
            if not t or not isinstance(m,dict) or not isinstance(m.get('display_name'),str) or not isinstance(m.get('email_sha256'),list): raise ValueError()
            hs={h for h in m['email_sha256'] if isinstance(h,str) and HEX.fullmatch(h)}
            if len(hs)!=len(set(m['email_sha256'])): raise ValueError()
        except (ValueError,TypeError,KeyError): warnings.append('Nieprawidłowy wpis archiwum; niepełne porównanie.'); continue
        archive_valid+=1; archived_hashes+=bool(hs); nk=namekey(m['display_name']); archived_names+=bool(nk)
        for u,q in p.items():
            created=moment(q.get('created_at'))
            if u not in active or u==old or not created or created<t: continue
            if nk and namekey(q['display_name'])==nk:
                add('archive_name','review',[u],[old,u,nk],'Zgodna nazwa z archiwum usuniętych kont. Sama nazwa nie uzasadnia blokady.',q['created_at'])
            if hs and hs.intersection(emhash(q.get(k)) for k in ('profile_email','auth_email') if q.get(k)):
                add('archive_email','high',[u],[old,u],'Zgodny skrót e-mail z archiwum. Wymaga decyzji właściciela.',q['created_at'])
    for kind,rows in checks.items():
        for r in rows:
            u=r.get('user_id'); peer=r.get('peer_id'); at=r.get('at')
            if kind=='strict_hold' and u not in p: continue
            if kind not in ('orphan_claim','banned_session','strict_hold') and u not in active: continue
            if kind=='banned_session' and (u not in p or u in active): continue
            if kind=='orphan_claim':
                add(kind,'review',[],[u,r.get('source')],f"Przypisanie sieci bez profilu: {u} ({r.get('source')}). Sprawdź, czy celowo zachowane.")
                continue
            labels={'banned_session':('high',f"Zablokowany profil ma {r.get('n')} niewygasłych zwykłych sesji. Nie oznacza to, że sesje mają dostęp."),
              'paid_hold':('high','Aktywna blokada współdzielenia VIP/7D.'), 'multi_pending':('high','Multikonta V2: oczekuje na decyzję.'),
              'vpn_review':('review','Historyczny wynik VPN/Proxy/Tor bez przeglądu; nie potwierdza bieżącej sieci.'),
              'quota_invalid':('high','Niespójna struktura cyklu miesięcznego; nie zmieniono limitu.'),
              'strict_hold':('review','Aktywna blokada Strict V4; sprawdź status, jeśli wymaga decyzji.')}
            severity,detail=labels[kind]; people=[u]+([peer] if peer in p else [])
            add(kind,severity,people,[u,peer,at,r.get('n'),r.get('source')],detail,at)
    seen=set(seen)
    all_cases=sorted(issues.values(),key=lambda x:(x['key'] in seen,x['severity']!='high',x['kind'],x['key']))
    if len(all_cases)>MAX_CASES: warnings.append(f'Pokazano {MAX_CASES} z {len(all_cases)} spraw; raport częściowy.')
    if invalid_ip: warnings.append(f'Niepoprawne zapisane IP: {invalid_ip}; pominięto.')
    return {'version':1,'checked_at':iso(now),'metrics':{'profiles':len(profiles),'ordinary':len(p),'blocked':len(p)-len(active),
        'ip_rows':len(ips),'journal_rows':len(journal),'without_authenticated_network':len(set(p)-covered),
        'archive_count':archive_valid,'archive_names':archived_names,'archive_with_email_hash':archived_hashes,
        'registrations_24h':metrics['register_ok'],'denied_signups_v2_24h':metrics['anti_abuse_signup_denied_v2'],
        'download_denied_24h':metrics['download_denied'],'failed_logins_24h':metrics['login_failed'],
        'paid_holds_24h':metrics['paid_account_sharing_hold'],
        'weak_failed_login_groups':weak_count,'closed_network_groups':closed,'total_cases':len(all_cases)},
        'cases':all_cases[:MAX_CASES],'warnings':sorted(set(warnings))}

CHECKS={
 'banned_session':("SELECT p.id AS user_id,COUNT(*) AS n,MAX(s.created_at) AS at FROM community_profiles p JOIN community_sessions s ON s.user_id=p.id WHERE p.role='user' AND datetime(p.banned_until)>datetime(?) AND datetime(s.expires_at)>datetime(?) GROUP BY p.id",('community_sessions',)),
 'paid_hold':("SELECT user_id,created_at AS at FROM aio_security_paid_holds WHERE status='active' AND datetime(expires_at)>datetime(?)",('aio_security_paid_holds',)),
 'multi_pending':("SELECT user_id,peer_user_id AS peer_id,created_at AS at FROM aio_multikonta_reviews_v2 WHERE status='pending'",('aio_multikonta_reviews_v2',)),
 'strict_hold':("SELECT user_id,primary_user_id AS peer_id,created_at AS at FROM aio_strict_ip_holds_v4 WHERE status='active'",('aio_strict_ip_holds_v4',)),
 'vpn_review':("SELECT user_id,checked_at AS at,verdict AS source FROM aio_vpn_guard_reviews_v1 WHERE verdict IN ('vpn','proxy','tor') AND reviewed_at IS NULL",('aio_vpn_guard_reviews_v1',)),
 'quota_invalid':("SELECT user_id,updated_at AS at,used AS n FROM aio_access_monthly_cycles WHERE used<0 OR used>3 OR (used=3 AND (third_ms<=0 OR resets_ms<=third_ms)) OR (used<3 AND (third_ms<>0 OR resets_ms<>0))",('aio_access_monthly_cycles',)),
 'orphan_claim':("SELECT DISTINCT c.user_id,'Strict V4' AS source FROM aio_strict_ip_claims_v4 c LEFT JOIN community_profiles p ON p.id=c.user_id WHERE p.id IS NULL UNION SELECT DISTINCT c.user_id,'IP Policy' AS source FROM aio_ip_policy_claims c LEFT JOIN community_profiles p ON p.id=c.user_id WHERE p.id IS NULL",('aio_strict_ip_claims_v4','aio_ip_policy_claims')),
}

def run(db,owner,target):
    now=dt.datetime.now(UTC); stamp=iso(now)
    if not UUID.fullmatch(owner or ''): raise RuntimeError('Nieprawidlowy identyfikator wlasciciela')
    tables={r['name'] for r in db.query("SELECT name FROM sqlite_master WHERE type='table'")}
    required={'community_profiles','community_auth','community_user_ips','aio_security_journal','community_moderation_log'}
    if not required<=tables: raise RuntimeError('Brak wymaganych tabel')
    if db.query("SELECT id FROM community_profiles WHERE id=? AND role='admin'",(owner,))!=[{'id':owner}]: raise RuntimeError('Nie potwierdzono wlasciciela w wybranej bazie')
    archives=db.scan('t.target_id,t.created_at,t.metadata','community_moderation_log t',"t.action='owner_archive_no_ip_v1'")
    # Only read email fields if an actual archived hash exists. Never persist emails.
    need_email=False
    for a in archives:
        try: need_email |= bool(json.loads(a['metadata']).get('email_sha256'))
        except (ValueError,TypeError,AttributeError): pass
    cols='t.id,t.role,t.display_name,t.created_at,t.banned_until'
    if need_email: cols+=',t.email AS profile_email,a.email AS auth_email'
    profiles=db.scan(cols,'community_profiles t'+(' LEFT JOIN community_auth a ON a.user_id=t.id' if need_email else ''))
    # Protect configured owner even if the source profile role changes during the scan.
    profiles=[{**r,'role':'admin'} if r['id']==owner else r for r in profiles]
    ips=db.scan('t.user_id,t.ip_address','community_user_ips t',"t.ip_address IS NOT NULL AND t.ip_address<>''")
    journal=db.scan('t.user_id,t.ip_fingerprint,t.event,t.created_at,CASE WHEN t.event=\'download_denied\' AND lower(t.detail) LIKE \'limit%\' THEN \'limit\' ELSE \'\' END AS detail','aio_security_journal t')
    sql=(ROOT/'scripts/aio-anti-abuse-v2-history-preview.sql').read_text(encoding='utf-8').strip().rstrip(';')
    marker="'__AIO_OWNER_USER_ID__'"; n=sql.count(marker)
    if n<3: raise RuntimeError('Nieoczekiwany wzorzec audytu historycznego')
    history=db.query(sql.replace(marker,'?')+' LIMIT 501',(owner,)*n)
    warnings=[]
    if len(history)>500: warnings.append('Przekroczono 500 kandydatów V2; raport częściowy.')
    checks={}
    for name,(query,needed) in CHECKS.items():
        if not set(needed)<=tables:
            warnings.append('Brak źródła: '+name); continue
        args=(stamp,)*query.count('?')
        rows=db.query('SELECT * FROM ('+query+') LIMIT 501',args)
        if len(rows)>500: warnings.append('Przekroczono limit źródła: '+name)
        checks[name]=rows[:500]
    seen={r['case_key'] for r in db.scan('t.case_key','aio_security_intelligence_seen_v1 t')}
    report=analyse(profiles,ips,journal,archives,history[:500],checks,now,seen)
    report['target']=target
    if target=='production' and report['metrics']['archive_count']<32:
        warnings.append('Archiwum produkcji ma mniej niż 32 poprawne wpisy; sprawdź zachowaną historię.')
    if 'aio_vpn_guard_signups_v1' in tables:
        report['metrics']['vpn_denials_24h']=int(db.query("SELECT COUNT(*) AS n FROM aio_vpn_guard_signups_v1 WHERE decision='deny' AND datetime(created_at)>=datetime(?) AND datetime(created_at)<=datetime(?)",(iso(now-dt.timedelta(days=1)),stamp))[0]['n'])
    else: warnings.append('Brak źródła: decyzje VPN Guard')
    report['warnings']=sorted(set(report['warnings']+warnings))
    # Clear output and fail rather than silently dropping data. Old report remains visible as stale.
    payload=json.dumps(report,ensure_ascii=False,separators=(',',':'))
    if len(payload.encode())>750_000: raise RuntimeError('Raport za duzy')
    db.query("INSERT INTO aio_security_intelligence_report_v1(id,checked_at,payload) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET checked_at=excluded.checked_at,payload=excluded.payload WHERE excluded.checked_at>aio_security_intelligence_report_v1.checked_at",(stamp,payload))
    saved=db.query('SELECT checked_at FROM aio_security_intelligence_report_v1 WHERE id=1')
    if saved!=[{'checked_at':stamp}]: raise RuntimeError('Nie potwierdzono zapisu raportu')
    print('OK: zapisano raport '+target+'; liczba profili: '+str(report['metrics']['profiles'])+'; liczba spraw: '+str(report['metrics']['total_cases'])+'; ostrzezenia: '+str(len(report['warnings'])))

if __name__=='__main__':
    try:
        target=os.environ.get('AIO_AUDIT_TARGET',''); db=D1(target,os.environ.get('AIO_CF_ACCOUNT_ID',''),os.environ.get('AIO_D1_TOKEN',''))
        run(db,os.environ.get('AIO_OWNER_USER_ID',''),target)
    except Exception:
        # No sensitive SQL/rows/traceback in GitHub logs. Previous report stays available.
        print('BLAD audytu: sprawdz konfiguracje, schemat, token D1 oraz limity. Nie potwierdzono nowego raportu.',file=sys.stderr); sys.exit(1)
