/* AIO Unified Link Handoff V1 — catalog and verified chat messages.
 * Existing post links stay on /api/aio-post-link, with the SAME consumeFree
 * admission gate. Local /pliki/ delivery is always charged by the file server,
 * never by this endpoint. External handoffs are not proof of file delivery.
 */
import {json,sha256} from '../_community.js';
import {initAccess,sessionUser,getStatus,consumeFree} from '../_aio_account_access.js';
import {activeSharedHold,logSecurity,reviewPaidSessionSharing} from '../_aio_security_journal.js';
import {monitorDownload} from '../_aio_security_v6.js';
import {checkAnonymousFileBurst} from '../_aio_anon_shield_v1.js';
import {linksInPost,normalizePostLink,classifyPostLink,externalFileKey,safePostFileName} from '../_aio_post_links_v5.js';
import {prepareExternal} from '../_aio_external_speed_v1.js';
import {paidFileDenied} from '../_aio_post_links_v5.js';
import {isOfficialAioPanelIpkUrl,PUBLIC_IPK_PATH} from '../_aio_panel_public_v1.js';

const EXTRA={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const reply=(data,status=200)=>json(data,status,EXTRA);
function sameOrigin(req){const origin=req.headers.get('Origin');return (!origin||origin===new URL(req.url).origin)&&req.headers.get('Sec-Fetch-Site')!=='cross-site';}
async function event(env,source,sourceId,userId,kind,url,reason=''){
  // Telemetry must not block or debit a user. Do not save raw IP or URL.
  try{
    await env.COMMUNITY_DB.prepare(`INSERT INTO aio_link_events_v1
      (id,user_id,source,source_id,event,host,file_name,reason,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).bind(
        crypto.randomUUID(),userId||null,source,sourceId||'',kind,
        url.hostname.toLowerCase().slice(0,160),safePostFileName(url.href),
        String(reason||'').slice(0,28),new Date().toISOString()).run();
    if(Math.random()<0.02)await env.COMMUNITY_DB.prepare('DELETE FROM aio_link_events_v1 WHERE created_at<?')
      .bind(new Date(Date.now()-90*86400000).toISOString()).run().catch(()=>{});
  }catch(e){console.error('[AIO link click telemetry]',String(e?.message||e).slice(0,120));}
}
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return reply({ok:false,error:'Niedozwolone źródło żądania.'},403);
  if(!(request.headers.get('content-type')||'').toLowerCase().includes('application/json'))return reply({ok:false,error:'Wymagany JSON.'},415);
  try{
    const body=await request.json().catch(()=>({}));
    const source=String(body.source||'');
    if(!['catalog','chat'].includes(source))return reply({ok:false,error:'Nieprawidłowe źródło linku.'},400);
    const messageId=String(body.message_id||'');
    const clicked=normalizePostLink(body.href);
    if(!clicked)return reply({ok:false,error:'Nieprawidłowy adres URL.'},400);
    await initAccess(env);
    const user=await sessionUser(request,env);
    if(source==='chat'){
      if(!user)return reply({ok:false,login_required:true,error:'Zaloguj się, aby otworzyć link z czatu.'},401);
      if(messageId.length<8||messageId.length>100)return reply({ok:false,error:'Nieprawidłowa wiadomość.'},400);
      const msg=await env.COMMUNITY_DB.prepare(`SELECT content FROM community_chat_messages
        WHERE id=? AND status='published' LIMIT 1`).bind(messageId).first();
      if(!msg || !linksInPost(msg.content).includes(clicked.href))
        return reply({ok:false,error:'Link nie występuje w aktualnej wiadomości.'},403);
    }
    const site=new URL(request.url).origin;
    if(isOfficialAioPanelIpkUrl(clicked.href,site)){
      await event(env,source,messageId,null,'click',clicked,'public_panel');
      return reply({ok:true,kind:'public',href:PUBLIC_IPK_PATH,counted:false});
    }
    const classified=classifyPostLink(clicked.href,site);
    if(classified.kind==='invalid')return reply({ok:false,error:'Nieprawidłowy adres URL.'},400);
    // Catalog actions originate from download-labelled buttons: an external
    // handoff still counts if the provider URL has no recognizable extension.
    let kind=classified.kind;
    if(source==='catalog' && clicked.origin!==site && kind==='info')kind='external';
    // Do not create an authenticated redirect to arbitrary internal endpoints.
    if(clicked.origin===site && kind==='info'){
      await event(env,source,messageId,user?.id||null,'click',clicked,'info');
      return reply({ok:true,kind:'info',href:clicked.href,counted:false});
    }
    await event(env,source,messageId,user?.id||null,'click',clicked,kind);
    if(kind==='info')return reply({ok:true,kind:'info',href:clicked.href,counted:false});
    if(!user){
      const anon=await checkAnonymousFileBurst(env,request);
      if(anon.blocked)return reply({ok:false,restricted:true,error:'Zbyt wiele prób. Spróbuj ponownie później.'},anon.status||429);
      return reply({ok:false,login_required:true,error:'Pobieranie wymaga zalogowania do AIO.'},401);
    }
    const status=await getStatus(env,user.id);
    if(status.email_verified===false)return reply({ok:false,email_verification_required:true,error:'Najpierw potwierdź e-mail.'},403);
    if(status.review_pending && !status.active)return reply({ok:false,restricted:true,error:'Dostęp do pobierania został wstrzymany.'},403);
    if(await activeSharedHold(env,request,user.id))return reply({ok:false,restricted:true,error:'Dostęp do pobierania jest ograniczony.'},403);
    const paid=await reviewPaidSessionSharing(env,request,user.id,status.active===true && status.owner!==true);
    if(paid)return reply({ok:false,restricted:true,error:'Dostęp do pobierania jest ograniczony.'},403);
    if(kind==='local'){
      if(!status.active && Number(status.free_remaining)<=0)
        return reply({ok:false,limit_reached:true,free_resets_at:status.free_resets_at||null,
          error:'Wykorzystano 3 darmowe pobrania. Limit odnawia się miesiąc po trzecim.'},429);
      const local=new URL(classified.url);
      return reply({ok:true,kind:'local',href:local.href,counted:false,accounted_by:'file_server'});
    }
    const burst=await monitorDownload(env,request,user.id);
    if(burst.blocked)return reply({ok:false,restricted:true,error:'Dostęp do pobierania jest ograniczony.'},403);
    const paidOnly=paidFileDenied(clicked.href,status);
    if(paidOnly)return reply(paidOnly,403);
    const managed=await prepareExternal(env,user,status,{source,sourceId:messageId,href:clicked.href});
    if(managed)return reply(managed.data,managed.status);
    const fileKey=await externalFileKey(clicked.href,sha256);
    const permit=await consumeFree(env,user.id,fileKey,request);
    if(!permit.allowed){
      if(permit.reason!=='limit')return reply({ok:false,restricted:true,error:'Dostęp do pobierania jest ograniczony.'},403);
      await logSecurity(env,request,'download_denied',user.id,'Limit: zewnętrzny link '+source);
      return reply({ok:false,limit_reached:true,free_resets_at:permit.free_resets_at||null,
        error:'Wykorzystano 3 darmowe pobrania. Limit odnawia się miesiąc po trzecim.'},429);
    }
    await event(env,source,messageId,user.id,'external_handoff',clicked,permit.reason);
    await logSecurity(env,request,'external_link_handoff',user.id,source);
    return reply({ok:true,kind:'external',href:clicked.href,counted:permit.reason==='free',reason:permit.reason,
      note:'Rozliczono przekazanie linku; pobrania na obcym serwerze nie można potwierdzić.'});
  }catch(e){
    console.error('[AIO Unified Link Handoff]',String(e?.message||e).slice(0,200));
    return reply({ok:false,error:'Nie udało się zweryfikować linku.'},503);
  }
}
export async function onRequestGet(){return reply({ok:false,error:'Wymagany POST.'},405);}
