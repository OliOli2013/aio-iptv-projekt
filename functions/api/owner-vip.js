/* AIO VIP V1: owner-only management API. Existing verified community account required. */
import {requireAdmin} from '../_community.js';
import {ensureVipSchema,oneCalendarMonth} from '../_aio_vip.js';

const headers={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers});}
function error(e){const status=[400,401,403,404,409,415].includes(e?.status)?e.status:500;return json({ok:false,error:status===500?'Wystąpił błąd zapisu VIP.':String(e.message||'Błąd')},status);}
function fail(status,message){throw Object.assign(new Error(message),{status});}
function sameOrigin(request){const origin=request.headers.get('Origin');return (!origin||origin===new URL(request.url).origin)&&request.headers.get('Sec-Fetch-Site')!=='cross-site';}
function validEmail(input){const e=String(input||'').trim().toLowerCase();if(e.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e))fail(400,'Podaj poprawny adres e-mail zarejestrowanego konta AIO.');return e;}
async function owner(request,env){return requireAdmin(request,env,true);}
export async function onRequestGet({request,env}) {
  try{
    await owner(request,env);await ensureVipSchema(env);
    const rr=await env.COMMUNITY_DB.prepare(`SELECT v.user_id,v.issued_at,v.expires_at,v.status,v.note,v.revoked_at,
      a.email,COALESCE(p.display_name,'Konto') AS display_name
      FROM aio_vip_grants v JOIN community_auth a ON a.user_id=v.user_id
      LEFT JOIN community_profiles p ON p.id=v.user_id
      ORDER BY CASE WHEN v.status='active' AND v.expires_at>? THEN 0 ELSE 1 END, v.updated_at DESC LIMIT 300`)
      .bind(new Date().toISOString()).all();
    const now=Date.now();const grants=(rr.results||[]).map(x=>({...x,active:x.status==='active'&&Date.parse(x.expires_at)>now}));
    return json({ok:true,grants,active_count:grants.filter(x=>x.active).length});
  }catch(e){return error(e);}
}
export async function onRequestPost({request,env}) {
  if(!sameOrigin(request))return json({ok:false,error:'Niedozwolone źródło żądania.'},403);
  try{
    const s=await owner(request,env);
    if(!(request.headers.get('Content-Type')||'').includes('application/json'))fail(415,'Wymagany format JSON.');
    const body=await request.json().catch(()=>({}));
    await ensureVipSchema(env);
    const db=env.COMMUNITY_DB;const action=String(body.action||'');
    if(action==='activate'){
      if(body.confirm!==true)fail(400,'Wymagane potwierdzenie nadania VIP.');
      const email=validEmail(body.email);
      const target=await db.prepare(`SELECT a.user_id,p.display_name FROM community_auth a
        JOIN community_profiles p ON p.id=a.user_id WHERE lower(a.email)=? LIMIT 1`).bind(email).first();
      if(!target)fail(404,'Nie znaleziono konta z podanym e-mailem. Użytkownik musi najpierw zarejestrować się w AIO.');
      const now=new Date();const issued=now.toISOString();const expiry=oneCalendarMonth(now).toISOString();
      const note=String(body.note||'').trim().replace(/[\x00-\x1f\x7f]/g,' ').slice(0,220);
      await db.prepare(`INSERT INTO aio_vip_grants
        (user_id,issued_at,expires_at,status,activated_by,note,revoked_at,revoked_by,updated_at)
        VALUES (?,?,?,'active',?,?,NULL,NULL,?)
        ON CONFLICT(user_id) DO UPDATE SET issued_at=excluded.issued_at,
        expires_at=excluded.expires_at,status='active',activated_by=excluded.activated_by,
        note=excluded.note,revoked_at=NULL,revoked_by=NULL,updated_at=excluded.updated_at`)
        .bind(target.user_id,issued,expiry,s.user.id,note,issued).run();
      return json({ok:true,display_name:target.display_name||'Konto',expires_at:expiry,
        message:'VIP aktywowany na miesiąc od teraz. Limit pobierania nie obowiązuje do wskazanej daty.'});
    }
    if(action==='revoke'){
      if(body.confirm!==true)fail(400,'Wymagane potwierdzenie wyłączenia VIP.');
      const id=String(body.user_id||'');
      if(!/^[a-zA-Z0-9-]{8,100}$/.test(id))fail(400,'Niepoprawny identyfikator konta.');
      const now=new Date().toISOString();
      const result=await db.prepare(`UPDATE aio_vip_grants SET status='revoked',revoked_at=?,revoked_by=?,updated_at=?
        WHERE user_id=? AND status='active'`).bind(now,s.user.id,now,id).run();
      if(Number(result.meta?.changes||0)!==1)fail(409,'VIP nie jest już aktywny lub został wcześniej wyłączony.');
      return json({ok:true,message:'VIP wyłączony. Pozostałe, wcześniej zatwierdzone uprawnienia konta zachowano.'});
    }
    fail(400,'Nieznana operacja VIP.');
  }catch(e){return error(e);}
}
