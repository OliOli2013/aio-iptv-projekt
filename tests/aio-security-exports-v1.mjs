/* Node 22+ integration-like tests without network access or real D1 mutations. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const ROOT=process.argv[2]?path.resolve(process.argv[2]):process.cwd();
const source=await fs.readFile(path.join(ROOT,'functions/api/aio-security-exports-v1.js'),'utf8');
// Substitute only owner-auth import for isolated module tests.
const fixture=source.replace("import {requireAdmin} from '../_community.js';",
  "const requireAdmin=async(request,env,full)=>{env.authCalls=(env.authCalls||0)+1;if(!full||!env.verified)throw Object.assign(new Error('unauthorized'),{status:403});return {user:{id:'owner-test'}};};");
assert.notEqual(fixture,source,'auth stub imported');
const api=await import('data:text/javascript;base64,'+Buffer.from(fixture).toString('base64'));
const request=(q='')=>new Request('https://aio.example/api/aio-security-exports-v1'+q);
const makeEnv=(rows=[],other={})=>({verified:true,authCalls:0,reads:[],COMMUNITY_DB:{prepare(sql){other.onPrepare?.(sql);
  return {bind(...args){return {all:async()=>({results:rows.slice(Number(args.at(-1)),Number(args.at(-1))+Number(args.at(-2)))})}}};}},...other});
// Named test groups match on-page manifest.
const allowed=api.getSourceManifest();assert.equal(allowed.length,15);
assert.ok(allowed.some(x=>x.kind==='vpn-reviews'));
assert.ok(allowed.some(x=>x.kind==='security-events'));
assert.ok(allowed.some(x=>x.kind==='profile-bans'));
const denied=await api.onRequestGet({request:request('?kind=list'),env:makeEnv([],{verified:false})});
assert.equal(denied.status,403);assert.match(await denied.text(),/właściciela/);
const listed=await api.onRequestGet({request:request('?kind=list'),env:makeEnv()});
assert.equal(listed.status,200);assert.equal((await listed.json()).sources.length,15);
for(const q of ['?kind=../user','?kind=vpn-reviews&format=html','?kind=vpn-reviews&page=0','?kind=vpn-reviews&page=101','?kind=vpn-reviews&page=1;DROP']){
 const ans=await api.onRequestGet({request:request(q),env:makeEnv()});assert.equal(ans.status,400,q);
}
const missingDb=await api.onRequestGet({request:request('?kind=vpn-reviews'),env:{verified:true}});
assert.equal(missingDb.status,503);
const errorDb=await api.onRequestGet({request:request('?kind=vpn-reviews'),env:{verified:true,COMMUNITY_DB:{prepare(){throw new Error('no such table')}}}});
assert.equal(errorDb.status,503);assert.match(await errorDb.text(),/Nie wyeksportowano pustego raportu/);
// Formula/CSV escaping, sensitive fields omitted from SQL.
assert.equal(api.csvCell('=HYPERLINK("evil")'),'"\'=HYPERLINK(""evil"")"');
assert.equal(api.csvCell(' \n+cmd'),'"\' \n+cmd"');
assert.equal(api.csvCell('plain'),'"plain"');
const cols=api.SOURCES['vpn-reviews'].columns;
const record=Object.fromEntries(cols.map(c=>[c,c==='account'?'=2+2':'value']));
const csvEnv=makeEnv([record]);
const csv=await api.onRequestGet({request:request('?kind=vpn-reviews&format=csv'),env:csvEnv});
assert.equal(csv.status,200);assert.match(await csv.text(),/"'=2\+2"/);
assert.equal(csv.headers.get('cache-control'),'private, no-store');
assert.ok(csv.headers.get('content-disposition')?.includes('AIO-vpn-reviews'));
// Exact pagination 400 + one lookahead.
const many=Array.from({length:803},(_,i)=>({user_id:'id'+i,account:'Acc'+i,kind:'clean',checked_at:'2026-11-15'}));
const env=makeEnv(many);
const first=await api.onRequestGet({request:request('?kind=vpn-reviews&page=1'),env});
const f=await first.json();assert.equal(f.rows.length,400);assert.equal(f.has_more,true);assert.equal(f.page,1);
const third=await api.onRequestGet({request:request('?kind=vpn-reviews&page=3'),env});
const t=await third.json();assert.equal(t.rows.length,3);assert.equal(t.has_more,false);
const badPost=await api.onRequestPost();assert.equal(badPost.status,405);
for(const [k,s] of Object.entries(api.SOURCES)){
 assert.ok(s.columns?.length>=2 && s.sql?.startsWith('SELECT '),k);
 assert.ok(!/SELECT \*/.test(s.sql),k);
 assert.ok(!/(password_hash|password_salt|token_hash|ip_address|api_key|community_auth)/i.test(s.sql),k);
}
console.log('AIO Security Exports V1: 19 assertions/groups OK');
