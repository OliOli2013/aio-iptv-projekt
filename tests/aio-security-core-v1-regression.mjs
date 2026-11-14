#!/usr/bin/env node
/* Security Core V1: policy tests using mocked dependencies, no Cloudflare network or D1 writes. */
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(process.argv[2]||'.');
const read=p=>readFileSync(resolve(root,p),'utf8');
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
let source=read('functions/_aio_security_core_v1.js');
const fakeUrl=url(`
export async function getSession(){return globalThis.__aioCoreTest.session;}
export async function activeSharedHold(){return globalThis.__aioCoreTest.shared;}
export async function strictGlobalHold(){return globalThis.__aioCoreTest.strict;}
export async function activeIpHold(){return globalThis.__aioCoreTest.ip;}
`);
for(const path of ['./_community.js','./_aio_security_journal.js','./_aio_strict_ip_v4.js','./_aio_ip_one_account_v7.js']){
 const original="from '"+path+"'";assert.ok(source.includes(original),path);source=source.replace(original,'from '+JSON.stringify(fakeUrl));
}
const core=await import(url(source));
let total=0;
const check=(name,fn)=>{fn();console.log('OK '+(++total)+' '+name)};
const normal={authenticated:true,email_verified:true,active:false,free_remaining:2};
check('Normal user authorized without CAPTCHA',()=>assert.equal(core.coreDecision({authenticated:true,status:normal}).allowed,true));
check('Active VIP/owner access survives zero free quota',()=>assert.equal(core.coreDecision({authenticated:true,status:{...normal,active:true,free_remaining:0}}).allowed,true));
for(const reason of ['accountBlocked','strictHold','ipHold','sharedHold']){
 check(reason+' denies download',()=>assert.equal(core.coreDecision({authenticated:true,[reason]:true,status:normal}).allowed,false));
}
check('No authenticated session is denied',()=>assert.equal(core.coreDecision({status:normal}).reason,'session'));
check('Unverified email is denied',()=>assert.equal(core.coreDecision({authenticated:true,status:{...normal,email_verified:false}}).reason,'email'));
check('Pending review blocks free access',()=>assert.equal(core.coreDecision({authenticated:true,status:{...normal,review_pending:true}}).reason,'review'));
check('Zero quota denied',()=>assert.equal(core.coreDecision({authenticated:true,status:{...normal,free_remaining:0}}).reason,'limit'));
check('Missing quota fails closed',()=>assert.equal(core.coreDecision({authenticated:true,status:{authenticated:true,email_verified:true}}).allowed,false));
check('Missing state fails closed',()=>assert.equal(core.coreDecision({authenticated:true}).allowed,false));
const userId='USER-A';const request={headers:new Headers()};
const run=()=>core.coreAdmitDownload({},request,userId,normal);
async function asyncCheck(name,fn){await fn();console.log('OK '+(++total)+' '+name)}
globalThis.__aioCoreTest={session:{user:{id:userId},banned:false,blocked:false},shared:null,ip:null,strict:null};
await asyncCheck('Pre-debit admission succeeds for valid session',async()=>assert.equal((await run()).allowed,true));
globalThis.__aioCoreTest.session.user.id='USER-B';
await asyncCheck('A different session account is denied',async()=>assert.equal((await run()).reason,'session'));
globalThis.__aioCoreTest.session.user.id=userId;
globalThis.__aioCoreTest.strict=true;
await asyncCheck('Global strict hold is denied',async()=>assert.equal((await run()).reason,'restricted'));
globalThis.__aioCoreTest.strict=null;globalThis.__aioCoreTest.ip=true;
await asyncCheck('Current-network IP hold is denied',async()=>assert.equal((await run()).reason,'restricted'));
globalThis.__aioCoreTest.ip=null;globalThis.__aioCoreTest.shared=true;
await asyncCheck('Shared/paid hold denied',async()=>assert.equal((await run()).reason,'restricted'));
await asyncCheck('Request is mandatory',async()=>assert.equal((await core.coreAdmitDownload({},null,userId,normal)).reason,'session'));
// Installation checks: all three existing debit entry points pass request to shared core.
const access=read('functions/_aio_account_access.js');
assert.match(access,/coreAdmitDownload\(env,request,userId,status\)/);
for(const p of ['functions/pliki/[[path]].js','functions/api/aio-post-link.js'])assert.match(read(p),/consumeFree\(env,user\.id,fileKey,request\)/,p);
assert.match(read('functions/api/aio-account-access.js'),/consumeFree\(env,user\.id,null,request\)/);
const files=read('functions/pliki/[[path]].js');
assert.match(files,/if\(request\.method==='HEAD'\)return new Response\(null,\{status:204/);
assert.equal((files.match(/consumeFree\(env,user\.id,fileKey,request\)/g)||[]).length,2,'both mirror and R2 branches must be protected');
assert.equal((files.match(/if\(!permit\.allowed\)return permit\.reason==='limit'/g)||[]).length,2,'both mirror and R2 branches must handle all deny reasons');
assert.equal(files.includes('consumeFree(env,user.id,fileKey)'),false,'stale unguarded debit call not allowed');
assert.equal(files.includes("if(request.method==='HEAD')return new Response(null,{status:302,headers:{Location:mirror"),false);
for(const p of ['functions/api/aio-panel-ipk.js','functions/_aio_monthly_access.js','functions/_aio_multikonta_guard_v2.js'])assert.ok(existsSync(resolve(root,p)),p);
console.log(`AIO Security Core V1: ${total} policy tests PASS; integration and HEAD assertions PASS`);
