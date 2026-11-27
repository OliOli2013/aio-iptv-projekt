// Run after install in actual repo (Node >=22.15); real route + real speed module, fake R2/auth.
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const fake='data:text/javascript,'+encodeURIComponent([
'export const initAccess=async()=>{},sessionUser=async(r,e)=>e.user,getStatus=async e=>e.state;',
'export const consumeFree=async e=>{if(!e.admit)return {allowed:false,reason:"limit"};if(e.state.active)return {allowed:true,reason:e.state.owner?"owner":e.state.vip?"vip":"grant"};e.charged++;return {allowed:true,reason:"free"};};',
'export const activeSharedHold=async()=>null,logSecurity=async()=>{},reviewPaidSessionSharing=async()=>null;',
'export const monitorDownload=async()=>({blocked:false}),queueIssuedFileAudit=()=>{};',
'export const checkAnonymousFileBurst=async()=>({blocked:false}),anonymousDeniedResponse=()=>new Response(null,{status:429}),recordDistributedAnonymousDenied=async()=>{};',
'export const canResumeRange=async e=>e.resume===true,authorizeRange=async(e,r,u,k,consume)=>e.resume?{allowed:true,reason:"range_chunk",range_chunk:true}:consume();'
].join('\n'));
registerHooks({resolve(s,c,next){if(c.parentURL?.includes('/functions/pliki/')&&s.startsWith('../_aio_')&&!['_aio_private_files','_aio_panel_public','_aio_download_speed_v1'].some(n=>s.includes(n)))return {url:fake,shortCircuit:true};return next(s,c);}});
const {onRequest}=await import('../functions/pliki/[[path]].js');
function fixture(){const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../supabase/aio-download-speed-v1.sql',import.meta.url),'utf8'));db.exec("UPDATE aio_download_speed_config_v1 SET enabled=1;CREATE TABLE aio_multikonta_quota_members_v2(user_id TEXT PRIMARY KEY,group_id TEXT NOT NULL);CREATE TABLE community_profiles(id TEXT PRIMARY KEY)");db.exec(readFileSync(new URL('../supabase/aio-individual-speed-v1.sql',import.meta.url),'utf8'));const env={user:{id:'fixture',role:'user'},state:{free_remaining:2,active:false,email_verified:true},charged:0,admit:true,AIO_DOWNLOAD_STORAGE_MODE:'r2',AIO_PRIVATE_FILES:{head:async()=>({size:10000}),get:async(_k,o)=>({body:new Response(new Uint8Array(o.range?.length||10000)).body})},COMMUNITY_DB:{prepare(sql){const stmt=db.prepare(sql);const wrap=(params=[])=>({bind(...p){return wrap(p)},async first(){return stmt.get(...params)||null},async run(){return {meta:{changes:Number(stmt.run(...params).changes)}}}});return wrap();}}};return {env,db};}
const run=(env,{method='GET',path='/pliki/fixture.zip',headers={}}={})=>onRequest({env,request:new Request('https://fixture.invalid'+path,{method,headers}),next:()=>{throw Error('No static delivery');}});
test('FREE / HEAD / parallel / cancel / Range',async()=>{const {env,db}=fixture();assert.equal((await run(env,{method:'HEAD'})).status,200);assert.equal(env.charged,0);const a=await run(env);assert.equal(a.status,200);assert.equal(a.headers.get('x-aio-download-limit-kbps'),'25');assert.equal(env.charged,1);const b=await run(env,{headers:{Range:'bytes=0-9'}});assert.equal(b.status,429);assert.equal(env.charged,1);await a.body.cancel();env.resume=true;env.state.free_remaining=0;const r=await run(env,{headers:{Range:'bytes=0-9'}});assert.equal(r.status,206);assert.equal(r.headers.get('x-aio-download-limit-kbps'),'25');assert.equal((await r.arrayBuffer()).byteLength,10);assert.equal(env.charged,1);db.close();});
test('paid, owner, disabled, anonymous and public IPK',async()=>{const {env,db}=fixture();for(const state of [{active:true},{active:true,vip:true},{active:true,owner:true}]){env.state={...state,email_verified:true};const r=await run(env);assert.equal(r.status,200);assert.equal(r.headers.get('x-aio-download-limit-kbps'),null);await r.body.cancel();}assert.equal(env.charged,0);db.exec('UPDATE aio_download_speed_config_v1 SET enabled=0');env.state={active:false,free_remaining:2,email_verified:true};const r=await run(env);assert.equal(r.headers.get('x-aio-download-limit-kbps'),null);await r.body.cancel();env.user=null;assert.equal((await run(env)).status,302);const pub=await run(env,{path:'/pliki/enigma2-plugin-extensions-panelaio_18.2.1_all.ipk'});assert.equal(pub.headers.get('location'),'/api/aio-panel-ipk');db.close();});

test('individual FREE: custom speed, unlimited still holds the lease and counts once, group suspends',async()=>{
 const {env,db}=fixture();db.exec("INSERT INTO community_profiles VALUES('fixture');INSERT INTO aio_download_speed_users_v1(user_id,mode,kbps,expires_ms,reason,updated_at) VALUES('fixture','custom',250,NULL,'test owner','2026-11-27')");
 const a=await run(env);assert.equal(a.headers.get('x-aio-download-limit-kbps'),'250');assert.equal(env.charged,1);await a.body.cancel();
 db.exec("UPDATE aio_download_speed_users_v1 SET mode='unlimited',kbps=NULL");const b=await run(env);assert.equal(b.headers.get('x-aio-download-limit-kbps'),null);assert.equal(b.headers.get('x-aio-download-speed'),'free-unlimited');assert.equal((await run(env)).status,429);assert.equal(env.charged,2);await b.body.cancel();
 db.exec("INSERT INTO aio_multikonta_quota_members_v2 VALUES('fixture','g')");const c=await run(env);assert.equal(c.headers.get('x-aio-download-limit-kbps'),'25');await c.body.cancel();db.close();
});
