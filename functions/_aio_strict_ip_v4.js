/* AIO STRICT V4.2 — global holds for ALL existing collision participants.
 * AIO_STRICT_V42_GLOBAL_COLLISION
 * One ordinary account per exact public IPv4 or IPv6 /64.
 * Works on all devices with the SAME user_id. Does not ban the entire public IP.
 * Secondary account restriction is GLOBAL after a verified historical collision.
 * Retrospective backfill is performed explicitly by the owner.
 */
import {ipv6Prefix} from './_aio_network_prefix_v1.js';
import {sha256,getOwnerId} from './_community.js';
import {REGISTRATION_RESTRICTED} from './_aio_public_notices_v1.js';

let ready=null;
const now=()=>new Date().toISOString();
const bad=(status,message)=>Object.assign(new Error(message),{status});
export const STRICT_NOTICE='Wykryto kilka kont korzystających z tego samego publicznego adresu IPv4 lub tej samej sieci IPv6 /64. Zgodnie z zasadą AIO TunerHub (1 IP = 1 konto) dostęp do kont z tej grupy został wstrzymany do wyjaśnienia. Skontaktuj się z administratorem: /appeal.html lub aio-iptv@wp.pl. Nie przesyłaj hasła.';
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
  // A confirmed collision holds BOTH (and all additional) existing accounts.
  // No automatic hold on a mere rejected signup: prevents registration-based DoS.
  if(!userId)return false;
  const db=env.COMMUNITY_DB;
  const r=await db.prepare(`INSERT INTO aio_strict_ip_holds_v4
    (user_id,primary_user_id,network_key,reason,created_at,status) VALUES(?,?,?,?,?,'active')
    ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason,
    status='active',released_at=NULL,released_by=NULL WHERE status<>'active'`)
    .bind(userId,primaryId,key,STRICT_NOTICE,now()).run();
  // Mirror a strict hold into the standard profile ban fields so the owner
  // account cards also display the suspension. Do NOT overwrite an active
  // unrelated ban; it must survive release of the V4.2 IP collision.
  const stamp=now();
  const updated=await db.prepare(`UPDATE community_profiles
    SET banned_until='9999-12-31T23:59:59.000Z',
        ban_reason=?,banned_at=?,updated_at=?
    WHERE id=? AND role='user' AND
      (banned_until IS NULL OR banned_until<=?)`)
    .bind('AIO_IP_V42: '+STRICT_NOTICE,stamp,stamp,userId,stamp).run();
  if(Number(r.meta?.changes||0)>0||Number(updated.meta?.changes||0)>0){
    // Revoke old sessions; a valid password can issue only an appeal session.
    await db.prepare('DELETE FROM community_sessions WHERE user_id=?').bind(userId).run();
  }
  return Number(r.meta?.changes||0)>0;
}
function holdView(row){return {ip_key:row.network_key,reason:STRICT_NOTICE,
  created_at:row.created_at,strict_v4:true,global:true};}
