#!/usr/bin/env node
/* AIO Post Links V2 — isolated regression tests (no production network/D1/R2 calls). */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(process.argv[2]||'.');
const src=(path)=>readFileSync(resolve(root,path),'utf8');
const moduleUrl=(js)=>'data:text/javascript;base64,'+Buffer.from(js).toString('base64');
const linksUrl=moduleUrl(src('functions/_aio_post_links_v5.js'));
const links=await import(linksUrl);
const ORIGIN='https://aio-iptv-projekt.pages.dev';
let count=0;
async function check(name,fn){await fn();console.log('OK '+(++count)+': '+name)}

await check('Megawrzuta: short file share is a metered external handoff',()=>{
 assert.equal(links.classifyPostLink('https://megawrzuta.pl/pi4s7axl',ORIGIN).kind,'external');
 assert.equal(links.classifyPostLink('https://www.megawrzuta.pl/mg3hctne',ORIGIN).kind,'external');
});
await check('Known share routes without extensions are file handoffs',()=>{
 const good=['https://www.mediafire.com/file/abcdefghijkl/plugin',
 'https://www.mediafire.com/file_premium/gm7x6ndj0q2rpwm/backup',
 'https://mega.nz/file/ABCDEFGH#key','https://gofile.io/d/abcdEFGH',
 'https://pixeldrain.com/u/abcde123','https://krakenfiles.com/view/abcde123/file.html',
 'https://www.dropbox.com/s/abcdefghi/plik',
 'https://www.dropbox.com/scl/fi/abcde123/plik?dl=0',
 'https://drive.google.com/file/d/abcde123456/view',
 'https://drive.google.com/uc?id=abcde123456',
 'https://we.tl/t-abcdef123','https://1fichier.com/?abcdef123'];
 for(const url of good) assert.equal(links.classifyPostLink(url,ORIGIN).kind,'external',url);
});
await check('Provider landing pages and spoofed hosts never become file shares',()=>{
 const info=['https://megawrzuta.pl/','https://megawrzuta.pl/info','https://megawrzuta.pl/regulamin',
 'https://evil-megawrzuta.pl/pi4s7axl','https://megawrzuta.pl.evil.example/pi4s7axl',
 'https://www.mediafire.com/','https://www.mediafire.com/about',
 'https://mega.nz/','https://mega.nz/blog','https://drive.google.com/drive/u/0/my-drive',
 'https://www.dropbox.com/home','https://megawrzuta.pl/i.jpg'];
 for(const url of info) assert.equal(links.classifyPostLink(url,ORIGIN).kind,'info',url);
});
await check('Existing local and explicit-file behavior preserved',()=>{
 assert.equal(links.classifyPostLink(ORIGIN+'/pliki/plik.ipk',ORIGIN).kind,'local');
 assert.equal(links.classifyPostLink('https://external.example/download/a.zip',ORIGIN).kind,'external');
 assert.equal(links.classifyPostLink('https://github.com/example/repository',ORIGIN).kind,'info');
 assert.equal(links.classifyPostLink('javascript:alert(1)',ORIGIN).kind,'invalid');
});
await check('Share URL normalization still validates against exact published text',()=>{
 const url='https://megawrzuta.pl/pi4s7axl';
 assert.ok(links.linksInPost('Oto plik: '+url+'.').includes(url));
 assert.ok(!links.linksInPost('Oto plik: https://megawrzuta.pl/other').includes(url));
});

