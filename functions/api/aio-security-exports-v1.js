/* AIO Security Exports V1 — owner-only, bounded, read-only D1 exports.
 * No raw IP, email, password, session token or provider API key is exported.
 * Missing source -> explicit error (never silently treated as empty).
 */
import {requireAdmin} from '../_community.js';

const PAGE_SIZE=400;
const MAX_PAGES=100;
const COMMON={'cache-control':'private, no-store','vary':'Cookie','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow'};
const respond=(body,code=200,headers={})=>new Response(body,{status:code,headers:{...COMMON,...headers}});
const json=(data,code=200)=>respond(JSON.stringify(data),code,{'content-type':'application/json; charset=utf-8'});
const formulaSafe=v=>{
  const s=String(v??'').replace(/\u0000/g,'');
  // Guard against spreadsheet formula injection, including leading CR/LF/TAB.
  return /^[\s\uFEFF]*[=+@\-]/u.test(s)?"'"+s:s;
};
export const csvCell=v=>'"'+formulaSafe(v).replace(/"/g,'""')+'"';
export const toCsv=(columns,rows)=>'\ufeff'+[columns,...rows.map(r=>columns.map(c=>r[c]??'').map(csvCell))].map(r=>r.join(',')).join('\r\n')+'\r\n';

// Every query is fixed and has an explicit allowlist of columns.
export const SOURCES={
 'vpn-config':{
   title:'VPN Guard — stan konfiguracji (bez sekretów)',group:'VPN Guard',
   columns:['generated_at','mode','provider_ready','hmac_ready','configured','daily_budget'],
   sql:`SELECT ? generated_at,? mode,? provider_ready,? hmac_ready,
     ? configured,? daily_budget`,
   params:(now,env)=>{
     const key=String(env.AIO_VPN_GUARD_API_KEY||'').trim();
     const hash=String(env.AIO_VPN_GUARD_HMAC_SECRET||env.AIO_MULTIKONTA_HMAC_SECRET||'').trim();
     const mode=String(env.AIO_VPN_GUARD_MODE||'monitor').toLowerCase()==='enforce'?'enforce':'monitor';
     const max=Number(env.AIO_VPN_GUARD_DAILY_BUDGET||400);
     const limit=Number.isFinite(max)?Math.max(20,Math.min(900,Math.floor(max))):400;
     return [now,mode,key.length>=12?1:0,hash.length>=32?1:0,
       key.length>=12&&hash.length>=32?1:0,limit];
   }},
 'core-state':{
   title:'Security Core — liczniki blokad i limity',group:'Bezpieczeństwo Core',
   columns:['generated_at','blocked_profiles','strict_v4','ip_v8','v6','monthly_free_limit','public_aio_panel_ipk'],
   sql:`SELECT ? generated_at,
     (SELECT COUNT(*) FROM community_profiles WHERE banned_until>?) blocked_profiles,
     (SELECT COUNT(DISTINCT user_id) FROM aio_strict_ip_holds_v4 WHERE status='active') strict_v4,
     (SELECT COUNT(DISTINCT user_id) FROM aio_ip_policy_holds_v8 WHERE status='active') ip_v8,
     (SELECT COUNT(DISTINCT user_id) FROM aio_v6_blocks WHERE status='active' AND expires_at>?) v6,
     3 monthly_free_limit,1 public_aio_panel_ipk`,
   params:now=>[now,now,now]},
 'vpn-reviews':{
   title:'VPN Guard — wyniki skanów kont',group:'VPN Guard',
   columns:['user_id','account','kind','flags','service','samples','checked_at','reviewed_at','reviewed_by'],
   sql:`SELECT r.user_id,COALESCE(p.display_name,'Konto usunięte') account,
     r.verdict kind,r.flags,r.service,r.samples,r.checked_at,r.reviewed_at,r.reviewed_by
     FROM aio_vpn_guard_reviews_v1 r LEFT JOIN community_profiles p ON p.id=r.user_id
     ORDER BY r.checked_at DESC,r.user_id DESC`},
 'vpn-signups':{
   title:'VPN Guard — wykryte podejrzane rejestracje (30 dni)',group:'VPN Guard',
   columns:['id','kind','decision','created_at'],
   sql:`SELECT id,kind,decision,created_at FROM aio_vpn_guard_signups_v1
     ORDER BY created_at DESC,id DESC`},
 'vpn-budget':{
   title:'VPN Guard — zużycie budżetu API',group:'VPN Guard',
   columns:['day','used'],
   sql:`SELECT day,used FROM aio_vpn_guard_budget_v1 ORDER BY day DESC`},
 'vpn-cache':{
   title:'VPN Guard — anonimowa klasyfikacja IP (cache)',group:'VPN Guard',
   columns:['kind','flags','service','checked_at','expires_ms'],
   sql:`SELECT verdict kind,flags,service,checked_at,expires_ms FROM aio_vpn_guard_cache_v1
     ORDER BY checked_at DESC,ip_key DESC`},
 'profile-bans':{
   title:'Aktywne blokady profili',group:'Blokady',
   columns:['user_id','account','role','ban_reason','banned_until','updated_at'],
   sql:`SELECT id user_id,display_name account,role,ban_reason,banned_until,updated_at
     FROM community_profiles WHERE banned_until>? ORDER BY banned_until DESC,id DESC`,params:(now)=>[now]},
 'strict-v4':{
   title:'Multikonta Strict V4 — pełna historia',group:'Blokady',
   columns:['user_id','account','primary_user_id','status','reason','created_at'],
   sql:`SELECT h.user_id,COALESCE(p.display_name,'Konto usunięte') account,h.primary_user_id,
     h.status,h.reason,h.created_at
     FROM aio_strict_ip_holds_v4 h LEFT JOIN community_profiles p ON p.id=h.user_id
     ORDER BY h.created_at DESC,h.user_id DESC`},
 'ip-v8':{
   title:'IP Policy V8/V10 — blokady i zwolnienia',group:'Blokady',
   columns:['user_id','account','status','reason','created_at','released_at','released_by'],
   sql:`SELECT h.user_id,COALESCE(p.display_name,'Konto usunięte') account,h.status,h.reason,
     h.created_at,h.released_at,h.released_by
     FROM aio_ip_policy_holds_v8 h LEFT JOIN community_profiles p ON p.id=h.user_id
     ORDER BY h.created_at DESC,h.user_id DESC`},
 'ip-denials':{
   title:'IP Policy V10 — próby dodatkowych kont',group:'Blokady',
   columns:['kind','attempts','first_at','last_at','reviewed_at','last_account'],
   sql:`SELECT d.kind,d.attempts,d.first_at,d.last_at,d.reviewed_at,
     COALESCE(p.display_name,'—') last_account
     FROM aio_ip_policy_denials_v10 d LEFT JOIN community_profiles p ON p.id=d.last_user_id
     ORDER BY d.last_at DESC,d.kind DESC`},
 'v6':{
   title:'Security V6 — blokady i historia',group:'Blokady',
   columns:['user_id','account','origin','status','reason','created_at','expires_at','reviewed_at','released_at'],
   sql:`SELECT b.user_id,COALESCE(p.display_name,'Konto usunięte') account,
     b.origin,b.status,b.reason,b.created_at,b.expires_at,b.reviewed_at,b.released_at
     FROM aio_v6_blocks b LEFT JOIN community_profiles p ON p.id=b.user_id
     ORDER BY b.created_at DESC,b.user_id DESC`},
 'multikonta':{
   title:'Multikonta V2 — ręczne weryfikacje',group:'Weryfikacja',
   columns:['user_id','account','peer_user_id','peer_account','risk_score','indicators','status','created_at','reviewed_at'],
   sql:`SELECT r.user_id,COALESCE(p.display_name,'Konto usunięte') account,
     r.peer_user_id,COALESCE(peer.display_name,'—') peer_account,r.risk_score,
     r.indicators,r.status,r.created_at,r.reviewed_at
     FROM aio_multikonta_reviews_v2 r LEFT JOIN community_profiles p ON p.id=r.user_id
     LEFT JOIN community_profiles peer ON peer.id=r.peer_user_id
     ORDER BY r.created_at DESC,r.user_id DESC`},
 'shield-incidents':{
   title:'Shield — anonimowe incydenty',group:'Monitorowanie',
   columns:['id','network_short','created_at','blocked_until','hits_10s','hits_60s','reviewed_at'],
   sql:`SELECT id,substr(fingerprint,1,12) network_short,created_at,blocked_until,
     hits_10s,hits_60s,reviewed_at
     FROM aio_anon_shield_incidents ORDER BY created_at DESC,id DESC`},
 'distributed-incidents':{
   title:'Shield — rozproszone fale anonimowe',group:'Monitorowanie',
   columns:['id','created_at','requests','networks','window_seconds','reviewed_at'],
   sql:`SELECT id,created_at,requests,networks,window_seconds,reviewed_at
     FROM aio_distributed_file_incidents_v1 ORDER BY created_at DESC,id DESC`},
 'security-events':{
   title:'Dziennik zdarzeń bezpieczeństwa',group:'Monitorowanie',
   columns:['id','created_at','event','user_id','account','device','network_short','detail'],
   sql:`SELECT j.id,j.created_at,j.event,j.user_id,
     COALESCE(p.display_name,'Nieznane/usunięte konto') account,j.device,
     substr(j.ip_fingerprint,1,10) network_short,substr(j.detail,1,500) detail
     FROM aio_security_journal j LEFT JOIN community_profiles p ON p.id=j.user_id
     ORDER BY j.created_at DESC,j.id DESC`}
};

export function getSourceManifest(){return Object.entries(SOURCES).map(([key,x])=>({kind:key,title:x.title,group:x.group}));}
export async function onRequestGet({request,env}){
 try{
  await requireAdmin(request,env,true);
  const u=new URL(request.url),format=u.searchParams.get('format')||'json',kind=u.searchParams.get('kind')||'';
  if(kind==='list')return json({ok:true,version:'AIO_SECURITY_EXPORTS_V1',sources:getSourceManifest(),page_size:PAGE_SIZE});
  if(!Object.hasOwn(SOURCES,kind)||!['json','csv'].includes(format))return json({ok:false,error:'Nieznany typ eksportu lub format.'},400);
  const raw=u.searchParams.get('page')||'1';
  if(!/^\d{1,3}$/.test(raw))return json({ok:false,error:'Niepoprawna strona.'},400);
  const page=Number(raw);
  if(!Number.isSafeInteger(page)||page<1||page>MAX_PAGES)return json({ok:false,error:'Zakres stron 1–100.'},400);
  const source=SOURCES[kind],db=env.COMMUNITY_DB;
  if(!db?.prepare)return json({ok:false,error:'Baza D1 jest niedostępna.'},503);
  const stamp=new Date().toISOString(),args=source.params?source.params(stamp,env):[];
  let all;
  try{
    all=await db.prepare(source.sql+' LIMIT ? OFFSET ?').bind(...args,PAGE_SIZE+1,(page-1)*PAGE_SIZE).all();
  }catch(e){
    console.error('[AIO Security Exports V1] '+kind,String(e?.message||e).slice(0,140));
    return json({ok:false,error:'Źródło '+kind+' jest niedostępne lub ma niezgodny schemat. Nie wyeksportowano pustego raportu.'},503);
  }
  const rows=all?.results||[],more=rows.length>PAGE_SIZE,part=rows.slice(0,PAGE_SIZE);
  if(format==='csv')return respond(toCsv(source.columns,part),200,{
    'content-type':'text/csv; charset=utf-8',
    'content-disposition':`attachment; filename="AIO-${kind}-${stamp.slice(0,10)}-p${page}.csv"`,
    'x-aio-has-more':String(more),'x-aio-rows':String(part.length)});
  return json({ok:true,version:'AIO_SECURITY_EXPORTS_V1',kind,title:source.title,
    exported_at:stamp,page,page_size:PAGE_SIZE,rows:part,columns:source.columns,
    has_more:more,partial:more&&page===MAX_PAGES,
    note:'Wyniki mogą obejmować ręczne decyzje administratora. Wspólny IP nie jest dowodem wspólnej osoby. Brak surowych IP i kluczy API.'});
 }catch(e){
  const s=e?.status===401?401:e?.status===403?403:500;
  return json({ok:false,error:s===500?'Błąd eksportu.':'Dostęp tylko dla zweryfikowanego właściciela.'},s);
 }
}
export async function onRequestPost(){return json({ok:false,error:'Operacje zapisu są wyłączone.'},405);}
