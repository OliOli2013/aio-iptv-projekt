/* AIO IP Policy V7 — server-only 1-account/IP enforcement, owner-managed exceptions.
 * IP represents a network, NOT a person's identity. Never accuse or disclose peers.
 */
import {sha256,getOwnerId} from './_community.js';
import {isIpPolicyExemptV8} from './_aio_ip_policy_exempt_v8.js';
let schemaReady=null;
const now=()=>new Date().toISOString();
export const NOTICE='Ten publiczny adres IP jest już przypisany do innego konta AIO. Obowiązuje zasada: jeden adres IP — jedno konto, niezależnie od urządzenia. Użyj istniejącego konta lub skontaktuj się z administracją: /contact.html?topic=account-security.';
const error=(code,message)=>Object.assign(new Error(message),{status:code});
const getIp=request=>{const ip=String(request.headers.get('CF-Connecting-IP')||'').trim();return /^(?:[a-f\d:.]{2,45}|(?:\d{1,3}\.){3}\d{1,3})$/i.test(ip)?ip:'';};
const keyFor=async ip=>sha256('aio-unique-ip-v7:'+ip);
export async function ensureIpPolicy(env){
  if(!env.COMMUNITY_DB)throw error(503,'Brak powiązania z bazą danych.');
  if(!schemaReady)schemaReady=env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_ip_policy_claims(
      ip_key TEXT PRIMARY KEY,user_id TEXT NOT NULL,created_at TEXT NOT NULL,source TEXT NOT NULL)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_ip_claim_user ON aio_ip_policy_claims(user_id)'),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_ip_policy_holds(
      user_id TEXT PRIMARY KEY,ip_key TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',
      reason TEXT NOT NULL,created_at TEXT NOT NULL,released_at TEXT,released_by TEXT,
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_ip_holds_status ON aio_ip_policy_holds(status,created_at DESC)'),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_ip_policy_exceptions(
      ip_key TEXT NOT NULL,user_id TEXT NOT NULL,reason TEXT NOT NULL,approved_by TEXT NOT NULL,
      created_at TEXT NOT NULL,PRIMARY KEY(ip_key,user_id))`),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_ip_policy_signup_permits(
      ip_key TEXT PRIMARY KEY,remaining INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,
      approved_by TEXT NOT NULL,reason TEXT NOT NULL)`),
    // V12 cleanup: keep only a time-limited hashed IP cooldown after removing an unverified account.
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_ip_policy_cleanup_cooldowns_v1 (
      ip_key TEXT PRIMARY KEY,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,
      reason TEXT NOT NULL)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_cleanup_ip_expiry ON aio_ip_policy_cleanup_cooldowns_v1(expires_at)'),
    // V8: one account can have independent network-specific holds. Old V7 data stays intact.
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_ip_policy_holds_v8(
      user_id TEXT NOT NULL,ip_key TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',
      reason TEXT NOT NULL,created_at TEXT NOT NULL,released_at TEXT,released_by TEXT,
      PRIMARY KEY(user_id,ip_key),
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_ip_v8_holds_status ON aio_ip_policy_holds_v8(status,created_at DESC)'),
    // V10: aggregated denied same-IP registrations and valid-password login restrictions.
    // Never store raw IP, password, email or unregistered display name.
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_ip_policy_denials_v10 (
      ip_key TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('register','login')),
      attempts INTEGER NOT NULL DEFAULT 1, first_at TEXT NOT NULL, last_at TEXT NOT NULL,
      last_user_id TEXT, reviewed_at TEXT, reviewed_by TEXT,
      PRIMARY KEY(ip_key,kind))`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_ip_denials_unread ON aio_ip_policy_denials_v10(reviewed_at,last_at DESC)'),
    // V11: only a fresh, substantial wave can reopen an acknowledged network alert.
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_ip_policy_denial_windows_v11 (
      ip_key TEXT NOT NULL,kind TEXT NOT NULL,bucket_start INTEGER NOT NULL,hits INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(ip_key,kind,bucket_start))`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_ip_denial_windows_time ON aio_ip_policy_denial_windows_v11(bucket_start)'),
    // One acknowledgement per IP-hold incident; re-created holds generate fresh alerts.
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_ip_policy_hold_reviews_v9 (
      user_id TEXT NOT NULL, ip_key TEXT NOT NULL, hold_created_at TEXT NOT NULL,
      reviewed_at TEXT NOT NULL, reviewed_by TEXT NOT NULL,
      PRIMARY KEY(user_id,ip_key,hold_created_at))`),
    env.COMMUNITY_DB.prepare(`INSERT OR IGNORE INTO aio_ip_policy_holds_v8
      (user_id,ip_key,status,reason,created_at,released_at,released_by)
      SELECT user_id,ip_key,status,reason,created_at,released_at,released_by FROM aio_ip_policy_holds`),
    // Never hold the two fixed owner test accounts for same-IP policy.
    env.COMMUNITY_DB.prepare(`UPDATE aio_ip_policy_holds_v8
      SET status='released',released_at=COALESCE(released_at,CURRENT_TIMESTAMP),released_by='AIO_V8_PROTECTED'
      WHERE status='active' AND user_id IN ('c2847d96-0867-4b6c-a53b-700059b1a403','8ff5c4f0-2742-4a10-b4b0-20c9713d708a')`)
  ]).catch(e=>{schemaReady=null;throw e;});
  await schemaReady;
}
export async function activeIpHold(env,userId,requestOrIp){
  if(!userId || isIpPolicyExemptV8(userId,env))return null;
  const ip=typeof requestOrIp==='string'?requestOrIp:(requestOrIp?getIp(requestOrIp):'');
  // A hold is limited to the network that triggered it. On another IP it does
  // not erase the account, its grants, VIP entitlement, or its download quota.
  if(!ip)return null;
  await ensureIpPolicy(env);
  const key=await keyFor(ip);
  const db=env.COMMUNITY_DB;
  const currentHold=await db.prepare("SELECT ip_key,reason,created_at FROM aio_ip_policy_holds_v8 WHERE user_id=? AND ip_key=? AND status='active' LIMIT 1").bind(userId,key).first();
  if(currentHold)return currentHold;
  // Enforce the same 1-IP/1-account rule on EXISTING sessions and new devices.
  // A known network cannot be silently reused by another account, even after
  // an admin has acknowledged/released an incident or granted an old exception.
  // Fast path: assigned network and its rightful account require no writes.
  let claim=await db.prepare('SELECT user_id FROM aio_ip_policy_claims WHERE ip_key=?').bind(key).first();
  if(claim?.user_id===userId)return null;
  if(!claim){
    const known=await peers(db,ip);
    if(known.length)await claimExisting(env,ip,key,known);
    claim=await db.prepare('SELECT user_id FROM aio_ip_policy_claims WHERE ip_key=?').bind(key).first();
    if(claim?.user_id===userId)return null;
  }
  if(!claim){
    await db.prepare("INSERT OR IGNORE INTO aio_ip_policy_claims(ip_key,user_id,created_at,source) VALUES(?,?,?,'session')")
      .bind(key,userId,now()).run();
    const after=await db.prepare('SELECT user_id FROM aio_ip_policy_claims WHERE ip_key=?').bind(key).first();
    if(after?.user_id===userId)return null;
  }
  return {ip_key:key,reason:NOTICE,created_at:now()};
}

async function peers(db,ip){
  const q=await db.prepare(`SELECT ui.user_id,p.display_name,p.role,p.created_at,ui.first_seen_at,ui.last_seen_at
    FROM community_user_ips ui JOIN community_profiles p ON p.id=ui.user_id
    WHERE ui.ip_address=? ORDER BY p.created_at ASC,ui.first_seen_at ASC,p.id ASC`).bind(ip).all();
  return q.results||[];
}
async function primary(env,users){
  const owner=await getOwnerId(env);
  // Protected accounts don't consume the one ordinary account permitted on an IP.
  return users.find(x=>x.user_id!==owner && !isIpPolicyExemptV8(x.user_id,env))||null;
}
async function claimExisting(env,ip,ipKey,users){
  const db=env.COMMUNITY_DB,first=await primary(env,users);
  if(!first){
    // V7 could reserve an IP for the owner; protected-only networks are not full.
    const owner=await getOwnerId(env);
    await db.prepare('DELETE FROM aio_ip_policy_claims WHERE ip_key=? AND user_id IN (?,?,?)')
      .bind(ipKey,owner,'c2847d96-0867-4b6c-a53b-700059b1a403','8ff5c4f0-2742-4a10-b4b0-20c9713d708a').run();
    return null;
  }
  await db.prepare(`INSERT OR IGNORE INTO aio_ip_policy_claims(ip_key,user_id,created_at,source) VALUES(?,?,?,?)`)
    .bind(ipKey,first.user_id,now(),'history').run();
  // Keep a deterministic primary ordinary account, never the owner/test accounts.
  // A previously reserved network is NEVER reassigned to a different account.
  // Keep the first persisted claim, even when new historical peers are discovered.
  return first;
}
async function permitted(db,ipKey,userId){
  // Strict owner policy: old exceptions remain in D1 audit history but are not authorization.
  return false;
}
export async function isApprovedOnCurrentIp(env,request,userId){
  const ip=getIp(request);if(!ip)return false;
  await ensureIpPolicy(env);
  return permitted(env.COMMUNITY_DB,await keyFor(ip),userId);
}
/* IMPORTANT: call BEFORE inserting a new profile. The reservation has a unique PK,
 * preventing two simultaneous registrations from claiming an empty IP. */
/** One pending alert per network and denial type, not one bell alert per request.
 * A reviewed network reopens only after >=5 new denials within a fresh 10-minute bucket.
 */
export async function noteIpDenial(env,request,kind,userId=null){
  if(!['register','login'].includes(kind))return;
  const ip=getIp(request);if(!ip)return;
  await ensureIpPolicy(env);
  const key=await keyFor(ip),at=now(),ms=Date.now(),bucket=Math.floor(ms/600000)*600000;
  await env.COMMUNITY_DB.prepare(`INSERT INTO aio_ip_policy_denials_v10
    (ip_key,kind,attempts,first_at,last_at,last_user_id) VALUES(?,?,1,?,?,?)
    ON CONFLICT(ip_key,kind) DO UPDATE SET
      attempts=aio_ip_policy_denials_v10.attempts+1,last_at=excluded.last_at,
      last_user_id=COALESCE(excluded.last_user_id,aio_ip_policy_denials_v10.last_user_id),
      reviewed_at=aio_ip_policy_denials_v10.reviewed_at,
      reviewed_by=aio_ip_policy_denials_v10.reviewed_by`)
    .bind(key,kind,at,at,userId).run();
  const hit=await env.COMMUNITY_DB.prepare(`INSERT INTO aio_ip_policy_denial_windows_v11
    (ip_key,kind,bucket_start,hits) VALUES(?,?,?,1)
    ON CONFLICT(ip_key,kind,bucket_start) DO UPDATE SET hits=hits+1 RETURNING hits`)
    .bind(key,kind,bucket).first();
  // Single retries never re-notify the owner. A NEW wave must start after acknowledgement.
  if(Number(hit?.hits||0)>=5){
    await env.COMMUNITY_DB.prepare(`UPDATE aio_ip_policy_denials_v10
      SET reviewed_at=NULL,reviewed_by=NULL WHERE ip_key=? AND kind=?
      AND reviewed_at IS NOT NULL AND reviewed_at<?`)
      .bind(key,kind,new Date(bucket).toISOString()).run();
  }
  if(Math.random()<0.003){
    await env.COMMUNITY_DB.prepare('DELETE FROM aio_ip_policy_denial_windows_v11 WHERE bucket_start<?')
      .bind(ms-2*86400000).run().catch(()=>{});
  }
}
/** All historical additional ordinary accounts, even outside the 5 visible groups.
 * Read-only, excludes owner/exemptions and accounts already held or approved on that IP.
 */
export async function historicalPendingIpSummary(env){
  await ensureIpPolicy(env);
  const db=env.COMMUNITY_DB,owner=await getOwnerId(env);
  const [history,held,approved]=await Promise.all([
    db.prepare(`SELECT ui.ip_address ip,ui.user_id,p.created_at,ui.first_seen_at,ui.last_seen_at
      FROM community_user_ips ui JOIN community_profiles p ON p.id=ui.user_id
      WHERE ui.ip_address IS NOT NULL AND LENGTH(ui.ip_address)>2
        AND ui.ip_address IN (SELECT ip_address FROM community_user_ips
          WHERE ip_address IS NOT NULL GROUP BY ip_address HAVING COUNT(DISTINCT user_id)>1)
      ORDER BY ui.ip_address,p.created_at,ui.first_seen_at,p.id`).all(),
    db.prepare("SELECT user_id,ip_key FROM aio_ip_policy_holds_v8 WHERE status='active'").all(),
    db.prepare('SELECT user_id,ip_key FROM aio_ip_policy_exceptions').all()
  ]);
  const heldKeys=new Set((held.results||[]).map(x=>x.user_id+':'+x.ip_key));
  const allowKeys=new Set((approved.results||[]).map(x=>x.user_id+':'+x.ip_key));
  const networks=new Map();
  for(const row of history.results||[]){
    if(row.user_id===owner||isIpPolicyExemptV8(row.user_id,env))continue;
    if(!networks.has(row.ip))networks.set(row.ip,[]);
    networks.get(row.ip).push(row);
  }
  let groups=0,accounts=0,latest=null;
  for(const [ip,people] of networks){
    if(people.length<2)continue;
    const key=await keyFor(ip);
    let networkPending=0;
    for(const person of people.slice(1)){
      const id=person.user_id+':'+key;
      if(heldKeys.has(id)||allowKeys.has(id))continue;
      accounts++;networkPending++;
      if(!latest||person.last_seen_at>latest)latest=person.last_seen_at;
    }
    if(networkPending)groups++;
  }
  return {groups,accounts,latest};
}
export async function reserveRegistrationIp(env,request,newUserId){
  await ensureIpPolicy(env);
  const ip=getIp(request);if(!ip)throw error(503,'Nie można bezpiecznie ustalić adresu IP. Spróbuj ponownie później.');
  const db=env.COMMUNITY_DB,key=await keyFor(ip);
  // Closed cleanup accounts cannot immediately re-register and reset free downloads.
  // The SHA-256 key is already used by the one-account-IP policy; no raw IP is stored here.
  const stamp=now();
  const cooldown=await db.prepare('SELECT expires_at FROM aio_ip_policy_cleanup_cooldowns_v1 WHERE ip_key=? AND expires_at>? LIMIT 1')
    .bind(key,stamp).first();
  if(cooldown){
    await noteIpDenial(env,request,'register').catch(()=>{});
    throw error(429,'Rejestracja z tej sieci jest czasowo niedostępna po usunięciu niezweryfikowanego konta. Spróbuj później lub skontaktuj się z administracją.');
  }
  // Remove expired cooldown rows opportunistically; the lock is never permanent.
  await db.prepare('DELETE FROM aio_ip_policy_cleanup_cooldowns_v1 WHERE expires_at<=?').bind(stamp).run();
  const existing=await peers(db,ip);
  let claim=await db.prepare('SELECT user_id FROM aio_ip_policy_claims WHERE ip_key=?').bind(key).first();
  if(existing.length){await claimExisting(env,ip,key,existing);claim=await db.prepare('SELECT user_id FROM aio_ip_policy_claims WHERE ip_key=?').bind(key).first();}
  if(claim){
    // No exception, no one-time permit: an occupied public IP never authorizes another signup.
    await noteIpDenial(env,request,'register').catch(e=>console.error('[AIO IP denial registration]',String(e?.message||e).slice(0,100)));
    throw error(409,NOTICE);
  }
  const lock=await db.prepare(`INSERT OR IGNORE INTO aio_ip_policy_claims(ip_key,user_id,created_at,source)
    VALUES(?,?,?,'register')`).bind(key,newUserId,now()).run();
  if(!lock.meta?.changes){
    await noteIpDenial(env,request,'register').catch(e=>console.error('[AIO IP denial registration]',String(e?.message||e).slice(0,100)));
    throw error(409,NOTICE);
  }
  return {key,existing:false,permit:false};
}
export async function rollbackRegistrationIp(env,lease,newUserId){
  if(!lease)return;
  if(lease.permit){await env.COMMUNITY_DB.prepare('UPDATE aio_ip_policy_signup_permits SET remaining=remaining+1 WHERE ip_key=?').bind(lease.key).run();}
  else if(!lease.existing)await env.COMMUNITY_DB.prepare("DELETE FROM aio_ip_policy_claims WHERE ip_key=? AND user_id=? AND source='register'").bind(lease.key,newUserId).run();
}
export function permitRegistrationStatement(env,lease,newUserId){
  // Kept for compatible registration batch, but no additional account can be permitted.
  return null;
}
export async function checkAfterValidLogin(env,request,userId,role){
  await ensureIpPolicy(env);
  if(userId===await getOwnerId(env) || isIpPolicyExemptV8(userId,env))return null;
  const ip=getIp(request);if(!ip)return null;
  const hold=await activeIpHold(env,userId,request);
  if(hold){
    await noteIpDenial(env,request,'login',userId).catch(e=>console.error('[AIO IP denial login]',String(e?.message||e).slice(0,100)));
    return hold;
  }
  const db=env.COMMUNITY_DB,key=await keyFor(ip);
  if(await permitted(db,key,userId))return null;
  const known=await peers(db,ip);
  await claimExisting(env,ip,key,known);
  const claim=await db.prepare('SELECT user_id FROM aio_ip_policy_claims WHERE ip_key=?').bind(key).first();
  if(!claim){
    const ok=await db.prepare("INSERT OR IGNORE INTO aio_ip_policy_claims(ip_key,user_id,created_at,source) VALUES(?,?,?,'login')").bind(key,userId,now()).run();
    if(ok.meta?.changes)return null;
  }else if(claim.user_id===userId)return null;
  const reread=await db.prepare('SELECT user_id FROM aio_ip_policy_claims WHERE ip_key=?').bind(key).first();
  if(reread?.user_id===userId)return null;
  await imposeIpHold(env,userId,key,'Kilka kont korzysta z jednego adresu IP. Wyjaśnij sytuację z administracją AIO.');
  await noteIpDenial(env,request,'login',userId).catch(e=>console.error('[AIO IP denial login]',String(e?.message||e).slice(0,100)));
  return activeIpHold(env,userId,request);
}
export async function imposeIpHold(env,userId,key,reason){
  await ensureIpPolicy(env);
  if(userId===await getOwnerId(env) || isIpPolicyExemptV8(userId,env))return false;
  const db=env.COMMUNITY_DB;
  if(await permitted(db,key,userId))return false;
  const result=await db.prepare(`INSERT INTO aio_ip_policy_holds_v8(user_id,ip_key,status,reason,created_at)
    VALUES(?,?,'active',?,?)
    ON CONFLICT(user_id,ip_key) DO UPDATE SET status='active',reason=excluded.reason,
      created_at=excluded.created_at,released_at=NULL,released_by=NULL
      WHERE aio_ip_policy_holds_v8.status<>'active'`).bind(userId,key,reason,now()).run();
  return !!result.meta?.changes;
}
const masked=ip=>{if(ip.includes(':'))return ip.slice(0,10)+'…';const parts=ip.split('.');return parts.length===4?parts.slice(0,2).join('.')+'.xxx.xxx':'ukryty';};
export async function listCollisionGroups(env,{offset=0,limit=30}={}){
  await ensureIpPolicy(env);const db=env.COMMUNITY_DB;
  const r=await db.prepare(`SELECT ui.ip_address ip,COUNT(DISTINCT ui.user_id) n,MAX(ui.last_seen_at) latest
    FROM community_user_ips ui JOIN community_profiles p ON p.id=ui.user_id
    WHERE ui.ip_address IS NOT NULL AND length(ui.ip_address)>2
    GROUP BY ui.ip_address HAVING COUNT(DISTINCT ui.user_id)>1
    ORDER BY latest DESC,ip ASC LIMIT ? OFFSET ?`).bind(Math.min(limit,50),Math.max(0,offset)).all();
  const owner=await getOwnerId(env),groups=[];
  for(const item of r.results||[]){
    const users=await peers(db,item.ip),key=await keyFor(item.ip);
    // Owner and test accounts are excluded from this report, not from authentication.
    // A protected-only/one-ordinary-account network is not a duplicate group.
    const ordinary=users.filter(u=>u.user_id!==owner&&!isIpPolicyExemptV8(u.user_id,env));
    if(ordinary.length<2)continue;
    const first=await primary(env,ordinary),ids=[];
    for(const u of ordinary){
      const protectedAccount=u.user_id===owner||isIpPolicyExemptV8(u.user_id,env);
      const hold=protectedAccount?null:await activeIpHold(env,u.user_id,item.ip);
      const allow=protectedAccount?false:await permitted(db,key,u.user_id);
      ids.push({id:u.user_id,name:u.display_name,owner:u.user_id===owner,
        protected:protectedAccount,first_seen:u.first_seen_at,last_seen:u.last_seen_at,
        blocked:!!hold,approved:allow,primary:u.user_id===first?.user_id});
    }
    const pending=ids.filter(x=>!x.protected&&!x.primary&&!x.approved&&!x.blocked).length;
    // Single group status for the owner dashboard: acknowledgement and restriction are separate.
    const reviewCounts=await db.prepare(`SELECT COUNT(*) active,
      COALESCE(SUM(CASE WHEN v.user_id IS NULL THEN 1 ELSE 0 END),0) unreviewed
      FROM aio_ip_policy_holds_v8 h
      LEFT JOIN aio_ip_policy_hold_reviews_v9 v
        ON v.user_id=h.user_id AND v.ip_key=h.ip_key AND v.hold_created_at=h.created_at
      WHERE h.ip_key=? AND h.status='active'`).bind(key).first();
    const permit=await db.prepare('SELECT remaining FROM aio_ip_policy_signup_permits WHERE ip_key=?').bind(key).first();
    groups.push({ip_key:key,ip:item.ip,ip_masked:masked(item.ip),last_seen:item.latest,accounts:ids,pending,
      active_holds:Number(reviewCounts?.active||0),unreviewed_holds:Number(reviewCounts?.unreviewed||0),
      signup_permits:Number(permit?.remaining||0)});
  }
  return {groups,has_more:(r.results||[]).length>=Math.min(limit,50)};
}
export async function applyHistoricalGroup(env,key,ip,adminId){
  await ensureIpPolicy(env);const db=env.COMMUNITY_DB;
  if(!ip||await keyFor(ip)!==key)throw error(400,'Nieprawidłowe wskazanie sieci.');
  const users=await peers(db,ip);if(users.length<2)throw error(409,'Z tego IP nie ma już wielu kont.');
  const selected=await primary(env,users);
  await claimExisting(env,ip,key,users);
  let held=0;
  const owner=await getOwnerId(env);
  for(const x of users){
    if(x.user_id===owner || isIpPolicyExemptV8(x.user_id,env) || x.user_id===selected?.user_id || await permitted(db,key,x.user_id))continue;
    if(await imposeIpHold(env,x.user_id,key,'Z tego IP korzysta więcej niż jedno konto AIO; blokada do wyjaśnienia z administracją.'))held++;
  }
  return {held,accounts:users.length};
}
/** Mark currently active blocks from ONE validated network as read; never unlock them.
 * Unique incident key includes hold_created_at, so a later hold creates a new alert.
 */
export async function reviewIpGroup(env,key,ip,adminId){
  await ensureIpPolicy(env);
  if(!ip || await keyFor(ip)!==key)throw error(400,'Nieprawidłowe wskazanie sieci.');
  const result=await env.COMMUNITY_DB.prepare(`INSERT OR IGNORE INTO aio_ip_policy_hold_reviews_v9
    (user_id,ip_key,hold_created_at,reviewed_at,reviewed_by)
    SELECT h.user_id,h.ip_key,h.created_at,?,? FROM aio_ip_policy_holds_v8 h
    WHERE h.ip_key=? AND h.status='active'`).bind(now(),adminId,key).run();
  return {reviewed:Number(result.meta?.changes||0)};
}

export async function grantException(env,key,userId,adminId,reason){
  throw error(409,'Zasada 1 IP = 1 konto: wyjątki administracyjne są wyłączone.');
}
export async function allowNextSignup(env,key,adminId,reason,ip){
  throw error(409,'Zasada 1 IP = 1 konto: zgody na dodatkowe rejestracje są wyłączone.');
}
