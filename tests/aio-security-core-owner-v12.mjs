#!/usr/bin/env node
/* Owner bypass regression and source integration contract. No live D1 mutation. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(process.argv[2]||'.');
const read=p=>readFileSync(resolve(root,p),'utf8');
const moduleUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const fake=moduleUrl(`
export async function getSession(){return globalThis.__coreFixture.session;}
export async function activeSharedHold(){return globalThis.__coreFixture.shared;}
export async function strictGlobalHold(){return globalThis.__coreFixture.strict;}
export async function activeIpHold(){return globalThis.__coreFixture.ip;}
export async function checkProtectedSessionNetwork(){return globalThis.__coreFixture.network ?? {allowed:true,status:200};}
`);
let src=read('functions/_aio_security_core_v1.js');
for(const p of ['./_community.js','./_aio_security_journal.js','./_aio_strict_ip_v4.js','./_aio_ip_one_account_v7.js','./_aio_session_network_v1.js']){
  const from="from '"+p+"'";assert.ok(src.includes(from),p);src=src.replace(from,'from '+JSON.stringify(fake));
}
const core=await import(moduleUrl(src));
const key='user-owner';const request={headers:new Headers()};
const owner={authenticated:true,email_verified:true,active:true,owner:true,unlimited:true,free_remaining:null};
const vip={authenticated:true,email_verified:true,active:true,vip:true,free_remaining:0};
const grant={authenticated:true,email_verified:true,active:true,source:'owner_verified_support',free_remaining:0};
const free={authenticated:true,email_verified:true,active:false,free_remaining:2};
const expect=async (state,allowed,message)=>assert.equal((await core.coreAdmitDownload({},request,key,state)).allowed,allowed,message);
globalThis.__coreFixture={session:{user:{id:key,role:'admin',is_owner:true}},strict:{},ip:{},shared:{}};
await expect(owner,true,'Owner must bypass inherited holds');
console.log('OK 1: verified owner is immune to inherited holds');
globalThis.__coreFixture.session.user.is_owner=false;
await expect(owner,false,'Cannot spoof owner with a forged account status');
console.log('OK 2: owner bypass requires server session owner flag');
globalThis.__coreFixture.session.user.is_owner=true;
globalThis.__coreFixture.session.user.role='user';
await expect(owner,false,'Cannot bypass with a non-admin role');
console.log('OK 3: owner bypass requires admin role');
globalThis.__coreFixture.session.user={id:'other-user',role:'admin',is_owner:true};
await expect(owner,false,'Cannot use a different user session');
console.log('OK 4: owner bypass requires matching session user ID');
globalThis.__coreFixture.session.user={id:key,role:'user',is_owner:false};
globalThis.__coreFixture.strict=null;globalThis.__coreFixture.ip=null;globalThis.__coreFixture.shared=null;
await expect(vip,true,'Active VIP remains unlimited');
await expect(grant,true,'Active 7-day support remains unlimited');
await expect(free,true,'Free account with 2 remaining remains allowed');
console.log('OK 5-7: VIP, 7-day and free access preserved');
globalThis.__coreFixture.shared={};
await expect(vip,false,'VIP must still obey genuine account safety hold');
console.log('OK 8: VIP security holds remain active');
globalThis.__coreFixture.shared=null;
await expect({...free,free_remaining:0},false,'Free quota must still be enforced');
console.log('OK 9: free quota limit retained');
for(const rel of ['functions/pliki/[[path]].js','functions/api/aio-post-link.js','functions/api/aio-account-access.js']){
  const body=read(rel);
  assert.match(body,/user\.is_owner===true&&user\.role==='admin'/,rel+' owner bypass');
}
assert.match(read('functions/_community.js'),/if \(ip && !profile\.is_owner\)/);
assert.match(read('functions/_community.js'),/if \(!profile\.is_owner && row\.banned_until/);
assert.match(read('assets/js/aio-owner-tools-catalog-v1.js'),/security-core-v1/);
assert.match(read('assets/js/aio-owner-layout-v4.js'),/security-core-v1/);
assert.match(read('functions/_owner_hub_markup.js'),/aio-owner-core-preview-v1\.js/);
console.log('AIO SECURITY CORE OWNER V1.2: 9 behavior tests + owner UI wiring PASS');
