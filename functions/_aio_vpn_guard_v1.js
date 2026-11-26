/* AIO Security Core — VPN Registration Guard V1 (2026-11-15)
 * Live signup: monitor by default; optionally refuse confirmed Tor/proxy/VPN.
 * Old accounts: MANUAL owner-requested scans ONLY; NEVER revoke or ban.
 * No raw IP, email or access token is written to new D1 tables.
 * IPs are sent only to the configured classification service (ipapi.is).
 */
export const VPN_GUARD_VERSION='AIO_VPN_GUARD_V1_20261115';
const API='https://api.ipapi.is';
const HOUR=3600000, DAY=24*HOUR, TTL=DAY, LIMIT_BATCH=20;
const encoder=new TextEncoder();
let __aioCFReady_readyPromise = false;
const nowIso=()=>new Date().toISOString();
const txt=(v,n=70)=>String(v??'').replace(/[\x00-\x1f<>]/g,' ').trim().slice(0,n);
const fail=(message,status=503)=>Object.assign(new Error(message),{status});
const number=(n,fallback)=>Number.isFinite(Number(n))?Number(n):fallback;
export const highRisk=v=>['tor','proxy','vpn'].includes(String(v||''));
export const riskOrder={tor:6,proxy:5,vpn:4,relay:3,datacenter:2,mobile:1,clean:0,unknown:-1};

