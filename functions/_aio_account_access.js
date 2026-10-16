/* AIO Access — server-side account entitlements. No entitlement is inferred from an IP or an unsigned browser cookie. */
import {getSession,ensureSchema,sha256} from './_community.js';
import {createListNotice} from './_aio_list_notice.js';
export const SUPPORT_MS = 7 * 24 * 60 * 60 * 1000;
export const ROLLOUT = '2026-10-14T21:42:50.000Z';
/* Immutable upper boundary for historical browser-flow events. No future client-submitted event can manufacture a legacy grant. */
export const LEGACY_END = '2026-10-16T07:15:00.000Z';
let schemaInit;
export function response(data,status=200) {return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}
export function fail(status,message){return Object.assign(new Error(message),{status});}
export async function initAccess(env){
  await ensureSchema(env);
  if(!schemaInit) schemaInit=(async()=>env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_access_account_grants (
      user_id TEXT PRIMARY KEY, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      source TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)`),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_access_account_daily (
      user_id TEXT NOT NULL, day TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(user_id,day))`),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_access_account_flows (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, method TEXT NOT NULL,
      created_ms INTEGER NOT NULL, opened_ms INTEGER NOT NULL DEFAULT 0,
      completed_ms INTEGER NOT NULL DEFAULT 0)`),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_access_receipts (
      email_hash TEXT NOT NULL, paid_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'buycoffee', reference TEXT NOT NULL,
      created_at TEXT NOT NULL, PRIMARY KEY(email_hash,paid_at))`),
    env.COMMUNITY_DB.prepare(`CREATE INDEX IF NOT EXISTS idx_aio_access_flows_user ON aio_access_account_flows(user_id,created_ms)`),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_access_guest_trials (guest_hash TEXT PRIMARY KEY, created_at TEXT NOT NULL, used_at TEXT)`),
    env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_access_approval_requests (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, method TEXT NOT NULL,
      flow_id TEXT UNIQUE NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL, priority_message TEXT, priority_sent_at TEXT,
      reviewed_by TEXT, reviewed_at TEXT, review_reason TEXT,
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE
    )`),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_access_approvals_queue ON aio_access_approval_requests(status,created_at)'),
    env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_access_approvals_user ON aio_access_approval_requests(user_id,created_at)')
  ]))().catch(e=>{schemaInit=null;throw e;});
  await schemaInit;
}
export function warsawDay(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const m=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${m.year}-${m.month}-${m.day}`;
}
export async function sessionUser(request,env){
  const s=await getSession(request,env,{touch:false});
  return s && !s.blocked && !s.banned ? s.user : null;
}
async function userEmailHash(env,userId){
  const row=await env.COMMUNITY_DB.prepare('SELECT email FROM community_auth WHERE user_id=? LIMIT 1').bind(userId).first();
  return row?.email?await sha256(String(row.email).trim().toLowerCase()):null;
}
async function putGrant(env,userId,startedAt,source,reference=''){
  const t=Date.parse(startedAt);if(!Number.isFinite(t))throw fail(400,'Niepoprawna data odblokowania.');
  const issued=new Date(t).toISOString(),expires=new Date(t+SUPPORT_MS).toISOString();
  await env.COMMUNITY_DB.prepare(`INSERT INTO aio_access_account_grants(user_id,issued_at,expires_at,source,reference,updated_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET
    issued_at=excluded.issued_at, expires_at=excluded.expires_at,
    source=excluded.source, reference=excluded.reference,updated_at=excluded.updated_at
    WHERE excluded.expires_at > aio_access_account_grants.expires_at`)
    .bind(userId,issued,expires,source,String(reference).slice(0,160),new Date().toISOString()).run();
  return {expires_at:expires};
}
export async function recoverForUser(env,userId){
  // App event proves completion of the OLD AIO Access workflow, NOT a verified payment.
  const hist=await env.COMMUNITY_DB.prepare(`SELECT MAX(created_at) AS ts FROM aio_access_events
    WHERE user_id=? AND event_type='access_unlocked' AND created_at>=? AND created_at<=?`)
    .bind(userId,ROLLOUT,LEGACY_END).first();
  if(hist?.ts) await putGrant(env,userId,hist.ts,'legacy_workflow','historical access_unlocked');
  const h=await userEmailHash(env,userId);
  if(h){
    const receipt=await env.COMMUNITY_DB.prepare(`SELECT paid_at,reference FROM aio_access_receipts WHERE email_hash=? ORDER BY expires_at DESC LIMIT 1`).bind(h).first();
    if(receipt) await putGrant(env,userId,receipt.paid_at,'verified_receipt',receipt.reference);
  }
}
export async function getStatus(env,userId){
  await initAccess(env);await recoverForUser(env,userId);
  const day=warsawDay(), now=Date.now();
  const [grant,used]=await Promise.all([
    env.COMMUNITY_DB.prepare('SELECT expires_at,source,issued_at FROM aio_access_account_grants WHERE user_id=?').bind(userId).first(),
    env.COMMUNITY_DB.prepare('SELECT used FROM aio_access_account_daily WHERE user_id=? AND day=?').bind(userId,day).first()
  ]);
  const active=!!grant && Date.parse(grant.expires_at)>now;
  return {authenticated:true,active,expires_at:active?grant.expires_at:null,
    source:active?grant.source:null,free_remaining:active?1:Math.max(0,1-Number(used?.used||0)),day};
}
export async function consumeFree(env,userId){
  const status=await getStatus(env,userId);if(status.active)return {...status,allowed:true,reason:'grant'};
  const day=warsawDay();
  await env.COMMUNITY_DB.prepare('INSERT OR IGNORE INTO aio_access_account_daily(user_id,day,used) VALUES(?,?,0)').bind(userId,day).run();
  const changed=await env.COMMUNITY_DB.prepare('UPDATE aio_access_account_daily SET used=used+1 WHERE user_id=? AND day=? AND used<1').bind(userId,day).run();
  return {allowed:Number(changed.meta?.changes||0)>0,reason:'free',day};
}
export async function startFlow(env,userId,method){
  if(!['buycoffee','revolut','kofi'].includes(method))throw fail(400,'Nieprawidłowa metoda wsparcia.');
  const id=crypto.randomUUID(),now=Date.now();
  await env.COMMUNITY_DB.prepare('INSERT INTO aio_access_account_flows(id,user_id,method,created_ms) VALUES(?,?,?,?)').bind(id,userId,method,now).run();
  return {flow_id:id};
}
export async function flowOpened(env,userId,id){
  const now=Date.now();
  const r=await env.COMMUNITY_DB.prepare(`UPDATE aio_access_account_flows SET opened_ms=?
    WHERE id=? AND user_id=? AND opened_ms=0 AND completed_ms=0 AND created_ms>=?`).bind(now,id,userId,now-900000).run();
  if(!r.meta?.changes)throw fail(409,'Ta sesja wsparcia nie istnieje lub wygasła.');
  return {ok:true};
}
export async function flowComplete(env,userId,id){
  const now=Date.now();
  const r=await env.COMMUNITY_DB.prepare(`UPDATE aio_access_account_flows SET completed_ms=?
    WHERE id=? AND user_id=? AND completed_ms=0 AND opened_ms>0 AND opened_ms<=? AND created_ms>=?`)
    .bind(now,id,userId,now-35000,now-900000).run();
  if(!r.meta?.changes)throw fail(409,'Nie zakończono 35-sekundowej ścieżki wsparcia albo sesja wygasła.');
  // Sam powrót ze strony wsparcia NIE potwierdza przelewu.
  // Twórz tylko jeden aktywny wniosek dla danego konta; nie zalewaj panelu spamem.
  const flow=await env.COMMUNITY_DB.prepare('SELECT method FROM aio_access_account_flows WHERE id=? AND user_id=?').bind(id,userId).first();
  const requestId=crypto.randomUUID();
  const createdAt=new Date(now).toISOString();
  const queued=await env.COMMUNITY_DB.prepare(`INSERT INTO aio_access_approval_requests
    (id,user_id,method,flow_id,status,created_at)
    SELECT ?,?,?,?,'pending',?
    WHERE NOT EXISTS (SELECT 1 FROM aio_access_approval_requests WHERE user_id=? AND status='pending')`)
    .bind(requestId,userId,flow?.method||'buycoffee',id,createdAt,userId).run();
  let entryId=requestId;
  if(Number(queued.meta?.changes||0)===1){
    try { await createListNotice(env,{senderId:userId,kind:'contact',
      subject:'Nowe zgłoszenie wsparcia — AIO Access',
      body:'Użytkownik zakończył ścieżkę wsparcia. Do sprawdzenia faktyczna wpłata. Metoda: '+(flow?.method||'nieznana')+'. Numer zgłoszenia: '+requestId}); }
    catch(e){ console.error('AIO Access: zgłoszenie zapisane, ale powiadomienie skrzynki niedostępne',String(e?.message||e)); }
  }else{
    const existing=await env.COMMUNITY_DB.prepare("SELECT id FROM aio_access_approval_requests WHERE user_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1").bind(userId).first();
    if(existing)entryId=existing.id;
  }
  return {ok:true,pending_confirmation:true,request_id:entryId,
    message:'Zgłoszenie przekazano do weryfikacji. Standardowo rozpatrujemy wpłaty w 1–2 h, gdy administrator jest dostępny; nie jest to automatyczne odblokowanie.'};
}
export async function registerReceipt(env,email,paidAt,reference){
  const value=String(email||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw fail(400,'Podaj adres e-mail wskazany w potwierdzeniu wpłaty.');
  const t=Date.parse(paidAt);if(!Number.isFinite(t) || t>Date.now()+120000 || t<Date.parse(ROLLOUT))throw fail(400,'Data wpłaty jest nieprawidłowa albo wcześniejsza od wdrożenia.');
  const issued=new Date(t).toISOString(), expires=new Date(t+SUPPORT_MS).toISOString();
  const h=await sha256(value);
  await env.COMMUNITY_DB.prepare(`INSERT INTO aio_access_receipts(email_hash,paid_at,expires_at,method,reference,created_at)
    VALUES(?,?,?,'buycoffee',?,?) ON CONFLICT(email_hash,paid_at) DO NOTHING`)
    .bind(h,issued,expires,String(reference||'Potwierdzenie BuyCoffee').slice(0,160),new Date().toISOString()).run();
  const user=await env.COMMUNITY_DB.prepare('SELECT user_id FROM community_auth WHERE lower(email)=? LIMIT 1').bind(value).first();
  if(user?.user_id){
    await putGrant(env,user.user_id,issued,'verified_receipt',reference||'BuyCoffee');
    await env.COMMUNITY_DB.prepare(`UPDATE aio_access_approval_requests
      SET status='approved',reviewed_at=?,review_reason='Zweryfikowane potwierdzenie BuyCoffee'
      WHERE user_id=? AND status='pending'`).bind(new Date().toISOString(),user.user_id).run();
  }
  return {ok:true,matched_account:!!user?.user_id,expires_at:expires};
}

/* AIO ACCESS GUEST V3 — one anonymous trial per persistent browser token, not IP.
 * Guest browsers clearing cookies cannot be identified reliably. This is a convenience
 * limitation, not a payment entitlement or identity/anti-fraud guarantee.
 */
const GUEST_COOKIE='aio_access_guest_v3';
function readGuestToken(request){
  const match=String(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(GUEST_COOKIE+'='));
  const value=match?match.slice(GUEST_COOKIE.length+1):'';
  return /^[a-f0-9]{32}$/.test(value)?value:null;
}
function makeGuestCookie(token){
  return `${GUEST_COOKIE}=${token}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;
}
export async function guestState(env,request){
  await initAccess(env);
  let token=readGuestToken(request), cookie=null;
  if(!token){token=crypto.randomUUID().replace(/-/g,'');cookie=makeGuestCookie(token);}
  const hash=await sha256(token);
  await env.COMMUNITY_DB.prepare('INSERT OR IGNORE INTO aio_access_guest_trials(guest_hash,created_at,used_at) VALUES(?,?,NULL)')
    .bind(hash,new Date().toISOString()).run();
  const state=await env.COMMUNITY_DB.prepare('SELECT used_at FROM aio_access_guest_trials WHERE guest_hash=?').bind(hash).first();
  if(!state)throw fail(503,'Nie można odczytać próbnego pobrania.');
  return {guest_hash:hash,guest_remaining:state.used_at?0:1,cookie};
}
export async function consumeGuest(env,request,knownState=null){
  const state=knownState||await guestState(env,request);
  if(!state.guest_remaining)return {allowed:false,guest_remaining:0,cookie:state.cookie};
  const changed=await env.COMMUNITY_DB.prepare('UPDATE aio_access_guest_trials SET used_at=? WHERE guest_hash=? AND used_at IS NULL')
    .bind(new Date().toISOString(),state.guest_hash).run();
  const allowed=Number(changed.meta?.changes||0)===1;
  return {allowed,guest_remaining:0,cookie:state.cookie};
}
export function applyGuestCookie(resp,cookie){
  if(!cookie)return resp;
  const headers=new Headers(resp.headers);headers.append('Set-Cookie',cookie);
  headers.set('Cache-Control','private, no-store');
  return new Response(resp.body,{status:resp.status,statusText:resp.statusText,headers});
}
