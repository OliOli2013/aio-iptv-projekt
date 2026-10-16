/* Account-based gate for locally hosted files. Zero IP-dependent entitlements. */
import {initAccess,sessionUser,getStatus,consumeFree} from '../_aio_account_access.js';
const FILE_EXT=/\.(?:ipk|apk|exe|msi|zip|7z|rar|deb|rpm|pdf|tar|tgz|gz|xz|img|bin|iso|m3u|m3u8|xml|conf|cfg|backup|sh|py|json|txt|list|tv|radio|bouquet)$/i;
const IMG=/\.(?:png|jpe?g|webp|gif|svg|avif)$/i;
function protectedFile(request){
  let p;try{p=decodeURIComponent(new URL(request.url).pathname);}catch{return false;}
  return !IMG.test(p)&&FILE_EXT.test(p);
}
function deny(message,status=403){return new Response(message,{status,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});}
async function handle(context){
  const {request,env}=context;if(!protectedFile(request))return context.next();
  try{
    await initAccess(env);
    const user=await sessionUser(request,env);
    if(!user)return deny('Pobieranie wymaga zalogowania na konto AIO-IPTV.pl.',401);
    const state=await getStatus(env,user.id);
    if(request.method==='HEAD')return (state.active||state.free_remaining>0)?context.next():deny('Dzienny limit wykorzystany.',429);
    const permit=await consumeFree(env,user.id);
    if(!permit.allowed)return deny('Dzienny limit pobierania wykorzystany. Zaloguj się i otwórz AIO Access.',429);
    const result=await context.next();
    return new Response(result.body,{status:result.status,statusText:result.statusText,headers:result.headers});
  }catch(error){console.error('aio download account gate',error?.message);return deny('Nie można zweryfikować uprawnień do pobrania.',503);}
}
export const onRequestGet=handle;
export const onRequestHead=handle;
