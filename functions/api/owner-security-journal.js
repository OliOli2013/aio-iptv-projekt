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
    const [count,types,users,holds,events,holdCount,paidHolds,paidCount,allowRows]=await Promise.all([
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
        COALESCE(q.display_name,'Konto usunięte') peer_name, 'shared' kind, '' details,
        CASE WHEN h.status='active' AND h.expires_at>? THEN 1 ELSE 0 END active
        FROM aio_security_shared_holds h LEFT JOIN community_profiles p ON p.id=h.user_id
        LEFT JOIN community_profiles q ON q.id=h.peer_user_id
        ORDER BY h.created_at DESC LIMIT 100`).bind(new Date().toISOString()).all(),
      db.prepare(`SELECT j.event,j.created_at,j.device,j.detail,substr(j.ip_fingerprint,1,10) ip_id,
        COALESCE(p.display_name,CASE WHEN j.user_id IS NULL THEN 'Nieznane konto' ELSE 'Konto usunięte' END) user_name
        FROM aio_security_journal j LEFT JOIN community_profiles p ON p.id=j.user_id
        ORDER BY j.created_at DESC LIMIT 150 OFFSET ?`).bind(pageOffset).all(),
      db.prepare(`SELECT COUNT(*) n FROM aio_security_shared_holds WHERE status='active' AND expires_at>?`).bind(new Date().toISOString()).first(),
      db.prepare(`SELECT h.id,h.user_id,h.created_at,h.expires_at,h.status,h.released_at,
        COALESCE(p.display_name,'Konto usunięte') user_name,
        'Różne sieci i urządzenia' peer_name,'paid' kind,h.evidence details,
        CASE WHEN h.status='active' AND h.expires_at>? THEN 1 ELSE 0 END active
        FROM aio_security_paid_holds h LEFT JOIN community_profiles p ON p.id=h.user_id
        ORDER BY h.created_at DESC LIMIT 100`).bind(new Date().toISOString()).all(),
      db.prepare(`SELECT COUNT(*) n FROM aio_security_paid_holds WHERE status='active' AND expires_at>?`).bind(new Date().toISOString()).first(),
      db.prepare(`SELECT a.user_id,COALESCE(p.display_name,'Konto usunięte') user_name,
        a.created_at,a.expires_at,substr(a.ip_fingerprint,1,10) fingerprint,a.ip_fingerprint fingerprint_full
        FROM aio_security_shared_allow a LEFT JOIN community_profiles p ON p.id=a.user_id
        WHERE a.expires_at>? ORDER BY a.created_at DESC LIMIT 100`).bind(new Date().toISOString()).all()
    ]);
    return json({ok:true,stats:{total:Number(count?.n||0),day:Number(count?.last_day||0),week:Number(count?.last_week||0),active_holds:Number(holdCount?.n||0)+Number(paidCount?.n||0),shared_holds:Number(holdCount?.n||0),paid_holds:Number(paidCount?.n||0)},types:types.results||[],users:users.results||[],holds:[...(holds.results||[]),...(paidHolds.results||[])].sort((a,b)=>b.created_at.localeCompare(a.created_at)),allowances:allowRows.results||[],events:events.results||[],pagination:{offset:pageOffset,page_size:150,total:Number(count?.n||0),has_more:pageOffset+(events.results||[]).length<Number(count?.n||0)},note:'Tylko zdarzenia od instalacji. Dziennik nie jest automatycznie czyszczony, a adresy IP występują jako skróty.'},200,{'Cache-Control':'no-store'});
  }catch(e){return err(e)}
}
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return json({ok:false,error:'Niedozwolone źródło.'},403);
  try{
    const s=await requireAdmin(request,env,true);await ensureSecurityJournal(env);
    const body=await bodyJson(request),id=String(body.id||'');
    if(body.action!=='revoke_shared_network' && (!id||id.length>100))return json({ok:false,error:'Nieprawidłowe ID.'},400);
    const now=new Date(),when=now.toISOString();
    if(body.action==='release_paid_hold'){
      const grace=new Date(now.getTime()+7*86400000).toISOString();
      const r=await env.COMMUNITY_DB.prepare(`UPDATE aio_security_paid_holds
        SET status='released',released_at=?,released_by=?,review_pause_until=?
        WHERE id=? AND status='active'`).bind(when,s.user.id,grace,id).run();
      if(Number(r.meta?.changes||0)!==1)return json({ok:false,error:'Ograniczenie wygasło lub zostało już zdjęte.'},409);
      await logSecurity(env,request,'paid_account_sharing_released',s.user.id,'Właściciel: 7 dni przerwy w ponownej blokadzie');
      return json({ok:true,message:'Odblokowano płatne konto; 7 dni przerwy w automatycznym nakładaniu tego ograniczenia.'});
    }
    if(body.action==='release_hold'||body.action==='approve_shared_network'){
      const row=await env.COMMUNITY_DB.prepare(`SELECT user_id,ip_fingerprint FROM aio_security_shared_holds
        WHERE id=? AND status='active' LIMIT 1`).bind(id).first();
      if(!row)return json({ok:false,error:'Ograniczenie wygasło lub zostało już zdjęte.'},409);
      const days=body.action==='approve_shared_network'?365:7;
      // Admin verification grace for this account on this network; not a global IP exception.
      await env.COMMUNITY_DB.prepare(`INSERT INTO aio_security_shared_allow
        (user_id,ip_fingerprint,created_at,expires_at,approved_by) VALUES(?,?,?,?,?)
        ON CONFLICT(user_id,ip_fingerprint) DO UPDATE SET
          created_at=excluded.created_at,expires_at=excluded.expires_at,approved_by=excluded.approved_by`)
        .bind(row.user_id,row.ip_fingerprint,when,new Date(now.getTime()+days*86400000).toISOString(),s.user.id).run();
      const r=await env.COMMUNITY_DB.prepare(`UPDATE aio_security_shared_holds
        SET status='released',released_at=?,released_by=? WHERE id=? AND status='active'`)
        .bind(when,s.user.id,id).run();
      if(Number(r.meta?.changes||0)!==1)return json({ok:false,error:'Nie udało się zwolnić ograniczenia.'},409);
      await logSecurity(env,request,body.action==='approve_shared_network'?'shared_ip_approved':'shared_ip_hold_released',s.user.id,'Decyzja właściciela; wyjątek '+days+' dni');
      return json({ok:true,message:'Odblokowano pobieranie; wyjątek na '+days+' dni dla tego konta i tej sieci.'});
    }
    if(body.action==='revoke_shared_network'){
      const r=await env.COMMUNITY_DB.prepare('DELETE FROM aio_security_shared_allow WHERE user_id=? AND ip_fingerprint=?')
        .bind(String(body.user_id||''),String(body.fingerprint||'')).run();
      if(Number(r.meta?.changes||0)!==1)return json({ok:false,error:'Wyjątek nie został znaleziony.'},404);
      await logSecurity(env,request,'shared_ip_approval_revoked',s.user.id,'Właściciel wycofał zgodę');
      return json({ok:true,message:'Wyjątek został cofnięty.'});
    }
    return json({ok:false,error:'Nieznana operacja.'},400);
  }catch(e){return err(e)}
}
