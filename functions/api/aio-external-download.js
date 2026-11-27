/* One-use, session-bound download ticket. No GET to arbitrary supplied URLs. */
import {sha256} from '../_community.js';
import {initAccess,sessionUser,getStatus,consumeFree} from '../_aio_account_access.js';
import {coreAdmitDownload} from '../_aio_security_core_v1.js';
import {reviewPaidSessionSharing,logSecurity} from '../_aio_security_journal.js';
import {monitorDownload} from '../_aio_security_v6.js';
import {speedConfig,claimSpeedLease,speedBusy,speedResponse} from '../_aio_download_speed_v1.js';
import {externalFileKey,ensurePostLinkSchema,safePostFileName,isMegawrzutaHost,megawrzutaPaidMessage} from '../_aio_post_links_v5.js';
import {readTicket,takeTicket,verifyTicketSource,directSource,fetchExternalFile,unavailable,externalPolicy} from '../_aio_external_speed_v1.js';
const headers={'Cache-Control':'private, no-store','Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const fail=(msg,status=403)=>new Response(msg,{status,headers});
const denied=p=>fail(p.reason==='limit'?'Wykorzystano limit darmowych pobrań.': 'Dostęp do pobierania jest obecnie ograniczony.',p.reason==='limit'?429:403);
async function record(env,uid,t,reason){
 // Historical accounting retains the same table as original post link handoffs.
 try{
  const u=new URL(t.href),db=env.COMMUNITY_DB;
  if(t.source==='post'){
   await ensurePostLinkSchema(env);
   await db.prepare(`INSERT INTO aio_post_link_handoffs(id,user_id,post_id,host,file_name,reason,created_at,kind) VALUES(?,?,?,?,?,?,?,'external')`).bind(crypto.randomUUID(),uid,t.source_id,u.hostname.slice(0,160),safePostFileName(t.href),reason,new Date().toISOString()).run();
   await db.prepare('DELETE FROM aio_post_link_handoffs WHERE created_at<?').bind(new Date(Date.now()-90*86400000).toISOString()).run();
  }else await db.prepare(`INSERT INTO aio_link_events_v1(id,user_id,source,source_id,event,host,file_name,reason,created_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),uid,t.source,t.source_id,'external_handoff',u.hostname.slice(0,160),safePostFileName(t.href),reason,new Date().toISOString()).run();
 }catch(e){console.error('[AIO external audit]',String(e?.message||e).slice(0,100));}
}
export async function onRequestGet(context){
 const {request,env}=context;let lease=null,asset=null,handedOff=false;
 try{
  if(request.headers.get('Sec-Fetch-Site')==='cross-site'||/prefetch|prerender/i.test((request.headers.get('Sec-Purpose')||'')+' '+(request.headers.get('Purpose')||'')))return fail('Niedozwolone żądanie.');
  if(request.headers.has('Range'))return fail('Ten transfer nie obsługuje wznawiania. Otwórz ponownie link w poście.',416);
  const url=new URL(request.url),token=url.searchParams.get('t')||'';
  if(!/^[a-f0-9-]{36}$/i.test(token))return fail('Nieprawidłowy bilet pobrania.',400);
  await initAccess(env);const user=await sessionUser(request,env);if(!user)return fail('Zaloguj się do AIO.',401);
  const t=await readTicket(env,token,user.id);if(!t)return fail('Bilet wygasł lub został użyty. Otwórz ponownie link w poście.',410);
  if(!await verifyTicketSource(env,t,url.origin))return fail('Link nie jest już dostępny w opublikowanej treści.');
  const state=await getStatus(env,user.id),premiumOnly=isMegawrzutaHost(t.href);
  if(premiumOnly && state.active!==true)return fail(megawrzutaPaidMessage,403);
  const admission=await coreAdmitDownload(env,request,user.id,state);if(!admission.allowed)return denied(admission);
  if(await reviewPaidSessionSharing(env,request,user.id,state.active===true&&state.owner!==true))return fail('Dostęp do pobierania jest ograniczony.');
  const burst=await monitorDownload(env,request,user.id);if(burst.blocked)return fail('Dostęp do pobierania jest ograniczony.');
  const config=await speedConfig(env,user.id);
  const enforce=config.enabled&&await externalPolicy(env);
  if(enforce&&!state.active&&!directSource(t.href))return fail(unavailable,409);
  // Atomic ticket claim before any upstream request. A retry must get a fresh ticket.
  if(!await takeTicket(env,token,user.id))return fail('Bilet został już użyty.',410);
  const fileKey=await externalFileKey(t.href,sha256);
  // Active paid accounts continue using the source; disabled global limiter preserves direct handoff.
  if(state.active||!enforce){
    // Fresh decision before redirect. Paid authorization does not debit a FREE counter.
    const fresh=await getStatus(env,user.id);
    if(premiumOnly && fresh.active!==true)return fail(megawrzutaPaidMessage,403);
    const freshAdmission=await coreAdmitDownload(env,request,user.id,fresh);
    if(!freshAdmission.allowed)return denied(freshAdmission);
    const latest=await speedConfig(env,user.id);
    if(fresh.active){
      if(await reviewPaidSessionSharing(env,request,user.id,fresh.owner!==true))return fail('Dostęp do pobierania jest ograniczony.');
      const reason=fresh.owner?'owner':fresh.vip?'vip':'grant';await record(env,user.id,t,reason);
      await logSecurity(env,request,'external_link_handoff',user.id,'Zewnętrzne źródło – dostęp aktywny').catch(()=>{});
      return new Response(null,{status:302,headers:{'Location':t.href,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
    }
    if(!latest.enabled||!await externalPolicy(env)){const permit=await consumeFree(env,user.id,fileKey,request);if(!permit.allowed)return denied(permit);
      if(permit.reason==='free'&&(await speedConfig(env)).enabled&&await externalPolicy(env))return fail('Ustawienia zmieniły się podczas pobierania. Otwórz ponownie link.',409);
      await record(env,user.id,t,permit.reason);return new Response(null,{status:302,headers:{Location:t.href,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}
    // If paid access expired or the limiter was enabled, never fall back to a raw URL.
    return fail('Uprawnienia lub ustawienia zmieniły się. Otwórz ponownie link, aby zastosować aktualną prędkość.',409);
  }
  lease=await claimSpeedLease(env,user.id);if(!lease)return speedBusy();
  try{asset=await fetchExternalFile(t.href);}catch(e){console.error('[AIO external source] upstream rejected');return fail('Źródło nie udostępniło pliku do kontrolowanego transferu. Nie naliczono pobrania. Poproś o kopię AIO lub skorzystaj z 7D / VIP.',502);}
  // No charge for missing file, bad response or busy shared lease.
  const permit=await consumeFree(env,user.id,fileKey,request);if(!permit.allowed)return denied(permit);
  const free=permit.reason==='free';let delivered=asset;
  // Use configuration captured at start of actual GET, just as local transfer snapshots.
  if(free&&enforce){delivered=speedResponse(asset,config,lease,context);}
  else{await lease.release();lease=null;}
  await record(env,user.id,t,permit.reason);
  await logSecurity(env,request,'external_link_handoff',user.id,'Kontrolowany transfer AIO').catch(()=>{});
  handedOff=true;return delivered;
 }catch(e){console.error('[AIO external download]',String(e?.message||e).slice(0,120));return fail('Nie udało się przygotować pobierania. Spróbuj ponownie.',503);}
 finally{if(!handedOff){try{await asset?.body?.cancel();}catch{}try{await lease?.release();}catch{}}}
}
export const onRequestHead=()=>fail('Wymagane pobieranie GET.',405);
export const onRequest=context=>context.request.method==='GET'?onRequestGet(context):fail('Wymagane pobieranie GET.',405);
