/* AIO Security V6: account-bound bot burst containment; never auto-block by shared IP. */
import {isOwnerId,moderationLog} from './_community.js';
import {logSecurity,ensureSecurityJournal} from './_aio_security_journal.js';
const MAX_REQUESTS=80, MAX_DENIALS=18;
const BLOCK_HOURS=24;
let ready;
const iso=()=>new Date().toISOString();
const safe=(v,n=300)=>String(v??'').replace(/[\x00-\x1f<>]/g,' ').trim().slice(0,n);
const v6Reason=x=>'[AIO V6] '+safe(x,240);
export const POLICY={max_requests:MAX_REQUESTS,max_denials:MAX_DENIALS,window_seconds:60,auto_block_hours:BLOCK_HOURS};
export async function ensureV6(env){
  if(!env.COMMUNITY_DB)throw new Error('Brak bazy COMMUNITY_DB');
  if(!ready)ready=env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_v6_blocks (
      user_id TEXT PRIMARY KEY,reason TEXT NOT NULL,evidence TEXT NOT NULL DEFAULT '',
      origin TEXT NOT NULL CHECK(origin IN ('auto','owner')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','released','expired')),
      created_at TEXT NOT NULL,expires_at TEXT NOT NULL,
      reviewed_at TEXT,reviewed_by TEXT,released_at TEXT,released_by TEXT,
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_v6_blocks_status ON aio_v6_blocks(status,created_at DESC)'),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_v6_rate (
      user_id TEXT NOT NULL,minute_key TEXT NOT NULL,
      requests INTEGER NOT NULL DEFAULT 0,denials INTEGER NOT NULL DEFAULT 0,
      first_at TEXT NOT NULL,last_at TEXT NOT NULL,
      PRIMARY KEY(user_id,minute_key))`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_v6_rate_time ON aio_v6_rate(last_at)')
  ]).catch(e=>{ready=null;throw e;});
  await ready;
}
export async function cleanupV6(env){
  await ensureV6(env);await ensureSecurityJournal(env);const now=iso();
  await env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare("UPDATE aio_v6_blocks SET status='expired' WHERE status='active' AND expires_at<=?").bind(now),
    env.COMMUNITY_DB.prepare('DELETE FROM aio_v6_rate WHERE last_at<?').bind(new Date(Date.now()-48*3600000).toISOString()),
    env.COMMUNITY_DB.prepare("UPDATE aio_security_shared_holds SET status='released',released_at=? WHERE status='active' AND expires_at<=?").bind(now,now),
    env.COMMUNITY_DB.prepare("UPDATE aio_security_paid_holds SET status='released',released_at=? WHERE status='active' AND expires_at<=?").bind(now,now)
  ]);
}
async function isSiteOwner(env,userId){
  const profile=await env.COMMUNITY_DB.prepare('SELECT role FROM community_profiles WHERE id=?').bind(userId).first();
  return !profile || await isOwnerId(env,userId,profile.role);
}
async function impose(env,request,userId,reason,evidence,origin,hours){
  await ensureV6(env);
  if(!userId||await isSiteOwner(env,userId))return false;
  const now=iso(),until=hours===null?'9999-12-31T23:59:59.000Z':new Date(Date.now()+hours*3600000).toISOString();
  const db=env.COMMUNITY_DB;
  const flagged=v6Reason(reason);
  // D1 batch is transactional: do not leave a banned account outside the block registry.
  const [changed,stored]=await db.batch([
    db.prepare(`UPDATE community_profiles SET banned_until=?,ban_reason=?,updated_at=?
      WHERE id=? AND role<>'admin' AND (banned_until IS NULL OR banned_until<=?)`)
      .bind(until,flagged,now,userId,now),
    db.prepare(`INSERT INTO aio_v6_blocks
      (user_id,reason,evidence,origin,status,created_at,expires_at,reviewed_at,reviewed_by,released_at,released_by)
      SELECT ?,?,?,?,'active',?,?,NULL,NULL,NULL,NULL
      WHERE EXISTS(SELECT 1 FROM community_profiles WHERE id=? AND ban_reason=? AND banned_until=?)
      ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason,evidence=excluded.evidence,
        origin=excluded.origin,status='active',created_at=excluded.created_at,
        expires_at=excluded.expires_at,reviewed_at=NULL,reviewed_by=NULL,released_at=NULL`)
      .bind(userId,safe(reason),safe(evidence,480),origin,now,until,userId,flagged,until)
  ]);
  if(Number(changed.meta?.changes||0)!==1||Number(stored.meta?.changes||0)!==1)return false;
  await logSecurity(env,request,origin==='auto'?'v6_auto_block':'v6_owner_block',userId,safe(evidence,120));
  return true;
}
export async function monitorDownload(env,request,userId,{denied=false}={}){
  if(!userId || request.method==='HEAD')return {blocked:false};
  // Multi-part Range downloads are normal; count them only when denied.
  if(!denied && request.headers?.has('Range'))return {blocked:false};
  await ensureV6(env);
  if(await isSiteOwner(env,userId))return {blocked:false};
  const now=iso(),minute_key=now.slice(0,16);
  const req=denied?0:1,fail=denied?1:0;
  const db=env.COMMUNITY_DB;
  // Atomic counters: races cannot bypass a threshold by overwriting an old value.
  await db.prepare(`INSERT INTO aio_v6_rate(user_id,minute_key,requests,denials,first_at,last_at)
    VALUES(?,?,?,?,?,?)
    ON CONFLICT(user_id,minute_key) DO UPDATE SET
    requests=aio_v6_rate.requests+excluded.requests,
    denials=aio_v6_rate.denials+excluded.denials,last_at=excluded.last_at`)
    .bind(userId,minute_key,req,fail,now,now).run();
  const r=await db.prepare('SELECT requests,denials FROM aio_v6_rate WHERE user_id=? AND minute_key=?').bind(userId,minute_key).first();
  const n=Number(r?.requests||0),d=Number(r?.denials||0);
  if(n<MAX_REQUESTS && d<MAX_DENIALS)return {blocked:false,requests:n,denials:d};
  const reason=n>=MAX_REQUESTS?'Zautomatyzowane, bardzo częste pobieranie plików':'Wielokrotne żądania plików mimo odmowy dostępu';
  const blocked=await impose(env,request,userId,reason,`Okno 60 s; żądania: ${n}, odmowy: ${d}`, 'auto',BLOCK_HOURS);
  return {blocked,requests:n,denials:d,reason};
}
export async function ownerBlock(env,request,userId,reason,hours){
  if(![24,168,720,null].includes(hours))throw Object.assign(new Error('Nieprawidłowy okres blokady.'),{status:400});
  return impose(env,request,userId,reason,'Decyzja właściciela', 'owner',hours);
}
export async function ownerRelease(env,userId,ownerId){
  await ensureV6(env);
  const db=env.COMMUNITY_DB,now=iso();
  const q=await db.prepare("SELECT user_id FROM aio_v6_blocks WHERE user_id=? AND status='active'").bind(userId).first();
  if(!q)return false;
  const u=await db.prepare("UPDATE community_profiles SET banned_until=NULL,ban_reason=NULL,updated_at=? WHERE id=? AND ban_reason LIKE '[AIO V6] %'").bind(now,userId).run();
  if(!u.meta?.changes)throw Object.assign(new Error('Blokada konta została zmieniona poza V6 — sprawdź V5.'),{status:409});
  await db.prepare("UPDATE aio_v6_blocks SET status='released',released_at=?,released_by=? WHERE user_id=? AND status='active'").bind(now,ownerId,userId).run();
  return true;
}
