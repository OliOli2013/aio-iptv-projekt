import {confirmVerificationToken} from '../_aio_email_verification.js';
const HEADER={
 'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store',
 'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
 'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
};
function page(title, body, status=200){
 const html=`<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — AIO IPTV</title><style>body{font:16px system-ui;background:#092632;color:#eafaff;padding:24px}main{max-width:480px;margin:9vh auto;padding:28px;background:#113b49;border:1px solid #387c88;border-radius:16px}button,a{display:inline-block;padding:12px 17px;background:#067f87;color:#fff;border:0;border-radius:8px;font:inherit;text-decoration:none;cursor:pointer}p{line-height:1.6}</style></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
 return new Response(html,{status,headers:HEADER});
}
export async function onRequestGet({request}){
 const token=new URL(request.url).searchParams.get('token')||'';
 if(!/^[a-f0-9]{64}$/i.test(token))return page('Nieprawidłowy link','<p>Otwórz link z wiadomości e-mail lub poproś o nowy.</p>',400);
 // GET never confirms an address: scanners/prefetchers must not activate accounts.
 return page('Potwierdź adres e-mail',`<p>Potwierdzenie jest potrzebne do pobierania plików i aktywowania konta AIO.</p><form method="POST"><input type="hidden" name="token" value="${token}"><button type="submit">Potwierdzam adres e-mail</button></form>`);
}
export async function onRequestPost({request,env}){
 const origin=request.headers.get('Origin');
 if(origin && origin!==new URL(request.url).origin)return page('Błąd weryfikacji','<p>Niedozwolone źródło żądania.</p>',403);
 const form=await request.formData().catch(()=>null);
 const token=String(form?.get('token')||'');
 try {await confirmVerificationToken(env,token);}
 catch {return page('Weryfikacja nieudana','<p>Link wygasł lub został już wykorzystany. Zaloguj się i poproś o wysłanie nowego.</p><a href="/community.html">Przejdź do AIO</a>',400);}
 return page('E-mail potwierdzony','<p>Adres został zweryfikowany. Możesz wrócić do swojego konta i pobierać pliki w ramach obowiązujących limitów.</p><a href="/community.html">Przejdź do AIO</a>');
}