export async function strictGlobalHold(env,userId){
  if(!userId)return null;
  await ensureStrictV4(env);
  const row=await env.COMMUNITY_DB.prepare(`SELECT network_key,created_at FROM aio_strict_ip_holds_v4
    WHERE user_id=? AND status='active' LIMIT 1`).bind(userId).first();
  return row?holdView(row):null;
}
export async function strictSessionGate(env,userId,ip){
  if(!userId)return null;
  await ensureStrictV4(env);
  const owner=await getOwnerId(env);
  if(userId===owner)return null;
  const db=env.COMMUNITY_DB;
  const profile=await db.prepare('SELECT id,role FROM community_profiles WHERE id=? LIMIT 1').bind(userId).first();
  if(!ordinary(profile,owner))return null;
  const already=await strictGlobalHold(env,userId);
  if(already)return already;
  const net=await fingerprint(ip);if(!net)return null;
  let claim=await validOwnerClaim(env,net.key);
  if(!claim){
    const known=await knownUsers(env,net,owner);
    if(known.length>=2){
      const anchor=(await choosePrimary(env,net,known))||known[0].id;
      await putClaim(db,net.key,anchor,'history_or_session');
      for(const person of known)await markHold(env,person.id,anchor,net.key);
      if(!known.some(x=>x.id===userId))await markHold(env,userId,anchor,net.key);
      return await strictGlobalHold(env,userId);
    }
    const first=(await choosePrimary(env,net,known))||userId;
    claim=await putClaim(db,net.key,first,'history_or_session');
  }
  if(claim?.user_id!==userId){
    // The claim can be an in-progress registration without any persisted user.
    // Never lock out an existing account because of an unauthenticated attempt.
    const claimant=await db.prepare(`SELECT id,role FROM community_profiles
      WHERE id=? LIMIT 1`).bind(claim.user_id).first();
    if(!ordinary(claimant,owner))return null;
    await markHold(env,claimant.id,claimant.id,net.key);
    await markHold(env,userId,claimant.id,net.key);
    return await strictGlobalHold(env,userId);
  }
  return null;
}
export async function reserveStrictV4(env,ip,userId){
  await ensureStrictV4(env);
  const net=await fingerprint(ip);if(!net)throw bad(503,'Nie można poprawnie ustalić sieci użytkownika.');
  const db=env.COMMUNITY_DB,owner=await getOwnerId(env);
  const known=await knownUsers(env,net,owner);
  if(known.some(x=>x.id!==userId))throw bad(409,REGISTRATION_RESTRICTED);
  const exists=await validOwnerClaim(env,net.key);
  if(exists&&exists.user_id!==userId)throw bad(409,REGISTRATION_RESTRICTED);
  if(exists)return {key:net.key,userId,created:false};
  const inserted=await db.prepare(`INSERT OR IGNORE INTO aio_strict_ip_claims_v4
    (network_key,user_id,created_at,source) VALUES(?,?,?,'register')`).bind(net.key,userId,now()).run();
  if(Number(inserted.meta?.changes||0)!==1)throw bad(409,REGISTRATION_RESTRICTED);
  return {key:net.key,userId,created:true};
}
export async function rollbackStrictV4(env,lease,userId){
  if(!lease?.created||lease.userId!==userId)return;
  await env.COMMUNITY_DB.prepare("DELETE FROM aio_strict_ip_claims_v4 WHERE network_key=? AND user_id=? AND source='register'")
    .bind(lease.key,userId).run();
}
// Owner-only historical scan: all matching existing accounts are restricted, no IP-wide ban.
// A bounded complete scan fails closed instead of silently omitting older rows.
export async function applyHistoricalStrictV4(env,{dryRun=false}={}){
  await ensureStrictV4(env);
  const db=env.COMMUNITY_DB,owner=await getOwnerId(env);
  // Full scan, not an arbitrary sample. Refuse incomplete data.
  const LIMIT=12000;
  const r=await db.prepare(`SELECT ui.ip_address,p.id,p.role,p.created_at FROM community_user_ips ui
    JOIN community_profiles p ON p.id=ui.user_id WHERE p.role='user'
    ORDER BY ui.ip_address,p.created_at,p.id LIMIT ?`).bind(LIMIT+1).all();
  const records=r.results||[];
  if(records.length>LIMIT)throw bad(409,'Historia przekracza 12000 wierszy. Nie wykonano częściowego skanu; potrzebna aktualizacja stronicowania.');
  const nets=new Map();
  for(const row of records){
    if(row.id===owner)continue;
    const net=networkIdentity(row.ip_address);if(!net)continue;
    const key=net.kind+':'+net.canonical;
    if(!nets.has(key))nets.set(key,new Map());
    nets.get(key).set(row.id,row);
  }
  let collisions=0;
  const affected=new Set(),networkGroups=[];
  for(const [key,people] of nets){
    if(people.size<2)continue;
    collisions++;
    const all=[...people.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
    all.forEach(p=>affected.add(p.id));
    networkGroups.push({network:key,accounts:all.map(p=>p.id),first:all[0].id});
  }
  if(dryRun)return {dry_run:true,total_rows:records.length,collision_networks:collisions,
    affected_accounts:affected.size,network_groups:networkGroups.length};
  let inserted=0;
  // Fail-safe: stop and report errors instead of pretending the run was complete.
  // Idempotent per user: historical re-scans do not change existing hold IDs.
  for(const group of networkGroups){
    const [kind,...parts]=group.network.split(':');
    const canonical=parts.join(':');
    const key=await sha256('aio-strict-ip-v4:'+kind+':'+canonical);
    await db.prepare(`INSERT OR IGNORE INTO aio_strict_ip_claims_v4
      (network_key,user_id,created_at,source) VALUES(?,?,?,'historical_scan_v42')`)
      .bind(key,group.first,now()).run();
    for(const id of group.accounts){
      if(await markHold(env,id,group.first,key))inserted++;
    }
  }
  // Old secondary-only V4.1 holds must get the same accurate wording.
  await db.prepare(`UPDATE aio_strict_ip_holds_v4 SET reason=?
    WHERE status='active' AND reason<>?`).bind(STRICT_NOTICE,STRICT_NOTICE).run();
  return {dry_run:false,total_rows:records.length,collision_networks:collisions,
    affected_accounts:affected.size,new_holds:inserted,
    total_active:(await strictStatus(env)).blocked_accounts};
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
  const active=await strictGlobalHold(env,userId);
  if(!active)throw bad(409,'Konto nie ma aktywnej blokady V4.2.');
  const history=await db.prepare('SELECT ip_address FROM community_user_ips WHERE user_id=?').bind(userId).all();
  const nets=new Map();
  for(const row of history.results||[]){const net=await fingerprint(row.ip_address);if(net)nets.set(net.key,net);}
  if(!nets.size)throw bad(409,'Brak historii sieci. Rozpatrz sprawę przed zwolnieniem.');
  // Releasing while another account still has the same IP violates the policy.
  for(const net of nets.values()){
    const people=await knownUsers(env,net,owner);
    if(people.some(x=>x.id!==userId))throw bad(409,'Kolizja nadal istnieje. Najpierw usuń dodatkowe konto lub wyjaśnij sytuację.');
  }
  const stamp=now();
  await db.prepare(`UPDATE aio_strict_ip_holds_v4 SET status='released',released_at=?,released_by='AIO_V42_OWNER'
    WHERE user_id=? AND status='active'`).bind(stamp,userId).run();
  // Remove only the profile ban created by V4.2; preserve all unrelated bans.
  await db.prepare(`UPDATE community_profiles SET banned_until=NULL,ban_reason=NULL,
    banned_at=NULL,banned_by=NULL,updated_at=?
    WHERE id=? AND ban_reason LIKE 'AIO_IP_V42:%'`)
    .bind(stamp,userId).run();
  // Clear old V7 hold for the same user's known IPv4 networks after resolution.
  for(const net of nets.values()){
    const ownerClaim=await validOwnerClaim(env,net.key);
    if(!ownerClaim)await putClaim(db,net.key,userId,'resolved_owner_v42');
    if(net.kind==='ipv4'){
      const oldKey=await sha256('aio-unique-ip-v7:'+net.canonical);
      await db.prepare(`DELETE FROM aio_ip_policy_claims WHERE ip_key=? AND
        NOT EXISTS (SELECT 1 FROM community_profiles WHERE id=aio_ip_policy_claims.user_id)`).bind(oldKey).run();
      await db.prepare(`UPDATE aio_ip_policy_holds_v8 SET status='released',released_at=?,released_by='AIO_V42_OWNER'
        WHERE user_id=? AND ip_key=? AND status='active'`).bind(stamp,userId,oldKey).run();
    }
  }
  return {released:true};
}
