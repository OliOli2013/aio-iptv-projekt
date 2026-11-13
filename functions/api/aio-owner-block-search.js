/* AIO TunerHub — owner-only account restrictions search V1.
 * Read-only.  Aggregate per-account source records without assuming they are
 * distinct users or that a historical entry is still active.
 * No IP, account details or reasons are exposed to unauthenticated users.
 */
import {requireAdmin} from '../_community.js';

const HEAD={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEAD});
const sources=['profile','strict_v4','ip_v8','v6','shared','paid'];
const states=['active','released','expired','all'];
const recordsSQL=`
SELECT 'profile' AS source,p.id AS user_id,COALESCE(p.banned_at,p.updated_at,p.created_at) AS started_at,
 p.banned_until AS ends_at,CASE WHEN p.banned_until>? THEN 'active' ELSE 'expired' END AS state,
 COALESCE(p.ban_reason,'Blokada profilu') AS reason
 FROM community_profiles p WHERE p.banned_until IS NOT NULL
UNION ALL
SELECT 'strict_v4',user_id,created_at,NULL,
 CASE WHEN status='active' THEN 'active' ELSE 'released' END,reason
 FROM aio_strict_ip_holds_v4
UNION ALL
SELECT 'ip_v8',user_id,created_at,NULL,
 CASE WHEN status='active' THEN 'active' ELSE 'released' END,reason
 FROM aio_ip_policy_holds_v8
UNION ALL
SELECT 'v6',user_id,created_at,expires_at,
 CASE WHEN status='active' AND expires_at>? THEN 'active' WHEN status='active' THEN 'expired' ELSE 'released' END,
 reason FROM aio_v6_blocks
UNION ALL
SELECT 'shared',user_id,created_at,expires_at,
 CASE WHEN status='active' AND expires_at>? THEN 'active' WHEN status='active' THEN 'expired' ELSE 'released' END,
 'Ograniczenie powiązane z sesjami / dostępem' FROM aio_security_shared_holds
UNION ALL
SELECT 'paid',user_id,created_at,expires_at,
 CASE WHEN status='active' AND expires_at>? THEN 'active' WHEN status='active' THEN 'expired' ELSE 'released' END,
 'Ograniczenie dostępu płatnego' FROM aio_security_paid_holds`;
const withSql='WITH records AS ('+recordsSQL+') ';
const joinedSql=`FROM records r JOIN community_profiles p ON p.id=r.user_id
 LEFT JOIN community_auth a ON a.user_id=r.user_id`;
const whereSql=`WHERE (r.source=? OR ?='all') AND (r.state=? OR ?='all')
 AND (?='' OR instr(lower(COALESCE(p.display_name,'')),?)>0
           OR instr(lower(COALESCE(a.email,'')),?)>0
           OR instr(lower(p.id),?)>0)`;
const labels={profile:'Blokada profilu',strict_v4:'Multikonta V4',ip_v8:'Polityka IP V8.2',v6:'Security V6',shared:'Współdzielony dostęp',paid:'Dostęp VIP'};
export async function onRequestGet({request,env}){
 try{
  await requireAdmin(request,env,true);
  const url=new URL(request.url),q=String(url.searchParams.get('q')||'').trim().slice(0,120);
  const source=String(url.searchParams.get('source')||'all');
  const state=String(url.searchParams.get('state')||'active');
  if(![...sources,'all'].includes(source)||!states.includes(state))return reply({ok:false,error:'Nieprawidłowe filtry.'},400);
  const limit=50,offset=Math.max(0,Math.min(100000,Number.parseInt(url.searchParams.get('offset')||'0',10)||0));
  const now=new Date().toISOString(),phrase=q.toLocaleLowerCase('pl-PL');
  const params=[now,now,now,now,source,source,state,state,phrase,phrase,phrase,phrase];
  const db=env.COMMUNITY_DB;
  const summary=await db.prepare(withSql+`SELECT COUNT(*) AS records,COUNT(DISTINCT r.user_id) AS accounts,
    SUM(CASE WHEN r.state='active' THEN 1 ELSE 0 END) AS active_records `+joinedSql+' '+whereSql)
    .bind(...params).first();
  const data=await db.prepare(withSql+`SELECT r.user_id,p.display_name AS name,a.email,r.source,r.started_at,
      r.ends_at,r.state,r.reason `+joinedSql+' '+whereSql+`
      ORDER BY CASE WHEN r.state='active' THEN 0 ELSE 1 END,r.started_at DESC,r.user_id
      LIMIT ? OFFSET ?`)
    .bind(...params,limit,offset).all();
  const rows=(data.results||[]).map(r=>({...r,source_label:labels[r.source]||r.source}));
  return reply({ok:true,version:'AIO_OWNER_BLOCK_SEARCH_V1',checked_at:now,q,source,state,offset,limit,
    totals:{records:Number(summary?.records||0),accounts:Number(summary?.accounts||0),active_records:Number(summary?.active_records||0)},
    rows,has_more:offset+rows.length<Number(summary?.records||0)});
 }catch(e){
  const status=e?.status===401?401:e?.status===403?403:500;
  if(status===500)console.error('[AIO owner block search]',String(e?.message||e).slice(0,240));
  return reply({ok:false,error:status===500?'Nie udało się odczytać rejestrów ograniczeń. Sprawdź logi Cloudflare.':'Dostęp tylko dla właściciela.'},status);
 }
}
