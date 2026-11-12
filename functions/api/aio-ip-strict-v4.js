/* Owner-only AIO strict policy review/apply endpoint. */
import {requireAdmin,moderationLog} from '../_community.js';
import {strictStatus,applyHistoricalStrictV4,releaseStrictV4} from '../_aio_strict_ip_v4.js';
const H={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'};
const out=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:H});
const err=e=>out({ok:false,error:[400,401,403,409].includes(e?.status)?e.message:'Błąd audytu. Sprawdź dziennik Cloudflare.'},[400,401,403,409].includes(e?.status)?e.status:503);
export async function onRequestGet({request,env}){
  try{await requireAdmin(request,env,true);return out({ok:true,version:'AIO_1IP_1ACCOUNT_V4_2',...(await strictStatus(env))});}
  catch(e){console.error('[AIO strict GET]',String(e));return err(e);}
}
export async function onRequestPost({request,env}){
  const origin=request.headers.get('Origin');
  if((origin&&origin!==new URL(request.url).origin)||request.headers.get('Sec-Fetch-Site')==='cross-site')return out({ok:false,error:'Niedozwolone źródło żądania.'},403);
  if(!/application\/json/i.test(request.headers.get('Content-Type')||''))return out({ok:false,error:'Wymagany JSON.'},415);
  try{
    const admin=await requireAdmin(request,env,true);
    const body=await request.json().catch(()=>({}));
    if(body.confirm!==true)return out({ok:false,error:'Wymagane potwierdzenie administratora.'},400);
    if(body.action==='release_hold'){
      const userId=String(body.user_id||'');
      if(!/^[0-9a-f-]{36}$/i.test(userId))return out({ok:false,error:'Nieprawidłowe ID konta.'},400);
      const released=await releaseStrictV4(env,userId);
      await moderationLog(env,admin.user.id,{targetUserId:userId,targetType:'user',targetId:userId,
        action:'aio_strict_v4_release',reason:'Usunięto kolizję IP; ręczne zwolnienie po wyjaśnieniu'});
      return out({ok:true,version:'AIO_1IP_1ACCOUNT_V4_2',...released,...(await strictStatus(env))});
    }
    if(body.action==='preview_history'){
      const preview=await applyHistoricalStrictV4(env,{dryRun:true});
      return out({ok:true,version:'AIO_1IP_1ACCOUNT_V4_2',...preview});
    }
    if(body.action!=='apply_history')return out({ok:false,error:'Nieznana operacja.'},400);
    const scan=await applyHistoricalStrictV4(env);
    return out({ok:true,version:'AIO_1IP_1ACCOUNT_V4_2',...scan,...(await strictStatus(env))});
  }catch(e){console.error('[AIO strict POST]',String(e));return err(e);}
}
