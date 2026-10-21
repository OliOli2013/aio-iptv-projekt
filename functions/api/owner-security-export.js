/* Bounded owner-only CSV export. Exported rows never go to public clients. */
import {requireAdmin} from '../_community.js';
import {ensureSecurityJournal} from '../_aio_security_journal.js';
const csvCell=v=>{let s=String(v??'');if(/^[\s]*[=+@\-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
const output=(cols,rows)=>[cols.join(','),...rows.map(r=>r.map(csvCell).join(','))].join('\r\n');
export async function onRequestGet({request,env}){
 try{
  await requireAdmin(request,env,true);await ensureSecurityJournal(env);
  const db=env.COMMUNITY_DB;const kind=new URL(request.url).searchParams.get('kind');
  let columns,rows;
  if(kind==='events'){
   columns=['Data','Typ','Konto','Urządzenie','Skrót IP','Szczegóły'];
   const q=await db.prepare(`SELECT j.created_at,j.event,
       COALESCE(p.display_name,'Nieznane/usunięte konto') name,j.device,
       substr(j.ip_fingerprint,1,10) ip,j.detail FROM aio_security_journal j
       LEFT JOIN community_profiles p ON p.id=j.user_id
       ORDER BY j.created_at DESC LIMIT 3000`).all();
   rows=(q.results||[]).map(x=>[x.created_at,x.event,x.name,x.device,x.ip,x.detail]);
  }else if(kind==='accounts'){
   columns=['Konto','Zdarzenia','Logowania','Błędne logowania'];
   const ago=new Date(Date.now()-7*86400000).toISOString();
   const q=await db.prepare(`SELECT COALESCE(p.display_name,'Usunięte konto') name,COUNT(*) n,
       SUM(CASE WHEN j.event='login_ok' THEN 1 ELSE 0 END) good,
       SUM(CASE WHEN j.event='login_failed' THEN 1 ELSE 0 END) bad
       FROM aio_security_journal j LEFT JOIN community_profiles p ON p.id=j.user_id
       WHERE j.user_id IS NOT NULL AND j.created_at>=? GROUP BY j.user_id,p.display_name
       ORDER BY n DESC LIMIT 1000`).bind(ago).all();
   rows=(q.results||[]).map(x=>[x.name,x.n,x.good,x.bad]);
  }else if(kind==='types'){
   columns=['Rodzaj zdarzenia','Liczba (7 dni)'];
   const ago=new Date(Date.now()-7*86400000).toISOString();
   const q=await db.prepare(`SELECT event,COUNT(*) n FROM aio_security_journal WHERE created_at>=? GROUP BY event ORDER BY n DESC`).bind(ago).all();
   rows=(q.results||[]).map(x=>[x.event,x.n]);
  }else if(kind==='holds'){
   columns=['Typ','Konto','Status','Początek','Koniec'];
   const [shared,paid]=await Promise.all([
    db.prepare(`SELECT COALESCE(p.display_name,'Usunięte konto') name,h.status,h.created_at,h.expires_at
       FROM aio_security_shared_holds h LEFT JOIN community_profiles p ON p.id=h.user_id ORDER BY h.created_at DESC LIMIT 1000`).all(),
    db.prepare(`SELECT COALESCE(p.display_name,'Usunięte konto') name,h.status,h.created_at,h.expires_at
       FROM aio_security_paid_holds h LEFT JOIN community_profiles p ON p.id=h.user_id ORDER BY h.created_at DESC LIMIT 1000`).all()
   ]);
   rows=[...(shared.results||[]).map(x=>['Wspólne IP',x.name,x.status,x.created_at,x.expires_at]),...(paid.results||[]).map(x=>['Konto płatne',x.name,x.status,x.created_at,x.expires_at])];
  }else if(kind==='allowances'){
   columns=['Konto','Skrót IP','Data','Ważność'];
   const q=await db.prepare(`SELECT COALESCE(p.display_name,'Usunięte konto') name,
      substr(a.ip_fingerprint,1,10) ip,a.created_at,a.expires_at FROM aio_security_shared_allow a
      LEFT JOIN community_profiles p ON p.id=a.user_id ORDER BY a.created_at DESC LIMIT 1000`).all();
   rows=(q.results||[]).map(x=>[x.name,x.ip,x.created_at,x.expires_at]);
  }else return new Response('Nieznana kategoria.',{status:400});
  const csv='\ufeff'+output(columns,rows);
  return new Response(csv,{status:200,headers:{'Content-Type':'text/csv; charset=utf-8','Cache-Control':'private, no-store','Content-Disposition':`attachment; filename="AIO-security-${kind}-${new Date().toISOString().slice(0,10)}.csv"`,'X-Content-Type-Options':'nosniff'}});
 }catch(e){return new Response('Odmowa dostępu lub błąd eksportu.',{status:[401,403].includes(e?.status)?e.status:500,headers:{'cache-control':'no-store'}});}
}
