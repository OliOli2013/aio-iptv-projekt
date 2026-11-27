/* AIO Access V4 — lokalne pobieranie wyłącznie po zalogowaniu.
 * Uprawnienia 7D i miesięczny limit od trzeciego pobrania pochodzą z D1, nie z IP ani cookies klienta.
 */
import {initAccess,sessionUser,getStatus,consumeFree} from '../_aio_account_access.js';
import {queueIssuedFileAudit} from '../_aio_owner_downloads.js';
import {activeSharedHold,logSecurity,reviewPaidSessionSharing} from '../_aio_security_journal.js';
import {monitorDownload} from '../_aio_security_v6.js';
import {checkAnonymousFileBurst,anonymousDeniedResponse} from '../_aio_anon_shield_v1.js';
import {recordDistributedAnonymousDenied} from '../_aio_distributed_monitor_v1.js';
import {privateStorageEnabled,readPrivateFile} from '../_aio_private_files.js';
import {isAioPanelIpkAlias,PUBLIC_IPK_PATH} from '../_aio_panel_public_v1.js';
import {speedConfig,shouldThrottle,claimSpeedLease,speedBusy,speedResponse} from '../_aio_download_speed_v1.js'; // AIO_DOWNLOAD_SPEED_V1
import {canResumeRange,authorizeRange} from '../_aio_range_issue_v1.js'; // AIO_PUBLIC_PANEL_V1
const IMG=/\.(?:png|jpe?g|webp|gif|svg|avif)$/i;
const NO_CACHE={'Cache-Control':'private, no-store'};
function accessDenied(message,status=403){
  return new Response(message,{status,headers:{'Content-Type':'text/plain; charset=utf-8',...NO_CACHE}});
}
function redirectToInformation(req,kind){
  const url=new URL(req.url), destination=new URL('/downloads.html',url.origin);
  destination.searchParams.set(kind,'1');
  let filename='plik';
  try{filename=decodeURIComponent(url.pathname.split('/').pop()||'plik').slice(0,100);}
  catch(_){filename='plik';}
  destination.searchParams.set('aio_file',filename);
  return new Response(null,{status:302,headers:{Location:destination.toString(),'Cache-Control':'no-store'}});
}
function protectedFile(req){
  const url=new URL(req.url);
  let path=url.pathname;
  try{path=decodeURIComponent(path);}catch(_){return true;}
  if(!/^\/pliki\//i.test(path))return false;
  return !IMG.test(path); // logo, ikony i inne obrazy są publicznymi zasobami strony
}
async function handle(context){
  const {request,env}=context;
  // AIO_PUBLIC_PANEL_V1: standard AIO Panel IPK (also old /pliki/ aliases)
  // goes to the public counted gateway before any login/quota check. DEB is unchanged.
  if(isAioPanelIpkAlias(new URL(request.url).pathname))
    return new Response(null,{status:302,headers:{Location:PUBLIC_IPK_PATH,'Cache-Control':'private, no-store'}});
  // Optional publisher mirrors for the small legacy allowlist; disabled by default.
  const mirrors = {
    '/pliki/enigma2-plugin-extensions-iptvdream_9.0.0_all.ipk': 'https://github.com/OliOli2013/IPTV-Dream-Plugin/releases/download/9.0.0/enigma2-plugin-extensions-iptvdream_9.0.0_all.ipk',
    '/pliki/enigma2-plugin-extensions-iptvdream_9.0.0_all.deb': 'https://github.com/OliOli2013/IPTV-Dream-Plugin/releases/download/9.0.0/enigma2-plugin-extensions-iptvdream_9.0.0_all.deb',
    '/pliki/enigma2-plugin-extensions-panelaio_17.0.3_all.ipk': 'https://github.com/OliOli2013/PanelAIO-Plugin/releases/download/v17.0.3/enigma2-plugin-extensions-panelaio_17.0.3_all.ipk',
    '/pliki/enigma2-plugin-extensions-panelaio_17.0.3_all.deb': 'https://github.com/OliOli2013/PanelAIO-Plugin/releases/download/v17.0.3/enigma2-plugin-extensions-panelaio_17.0.3_all.deb'
  };
  // Only already-public, owner-approved publisher mirrors may be enabled explicitly.
  const mirror = env.AIO_ALLOW_LEGACY_PUBLIC_MIRRORS==='1' && mirrors[new URL(request.url).pathname];
  if(!protectedFile(request))return context.next();
  let speedLease=null, speedAsset=null, handedOff=false;
  try{
    await initAccess(env);
    const user=await sessionUser(request,env);
    if(!user){
      // Rate-limit only unauthorized /pliki/ requests; never globally ban a shared IP.
      // A DB failure does NOT fall back to handing out the protected file.
      const anon=await checkAnonymousFileBurst(env,request);
      if(anon.blocked)return anonymousDeniedResponse(anon,request.method);
      // Brak "próbnego" pobrania dla gości, także po wejściu bezpośrednio w URL.
      if(request.method==='HEAD')return accessDenied('Pobieranie wymaga zalogowania w AIO.',401);
      // Best-effort distributed telemetry; a write failure never grants the file.
      await recordDistributedAnonymousDenied(env,request)
        .catch(e=>console.error('[AIO distributed monitor]',String(e?.message||e).slice(0,150)));
      await logSecurity(env,request,"download_denied",null,"Bez sesji");
      return redirectToInformation(request,'aio_login');
    }
    // V6: konto właściciela zawsze wyłączone; decyzje tylko po uwierzytelnionym ID konta.
    if(request.method==='GET'){
      const burst=await monitorDownload(env,request,user.id);
      if(burst.blocked)return accessDenied('Dostęp do pobierania jest obecnie ograniczony. Skontaktuj się z nami.',403);
    }
    const hold=(user.is_owner===true&&user.role==='admin')?null:await activeSharedHold(env,request,user.id);
    if(hold){
      if(request.method==='GET'){
        const burst=await monitorDownload(env,request,user.id,{denied:true});
        if(burst.blocked)return accessDenied('Dostęp do pobierania jest obecnie ograniczony. Skontaktuj się z nami.',403);
      }
      if(request.method!=="HEAD")await logSecurity(env,request,"download_hold",user.id);
      return accessDenied('Dostęp do pobierania jest obecnie ograniczony. Skontaktuj się z nami.',403);
    }
    const state=await getStatus(env,user.id);
    if(request.method==='GET' && state.active===true && state.owner!==true){
      const sharing=await reviewPaidSessionSharing(env,request,user.id,true);
      if(sharing){await logSecurity(env,request,'download_hold',user.id,'Płatne konto — współdzielenie');return accessDenied('Dostęp do pobierania jest obecnie ograniczony. Skontaktuj się z nami.',403);}
    }
    if(state.email_verified===false){
      if(request.method==='GET'){
        const burst=await monitorDownload(env,request,user.id,{denied:true});
        if(burst.blocked)return accessDenied('Dostęp do pobierania jest obecnie ograniczony. Skontaktuj się z nami.',403);
      }
      if(request.method!=="HEAD")await logSecurity(env,request,"download_denied",user.id,"E-mail niezweryfikowany");
      if(request.method==='HEAD')return accessDenied('Najpierw potwierdź adres e-mail.',403);
      return redirectToInformation(request,'aio_verify_email');
    }
    const fileKey=new URL(request.url).pathname;
    // AIO_MULTIKONTA_V2 — tylko darmowe pliki; VIP/grant zachowuje uprawnienia.
    if(!state.active&&state.review_pending)return accessDenied('Darmowe pobieranie wstrzymano do weryfikacji konta. Skontaktuj się z administratorem AIO.',403);
    const continuingRange=request.method==='GET' && request.headers.has('Range') &&
      await canResumeRange(env,request,user.id,fileKey);
    if(!state.active && state.free_remaining<=0 && !continuingRange){
      if(request.method==='GET'){
        const burst=await monitorDownload(env,request,user.id,{denied:true});
        if(burst.blocked)return accessDenied('Dostęp do pobierania jest obecnie ograniczony. Skontaktuj się z nami.',403);
      }
      if(request.method==='HEAD')return accessDenied('Limit 3 darmowych pobrań wykorzystany. Odnowienie miesiąc po trzecim pobraniu.',429);
      await logSecurity(env,request,"download_denied",user.id,"Limit pobierania");
      return redirectToInformation(request,'aio_limit');
    }
    // Legacy GitHub mirrors were previously public redirects; do NOT bypass access
    // checks with these file URLs. Charge each GET, including repeat requests.
    // AIO_DOWNLOAD_SPEED_V1: never redirect a throttled FREE request to a mirror.
    let speed=state.active===true?null:await speedConfig(env,user.id);
    if(mirror && !(speed && shouldThrottle(state,speed))){
      // AIO_SECURITY_CORE_V1: HEAD must never disclose the protected external mirror.
      if(request.method==='HEAD')return new Response(null,{status:204,headers:{'Cache-Control':'private, no-store'}});
      const permit=await consumeFree(env,user.id,fileKey,request);
      if(!permit.allowed)return permit.reason==='limit'?redirectToInformation(request,'aio_limit'):accessDenied('Dostęp do pobierania jest obecnie ograniczony.',403);
      await logSecurity(env,request,'download_issued',user.id,permit.reason);
      // If paid access expired during admission, do not hand out an unpaced mirror.
      if(permit.reason==='free' && (speed||await speedConfig(env,user.id)).enabled)return accessDenied('Uprawnienia uległy zmianie. Pobierz plik z magazynu AIO.',503);
      return new Response(null,{status:302,headers:{Location:mirror,'Cache-Control':'no-store'}});
    }
    // Private files never delegate to the static site. Misconfiguration is a service error.
    if(!privateStorageEnabled(env))return accessDenied('Prywatny magazyn plików nie jest jeszcze gotowy.',503);
    const asset=await readPrivateFile(request,env);
    if(request.method==='HEAD')return asset; // HEAD nigdy nie zużywa limitu
    if(asset.status!==200 && asset.status!==206)return asset;
    speedAsset=asset;
    const contentType=String(asset.headers.get('content-type')||'').toLowerCase();
    if(contentType.startsWith('text/html')){
      await asset.body?.cancel().catch(()=>{});return accessDenied('Nieprawidłowy typ pliku w magazynie.',502);
    }
    if(speed && shouldThrottle(state,speed)){
      speedLease=await claimSpeedLease(env,user.id);
      if(!speedLease)return speedBusy(); // before debit; no second ticket on busy
    }
    const permit=asset.status===206
      ?await authorizeRange(env,request,user.id,fileKey,()=>consumeFree(env,user.id,fileKey,request))
      :await consumeFree(env,user.id,fileKey,request);
    // The first HTTP 206 response is one issuance. Further fragments on the
    // same session/file lease do not consume another quota or inflate statistics.
    if(!permit.allowed){
      if(permit.reason==='range_pending')return accessDenied('Pierwszy fragment jest przetwarzany. Ponów pobieranie.',503);
      if(permit.reason==='network')return accessDenied('Ponownie zweryfikuj połączenie sieciowe.',permit.network_status||403);
      return permit.reason==='limit'?redirectToInformation(request,'aio_limit'):accessDenied('Dostęp do pobierania jest obecnie ograniczony.',403);
    }
    // Fresh permit is authoritative; range reuse is classified by the current server status.
    const free=permit.reason==='free'||(permit.range_chunk===true && state.active!==true);
    if(free){
      speed=speed||await speedConfig(env,user.id);
      if(speed.enabled&&!speedLease){
        speedLease=await claimSpeedLease(env,user.id);
        if(!speedLease)return speedBusy(); // rare paid-to-FREE transition after debit
      }
    }else if(speedLease){await speedLease.release();speedLease=null;}
    const headers=new Headers(asset.headers);headers.set('Cache-Control','private, no-store');
    const issued=new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers});
    if(!permit.range_chunk){
      queueIssuedFileAudit(context,user.id,(permit.reason==='grant'||permit.reason==='vip')?'account_7d':'account_free',issued,permit.reason);
      await logSecurity(env,request,"download_issued",user.id,permit.reason);
    }
    const delivered=free&&speed?.enabled?speedResponse(issued,speed,speedLease,context):issued;
    handedOff=true;
    return delivered;
  }catch(error){
    console.error('AIO Access V4 download',error?.message);
    return accessDenied('Nie można zweryfikować dostępu. Spróbuj ponownie za chwilę.',503);
  }finally{
    if(!handedOff){
      try{await speedAsset?.body?.cancel();}catch{}
      try{await speedLease?.release();}catch{}
    }
  }
}
export const onRequestGet=handle;
export const onRequestHead=handle;
export const onRequest=context=>['GET','HEAD'].includes(context.request.method)?handle(context):
  new Response(null,{status:405,headers:{Allow:'GET, HEAD',...NO_CACHE}});
