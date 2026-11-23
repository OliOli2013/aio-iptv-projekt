// Route-level unit tests: in-memory R2 and synthetic policy state, no external requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const fake='data:text/javascript,'+encodeURIComponent([
  'export const initAccess=async()=>{},sessionUser=async(r,e)=>e.user,getStatus=async e=>e.state;',
  'export const consumeFree=async e=>{e.charged++;return {allowed:e.admit,reason:e.admit?"free":"limit"}};',
  'export const activeSharedHold=async()=>null,logSecurity=async()=>{},reviewPaidSessionSharing=async()=>null;',
  'export const monitorDownload=async()=>({blocked:false}),queueIssuedFileAudit=()=>{};',
  'export const checkAnonymousFileBurst=async()=>({blocked:false}),anonymousDeniedResponse=()=>new Response(null,{status:429}),recordDistributedAnonymousDenied=async()=>{};'
].join('\n'));
registerHooks({resolve(s,c,next){if(c.parentURL?.includes('/functions/pliki/')&&!s.includes('_aio_private_files')&&!s.includes('_aio_panel_public')&&s.startsWith('../_aio_'))return {url:fake,shortCircuit:true};return next(s,c);}});
const {onRequest}=await import('../functions/pliki/[[path]].js');
const path='/pliki/test-fixture.zip';
const base=()=>({user:{id:'fixture',role:'user'},state:{free_remaining:2,active:false,email_verified:true},
  AIO_DOWNLOAD_STORAGE_MODE:'r2',AIO_PRIVATE_FILES:{head:async()=>({size:7}),get:async()=>({body:'fixture'})},admit:true,charged:0});
const run=(env,method='GET',p=path)=>onRequest({env,request:new Request('https://fixture.invalid'+p,{method}),next:()=>{throw Error('No static download');}});
test('GET wydaje z prywatnego R2; HEAD, brak pliku, zły typ lub brak R2 bez obciążenia',async()=>{
  const e=base(),h=await run(e,'HEAD');assert.equal(h.status,200);assert.equal(e.charged,0);
  const ok=await run(e);assert.equal(await ok.text(),'fixture');assert.match(ok.headers.get('cache-control'),/no-store/);assert.equal(e.charged,1);
  for(const [env,status] of [[{AIO_DOWNLOAD_STORAGE_MODE:'legacy'},503],[{AIO_PRIVATE_FILES:null},503],
    [{AIO_PRIVATE_FILES:{head:async()=>null,get:async()=>null}},404],
    [{AIO_PRIVATE_FILES:{head:async()=>({size:7,writeHttpMetadata:h=>h.set('Content-Type','text/html')}),get:async()=>({body:'fixture'})}},502]]){
    const u={...base(),...env};assert.equal((await run(u)).status,status);assert.equal(u.charged,0);
  }
});
test('brak sesji i wyczerpany limit: nigdy nie wydano pliku; najnowszy IPK pozostaje wyjątkiem',async()=>{
  for(const env of [{user:null},{state:{email_verified:true,active:false,free_remaining:0}}]){
    const e={...base(),...env},r=await run(e);assert.equal(r.status,302);assert.match(r.headers.get('location'),/downloads/);assert.equal(e.charged,0);
  }
  const e=base();e.user=null;const p=await run(e,'GET','/pliki/enigma2-plugin-extensions-panelaio_18.2.1_all.ipk');
  assert.equal(p.headers.get('location'),'/api/aio-panel-ipk');assert.equal(e.charged,0);
  const race={...base(),admit:false};const d=await run(race);assert.equal(d.status,302);assert.match(d.headers.get('location'),/aio_limit/);assert.notEqual(await d.text(),'fixture');
});
test('warunkowy zapis rzeczywistego licznika: tylko trzy wydania, czwarte nie przesuwa daty odnowienia',()=>{
  const src=readFileSync(new URL('../functions/_aio_monthly_access.js',import.meta.url),'utf8');
  const q=src.match(/const updated=await env\.COMMUNITY_DB\.prepare\(\x60(UPDATE aio_access_monthly_cycles SET[\s\S]*?)\x60\)/);
  assert.ok(q);const db=new DatabaseSync(':memory:');
  db.exec("CREATE TABLE aio_access_monthly_cycles(user_id TEXT PRIMARY KEY,started_ms INTEGER DEFAULT 0,third_ms INTEGER DEFAULT 0,resets_ms INTEGER DEFAULT 0,used INTEGER DEFAULT 0,updated_at TEXT);INSERT INTO aio_access_monthly_cycles(user_id) VALUES('fixture')");
  const st=db.prepare(q[1]),changes=[1,2,3,4].map(i=>st.run(i,i,i+100,'synthetic','fixture').changes);
  assert.deepEqual(changes,[1,1,1,0]);assert.equal(db.prepare('SELECT resets_ms FROM aio_access_monthly_cycles').get().resets_ms,103);db.close();
});