export function vpnGuardConfig(env){
  const mode=String(env?.AIO_VPN_GUARD_MODE||'monitor').toLowerCase()==='enforce'?'enforce':'monitor';
  const key=String(env?.AIO_VPN_GUARD_API_KEY||'').trim();
  const secret=String(env?.AIO_VPN_GUARD_HMAC_SECRET||env?.AIO_MULTIKONTA_HMAC_SECRET||'').trim();
  const loginSetting=String(env?.AIO_VPN_LOGIN_MODE||'').trim().toLowerCase();
  const login_mode=['enforce','monitor'].includes(loginSetting)?loginSetting:mode;
  return {mode,login_mode,provider_ready:key.length>=12,hash_ready:secret.length>=32,
    ready:key.length>=12&&secret.length>=32,
    daily_budget:Math.max(20,Math.min(900,Math.floor(number(env?.AIO_VPN_GUARD_DAILY_BUDGET,400))))};
}
export function publicNetworkIp(input){
  const v=String(input??'').trim();
  if(!v||v.length>45||/[%\/\s\\]/.test(v))return null;
  if(v.includes('.')){
    if(v.includes(':'))return null;
    const parts=v.split('.');
    if(parts.length!==4||parts.some(p=>!/^\d{1,3}$/.test(p)||Number(p)>255||(p.length>1&&p[0]==='0')))return null;
    const [a,b]=parts.map(Number);
    if(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&[18,19].includes(b))return null;
    return v;
  }
  if(v.includes(':')&&/^[a-fA-F0-9:]+$/.test(v)&&(v.match(/:/g)||[]).length>=2){
    // No private/link-local/loopback, and no malformed multi-compression.
    if((v.match(/::/g)||[]).length>1||/^(?:fc|fd|fe8|fe9|fea|feb)/i.test(v)||v==='::1'||v==='::')return null;
    try{new URL('http://['+v+']/');}catch{return null;}
    return v.toLowerCase();
  }
  return null;
}
// AIO_ANTI_ABUSE_V1: explicit provider flags have priority over managed egress.
function explicitNetworkRisk(flags){
  return ['tor','proxy','vpn'].find(x=>flags.includes(x))||null;
}
export function classifyVpnResponse(data){
  if(!data||typeof data!=='object'||data.error||data.error_code||data.is_bogon===true)return {kind:'unknown',flags:[],service:''};
  const keys=['is_vpn','is_proxy','is_tor','is_datacenter','is_mobile','is_satellite'];
  if(!['is_vpn','is_proxy','is_tor'].some(k=>data[k]===true) &&
     !['is_vpn','is_proxy','is_tor'].every(k=>typeof data[k]==='boolean'))return {kind:'unknown',flags:[],service:''};
  const flags=keys.filter(k=>data[k]===true).map(k=>k.slice(3));
  const egress=String(data.egress_service?.type||'');
  if(!explicitNetworkRisk(flags)&&(egress==='private_relay'||egress==='secure_web_gateway')){
    return {kind:'relay',flags:[...flags,'managed_egress'],service:txt(data.egress_service?.provider||'',60)};
  }
  let kind='clean';
  if(data.is_tor===true)kind='tor';
  else if(data.is_proxy===true)kind='proxy';
  else if(data.is_vpn===true)kind='vpn';
  else if(data.is_datacenter===true)kind='datacenter';
  else if(data.is_mobile===true)kind='mobile';
  const service=txt(data.vpn?.service||data.datacenter?.datacenter||data.company?.name||'',60);
  return {kind,flags,service};
}
export function verdictForSignup(assessment,mode){
  return mode==='enforce'&&highRisk(assessment?.kind)?'deny':'allow';
}
async function keyFor(ip,secret){
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,encoder.encode('aio:vpn:v1:'+ip));
  return [...new Uint8Array(signature)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function ensureVpnGuard(env){
  // AIO_CF_PROMISE_LOGIN_FIX_V1_20261119: request-bound D1 Promise is NEVER cached between HTTP requests.
  if (__aioCFReady_readyPromise) return true;
  let readyPromise = null;

  if(!env?.COMMUNITY_DB)throw fail('Brak COMMUNITY_DB');
  if(!readyPromise)readyPromise=env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_vpn_guard_cache_v1 (
      ip_key TEXT PRIMARY KEY,verdict TEXT NOT NULL,flags TEXT NOT NULL DEFAULT '[]',
      service TEXT NOT NULL DEFAULT '',checked_at TEXT NOT NULL,expires_ms INTEGER NOT NULL)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_vpn_guard_cache_ttl_v1 ON aio_vpn_guard_cache_v1(expires_ms)'),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_vpn_guard_budget_v1 (
      day TEXT PRIMARY KEY,used INTEGER NOT NULL DEFAULT 0)`),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_vpn_guard_signups_v1 (
      id TEXT PRIMARY KEY,kind TEXT NOT NULL,decision TEXT NOT NULL,created_at TEXT NOT NULL)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_vpn_guard_signups_v1 ON aio_vpn_guard_signups_v1(created_at)'),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_vpn_guard_reviews_v1 (
      user_id TEXT PRIMARY KEY,verdict TEXT NOT NULL,flags TEXT NOT NULL DEFAULT '[]',
      service TEXT NOT NULL DEFAULT '',samples INTEGER NOT NULL DEFAULT 0,
      checked_at TEXT NOT NULL,reviewed_at TEXT,reviewed_by TEXT,
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_vpn_guard_reviews_v1 ON aio_vpn_guard_reviews_v1(verdict,checked_at DESC)')
  ]).catch(e=>{readyPromise=null;throw e;});
  await readyPromise;
  __aioCFReady_readyPromise = true; // AIO_CF_PROMISE_LOGIN_FIX_V1_20261119
}
async function reserveBudget(db,amount,max){
  if(amount<1)return true;
  const day=new Date().toISOString().slice(0,10);
  await db.prepare('INSERT OR IGNORE INTO aio_vpn_guard_budget_v1(day,used) VALUES(?,0)').bind(day).run();
  const res=await db.prepare(`UPDATE aio_vpn_guard_budget_v1 SET used=used+?
    WHERE day=? AND used+?<=?`).bind(amount,day,amount,max).run();
  return Number(res.meta?.changes||0)===1;
}
function cachedView(row){
  let flags=[];
  try{const p=JSON.parse(row.flags);flags=Array.isArray(p)?p.filter(x=>typeof x==='string').slice(0,8):[];}catch{}
  // Re-evaluate old cached managed-egress rows; never mask explicit high-risk flags.
  const kind=explicitNetworkRisk(flags)||txt(row.verdict,25);
  return {kind,flags,service:txt(row.service,60),cached:true};
}
export function budgetCeiling(total,purpose){
  return purpose==='register'?total:Math.max(1,Math.floor(total*(purpose==='login'?0.8:0.5)));
}
export async function lookupVpnIps(env,ips,{maxRemote=40,purpose='scan'}={}){
  const unique=[...new Set(ips.map(publicNetworkIp).filter(Boolean))];
  const config=vpnGuardConfig(env),values=new Map();
  if(!unique.length)return {values,remote:0,reason:'no_ips'};
  if(!config.ready)return {values,remote:0,reason:'not_configured'};
  await ensureVpnGuard(env);
  const keys=await Promise.all(unique.map(ip=>keyFor(ip,String(env.AIO_VPN_GUARD_HMAC_SECRET||env.AIO_MULTIKONTA_HMAC_SECRET).trim())));
  const placeholders=keys.map(()=>'?').join(',');
  const cached=await env.COMMUNITY_DB.prepare(`SELECT * FROM aio_vpn_guard_cache_v1 WHERE ip_key IN (${placeholders}) AND expires_ms>?`).bind(...keys,Date.now()).all();
  const byKey=new Map((cached.results||[]).map(r=>[r.ip_key,r]));
  const missing=[];
  unique.forEach((ip,i)=>{const row=byKey.get(keys[i]);if(row)values.set(ip,cachedView(row));else missing.push({ip,key:keys[i]});});
  if(!missing.length)return {values,remote:0,reason:'cache'};
  if(missing.length>maxRemote)return {values,remote:0,reason:'batch_too_large'};
  if(!await reserveBudget(env.COMMUNITY_DB,missing.length,budgetCeiling(config.daily_budget,purpose)))return {values,remote:0,reason:'budget_exhausted'};
  let payload;
  try{
    const res=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({ips:missing.map(x=>x.ip),key:String(env.AIO_VPN_GUARD_API_KEY).trim()}),
      signal:AbortSignal.timeout(7000)});
    if(!res.ok)return {values,remote:missing.length,reason:'provider_http_'+res.status};
    payload=await res.json();
    if(!payload||typeof payload!=='object'||payload.error||payload.error_code)return {values,remote:missing.length,reason:'provider_invalid'};
  }catch{return {values,remote:missing.length,reason:'provider_timeout'};}
  const records=[],stamp=nowIso(),until=Date.now()+TTL;
  for(const {ip,key} of missing){
    const item=classifyVpnResponse(payload[ip]);
    if(item.kind==='unknown')continue;
    values.set(ip,{...item,cached:false});
    records.push(env.COMMUNITY_DB.prepare(`INSERT INTO aio_vpn_guard_cache_v1(ip_key,verdict,flags,service,checked_at,expires_ms)
      VALUES(?,?,?,?,?,?) ON CONFLICT(ip_key) DO UPDATE SET verdict=excluded.verdict,flags=excluded.flags,
      service=excluded.service,checked_at=excluded.checked_at,expires_ms=excluded.expires_ms`)
      .bind(key,item.kind,JSON.stringify(item.flags),item.service,stamp,until));
  }
  if(records.length)await env.COMMUNITY_DB.batch(records);
  return {values,remote:missing.length,reason:records.length?'ok':'provider_no_flags'};
}
async function logSignupFlag(env,kind,decision){
  try{await ensureVpnGuard(env);
    await env.COMMUNITY_DB.prepare('INSERT INTO aio_vpn_guard_signups_v1(id,kind,decision,created_at) VALUES(?,?,?,?)')
      .bind(crypto.randomUUID(),kind,decision,nowIso()).run();
    if(Math.random()<0.05){
      const db=env.COMMUNITY_DB;
      await Promise.allSettled([
        db.prepare('DELETE FROM aio_vpn_guard_signups_v1 WHERE created_at<?')
          .bind(new Date(Date.now()-30*DAY).toISOString()).run(),
        db.prepare('DELETE FROM aio_vpn_guard_cache_v1 WHERE expires_ms<?')
          .bind(Date.now()-DAY).run(),
        db.prepare('DELETE FROM aio_vpn_guard_budget_v1 WHERE day<?')
          .bind(new Date(Date.now()-30*DAY).toISOString().slice(0,10)).run()
      ]);
    }
  }catch(e){console.error('[AIO VPN Guard signup audit]',String(e?.message||e).slice(0,100));}
}
// Anonymous daily counters. Fixed 31-slot ring; no address, identity or provider payload.
export const VPN_COUNT_SQL=`INSERT INTO aio_vpn_auth_counts_v2(slot,day,phase,outcome,reason,n)
  VALUES(?,?,?,?,?,1) ON CONFLICT(slot,phase,outcome,reason) DO UPDATE SET
  n=CASE WHEN day=excluded.day THEN n+1 ELSE 1 END,day=excluded.day`;
async function countResult(env,phase,outcome,reason){
  if(!env?.COMMUNITY_DB)return;
  const ms=Date.now(),group=reason.startsWith('provider_')?'provider':reason;
  try{await env.COMMUNITY_DB.prepare(VPN_COUNT_SQL).bind(Math.floor(ms/DAY)%31,
    new Date(ms).toISOString().slice(0,10),phase,outcome,group).run();}
  catch{console.warn('[AIO VPN] Nie zapisano licznika diagnostycznego.');}
}
export function vpnReply(result,phase){
  if(!result?.deny&&!result?.retry)return null;
  const operation=phase==='register'?'utworzyć konto':'zalogować się';
  return result.retry?{status:503,body:{ok:false,code:'AIO_NETWORK_RETRY',error:'Nie można teraz sprawdzić połączenia. Spróbuj ponownie później. Nie zablokowano konta.'}}:
    {status:403,body:{ok:false,code:'AIO_VPN_CONNECTION',error:'Połączenie rozpoznano jako VPN, proxy lub Tor. Aby '+operation+', wyłącz tę usługę i spróbuj ponownie. Jeśli to pomyłka, skontaktuj się z administracją.'}};
}
async function checkAuthNetwork(env,request,phase){
  const config=vpnGuardConfig(env),ip=publicNetworkIp(request?.headers?.get('CF-Connecting-IP'));
  const mode=phase==='register'?config.mode:config.login_mode;
  let kind='unknown',reason=!config.ready?'not_configured':'no_ip';
  if(ip&&config.ready){try{
    const lookup=await lookupVpnIps(env,[ip],{maxRemote:1,purpose:phase});
    kind=lookup.values.get(ip)?.kind||'unknown';reason=lookup.reason;
  }catch{reason='internal_error';}}
  const deny=verdictForSignup({kind},mode)==='deny';
  const retry=mode==='enforce'&&kind==='unknown';
  const warning=!deny&&highRisk(kind)?'Twoje połączenie rozpoznano jako VPN, proxy lub Tor. W trybie obserwacji nie zmienia to dostępu do konta.':null;
  if(phase==='register'&&highRisk(kind))await logSignupFlag(env,kind,deny?'deny':'monitor');
  await countResult(env,phase,deny?'vpn_denied':retry?'unverified_retry':warning?'vpn_observed':kind==='unknown'?'unverified_allowed':'allowed',reason);
  return {kind,reason,deny,retry,warning};
}
export const checkVpnAtRegistration=(env,request)=>checkAuthNetwork(env,request,'register');
export const checkVpnAtLogin=(env,request)=>checkAuthNetwork(env,request,'login');
const score=kind=>riskOrder[kind]??-1;
async function storeReview(env,userId,record,samples){
  const now=nowIso(),db=env.COMMUNITY_DB;
  const sql=`INSERT INTO aio_vpn_guard_reviews_v1(user_id,verdict,flags,service,samples,checked_at,reviewed_at,reviewed_by)
    VALUES(?,?,?,?,?,?,NULL,NULL) ON CONFLICT(user_id) DO UPDATE SET verdict=excluded.verdict,
    flags=excluded.flags,service=excluded.service,samples=excluded.samples,checked_at=excluded.checked_at,
    reviewed_at=CASE WHEN aio_vpn_guard_reviews_v1.verdict=excluded.verdict AND aio_vpn_guard_reviews_v1.flags=excluded.flags AND aio_vpn_guard_reviews_v1.service=excluded.service
      THEN aio_vpn_guard_reviews_v1.reviewed_at ELSE NULL END,
    reviewed_by=CASE WHEN aio_vpn_guard_reviews_v1.verdict=excluded.verdict AND aio_vpn_guard_reviews_v1.flags=excluded.flags AND aio_vpn_guard_reviews_v1.service=excluded.service
      THEN aio_vpn_guard_reviews_v1.reviewed_by ELSE NULL END`;
  await db.prepare(sql).bind(userId,record.kind,JSON.stringify(record.flags),record.service,samples,now).run();
}
function aggregate(rows,lookup){
  const found=rows.map(ip=>lookup.values.get(ip)).filter(Boolean);
  if(!found.length)return {kind:'unknown',flags:[],service:'',samples:0};
  const best=found.sort((a,b)=>score(b.kind)-score(a.kind))[0];
  const flags=[...new Set(found.flatMap(x=>x.flags))].slice(0,8).sort();
  return {kind:best.kind,flags,service:best.service,samples:found.length};
}
async function batchAccounts(env,cursor){
  const select=`SELECT p.id,p.display_name,p.created_at,
     (SELECT ui.ip_address FROM community_user_ips ui WHERE ui.user_id=p.id ORDER BY ui.first_seen_at ASC LIMIT 1) AS first_ip,
     (SELECT ui.ip_address FROM community_user_ips ui WHERE ui.user_id=p.id ORDER BY ui.last_seen_at DESC LIMIT 1) AS last_ip
    FROM community_profiles p WHERE p.role='user'`;
  const order=' ORDER BY p.created_at DESC,p.id DESC LIMIT ?';
  if(cursor){
    return (await env.COMMUNITY_DB.prepare(select+' AND (p.created_at<? OR (p.created_at=? AND p.id<?))'+order)
      .bind(cursor.created_at,cursor.created_at,cursor.id,LIMIT_BATCH).all()).results||[];
  }
  return (await env.COMMUNITY_DB.prepare(select+order).bind(LIMIT_BATCH).all()).results||[];
}
/** Owner initiated. Keyset pagination won't skip accounts if new ones register mid-scan. */
export async function scanVpnAccounts(env,{cursor=null,processed=0}={}){
  const config=vpnGuardConfig(env);
  if(!config.ready)throw fail('Najpierw skonfiguruj klucz ipapi.is i sekret HMAC w Cloudflare.',409);
  await ensureVpnGuard(env);
  const page=Math.min(200000,Math.max(0,Math.floor(number(processed,0))));
  const total=Number((await env.COMMUNITY_DB.prepare("SELECT COUNT(*) n FROM community_profiles WHERE role='user'").first())?.n||0);
  const accounts=await batchAccounts(env,cursor);
  const byUser=new Map();
  const ips=[];
  for(const a of accounts){
    const network=[...new Set([a.first_ip,a.last_ip].map(publicNetworkIp).filter(Boolean))];
    byUser.set(a.id,network);ips.push(...network);
  }
  const lookup=await lookupVpnIps(env,[...new Set(ips)],{maxRemote:LIMIT_BATCH*2});
  const output=[];
  for(const a of accounts){
    const record=aggregate(byUser.get(a.id)||[],lookup);
    if(record.samples>0)await storeReview(env,a.id,record,record.samples);
    output.push({id:a.id,name:txt(a.display_name,70),kind:record.kind,
      flags:record.flags,samples:record.samples,known_ips:(byUser.get(a.id)||[]).length,
      service:record.service});
  }
  const last=accounts.at(-1);
  return {ok:true,total,offset:page,next_offset:page+accounts.length,
    next_cursor:last?{created_at:last.created_at,id:last.id}:cursor,
    complete:!accounts.length||accounts.length<LIMIT_BATCH||page+accounts.length>=total,
    processed:accounts.length,remote_lookups:lookup.remote,provider_status:lookup.reason,results:output};
}
/** Optional deeper scan of ONE selected existing account (up to 8 historical networks). */
export async function scanVpnOneAccount(env,userId){
  if(!vpnGuardConfig(env).ready)throw fail('Najpierw skonfiguruj dostawcę w Cloudflare.',409);
  await ensureVpnGuard(env);
  const user=await env.COMMUNITY_DB.prepare("SELECT id,display_name FROM community_profiles WHERE id=? AND role='user' LIMIT 1").bind(userId).first();
  if(!user)throw fail('Nie znaleziono konta użytkownika.',404);
  const [oldest,newest]=await Promise.all([
    env.COMMUNITY_DB.prepare(`SELECT ip_address FROM community_user_ips
      WHERE user_id=? ORDER BY first_seen_at ASC LIMIT 4`).bind(userId).all(),
    env.COMMUNITY_DB.prepare(`SELECT ip_address FROM community_user_ips
      WHERE user_id=? ORDER BY last_seen_at DESC LIMIT 4`).bind(userId).all()
  ]);
  const ips=[...new Set([...(oldest.results||[]),...(newest.results||[])]
    .map(x=>publicNetworkIp(x.ip_address)).filter(Boolean))];
  const lookup=await lookupVpnIps(env,ips,{maxRemote:8}),record=aggregate(ips,lookup);
  if(record.samples>0)await storeReview(env,user.id,record,record.samples);
  return {ok:true,id:user.id,name:txt(user.display_name,70),kind:record.kind,
    flags:record.flags,samples:record.samples,known_ips:ips.length,
    provider_status:lookup.reason,remote_lookups:lookup.remote,service:record.service};
}
export async function markVpnReviewed(env,userId,ownerId){
  await ensureVpnGuard(env);
  const row=await env.COMMUNITY_DB.prepare(`UPDATE aio_vpn_guard_reviews_v1 SET reviewed_at=?,reviewed_by=?
    WHERE user_id=?`).bind(nowIso(),ownerId,userId).run();
  return Number(row.meta?.changes||0)===1;
}
export async function vpnGuardDashboard(env){
  await ensureVpnGuard(env);
  const db=env.COMMUNITY_DB,conf=vpnGuardConfig(env),day=nowIso().slice(0,10);
  // Bounded cleanup on owner review; exclude actual account history held elsewhere.
  await Promise.allSettled([
    db.prepare('DELETE FROM aio_vpn_guard_signups_v1 WHERE created_at<?')
      .bind(new Date(Date.now()-30*DAY).toISOString()).run(),
    db.prepare('DELETE FROM aio_vpn_guard_cache_v1 WHERE expires_ms<?')
      .bind(Date.now()-DAY).run(),
    db.prepare('DELETE FROM aio_vpn_guard_budget_v1 WHERE day<?')
      .bind(new Date(Date.now()-30*DAY).toISOString().slice(0,10)).run()
  ]);
  const [budget,total,summary,rows,signups]=await Promise.all([
    db.prepare('SELECT used FROM aio_vpn_guard_budget_v1 WHERE day=?').bind(day).first(),
    db.prepare("SELECT COUNT(*) n FROM community_profiles WHERE role='user'").first(),
    db.prepare(`SELECT verdict,COUNT(*) n FROM aio_vpn_guard_reviews_v1 GROUP BY verdict`).all(),
    db.prepare(`SELECT r.user_id,r.verdict,r.flags,r.service,r.samples,r.checked_at,r.reviewed_at,
         p.display_name FROM aio_vpn_guard_reviews_v1 r JOIN community_profiles p ON p.id=r.user_id AND p.role='user'
       WHERE r.verdict IN ('vpn','proxy','tor','datacenter','relay')
       ORDER BY CASE WHEN r.reviewed_at IS NULL THEN 0 ELSE 1 END,r.checked_at DESC LIMIT 150`).all(),
    db.prepare('SELECT kind,decision,COUNT(*) n FROM aio_vpn_guard_signups_v1 WHERE created_at>=? GROUP BY kind,decision')
      .bind(day+'T00:00:00.000Z').all()
  ]);
  return {ok:true,version:VPN_GUARD_VERSION,config:{mode:conf.mode,ready:conf.ready,
    provider_ready:conf.provider_ready,hash_ready:conf.hash_ready,daily_budget:conf.daily_budget},
    budget_used:Number(budget?.used||0),total_accounts:Number(total?.n||0),
    review_counts:Object.fromEntries((summary.results||[]).map(x=>[x.verdict,Number(x.n||0)])),
    today_signup_flags:signups.results||[],
    flagged:(rows.results||[]).map(x=>{
      let flags=[];try{const f=JSON.parse(x.flags||'[]');flags=Array.isArray(f)?f.filter(y=>typeof y==='string').slice(0,8):[];}catch{}
      return {id:x.user_id,name:txt(x.display_name,70),kind:x.verdict,
        service:txt(x.service,60),flags,samples:x.samples,
        checked_at:x.checked_at,reviewed_at:x.reviewed_at};
    })};
}
