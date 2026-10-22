/* AIO Access V4 — lokalne pobieranie wyłącznie po zalogowaniu.
 * Uprawnienia 7D i 168-godzinny limit pochodzą z D1, nie z IP ani cookies klienta.
 */
import {initAccess,sessionUser,getStatus,consumeFree,hasActiveFileRetry} from '../_aio_account_access.js';
import {queueIssuedFileAudit} from '../_aio_owner_downloads.js';
import {activeSharedHold,logSecurity,reviewPaidSessionSharing} from '../_aio_security_journal.js';
import {monitorDownload} from '../_aio_security_v6.js';
import {privateStorageEnabled,readPrivateFile} from '../_aio_private_files.js';
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
  if(!protectedFile(request))return context.next();
  try{
    await initAccess(env);
    const user=await sessionUser(request,env);
    if(!user){
      // Brak "próbnego" pobrania dla gości, także po wejściu bezpośrednio w URL.
      if(request.method==='HEAD')return accessDenied('Pobieranie wymaga zalogowania w AIO.',401);
      await logSecurity(env,request,"download_denied",null,"Bez sesji");
      return redirectToInformation(request,'aio_login');
    }
    // V6: konto właściciela zawsze wyłączone; decyzje tylko po uwierzytelnionym ID konta.
    if(request.method==='GET'){
      const burst=await monitorDownload(env,request,user.id);
      if(burst.blocked)return accessDenied('Konto zablokowane przez AIO Security V6. Jeśli to pomyłka, skontaktuj się przez /contact.html.',403);
    }
    const hold=await activeSharedHold(env,request,user.id);
    if(hold){
      if(request.method==='GET'){
        const burst=await monitorDownload(env,request,user.id,{denied:true});
        if(burst.blocked)return accessDenied('Konto zablokowane przez AIO Security V6. Kontakt: /contact.html.',403);
      }
      if(request.method!=="HEAD")await logSecurity(env,request,"download_hold",user.id);
      return accessDenied(hold.message,403);
    }
    const state=await getStatus(env,user.id);
    if(request.method==='GET' && state.active===true && state.owner!==true){
      const sharing=await reviewPaidSessionSharing(env,request,user.id,true);
      if(sharing){await logSecurity(env,request,'download_hold',user.id,'Płatne konto — współdzielenie');return accessDenied(sharing.message,403);}
    }
    if(state.email_verified===false){
      if(request.method==='GET'){
        const burst=await monitorDownload(env,request,user.id,{denied:true});
        if(burst.blocked)return accessDenied('Konto zablokowane przez AIO Security V6. Kontakt: /contact.html.',403);
      }
      if(request.method!=="HEAD")await logSecurity(env,request,"download_denied",user.id,"E-mail niezweryfikowany");
      if(request.method==='HEAD')return accessDenied('Najpierw potwierdź adres e-mail.',403);
      return redirectToInformation(request,'aio_verify_email');
    }
    const fileKey=new URL(request.url).pathname;
    const retry=!state.active && await hasActiveFileRetry(env,user.id,fileKey);
    if(!state.active && state.free_remaining<=0 && !retry){
      if(request.method==='GET'){
        const burst=await monitorDownload(env,request,user.id,{denied:true});
        if(burst.blocked)return accessDenied('Konto zablokowane przez AIO Security V6. Kontakt: /contact.html.',403);
      }
      if(request.method==='HEAD')return accessDenied('Limit 7-dniowy wykorzystany.',429);
      await logSecurity(env,request,"download_denied",user.id,"Limit pobierania");
      return redirectToInformation(request,'aio_limit');
    }
    // Private R2 is the only file source in r2 mode. Missing binding/object fails CLOSED.
    // Legacy mode retains Pages files until R2 uploads have been verified.
    const asset=privateStorageEnabled(env)
      ?await readPrivateFile(request,env)
      :await context.next();
    if(request.method==='HEAD')return asset; // HEAD nigdy nie zużywa limitu
    if(asset.status!==200 && asset.status!==206)return asset;
    const contentType=String(asset.headers.get('content-type')||'').toLowerCase();
    if(contentType.startsWith('text/html'))return asset; // np. fallback strony, nie materiał
    const permit=await consumeFree(env,user.id,fileKey); // atomowe pobranie lub wznowienie
    if(!permit.allowed)return accessDenied('Wykorzystano 3 darmowe pobrania na 7 dni od pierwszego pobrania. Po zatwierdzeniu wsparcia otrzymasz dodatkowy dostęp.',429);
    const headers=new Headers(asset.headers);headers.set('Cache-Control','private, no-store');
    const issued=new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers});
    queueIssuedFileAudit(context,user.id,(permit.reason==='grant'||permit.reason==='vip')?'account_7d':'account_free',issued,permit.reason);
    // Append-only security trail; do not rely on browser telemetry.
    await logSecurity(env,request,"download_issued",user.id,permit.reason);
    return issued;
  }catch(error){
    console.error('AIO Access V4 download',error?.message);
    return accessDenied('Nie można zweryfikować dostępu. Spróbuj ponownie za chwilę.',503);
  }
}
export const onRequestGet=handle;
export const onRequestHead=handle;
