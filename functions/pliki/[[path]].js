/* Account-based gate for locally hosted files. Zero IP-dependent entitlements. */
import {initAccess,sessionUser,getStatus,consumeFree,guestState,consumeGuest,applyGuestCookie} from '../_aio_account_access.js';
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
    if(!user){
      const trial=await guestState(env,request);
      if(!trial.guest_remaining){
        const dest=new URL('/downloads.html',new URL(request.url).origin);
        dest.searchParams.set('aio_guest_limit','1');
        return applyGuestCookie(Response.redirect(dest.toString(),302),trial.cookie);
      }
      if(request.method==='HEAD')return applyGuestCookie(await context.next(),trial.cookie);
      // Never charge an anonymous trial for a missing or failed static asset.
      const asset=await context.next();
      if(asset.status<200 || asset.status>=300)return applyGuestCookie(asset,trial.cookie);
      const permit=await consumeGuest(env,request,trial);
      if(!permit.allowed){
        const dest=new URL('/downloads.html',new URL(request.url).origin);
        dest.searchParams.set('aio_guest_limit','1');
        return applyGuestCookie(Response.redirect(dest.toString(),302),permit.cookie);
      }
      const headers=new Headers(asset.headers);headers.set('Cache-Control','private, no-store');
      return applyGuestCookie(new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers}),permit.cookie);
    }
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
