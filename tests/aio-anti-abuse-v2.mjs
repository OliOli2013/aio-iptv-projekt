import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {exactSignupConflict} from '../functions/_aio_anti_abuse_v2.js';
const now=Date.parse('2026-11-26T16:30:00Z');
const date=(mins)=>new Date(now+mins*60000).toISOString();
const hash='XakE9BcjNC'+'a'.repeat(33),other=hash.slice(0,-1)+'b';
function fixture(){
 const raw=new DatabaseSync(':memory:');
 raw.exec(`CREATE TABLE community_profiles(id TEXT PRIMARY KEY,display_name TEXT,role TEXT,created_at TEXT,banned_until TEXT,ban_reason TEXT,banned_at TEXT,banned_by TEXT,updated_at TEXT);
 CREATE TABLE aio_security_journal(id TEXT PRIMARY KEY,event TEXT,user_id TEXT,ip_fingerprint TEXT,created_at TEXT,detail TEXT);
 CREATE TABLE community_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT);
 CREATE TABLE community_moderation_log(id TEXT PRIMARY KEY,actor_id TEXT,target_user_id TEXT,target_type TEXT,target_id TEXT,action TEXT,reason TEXT,ip_address TEXT,metadata TEXT,created_at TEXT);`);
 const p=(id,role='user',blocked=false,when=-100000)=>raw.prepare('INSERT INTO community_profiles(id,display_name,role,created_at,banned_until) VALUES(?,?,?,?,?)').run(id,id,role,date(when),blocked?'9999-12-31T23:59:59.000Z':null);
 let seq=0; const j=(id,event,when=-1,fp=hash,detail='')=>raw.prepare('INSERT INTO aio_security_journal VALUES(?,?,?,?,?,?)').run('j'+(++seq),event,id,fp,date(when),detail);
 const db={prepare(sql){return {bind(...args){return {first:async()=>raw.prepare(sql).get(...args)||null}}}}};
 return {raw,p,j,db};
}
const OWNER='00000000-0000-4000-8000-000000000001';
const previewTemplate=readFileSync(new URL('../scripts/aio-anti-abuse-v2-history-preview.sql',import.meta.url),'utf8');
const applyTemplate=readFileSync(new URL('../scripts/aio-anti-abuse-v2-history-apply.sql',import.meta.url),'utf8');
const preview=previewTemplate.replaceAll('__AIO_OWNER_USER_ID__',OWNER);
const apply=applyTemplate.replaceAll('__AIO_OWNER_USER_ID__',OWNER);

