/* AIO Multikonta V2.  Register: correlation + scoped free-download review.
 * Never bans an account on common IPv6 prefixes. Owner releases/links manually.
 * MODE=monitor (default) or enforce (requires AIO_MULTIKONTA_HMAC_SECRET).
 */
import {ipv6Prefix,normalizeLogin,safeEmailLocal,gmailMailbox} from './_aio_network_prefix_v1.js';
let ready=null;
const stamp=()=>new Date().toISOString();
const MODE=env=>String(env?.AIO_MULTIKONTA_MODE||'monitor').toLowerCase()==='enforce'?'enforce':'monitor';
const invalid=(code,msg)=>Object.assign(new Error(msg),{status:code});
export async function ensureMultikontaGuard(env){
  if(!env.COMMUNITY_DB)throw invalid(503,'Baza D1 niedostępna.');
  if(!ready)ready=env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_multikonta_reviews_v2 (
      user_id TEXT PRIMARY KEY, peer_user_id TEXT, risk_score INTEGER NOT NULL,
      indicators TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('monitor','pending','released')),
      created_at TEXT NOT NULL, reviewed_at TEXT, reviewed_by TEXT,
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE)`),
    env.COMMUNITY_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_aio_multi_reviews_status_v2 ON aio_multikonta_reviews_v2(status,created_at DESC)`),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_multikonta_signup_windows_v2 (
      network_key TEXT NOT NULL, bucket_start INTEGER NOT NULL,hits INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(network_key,bucket_start))`),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_multikonta_quota_groups_v2 (
      group_id TEXT PRIMARY KEY,used INTEGER NOT NULL DEFAULT 0,
      started_ms INTEGER NOT NULL DEFAULT 0,third_ms INTEGER NOT NULL DEFAULT 0,
      resets_ms INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,created_by TEXT NOT NULL)`),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_multikonta_quota_members_v2 (
      user_id TEXT PRIMARY KEY,group_id TEXT NOT NULL,linked_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE,
      FOREIGN KEY(group_id) REFERENCES aio_multikonta_quota_groups_v2(group_id) ON DELETE CASCADE)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_multi_quota_group_v2 ON aio_multikonta_quota_members_v2(group_id)')
  ]).catch(e=>{ready=null;throw e;});
  return ready;
}
function monthLater(ms){
  const d=new Date(ms),year=d.getUTCFullYear(),month=d.getUTCMonth();
  const lastDay=new Date(Date.UTC(year,month+2,0)).getUTCDate();
  return Date.UTC(year,month+1,Math.min(d.getUTCDate(),lastDay),d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds(),d.getUTCMilliseconds());
}
async function hmac(env,value){
  const secret=String(env.AIO_MULTIKONTA_HMAC_SECRET||'');
  if(secret.length<32)throw invalid(503,'Brak konfiguracji ochrony rejestracji.');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function guardConfiguration(env){return {
  mode:MODE(env),turnstile_enabled:!!(env.AIO_TURNSTILE_SITE_KEY&&env.AIO_TURNSTILE_SECRET_KEY),
  site_key:env.AIO_TURNSTILE_SITE_KEY&&env.AIO_TURNSTILE_SECRET_KEY?String(env.AIO_TURNSTILE_SITE_KEY):null,
  secret_ready:String(env.AIO_MULTIKONTA_HMAC_SECRET||'').length>=32
};}
async function checkTurnstile(env,request,token){
  const secret=String(env.AIO_TURNSTILE_SECRET_KEY||''),site=String(env.AIO_TURNSTILE_SITE_KEY||'');
  if(!secret&&!site)return;
  if(!secret||!site)throw invalid(503,'Konfiguracja Turnstile nie jest kompletna.');
  if(!token||token.length>3000)throw invalid(403,'Potwierdź zabezpieczenie formularza rejestracji.');
  const form=new URLSearchParams({secret,response:token});
  const ip=String(request.headers.get('CF-Connecting-IP')||'');if(ip)form.set('remoteip',ip);
  const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});
  if(!response.ok)throw invalid(503,'Nie można zweryfikować formularza rejestracji.');
  const check=await response.json().catch(()=>({success:false}));
  if(!check.success)throw invalid(403,'Potwierdzenie formularza wygasło. Spróbuj ponownie.');
  const host=new URL(request.url).hostname;
  if(check.hostname&&check.hostname!==host)throw invalid(403,'Nieprawidłowy adres formularza.');
}
async function networkHourlyLimit(env,ip){
  const p64=ipv6Prefix(ip,64);if(!p64)return;
  const key=await hmac(env,'signup:'+p64);
  const bucket=Math.floor(Date.now()/3600000)*3600000;
  const row=await env.COMMUNITY_DB.prepare(`INSERT INTO aio_multikonta_signup_windows_v2(network_key,bucket_start,hits)
    VALUES(?,?,1) ON CONFLICT(network_key,bucket_start) DO UPDATE SET hits=hits+1
    RETURNING hits`).bind(key,bucket).first();
  // Scopes are intentionally moderate to avoid blocking normal households.
  if(Number(row?.hits||0)>5)throw invalid(429,'Z tej sieci było zbyt wiele rejestracji. Spróbuj później lub skontaktuj się z administratorem.');
  if(Math.random()<0.01)await env.COMMUNITY_DB.prepare('DELETE FROM aio_multikonta_signup_windows_v2 WHERE bucket_start<?')
    .bind(Date.now()-2*86400000).run().catch(()=>{});
}
async function nearbyIpv6Peers(db,p64){
  if(!p64)return [];
  // Narrow SQL scan to the first three address groups, then compare normalized /64 in JS.
  const head=p64.split(':').slice(0,3).join(':')+':';
  const rows=await db.prepare(`SELECT ui.user_id,ui.ip_address,p.display_name,p.created_at
    FROM community_user_ips ui JOIN community_profiles p ON p.id=ui.user_id
    WHERE ui.ip_address LIKE ? AND p.role='user'
    ORDER BY ui.last_seen_at DESC LIMIT 1200`).bind(head+'%').all();
  const seen=new Set();const peers=[];
  for(const r of rows.results||[]){
    if(ipv6Prefix(r.ip_address,64)!==p64||seen.has(r.user_id))continue;
    peers.push(r);seen.add(r.user_id);
  }
  return peers;
}
export async function registrationPreflight(env,request,{email,displayName,turnstileToken}){
  await ensureMultikontaGuard(env);
  await checkTurnstile(env,request,turnstileToken);
  const mode=MODE(env),ip=String(request.headers.get('CF-Connecting-IP')||'');
  if(mode==='enforce'&&String(env.AIO_MULTIKONTA_HMAC_SECRET||'').length<32)throw invalid(503,'Brak konfiguracji ochrony rejestracji.');
  if(mode==='enforce')await networkHourlyLimit(env,ip);
  const p64=ipv6Prefix(ip,64),db=env.COMMUNITY_DB;
  if(Math.random()<0.02){
    const cutoff=new Date(Date.now()-90*86400000).toISOString();
    await db.prepare(`DELETE FROM aio_multikonta_reviews_v2 WHERE
      (status='monitor' AND created_at<?) OR (status='released' AND reviewed_at<?)`)
      .bind(cutoff,cutoff).run().catch(()=>{});
  }
  const peers=await nearbyIpv6Peers(db,p64);
  const local=safeEmailLocal(email);
  const duplicates=local?await db.prepare(`SELECT a.user_id,p.display_name FROM community_auth a
    JOIN community_profiles p ON p.id=a.user_id
    WHERE lower(substr(a.email,1,instr(a.email,'@')-1))=? AND p.role='user'
    ORDER BY p.created_at DESC LIMIT 5`).bind(local).all():{results:[]};
  const gmail=gmailMailbox(email);
  const gmailCandidates=gmail?await db.prepare(`SELECT a.user_id,a.email FROM community_auth a
    JOIN community_profiles p ON p.id=a.user_id
    WHERE p.role='user' AND (lower(a.email) LIKE '%@gmail.com' OR lower(a.email) LIKE '%@googlemail.com')
    ORDER BY a.created_at DESC LIMIT 3000`).all():{results:[]};
  const gmailPeer=(gmailCandidates.results||[]).find(x=>gmailMailbox(x.email)===gmail)||null;
  let score=0;const flags=[];let peer=peers[0]?.user_id||null;
  if(peers.length){score+=3;flags.push('ipv6_64');}
  if(duplicates.results?.length){score+=5;flags.push('email_local');peer=duplicates.results[0].user_id;}
  if(gmailPeer&&!duplicates.results?.length){score+=5;flags.push('gmail_alias');peer=gmailPeer.user_id;}
  const display=normalizeLogin(displayName);
  if(peers.some(x=>display.length>=5&&normalizeLogin(x.display_name)===display)){
    score+=2;flags.push('same_display_name');
  }
  if(peers.length){
    const ids=peers.map(x=>x.user_id).slice(0,15);
    if(ids.length){const placeholders=ids.map(()=>'?').join(',');
      const exhausted=await db.prepare(`SELECT 1 yes FROM aio_access_monthly_cycles WHERE user_id IN (${placeholders})
        AND used>=3 AND resets_ms>? LIMIT 1`).bind(...ids,Date.now()).first().catch(e=>{
          if(/no such table/i.test(String(e?.message||'')))return null;throw e;
        });
      if(exhausted){score+=2;flags.push('peer_quota_exhausted');}
    }
  }
  return {score,flags,peer,mode,hold:mode==='enforce'&&score>=5};
}
export function registrationReviewStatement(env,userId,risk){
  if(!risk||risk.score<3)return null;
  const status=risk.hold?'pending':'monitor';
  return env.COMMUNITY_DB.prepare(`INSERT INTO aio_multikonta_reviews_v2
    (user_id,peer_user_id,risk_score,indicators,status,created_at) VALUES(?,?,?,?,?,?)`)
    .bind(userId,risk.peer,risk.score,risk.flags.join(','),status,stamp());
}
export async function pendingMultikontaReview(env,userId){
  await ensureMultikontaGuard(env);
  return await env.COMMUNITY_DB.prepare("SELECT risk_score,indicators,created_at FROM aio_multikonta_reviews_v2 WHERE user_id=? AND status='pending' LIMIT 1")
    .bind(userId).first();
}
async function linkedGroup(env,userId){
  await ensureMultikontaGuard(env);
  const r=await env.COMMUNITY_DB.prepare('SELECT g.* FROM aio_multikonta_quota_members_v2 m JOIN aio_multikonta_quota_groups_v2 g ON g.group_id=m.group_id WHERE m.user_id=? LIMIT 1').bind(userId).first();
  return r||null;
}
async function refreshLinked(env,userId,now){
  let group=await linkedGroup(env,userId);if(!group)return null;
  if(group.used>=3&&group.resets_ms>0&&group.resets_ms<=now){
    await env.COMMUNITY_DB.prepare(`UPDATE aio_multikonta_quota_groups_v2 SET used=0,started_ms=0,third_ms=0,resets_ms=0
      WHERE group_id=? AND used>=3 AND resets_ms>0 AND resets_ms<=?`).bind(group.group_id,now).run();
    group=await linkedGroup(env,userId);
  }
  return group;
}
function quotaView(g){const used=Math.min(3,Math.max(0,Number(g.used||0)));return {
  free_limit:3,free_remaining:3-used,free_used:used,free_period:'calendar_month_after_third',free_period_hours:null,
  free_window_started_at:g.started_ms?new Date(Number(g.started_ms)).toISOString():null,
  free_resets_at:used===3&&g.resets_ms?new Date(Number(g.resets_ms)).toISOString():null,
  retry_files:[],shared_confirmed_group:true
};}
export async function linkedMonthlyStatus(env,userId,now=Date.now()){
  const group=await refreshLinked(env,userId,now);return group?quotaView(group):null;
}
export async function consumeLinkedMonthly(env,userId,now=Date.now()){
  const group=await refreshLinked(env,userId,now);if(!group)return null;
  const result=await env.COMMUNITY_DB.prepare(`UPDATE aio_multikonta_quota_groups_v2 SET
    started_ms=CASE WHEN used=0 THEN ? ELSE started_ms END,
    third_ms=CASE WHEN used=2 THEN ? ELSE third_ms END,
    resets_ms=CASE WHEN used=2 THEN ? ELSE resets_ms END,used=used+1
    WHERE group_id=? AND used>=0 AND used<3`)
    .bind(now,now,monthLater(now),group.group_id).run();
  const rest=await linkedMonthlyStatus(env,userId,now);
  return {allowed:Number(result.meta?.changes||0)===1,reason:result.meta?.changes?'free':'limit',...rest};
}
export async function createConfirmedQuotaGroup(env,ownerId,userIds){
  await ensureMultikontaGuard(env);
  const ids=[...new Set((userIds||[]).map(String))];
  if(ids.length<2||ids.length>10||ids.some(x=>!/^[0-9a-f-]{36}$/i.test(x)))throw invalid(400,'Wskaż 2–10 różnych identyfikatorów kont.');
  const db=env.COMMUNITY_DB,placeholders=ids.map(()=>'?').join(',');
  const profiles=await db.prepare(`SELECT id,role FROM community_profiles WHERE id IN (${placeholders})`).bind(...ids).all();
  if(profiles.results.length!==ids.length||profiles.results.some(x=>x.role!=='user'))throw invalid(403,'Nie można połączyć kont właściciela lub nieznanych kont.');
  const prior=await db.prepare(`SELECT user_id FROM aio_multikonta_quota_members_v2 WHERE user_id IN (${placeholders}) LIMIT 1`).bind(...ids).first();
  if(prior)throw invalid(409,'Jedno z kont należy już do połączonej grupy limitu.');
  const cycle=await db.prepare(`SELECT user_id,used,started_ms,third_ms,resets_ms FROM aio_access_monthly_cycles
    WHERE user_id IN (${placeholders})`).bind(...ids).all().catch(e=>{if(/no such table/i.test(String(e?.message||'')))return {results:[]};throw e;});
  const now=Date.now(),active=(cycle.results||[]).filter(x=>!(Number(x.used)>=3&&Number(x.resets_ms)>0&&Number(x.resets_ms)<=now));
  const used=Math.min(3,active.reduce((n,x)=>n+Math.max(0,Math.min(3,Number(x.used||0))),0));
  const third=used===3?now:0,resets=third?monthLater(third):0;
  const started=Math.min(...active.map(x=>Number(x.started_ms||0)).filter(Boolean),now);
  const groupId=crypto.randomUUID(),at=stamp();
  await db.batch([
    db.prepare(`INSERT INTO aio_multikonta_quota_groups_v2(group_id,used,started_ms,third_ms,resets_ms,created_at,created_by)
      VALUES(?,?,?,?,?,?,?)`).bind(groupId,used,started,third,resets,at,ownerId),
    ...ids.map(id=>db.prepare(`INSERT INTO aio_multikonta_quota_members_v2(user_id,group_id,linked_at) VALUES(?,?,?)`).bind(id,groupId,at))
  ]);
  return {group_id:groupId,accounts:ids.length,free_remaining:3-used};
}
