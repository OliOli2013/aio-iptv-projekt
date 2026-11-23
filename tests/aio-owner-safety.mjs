// Node 24, real in-memory SQLite, synthetic users; zero outbound calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {consumeWindowLimit} from '../functions/_aio_auth_window.js';
import {asOf,scanPage,reviewSignal,quotaSnapshot} from '../functions/_aio_owner_signals.js';
import {checkVpnAtLogin,checkVpnAtRegistration,vpnReply,budgetCeiling,classifyVpnResponse,VPN_COUNT_SQL} from '../functions/_aio_vpn_guard_v1.js';
import {classifyPostLink} from '../functions/_aio_post_links_v5.js';
import {isOfficialAioPanelIpkUrl} from '../functions/_aio_panel_public_v1.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const schema=read('scripts/migrations/2026-11-22-owner-safety.sql');
const owner='00000000-0000-4000-8000-000000000000',uid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
function fixture(){
  const raw=new DatabaseSync(':memory:');raw.exec(`CREATE TABLE community_profiles(id TEXT PRIMARY KEY,display_name TEXT,role TEXT,created_at TEXT,banned_until TEXT,ban_reason TEXT,banned_by TEXT,banned_at TEXT,updated_at TEXT);
  CREATE TABLE community_auth(user_id TEXT,email TEXT);
  CREATE TABLE aio_security_journal(id TEXT PRIMARY KEY,user_id TEXT,event TEXT,created_at TEXT,detail TEXT);
  CREATE TABLE community_login_attempts(key TEXT PRIMARY KEY,attempts INTEGER,first_at TEXT,last_at TEXT,blocked_until TEXT);
  CREATE TABLE community_sessions(user_id TEXT);CREATE TABLE community_moderation_log(id TEXT,actor_id TEXT,target_user_id TEXT,target_type TEXT,target_id TEXT,action TEXT,reason TEXT,ip_address TEXT,metadata TEXT,created_at TEXT);`);raw.exec(schema);raw.exec(schema);
  const db={prepare(sql){const q=raw.prepare(sql);let args=[];return {
    bind(...v){args=/\?\d/.test(sql)?[Object.fromEntries(v.map((v,i)=>['?'+(i+1),v]))]:v;return this;},
    first(){return q.get(...args)||null;},all(){return {results:q.all(...args)};},run(){return {meta:{changes:q.run(...args).changes}};}
  };},batch(qs){raw.exec('BEGIN');try{const out=qs.map(q=>q.all());raw.exec('COMMIT');return out;}catch(e){raw.exec('ROLLBACK');throw e;}}};
  const profile=(i,role='user',at='2020-01-01T00:00:00.000Z')=>raw.prepare('INSERT INTO community_profiles(id,display_name,role,created_at) VALUES(?,?,?,?)').run(i,'Test',role,at);
  const event=(i,e,at,detail='')=>raw.prepare('INSERT INTO aio_security_journal VALUES(?,?,?,?,?)').run(crypto.randomUUID(),i,e,at,detail);
  return {raw,db,env:{COMMUNITY_DB:db},profile,event};
}
test('atomowy limit: N prób, stały koniec kary, nowy cykl',async()=>{
  const {raw,env}=fixture(),run=()=>consumeWindowLimit(env,'fixture',3,60000);
  for(let i=0;i<3;i++)await run();await assert.rejects(run(),e=>e.status===429);
  const snap=()=>raw.prepare('SELECT * FROM community_login_attempts').get(),b=snap();
  await assert.rejects(run(),e=>e.status===429);assert.deepEqual(snap(),b);
  raw.exec("UPDATE community_login_attempts SET blocked_until='2000',first_at='2000'");await run();assert.equal(snap().attempts,1);
});
test('VPN: nieznany wynik nie jest VPN; tryby, rezerwy i rotacja liczników',async()=>{
  const {raw,env}=fixture(),req=new Request('https://fixture.invalid'),e={...env,AIO_VPN_GUARD_MODE:'enforce'};
  assert.equal(vpnReply(await checkVpnAtLogin(e,req),'login').status,503);
  assert.equal(vpnReply(await checkVpnAtRegistration(e,req),'register').body.code,'AIO_NETWORK_RETRY');
  assert.equal(vpnReply(await checkVpnAtLogin({...e,AIO_VPN_LOGIN_MODE:'monitor'},req),'login'),null);
  assert.equal(vpnReply({deny:true},'login').body.code,'AIO_VPN_CONNECTION');
  assert.equal(classifyVpnResponse({is_vpn:'false',is_proxy:false,is_tor:false}).kind,'unknown');
  assert.equal(raw.prepare('SELECT SUM(n) n FROM aio_vpn_auth_counts_v2').get().n,3);
  assert.deepEqual(['scan','login','register'].map(p=>budgetCeiling(900,p)),[450,720,900]);
  const stmt=raw.prepare(VPN_COUNT_SQL);for(const d of ['2026-09-01','2026-10-02'])stmt.run(0,d,'login','allowed','cache');
  assert.equal(raw.prepare("SELECT n FROM aio_vpn_auth_counts_v2 WHERE slot=0 AND reason='cache'").get().n,1);
});
test('skan stronicowany bez zapisu, decyzja z notatką, konflikt i ponowne otwarcie sprawy',async()=>{
  const {db,raw,profile,event}=fixture(),now=Date.now(),end=new Date(now).toISOString(),t=new Date(now-3000).toISOString();
  for(let i=1;i<=32;i++)profile(uid(i));profile(owner,'admin');profile(uid(98),'user',new Date(now+1000).toISOString());
  for(let i=0;i<5;i++)event(uid(32),'login_failed',t);
  for(let i=0;i<3;i++)event(uid(2),'download_denied',t,'Limit pobierania');
  for(let i=0;i<8;i++)event(uid(1),'download_denied',t,'E-mail niezweryfikowany');
  const changes=()=>raw.prepare('SELECT total_changes() n').get().n,n=changes();
  const a=await scanPage(db,{at:end},now),b=await scanPage(db,{after:a.next,at:a.at},now);
  assert.equal(a.checked,30);assert.equal(b.checked,2);assert.equal(b.next,null);
  assert.deepEqual([...a.findings,...b.findings].map(r=>r.id),[uid(2),uid(32)]);assert.equal(changes(),n);
  assert.throws(()=>asOf(new Date(now-3600000).toISOString(),now));
  const body={...a.findings[0],decision:'dismiss',note:'Test oceny ręcznej'};
  assert.ok((await reviewSignal(db,owner,body)).seq);
  await assert.rejects(reviewSignal(db,owner,body),e=>e.status===409);
  assert.equal((await scanPage(db,{at:end},now)).findings[0].state,'dismiss');
  event(uid(2),'download_denied',t,'Limit: link do pliku w poście');
  assert.equal((await scanPage(db,{at:end},now)).findings[0].state,'pending');
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM community_profiles WHERE banned_until IS NOT NULL').get().n,0);
});
test('stary DEB: rozlicza tylko trasa plików; stary IPK: bramka publiczna',()=>{
  const base='https://fixture.invalid',p='/assets/releases/enigma2-plugin-extensions-panelaio_18.2.1_all.';
  const d=classifyPostLink(base+p+'deb',base);assert.equal(d.kind,'local');assert.equal(new URL(d.url).pathname,'/pliki/enigma2-plugin-extensions-panelaio_18.2.1_all.deb');
  assert.equal(isOfficialAioPanelIpkUrl(base+p+'ipk',base),true);assert.equal(isOfficialAioPanelIpkUrl(base+p+'deb',base),false);
});
test('podgląd limitu nie zmienia bazy; odróżnia brak danych, grupę, 7D i VIP',async()=>{
  const {raw,db,profile}=fixture(),id=uid(12),now=Date.now();profile(id);
  const cold=await quotaSnapshot(db,id,now);assert.equal(cold.known,false);assert.equal(cold.vip.known,false);
  raw.exec("CREATE TABLE aio_multikonta_quota_groups_v2(group_id TEXT,used INTEGER,resets_ms INTEGER);CREATE TABLE aio_multikonta_quota_members_v2(user_id TEXT,group_id TEXT);CREATE TABLE aio_access_monthly_cycles(user_id TEXT,used INTEGER,resets_ms INTEGER);CREATE TABLE aio_vip_grants(user_id TEXT,status TEXT,expires_at TEXT);CREATE TABLE aio_access_account_grants(user_id TEXT,source TEXT,expires_at TEXT)");
  raw.prepare('INSERT INTO aio_access_monthly_cycles VALUES(?,?,?)').run(id,1,0);
  raw.prepare('INSERT INTO aio_vip_grants VALUES(?,?,?)').run(id,'active',new Date(now+600000).toISOString());
  assert.equal((await quotaSnapshot(db,id,now)).remaining,2);
  raw.prepare('INSERT INTO aio_multikonta_quota_groups_v2 VALUES(?,?,?)').run('fixture',3,now+60000);
  raw.prepare('INSERT INTO aio_multikonta_quota_members_v2 VALUES(?,?)').run(id,'fixture');
  const changes=raw.prepare('SELECT total_changes() n').get().n,v=await quotaSnapshot(db,id,now);
  assert.equal(v.remaining,0);assert.ok(v.shared&&v.vip.until);assert.deepEqual(v.seven,{known:true,until:null});
  assert.equal((await quotaSnapshot(db,id,now+61000)).remaining,3);assert.equal(raw.prepare('SELECT total_changes() n').get().n,changes);
});
// Isolate the session-provider dependency of the route under test; no actual sessions used.
const adapter='data:text/javascript,'+encodeURIComponent(`export async function requireAdmin(_r,e){if(e.fixtureRole!=='owner')throw Object.assign(new Error('Odmowa'),{status:e.fixtureRole?403:401});return {user:{id:'${owner}'}}}export const clientIp=()=>null;export const moderationLog=()=>{};`);
registerHooks({resolve(spec,ctx,next){if(spec.endsWith('_community.js')&&/\/(?:owner-safety|owner-security-actions)\.js$/.test(ctx.parentURL||''))return {url:adapter,shortCircuit:true};return next(spec,ctx);}});
const desk=await import('../functions/api/owner-safety.js'),page=await import('../functions/owner-safety.js'),actions=await import('../functions/api/owner-security-actions.js');
const req=(body,origin='https://fixture.invalid')=>new Request('https://fixture.invalid/api/owner-safety',body?{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
test('strona i API: tylko właściciel, bez cache; obce źródło nie zapisuje danych',async()=>{
  for(const fixtureRole of [null,'user'])for(const h of [page,desk]){const r=await h.onRequestGet({request:req(),env:{fixtureRole}});assert.equal(r.status,fixtureRole?403:401);assert.match(r.headers.get('cache-control'),/no-store/);}
  const {env}=fixture();env.fixtureRole='owner';
  const p=await page.onRequestGet({request:req(),env});assert.equal(p.status,200);assert.match(await p.text(),/Skan istniejących kont/);assert.match(p.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal((await desk.onRequestPost({request:req({action:'find',query:'Test'},'https://other.invalid'),env})).status,403);
  const m=await (await desk.onRequestGet({request:req(),env})).json();assert.equal(m.ok,true);assert.equal(m.used,null);assert.deepEqual(m.counts,[]);
});
test('ręczna blokada: potwierdzenie, ochrona administratora, atomowość sesji i audytu, cofnięcie',async()=>{
  const {raw,env,profile}=fixture();env.fixtureRole='owner';profile(owner,'admin');profile(uid(4));const id=uid(4);
  raw.prepare('INSERT INTO community_sessions VALUES(?)').run(id);
  const post=(over={})=>actions.onRequestPost({env,request:req({action:'block_account',user_id:id,reason:'Test świadomej decyzji',confirm:true,expected_ban:null,...over})});
  assert.equal((await post({confirm:false})).status,400);assert.equal((await post({user_id:owner})).status,403);
  raw.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON community_moderation_log BEGIN SELECT RAISE(ABORT,'fixture'); END;");
  assert.equal((await post()).status,500);assert.equal(raw.prepare('SELECT COUNT(*) n FROM community_sessions').get().n,1);assert.equal(raw.prepare('SELECT banned_until FROM community_profiles WHERE id=?').get(id).banned_until,null);
  raw.exec('DROP TRIGGER fail_audit');assert.equal((await post()).status,200);assert.equal(raw.prepare('SELECT COUNT(*) n FROM community_sessions').get().n,0);
  assert.equal(raw.prepare('SELECT COUNT(*) n FROM community_moderation_log').get().n,1);assert.equal((await post()).status,409);
  const prior=raw.prepare('SELECT banned_until FROM community_profiles WHERE id=?').get(id).banned_until;
  assert.equal((await post({action:'unblock_account',expected_ban:prior})).status,200);
  assert.equal(raw.prepare('SELECT banned_until FROM community_profiles WHERE id=?').get(id).banned_until,null);
});
test('publiczna rejestracja zawsze zwykła; obie ścieżki logowania sprawdzają VPN przed sesją',()=>{
  const p=read('functions/api/community-auth.js'),s=read('functions/_aio_social_v1.js');
  assert.match(p,/\.bind\(id,email,displayName,"user",0,/);assert.ok(!p.includes(' : firstAccount'));
  assert.ok(p.indexOf('if (!safeEqual(calc.hash')<p.indexOf('await checkVpnAtLogin'));assert.ok(p.indexOf('await checkVpnAtLogin')<p.lastIndexOf('INSERT INTO community_sessions'));
  assert.match(s,/const network=await checkVpnAtLogin/);assert.match(s,/const networkWarning=await blockLoginByPolicy[\s\S]*?INSERT INTO community_sessions/);
});
