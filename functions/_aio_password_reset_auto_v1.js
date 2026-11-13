/* AIO TunerHub — self-service password reset through existing WP SMTP.
 * Stored reset codes are SHA-256 hashes. The plaintext code is only emailed.
 * No activation of account privileges; manual/anti-abuse holds remain intact.
 * Only a previously verified mailbox qualifies for this automatic workflow.
 */
import {sendWpSmtp,wpSmtpReady} from './_aio_wp_smtp.js';

const MAX_HOURLY_SENDS=3;
const COOLDOWN_MS=3*60*1000;
const HOUR_MS=60*60*1000;
const CODE_TTL_MS=15*60*1000;
const CODE_BYTES=16; // 128-bit secret: robust even if a database backup leaks
const BASE_URL='https://aio-iptv-projekt.pages.dev';
let schemaReady=null;
const nowIso=()=>new Date().toISOString();

async function sha256(s){
  const bytes=new TextEncoder().encode(s);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
function newCode(){
  const bytes=new Uint8Array(CODE_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
}
// Uses the already configured Cloudflare Turnstile keys; no new service required.
export async function verifyResetChallenge(env,request,token){
  const secret=String(env?.AIO_TURNSTILE_SECRET_KEY||'');
  const site=String(env?.AIO_TURNSTILE_SITE_KEY||'');
  if(!secret&&!site)return; // Optional only when protection is not configured.
  if(!secret||!site)throw Object.assign(new Error('Weryfikacja formularza jest chwilowo niedostępna.'),{status:503});
  const proof=String(token||'');
  if(!proof||proof.length>3000)throw Object.assign(new Error('Potwierdź formularz.'),{status:403});
  const form=new URLSearchParams({secret,response:proof});
  const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form.toString()
  });
  if(!response.ok)throw Object.assign(new Error('Weryfikacja formularza jest chwilowo niedostępna.'),{status:503});
  const result=await response.json().catch(()=>({success:false}));
  const hostname=new URL(request.url).hostname;
  if(!result.success||(result.hostname&&result.hostname!==hostname))
    throw Object.assign(new Error('Potwierdzenie formularza wygasło. Spróbuj ponownie.'),{status:403});
}

