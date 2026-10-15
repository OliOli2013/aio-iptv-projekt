/* AIO List V1.4 — private inbox and optional transactional email notifications.
   Requires existing COMMUNITY_DB. No third-party secret is sent to the browser. */
import {isoNow} from './_community.js';
let schemaPromise=null;
export async function ensureListInbox(env){
  if(!env.COMMUNITY_DB)throw new Error('Brak bazy COMMUNITY_DB.');
  if(!schemaPromise)schemaPromise=(async()=>{
    await env.COMMUNITY_DB.batch([
      env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_list_inbox (
        id TEXT PRIMARY KEY, sender_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('submission','update','contact')),
        subject TEXT NOT NULL, body TEXT NOT NULL,
        list_id TEXT, status TEXT NOT NULL DEFAULT 'new',
        admin_reply TEXT, admin_read_at TEXT,
        created_at TEXT NOT NULL, replied_at TEXT,
        email_status TEXT NOT NULL DEFAULT 'disabled',
        FOREIGN KEY(sender_id) REFERENCES community_profiles(id) ON DELETE CASCADE
      )`),
      env.COMMUNITY_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_aio_inbox_status ON aio_list_inbox(status,created_at)`),
      env.COMMUNITY_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_aio_inbox_sender ON aio_list_inbox(sender_id,created_at)`)
    ]);
  })().catch(e=>{schemaPromise=null;throw e;});
  return schemaPromise;
}
export function mailConfigured(env){
  return Boolean(env.AIO_RESEND_API_KEY && env.AIO_NOTIFY_FROM && (env.AIO_NOTIFY_TO||env.COMMUNITY_OWNER_EMAIL));
}
function validAddress(addr){return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(addr||''));}
export async function sendListNoticeEmail(env,notice){
  if(!mailConfigured(env))return 'not_configured';
  const to=String(env.AIO_NOTIFY_TO||env.COMMUNITY_OWNER_EMAIL||'').trim();
  const from=String(env.AIO_NOTIFY_FROM||'').trim();
  if(!validAddress(to)||!validAddress(from))return 'invalid_config';
  try {
    const resp=await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{'Authorization':`Bearer ${env.AIO_RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`aio-list-${notice.id}`},
      body:JSON.stringify({from,to:[to],subject:'[AIO] '+notice.subject.slice(0,150),
        text:`Nowa wiadomość w panelu AIO Listy.\n\nTyp: ${notice.kind}\nTytuł: ${notice.subject}\n\n${notice.body.slice(0,1200)}\n\nOtwórz skrzynkę: https://aio-iptv-projekt.pages.dev/community-admin.html#aio-list-inbox`})
    });
    if(!resp.ok){console.error('[AIO LISTS] Nie można wysłać powiadomienia e-mail, HTTP',resp.status);return 'failed';}
    return 'sent';
  }catch(e){console.error('[AIO LISTS] Błąd wysyłki wiadomości');return 'failed';}
}
export async function createListNotice(env,{senderId,kind,subject,body,listId=null}){
  await ensureListInbox(env);
  const id=crypto.randomUUID();
  await env.COMMUNITY_DB.prepare(`INSERT INTO aio_list_inbox
    (id,sender_id,kind,subject,body,list_id,status,created_at,email_status)
    VALUES (?,?,?,?,?,?,'new',?, 'disabled')`).bind(id,senderId,kind,String(subject).slice(0,180),String(body).slice(0,4000),listId,isoNow()).run();
  // Email failures never lose the D1 inbox entry or invalidate the channel-list upload.
  const email_status=await sendListNoticeEmail(env,{id,kind,subject,body});
  await env.COMMUNITY_DB.prepare('UPDATE aio_list_inbox SET email_status=? WHERE id=?').bind(email_status,id).run().catch(()=>{});
  return {id,email_status};
}
