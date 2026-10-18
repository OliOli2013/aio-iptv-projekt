#!/usr/bin/env node
/* AIO Media & Security V2 — executable auth tests with stubbed D1/R2; never hits production. */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'.');
const code=readFileSync(resolve(root,'functions/api/community-media.js'),'utf8');
const meta=readFileSync(resolve(root,'functions/_aio_post_meta.js'),'utf8');
const mock=String.raw`
export function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})}
export async function ensureSchema(){}
export async function getSession(request){
 const role=request.headers.get('x-test-user');
 if(!role||role==='guest')return null;
 if(role==='blocked')return {blocked:true,user:{id:'blocked'}};
 if(role==='owner')return {user:{id:'owner'},is_owner:true};
 if(role==='author')return {user:{id:'author'}};
 return {user:{id:'member'}};
}
export async function requireUser(request){const session=await getSession(request);if(!session||session.blocked)throw Object.assign(new Error('Forbidden'),{status:403});return session;}
export function isAdmin(session){return session?.is_owner===true}
export function cleanText(value,n){return String(value||'').slice(0,n)}
export function errorResponse(err){return json({ok:false,error:err.message||'Error'},err.status||500)}
`;
const u='data:text/javascript;base64,'+Buffer.from(mock).toString('base64');
assert.ok(code.includes('from "../_community.js"'),'Expected import of community helpers');
const js=code.replace('from "../_community.js"','from '+JSON.stringify(u));
const media=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