test('hard deny after failed login on blocked account, even with no similar name',async()=>{
 const {raw,p,j,db}=fixture();p('old','user',true);j('old','login_failed',-1);
 assert.equal((await exactSignupConflict(db,hash,'owner',now)).peer_user_id,'old');raw.close();
});
test('failed login alone on unblocked profile, older than 30 min, future event, or hash prefix do not deny',async()=>{
 const {raw,p,j,db}=fixture();p('old');p('blocked','user',true);j('old','login_failed',-1);j('blocked','login_failed',-31);j('blocked','login_failed',1);j('blocked','login_failed',-1,other);
 assert.equal(await exactSignupConflict(db,hash,'owner',now),null);await assert.rejects(exactSignupConflict(db,hash.slice(0,10),'owner',now));raw.close();
});
test('authenticated historical exact IP is hard conflict; owners are excluded',async()=>{
 const {raw,p,j,db}=fixture();p('owner','admin');p('configured-owner');p('old');j('owner','login_ok',-1);j('configured-owner','login_ok',-1);j('old','register_ok',-50000);
 assert.equal((await exactSignupConflict(db,hash,'configured-owner',now)).peer_user_id,'old');raw.close();
});
test('valid restricted login and quota denial qualify, unrelated denial does not',async()=>{
 const {raw,p,j,db}=fixture();p('old');j('old','download_denied',-2,hash,'E-mail niezweryfikowany');assert.equal(await exactSignupConflict(db,hash,'owner',now),null);j('old','download_denied',-1,hash,'Limit: plik');assert.equal((await exactSignupConflict(db,hash,'owner',now)).event,'download_denied');j('old','login_review_blocked',-.5);assert.equal((await exactSignupConflict(db,hash,'owner',now)).event,'login_review_blocked');raw.close();
});
test('historical preview and apply: only newer account, durable ban, audit, revoked sessions, no replay',()=>{
 const {raw,p,j}=fixture();p(OWNER,'admin');p('old','user',true);p('new','user',false,-3);p('admin','admin',false,-3);p('different','user',false,-3);p('already','user',true,-3);p('released','user',false,-3);
 j('old','login_failed',-2);j('new','register_ok',-1);j('admin','register_ok',-1);j('different','register_ok',-1,other);j('already','register_ok',-1);j('released','register_ok',-1);
 raw.prepare('INSERT INTO community_moderation_log(id,target_user_id,action,created_at) VALUES(?,?,?,?)').run('release','released','owner_unified_release_all_v1',date(0));
 for(const id of ['old','new','admin','different','already','released'])raw.prepare('INSERT INTO community_sessions VALUES(?,?)').run('session-'+id,id);
 assert.deepEqual(raw.prepare(preview).all().map(r=>r.user_id),['new']);
 raw.exec('BEGIN;');raw.exec(apply);raw.exec('COMMIT;');
 assert.equal(raw.prepare("SELECT banned_until FROM community_profiles WHERE id='new'").get().banned_until,'9999-12-31T23:59:59.000Z');
 assert.equal(raw.prepare("SELECT COUNT(*) n FROM community_sessions WHERE user_id='new'").get().n,0);
 assert.equal(raw.prepare("SELECT COUNT(*) n FROM community_sessions WHERE user_id='old'").get().n,1);
 assert.equal(raw.prepare("SELECT COUNT(*) n FROM community_moderation_log WHERE action='aio_anti_abuse_v2_historical_ban'").get().n,1);
 assert.equal(raw.prepare("SELECT banned_until FROM community_profiles WHERE id='admin'").get().banned_until,null);
 raw.exec("UPDATE community_profiles SET banned_until=NULL,ban_reason=NULL WHERE id='new'; INSERT INTO community_sessions VALUES('new-after-release','new');");
 raw.exec('BEGIN;');raw.exec(apply);raw.exec('COMMIT;');
 assert.equal(raw.prepare("SELECT banned_until FROM community_profiles WHERE id='new'").get().banned_until,null);
 assert.equal(raw.prepare("SELECT COUNT(*) n FROM community_sessions WHERE user_id='new'").get().n,1);raw.close();
});

test('V2 historical protection excludes configured owner regardless of role',()=>{
 const {raw,p,j}=fixture();
 p('old','user',true,-20);
 p(OWNER,'user',false,-10);
 p('new','user',false,-3);
 j('old','login_ok',-9);
 j(OWNER,'register_ok',-8);
 j(OWNER,'login_ok',-2,other);
 j('new','register_ok',-1,other);
 assert.equal(raw.prepare(preview).all().length,0);
 raw.exec(apply);
 assert.equal(raw.prepare(
   'SELECT COUNT(*) n FROM community_profiles WHERE id=? AND banned_until IS NOT NULL'
 ).get(OWNER).n,0);
 assert.equal(raw.prepare(
   'SELECT COUNT(*) n FROM community_moderation_log'
 ).get().n,0);
 raw.close();
});

test('V2 unresolved owner parameter prevents historical bans',()=>{
 const {raw,p,j}=fixture();
 p(OWNER,'admin');
 p('old','user',true,-20);
 p('new','user',false,-3);
 j('old','login_failed',-2);
 j('new','register_ok',-1);
 assert.equal(raw.prepare(preview).all().length,1);
 assert.equal(raw.prepare(previewTemplate).all().length,0);
 raw.exec(applyTemplate);
 assert.equal(raw.prepare(
   "SELECT banned_until FROM community_profiles WHERE id='new'"
 ).get().banned_until,null);
 raw.close();
});
