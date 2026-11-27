#!/usr/bin/env python3
import datetime as dt, importlib.util, json, sqlite3, sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('audit',ROOT/'scripts/aio_security_intelligence.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
NOW=dt.datetime.now(dt.timezone.utc)
PAST=m.iso(NOW-dt.timedelta(days=2)); RECENT=m.iso(NOW-dt.timedelta(hours=1)); FUTURE=m.iso(NOW+dt.timedelta(days=2)); OLD=m.iso(NOW-dt.timedelta(days=9))
OWNER='00000000-0000-4000-8000-000000000001'; A='00000000-0000-4000-8000-000000000002'; B='00000000-0000-4000-8000-000000000003'; C='00000000-0000-4000-8000-000000000004'; D='00000000-0000-4000-8000-000000000005'; E='00000000-0000-4000-8000-000000000006'
def p(uid,name='Test',ban=None,role='user',created=RECENT,**extra):return dict(id=uid,display_name=name,banned_until=ban,role=role,created_at=created,**extra)
def j(uid,ip,event='login_ok',at=RECENT):return dict(user_id=uid,event=event,ip_fingerprint=m.fingerprint(ip),created_at=at,detail='')
def archive(name,hashes=()):return dict(target_id='deleted',created_at=PAST,metadata=json.dumps(dict(display_name=name,email_sha256=list(hashes))))
def audit(ps,ips=(),js=(),ars=(),hist=(),checks=None):return m.analyse(ps,ips,js,ars,hist,checks or {},NOW)
class Test(unittest.TestCase):
 def test_cross_source_full_hash(self):
  r=audit([p(A),p(B,ban=FUTURE),p(OWNER,role='admin')],[dict(user_id=A,ip_address='192.0.2.1')],[j(B,'192.0.2.1')]);self.assertEqual(len(r['cases']),1);self.assertEqual(r['cases'][0]['kind'],'network');self.assertNotIn('192.0.2.1',json.dumps(r));self.assertEqual(r['metrics']['without_authenticated_network'],0)
 def test_ipv6_and_dedup(self):
  ps=[p(A),p(B)];ips=[dict(user_id=A,ip_address='2001:db8:0:1::1'),dict(user_id=B,ip_address='2001:db8:0:1::2')];r=audit(ps,ips);self.assertEqual(len(r['cases']),1);self.assertIn('IPv6 /64',r['cases'][0]['detail']);r2=audit(ps,[*ips,dict(user_id=B,ip_address='2001:db8:0:1::1')]);self.assertNotEqual(r['cases'][0]['key'],r2['cases'][0]['key'])
 def test_failed_login_not_network_claim(self):
  r=audit([p(A),p(B)],[dict(user_id=A,ip_address='192.0.2.1')],[j(B,'192.0.2.1','login_failed')]);self.assertEqual(r['cases'],[]);self.assertEqual(r['metrics']['weak_failed_login_groups'],1)
 def test_all_banned_and_owner_excluded(self):
  r=audit([p(A,ban=FUTURE),p(B,ban=FUTURE),p(OWNER,role='admin')],[],[j(A,'192.0.2.1'),j(B,'192.0.2.1'),j(OWNER,'192.0.2.1')]);self.assertEqual(r['cases'],[])
 def test_archive_time_name_and_hash(self):
  h=m.emhash('test@example.invalid');r=audit([p(A,'MAMME',auth_email='test@example.invalid'),p(B,'mamme',created=OLD),p(C,'mamme',ban=FUTURE)],ars=[archive('mamme',[h])]);self.assertEqual({x['kind'] for x in r['cases']},{'archive_name','archive_email'});self.assertNotIn('test@example.invalid',json.dumps(r));self.assertEqual(r['metrics']['archive_with_email_hash'],1)
 def test_missing_hash_and_corrupt_archive(self):
  r=audit([p(A,'Test')],ars=[archive('Test'),dict(target_id='bad',metadata='{',created_at=PAST)]);self.assertEqual(r['metrics']['archive_with_email_hash'],0);self.assertEqual(len(r['warnings']),1);self.assertEqual(r['cases'][0]['kind'],'archive_name')
 def test_existing_holds_and_integrity(self):
  r=audit([p(A,ban=FUTURE),p(B)],checks={'banned_session':[dict(user_id=A,n=1,at=RECENT)],'paid_hold':[dict(user_id=B,at=RECENT)],'orphan_claim':[dict(user_id=D,source='Strict V4')]});self.assertEqual({x['kind'] for x in r['cases']},{'banned_session','paid_hold','orphan_claim'})
 def test_case_key_stable_and_changed_network_reopens(self):
  ps=[p(A),p(B)];js=[j(A,'192.0.2.1'),j(B,'192.0.2.1')];key=audit(ps,js=js)['cases'][0]['key'];self.assertEqual(key,audit(ps,js=js[::-1])['cases'][0]['key']);self.assertNotEqual(key,audit(ps,js=js+[j(A,'192.0.2.2'),j(B,'192.0.2.2')])['cases'][0]['key'])
 def test_v2_candidate_preserved(self):
  r=audit([p(A),p(B,ban=FUTURE)],hist=[dict(user_id=A,peer_id=B,event='login_failed',evidence_at=PAST,registration_at=RECENT,seconds_before=50)]);self.assertEqual(r['cases'][0]['kind'],'history_v2')
 def test_sql_integration_and_snapshot(self):
  class Local:
   scan=m.D1.scan
   def __init__(self):self.c=sqlite3.connect(':memory:');self.c.row_factory=sqlite3.Row
   def query(self,s,params=()):return [dict(x) for x in self.c.execute(s,params).fetchall()]
  db=Local();db.c.executescript('''CREATE TABLE community_profiles(id TEXT PRIMARY KEY,role TEXT,display_name TEXT,created_at TEXT,banned_until TEXT,email TEXT);
CREATE TABLE community_auth(user_id TEXT PRIMARY KEY,email TEXT); CREATE TABLE community_user_ips(user_id TEXT,ip_address TEXT);
CREATE TABLE aio_security_journal(id TEXT PRIMARY KEY,user_id TEXT,ip_fingerprint TEXT,event TEXT,created_at TEXT,detail TEXT);
CREATE TABLE community_moderation_log(id TEXT,target_user_id TEXT,target_id TEXT,action TEXT,created_at TEXT,metadata TEXT);
CREATE TABLE community_sessions(user_id TEXT,created_at TEXT,expires_at TEXT);
CREATE TABLE aio_security_paid_holds(user_id TEXT,status TEXT,created_at TEXT,expires_at TEXT);
CREATE TABLE aio_multikonta_reviews_v2(user_id TEXT,peer_user_id TEXT,status TEXT,created_at TEXT);
CREATE TABLE aio_strict_ip_holds_v4(user_id TEXT,primary_user_id TEXT,status TEXT,created_at TEXT);
CREATE TABLE aio_vpn_guard_reviews_v1(user_id TEXT,verdict TEXT,checked_at TEXT,reviewed_at TEXT);
CREATE TABLE aio_access_monthly_cycles(user_id TEXT,updated_at TEXT,used INT,third_ms INT,resets_ms INT);
CREATE TABLE aio_strict_ip_claims_v4(user_id TEXT); CREATE TABLE aio_ip_policy_claims(user_id TEXT);
CREATE TABLE aio_vpn_guard_signups_v1(decision TEXT,created_at TEXT);''')
  db.c.executescript((ROOT/'scripts/aio-security-intelligence-v1.sql').read_text())
  db.c.executemany('INSERT INTO community_profiles VALUES (?,?,?,?,?,?)',[(OWNER,'admin','Owner',OLD,None,None),(A,'user','Nowy',RECENT,None,None),(B,'user','Stary',OLD,FUTURE,None)])
  db.c.executemany('INSERT INTO aio_security_journal VALUES (?,?,?,?,?,?)',[('a',A,m.fingerprint('192.0.2.1'),'register_ok',RECENT,''),('b',B,m.fingerprint('192.0.2.1'),'login_ok',PAST,'')])
  db.c.execute('INSERT INTO community_user_ips VALUES (?,?)',(A,'192.0.2.1'))
  db.c.execute('INSERT INTO community_moderation_log VALUES (?,?,?,?,?,?)',('old',None,'deleted','owner_archive_no_ip_v1',PAST,archive('Nowy')['metadata']))
  db.c.execute('INSERT INTO aio_vpn_guard_signups_v1 VALUES (?,?)',('deny',RECENT))
  before=db.query('SELECT * FROM community_profiles ORDER BY id');m.run(db,OWNER,'preview');r=json.loads(db.query('SELECT payload FROM aio_security_intelligence_report_v1')[0]['payload']);self.assertEqual(r['metrics']['profiles'],3);self.assertEqual(r['metrics']['vpn_denials_24h'],1);self.assertEqual({x['kind'] for x in r['cases']},{'network','history_v2','archive_name'});self.assertEqual(before,db.query('SELECT * FROM community_profiles ORDER BY id'));self.assertEqual(r['warnings'],[])
  with self.assertRaises(RuntimeError):m.run(db,A,'preview')
 def test_blocked_strict_hold(self):
  r=audit([p(A,ban=FUTURE),p(OWNER,role='admin')],checks={'strict_hold':[dict(user_id=A,at=RECENT),dict(user_id=OWNER,at=RECENT)]})
  self.assertEqual(len(r['cases']),1)
  self.assertEqual(r['cases'][0]['kind'],'strict_hold')
 def test_unreviewed_first(self):
  ps=[p(A),p(B)]
  checks={'paid_hold':[dict(user_id=A,at=RECENT),dict(user_id=B,at=RECENT)]}
  r=audit(ps,checks=checks)
  key=r['cases'][0]['key']
  result=m.analyse(ps,[],[],[],[],checks,NOW,{key})
  self.assertEqual(result['cases'][-1]['key'],key)
 def test_pagination(self):
  class Local:
   scan=m.D1.scan
   def __init__(self):self.c=sqlite3.connect(':memory:');self.c.row_factory=sqlite3.Row;self.c.execute('CREATE TABLE t(v TEXT)');self.c.executemany('INSERT INTO t VALUES (?)',[(str(i),) for i in range(1201)])
   def query(self,s,params=()):return [dict(x) for x in self.c.execute(s,params).fetchall()]
  rows=Local().scan('t.v','t t');self.assertEqual(len(rows),1201);self.assertEqual(len({x['_r'] for x in rows}),1201)
if __name__=='__main__':unittest.main(verbosity=2)