const key=(tail)=>'author/post/'+tail+'.jpg';
const A=key('first-img'),B=key('second-img'),O=key('official'),C=key('chat'),H=key('hidden');
const data={
 posts:[
  {status:'published',kind:'community',attachments:JSON.stringify([{key:A,type:'image/jpeg'},{key:B,type:'image/jpeg'}])},
  {status:'published',kind:'official',attachments:JSON.stringify([{key:O,type:'image/jpeg'}])},
  {status:'hidden',kind:'community',attachments:JSON.stringify([{key:H,type:'image/jpeg'}])},
  {status:'published',kind:'official',attachments:JSON.stringify([{key:key('large-name-prefix'),type:'image/jpeg'}])},
 ],
 chat:[{status:'published',attachments:JSON.stringify([{path:C,type:'image/jpeg'}])}],
 avatars:[],
 mime:'image/jpeg',
 r2Reads:0,
 uploads:[],
};
function mockDb(){
 return {prepare(sql){if(sql.includes('FROM community_posts'))assert.match(sql,/SELECT\s+attachments,\s*kind\s+FROM community_posts/);if(sql.includes('FROM community_chat_messages'))assert.match(sql,/SELECT\s+attachments\s+FROM community_chat_messages/);return {bind(...params){const needle=params[0];return {
  async all(){let source=sql.includes('FROM community_posts')?data.posts:sql.includes('FROM community_chat_messages')?data.chat:[];return {results:source.filter(row=>row.status==='published'&&row.attachments.includes(needle)).slice(0,60)}},
  async first(){if(sql.includes('community_profiles'))return data.avatars.includes(needle)?{one:1}:null;return null},
 }}}}};
}
const env={COMMUNITY_DB:mockDb(),COMMUNITY_MEDIA:{
 async get(p){data.r2Reads++;return {body:new Blob(['fake image']).stream(),httpMetadata:{contentType:data.mime},httpEtag:'etag',writeHttpMetadata(headers){headers.set('content-type',data.mime);headers.set('cache-control','public, max-age=31536000');headers.set('etag','etag')}}},
 async put(k,body,meta){data.uploads.push({key:k,meta})},
 async delete(k){data.deleted=k}
}};
async function requestImage(fileKey,role='guest'){
 const request=new Request('https://aio-iptv-projekt.pages.dev/api/community-media?key='+encodeURIComponent(fileKey),{headers:{'x-test-user':role}});
 return media.onRequestGet({request,env});
}
let n=0;
async function check(label,callback){await callback();n++;console.log('OK '+n+': '+label)}
await check('First published community image is public; private no-store + no sniff',async()=>{
 const r=await requestImage(A);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('etag'),null);
});
await check('Second community image denied to guests before any R2 read',async()=>{
 const reads=data.r2Reads;assert.equal((await requestImage(B)).status,401);assert.equal(data.r2Reads,reads);
});
await check('Second image visible to logged-in member',async()=>{assert.equal((await requestImage(B,'member')).status,200)});
await check('Published official image remains public',async()=>{assert.equal((await requestImage(O)).status,200)});
await check('Image of hidden post denied to guests and nonowner members',async()=>{
 assert.equal((await requestImage(H)).status,401);assert.equal((await requestImage(H,'member')).status,403);
});
await check('Exact matching defeats substring-match authorization',async()=>{
 assert.equal((await requestImage(key('large-name'),'guest')).status,401);
 assert.equal((await requestImage(key('large-name'),'member')).status,403);
});
await check('Revocation after hide is effective on next request',async()=>{
 const first=data.posts[0];first.status='hidden';
 assert.equal((await requestImage(A,'guest')).status,401);
 assert.equal((await requestImage(A,'member')).status,403);
 first.status='published';
});
await check('Unpublished author upload remains readable by owner, not others',async()=>{
 const draft=key('draft');assert.equal((await requestImage(draft,'author')).status,200);assert.equal((await requestImage(draft,'member')).status,403);
});
await check('Blocked users denied',async()=>{assert.equal((await requestImage(A,'blocked')).status,403)});
await check('Published chat media accessible to members, not guests',async()=>{
 assert.equal((await requestImage(C,'member')).status,200);
 assert.equal((await requestImage(C,'guest')).status,401);
});
await check('Avatar exact-key access for members',async()=>{
 const avatar='author/avatar/profile.jpg';data.avatars.push(avatar);
 assert.equal((await requestImage(avatar,'member')).status,200);
 assert.equal((await requestImage(avatar+'.other','member')).status,403);
});
await check('Unsupported active-document MIME refused, even with .jpg extension',async()=>{
 data.mime='text/html';assert.equal((await requestImage(A)).status,415);data.mime='image/jpeg';
});
await check('Missing MIME with safe extension works',async()=>{
 data.mime='';assert.equal((await requestImage(A)).status,200);data.mime='image/jpeg';
});
await check('Cross-origin writes remain blocked',async()=>{
 const r=await media.onRequestPost({request:new Request('https://aio-iptv-projekt.pages.dev/api/community-media',{method:'POST',headers:{origin:'https://evil.example'}}),env});assert.equal(r.status,403);
});
await check('Uploads keep user-owned R2 keys and no-store metadata',async()=>{
 const f=new File(['abc'],'one.jpg',{type:'image/jpeg'});const form=new FormData();form.append('file',f);form.append('kind','post');
 const r=await media.onRequestPost({request:new Request('https://aio-iptv-projekt.pages.dev/api/community-media',{method:'POST',headers:{'x-test-user':'author'},body:form}),env});
 assert.equal(r.status,201);assert.ok(data.uploads.at(-1).key.startsWith('author/post/'));assert.match(data.uploads.at(-1).meta.httpMetadata.cacheControl,/no-store/);
});
await check('Uploads reject SVG/HTML',async()=>{
 const form=new FormData();form.append('file',new File(['<svg/>'],'x.svg',{type:'image/svg+xml'}));
 const r=await media.onRequestPost({request:new Request('https://aio-iptv-projekt.pages.dev/api/community-media',{method:'POST',headers:{'x-test-user':'author'},body:form}),env});assert.equal(r.status,400);
});
await check('Guest teaser metadata no-store while official metadata remains cacheable',async()=>{
 assert.ok(meta.includes("row.kind==='official'?'public, max-age=0, must-revalidate':'private, no-store, max-age=0'"));
 assert.ok(meta.includes("row.kind==='official'?'index, follow':'noindex, follow'"));
});
console.log(`AIO MEDIA & SECURITY V2: ${n}/${n} testów bezpieczeństwa: OK.`);
