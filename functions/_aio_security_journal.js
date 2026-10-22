/* AIO Security Journal V1: server-created immutable activity rows & temporary shared-IP review holds.
 * No passwords, cookies, raw e-mails, user agents or raw IPs in this journal.
 * Shared household IP is NOT sufficient to ban an account or an IP globally.
 */
import {sha256,clientIp,isOwnerId} from './_community.js';
import {isIpPolicyExemptV8} from './_aio_ip_policy_exempt_v8.js';
import {isApprovedOnCurrentIp} from './_aio_ip_one_account_v7.js';
let ready;
const HOLD_MS=24*60*60*1000;
function iso(){return new Date().toISOString();}
function safe(v,cap=120){return String(v||'').replace(/[\u0000-\u001f<>]/g,' ').slice(0,cap);}
function deviceClass(request){
  const ua=String(request.headers.get('user-agent')||'').slice(0,500);
  const os=/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iOS':/Windows/i.test(ua)?'Windows':/Macintosh|Mac OS/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'Inne';
  const browser=/Edg\//.test(ua)?'Edge':/OPR\//.test(ua)?'Opera':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Inna przeglądarka';
  return os+' / '+browser;
}
export async function ensureSecurityJournal(env){
  if(!env.COMMUNITY_DB)throw new Error('Brak COMMUNITY_DB');
  if(!ready)ready=env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_security_journal (
      id TEXT PRIMARY KEY,event TEXT NOT NULL,user_id TEXT,ip_fingerprint TEXT,
      created_at TEXT NOT NULL,device TEXT NOT NULL DEFAULT '',detail TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE SET NULL)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_sec_created ON aio_security_journal(created_at DESC)'),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_sec_user ON aio_security_journal(user_id,created_at DESC)'),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_sec_event ON aio_security_journal(event,created_at DESC)'),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_security_shared_holds (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL,peer_user_id TEXT NOT NULL,
      ip_fingerprint TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','released')),
      released_at TEXT,released_by TEXT,
      UNIQUE(user_id,ip_fingerprint),
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_sec_holds_user ON aio_security_shared_holds(user_id,expires_at)'),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_sec_holds_time ON aio_security_shared_holds(created_at DESC)'),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_security_paid_holds (
      user_id TEXT PRIMARY KEY,id TEXT NOT NULL,created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active'
      CHECK(status IN ('active','released')),
      evidence TEXT NOT NULL DEFAULT '', released_at TEXT,released_by TEXT,
      review_pause_until TEXT,
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_sec_paid_time ON aio_security_paid_holds(created_at DESC)'),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_security_shared_allow (
      user_id TEXT NOT NULL,ip_fingerprint TEXT NOT NULL,
      created_at TEXT NOT NULL,expires_at TEXT NOT NULL,approved_by TEXT NOT NULL,
      PRIMARY KEY(user_id,ip_fingerprint),
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE)`)
  ]).catch(e=>{ready=null;throw e;});
  await ready;
}
export async function ipFingerprint(request){
  const ip=clientIp(request);
  // Hashed network fingerprint, not a raw IP. Absence never causes a hold.
  return ip?await sha256('aio-security-ip-v1:'+ip):null;
}
export async function logSecurity(env,request,event,userId=null,detail=''){
  try{
    await ensureSecurityJournal(env);
    await env.COMMUNITY_DB.prepare(`INSERT INTO aio_security_journal(id,event,user_id,ip_fingerprint,created_at,device,detail)
      VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),safe(event,50),userId||null,await ipFingerprint(request),iso(),deviceClass(request),safe(detail)).run();
    return true;
  }catch(e){console.error('AIO Security Journal: write failed',String(e?.message||'error'));return false;}
}
export async function activeSharedHold(env,request,userId){
  if(!userId)return null;
  await ensureSecurityJournal(env);
  // Paid/VIP suspicious sharing remains account-wide, never tied to only one IP.
  const paid=await env.COMMUNITY_DB.prepare(`SELECT id,created_at,expires_at FROM aio_security_paid_holds
    WHERE user_id=? AND status='active' AND expires_at>? LIMIT 1`).bind(userId,iso()).first();
  if(paid)return {id:paid.id,kind:'paid',expires_at:paid.expires_at,
    message:'Wykryto jednoczesne korzystanie z płatnego konta AIO w różnych sieciach i na różnych urządzeniach. Pobieranie zostało wstrzymane na czas weryfikacji. Jeżeli to Twoje urządzenia, wyjaśnij sytuację przez formularz Kontakt z administratorem: /contact.html.'};
  // Legacy shared-IP restrictions are network-scoped. Test accounts and
  // owner-approved users cannot be held for the same connection alone.
  if(isIpPolicyExemptV8(userId,env))return null;
  const fingerprint=await ipFingerprint(request);
  if(!fingerprint)return null;
  const row=await env.COMMUNITY_DB.prepare(`SELECT id,created_at,expires_at FROM aio_security_shared_holds
    WHERE user_id=? AND ip_fingerprint=? AND status='active' AND expires_at>? ORDER BY expires_at DESC LIMIT 1`)
    .bind(userId,fingerprint,iso()).first();
  if(row && await isApprovedOnCurrentIp(env,request,userId))return null;
  return row?{id:row.id,expires_at:row.expires_at,message:'Wykryto korzystanie z tego samego połączenia przez inne konto AIO. Dla bezpieczeństwa pobieranie z tego konta jest czasowo wstrzymane. Skontaktuj się z administratorem; pozostałe funkcje konta działają.'}:null;
}
export async function reviewSharedIpAtLogin(env,request,userId,role='user'){
  // This check runs only after successful authenticated register/login.
  if(!userId || role==='admin' || isIpPolicyExemptV8(userId,env) || await isOwnerId(env,userId,role) || await isApprovedOnCurrentIp(env,request,userId))return null;
  const ip=clientIp(request);
  if(!ip)return null;
  await ensureSecurityJournal(env);
  const fingerprint=await ipFingerprint(request);
  const permission=await env.COMMUNITY_DB.prepare(`SELECT 1 ok FROM aio_security_shared_allow
    WHERE user_id=? AND ip_fingerprint=? AND expires_at>? LIMIT 1`)
    .bind(userId,fingerprint,iso()).first();
  if(permission)return null;
  const existing=await activeSharedHold(env,request,userId);
  if(existing)return existing;
  const db=env.COMMUNITY_DB;
  const self=await db.prepare('SELECT first_seen_at FROM community_user_ips WHERE user_id=? AND ip_address=? LIMIT 1').bind(userId,ip).first();
  const peer=await db.prepare(`SELECT ui.user_id,ui.first_seen_at FROM community_user_ips ui
    JOIN community_profiles p ON p.id=ui.user_id
    WHERE ui.ip_address=? AND ui.user_id<>? AND p.role NOT IN ('admin','moderator')
      AND ui.last_seen_at>=?
    ORDER BY ui.first_seen_at ASC, ui.user_id ASC LIMIT 1`).bind(ip,userId,new Date(Date.now()-HOLD_MS).toISOString()).first();
  if(!self)return activeSharedHold(env,request,userId);
  if(!peer){
    // Older shared networks are only a signal for review, never an automatic ban.
    const historical=await db.prepare(`SELECT ui.user_id FROM community_user_ips ui
      JOIN community_profiles p ON p.id=ui.user_id
      WHERE ui.ip_address=? AND ui.user_id<>? AND p.role NOT IN ('admin','moderator')
      ORDER BY ui.last_seen_at DESC LIMIT 1`).bind(ip,userId).first();
    if(historical){
      const finger=await ipFingerprint(request);
      const seen=await db.prepare(`SELECT id FROM aio_security_journal
        WHERE user_id=? AND event='shared_ip_historical' AND ip_fingerprint=? LIMIT 1`).bind(userId,finger).first();
      if(!seen)await logSecurity(env,request,'shared_ip_historical',userId,'Dawna aktywność innego konta na tym IP; bez blokady');
      return {message:'Ostrzeżenie AIO: z tego połączenia korzystano wcześniej z innego konta. Nie ograniczamy pobierania, ale przypominamy o używaniu własnego konta i zakazie obchodzenia limitów.'};
    }
    return activeSharedHold(env,request,userId);
  }
  // Never freeze both sides of the same household; the earlier user is left alone.
  const a=Date.parse(self.first_seen_at),b=Date.parse(peer.first_seen_at);
  if(Number.isFinite(a)&&Number.isFinite(b)&&(a<b || (a===b&&userId<peer.user_id)))return activeSharedHold(env,request,userId);
  const finger=await ipFingerprint(request),now=iso(),until=new Date(Date.now()+HOLD_MS).toISOString();
  const insert=await db.prepare(`INSERT INTO aio_security_shared_holds
    (id,user_id,peer_user_id,ip_fingerprint,created_at,expires_at,status)
    VALUES(?,?,?,?,?,?,'active')
    ON CONFLICT(user_id,ip_fingerprint) DO UPDATE SET
      id=excluded.id,peer_user_id=excluded.peer_user_id,created_at=excluded.created_at,
      expires_at=excluded.expires_at,status='active',released_at=NULL,released_by=NULL
    WHERE aio_security_shared_holds.status='released' OR aio_security_shared_holds.expires_at<=excluded.created_at`).bind(crypto.randomUUID(),userId,peer.user_id,finger,now,until).run();
  if(Number(insert.meta?.changes||0)>0){
    await logSecurity(env,request,'shared_ip_hold_created',userId,'Pobieranie wstrzymane na 24 h, do przeglądu przez właściciela');
  }
  return activeSharedHold(env,request,userId);
}


