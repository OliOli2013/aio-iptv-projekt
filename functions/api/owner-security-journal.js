import {json,requireAdmin,bodyJson} from '../_community.js';
import {ensureSecurityJournal,logSecurity} from '../_aio_security_journal.js';
const sameOrigin=req=>{
  const origin=req.headers.get('Origin');if(origin&&origin!==new URL(req.url).origin)return false;
  return req.headers.get('Sec-Fetch-Site')!=='cross-site';
};
function err(e){return json({ok:false,error:[401,403].includes(e?.status)?'Brak dostępu właściciela.':'Nie udało się wykonać operacji dziennika.'},[401,403].includes(e?.status)?e.status:500,{'Cache-Control':'no-store'});}
export async function onRequestGet({request,env}){
  try{
    await requireAdmin(request,env,true);await ensureSecurityJournal(env);
    const db=env.COMMUNITY_DB;
    const pageOffset=Math.min(50000,Math.max(0,Number.parseInt(new URL(request.url).searchParams.get('offset')||'0',10)||0));
    const ago24=new Date(Date.now()-86400000).toISOString();
    const ago7=new Date(Date.now()-7*86400000).toISOString();
    const [count,types,users,holds,events,holdCount]=await Promise.all([
      db.prepare(`SELECT COUNT(*) n, SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) last_day,
         SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) last_week FROM aio_security_journal`).bind(ago24,ago7).first(),
      db.prepare(`SELECT event, COUNT(*) n FROM aio_security_journal WHERE created_at>=? GROUP BY event ORDER BY n DESC`).bind(ago7).all(),
      db.prepare(`SELECT COALESCE(p.display_name,'Konto usunięte') name,j.user_id,COUNT(*) n,
        SUM(CASE WHEN j.event='login_failed' THEN 1 ELSE 0 END) failures,
        SUM(CASE WHEN j.event='login_ok' THEN 1 ELSE 0 END) logins
        FROM aio_security_journal j LEFT JOIN community_profiles p ON p.id=j.user_id
        WHERE j.user_id IS NOT NULL AND j.created_at>=? GROUP BY j.user_id,p.display_name ORDER BY n DESC LIMIT 35`).bind(ago7).all(),
      db.prepare(`SELECT h.id,h.user_id,h.created_at,h.expires_at,h.status,h.released_at,
        COALESCE(p.display_name,'Konto usunięte') user_name,
        COALESCE(q.display_name,'Konto usunięte') peer_name,
        CASE WHEN h.status='active' AND h.expires_at>? THEN 1 ELSE 0 END active
        FROM aio_security_shared_holds h LEFT JOIN community_profiles p ON p.id=h.user_id
        LEFT JOIN community_profiles q ON q.id=h.peer_user_id
        ORDER BY h.created_at DESC LIMIT 100`).bind(new Date().toISOString()).all(),
      db.prepare(`SELECT j.event,j.created_at,j.device,j.detail,substr(j.ip_fingerprint,1,10) ip_id,
        COALESCE(p.display_name,CASE WHEN j.user_id IS NULL THEN 'Nieznane konto' ELSE 'Konto usunięte' END) user_name
        FROM aio_security_journal j LEFT JOIN community_profiles p ON p.id=j.user_id
        ORDER BY j.created_at DESC LIMIT 150 OFFSET ?`).bind(pageOffset).all(),
      db.prepare(`SELECT COUNT(*) n FROM aio_security_shared_holds WHERE status='active' AND expires_at>?`).bind(new Date().toISOString()).first()
    ]);
    return json({ok:true,stats:{total:Number(count?.n||0),day:Number(count?.last_day||0),week:Number(count?.last_week||0),active_holds:Number(holdCount?.n||0)},types:types.results||[],users:users.results||[],holds:holds.results||[],events:events.results||[],pagination:{offset:pageOffset,page_size:150,total:Number(count?.n||0),has_more:pageOffset+(events.results||[]).length<Number(count?.n||0)},note:'Tylko zdarzenia od instalacji. Dziennik nie jest automatycznie czyszczony, a adresy IP występują jako skróty.'},200,{'Cache-Control':'no-store'});
  }catch(e){return err(e)}
}
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return json({ok:false,error:'Niedozwolone źródło.'},403);
  try{
    const s=await requireAdmin(request,env,true);await ensureSecurityJournal(env);
    const body=await bodyJson(request),id=String(body.id||'');
    if(body.action!=='release_hold'||!id||id.length>100)return json({ok:false,error:'Nieprawidłowe żądanie.'},400);
    const r=await env.COMMUNITY_DB.prepare(`UPDATE aio_security_shared_holds
      SET status='released',released_at=?,released_by=? WHERE id=? AND status='active'`)
      .bind(new Date().toISOString(),s.user.id,id).run();
    if(Number(r.meta?.changes||0)!==1)return json({ok:false,error:'Ograniczenie wygasło lub zostało już zdjęte.'},409);
    await logSecurity(env,request,'shared_ip_hold_released',s.user.id,'Decyzja właściciela');
    return json({ok:true,message:'Ograniczenie pobierania zostało zdjęte.'});
  }catch(e){return err(e)}
}