export function automaticResetEnabled(env){
  return String(env?.AIO_PASSWORD_RESET_MODE||'auto').toLowerCase()!=='manual' && wpSmtpReady(env);
}
export async function ensureResetAutoSchema(env){
  if(!env?.COMMUNITY_DB)throw new Error('Reset: brak bazy D1');
  if(!schemaReady)schemaReady=env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_reset_auto_dispatch_v1 (
      user_id TEXT PRIMARY KEY,
      window_at TEXT NOT NULL,
      send_count INTEGER NOT NULL,
      sent_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE)`)
  ]).catch(e=>{schemaReady=null;throw e;});
  await schemaReady;
}
async function reserveDispatch(db,userId){
  const stamp=Date.now(),current=new Date(stamp).toISOString();
  const hourAgo=new Date(stamp-HOUR_MS).toISOString();
  const coolAgo=new Date(stamp-COOLDOWN_MS).toISOString();
  // Atomic across parallel Worker requests; no select-then-write rate limit race.
  const result=await db.prepare(`INSERT INTO aio_reset_auto_dispatch_v1
      (user_id,window_at,send_count,sent_at) VALUES (?,?,1,?)
      ON CONFLICT(user_id) DO UPDATE SET
        window_at=CASE WHEN aio_reset_auto_dispatch_v1.window_at<=?
                       THEN excluded.window_at ELSE aio_reset_auto_dispatch_v1.window_at END,
        send_count=CASE WHEN aio_reset_auto_dispatch_v1.window_at<=? THEN 1
                       ELSE aio_reset_auto_dispatch_v1.send_count+1 END,
        sent_at=excluded.sent_at
      WHERE aio_reset_auto_dispatch_v1.sent_at<=?
        AND (aio_reset_auto_dispatch_v1.window_at<=?
             OR aio_reset_auto_dispatch_v1.send_count<?)`)
    .bind(userId,current,current,hourAgo,hourAgo,coolAgo,hourAgo,MAX_HOURLY_SENDS).run();
  return Number(result.meta?.changes||0)===1;
}

/** Call only after the caller has verified ownership of the mailbox via verified_at. */
export async function sendAutomaticPasswordReset(env,userId,email){
  if(!automaticResetEnabled(env))return {state:'manual'};
  await ensureResetAutoSchema(env);
  const db=env.COMMUNITY_DB;
  if(!await reserveDispatch(db,userId))return {state:'limited'};
  const code=newCode(), codeHash=await sha256(code);
  const id=crypto.randomUUID(), createdAt=nowIso();
  const expiresAt=new Date(Date.now()+CODE_TTL_MS).toISOString();
  // A code is NOT approved until SMTP accepts the email.
  await db.prepare(`INSERT INTO community_password_reset_requests
    (id,user_id,email_snapshot,requested_ip,status,code_hash,expires_at,created_at)
    VALUES (?,?,?,NULL,'pending',?,?,?)`)
    .bind(id,userId,email,codeHash,expiresAt,createdAt).run();
  try {
    await sendWpSmtp(env,{
      to:email,
      subject:'AIO TunerHub — jednorazowy kod zmiany hasła',
      text:'Otrzymaliśmy prośbę o zmianę hasła do konta AIO TunerHub.\n\n'+
        'Twój jednorazowy kod:\n'+code+'\n\n'+
        'Kod jest ważny przez 15 minut i można użyć go tylko raz.\n'+
        'Aby ustawić nowe hasło, otwórz '+BASE_URL+'/community.html, '+
        'wybierz „Mam kod resetu”, a następnie wpisz kod i nowe hasło.\n\n'+
        'Jeśli nie prosiłeś o zmianę hasła, zignoruj wiadomość. '+
        'Nie udostępniaj kodu innym osobom.'
    });
  } catch(e){
    await db.prepare(`UPDATE community_password_reset_requests
      SET status='cancelled',cancelled_at=? WHERE id=? AND status='pending'`)
      .bind(nowIso(),id).run().catch(()=>{});
    console.error('[AIO password reset auto] WP SMTP send failed:',String(e?.code||'SMTP_ERROR').slice(0,64));
    return {state:'delivery_failed'};
  }
  try {
    const stamp=nowIso();
    // Batch is transactional: all previous outstanding codes become invalid.
    await db.batch([
      db.prepare(`UPDATE community_password_reset_requests
         SET status='cancelled',cancelled_at=?
         WHERE user_id=? AND id<>? AND status IN ('pending','approved')`)
         .bind(stamp,userId,id),
      db.prepare(`UPDATE community_password_reset_requests
         SET status='approved',approved_at=?,approved_by='AIO_AUTO_WP_V1'
         WHERE id=? AND status='pending'`)
         .bind(stamp,id)
    ]);
    return {state:'sent'};
  }catch(e){
    console.error('[AIO password reset auto] activation failed',String(e?.code||'DB_ERROR').slice(0,64));
    await db.prepare(`UPDATE community_password_reset_requests
      SET status='cancelled',cancelled_at=? WHERE id=? AND status='pending'`)
      .bind(nowIso(),id).run().catch(()=>{});
    return {state:'delivery_failed'};
  }
}

/** Non-enumerating fallback, for accounts without verified email or mail outage. */
export async function queueManualPasswordReset(env,userId,email,ip){
  const db=env.COMMUNITY_DB;
  // Idempotent manual request; do not erase an existing valid manual code.
  const existing=await db.prepare(`SELECT id FROM community_password_reset_requests
    WHERE user_id=? AND status IN ('pending','approved')
    ORDER BY created_at DESC LIMIT 1`).bind(userId).first();
  if(existing)return {queued:false};
  await db.prepare(`INSERT INTO community_password_reset_requests
    (id,user_id,email_snapshot,requested_ip,status,created_at)
    VALUES (?,?,?,?,'pending',?)`)
    .bind(crypto.randomUUID(),userId,email,ip||null,nowIso()).run();
  return {queued:true};
}
