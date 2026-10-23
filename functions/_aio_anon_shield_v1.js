/* AIO Anonymous Burst Shield V1.
 * Temporary application-level rate limit of UNAUTHENTICATED /pliki/ requests only.
 * Authenticated accounts are governed by Security V6; no site-wide IP bans.
 * IP is retained only as SHA-256 fingerprint, never as raw address in these tables.
 */
import {sha256,clientIp} from './_community.js';
import {logSecurity} from './_aio_security_journal.js';
export const ANON_POLICY=Object.freeze({ten_seconds:20,minute:60,cooldown_seconds:900});
let initialized=null;
const iso=()=>new Date().toISOString();
export async function ensureAnonymousShield(env){
  if(!env.COMMUNITY_DB)throw new Error('Brak COMMUNITY_DB');
  if(!initialized)initialized=env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_anon_shield_buckets (
      fingerprint TEXT NOT NULL, period_s INTEGER NOT NULL, bucket_start INTEGER NOT NULL,
      hits INTEGER NOT NULL, PRIMARY KEY(fingerprint,period_s,bucket_start))`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_anon_buckets_time ON aio_anon_shield_buckets(bucket_start)'),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_anon_shield_bans (
      fingerprint TEXT PRIMARY KEY, blocked_until_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL, reason TEXT NOT NULL)`),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_anon_shield_incidents (
      id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,created_at TEXT NOT NULL,
      blocked_until TEXT NOT NULL,hits_10s INTEGER NOT NULL,hits_60s INTEGER NOT NULL,
      reviewed_at TEXT,reviewed_by TEXT)`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_anon_incident_review ON aio_anon_shield_incidents(reviewed_at,created_at DESC)')
  ]).catch(e=>{initialized=null;throw e;});
  await initialized;
}
async function increment(db,key,period,ms){
  const start=Math.floor(ms/(period*1000))*(period*1000);
  const row=await db.prepare(`INSERT INTO aio_anon_shield_buckets(fingerprint,period_s,bucket_start,hits)
    VALUES(?,?,?,1) ON CONFLICT(fingerprint,period_s,bucket_start)
    DO UPDATE SET hits=hits+1 RETURNING hits`)
    .bind(key,period,start).first();
  return Number(row?.hits||0);
}
/** Called only after session check says no logged-in user. Does NOT count logged-in requests. */
export async function checkAnonymousFileBurst(env,request){
  const ip=clientIp(request);
  if(!ip)return {blocked:true,status:503,retryAfter:60,reason:'Nie można sprawdzić sieci.'};
  await ensureAnonymousShield(env);
  const db=env.COMMUNITY_DB, key=await sha256('aio-anonymous-files-v1:'+ip), ms=Date.now();
  const current=await db.prepare('SELECT blocked_until_ms FROM aio_anon_shield_bans WHERE fingerprint=?').bind(key).first();
  if(Number(current?.blocked_until_ms||0)>ms)return {blocked:true,status:429,retryAfter:Math.max(1,Math.ceil((Number(current.blocked_until_ms)-ms)/1000))};
  const hits10=await increment(db,key,10,ms);
  const hits60=hits10>ANON_POLICY.ten_seconds?0:await increment(db,key,60,ms);
  if(hits10<=ANON_POLICY.ten_seconds&&hits60<=ANON_POLICY.minute){
    // Opportunistic cleanup: not per request, and incident history is retained for owner review.
    if(hits10===1&&Math.random()<0.002){
      await db.batch([
        db.prepare('DELETE FROM aio_anon_shield_buckets WHERE bucket_start<?').bind(ms-2*86400000),
        db.prepare('DELETE FROM aio_anon_shield_bans WHERE blocked_until_ms<?').bind(ms-7*86400000)
      ]).catch(()=>{});
    }
    return {blocked:false};
  }
  const until=ms+ANON_POLICY.cooldown_seconds*1000;
  // Only the FIRST request to enter a new blocked period generates a journal alert.
  const change=await db.prepare(`INSERT INTO aio_anon_shield_bans(fingerprint,blocked_until_ms,created_at,reason)
    VALUES(?,?,?,?) ON CONFLICT(fingerprint) DO UPDATE SET
    blocked_until_ms=excluded.blocked_until_ms,created_at=excluded.created_at,reason=excluded.reason
    WHERE aio_anon_shield_bans.blocked_until_ms<=?`)
    .bind(key,until,iso(),hits10>20?'Ponad 20 anonimowych żądań / 10 s':'Ponad 60 anonimowych żądań / 60 s',ms).run();
  if(Number(change.meta?.changes||0)>0){
    await db.prepare(`INSERT INTO aio_anon_shield_incidents
      (id,fingerprint,created_at,blocked_until,hits_10s,hits_60s)
      VALUES(?,?,?,?,?,?)`).bind(crypto.randomUUID(),key,iso(),new Date(until).toISOString(),hits10,hits60).run();
    await logSecurity(env,request,'anonymous_burst_blocked',null,'Ograniczenie anonimowych żądań /pliki/ na 15 min; bez blokady zalogowanych kont');
  }
  return {blocked:true,status:429,retryAfter:ANON_POLICY.cooldown_seconds};
}
export function anonymousDeniedResponse(result,method='GET'){
  const code=result.status===503?503:429;
  const text=code===429?'Zbyt wiele anonimowych żądań plików. Dostęp tymczasowo ograniczony. Zalogowani użytkownicy mogą korzystać ze swoich kont. Kontakt: /contact.html.':'Nie można zweryfikować żądania. Spróbuj ponownie później.';
  return new Response(method==='HEAD'?null:text,{status:code,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Retry-After':String(Math.max(1,result.retryAfter||900)),'X-Content-Type-Options':'nosniff'}});
}
