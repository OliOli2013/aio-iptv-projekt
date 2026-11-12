/* AIO Multikonta V3: owner-only historical IP correlation + explicit free-download review.
 * GET never changes accounts or creates holds. POST never bans IP or account.
 */
import {requireAdmin,moderationLog} from '../_community.js';
import {ipv6Prefix} from '../_aio_network_prefix_v1.js';
import {ensureMultikontaGuard} from '../_aio_multikonta_guard_v2.js';
import {isIpPolicyExemptV8} from '../_aio_ip_policy_exempt_v8.js';
import {registerLink,summarizePair,validIPv4} from '../_aio_multikonta_history_v3.js';
const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const fail=(status,msg)=>Object.assign(new Error(msg),{status});
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IPV4_GROUPS=1200,MAX_IPV6_ROWS=16000,CHUNK=400;
function queryError(e){return reply({ok:false,error:[400,401,403,409,415,422].includes(e.status)?e.message:'Nie udało się wykonać audytu D1.'},[400,401,403,409,415,422].includes(e.status)?e.status:503);}
async function roster(db){
  const r=await db.prepare(`SELECT p.id,p.display_name,p.role,p.created_at,COALESCE(a.email,p.email,'') email
    FROM community_profiles p LEFT JOIN community_auth a ON a.user_id=p.id
    WHERE p.role='user' ORDER BY p.created_at DESC LIMIT 10000`).all();
  return new Map((r.results||[]).map(x=>[x.id,x]));
}
async function allPairs(db,users){
  const pairs=new Map();let sharedIPv4=0,sharedIPv6=0,ipv6Rows=0;
  // SQL groups ALL historical IPv4 rows before applying display limit. Old collisions
  // must not disappear when newer activity pushes them out of a recent-IP sample.
  const v4=(await db.prepare(`SELECT ip_address ip,MAX(last_seen_at) latest
    FROM community_user_ips WHERE ip_address NOT LIKE '%:%' AND ip_address LIKE '%.%.%.%'
    GROUP BY ip_address HAVING COUNT(DISTINCT user_id)>1 ORDER BY latest DESC LIMIT ?`).bind(MAX_IPV4_GROUPS+1).all()).results||[];
  const v4Truncated=v4.length>MAX_IPV4_GROUPS;
  const ips=v4.slice(0,MAX_IPV4_GROUPS).map(x=>x.ip).filter(validIPv4);
  for(let start=0;start<ips.length;start+=40){
    const group=ips.slice(start,start+40),questions=group.map(()=>'?').join(',');
    const rows=(await db.prepare(`SELECT ui.ip_address ip,ui.user_id,ui.last_seen_at
      FROM community_user_ips ui JOIN community_profiles p ON p.id=ui.user_id
      WHERE ui.ip_address IN (${questions}) AND p.role='user' ORDER BY ui.last_seen_at DESC LIMIT 3500`).bind(...group).all()).results||[];
    const byIp=new Map();for(const r of rows){if(!users.has(r.user_id))continue;
      if(!byIp.has(r.ip))byIp.set(r.ip,new Map());byIp.get(r.ip).set(r.user_id,r.last_seen_at||'');}
    for(const [ip,ids] of byIp){if(ids.size<2)continue;sharedIPv4++;
      // A public CGNAT/VPN IP with many accounts is weak evidence and must not
      // create hundreds of automatic accusations. Still show it as group count.
      if(ids.size>40)continue;
      const usersHere=[...ids];for(let i=0;i<usersHere.length;i++)for(let j=i+1;j<usersHere.length;j++)
        registerLink(pairs,users,usersHere[i][0],usersHere[j][0],'ipv4',ip,usersHere[i][1]>usersHere[j][1]?usersHere[i][1]:usersHere[j][1]);
    }
  }
  // D1 stores raw IPv6; normalize in JS, never compare string suffixes.
  const prefixes=new Map();let v6Truncated=false;
  for(let offset=0;offset<MAX_IPV6_ROWS;offset+=CHUNK){
    const rows=(await db.prepare(`SELECT user_id,ip_address,last_seen_at FROM community_user_ips
      WHERE ip_address LIKE '%:%' ORDER BY last_seen_at DESC,ip_address DESC,user_id ASC LIMIT ? OFFSET ?`).bind(CHUNK,offset).all()).results||[];
    for(const r of rows){if(!users.has(r.user_id))continue;const pref=ipv6Prefix(r.ip_address,64);if(!pref)continue;
      ipv6Rows++;if(!prefixes.has(pref))prefixes.set(pref,new Map());
      const userMap=prefixes.get(pref),old=userMap.get(r.user_id);if(!old||r.last_seen_at>old)userMap.set(r.user_id,r.last_seen_at||'');}
    if(rows.length<CHUNK)break;
    if(offset+CHUNK===MAX_IPV6_ROWS)v6Truncated=true;
  }
  for(const [prefix,m] of prefixes){if(m.size<2)continue;sharedIPv6++;if(m.size>40)continue;
    const ids=[...m];for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)
      registerLink(pairs,users,ids[i][0],ids[j][0],'ipv6_64',prefix,ids[i][1]>ids[j][1]?ids[i][1]:ids[j][1]);
  }
  return {pairs,counts:{shared_ipv4:sharedIPv4,shared_ipv6_64:sharedIPv6,ipv6_rows:ipv6Rows,
    ipv4_limit:MAX_IPV4_GROUPS,ipv6_limit:MAX_IPV6_ROWS,ipv4_truncated:v4Truncated,ipv6_truncated:v6Truncated}};
}
async function relatedNetworks(db,a,b){
  const v4=await db.prepare(`SELECT 1 ok FROM community_user_ips x JOIN community_user_ips y ON x.ip_address=y.ip_address
    WHERE x.user_id=? AND y.user_id=? AND x.ip_address NOT LIKE '%:%' LIMIT 1`).bind(a,b).first();
  if(v4)return 'historical_ipv4';
  const rows=await Promise.all([a,b].map(id=>db.prepare(`SELECT ip_address FROM community_user_ips WHERE user_id=?
    AND ip_address LIKE '%:%' ORDER BY last_seen_at DESC LIMIT 2000`).bind(id).all()));
  const keys=new Set((rows[0].results||[]).map(r=>ipv6Prefix(r.ip_address,64)).filter(Boolean));
  if((rows[1].results||[]).some(r=>keys.has(ipv6Prefix(r.ip_address,64))))return 'historical_ipv6_64';
  return '';
}
export async function onRequestGet({request,env}){
  try{
    await requireAdmin(request,env,true);await ensureMultikontaGuard(env);
    const db=env.COMMUNITY_DB,users=await roster(db),{pairs,counts}=await allPairs(db,users);
    const reviews=(await db.prepare(`SELECT user_id,status FROM aio_multikonta_reviews_v2`).all()).results||[];
    const statuses=Object.fromEntries(reviews.map(r=>[r.user_id,r.status]));
    const q=(new URL(request.url).searchParams.get('q')||'').trim().toLowerCase().slice(0,100);
    let found=[...pairs.values()].map(x=>summarizePair(x,users,statuses));
    if(q)found=found.filter(x=>x.accounts.some(u=>u.name.toLowerCase().includes(q)||u.id.toLowerCase().startsWith(q))
      ||x.shared_ipv4.some(ip=>ip.includes(q))||x.shared_ipv6_64.some(ip=>ip.includes(q)));
    found.sort((a,b)=>b.score-a.score||String(b.latest).localeCompare(String(a.latest)));
    return reply({ok:true,version:'AIO_MULTIKONTA_HISTORIA_V3',generated_at:new Date().toISOString(),
      ...counts,accounts_scanned:users.size,candidates_total:found.length,shown:Math.min(found.length,150),
      partial:counts.ipv4_truncated||counts.ipv6_truncated,
      pairs:found.slice(0,150),
      guidance:'Wspólne IP i podobieństwo e-maila są przesłankami, nie dowodem tożsamości. Brak automatycznych blokad.'});
  }catch(e){console.error('[AIO V3 GET]',String(e?.message||e).slice(0,180));return queryError(e);}
}
export async function onRequestPost({request,env}){
  const origin=request.headers.get('Origin');
  if((origin&&origin!==new URL(request.url).origin)||request.headers.get('Sec-Fetch-Site')==='cross-site')
    return reply({ok:false,error:'Niedozwolone źródło żądania.'},403);
  if(!/application\/json/i.test(request.headers.get('Content-Type')||''))return reply({ok:false,error:'Wymagany JSON.'},415);
  try{
    const admin=await requireAdmin(request,env,true);await ensureMultikontaGuard(env);
    const body=await request.json().catch(()=>({}));
    if(body.action!=='hold_free'||body.confirm!==true)return reply({ok:false,error:'Wymagane potwierdzenie decyzji.'},400);
    const id=String(body.user_id||''),peer=String(body.peer_user_id||''),reason=String(body.reason||'').trim();
    if(!ID.test(id)||!ID.test(peer)||id===peer)return reply({ok:false,error:'Podaj dwa różne identyfikatory kont.'},400);
    if(reason.length<12||reason.length>300)return reply({ok:false,error:'Podaj uzasadnienie (12–300 znaków).'},400);
    const db=env.COMMUNITY_DB;
    const profiles=(await db.prepare(`SELECT id,role,banned_until FROM community_profiles WHERE id IN (?,?)`).bind(id,peer).all()).results||[];
    if(profiles.length!==2||profiles.some(p=>p.role!=='user')||id===admin.user.id||peer===admin.user.id
      ||isIpPolicyExemptV8(id,env)||isIpPolicyExemptV8(peer,env))
      return reply({ok:false,error:'Operacja dostępna wyłącznie dla dwóch zwykłych kont.'},403);
    const target=profiles.find(p=>p.id===id);
    if(target?.banned_until&&Date.parse(target.banned_until)>Date.now())
      return reply({ok:false,error:'Konto jest już zablokowane; nie nakładam dodatkowej kontroli pobrań.'},409);
    const proof=await relatedNetworks(db,id,peer);
    if(!proof)return reply({ok:false,error:'Nie znaleziono wspólnego historycznego IPv4 ani IPv6 /64. Operacja anulowana.'},409);
    const prior=await db.prepare('SELECT status FROM aio_multikonta_reviews_v2 WHERE user_id=?').bind(id).first();
    if(prior?.status==='pending')return reply({ok:false,error:'To konto ma już aktywną kontrolę darmowych pobrań.'},409);
    const at=new Date().toISOString();
    await db.prepare(`INSERT INTO aio_multikonta_reviews_v2
      (user_id,peer_user_id,risk_score,indicators,status,created_at,reviewed_at,reviewed_by)
      VALUES(?,?,6,?,'pending',?,NULL,?)
      ON CONFLICT(user_id) DO UPDATE SET peer_user_id=excluded.peer_user_id,
      risk_score=excluded.risk_score,indicators=excluded.indicators,status='pending',
      created_at=excluded.created_at,reviewed_at=NULL,reviewed_by=excluded.reviewed_by
      WHERE aio_multikonta_reviews_v2.status IN ('monitor','released')`)
      .bind(id,peer,proof+',manual_owner_v3',at,admin.user.id).run();
    let auditLogged=true;
    try{await moderationLog(env,admin.user.id,{targetUserId:id,targetType:'user',targetId:id,
      action:'owner_multikonta_v3_hold_free',reason:reason+' ('+proof+', peer: '+peer+')'});}catch(e){auditLogged=false;console.error('[AIO V3 audit]',String(e?.message||e).slice(0,180));}
    return reply({ok:true,action:'hold_free',target_user_id:id,status:'pending',audit_logged:auditLogged,
      message:'Wstrzymano wyłącznie darmowe pobrania tego konta do ręcznej weryfikacji. Istniejące blokady i VIP pozostają bez zmian.'});
  }catch(e){console.error('[AIO V3 POST]',String(e?.message||e).slice(0,180));return queryError(e);}
}
