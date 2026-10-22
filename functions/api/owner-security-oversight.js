/* AIO Security Control V5 — read-only, owner-only correlated security views.
 * No credentials, tokens or raw e-mail addresses in these exports.
 * All administrative changes remain in pre-existing audited V4 endpoints.
 */
import {requireAdmin} from '../_community.js';
import {ensureSecurityJournal} from '../_aio_security_journal.js';
import {cleanupV6} from '../_aio_security_v6.js';
import {ensureEmailBlockTable} from '../_aio_email_blocks.js';

const HEAD={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...HEAD,'content-type':'application/json; charset=utf-8'}});
const csvCell=value=>{
  let s=String(value??'');
  if(/^\s*[=+@\-]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
};
const safeInt=(raw,max)=>Math.min(max,Math.max(0,Number.parseInt(String(raw||'0'),10)||0));
const NOW=()=>new Date().toISOString();

// Stable per-account identifiers distinguish people using the same display name.
// Absence of a subject ID remains NULL; never infer an account from a name or IP.
const queries={
  accounts:{sql:`SELECT p.id id,p.id user_id,p.display_name account_name,NULL related_user_id,
    NULL related_name,'account' kind,p.banned_at created_at,p.banned_until expires_at,
    p.ban_reason detail,'active' status,p.role role,NULL extra
    FROM community_profiles p WHERE p.banned_until > ? ORDER BY p.banned_until ASC,p.id ASC`,params:n=>[n]},
  ips:{sql:`SELECT b.id id,b.target_user_id user_id,p.display_name account_name,
    NULL related_user_id,NULL related_name,'ip' kind,b.created_at created_at,b.expires_at expires_at,
    b.reason detail,'active' status,NULL role,b.ip_address extra
    FROM community_ip_blocks b LEFT JOIN community_profiles p ON p.id=b.target_user_id
    WHERE b.active=1 AND (b.permanent=1 OR (b.expires_at IS NOT NULL AND b.expires_at>?))
    ORDER BY b.permanent DESC,b.expires_at ASC,b.created_at DESC`,params:n=>[n]},
  emails:{sql:`SELECT b.email_hash id,b.user_id user_id,p.display_name account_name,
    NULL related_user_id,NULL related_name,'email' kind,b.created_at created_at,
    NULL expires_at,b.reason detail,'active' status,NULL role,substr(b.email_hash,1,12) extra
    FROM aio_owner_email_blocks b LEFT JOIN community_profiles p ON p.id=b.user_id
    ORDER BY b.created_at DESC`,params:()=>[]},
  holds:{sql:`SELECT h.id id,h.user_id user_id,p.display_name account_name,h.peer_user_id related_user_id,
    p2.display_name related_name,'shared' kind,h.created_at created_at,h.expires_at expires_at,
    'Wspólne IP: tymczasowa blokada pobierania' detail,h.status status,NULL role,NULL extra
    FROM aio_security_shared_holds h LEFT JOIN community_profiles p ON p.id=h.user_id
    LEFT JOIN community_profiles p2 ON p2.id=h.peer_user_id
    WHERE h.status='active' AND h.expires_at>?
    UNION ALL
    SELECT h.id,h.user_id,p.display_name,NULL,NULL,'paid',h.created_at,h.expires_at,
    h.evidence,h.status,NULL,NULL
    FROM aio_security_paid_holds h LEFT JOIN community_profiles p ON p.id=h.user_id
    WHERE h.status='active' AND h.expires_at>?`,params:n=>[n,n]},
  allowances:{sql:`SELECT a.user_id || ':' || a.ip_fingerprint id,a.user_id user_id,p.display_name account_name,
    NULL related_user_id,NULL related_name,'network-exception' kind,a.created_at created_at,
    a.expires_at expires_at,'Zatwierdzona współdzielona sieć' detail,'active' status,NULL role,
    substr(a.ip_fingerprint,1,12) extra
    FROM aio_security_shared_allow a LEFT JOIN community_profiles p ON p.id=a.user_id
    WHERE a.expires_at>? ORDER BY a.expires_at ASC`,params:n=>[n]},
  reports:{sql:`SELECT r.id id,r.reporter_id user_id,reporter.display_name account_name,
    CASE WHEN r.target_type='user' THEN r.target_id
         WHEN r.target_type='post' THEN post.author_id
         WHEN r.target_type='comment' THEN comment.author_id ELSE NULL END related_user_id,
    subject.display_name related_name,'report' kind,r.created_at created_at,NULL expires_at,
    r.reason detail,r.status status,NULL role,r.target_type extra
    FROM community_reports r LEFT JOIN community_profiles reporter ON reporter.id=r.reporter_id
    LEFT JOIN community_posts post ON r.target_type='post' AND post.id=r.target_id
    LEFT JOIN community_comments comment ON r.target_type='comment' AND comment.id=r.target_id
    LEFT JOIN community_profiles subject ON subject.id=CASE
      WHEN r.target_type='user' THEN r.target_id
      WHEN r.target_type='post' THEN post.author_id
      WHEN r.target_type='comment' THEN comment.author_id ELSE NULL END
    WHERE r.status='open' ORDER BY r.created_at DESC`,params:()=>[]},
  messages:{sql:`SELECT m.id id,m.sender_id user_id,p.display_name account_name,NULL related_user_id,
    NULL related_name,'message' kind,m.created_at created_at,NULL expires_at,m.subject detail,
    m.status status,NULL role,m.kind extra
    FROM aio_list_inbox m LEFT JOIN community_profiles p ON p.id=m.sender_id
    WHERE m.status='new' ORDER BY m.created_at DESC`,params:()=>[]},
  support:{sql:`SELECT i.id id,i.user_id user_id,p.display_name account_name,NULL related_user_id,
    NULL related_name,'support-intent' kind,i.created_at created_at,NULL expires_at,
    i.purpose || ' / ' || i.method detail,i.status status,NULL role,i.reference extra
    FROM aio_support_intents i LEFT JOIN community_profiles p ON p.id=i.user_id
    WHERE i.status='reported'
    UNION ALL
    SELECT a.id,a.user_id,p.display_name,NULL,NULL,'access-request',a.created_at,NULL,
    COALESCE(a.method,'') || ' / wniosek 7 dni',a.status,NULL,NULL
    FROM aio_access_approval_requests a LEFT JOIN community_profiles p ON p.id=a.user_id
    WHERE a.status='pending'`,params:()=>[]},
  resets:{sql:`SELECT r.id id,r.user_id user_id,p.display_name account_name,
    NULL related_user_id,NULL related_name,'password-reset' kind,r.created_at created_at,
    r.expires_at expires_at,'Prośba o reset hasła' detail,r.status status,NULL role,NULL extra
    FROM community_password_reset_requests r LEFT JOIN community_profiles p ON p.id=r.user_id
    WHERE r.status IN ('pending','approved') ORDER BY r.created_at DESC`,params:()=>[]}
};

function sqlFor(kind){
  const q=queries[kind];if(!q)return null;
  // Union and basic selects both support an outer SELECT for ordering/pagination.
  return {count:`SELECT COUNT(*) n FROM (${q.sql})`,
    rows:`SELECT * FROM (${q.sql}) ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
    params:q.params};
}
async function count(db,kind,now){
  const q=sqlFor(kind);const r=await db.prepare(q.count).bind(...q.params(now)).first();return Number(r?.n||0);
}
async function rows(db,kind,now,limit,offset){
  const q=sqlFor(kind);const r=await db.prepare(q.rows).bind(...q.params(now),limit,offset).all();return r.results||[];
}
function error(e){
  const status=[401,403].includes(e?.status)?e.status:500;
  return json({ok:false,error:status===500?'Nie udało się pobrać danych bezpieczeństwa.': 'Brak uprawnień właściciela.'},status);
}
export async function onRequestGet({request,env}){
  try{
    await requireAdmin(request,env,true);
    await ensureSecurityJournal(env);
    await ensureEmailBlockTable(env);
    await cleanupV6(env); // Opportunistic expiry cleanup; no scheduled background work.
    const url=new URL(request.url),kind=url.searchParams.get('kind')||'accounts',format=url.searchParams.get('format')||'json';
    if(!queries[kind]||!['json','csv'].includes(format))return json({ok:false,error:'Nieznany zakres eksportu.'},400);
    const now=NOW(),db=env.COMMUNITY_DB,offset=safeInt(url.searchParams.get('offset'),100000);
    if(format==='csv'){
      const limit=3000;
      const all=await rows(db,kind,now,limit,offset);
      const columns=['Rodzaj','ID wpisu','ID konta','Nazwa konta','ID powiązanego konta',
        'Nazwa powiązanego konta','Początek','Koniec','Stan','Szczegóły','Dodatkowe'];
      const data=all.map(r=>[r.kind,r.id,r.user_id,r.account_name,r.related_user_id,
        r.related_name,r.created_at,r.expires_at,r.status,r.detail,r.extra]);
      const body='\ufeff'+[columns,...data].map(x=>x.map(csvCell).join(',')).join('\r\n');
      return new Response(body,{status:200,headers:{...HEAD,'content-type':'text/csv; charset=utf-8',
        'content-disposition':`attachment; filename="AIO-security-control-${kind}-${now.slice(0,10)}.csv"`}});
    }
    const pageSize=100;
    const keys=Object.keys(queries);
    const settled=await Promise.allSettled(keys.map(key=>count(db,key,now)));
    const totals={},warnings=[];
    for(let i=0;i<keys.length;i++){
      totals[keys[i]]=settled[i].status==='fulfilled'?settled[i].value:null;
      if(settled[i].status==='rejected')warnings.push('Nie można odczytać zakresu: '+keys[i]);
    }
    if(totals[kind]===null)return json({ok:false,error:'Moduł '+kind+' nie jest dostępny w bazie. Pozostałe dane nie zostały zmienione.',warnings},503);
    const records=await rows(db,kind,now,pageSize,offset);
    return json({ok:true,kind,generated_at:now,totals,warnings,rows:records,
      pagination:{offset,limit:pageSize,total:totals[kind],has_more:offset+records.length<totals[kind]},
      note:'Blokady uwzględniają ważność i status. Limity logowania w pamięci tymczasowej nie są listą kont i nie są tu wyświetlane.'});
  }catch(e){console.error('AIO owner oversight read:',String(e?.message||'error').slice(0,180));return error(e);}
}
