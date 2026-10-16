/* AIO Owner Hub V1: server-enforced owner-only page. */
import { ensureSchema, requireAdmin } from './_community.js';
import { OWNER_HTML } from './_owner_hub_markup.js';

export async function onRequestGet({request,env}) {
  try {
    await ensureSchema(env);
    await requireAdmin(request,env,true);
  } catch (error) {
    const status=error?.status===401 ? 401 : error?.status===403 ? 403 : 503;
    const description=status===401 ? 'Najpierw zaloguj się na konto właściciela AIO.' :
      status===403 ? 'To miejsce jest dostępne tylko dla właściciela AIO.' : 'Nie udało się sprawdzić uprawnień. Spróbuj ponownie.';
    const page='<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>AIO — dostęp właściciela</title><body style="background:#071720;color:#eef8fc;font:16px system-ui;padding:6vw"><h1>Centrum Właściciela AIO</h1><p>'+description+'</p><p><a href="/community.html" style="color:#85ebf4">Przejdź do logowania</a></p></body></html>';
    return new Response(page,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'}});
  }
  return new Response(OWNER_HTML,{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'}});
}
