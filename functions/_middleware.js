/* V6: block a signed-in, suspended account before returning an HTML page or API response. */
import {getSession} from './_community.js';
const notice='Dostęp do AIO został czasowo zablokowany z powodu podejrzanej aktywności. Jeżeli uważasz decyzję za niesłuszną, skontaktuj się z administracją.';
const safe=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const html=reason=>`<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>AIO — dostęp wstrzymany</title><style>body{box-sizing:border-box;min-height:100vh;margin:0;padding:24px;display:grid;place-items:center;background:#061e2b;color:#ebf8ff;font:16px/1.6 system-ui}main{width:min(600px,100%);border:1px solid #5a99b1;border-radius:18px;padding:clamp(20px,5vw,38px);background:#0a2c3e;box-shadow:0 20px 70px #0007}h1{font-size:1.6rem}a{color:#7cdef4}p{overflow-wrap:anywhere}.note{background:#143b4f;padding:12px;border-radius:8px}</style></head><body><main><h1>⛔ Dostęp do konta AIO został zablokowany</h1><p>${notice}</p><p class="note">${safe(reason)}</p><p><a href="/contact.html?topic=account-security">Kontakt z administratorem</a> · <a href="mailto:aio-iptv@wp.pl?subject=AIO%20%E2%80%94%20odwo%C5%82anie%20od%20blokady">Napisz e-mail</a></p><p>Podaj nazwę konta i przybliżoną godzinę zdarzenia. Nie wysyłaj haseł ani tokenów.</p></main></body></html>`;
export async function onRequest(context){
  const {request,env}=context;const url=new URL(request.url);const path=url.pathname;
  if(!request.headers.get('cookie')?.includes('aio_community_session='))return context.next();
  if(path==='/contact'||path==='/contact.html'||path==='/api/community-auth')return context.next();
  const api=path.startsWith('/api/')||path.startsWith('/pliki/');
  const documentRequest=!api && (request.method==='GET'||request.method==='HEAD') && !/\.[a-z0-9]{2,8}$/i.test(path.replace(/\.html$/,''));
  if(!api&&!documentRequest)return context.next();
  try{
    const s=await getSession(request,env,{touch:false,allowUnverified:true});
    if(s&&!s.user?.is_owner&&(s.banned||s.blocked)){
      const reason=s.banned?(s.user?.ban_reason||'Blokada konta'):(s.block?.reason||'Blokada adresu IP');
      const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
      if(api)return new Response(JSON.stringify({ok:false,restricted:true,error:notice,contact:'/contact.html?topic=account-security'}),{status:403,headers:{...headers,'content-type':'application/json; charset=utf-8'}});
      return new Response(request.method==='HEAD'?null:html(reason),{status:403,headers:{...headers,'content-type':'text/html; charset=utf-8'}});
    }
  }catch(e){
    console.error('[AIO V6 middleware]',String(e?.message||e).slice(0,140));
    // Fail CLOSED for a request carrying an AIO session cookie. Anonymous
    // public pages do not query D1, so transient D1 failure does not affect them.
    return new Response('Nie można teraz zweryfikować dostępu do konta AIO. Spróbuj ponownie później.',
      {status:503,headers:{'cache-control':'private, no-store','content-type':'text/plain; charset=utf-8'}});
  }
  return context.next();
}
