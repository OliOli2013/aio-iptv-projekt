import {readFileSync} from 'node:fs';import {test} from 'node:test';import assert from 'node:assert/strict';
// Import actual route with a narrowly substituted auth stub, exercising HTTP gating
// and response mapping without the real Cloudflare session stack.
const raw=readFileSync(new URL('../functions/api/aio-security-intelligence.js',import.meta.url),'utf8');const code=raw.replace("import {requireAdmin,getOwnerId} from '../_community.js';",`const requireAdmin=async(r,e)=>{if(!e.session)throw Object.assign(Error('no'),{status:401});return e.session};const getOwnerId=async(e)=>e.owner;`);assert.notEqual(code,raw);const api=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const key='a'.repeat(64),now=new Date().toISOString();const report={version:1,checked_at:now,target:'preview',metrics:{profiles:1},warnings:[],cases:[{key,kind:'network'}]};
function fixture(opts={}){const calls=[];const env={owner:'owner',session:{user:{id:'owner',role:'admin'}},COMMUNITY_DB:{prepare(sql){calls.push(sql);let params=[];return {bind(...v){params=v;return this;},async first(){return opts.empty?null:{checked_at:now,payload:JSON.stringify(report)};},async all(){return {results:sql.startsWith('INSERT')?(opts.stale?[]:[{case_key:params[0]}]):[{case_key:key,reviewed_at:now}]};}};}}};return {env,calls};}
const get=env=>api.onRequestGet({request:new Request('https://example.test/api/aio-security-intelligence'),env});
function post(env,body,origin='https://example.test'){return api.onRequestPost({request:new Request('https://example.test/api/aio-security-intelligence',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}),env});}
test('unauthenticated: no DB report access',async()=>{const {env,calls}=fixture();env.session=null;assert.equal((await get(env)).status,401);assert.equal(calls.length,0);});
test('nonowner rejected',async()=>{const {env,calls}=fixture();env.session.user.id='other';assert.equal((await get(env)).status,403);assert.equal(calls.length,0);});
test('owner receives no-store and reviewed flag',async()=>{const {env}=fixture();const res=await get(env);assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'private, no-store');assert.equal((await res.json()).report.cases[0].reviewed_at,now);});
test('cross origin POST rejected before DB',async()=>{const {env,calls}=fixture();assert.equal((await post(env,{action:'review',key,checked_at:now},'https://evil.test')).status,403);assert.equal(calls.length,0);});
test('stale acknowledgment fails',async()=>{const {env}=fixture({stale:true});assert.equal((await post(env,{action:'review',key,checked_at:now})).status,409);});
test('valid acknowledgment writes only seen table with snapshot guard',async()=>{const {env,calls}=fixture();assert.equal((await post(env,{action:'review',key,checked_at:now})).status,200);assert.equal(calls.length,1);assert.match(calls[0],/INSERT INTO aio_security_intelligence_seen_v1/);assert.match(calls[0],/checked_at=\?/);assert.match(calls[0],/json_each/);});
test('empty report is not represented as a clean audit',async()=>{const {env}=fixture({empty:true});assert.equal((await (await get(env)).json()).report,null);});

const A='00000000-0000-4000-8000-000000000002',B='00000000-0000-4000-8000-000000000003',C='00000000-0000-4000-8000-000000000004',D='00000000-0000-4000-8000-000000000005';
test('identity lookup: current email, archived name, missing and protected; bound snapshot IDs only',async()=>{
 const calls=[];const db={prepare(sql){return {bind(v){calls.push([sql,JSON.parse(v)]);return this;},async all(){return {results:sql.includes('FROM community_profiles')?[{id:A,role:'user',display_name:'Current',email:'current@example.invalid',banned_until:null},{id:D,role:'admin',display_name:'Protected',email:'secret@example.invalid'}]:[{id:B,name:'Archived'}]};}};}};
 const result=await api.resolveReportAccounts(db,{cases:[{kind:'network',users:[{id:A},{id:A},{id:D},{id:'invalid'}]},{kind:'orphan_claim',detail:`Przypisanie sieci bez profilu: ${B} (Strict V4).`},{kind:'orphan_claim',orphan_id:C}]},'owner');
 assert.deepEqual(calls[0][1],[A,D,B,C]);assert.deepEqual(calls[1][1],[B,C]);assert.equal(result.accounts[A].email,'current@example.invalid');assert.deepEqual(result.accounts[B],{state:'archived',name:'Archived'});assert.deepEqual(result.accounts[C],{state:'missing'});assert.deepEqual(result.accounts[D],{state:'protected'});assert.equal(result.incomplete,false);assert.equal(JSON.stringify(result).includes('secret@example.invalid'),false);
});
test('owner identity enrichment is nonpersistent and a failed lookup is distinguishable',async()=>{
 const snap={...report,cases:[{...report.cases[0],users:[{id:A}]}]};const {env}=fixture();const original=env.COMMUNITY_DB.prepare;
 env.COMMUNITY_DB.prepare=sql=>{if(sql.includes('FROM community_profiles'))throw Error('offline');const statement=original(sql);if(sql.startsWith('SELECT checked_at,payload'))statement.first=async()=>({checked_at:now,payload:JSON.stringify(snap)});return statement;};
 const res=await get(env);assert.equal(res.status,200);const data=await res.json();assert.equal(data.identity_incomplete,true);assert.equal(data.report.cases[0].users[0].id,A);assert.equal(data.accounts[A],undefined);
});