// Test actual API dispatch with mocked account and D1 modules. No remote calls.
const events={clicks:[],handoffs:[],debits:0};
const postId='post-123456789';const commentId='comment-12345678';
const file=ORIGIN+'/pliki/example.zip';
let post={id:postId,content:'Link '+file+'\nhttps://megawrzuta.pl/pi4s7axl',kind:'community',status:'published'};
let comment={content:'Plik komentarza: '+file};
const env={COMMUNITY_DB:{
 async batch(){return [];},
 prepare(sql){return {
   bind(...args){return {
     async first(){
       if(sql.includes('FROM community_posts'))return args[0]===postId?post:null;
       if(sql.includes('FROM community_comments'))return args[0]===commentId&&args[1]===postId?comment:null;
       return null;
     },
     async run(){if(sql.includes('INSERT INTO aio_post_link_handoffs'))events.handoffs.push(args);return {meta:{changes:1}};},
     async all(){return {results:[]}}
   }}
 }}
}};
const stub=moduleUrl(`
export function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})}
export async function ensureSchema(){}
export async function sha256(s){return String(s).slice(0,30)}
export async function initAccess(){}
export async function sessionUser(request){return request.headers.get('x-test-user')==='member'?{id:'user-123'}:null}
export async function getStatus(){return {email_verified:true,active:false,owner:false}}
export async function consumeFree(){globalThis.__aio_tests.debits++;return {allowed:true,reason:'free'}}
export async function activeSharedHold(){return null}
export async function logSecurity(){}
export async function reviewPaidSessionSharing(){return null}
export async function monitorDownload(){return {blocked:false}}
export async function checkAnonymousFileBurst(){return {blocked:false}}
export async function recordPostFileClickV1(env,params){globalThis.__aio_tests.clicks.push(params)}
`);
// Tests only: use a shared in-memory fixture for synthetic quota and audit events.
globalThis.__aio_tests=events;
let apiText=src('functions/api/aio-post-link.js');
for(const path of ['../_community.js','../_aio_account_access.js','../_aio_security_journal.js','../_aio_security_v6.js','../_aio_anon_shield_v1.js','../_aio_post_file_stats_v1.js']){
 const quoted="from '"+path+"'";
 assert.ok(apiText.includes(quoted),path);
 apiText=apiText.replaceAll(quoted,'from '+JSON.stringify(stub));
}
assert.ok(apiText.includes("from '../_aio_post_links_v5.js'"));
apiText=apiText.replace("from '../_aio_post_links_v5.js'",'from '+JSON.stringify(linksUrl));
const api=await import(moduleUrl(apiText));
async function openPostLink(href,{member=true,commentRef=''}={}){
 const request=new Request(ORIGIN+'/api/aio-post-link',{
  method:'POST',headers:{'Content-Type':'application/json','x-test-user':member?'member':'guest',Origin:ORIGIN},
  body:JSON.stringify({post_id:postId,comment_id:commentRef,href})});
 const response=await api.onRequestPost({request,env});
 return {status:response.status,json:await response.json()};
}
await check('Megawrzuta member: exactly one debit, handoff audit and external click',async()=>{
 const r=await openPostLink('https://megawrzuta.pl/pi4s7axl');
 assert.equal(r.status,200);assert.equal(r.json.kind,'external');
 assert.equal(events.debits,1);assert.equal(events.handoffs.length,1);
 assert.equal(events.clicks.at(-1).kind,'external');
});
await check('Megawrzuta guest: login required; no quota debit or handoff',async()=>{
 const r=await openPostLink('https://megawrzuta.pl/pi4s7axl',{member:false});
 assert.equal(r.status,401);assert.equal(r.json.login_required,true);
 assert.equal(events.debits,1);assert.equal(events.handoffs.length,1);
});
await check('Forged link not present in published post: rejected',async()=>{
 const r=await openPostLink('https://megawrzuta.pl/someother');
 assert.equal(r.status,403);assert.equal(events.debits,1);
});
await check('Local comment link: no debit here, includes audit-safe post/comment IDs',async()=>{
 const r=await openPostLink(file,{commentRef:commentId});
 assert.equal(r.status,200);assert.equal(r.json.kind,'local');
 const url=new URL(r.json.href);
 assert.equal(url.searchParams.get('aio_post'),postId);
 assert.equal(url.searchParams.get('aio_comment'),commentId);
 assert.equal(events.debits,1);
});
await check('Editorial links: do not debit quota',async()=>{
 post.content+='\nhttps://megawrzuta.pl/info';
 const r=await openPostLink('https://megawrzuta.pl/info');
 assert.equal(r.json.kind,'info');assert.equal(events.debits,1);
});

// The real issued-file journal must attribute a local GET from a verified comment.
let ownerText=src('functions/_aio_owner_downloads.js');
assert.ok(ownerText.includes("from './_aio_post_links_v5.js'"));
ownerText=ownerText.replace("from './_aio_post_links_v5.js'",'from '+JSON.stringify(linksUrl));
const owner=await import(moduleUrl(ownerText));
const auditEnv={COMMUNITY_DB:{
 async batch(){return []},
 prepare(sql){return {
   bind(...args){return {
     async first(){
       if(sql.includes('FROM community_posts'))return args[0]===postId?post:null;
       if(sql.includes('FROM community_comments'))return args[0]===commentId&&args[1]===postId?comment:null;
       return null;
     },
     async run(){if(sql.includes('INSERT INTO aio_owner_downloads'))events.issued.push(args);return {meta:{changes:1}};}
   }},
   async all(){if(sql.startsWith('PRAGMA'))return {results:[{name:'access_reason'},{name:'source_post_id'}]};return {results:[]}}
 }}
}};
events.issued=[];
async function issue(url){
 const req=new Request(url,{method:'GET'});
 const resp=new Response('test',{status:200,headers:{'Content-Length':'4'}});
 await owner.recordIssuedFile(auditEnv,req,'user-123','account_free',resp,'free');
 return events.issued.at(-1);
}
await check('Verified published comment: local HTTP 200 attributed to correct post',async()=>{
 post.content='This post has no link';
 const row=await issue(file+'?aio_post='+postId+'&aio_comment='+commentId);
 assert.equal(row.at(-1),postId);
});
await check('Unpublished/forged comment: cannot attribute a download to a post',async()=>{
 comment=null;
 const row=await issue(file+'?aio_post='+postId+'&aio_comment='+commentId);
 assert.equal(row.at(-1),'');
});
await check('Published post body link: original attribution still works',async()=>{
 post.content='Link '+file;
 const row=await issue(file+'?aio_post='+postId);
 assert.equal(row.at(-1),postId);
});
console.log(`AIO POST LINKS V2: ${count}/${count} testów OK.`);
