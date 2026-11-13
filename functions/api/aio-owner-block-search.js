/* AIO Owner account restrictions search V1.1 — source-isolated, read-only.
 * Each register is queried separately. A broken source does not hide other blocks.
 * Missing sources are explicitly reported; partial counters are never 'complete'.
 * Owner authorization happens before ALL database reads.
 */
import {requireAdmin} from '../_community.js';

const HEAD={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEAD});
const names=['profile','strict_v4','ip_v8','v6','shared','paid'];
const states=['active','released','expired','all'];
const labels={profile:'Blokada profilu',strict_v4:'Multikonta V4',ip_v8:'Polityka IP V8.2',v6:'Security V6',shared:'Współdzielony dostęp',paid:'Dostęp VIP'};
const MAX_ROWS_PER_SOURCE=5000;
const baseJoin=' LEFT JOIN community_profiles p ON p.id=h.user_id LEFT JOIN community_auth a ON a.user_id=h.user_id ';
const nameCols='h.user_id,p.display_name AS name,a.email';
const sourceSpec=(now)=>({
 profile:{sql:`SELECT 'profile' AS source,p.id AS user_id,p.display_name AS name,a.email,
   COALESCE(p.updated_at,p.created_at) AS started_at,p.banned_until AS ends_at,
   CASE WHEN p.banned_until>? THEN 'active' ELSE 'expired' END AS state,
   COALESCE(p.ban_reason,'Blokada profilu') AS reason
   FROM community_profiles p LEFT JOIN community_auth a ON a.user_id=p.id
   WHERE p.banned_until IS NOT NULL`,params:[now]},
 strict_v4:{sql:`SELECT 'strict_v4' AS source,${nameCols},h.created_at AS started_at,
   NULL AS ends_at,CASE WHEN h.status='active' THEN 'active' ELSE 'released' END AS state,
   h.reason FROM aio_strict_ip_holds_v4 h ${baseJoin}`,params:[]},
 ip_v8:{sql:`SELECT 'ip_v8' AS source,${nameCols},h.created_at AS started_at,
   NULL AS ends_at,CASE WHEN h.status='active' THEN 'active' ELSE 'released' END AS state,
   h.reason FROM aio_ip_policy_holds_v8 h ${baseJoin}`,params:[]},
 v6:{sql:`SELECT 'v6' AS source,${nameCols},h.created_at AS started_at,
   h.expires_at AS ends_at,
   CASE WHEN h.status='active' AND h.expires_at>? THEN 'active'
        WHEN h.status='active' THEN 'expired' ELSE 'released' END AS state,
   h.reason FROM aio_v6_blocks h ${baseJoin}`,params:[now]},
 shared:{sql:`SELECT 'shared' AS source,${nameCols},h.created_at AS started_at,
   h.expires_at AS ends_at,
   CASE WHEN h.status='active' AND h.expires_at>? THEN 'active'
        WHEN h.status='active' THEN 'expired' ELSE 'released' END AS state,
   'Ograniczenie powiązane z dostępem' AS reason
   FROM aio_security_shared_holds h ${baseJoin}`,params:[now]},
 paid:{sql:`SELECT 'paid' AS source,${nameCols},h.created_at AS started_at,
   h.expires_at AS ends_at,
   CASE WHEN h.status='active' AND h.expires_at>? THEN 'active'
        WHEN h.status='active' THEN 'expired' ELSE 'released' END AS state,
   'Ograniczenie dostępu płatnego' AS reason
   FROM aio_security_paid_holds h ${baseJoin}`,params:[now]}
});
const normal=v=>String(v??'').toLocaleLowerCase('pl-PL');
async function readSource(db,key,spec){
 // A hard cap protects D1. Reaching it is reported as an incomplete result.
 const statement=db.prepare(spec.sql+' LIMIT ?');
 const rs=await statement.bind(...spec.params,MAX_ROWS_PER_SOURCE+1).all();
 const rows=rs.results||[];
 return {name:key,rows:rows.slice(0,MAX_ROWS_PER_SOURCE),truncated:rows.length>MAX_ROWS_PER_SOURCE};
}
export async function onRequestGet({request,env}){
 try{
  await requireAdmin(request,env,true);
  const url=new URL(request.url),q=String(url.searchParams.get('q')||'').trim().slice(0,120);
  const source=String(url.searchParams.get('source')||'all');
  const state=String(url.searchParams.get('state')||'active');
  if(![...names,'all'].includes(source)||!states.includes(state))return reply({ok:false,error:'Nieprawidłowe filtry.'},400);
  const offset=Math.max(0,Math.min(100000,Number.parseInt(url.searchParams.get('offset')||'0',10)||0));
  const limit=50,now=new Date().toISOString(),phrase=normal(q),db=env.COMMUNITY_DB;
  if(!db)return reply({ok:false,error:'Baza danych jest niedostępna.'},503);
  const specs=sourceSpec(now),selected=source==='all'?names:[source];
  const results=await Promise.allSettled(selected.map(key=>readSource(db,key,specs[key])));
  const unavailable=[],truncated_sources=[],found=[];
  results.forEach((x,i)=>{
   const key=selected[i];
   if(x.status!=='fulfilled'){
    unavailable.push(key);
    console.error('[AIO Owner Block Search V1.1] D1 source '+key+':',String(x.reason?.message||x.reason||'Unknown error').slice(0,240));
   }else{
    found.push(...x.value.rows);
    if(x.value.truncated)truncated_sources.push(key);
   }
  });
  if(unavailable.length===selected.length)return reply({ok:false,error:'Nie udało się odczytać rejestrów ograniczeń. Sprawdź logi Cloudflare.',unavailable},503);
  const filtered=found.filter(r=>(state==='all'||r.state===state)&&(
      !phrase||[r.name,r.email,r.user_id].some(v=>normal(v).includes(phrase))));
  filtered.sort((a,b)=>Number(b.state==='active')-Number(a.state==='active')||
    String(b.started_at||'').localeCompare(String(a.started_at||''))||
    String(a.user_id||'').localeCompare(String(b.user_id||'')));
  const rows=filtered.slice(offset,offset+limit).map(r=>({...r,source_label:labels[r.source]||r.source}));
  const complete=!unavailable.length&&!truncated_sources.length;
  return reply({ok:true,version:'AIO_OWNER_BLOCK_SEARCH_V1_1',checked_at:now,q,source,state,offset,limit,
    complete,unavailable,truncated_sources,
    totals:{records:filtered.length,accounts:new Set(filtered.map(r=>r.user_id)).size,
      active_records:filtered.filter(r=>r.state==='active').length},
    rows,has_more:offset+rows.length<filtered.length});
 }catch(e){
  const status=e?.status===401?401:e?.status===403?403:500;
  if(status===500)console.error('[AIO Owner Block Search V1.1] unexpected:',String(e?.message||e).slice(0,240));
  return reply({ok:false,error:status===500?'Nie udało się odczytać rejestrów ograniczeń. Sprawdź logi Cloudflare.':'Dostęp tylko dla właściciela.'},status);
 }
}
