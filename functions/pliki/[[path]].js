/* AIO Access V4 — lokalne pobieranie wyłącznie po zalogowaniu.
 * Uprawnienia 7D i limit dzienny pochodzą z D1, nie z IP ani cookies klienta.
 */
import {initAccess,sessionUser,getStatus,consumeFree,hasActiveFileRetry} from '../_aio_account_access.js';
import {queueIssuedFileAudit} from '../_aio_owner_downloads.js';
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
      return redirectToInformation(request,'aio_login');
    }
    const state=await getStatus(env,user.id);
    const fileKey=new URL(request.url).pathname;
    const retry=!state.active && await hasActiveFileRetry(env,user.id,fileKey);
    if(!state.active && state.free_remaining<=0 && !retry){
      if(request.method==='HEAD')return accessDenied('Dzienny limit wykorzystany.',429);
      return redirectToInformation(request,'aio_limit');
    }
    if(request.method==='HEAD')return context.next(); // HEAD nigdy nie zużywa limitu
    // Najpierw sprawdź plik; 404/5xx nie może zużyć bezpłatnego pobrania.
    const asset=await context.next();
    if(asset.status!==200 && asset.status!==206)return asset;
    const contentType=String(asset.headers.get('content-type')||'').toLowerCase();
    if(contentType.startsWith('text/html'))return asset; // np. fallback strony, nie materiał
    const permit=await consumeFree(env,user.id,fileKey); // atomowe pobranie lub wznowienie
    if(!permit.allowed)return accessDenied('Limit pobierania wykorzystany. Po potwierdzonym wsparciu możesz otrzymać 7 dni dostępu.',429);
    const headers=new Headers(asset.headers);headers.set('Cache-Control','private, no-store');
    const issued=new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers});
    queueIssuedFileAudit(context,user.id,(permit.reason==='grant'||permit.reason==='vip')?'account_7d':'account_free',issued);
    return issued;
  }catch(error){
    console.error('AIO Access V4 download',error?.message);
    return accessDenied('Nie można zweryfikować dostępu. Spróbuj ponownie za chwilę.',503);
  }
}
export const onRequestGet=handle;
export const onRequestHead=handle;
