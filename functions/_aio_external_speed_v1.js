/* External files: no open proxy. Only vetted provider paths or owner-mapped R2 objects. */
import {speedConfig} from './_aio_download_speed_v1.js';
import {r2KeyFromPath,privateStorageEnabled} from './_aio_private_files.js';
import {normalizePostLink,linksInPost,classifyPostLink,isMegawrzutaHost,megawrzutaPaidDenied} from './_aio_post_links_v5.js';
const MAX_BYTES=2*1024**3, TTL=10*60*1000;
const FILE=/\.(?:ipk|apk|exe|msi|zip|7z|rar|deb|rpm|pdf|tar|tgz|gz|xz|img|bin|iso|m3u8?|xml|conf|cfg|backup|sh|py|json|txt|list|tv|radio|bouquet)$/i;
const safeUrl=raw=>{try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port?u:null;}catch{return null;}};
export const unavailable='Tego hostingu nie można bezpiecznie obsłużyć z limitem prędkości FREE. Poproś administratora o kopię AIO lub wybierz dostęp 7D / VIP. Nie naliczono pobrania.';
export async function sourceHash(href){const u=normalizePostLink(href);if(!u)throw Error('Nieprawidłowy link');return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(u.href))),x=>x.toString(16).padStart(2,'0')).join('');}
// Do not scrape landing pages, execute JS, solve CAPTCHA or access password-protected links.
export function directSource(raw){
 const u=safeUrl(raw);if(!u)return null;const p=u.pathname,h=u.hostname;
 if(h==='github.com'&&/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/releases\/download\/[^/]+\/[^/]+$/.test(p)&&FILE.test(p))return {url:u.href,provider:'github'};
 if((h==='www.dropbox.com'||h==='dropbox.com')&&/^\/(?:s\/[^/]+|scl\/fi\/[^/]+)\/[^/]+$/.test(p)&&FILE.test(p)){u.searchParams.delete('raw');u.searchParams.set('dl','1');return {url:u.href,provider:'dropbox'};}
 if((h==='megawrzuta.pl'||h==='www.megawrzuta.pl')&&/^\/download\/[a-f0-9]{32}\.html$/i.test(p))return {url:u.href,provider:'megawrzuta'};
 // Premium share URLs can redirect directly to MediaFire's download host. No scraping.
 const mf=/^\/file_premium\/[a-z0-9]{10,40}\/([^/]+)\/file\/?$/i.exec(p);
 if((h==='www.mediafire.com'||h==='mediafire.com')&&mf&&FILE.test(mf[1])&&!/%(?:2f|5c|00)/i.test(mf[1]))return {url:u.href,provider:'mediafire'};
 if(/^download[0-9]+\.mediafire\.com$/.test(h)&&FILE.test(p)&&p.split('/').filter(Boolean).length>=3)return {url:u.href,provider:'mediafire'};
 if(h==='pixeldrain.com'&&/^\/(?:u|api\/file)\/[A-Za-z0-9_-]{5,80}$/.test(p)){u.pathname='/api/file/'+p.split('/').pop();u.search='?download';u.hash='';return {url:u.href,provider:'pixeldrain'};}
 return null;
}
function permittedHop(raw,provider){const u=safeUrl(raw);if(!u)return false;
 const h=u.hostname,p=u.pathname, d=directSource(u.href);
 if(d?.provider===provider)return true;
 if(provider==='github'&&['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(h)&&/^\/github-production-release-asset-[a-f0-9]+\//.test(p))return true;
 // Dropbox's documented redirect family; no arbitrary subdomains or generic redirect URLs.
 if(provider==='dropbox'&&((['dl.dropboxusercontent.com','dl.dropbox.com'].includes(h)&&/^\/(?:s\/|scl\/fi\/)/.test(p))||((h==='www.dropbox.com'||h==='dropbox.com')&&/^\/(?:s\/dl\/|scl\/fi\/)/.test(p))))return true;
 return false;
}
export function validMapPath(path){return typeof path==='string'&&path.startsWith('/pliki/')&&!/[?#%\\\x00-\x1f\x7f]/.test(path)&&!!r2KeyFromPath(path)&&FILE.test(path)&&!/^\/pliki\/enigma2-plugin-extensions-panelaio_.*_all\.ipk$/i.test(path);}
export async function mappedPath(env,href){
 const row=await env.COMMUNITY_DB.prepare('SELECT r2_path FROM aio_external_speed_maps_v1 WHERE source_hash=?').bind(await sourceHash(href)).first();
 if(!row)return null;
 if(!validMapPath(row.r2_path)||!privateStorageEnabled(env)||!await env.AIO_PRIVATE_FILES?.head(r2KeyFromPath(row.r2_path)))return null;
 return row.r2_path;
}
export async function createTicket(env,userId,{source,sourceId='',commentId='',href},now=Date.now()){
 const db=env.COMMUNITY_DB,token=crypto.randomUUID();
 await db.prepare('DELETE FROM aio_external_speed_tickets_v1 WHERE expires_ms<=?').bind(now).run();
 // Bound outstanding tickets per account; issuing a new ticket never consumes a download.
 const row=await db.prepare(`INSERT INTO aio_external_speed_tickets_v1(token,user_id,source,source_id,comment_id,href,expires_ms)
 SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM aio_external_speed_tickets_v1 WHERE user_id=? AND expires_ms>?)<20 RETURNING token`).bind(token,userId,source,sourceId,commentId,href,now+TTL,userId,now).first();
 return row?.token||null;
}
export async function externalPolicy(env){
 const row=await env.COMMUNITY_DB.prepare('SELECT enabled FROM aio_external_speed_policy_v1 WHERE id=1').first();
 return row?.enabled===1;
}
export async function prepareExternal(env,user,status,{source,sourceId='',commentId='',href}){
 // Independent entitlement rule: never expose a raw URL or mapped R2 path to FREE.
 if(isMegawrzutaHost(href)){
  const denied=megawrzutaPaidDenied(href,status);if(denied)return {status:403,data:denied};
  const token=await createTicket(env,user.id,{source,sourceId,commentId,href});
  if(!token)return {status:429,data:{ok:false,error:'Za dużo oczekujących pobrań. Spróbuj ponownie za kilka minut.'}};
  return {status:200,data:{ok:true,kind:'managed_external',href:'/api/aio-external-download?t='+token,counted:false}};
 }
 const global=await speedConfig(env);
 if(!global.enabled||!await externalPolicy(env))return null; // original handoff until separately enabled
 if(!status.active&&!(Number(status.free_remaining)>0))return {status:429,data:{ok:false,limit_reached:true,free_resets_at:status.free_resets_at||null,error:'Wykorzystano limit darmowych pobrań.'}};
 const mapped=await mappedPath(env,href);
 // Reuse ordinary R2 delivery and its Range, quota, shared lease and audit controls.
 if(mapped){const suffix=source==='post'?'?aio_post='+encodeURIComponent(sourceId)+(commentId?'&aio_comment='+encodeURIComponent(commentId):'')+'&aio_map='+await sourceHash(href):'';
  return {status:200,data:{ok:true,kind:'local',href:mapped.split('/').map(encodeURIComponent).join('/')+suffix,counted:false,accounted_by:'file_server',mapped_external:true}};}
 if(!status.active&&!directSource(href))return {status:409,data:{ok:false,external_unavailable:true,error:unavailable,support_url:'/support.html#wesprzyj-projekt'}};
 const token=await createTicket(env,user.id,{source,sourceId,commentId,href});
 if(!token)return {status:429,data:{ok:false,error:'Za dużo oczekujących pobrań. Spróbuj ponownie za kilka minut.'}};
 return {status:200,data:{ok:true,kind:'managed_external',href:'/api/aio-external-download?t='+token,counted:false}};
}
export async function readTicket(env,token,userId,now=Date.now()){
 return env.COMMUNITY_DB.prepare('SELECT * FROM aio_external_speed_tickets_v1 WHERE token=? AND user_id=? AND expires_ms>?').bind(token,userId,now).first();
}
export async function takeTicket(env,token,userId,now=Date.now()){
 return env.COMMUNITY_DB.prepare('DELETE FROM aio_external_speed_tickets_v1 WHERE token=? AND user_id=? AND expires_ms>? RETURNING token').bind(token,userId,now).first();
}
export async function verifyTicketSource(env,ticket,origin){
 const href=normalizePostLink(ticket.href);if(!href)return false;
 if(ticket.source==='catalog')return href.origin!==origin||classifyPostLink(href.href,origin).kind==='external'; // matches existing catalog handoff, restricted by provider allowlist for FREE.
 if(classifyPostLink(href.href,origin).kind!=='external')return false;
 const db=env.COMMUNITY_DB;
 if(ticket.source==='chat'){
  const row=await db.prepare("SELECT content FROM community_chat_messages WHERE id=? AND status='published'").bind(ticket.source_id).first();return !!row&&linksInPost(row.content).includes(href.href);
 }
 if(ticket.source!=='post')return false;
 const post=await db.prepare("SELECT content FROM community_posts WHERE id=? AND status='published'").bind(ticket.source_id).first();if(!post)return false;
 if(!ticket.comment_id)return linksInPost(post.content).includes(href.href);
 const comment=await db.prepare("SELECT content FROM community_comments WHERE id=? AND post_id=? AND status='published'").bind(ticket.comment_id,ticket.source_id).first();
 return !!comment&&linksInPost(comment.content).includes(href.href);
}
const cancel=async r=>{try{await r?.body?.cancel();}catch{}};
function filename(raw,disposition){let n='plik.bin';const star=/filename\*=UTF-8''([^;]+)/i.exec(disposition),regular=/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i.exec(disposition);
 try{n=star?decodeURIComponent(star[1]):regular?(regular[1]||regular[2]):decodeURIComponent((new URL(raw).pathname.match(/^\/file_premium\/[a-z0-9]{10,40}\/([^/]+)\/file\/?$/i)?.[1]||new URL(raw).pathname.split('/').pop()||n));}catch{}
 n=n.replace(/[\\/\x00-\x1f\x7f<>:"|?*]/g,'_').trim().slice(0,160);return n||'plik.bin';}
function boundedBody(body,size){let read=0;return body.pipeThrough(new TransformStream({transform(chunk,c){read+=chunk.byteLength;if(read>size)throw Error('External size exceeded');c.enqueue(chunk);},flush(){if(read!==size)throw Error('Incomplete external transfer');}}));}
// Only fixed codes leave this helper. Never expose upstream URLs, cookies, or response text.
function externalError(code,message){return Object.assign(new Error(message),{aioExternalCode:code});}
export async function fetchExternalFile(raw,fetcher=fetch){
 const first=directSource(raw);if(!first)throw externalError('UNSUPPORTED_PROVIDER','Unsupported provider');let url=first.url,r;
 for(let i=0;i<5;i++){
  if(!permittedHop(url,first.provider))throw externalError('REDIRECT_REJECTED','Unsafe redirect');
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
  try{r=await fetcher(url,{method:'GET',redirect:'manual',headers:{'Accept-Encoding':'identity','Accept':'*/*'},signal:abort.signal,cf:{cacheTtl:0,cacheEverything:false}});}catch(e){throw externalError(abort.signal.aborted?'FETCH_TIMEOUT':'FETCH_ERROR','Upstream fetch failed');}finally{clearTimeout(timer);}
  if([301,302,303,307,308].includes(r.status)){const loc=r.headers.get('Location');await cancel(r);if(!loc||i===4)throw externalError('REDIRECT_INVALID','Invalid redirect');try{url=new URL(loc,url).href;}catch{throw externalError('REDIRECT_INVALID','Invalid redirect');}continue;}
  break;
 }
 const type=(r?.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase(),disp=r?.headers.get('Content-Disposition')||'',encoding=r?.headers.get('Content-Encoding'),length=r?.headers.get('Content-Length'),size=Number(length);
 let rejection=null;
 if(r?.status!==200)rejection='HTTP_'+(Number.isInteger(r?.status)?r.status:0);
 else if(!r.body)rejection='BODY_MISSING';
 else if(/^(?:text\/html|application\/xhtml\+xml|image\/svg\+xml)$/.test(type))rejection='HTML_OR_SVG';
 else if(!length)rejection='LENGTH_MISSING';
 else if(!Number.isSafeInteger(size)||size<=0)rejection='LENGTH_INVALID';
 else if(size>MAX_BYTES)rejection='SIZE_LIMIT';
 else if(encoding&&encoding.toLowerCase()!=='identity')rejection='ENCODING_REJECTED';
 else if(!type)rejection='TYPE_MISSING';
 else if(!/^attachment\b/i.test(disp)&&!FILE.test(new URL(first.url).pathname)&&!/^application\/(?:octet-stream|zip|x-7z-compressed|x-rar-compressed|pdf)$/.test(type))rejection='TYPE_REJECTED';
 if(rejection){await cancel(r);throw externalError(rejection,'Upstream did not return a supported file');}
 const name=filename(first.url,disp);
 // Never forward cookies, HTML, redirects, upstream CORS or security headers.
 return new Response(boundedBody(r.body,size),{status:200,headers:{'Content-Type':'application/octet-stream','Content-Length':String(size),'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Referrer-Policy':'no-referrer','Accept-Ranges':'none'}});
}
