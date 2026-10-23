/* AIO Unified Security Center V1: read-only owner analytics + explicit incident acknowledgement.
 * D1 logs are NOT Cloudflare WAF telemetry. Never infer identity from one IP fingerprint.
 */
import {requireAdmin,moderationLog} from '../_community.js';
import {ensureAnonymousShield} from '../_aio_anon_shield_v1.js';
import {ensureV6} from '../_aio_security_v6.js';
import {ensureIpPolicy} from '../_aio_ip_one_account_v7.js';
import {ensureSecurityJournal} from '../_aio_security_journal.js';
const HEAD={'cache-control':'private, no-store','x-content-type-options':'nosniff','vary':'Cookie'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...HEAD,'content-type':'application/json; charset=utf-8'}});
const cut=v=>String(v??'').slice(0,160);
const cell=v=>{let s=String(v??'');if(/^\s*[=+@\-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
async function ready(env){await Promise.all([ensureAnonymousShield(env),ensureV6(env),ensureIpPolicy(env),ensureSecurityJournal(env)]);}
const sources=(cutoff,now,ownerId)=>({
  kinds:{sql:'SELECT event,COUNT(*) n FROM aio_security_journal WHERE created_at>=? GROUP BY event ORDER BY n DESC LIMIT 35',args:[cutoff]},
  fingerprint_patterns:{sql:`SELECT substr(j.ip_fingerprint,1,12) network,COUNT(*) requests,
      COUNT(DISTINCT j.user_id) accounts,
      SUM(CASE WHEN j.event='download_denied' THEN 1 ELSE 0 END) denied,
      SUM(CASE WHEN j.event='login_failed' THEN 1 ELSE 0 END) failed,
      SUM(CASE WHEN j.event='login_throttled' THEN 1 ELSE 0 END) throttled,
      MIN(j.created_at) first_seen,MAX(j.created_at) last_seen
      FROM aio_security_journal j WHERE j.created_at>=? AND j.ip_fingerprint IS NOT NULL
      AND (j.user_id IS NULL OR j.user_id NOT IN (?, ?, ?))
      GROUP BY j.ip_fingerprint HAVING COUNT(*)>=12
      ORDER BY requests DESC LIMIT 25`,args:[cutoff,ownerId,'c2847d96-0867-4b6c-a53b-700059b1a403','8ff5c4f0-2742-4a10-b4b0-20c9713d708a']},
  incidents:{sql:`SELECT id,substr(fingerprint,1,12) network,created_at,blocked_until,hits_10s,hits_60s,reviewed_at
      FROM aio_anon_shield_incidents ORDER BY created_at DESC LIMIT 100`,args:[]},
  v6:{sql:`SELECT b.user_id,p.display_name name,b.origin,b.reason,b.created_at,b.expires_at,b.reviewed_at
      FROM aio_v6_blocks b LEFT JOIN community_profiles p ON p.id=b.user_id
      WHERE b.status='active' AND b.expires_at>? ORDER BY b.created_at DESC LIMIT 80`,args:[now]},
  ip:{sql:`SELECT h.user_id,p.display_name name,h.created_at,h.status,h.reason,
      CASE WHEN r.user_id IS NULL THEN 0 ELSE 1 END reviewed
      FROM aio_ip_policy_holds_v8 h LEFT JOIN community_profiles p ON p.id=h.user_id
      LEFT JOIN aio_ip_policy_hold_reviews_v9 r ON r.user_id=h.user_id AND r.ip_key=h.ip_key AND r.hold_created_at=h.created_at
      WHERE h.status='active' AND h.user_id NOT IN (?,?,?) ORDER BY h.created_at DESC LIMIT 80`,args:[ownerId,'c2847d96-0867-4b6c-a53b-700059b1a403','8ff5c4f0-2742-4a10-b4b0-20c9713d708a']},
  other_holds:{sql:`SELECT 'Wspólna sieć' kind,h.user_id,p.display_name name,h.created_at,h.expires_at
      FROM aio_security_shared_holds h LEFT JOIN community_profiles p ON p.id=h.user_id
      WHERE h.status='active' AND h.expires_at>?
      UNION ALL SELECT 'Konto płatne/VIP',h.user_id,p.display_name,h.created_at,h.expires_at
      FROM aio_security_paid_holds h LEFT JOIN community_profiles p ON p.id=h.user_id
      WHERE h.status='active' AND h.expires_at>? ORDER BY created_at DESC LIMIT 80`,args:[now,now]},
  active_anonymous:{sql:'SELECT COUNT(*) n FROM aio_anon_shield_bans WHERE blocked_until_ms>?',args:[Date.now()]},
  unread_anonymous:{sql:'SELECT COUNT(*) n FROM aio_anon_shield_incidents WHERE reviewed_at IS NULL',args:[]}
});
export async function onRequestGet({request,env}){
  try{
    const auth=await requireAdmin(request,env,true);await ready(env);
    const query=new URL(request.url).searchParams;
    const now=new Date().toISOString(),cutoff=new Date(Date.now()-7*86400000).toISOString();
    const defs=sources(cutoff,now,auth.user.id),db=env.COMMUNITY_DB,info={},unavailable=[];
    const rows=await Promise.allSettled(Object.entries(defs).map(async([name,spec])=>{
      const stmt=db.prepare(spec.sql);const rs=await (spec.args.length?stmt.bind(...spec.args):stmt).all();return [name,rs.results||[]];
    }));
    Object.keys(defs).forEach((name,i)=>{if(rows[i].status==='fulfilled')info[name]=rows[i].value[1];else unavailable.push(name);});
    if(query.get('format')==='csv'){
      const all=[['Sekcja','Data','Konto/Źródło','Typ','Status','Informacja']];
      for(const r of info.v6||[])all.push(['V6',r.created_at,r.name||r.user_id,r.origin,'aktywna',r.reason]);
      for(const r of info.ip||[])all.push(['IP V8.2',r.created_at,r.name||r.user_id,'blokada',r.reviewed?'przejrzana':'do przejrzenia',r.reason]);
      for(const r of info.other_holds||[])all.push(['Pozostałe',r.created_at,r.name||r.user_id,r.kind,'aktywna','Ważność: '+r.expires_at]);
      for(const r of info.incidents||[])all.push(['Anonim',r.created_at,r.network,'anonimowa fala',r.reviewed_at?'przejrzana':'do przejrzenia','10s: '+r.hits_10s+', 60s: '+r.hits_60s]);
      const body='\ufeff'+all.map(row=>row.map(cell).join(',')).join('\r\n');
      return new Response(body,{status:200,headers:{...HEAD,'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="AIO-security-center-'+now.slice(0,10)+'.csv"'}});
    }
    return reply({ok:true,checked_at:now,window_hours:168,data:info,unavailable,complete:!unavailable.length,
      note:'To wybrane dane D1, bez logów Cloudflare WAF. Skrót IP jest sygnałem sieciowym, nie identyfikuje osoby.'});
  }catch(e){const c=e?.status===401?401:e?.status===403?403:500;return reply({ok:false,error:c===500?'Nie udało się odczytać Centrum Bezpieczeństwa.':'Brak dostępu właściciela.'},c);}
}
export async function onRequestPost({request,env}){
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin)return reply({ok:false,error:'Niedozwolone źródło.'},403);
  if(request.headers.get('Sec-Fetch-Site')==='cross-site')return reply({ok:false,error:'Niedozwolone żądanie.'},403);
  if(!String(request.headers.get('Content-Type')||'').includes('application/json'))return reply({ok:false,error:'Wymagany JSON.'},415);
  try{
    const owner=await requireAdmin(request,env,true);await ensureAnonymousShield(env);
    const body=await request.json();if(body.action!=='review_anonymous'&&body.action!=='review_all_anonymous')return reply({ok:false,error:'Nieznane działanie.'},400);
    if(body.confirm!==true)return reply({ok:false,error:'Potwierdź operację.'},400);
    const at=new Date().toISOString();let result;
    if(body.action==='review_anonymous'){
      if(!/^[0-9a-f-]{36}$/i.test(String(body.id||'')))return reply({ok:false,error:'Niepoprawne ID.'},400);
      result=await env.COMMUNITY_DB.prepare('UPDATE aio_anon_shield_incidents SET reviewed_at=?,reviewed_by=? WHERE id=? AND reviewed_at IS NULL')
        .bind(at,owner.user.id,String(body.id)).run();
    }else{
      result=await env.COMMUNITY_DB.prepare('UPDATE aio_anon_shield_incidents SET reviewed_at=?,reviewed_by=? WHERE reviewed_at IS NULL')
        .bind(at,owner.user.id).run();
    }
    const reviewed=Math.max(0,Number(result.meta?.changes||0));
    if(reviewed)await moderationLog(env,owner.user.id,{targetType:'user',targetId:owner.user.id,action:'anon_shield_incidents_reviewed',reason:'Przejrzano '+reviewed+' zagregowanych zdarzeń. Nie cofnięto ograniczeń.'});
    return reply({ok:true,reviewed,message:'Przejrzano '+reviewed+' zdarzeń. Automatyczne ograniczenia pozostają niezależne.'});
  }catch(e){const c=e?.status===401?401:e?.status===403?403:500;return reply({ok:false,error:c===500?'Nie można zapisać potwierdzenia.':'Brak dostępu.'},c);}
}
