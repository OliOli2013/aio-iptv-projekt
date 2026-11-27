import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
const mock='data:text/javascript,'+encodeURIComponent(`
 export const sha256=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
 export const json=(o,s=200,h={})=>Response.json(o,{status:s,headers:h});
 export const requireAdmin=async(r,e)=>{if(!e.owner)throw Object.assign(Error('forbidden'),{status:403});return {user:{id:'owner',role:'admin'}};};
 export const getOwnerId=async()=> 'owner';
 export const initAccess=async()=>{},sessionUser=async(r,e)=>e.user,getStatus=async e=>e.state;
 export const coreAdmitDownload=async(e,r,u,s)=>({allowed:e.allowed&& (s.active||s.free_remaining>0),reason:e.allowed?'limit':'restricted'});
 export const consumeFree=async e=>{if(!e.allowed||!e.state.active&&e.state.free_remaining<=0)return {allowed:false,reason:'limit'};if(e.state.active)return {allowed:true,reason:'vip'};e.charged++;e.state.free_remaining--;return {allowed:true,reason:'free'};};
 export const reviewPaidSessionSharing=async()=>null,logSecurity=async()=>{},monitorDownload=async()=>({blocked:false});
`);
registerHooks({resolve(s,c,next){if(c.parentURL?.includes('/functions/api/')&&['../_community.js','../_aio_account_access.js','../_aio_security_core_v1.js','../_aio_security_journal.js','../_aio_security_v6.js'].includes(s))return {url:mock,shortCircuit:true};return next(s,c);}});
const helper=await import('../functions/_aio_external_speed_v1.js');
const {onRequestGet,onRequestHead}=await import('../functions/api/aio-external-download.js');
const {onRequestPost:owner}=await import('../functions/api/owner-external-speed-map.js');
const {claimSpeedLease}=await import('../functions/_aio_download_speed_v1.js');
const ORIGIN='https://fixture.invalid',GOOD='https://github.com/example/repo/releases/download/v1/test.zip',BAD='https://example.org/downloads/test.zip',COMMENT='comment-12345',POST='post-1234567';
const sql=p=>readFileSync(new URL('../supabase/'+p,import.meta.url),'utf8');
function fixture(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON;CREATE TABLE community_profiles(id TEXT PRIMARY KEY);INSERT INTO community_profiles VALUES(\'free\'),(\'other\'),(\'owner\');CREATE TABLE aio_multikonta_quota_members_v2(user_id TEXT PRIMARY KEY,group_id TEXT NOT NULL);');
 db.exec(sql('aio-download-speed-v1.sql'));db.exec(sql('aio-individual-speed-v1.sql'));db.exec(sql('aio-external-post-speed-v1.sql'));db.exec(sql('aio-external-post-speed-v1.sql'));
 db.exec("UPDATE aio_download_speed_config_v1 SET enabled=1;UPDATE aio_external_speed_policy_v1 SET enabled=1;CREATE TABLE community_posts(id TEXT PRIMARY KEY,content TEXT,status TEXT,created_at TEXT);CREATE TABLE community_comments(id TEXT PRIMARY KEY,post_id TEXT,content TEXT,status TEXT,created_at TEXT);CREATE TABLE community_chat_messages(id TEXT PRIMARY KEY,content TEXT,status TEXT);CREATE TABLE aio_post_link_handoffs(id TEXT PRIMARY KEY,user_id TEXT,post_id TEXT,host TEXT,file_name TEXT,reason TEXT,created_at TEXT,kind TEXT);CREATE TABLE community_moderation_log(id TEXT PRIMARY KEY,actor_id TEXT,target_user_id TEXT,target_type TEXT,target_id TEXT,action TEXT,reason TEXT,ip_address TEXT,metadata TEXT,created_at TEXT);CREATE TABLE aio_link_events_v1(id TEXT,user_id TEXT,source TEXT,source_id TEXT,event TEXT,host TEXT,file_name TEXT,reason TEXT,created_at TEXT);");
 db.prepare('INSERT INTO community_posts VALUES(?,?,?,?)').run(POST,GOOD+'\n'+BAD,'published','2026-11-27');db.prepare('INSERT INTO community_comments VALUES(?,?,?,?,?)').run(COMMENT,POST,GOOD,'published','2026-11-27');db.prepare('INSERT INTO community_chat_messages VALUES(?,?,?)').run('chat-123',GOOD,'published');
 const env={owner:false,user:{id:'free',role:'user'},state:{active:false,authenticated:true,email_verified:true,free_remaining:3},allowed:true,charged:0,AIO_DOWNLOAD_STORAGE_MODE:'r2',AIO_PRIVATE_FILES:{head:async k=>k==='pliki/test.zip'?{size:5}:null},COMMUNITY_DB:{prepare(q){const stmt=db.prepare(q);const w=(p=[])=>({bind(...p){return w(p)},async first(){return stmt.get(...p)||null},async all(){return {results:stmt.all(...p)}},async run(){return {success:true,meta:{changes:Number(stmt.run(...p).changes)}}}});return w()},async batch(stmts){db.exec('BEGIN');try{let rs=[];for(const stmt of stmts)rs.push(await stmt.run());db.exec('COMMIT');return rs;}catch(e){db.exec('ROLLBACK');throw e;}}}};
 return {db,env};}
