/* AIO IP Policy V7 — server-only 1-account/IP enforcement, owner-managed exceptions.
 * IP represents a network, NOT a person's identity. Never accuse or disclose peers.
 */
import {sha256,clientIp,getOwnerId} from './_community.js';
let schemaReady=null;
const now=()=>new Date().toISOString();
export const NOTICE='Z tego publicznego adresu IP korzysta już inne konto AIO. Zgodnie z zasadą jednego konta na adres IP nie możesz utworzyć ani używać kolejnego konta bez zgody administracji. Jeżeli sytuacja wymaga wyjaśnienia, skontaktuj się z administracją przez /contact.html?topic=account-security.';
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
      approved_by TEXT NOT NULL,reason TEXT NOT NULL)`)
  ]).catch(e=>{schemaReady=null;throw e;});
  await schemaReady;
}
export async function activeIpHold(env,userId){
  if(!userId)return null;
  await ensureIpPolicy(env);
  return env.COMMUNITY_DB.prepare("SELECT ip_key,reason,created_at FROM aio_ip_policy_holds WHERE user_id=? AND status='active' LIMIT 1").bind(userId).first();
}
async function peers(db,ip){
  const q=await db.prepare(`SELECT ui.user_id,p.display_name,p.role,p.created_at,ui.first_seen_at,ui.last_seen_at
    FROM community_user_ips ui JOIN community_profiles p ON p.id=ui.user_id
    WHERE ui.ip_address=? ORDER BY p.created_at ASC,ui.first_seen_at ASC,p.id ASC`).bind(ip).all();
  return q.results||[];
}
async function primary(env,users){
  const owner=await getOwnerId(env);
  return users.find(x=>x.user_id===owner)||users[0]||null;
}
async function claimExisting(env,ip,ipKey,users){
  const db=env.COMMUNITY_DB,first=await primary(env,users);
  if(!first)return null;
  await db.prepare(`INSERT OR IGNORE INTO aio_ip_policy_claims(ip_key,user_id,created_at,source) VALUES(?,?,?,?)`)
    .bind(ipKey,first.user_id,now(),'history').run();
  // Resolve legacy races deterministically: account owner wins, otherwise oldest registered account.
  if(users.length>1 || first.user_id===await getOwnerId(env))await db.prepare("UPDATE aio_ip_policy_claims SET user_id=?,source='history' WHERE ip_key=?").bind(first.user_id,ipKey).run();
  return first;
}
async function permitted(db,ipKey,userId){
  return !!await db.prepare('SELECT 1 ok FROM aio_ip_policy_exceptions WHERE ip_key=? AND user_id=?').bind(ipKey,userId).first();
}
export async function isApprovedOnCurrentIp(env,request,userId){
  const ip=getIp(request);if(!ip)return false;
  await ensureIpPolicy(env);
  return permitted(env.COMMUNITY_DB,await keyFor(ip),userId);
}
/* IMPORTANT: call BEFORE inserting a new profile. The reservation has a unique PK,
 * preventing two simultaneous registrations from claiming an empty IP. */
export async function reserveRegistrationIp(env,request,newUserId){
  await ensureIpPolicy(env);
  const ip=getIp(request);if(!ip)throw error(503,'Nie można bezpiecznie ustalić adresu IP. Spróbuj ponownie później.');
  const db=env.COMMUNITY_DB,key=await keyFor(ip),existing=await peers(db,ip);
  let claim=await db.prepare('SELECT user_id FROM aio_ip_policy_claims WHERE ip_key=?').bind(key).first();
  if(existing.length){await claimExisting(env,ip,key,existing);claim=await db.prepare('SELECT user_id FROM aio_ip_policy_claims WHERE ip_key=?').bind(key).first();}
  if(claim){
    // One-time owner permit; grants are count-limited and consumed atomically.
    const used=await db.prepare('UPDATE aio_ip_policy_signup_permits SET remaining=remaining-1 WHERE ip_key=? AND remaining>0').bind(key).run();
    if(!used.meta?.changes)throw error(409,NOTICE);
    return {key,existing:true,permit:true};
  }
  const lock=await db.prepare(`INSERT OR IGNORE INTO aio_ip_policy_claims(ip_key,user_id,created_at,source)
    VALUES(?,?,?,'register')`).bind(key,newUserId,now()).run();
  if(!lock.meta?.changes)throw error(409,NOTICE);
  return {key,existing:false,permit:false};
}
export async function rollbackRegistrationIp(env,lease,newUserId){
  if(!lease)return;
  if(lease.permit){await env.COMMUNITY_DB.prepare('UPDATE aio_ip_policy_signup_permits SET remaining=remaining+1 WHERE ip_key=?').bind(lease.key).run();}
  else if(!lease.existing)await env.COMMUNITY_DB.prepare("DELETE FROM aio_ip_policy_claims WHERE ip_key=? AND user_id=? AND source='register'").bind(lease.key,newUserId).run();
}
export function permitRegistrationStatement(env,lease,newUserId){
  if(!lease?.permit)return null;
  return env.COMMUNITY_DB.prepare(`INSERT INTO aio_ip_policy_exceptions(ip_key,user_id,reason,approved_by,created_at)
    SELECT ?,?,'Zgoda na dodatkowe konto przy rejestracji',approved_by,?
    FROM aio_ip_policy_signup_permits WHERE ip_key=?`).bind(lease.key,newUserId,now(),lease.key);
}
export async function checkAfterValidLogin(env,request,userId,role){
  await ensureIpPolicy(env);
  if(userId===await getOwnerId(env))return null;
  const hold=await activeIpHold(env,userId);if(hold)return hold;
  const ip=getIp(request);if(!ip)return null;
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
  return activeIpHold(env,userId);
}
export async function imposeIpHold(env,userId,key,reason){
  await ensureIpPolicy(env);
  if(userId===await getOwnerId(env))return false;
  const db=env.COMMUNITY_DB;
  if(await permitted(db,key,userId))return false;
  const result=await db.prepare(`INSERT INTO aio_ip_policy_holds(user_id,ip_key,status,reason,created_at)
    VALUES(?,?,'active',?,?)
    ON CONFLICT(user_id) DO NOTHING`).bind(userId,key,reason,now()).run();
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
    const first=users.find(u=>u.user_id===owner)||users[0];
    const ids=[];
    for(const u of users){const hold=await activeIpHold(env,u.user_id);const allow=await permitted(db,key,u.user_id);
      ids.push({id:u.user_id,name:u.display_name,owner:u.user_id===owner,first_seen:u.first_seen_at,last_seen:u.last_seen_at,blocked:!!hold,approved:allow,primary:u.user_id===first.user_id});
    }
    groups.push({ip_key:key,ip:item.ip,ip_masked:masked(item.ip),last_seen:item.latest,accounts:ids});
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
  for(const x of users){if(x.user_id===selected.user_id||await permitted(db,key,x.user_id))continue;
    if(await imposeIpHold(env,x.user_id,key,'Z tego IP korzysta więcej niż jedno konto AIO; blokada do wyjaśnienia z administracją.'))held++;
  }
  return {held,accounts:users.length};
}
export async function grantException(env,key,userId,adminId,reason){
  await ensureIpPolicy(env);const db=env.COMMUNITY_DB;
  await db.batch([
    db.prepare(`INSERT INTO aio_ip_policy_exceptions(ip_key,user_id,reason,approved_by,created_at)
      VALUES(?,?,?,?,?) ON CONFLICT(ip_key,user_id) DO UPDATE SET reason=excluded.reason,approved_by=excluded.approved_by,created_at=excluded.created_at`).bind(key,userId,reason,adminId,now()),
    db.prepare("UPDATE aio_ip_policy_holds SET status='released',released_at=?,released_by=? WHERE user_id=? AND ip_key=? AND status='active'").bind(now(),adminId,userId,key)
  ]);
}
export async function allowNextSignup(env,key,adminId,reason,ip){
  await ensureIpPolicy(env);
  let exists=await env.COMMUNITY_DB.prepare('SELECT user_id FROM aio_ip_policy_claims WHERE ip_key=?').bind(key).first();
  if(!exists && ip && await keyFor(ip)===key){
    const users=await peers(env.COMMUNITY_DB,ip);
    if(users.length)await claimExisting(env,ip,key,users);
    exists=await env.COMMUNITY_DB.prepare('SELECT user_id FROM aio_ip_policy_claims WHERE ip_key=?').bind(key).first();
  }
  if(!exists)throw error(404,'Nieznana sieć. Najpierw wykonaj skan.');
  await env.COMMUNITY_DB.prepare(`INSERT INTO aio_ip_policy_signup_permits(ip_key,remaining,created_at,approved_by,reason)
    VALUES(?,1,?,?,?) ON CONFLICT(ip_key) DO UPDATE SET remaining=remaining+1,created_at=excluded.created_at,approved_by=excluded.approved_by,reason=excluded.reason`).bind(key,now(),adminId,reason).run();
}
