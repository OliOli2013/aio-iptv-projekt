/* Owner-only decisions. No automatic linking of accounts or IP-wide account bans. */
import {json,requireAdmin,errorResponse,moderationLog} from '../_community.js';
import {ensureMultikontaGuard,guardConfiguration,createConfirmedQuotaGroup} from '../_aio_multikonta_guard_v2.js';
import {monthlyStatus} from '../_aio_monthly_access.js';
const sameOrigin=req=>{const o=req.headers.get('Origin');return (!o||o===new URL(req.url).origin)&&req.headers.get('Sec-Fetch-Site')!=='cross-site';};
export async function onRequestGet({request,env}){
  try{
    await requireAdmin(request,env,true);await ensureMultikontaGuard(env);
    const r=await env.COMMUNITY_DB.prepare(`SELECT r.user_id,p.display_name,r.peer_user_id,peer.display_name AS peer_name,
      r.risk_score,r.indicators,r.status,r.created_at,r.reviewed_at
      FROM aio_multikonta_reviews_v2 r JOIN community_profiles p ON p.id=r.user_id
      LEFT JOIN community_profiles peer ON peer.id=r.peer_user_id
      ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'monitor' THEN 1 ELSE 2 END,r.created_at DESC LIMIT 180`).all();
    const groups=await env.COMMUNITY_DB.prepare(`SELECT g.group_id,g.used,g.resets_ms,COUNT(m.user_id) accounts
      FROM aio_multikonta_quota_groups_v2 g JOIN aio_multikonta_quota_members_v2 m ON m.group_id=g.group_id
      GROUP BY g.group_id ORDER BY g.created_at DESC LIMIT 60`).all();
    const cfg=guardConfiguration(env);
    return json({ok:true,version:'AIO_MULTIKONTA_V2',mode:cfg.mode,secret_ready:cfg.secret_ready,
      turnstile_enabled:cfg.turnstile_enabled,reviews:r.results||[],confirmed_quota_groups:groups.results||[]});
  }catch(e){return errorResponse(e);}
}
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return json({ok:false,error:'Niedozwolone źródło żądania.'},403);
  if(!String(request.headers.get('content-type')||'').includes('application/json'))return json({ok:false,error:'Oczekiwano JSON.'},415);
  try{
    const admin=await requireAdmin(request,env,true);await ensureMultikontaGuard(env);
    const b=await request.json().catch(()=>({}));
    if(b.confirm!==true)return json({ok:false,error:'Wymagane potwierdzenie.'},400);
    if(b.action==='release'){
      const id=String(b.user_id||'');if(!/^[a-f0-9-]{36}$/i.test(id))return json({ok:false,error:'Nieprawidłowe ID.'},400);
      const out=await env.COMMUNITY_DB.prepare(`UPDATE aio_multikonta_reviews_v2 SET status='released',reviewed_at=?,reviewed_by=?
        WHERE user_id=? AND status IN ('pending','monitor')`).bind(new Date().toISOString(),admin.user.id,id).run();
      if(!out.meta?.changes)return json({ok:false,error:'Nie znaleziono nierozpatrzonej weryfikacji.'},409);
      await moderationLog(env,admin.user.id,{targetUserId:id,targetType:'user',targetId:id,action:'owner_multikonta_v2_release',reason:'Ręczne zwolnienie weryfikacji multikonta'}).catch(()=>{});
      return json({ok:true,message:'Kontrola multikonta zwolniona. Inne istniejące blokady konta pozostają aktywne.'});
    }
    if(b.action==='link_confirmed'){
      const ids=Array.isArray(b.user_ids)?b.user_ids:[];
      for(const id of ids){if(/^[a-f0-9-]{36}$/i.test(String(id)))await monthlyStatus(env,String(id));}
      const group=await createConfirmedQuotaGroup(env,admin.user.id,ids);
      await moderationLog(env,admin.user.id,{targetUserId:ids[0],targetType:'user',targetId:ids[0],action:'owner_multikonta_v2_link_quota',reason:'Wspólny limit dla ręcznie potwierdzonych kont: '+ids.length}).catch(()=>{});
      return json({ok:true,message:'Utworzono wspólny limit dla ręcznie potwierdzonych kont.',...group});
    }
    return json({ok:false,error:'Nieznane działanie.'},400);
  }catch(e){return errorResponse(e);}
}
