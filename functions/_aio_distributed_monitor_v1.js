/* AIO Distributed Anonymous Wave Monitor V1.
 * Read-only behavioural alert on aggregate /pliki/ anonymous denials.
 * Does not block requests or make identity claims. Fingerprints are salted hashes.
 */
import {clientIp,sha256} from './_community.js';
import {logSecurity} from './_aio_security_journal.js';

let ready=null;
const POLICY=Object.freeze({windowBucketMs:5000,windowBuckets:3,minRequests:20,minNetworks:3,alertCooldownMs:15*60*1000});
export async function ensureDistributedMonitor(env){
  if(!env.COMMUNITY_DB)throw new Error('Brak bindingu COMMUNITY_DB.');
  if(!ready)ready=env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_distributed_file_buckets_v1 (
      bucket_start INTEGER NOT NULL,fingerprint TEXT NOT NULL,hits INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(bucket_start,fingerprint))`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_distributed_file_bucket_time ON aio_distributed_file_buckets_v1(bucket_start)'),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_distributed_file_incidents_v1 (
      id TEXT PRIMARY KEY,created_ms INTEGER NOT NULL,created_at TEXT NOT NULL,
      requests INTEGER NOT NULL,networks INTEGER NOT NULL,window_seconds INTEGER NOT NULL,
      reviewed_at TEXT,reviewed_by TEXT)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_distributed_file_incidents_time ON aio_distributed_file_incidents_v1(created_ms DESC)'),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_distributed_file_unread ON aio_distributed_file_incidents_v1(reviewed_at,created_at DESC)')
  ]).catch(e=>{ready=null;throw e;});
  await ready;
}
/** Run only after a denied unauthenticated GET of a protected file.
 * A failed telemetry write should not turn a denied file request into a successful one.
 */
export async function recordDistributedAnonymousDenied(env,request){
  const ip=clientIp(request);
  if(!ip||request.method!=='GET')return;
  await ensureDistributedMonitor(env);
  const db=env.COMMUNITY_DB,ms=Date.now();
  const start=Math.floor(ms/POLICY.windowBucketMs)*POLICY.windowBucketMs;
  const fingerprint=await sha256('aio-distributed-anon-v1:'+ip);
  await db.prepare(`INSERT INTO aio_distributed_file_buckets_v1(bucket_start,fingerprint,hits)
    VALUES(?,?,1) ON CONFLICT(bucket_start,fingerprint) DO UPDATE SET hits=hits+1`)
    .bind(start,fingerprint).run();
  const totals=await db.prepare(`SELECT COALESCE(SUM(hits),0) requests,COUNT(DISTINCT fingerprint) networks
    FROM aio_distributed_file_buckets_v1 WHERE bucket_start>=? AND bucket_start<=?`)
    .bind(start-10000,start).first();
  const attempts=Number(totals?.requests||0),networks=Number(totals?.networks||0);
  if(attempts>=POLICY.minRequests && networks>=POLICY.minNetworks){
    // A single atomic INSERT with an anti-duplicate condition creates at most one
    // incident per 15-minute wave. Review does not disable further detection.
    const r=await db.prepare(`INSERT INTO aio_distributed_file_incidents_v1
      (id,created_ms,created_at,requests,networks,window_seconds)
      SELECT ?,?,?,?,?,15 WHERE NOT EXISTS (
        SELECT 1 FROM aio_distributed_file_incidents_v1 WHERE created_ms>?)`)
      .bind(crypto.randomUUID(),ms,new Date(ms).toISOString(),attempts,networks,ms-POLICY.alertCooldownMs).run();
    if(Number(r.meta?.changes||0)===1){
      await logSecurity(env,request,'distributed_anon_wave',null,
        'Zbiorczy sygnał: '+attempts+' odmów / maks. 15 s, '+networks+' skrótów sieci. Bez blokad globalnych.');
    }
  }
  // Small, opportunistic retention cleanup. Audit incidents themselves are retained.
  if(Math.random()<0.002){
    await db.prepare('DELETE FROM aio_distributed_file_buckets_v1 WHERE bucket_start<?')
      .bind(ms-2*86400000).run().catch(()=>{});
  }
}