const prepare=(env,href=GOOD,extra={})=>helper.prepareExternal(env,env.user,env.state,{source:'post',sourceId:POST,href,...extra});
const token=r=>new URL(r.data.href,ORIGIN).searchParams.get('t');
const get=(env,t,headers={})=>onRequestGet({env,request:new Request(ORIGIN+'/api/aio-external-download?t='+t,{headers})});
const callOwner=(env,body,origin=ORIGIN)=>owner({env,request:new Request(ORIGIN+'/api/owner-external-speed-map',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)})});
const bytes=(s='abcde')=>new Response(s,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="test.zip"','Content-Length':String(s.length),'Set-Cookie':'should-not-leak=1'}});
test('safe provider selection; no arbitrary host, userinfo, HTTP, nonstandard port, fake suffix or arbitrary page',()=>{
 for(const x of ['http://github.com/x/y/releases/download/v1/a.zip','https://github.com.evil.test/x/y/releases/download/v1/a.zip','https://github.com@127.0.0.1/a.zip','https://github.com:444/x/y/releases/download/v1/a.zip','https://github.com/example/repo','https://127.0.0.1/a.zip','https://169.254.169.254/a.zip','https://evil-mediafire.com/a.zip',BAD])assert.equal(helper.directSource(x),null,x);
 assert.equal(helper.directSource(GOOD).provider,'github');assert.equal(helper.directSource('https://pixeldrain.com/u/abcd1234').url,'https://pixeldrain.com/api/file/abcd1234?download');assert.match(helper.directSource('https://www.dropbox.com/s/abcdefghi/test.zip?dl=0').url,/dl=1/);
});
test('manual redirect: allowed GitHub asset, forbidden redirect never fetched, no cookies leaked',async()=>{
 let calls=[];const a=await helper.fetchExternalFile(GOOD,async(u,o)=>{calls.push(u);assert.equal(o.redirect,'manual');assert.equal(o.headers.Cookie,undefined);return calls.length===1?new Response(null,{status:302,headers:{Location:'https://release-assets.githubusercontent.com/github-production-release-asset-2e65be/abc?sig=test'}}):bytes();});
 assert.equal(await a.text(),'abcde');assert.equal(a.headers.get('Set-Cookie'),null);assert.equal(a.headers.get('Content-Type'),'application/octet-stream');assert.equal(calls.length,2);
 calls=[];await assert.rejects(helper.fetchExternalFile(GOOD,async u=>{calls.push(u);return new Response(null,{status:302,headers:{Location:'http://169.254.169.254/file'}});}),/Unsafe redirect/);assert.equal(calls.length,1);
});
test('HTML, missing length, oversize, non-200, truncated body rejected',async()=>{
 for(const r of [new Response('<html>',{headers:{'Content-Type':'text/html','Content-Length':'6'}}),new Response('x',{headers:{'Content-Type':'application/octet-stream'}}),new Response('x',{headers:{'Content-Type':'application/octet-stream','Content-Length':'2147483649'}}),new Response('x',{status:404})])await assert.rejects(helper.fetchExternalFile(GOOD,async()=>r));
 const r=await helper.fetchExternalFile(GOOD,async()=>new Response('x',{headers:{'Content-Type':'application/octet-stream','Content-Length':'2'}}));await assert.rejects(r.text());
});
test('policy disabled preserves legacy; enabled blocks unsupported FREE without debit; paid gets ticket; no quota means no ticket',async()=>{
 const {env,db}=fixture();db.exec('UPDATE aio_external_speed_policy_v1 SET enabled=0');assert.equal(await prepare(env),null);db.exec('UPDATE aio_external_speed_policy_v1 SET enabled=1');
 let r=await prepare(env,BAD);assert.equal(r.status,409);assert.equal(r.data.external_unavailable,true);assert.equal(env.charged,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM aio_external_speed_tickets_v1').get().n,0);
 env.state.free_remaining=0;assert.equal((await prepare(env)).status,429);env.state.active=true;r=await prepare(env,BAD);assert.equal(r.data.kind,'managed_external');assert.ok(token(r));assert.equal(env.charged,0);db.close();
});
test('tickets bound to user, expiration, atomic single use and no debit when preflight cancelled',async()=>{
 const {env,db}=fixture();const r=await prepare(env);assert.equal(r.data.kind,'managed_external');assert.equal(env.charged,0);const t=token(r);assert.equal(await helper.readTicket(env,t,'other'),null);assert.equal(await helper.readTicket(env,t,'free',Date.now()+700000),null);
 const res=await Promise.all([helper.takeTicket(env,t,'free'),helper.takeTicket(env,t,'free')]);assert.equal(res.filter(Boolean).length,1);assert.equal(env.charged,0);db.close();
});
test('real proxy route streams at FREE limit, one debit, no replay, lease released',async()=>{
 const {env,db}=fixture();const old=globalThis.fetch;globalThis.fetch=async()=>bytes();try{const t=token(await prepare(env));const r=await get(env,t);assert.equal(r.status,200);assert.equal(r.headers.get('X-AIO-Download-Limit-KBps'),'25');assert.equal(env.charged,1);assert.equal((await get(env,t)).status,410);assert.equal(await r.text(),'abcde');assert.equal(db.prepare('SELECT COUNT(*) n FROM aio_download_speed_leases_v1').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM aio_post_link_handoffs').get().n,1);}finally{globalThis.fetch=old;db.close();}
});
test('bad upstream, deleted post, wrong user, blocked state, HEAD or Range never debits',async()=>{
 const {env,db}=fixture();const old=globalThis.fetch;globalThis.fetch=async()=>new Response('missing',{status:404});try{let t=token(await prepare(env));assert.equal((await get(env,t)).status,502);assert.equal(env.charged,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM aio_download_speed_leases_v1').get().n,0);
 t=token(await prepare(env));assert.equal(onRequestHead().status,405);assert.equal((await get(env,t,{Range:'bytes=0-4'})).status,416);env.user={id:'other'};assert.equal((await get(env,t)).status,410);env.user={id:'free'};env.allowed=false;assert.equal((await get(env,t)).status,403);env.allowed=true;db.exec("UPDATE community_posts SET status='hidden'");assert.equal((await get(env,t)).status,403);assert.equal(env.charged,0);}finally{globalThis.fetch=old;db.close();}
});
test('shared lease blocks second proxy before fetch/debit; individual speed and unlimited use existing limiter',async()=>{
 const {env,db}=fixture();const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return bytes();};try{
 db.exec("INSERT INTO aio_multikonta_quota_members_v2 VALUES('free','g'),('other','g')");const lease=await claimSpeedLease(env,'other');const t=token(await prepare(env));assert.equal((await get(env,t)).status,429);assert.equal(calls,0);assert.equal(env.charged,0);await lease.release();db.exec('DELETE FROM aio_multikonta_quota_members_v2');
 // The schema includes reason and updated_at; use actual columns rather than positional inserts.
 db.prepare("INSERT INTO aio_download_speed_users_v1(user_id,mode,kbps,expires_ms,reason,updated_at) VALUES(?,?,?,?,?,?)").run('free','custom',250,null,'test','2026-11-27');let r=await get(env,token(await prepare(env)));assert.equal(r.headers.get('X-AIO-Download-Limit-KBps'),'250');await r.text();db.exec("UPDATE aio_download_speed_users_v1 SET mode='unlimited',kbps=NULL WHERE user_id='free'");r=await get(env,token(await prepare(env)));assert.equal(r.headers.get('X-AIO-Download-Speed'),'free-unlimited');await r.text();assert.equal(env.charged,2);
 }finally{globalThis.fetch=old;db.close();}
});
test('VIP redirect without debit; expired VIP unsupported link cannot fall back to external server',async()=>{
 const {env,db}=fixture();env.state.active=true;let t=token(await prepare(env,BAD));let r=await get(env,t);assert.equal(r.status,302);assert.equal(r.headers.get('Location'),BAD);assert.equal(env.charged,0);t=token(await prepare(env,BAD));env.state.active=false;r=await get(env,t);assert.equal(r.status,409);assert.equal(r.headers.get('Location'),null);assert.equal(env.charged,0);db.close();
});
test('owner-only mapping, confirmed object, safe local path and report; mapped link reuses existing local route',async()=>{
 const {env,db}=fixture();const save={action:'save',href:BAD,path:'/pliki/test.zip',confirm:true};assert.equal((await callOwner(env,save)).status,403);env.owner=true;assert.equal((await callOwner(env,save,'https://evil.test')).status,403);assert.equal((await callOwner(env,{...save,path:'/pliki/missing.zip'})).status,400);assert.equal((await callOwner(env,{...save,path:'/pliki/../test.zip'})).status,400);assert.equal((await callOwner(env,save)).status,200);
 const r=await prepare(env,BAD,{commentId:COMMENT});assert.equal(r.data.kind,'local');assert.equal(r.data.mapped_external,true);assert.match(r.data.href,/^\/pliki\/test\.zip\?aio_post=/);assert.equal(new URL(r.data.href,ORIGIN).searchParams.get('aio_map'),await helper.sourceHash(BAD));assert.equal(env.charged,0);
 const rep=await (await callOwner(env,{action:'report'})).json();assert.ok(rep.ok);assert.equal(rep.items.find(x=>x.href===BAD).mode,'mapped');assert.equal((await callOwner(env,{action:'remove',href:BAD,confirm:true})).status,200);assert.equal((await prepare(env,BAD)).status,409);assert.equal(db.prepare('SELECT COUNT(*) n FROM community_moderation_log').get().n,2);db.close();
});
test('published chat/comment source validated; modified or unpublished comment cannot issue proxy',async()=>{
 const {env,db}=fixture();let t=token(await prepare(env,GOOD,{source:'chat',sourceId:'chat-123'}));assert.ok(await helper.verifyTicketSource(env,await helper.readTicket(env,t,'free'),ORIGIN));t=token(await prepare(env,GOOD,{commentId:COMMENT}));assert.ok(await helper.verifyTicketSource(env,await helper.readTicket(env,t,'free'),ORIGIN));db.exec("UPDATE community_comments SET status='hidden'");assert.equal((await get(env,t)).status,403);db.close();
});


test('MediaFire Premium: exact share format, trusted redirect only, rejects landing HTML',async()=>{
 const premium='https://www.mediafire.com/file_premium/bbvfc2nffb6rg0b/OpenSPA-8.7-zgemmah17combo-backup-20261126_2008_usb.zip/file';
 assert.equal(helper.directSource(premium).provider,'mediafire');
 for(const x of [premium.replace('www.mediafire.com','www.mediafire.com.evil.test'),premium.replace('file_premium','file'),premium.replace('.zip','.html'),premium.replace('.zip','%2fother.zip'),premium.replace('https:','http:')])assert.equal(helper.directSource(x),null,x);
 let calls=[];const a=await helper.fetchExternalFile(premium,async(u,o)=>{calls.push(u);assert.equal(o.redirect,'manual');return calls.length===1?new Response(null,{status:302,headers:{Location:'https://download123.mediafire.com/token/id/backup.zip'}}):bytes();});
 assert.equal(await a.text(),'abcde');assert.equal(calls.length,2);
 calls=[];await assert.rejects(helper.fetchExternalFile(premium,async u=>{calls.push(u);return new Response(null,{status:302,headers:{Location:'https://mediafire.com.evil.test/a.zip'}});}),/Unsafe redirect/);assert.equal(calls.length,1);
 await assert.rejects(helper.fetchExternalFile(premium,async()=>new Response('<html>',{headers:{'Content-Type':'text/html','Content-Length':'6'}})));
 const direct=await helper.fetchExternalFile(premium,async()=>new Response('abc',{headers:{'Content-Type':'application/octet-stream','Content-Length':'3'}}));
 assert.match(direct.headers.get('Content-Disposition'),/OpenSPA-8.7-zgemmah17combo-backup-20261126_2008_usb.zip/);assert.equal(await direct.text(),'abc');
 const {env,db}=fixture();const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('MediaFire must not be proxied');};try{db.prepare('UPDATE community_posts SET content=? WHERE id=?').run(premium,POST);assert.equal((await prepare(env,premium)).status,403);env.state.active=true;const p=await prepare(env,premium);assert.equal(p.data.kind,'managed_external');const r=await get(env,token(p));assert.equal(r.status,302);assert.equal(r.headers.get('Location'),premium);assert.equal(env.charged,0);}finally{globalThis.fetch=old;db.close();}
});


test('Megawrzuta only 7D/VIP/owner, independent of global switch, mapping and individual speed',async()=>{
 const {env,db}=fixture(),mega='https://megawrzuta.pl/abcdefgh';
 db.prepare('UPDATE community_posts SET content=? WHERE id=?').run(mega,POST);
 db.prepare('INSERT INTO aio_external_speed_maps_v1(source_hash,r2_path,updated_at,updated_by) VALUES(?,?,?,?)').run(await helper.sourceHash(mega),'/pliki/test.zip','2026-11-27','owner');
 db.prepare('INSERT INTO aio_download_speed_users_v1(user_id,mode,kbps,expires_ms,reason,updated_at) VALUES(?,?,?,?,?,?)').run('free','unlimited',null,null,'test','2026-11-27');
 for(const enabled of [0,1]){
  db.exec('UPDATE aio_download_speed_config_v1 SET enabled='+enabled+';UPDATE aio_external_speed_policy_v1 SET enabled='+enabled);
  for(const source of ['post','chat','catalog']){
   const r=await prepare(env,mega,{source});assert.equal(r.status,403);assert.equal(r.data.megawrzuta_paid_only,true);assert.equal(r.data.href,undefined);
  }
  assert.equal(env.charged,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM aio_external_speed_tickets_v1').get().n,0);
  for(const grant of [{active:true,vip:true},{active:true,vip:false},{active:true,owner:true}]){
   env.state={...env.state,...grant};const p=await prepare(env,mega);assert.equal(p.data.kind,'managed_external');const r=await get(env,token(p));assert.equal(r.status,302);assert.equal(r.headers.get('Location'),mega);assert.equal(env.charged,0);env.state={authenticated:true,email_verified:true,active:false,free_remaining:3};
  }
  env.state.active=true;const t=token(await prepare(env,mega));env.state.active=false;const r=await get(env,t);assert.equal(r.status,403);assert.equal(r.headers.get('Location'),null);assert.equal(env.charged,0);
  await helper.takeTicket(env,t,'free');
 }
 env.owner=true;const rep=await (await callOwner(env,{action:'report'})).json();assert.equal(rep.items.find(x=>x.href===mega).mode,'paid_only');
 const look=await (await callOwner(env,{action:'lookup',href:mega})).json();assert.equal(look.paid_only,true);
 assert.equal((await callOwner(env,{action:'save',href:mega,path:'/pliki/test.zip',confirm:true})).status,400);
 db.close();
});
test('Megawrzuta entitlement is checked again after ticket claim',async()=>{
 const {env,db}=fixture(),mega='https://www.megawrzuta.pl/abcdefgh';db.prepare('UPDATE community_posts SET content=? WHERE id=?').run(mega,POST);env.state.active=true;
 const t=token(await prepare(env,mega));const original=env.COMMUNITY_DB.prepare;env.COMMUNITY_DB.prepare=function(sql){const stmt=original.call(this,sql);if(!sql.startsWith('DELETE FROM aio_external_speed_tickets_v1 WHERE token='))return stmt;const bind=stmt.bind;stmt.bind=function(...p){const b=bind(...p),first=b.first;b.first=async()=>{const r=await first();env.state={...env.state,active:false};return r;};return b;};return stmt;};
 const r=await get(env,t);assert.equal(r.status,403);assert.equal(r.headers.get('Location'),null);assert.equal(env.charged,0);db.close();
});


test('External diagnostics expose fixed codes, no URLs or secrets, no debit',async()=>{
 const cases=[
  ['HTTP_403',()=>new Response('secret',{status:403})],
  ['HTML_OR_SVG',()=>new Response('<html>',{headers:{'Content-Type':'text/html'}})],
  ['LENGTH_MISSING',()=>new Response('x',{headers:{'Content-Type':'application/zip'}})],
  ['SIZE_LIMIT',()=>new Response('x',{headers:{'Content-Type':'application/zip','Content-Length':'2147483649'}})],
  ['REDIRECT_REJECTED',()=>new Response(null,{status:302,headers:{Location:'https://evil.test/secret?token=hidden'}})],
  ['FETCH_ERROR',()=>{throw Error('secret URL with token=hidden');}]
 ];
 for(const [code,make] of cases){
  const {env,db}=fixture(),old=globalThis.fetch;globalThis.fetch=async()=>make();
  try{const r=await get(env,token(await prepare(env)));assert.equal(r.status,502);const message=await r.text();assert.ok(message.endsWith(code),message);assert.doesNotMatch(message,/secret|hidden|evil\.test/);assert.equal(env.charged,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM aio_download_speed_leases_v1').get().n,0);}
  finally{globalThis.fetch=old;db.close();}
 }
});


test('MediaFire entitlement: both switches, FREE/individual, paid, report, old tickets, expiry',async()=>{
 const {env,db}=fixture();const media='https://www.mediafire.com/file_premium/abcdefghijklm/backup.zip/file';
 db.prepare('UPDATE community_posts SET content=? WHERE id=?').run(media,POST);
 db.prepare('INSERT INTO aio_external_speed_maps_v1(source_hash,r2_path,updated_at,updated_by) VALUES(?,?,?,?)').run(await helper.sourceHash(media),'/pliki/test.zip','2026-11-27','owner');
 db.prepare('INSERT INTO aio_download_speed_users_v1(user_id,mode,kbps,expires_ms,reason,updated_at) VALUES(?,?,?,?,?,?)').run('free','unlimited',null,null,'test','2026-11-27');
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No proxy');};
 try{
 for(const global of [0,1])for(const external of [0,1]){
  db.exec('UPDATE aio_download_speed_config_v1 SET enabled='+global+';UPDATE aio_external_speed_policy_v1 SET enabled='+external);
  for(const href of [media,'https://www.mediafire.com/file/abcdefghijklm/backup.zip/file','https://download1527.mediafire.com/a/b/backup.zip'])for(const source of ['post','chat','catalog']){
   const r=await prepare(env,href,{source});assert.equal(r.status,403);assert.equal(r.data.paid_file_provider,'MediaFire');assert.equal(r.data.href,undefined);
  }
  assert.equal(await prepare(env,GOOD)==null,!global||!external);
  for(const grant of [{active:true,vip:true},{active:true,vip:false},{active:true,owner:true}]){
   env.state={...env.state,...grant};const p=await prepare(env,media);const r=await get(env,token(p));assert.equal(r.status,302);assert.equal(r.headers.get('Location'),media);env.state={authenticated:true,email_verified:true,active:false,free_remaining:3};
  }
  const stale=await helper.createTicket(env,env.user.id,{source:'post',sourceId:POST,href:media});const denied=await get(env,stale);assert.equal(denied.status,403);assert.equal(denied.headers.get('Location'),null);
  env.state.active=true;const t=token(await prepare(env,media));env.state.active=false;assert.equal((await get(env,t)).status,403);
 }
 assert.equal(calls,0);assert.equal(env.charged,0);
 env.owner=true;const rep=await (await callOwner(env,{action:'report'})).json();assert.equal(rep.items.find(x=>x.href===media).mode,'paid_only');
 const look=await (await callOwner(env,{action:'lookup',href:media})).json();assert.equal(look.paid_only,true);assert.equal(look.paid_provider,'MediaFire');
 assert.equal((await callOwner(env,{action:'save',href:media,path:'/pliki/test.zip',confirm:true})).status,400);
 }finally{globalThis.fetch=old;db.close();}
});


// AIO_MULTICLICK_FREE_V1
const MULTICLICK='https://multi-click.pl/index.php?controller=attachment&id_attachment=152';
test('Multi-Click: existing catalog IDs, exact HTTPS attachment route only',()=>{
 for(const id of [152,160,150,156,155,157,145,144,123,158,132,159]){
  const u=MULTICLICK.replace('152',String(id));assert.equal(helper.directSource(u).provider,'multiclick');assert.equal(helper.directSource(u).attachmentId,String(id));
 }
 for(const u of [MULTICLICK.replace('https:','http:'),MULTICLICK.replace('multi-click.pl','multi-click.pl.evil.test'),MULTICLICK.replace('multi-click.pl','evil.multi-click.pl'),MULTICLICK.replace('multi-click.pl','multi-click.pl:444'),MULTICLICK.replace('attachment','product'),MULTICLICK+'&id_attachment=1',MULTICLICK+'&redirect=https://evil.test',MULTICLICK.replace('152','-1'),MULTICLICK.replace('152','abc'),MULTICLICK.replace('/index.php','/admin/index.php'),'https://multi-click.pl/'])assert.equal(helper.directSource(u),null,u);
});
test('Multi-Click: safe canonical redirect, same attachment ID, HTML and upstream denial rejected',async()=>{
 const canonical=MULTICLICK.replace('://multi-click.pl','://www.multi-click.pl');let calls=[];
 const r=await helper.fetchExternalFile(MULTICLICK,async(u,o)=>{calls.push(u);assert.equal(o.redirect,'manual');assert.equal(o.headers.Cookie,undefined);return calls.length===1?new Response(null,{status:302,headers:{Location:canonical}}):bytes();});
 assert.equal(await r.text(),'abcde');assert.equal(calls.length,2);assert.equal(r.headers.get('Set-Cookie'),null);
 for(const target of [MULTICLICK.replace('152','153'),'https://evil.test/a.zip','http://multi-click.pl/index.php?controller=attachment&id_attachment=152','https://multi-click.pl/index.php?controller=product&id_attachment=152']){
  calls=[];await assert.rejects(helper.fetchExternalFile(MULTICLICK,async u=>{calls.push(u);return new Response(null,{status:302,headers:{Location:target}});}),e=>e.aioExternalCode==='REDIRECT_REJECTED');assert.equal(calls.length,1);
 }
 await assert.rejects(helper.fetchExternalFile(MULTICLICK,async()=>new Response('no',{status:403})),e=>e.aioExternalCode==='HTTP_403');
 await assert.rejects(helper.fetchExternalFile(MULTICLICK,async()=>new Response('<html>',{headers:{'Content-Type':'text/html','Content-Length':'6'}})),e=>e.aioExternalCode==='HTML_OR_SVG');
 const fallback=await helper.fetchExternalFile(MULTICLICK,async()=>new Response('abc',{headers:{'Content-Type':'application/zip','Content-Length':'3'}}));assert.match(fallback.headers.get('Content-Disposition'),/multi-click-152\.zip/);assert.equal(await fallback.text(),'abc');
});
test('Multi-Click: FREE catalog shares existing quota and 20 KB/s; failure no debit; paid redirect',async()=>{
 const {env,db}=fixture(),old=globalThis.fetch;let calls=0;
 db.exec('UPDATE aio_download_speed_config_v1 SET kbps=20');
 try{
  globalThis.fetch=async()=>{calls++;return new Response('no',{status:403});};
  let p=await prepare(env,MULTICLICK,{source:'catalog'});assert.equal(p.data.kind,'managed_external');assert.equal(env.charged,0);let r=await get(env,token(p));assert.equal(r.status,502);assert.equal(env.charged,0);
  globalThis.fetch=async()=>{calls++;return bytes();};
  for(const id of [152,160,150]){
   p=await prepare(env,MULTICLICK.replace('152',String(id)),{source:'catalog'});assert.equal(p.data.kind,'managed_external');r=await get(env,token(p));assert.equal(r.status,200);assert.equal(r.headers.get('X-AIO-Download-Limit-KBps'),'20');assert.equal(await r.text(),'abcde');
  }
  assert.equal(env.charged,3);assert.equal(env.state.free_remaining,0);assert.equal((await prepare(env,MULTICLICK,{source:'catalog'})).status,429);assert.equal(calls,4);
  env.state.active=true;p=await prepare(env,MULTICLICK,{source:'catalog'});r=await get(env,token(p));assert.equal(r.status,302);assert.equal(r.headers.get('Location'),MULTICLICK);assert.equal(env.charged,3);assert.equal(calls,4);
 }finally{globalThis.fetch=old;db.close();}
});