/** Paid/VIP account-sharing review: two currently used sessions, different
 * public IPs AND different OS/browser classes in <=15 minutes. A simple IP
 * change or two devices behind the same home router do not trigger this rule.
 * Only the owner can release; a 7-day review grace prevents instant re-holds.
 */
export async function reviewPaidSessionSharing(env,request,userId,paidAccess=false){
  if(!paidAccess||!userId)return null;
  await ensureSecurityJournal(env);
  if(await isOwnerId(env,userId,'admin'))return null;
  const existing=await activeSharedHold(env,request,userId);
  if(existing)return existing;
  const db=env.COMMUNITY_DB, now=iso();
  const previous=await db.prepare('SELECT review_pause_until FROM aio_security_paid_holds WHERE user_id=? LIMIT 1').bind(userId).first();
  if(previous?.review_pause_until && previous.review_pause_until>now)return null;
  const ip=clientIp(request),here=deviceClass(request);
  if(!ip||here==='Inne / Inna przeglądarka')return null;
  const cutoff=new Date(Date.now()-15*60*1000).toISOString();
  const q=await db.prepare(`SELECT ip_address,user_agent,last_seen_at FROM community_sessions
    WHERE user_id=? AND datetime(expires_at)>datetime('now')
      AND datetime(last_seen_at)>=datetime(?)
    ORDER BY last_seen_at DESC LIMIT 40`).bind(userId,cutoff).all();
  const candidates=(q.results||[]).filter(s=>
    s.ip_address && s.ip_address!==ip && s.user_agent &&
    deviceClass({headers:{get:(k)=>k==='user-agent'?s.user_agent:''}})!==here
  );
  if(!candidates.length)return null;
  const until=new Date(Date.now()+24*3600000).toISOString();
  const reason='Różne sieci i różne urządzenia aktywne w ciągu 15 minut.';
  const result=await db.prepare(`INSERT INTO aio_security_paid_holds
      (user_id,id,created_at,expires_at,status,evidence)
    VALUES(?,?,?,?,'active',?)
    ON CONFLICT(user_id) DO UPDATE SET
      id=excluded.id,created_at=excluded.created_at,expires_at=excluded.expires_at,
      status='active',evidence=excluded.evidence,released_at=NULL,released_by=NULL,
      review_pause_until=NULL
    WHERE (aio_security_paid_holds.status='active' AND aio_security_paid_holds.expires_at<=excluded.created_at)
       OR (aio_security_paid_holds.status='released' AND
           (aio_security_paid_holds.review_pause_until IS NULL OR aio_security_paid_holds.review_pause_until<=excluded.created_at))`)
    .bind(userId,crypto.randomUUID(),now,until,reason).run();
  if(Number(result.meta?.changes||0)>0)
    await logSecurity(env,request,'paid_account_sharing_hold',userId,reason);
  return activeSharedHold(env,request,userId);
}
