/* AIO Email Verification V1 — server-side proof of mailbox ownership.
   Existing accounts remain usable during rollout, then require verification
   before downloads when AIO_EMAIL_VERIFICATION_MODE=enforce.
   Newly created accounts always require verification before downloads.
*/
const TTL_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 3 * 60 * 1000;
const LIMIT_DAY = 5;
let schemaPromise;
function problem(status, message) { return Object.assign(new Error(message), {status}); }
function emailFormat(v){return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(v||''));}
function hashBytes(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
}
async function hashToken(token) {
  const data = new TextEncoder().encode(String(token||''));
  return hashBytes(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
}
function newToken() { const a = new Uint8Array(32); crypto.getRandomValues(a); return hashBytes(a); }
function sender(env) { return String(env.AIO_VERIFY_FROM_EMAIL || env.AIO_RESET_FROM_EMAIL || '').trim(); }
export function emailSendingReady(env) {
  return Boolean(String(env.RESEND_API_KEY||'').trim() && emailFormat(sender(env)));
}
export async function ensureEmailVerificationSchema(env) {
  if (!schemaPromise) schemaPromise=(async()=>{
    if (!env.COMMUNITY_DB) throw problem(503,'Brak połączenia D1.');
    await env.COMMUNITY_DB.batch([
      env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_email_verifications (
        user_id TEXT PRIMARY KEY,
        verified_at TEXT,
        token_hash TEXT UNIQUE,
        expires_at TEXT,
        sent_at TEXT,
        window_at TEXT,
        send_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE
      )`),
      env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_email_tokens ON aio_email_verifications(token_hash)')
    ]);
  })().catch(e=>{schemaPromise=null;throw e;});
  await schemaPromise;
}
export async function emailVerificationStatus(env, userId) {
  await ensureEmailVerificationSchema(env);
  const row = await env.COMMUNITY_DB.prepare('SELECT verified_at, sent_at FROM aio_email_verifications WHERE user_id=? LIMIT 1').bind(userId).first();
  const enforced = String(env.AIO_EMAIL_VERIFICATION_MODE||'').toLowerCase()==='enforce';
  // Previously registered accounts lack rows. They are subject to the final enforcement switch.
  // Every newly registered account gets an explicit pending row and is blocked in both modes.
  const verified=Boolean(row?.verified_at);
  const required=Boolean(row) ? !verified : enforced;
  return {verified, required, confirmed:verified, sent_at:row?.sent_at||null};
}
export async function sendVerificationEmail(env,userId,email) {
  if (!emailSendingReady(env)) throw problem(503,'Wysyłka e-mail nie jest skonfigurowana. Skontaktuj się z administratorem.');
  if (!emailFormat(email)) throw problem(400,'Nieprawidłowy adres e-mail.');
  await ensureEmailVerificationSchema(env);
  const now=Date.now(), nowIso=new Date(now).toISOString();
  const older=new Date(now-COOLDOWN_MS).toISOString(), dayAgo=new Date(now-86400000).toISOString();
  const token=newToken(), tokenHash=await hashToken(token), expires=new Date(now+TTL_MS).toISOString();
  const db=env.COMMUNITY_DB;
  // One atomic statement enforces cooldown and daily sending cap across parallel requests.
  const r=await db.prepare(`INSERT INTO aio_email_verifications
    (user_id,verified_at,token_hash,expires_at,sent_at,window_at,send_count,created_at)
    VALUES (?,NULL,?,?,?,?,1,?)
    ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,
      expires_at=excluded.expires_at,sent_at=excluded.sent_at,
      window_at=CASE WHEN aio_email_verifications.window_at<? THEN excluded.window_at ELSE aio_email_verifications.window_at END,
      send_count=CASE WHEN aio_email_verifications.window_at<? THEN 1 ELSE aio_email_verifications.send_count+1 END
    WHERE aio_email_verifications.verified_at IS NULL
      AND (aio_email_verifications.sent_at IS NULL OR aio_email_verifications.sent_at<=?)
      AND (aio_email_verifications.window_at<? OR aio_email_verifications.send_count<?)`)
    .bind(userId,tokenHash,expires,nowIso,nowIso,nowIso,dayAgo,dayAgo,older,dayAgo,LIMIT_DAY).run();
  if(Number(r.meta?.changes||0)!==1) throw problem(429,'Wiadomość niedawno wysłano lub wyczerpano limit. Spróbuj później.');
  const base='https://aio-iptv-projekt.pages.dev';
  const url=base+'/api/verify-email?token='+encodeURIComponent(token);
  let response;
  try {
    response=await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{Authorization:'Bearer '+String(env.RESEND_API_KEY).trim(),'Content-Type':'application/json'},
      body:JSON.stringify({from:sender(env),to:[email],
        subject:'AIO-IPTV.pl — potwierdź adres e-mail',
        text:'Aby aktywować pobieranie na koncie AIO, potwierdź adres e-mail:\n\n'+url+'\n\nLink jest ważny przez 24 godziny i można go użyć tylko raz. Jeśli nie rejestrowałeś konta, zignoruj wiadomość.'})
    });
  } catch { throw problem(502,'Nie udało się wysłać wiadomości. Ponów próbę później.'); }
  if(!response.ok){
    // Never leak provider credentials or provider response to the browser.
    throw problem(502,'Dostawca poczty nie zaakceptował wiadomości. Sprawdź konfigurację nadawcy.');
  }
  return {ok:true, sent:true, message:'Wysłaliśmy link weryfikacyjny na wskazany adres e-mail.'};
}
export async function confirmVerificationToken(env,token) {
  if(!/^[a-f0-9]{64}$/i.test(String(token||''))) throw problem(400,'Nieprawidłowy link weryfikacyjny.');
  await ensureEmailVerificationSchema(env);
  const now=new Date().toISOString(), h=await hashToken(token);
  const r=await env.COMMUNITY_DB.prepare(`UPDATE aio_email_verifications
    SET verified_at=?,token_hash=NULL,expires_at=NULL
    WHERE token_hash=? AND verified_at IS NULL AND expires_at>?`)
    .bind(now,h,now).run();
  if(Number(r.meta?.changes||0)!==1)throw problem(400,'Link wygasł lub został już wykorzystany.');
  return {ok:true};
}
