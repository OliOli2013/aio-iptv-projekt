import {requireAdmin} from '../_community.js';
import {vpnGuardConfig,budgetCeiling} from '../_aio_vpn_guard_v1.js';
import {scanPage,reviewSignal,quotaSnapshot} from '../_aio_owner_signals.js';
const head={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const reply=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:head});
const err=e=>{const status=[400,401,403,409].includes(e?.status)?e.status:503;
  return reply({ok:false,error:status===503?'Brak odczytu. Sprawdź migrację D1 i źródło danych.':String(e.message||'Brak dostępu.')},status);};
export async function onRequestGet({request,env}){
  try{
    await requireAdmin(request,env,true);
    const q=new URL(request.url).searchParams,db=env.COMMUNITY_DB;
    if(q.get('view')==='scan')return reply({ok:true,...await scanPage(db,{after:q.get('after')||'',at:q.get('at')})});
    if(q.get('view')==='quota')return reply({ok:true,...await quotaSnapshot(db,q.get('id'))});
    const cfg=vpnGuardConfig(env),day=new Date().toISOString().slice(0,10);
    const [counts,budget]=await Promise.allSettled([
      Promise.resolve().then(()=>db.prepare('SELECT phase,outcome,SUM(n) n FROM aio_vpn_auth_counts_v2 WHERE day=? GROUP BY phase,outcome').bind(day).all()),
      Promise.resolve().then(()=>db.prepare('SELECT used FROM aio_vpn_guard_budget_v1 WHERE day=?').bind(day).first())
    ]);
    return reply({ok:true,day,counts:counts.status==='fulfilled'?counts.value.results:null,
      used:budget.status==='fulfilled'?Number(budget.value?.used||0):null,max:cfg.daily_budget,
      scan_ceiling:budgetCeiling(cfg.daily_budget,'scan'),login_ceiling:budgetCeiling(cfg.daily_budget,'login'),
      register_mode:cfg.mode,login_mode:cfg.login_mode,provider_ready:cfg.ready,
      r2_configured:env.AIO_DOWNLOAD_STORAGE_MODE==='r2'&&typeof env.AIO_PRIVATE_FILES?.head==='function'&&typeof env.AIO_PRIVATE_FILES?.get==='function'});
  }catch(e){return err(e);}
}
export async function onRequestPost({request,env}){
  try{
    const owner=await requireAdmin(request,env,true);
    if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')
      return reply({ok:false,error:'Niedozwolone źródło.'},403);
    if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return reply({ok:false,error:'Wymagany JSON.'},415);
    if(Number(request.headers.get('content-length')||0)>4096)return reply({ok:false,error:'Zbyt duże żądanie.'},413);
    const text=await request.text();if(text.length>4096)return reply({ok:false,error:'Zbyt duże żądanie.'},413);
    let data;try{data=JSON.parse(text);}catch{return reply({ok:false,error:'Niepoprawne dane.'},400);}
    const db=env.COMMUNITY_DB;
    if(data?.action==='find'){
      const q=String(data.query||'').trim();if(q.length<2||q.length>254)return reply({ok:false,error:'Wpisz dokładny nick, ID lub e-mail.'},400);
      const {results}=await db.prepare(`SELECT p.id,p.display_name AS name FROM community_profiles p
        LEFT JOIN community_auth a ON a.user_id=p.id WHERE p.role='user' AND
        (p.id=? OR p.display_name=? COLLATE NOCASE OR a.email=? COLLATE NOCASE) ORDER BY p.id LIMIT 10`).bind(q,q,q).all();
      return reply({ok:true,rows:results||[]});
    }
    if(data?.action==='review')return reply({ok:true,...await reviewSignal(db,owner.user.id,data)});
    return reply({ok:false,error:'Nieznana operacja.'},400);
  }catch(e){return err(e);}
}
