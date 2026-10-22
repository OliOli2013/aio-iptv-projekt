/* Owner-only D1 review and decisions; never reveal IP/account correlation publicly. */
import {requireAdmin,json,moderationLog} from '../_community.js';
import {ensureIpPolicy,listCollisionGroups,applyHistoricalGroup,grantException,allowNextSignup} from '../_aio_ip_one_account_v7.js';
const respond=(x,status=200)=>json(x,status,{'Cache-Control':'private, no-store','Vary':'Cookie'});
const invalid=(status,msg)=>{throw Object.assign(new Error(msg),{status})};
const validId=s=>/^[0-9a-f]{8}-[0-9a-f-]{27,40}$/i.test(String(s||''));
const safe=(s,limit=200)=>String(s||'').replace(/[\x00-\x1f<>]/g,' ').trim().slice(0,limit);
const handleError=e=>respond({ok:false,error:[400,401,403,404,409].includes(e.status)?e.message:'Nie można obsłużyć polityki IP.'},[400,401,403,404,409].includes(e.status)?e.status:500);
export async function onRequestGet({request,env}){
  try{
    await requireAdmin(request,env,true);await ensureIpPolicy(env);
    const url=new URL(request.url),offset=Math.min(100000,Math.max(0,Number.parseInt(url.searchParams.get('offset')||'0',10)||0));
    const db=env.COMMUNITY_DB,groups=await listCollisionGroups(env,{offset,limit:5});
    const holds=await db.prepare(`SELECT h.user_id,p.display_name,COALESCE(a.email,'') email,h.ip_key,h.reason,
      h.status,h.created_at,h.released_at,h.released_by FROM aio_ip_policy_holds_v8 h
      LEFT JOIN community_profiles p ON p.id=h.user_id LEFT JOIN community_auth a ON a.user_id=h.user_id
      WHERE h.status='active' ORDER BY h.created_at DESC LIMIT 300`).all();
    return respond({ok:true,offset,groups:groups.groups,has_more:groups.has_more,holds:holds.results||[],
      note:'Wspólny IP to jedno łącze, nie dowód tożsamości. Blokady historyczne wymagają zatwierdzenia przez właściciela.'});
  }catch(e){console.error('[AIO IP policy GET]',String(e?.message||e).slice(0,150));return handleError(e)}
}
export async function onRequestPost({request,env}){
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin)return respond({ok:false,error:'Nieprawidłowe źródło żądania.'},403);
  if(request.headers.get('Sec-Fetch-Site')==='cross-site')return respond({ok:false,error:'Żądanie z innej strony odrzucone.'},403);
  if(!String(request.headers.get('content-type')||'').includes('application/json'))return respond({ok:false,error:'Wymagany JSON.'},415);
  try{
    const owner=await requireAdmin(request,env,true);await ensureIpPolicy(env);
    const data=await request.json().catch(()=>({})),action=safe(data.action,40),key=safe(data.ip_key,120);
    if(data.confirm!==true)invalid(400,'Wymagane potwierdzenie właściciela.');
    const reason=safe(data.reason,240);
    if(action==='apply_group'){
      const ip=safe(data.ip,80);const result=await applyHistoricalGroup(env,key,ip,owner.user.id);
      await moderationLog(env,owner.user.id,{targetType:'user',targetId:owner.user.id,action:'ip_policy_group_applied',reason:'Sieć: '+key.slice(0,12)+'; zablokowano: '+result.held});
      return respond({ok:true,message:`Sprawdzono ${result.accounts} kont. Nowe blokady: ${result.held}.`,...result});
    }
    if(action==='approve_user'){
      if(!validId(data.user_id))invalid(400,'Nieprawidłowe ID konta.');
      if(reason.length<10)invalid(400,'Podaj przyczynę zatwierdzenia (minimum 10 znaków).');
      const hold=await env.COMMUNITY_DB.prepare("SELECT ip_key FROM aio_ip_policy_holds_v8 WHERE user_id=? AND ip_key=? AND status='active'").bind(data.user_id,key).first();
      if(!hold)invalid(409,'Brak aktywnej blokady dla tego konta i IP.');
      await grantException(env,key,data.user_id,owner.user.id,reason);
      await moderationLog(env,owner.user.id,{targetUserId:data.user_id,targetType:'user',targetId:data.user_id,action:'ip_policy_exception_approved',reason});
      return respond({ok:true,message:'Zatwierdzono wyjątek na wskazanym IP. Zdjęto blokadę duplikatu.'});
    }
    if(action==='allow_next'){
      if(reason.length<10)invalid(400,'Podaj uzasadnienie (minimum 10 znaków).');
      await allowNextSignup(env,key,owner.user.id,reason,safe(data.ip,80));
      await moderationLog(env,owner.user.id,{targetType:'user',targetId:owner.user.id,action:'ip_policy_registration_exception',reason:'Dodano 1 zgodę na rejestrację, sieć: '+key.slice(0,12)});
      return respond({ok:true,message:'Jedna dodatkowa rejestracja na wskazanym IP została dopuszczona.'});
    }
    invalid(400,'Nieznane działanie.');
  }catch(e){console.error('[AIO IP policy POST]',String(e?.message||e).slice(0,150));return handleError(e)}
}
