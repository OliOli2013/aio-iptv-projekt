/* AIO Post Notifications: account preferences + protected scheduled digest job. */
import {requireUser,ensureSchema} from '../_community.js';
import {ensurePostNotifySchema,readPostNotificationSettings,savePostNotificationSettings,dispatchPostEmailDigests} from '../_aio_post_notifications.js';
const HEAD={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'};
const answer=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:HEAD});
const safeError=e=>{const code=[400,401,403,429].includes(e?.status)?e.status:500;
  return answer({ok:false,error:code===500?'Nie udało się zapisać ustawień. Spróbuj ponownie później.':String(e.message||'Nie udało się wykonać operacji.')},code);};
function originOK(req){const origin=req.headers.get('origin');return (!origin||origin===new URL(req.url).origin)&&req.headers.get('sec-fetch-site')!=='cross-site';}
export async function onRequestGet({request,env}){
  try{const s=await requireUser(request,env);await ensurePostNotifySchema(env);
    return answer({ok:true,settings:await readPostNotificationSettings(env,s.user.id)});
  }catch(e){return safeError(e);}
}
export async function onRequestPost({request,env}){
  if(!(request.headers.get('content-type')||'').toLowerCase().includes('application/json'))return answer({ok:false,error:'Nieprawidłowe dane.'},415);
  let body;
  try{body=await request.json();}catch(_){return answer({ok:false,error:'Nieprawidłowe dane.'},400);}
  if(!body||typeof body!=='object'||Array.isArray(body))return answer({ok:false,error:'Nieprawidłowe dane.'},400);
  if(body.action==='dispatch'){
    // Scheduled jobs only: never let a normal user send bulk e-mail from the browser.
    const secret=String(env.AIO_POST_NOTIFY_TOKEN||'');
    const auth=String(request.headers.get('authorization')||'');
    if(secret.length<32||auth!==('Bearer '+secret))return answer({ok:false,error:'Brak dostępu.'},403);
    try{await ensureSchema(env);return answer({ok:true,...await dispatchPostEmailDigests(env)});}
    catch(e){console.error('[AIO post digest] run failed',String(e?.message||'error').slice(0,100));return answer({ok:false,error:'Nie udało się wykonać wysyłki.'},503);}
  }
  if(!originOK(request))return answer({ok:false,error:'Brak dostępu.'},403);
  try{
    if(body.action!=='save_settings')return answer({ok:false,error:'Nieznana operacja.'},400);
    const s=await requireUser(request,env);
    const settings=await savePostNotificationSettings(env,s.user.id,body);
    return answer({ok:true,settings,message:'Ustawienia powiadomień zostały zapisane.'});
  }catch(e){return safeError(e);}
}
