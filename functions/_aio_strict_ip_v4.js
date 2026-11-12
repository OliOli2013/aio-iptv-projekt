/* AIO STRICT V4 — one ordinary account per exact public IPv4 or IPv6 /64.
 * Works on all devices with the SAME user_id. Does not ban the entire public IP.
 * Secondary account restriction is GLOBAL after a verified historical collision.
 * Retrospective backfill is performed explicitly by the owner.
 */
import {ipv6Prefix} from './_aio_network_prefix_v1.js';
import {sha256,getOwnerId} from './_community.js';

let ready=null;
const now=()=>new Date().toISOString();
const bad=(status,message)=>Object.assign(new Error(message),{status});
export const STRICT_NOTICE='Wykryto więcej niż jedno konto korzystające z tego samego publicznego adresu IP lub sieci IPv6 /64. Obowiązuje zasada: jedno IP — jedno konto. Dostęp do dodatkowego konta wstrzymano do wyjaśnienia. Skontaktuj się z administratorem: /contact.html?topic=account-security.';
const isV4=s=>typeof s==='string' && s.length<=15 && s.split('.').length===4 && s.split('.').every(v=>/^(0|[1-9][0-9]{0,2})$/.test(v)&&Number(v)<=255);
export function networkIdentity(ip){
  const ipv4=String(ip||'').trim();if(isV4(ipv4))return {kind:'ipv4',canonical:ipv4};
  const p64=ipv6Prefix(ipv4,64);return p64?{kind:'ipv6_64',canonical:p64}:null;
}
async function fingerprint(ip){const n=networkIdentity(ip);return n?{...n,key:await sha256('aio-strict-ip-v4:'+n.kind+':'+n.canonical)}:null;}
export async function ensureStrictV4(env){
  if(!env.COMMUNITY_DB)throw bad(503,'Baza D1 nie jest dostępna.');
  if(!ready)ready=env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_strict_ip_claims_v4 (
      network_key TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, source TEXT NOT NULL)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_strict_claim_user_v4 ON aio_strict_ip_claims_v4(user_id)'),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_strict_ip_holds_v4 (
      user_id TEXT PRIMARY KEY, primary_user_id TEXT NOT NULL, network_key TEXT NOT NULL,
      reason TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
      released_at TEXT, released_by TEXT,
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_strict_holds_v4 ON aio_strict_ip_holds_v4(status,created_at DESC)'),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_strict_history_ip_v4 ON community_user_ips(ip_address,user_id)')
  ]).catch(e=>{ready=null;throw e;});
  await ready;
}
const ordinary=(row,owner)=>row&&row.role==='user'&&row.id!==owner;
// Historical look-up for the CURRENT network (no trust in client-provided account IDs).
async function knownUsers(env,identity,owner){
  const db=env.COMMUNITY_DB;let rows=[];
  if(identity.kind==='ipv4'){
    const r=await db.prepare(`SELECT DISTINCT p.id,p.created_at,p.role FROM community_user_ips ui
      JOIN community_profiles p ON p.id=ui.user_id WHERE ui.ip_address=? AND p.role='user'
      ORDER BY p.created_at ASC,p.id ASC LIMIT 1000`).bind(identity.canonical).all();
    rows=r.results||[];
  }else{
    const prefix=identity.canonical.split(':').slice(0,3).join(':')+':';
    const r=await db.prepare(`SELECT ui.ip_address,p.id,p.created_at,p.role FROM community_user_ips ui
      JOIN community_profiles p ON p.id=ui.user_id WHERE ui.ip_address LIKE ? AND p.role='user'
      ORDER BY p.created_at ASC,p.id ASC LIMIT 3000`).bind(prefix+'%').all();
    const seen=new Set();
    for(const x of r.results||[]){if(ipv6Prefix(x.ip_address,64)===identity.canonical&&!seen.has(x.id)){seen.add(x.id);rows.push(x);}}
  }
  return rows.filter(x=>ordinary(x,owner)).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
}
async function validOwnerClaim(env,key){
  const db=env.COMMUNITY_DB;
  const claim=await db.prepare(`SELECT c.user_id,c.source,c.created_at,p.role FROM aio_strict_ip_claims_v4 c
    LEFT JOIN community_profiles p ON p.id=c.user_id WHERE c.network_key=? LIMIT 1`).bind(key).first();
  if(!claim)return null;
  if(claim.role==='user'&&claim.user_id!==await getOwnerId(env))return claim;
  // During signup, the claim is reserved BEFORE the profile is inserted.
  // A concurrent request must NEVER erase that reservation before it commits.
  if(!claim.role && claim.source==='register' && Date.now()-Date.parse(claim.created_at||'')<600000)return claim;
  // Only expired/orphaned reservations or owner/non-user claims can be removed.
  await db.prepare('DELETE FROM aio_strict_ip_claims_v4 WHERE network_key=? AND user_id=?')
    .bind(key,claim.user_id).run();
  return null;
}
async function choosePrimary(env,net,people){
  const first=people[0]?.id||null;
  if(net.kind!=='ipv4'||!first)return first;
  // Keep consistency with the V7 primary IP claim so that the original account
  // is not accidentally rejected by V7 after V4 backfills a different primary.
  const oldKey=await sha256('aio-unique-ip-v7:'+net.canonical);
  const v7=await env.COMMUNITY_DB.prepare('SELECT user_id FROM aio_ip_policy_claims WHERE ip_key=? LIMIT 1').bind(oldKey).first();
  return people.some(x=>x.id===v7?.user_id)?v7.user_id:first;
}
async function putClaim(db,networkKey,userId,source){
  await db.prepare(`INSERT OR IGNORE INTO aio_strict_ip_claims_v4
    (network_key,user_id,created_at,source) VALUES(?,?,?,?)`).bind(networkKey,userId,now(),source).run();
  return db.prepare('SELECT user_id FROM aio_strict_ip_claims_v4 WHERE network_key=?').bind(networkKey).first();
}
async function markHold(env,userId,primaryId,key){
  if(userId===primaryId)return false;
  const r=await env.COMMUNITY_DB.prepare(`INSERT INTO aio_strict_ip_holds_v4
    (user_id,primary_user_id,network_key,reason,created_at,status) VALUES(?,?,?,?,?,'active')
    ON CONFLICT(user_id) DO UPDATE SET primary_user_id=excluded.primary_user_id,
    network_key=excluded.network_key,reason=excluded.reason,created_at=excluded.created_at,
    status='active',released_at=NULL,released_by=NULL WHERE status<>'active'`)
    .bind(userId,primaryId,key,STRICT_NOTICE,now()).run();
  // Do not wipe all sessions automatically: middleware blocks their authorization
  // immediately, while the user retains a path to contact the owner.
  return Number(r.meta?.changes||0)>0;
}
function holdView(row){return {ip_key:row.network_key,reason:row.reason||STRICT_NOTICE,created_at:row.created_at,strict_v4:true};}
export async function strictSessionGate(env,userId,ip){
  if(!userId)return null;
  await ensureStrictV4(env);
  const db=env.COMMUNITY_DB,owner=await getOwnerId(env);
  if(userId===owner)return null;
  const profile=await db.prepare('SELECT id,role FROM community_profiles WHERE id=? LIMIT 1').bind(userId).first();
  if(!ordinary(profile,owner))return null;
  const already=await db.prepare("SELECT network_key,reason,created_at FROM aio_strict_ip_holds_v4 WHERE user_id=? AND status='active' LIMIT 1").bind(userId).first();
  if(already)return holdView(already);
  const net=await fingerprint(ip);if(!net)return null;
  let claim=await validOwnerClaim(env,net.key);
  if(!claim){
    const known=await knownUsers(env,net,owner);
    const first=(await choosePrimary(env,net,known))||userId;
    claim=await putClaim(db,net.key,first,'history_or_session');
  }
  if(claim?.user_id!==userId){
    await markHold(env,userId,claim.user_id,net.key);
    return {ip_key:net.key,reason:STRICT_NOTICE,created_at:now(),strict_v4:true};
  }
  return null;
}
export async function reserveStrictV4(env,ip,userId){
  await ensureStrictV4(env);
  const net=await fingerprint(ip);if(!net)throw bad(503,'Nie można poprawnie ustalić sieci użytkownika.');
  const db=env.COMMUNITY_DB,owner=await getOwnerId(env);
  const known=await knownUsers(env,net,owner);
  if(known.some(x=>x.id!==userId))throw bad(409,STRICT_NOTICE);
  const exists=await validOwnerClaim(env,net.key);
  if(exists&&exists.user_id!==userId)throw bad(409,STRICT_NOTICE);
  if(exists)return {key:net.key,userId,created:false};
  const inserted=await db.prepare(`INSERT OR IGNORE INTO aio_strict_ip_claims_v4
    (network_key,user_id,created_at,source) VALUES(?,?,?,'register')`).bind(net.key,userId,now()).run();
  if(Number(inserted.meta?.changes||0)!==1)throw bad(409,STRICT_NOTICE);
  return {key:net.key,userId,created:true};
}
export async function rollbackStrictV4(env,lease,userId){
  if(!lease?.created||lease.userId!==userId)return;
  await env.COMMUNITY_DB.prepare("DELETE FROM aio_strict_ip_claims_v4 WHERE network_key=? AND user_id=? AND source='register'")
    .bind(lease.key,userId).run();
}
// Owner-only historical scan: all matching existing accounts are restricted, no IP-wide ban.
// A bounded complete scan fails closed instead of silently omitting older rows.
export async function applyHistoricalStrictV4(env){
  await ensureStrictV4(env);
  const db=env.COMMUNITY_DB,owner=await getOwnerId(env);
  const LIMIT=12000;
  const r=await db.prepare(`SELECT ui.ip_address,p.id,p.role,p.created_at FROM community_user_ips ui
    JOIN community_profiles p ON p.id=ui.user_id WHERE p.role='user'
    ORDER BY ui.ip_address,p.created_at,p.id LIMIT ?`).bind(LIMIT+1).all();
  const records=r.results||[];
  if(records.length>LIMIT)throw bad(409,'Historia przekracza limit 12000 wierszy. Nie zastosowano niepełnego audytu; potrzebna wersja stronicowana.');
  const nets=new Map();
  for(const row of records){if(row.id===owner)continue;
    const net=networkIdentity(row.ip_address);if(!net)continue;
    const k=net.kind+':'+net.canonical;
    let m=nets.get(k);if(!m){m=new Map();nets.set(k,m);}m.set(row.id,row);
  }
  let networks=0,additional=0,created=0;
  for(const [key,ids] of nets){if(ids.size<2)continue;
    const all=[...ids.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
    const n=key.startsWith('ipv4:')?{kind:'ipv4',canonical:key.slice(5)}:{kind:'ipv6_64',canonical:key.slice(8)};
    const networkKey=await sha256('aio-strict-ip-v4:'+n.kind+':'+n.canonical);
    let claim=await validOwnerClaim(env,networkKey);
    const candidate=(await choosePrimary(env,n,all))||all[0].id;
    if(!claim){claim=await putClaim(db,networkKey,candidate,'historical_scan');}
    if(!all.some(x=>x.id===claim.user_id)){ // stale owner claim is not an exception
      await db.prepare('UPDATE aio_strict_ip_claims_v4 SET user_id=?,source=? WHERE network_key=?')
        .bind(candidate,'historical_scan',networkKey).run();claim={user_id:candidate};
    }
    networks++;
    for(const x of all){if(x.id===claim.user_id)continue;additional++;if(await markHold(env,x.id,claim.user_id,networkKey))created++;}
  }
  return {networks_scanned:nets.size,collision_networks:networks,additional_accounts:additional,new_holds:created,total_rows:records.length};
}
export async function strictStatus(env){
  await ensureStrictV4(env);
  const db=env.COMMUNITY_DB;
  const summary=await db.prepare("SELECT COUNT(*) total FROM aio_strict_ip_holds_v4 WHERE status='active'").first();
  const holds=await db.prepare(`SELECT h.user_id,p.display_name,h.primary_user_id,primaryp.display_name AS primary_name,
    h.reason,h.created_at FROM aio_strict_ip_holds_v4 h JOIN community_profiles p ON p.id=h.user_id
    LEFT JOIN community_profiles primaryp ON primaryp.id=h.primary_user_id
    WHERE h.status='active' ORDER BY h.created_at DESC LIMIT 150`).all();
  return {blocked_accounts:Number(summary?.total||0),holds:holds.results||[]};
}

/** Owner-only recovery after the conflicting account was removed.
 * Does not allow an exception while multiple ordinary accounts still own a network.
 */
export async function releaseStrictV4(env,userId){
  await ensureStrictV4(env);
  const db=env.COMMUNITY_DB,owner=await getOwnerId(env);
  const profile=await db.prepare('SELECT id,role FROM community_profiles WHERE id=? LIMIT 1').bind(userId).first();
  if(!ordinary(profile,owner))throw bad(403,'Nie można zwolnić właściciela lub nieznanego konta.');
  const hold=await db.prepare("SELECT network_key FROM aio_strict_ip_holds_v4 WHERE user_id=? AND status='active' LIMIT 1")
    .bind(userId).first();
  if(!hold)throw bad(409,'Konto nie ma aktywnej blokady V4.');
  const rows=await db.prepare('SELECT ip_address FROM community_user_ips WHERE user_id=?').bind(userId).all();
  let matching=false;
  for(const row of rows.results||[]){
    const net=await fingerprint(row.ip_address);
    if(!net||net.key!==hold.network_key)continue;
    matching=true;
    const peers=await knownUsers(env,net,owner);
    if(peers.some(x=>x.id!==userId))throw bad(409,'Wspólny IP nadal jest przypisany do więcej niż jednego konta. Najpierw usuń lub rozwiąż kolizję kont.');
    // Repair orphaned V7 IPv4 claims and release the old network-specific hold.
    if(net.kind==='ipv4'){
      const oldKey=await sha256('aio-unique-ip-v7:'+net.canonical);
      await db.prepare(`DELETE FROM aio_ip_policy_claims WHERE ip_key=?
        AND NOT EXISTS (SELECT 1 FROM community_profiles WHERE id=aio_ip_policy_claims.user_id)`)
        .bind(oldKey).run();
      await db.prepare("UPDATE aio_ip_policy_holds_v8 SET status='released',released_at=?,released_by='AIO_V4_OWNER' WHERE user_id=? AND ip_key=? AND status='active'")
        .bind(now(),userId,oldKey).run();
    }
  }
  if(!matching)throw bad(409,'Brak historii sieci związanej z tą blokadą. Wymagana ręczna kontrola danych D1.');
  await db.prepare("UPDATE aio_strict_ip_holds_v4 SET status='released',released_at=?,released_by='AIO_V4_OWNER' WHERE user_id=? AND status='active'")
    .bind(now(),userId).run();
  return {released:true};
}
