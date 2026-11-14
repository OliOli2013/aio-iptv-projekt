/* AIO Self Resolve V1 — restricted appeal-session only.
 * Never expose network/IP history, heuristics, e-mail addresses, risk scores or
 * accounts related only by IP/name similarities. No normal session is granted.
 */
import {json,hashPassword,safeEqual,getOwnerId,moderationLog} from '../_community.js';
import {readAppealSession} from '../_aio_appeal_session_v2.js';
import {gmailMailbox} from '../_aio_network_prefix_v1.js';
import {strictGlobalHold,releaseStrictV4} from '../_aio_strict_ip_v4.js';
import {monthlyStatus,nextCalendarMonth} from '../_aio_monthly_access.js';
import {deleteAccountSafely} from '../_aio_delete_account_v1.js';

const VALID_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEAD={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
const reply=(data,status=200)=>json(data,status,HEAD);
const fmt=x=>String(x||'').slice(0,80);
const bad=(status,error)=>Object.assign(new Error(error),{status});
function sameOrigin(request){
  const origin=request.headers.get('Origin');
  if(origin){try{if(new URL(origin).origin!==new URL(request.url).origin)return false;}catch(_){return false;}}
  return request.headers.get('Sec-Fetch-Site')!=='cross-site';
}
async function findSelf(env,request){
  const session=await readAppealSession(request,env);
  if(!session)return null;
  const owner=await getOwnerId(env);
  if(session.id===owner)return null;
  const profile=await env.COMMUNITY_DB.prepare(`SELECT p.id,p.display_name,p.role,p.banned_until,p.ban_reason,
    a.email,v.verified_at FROM community_profiles p
    JOIN community_auth a ON a.user_id=p.id
    LEFT JOIN aio_email_verifications v ON v.user_id=p.id
    WHERE p.id=? LIMIT 1`).bind(session.id).first();
  return profile?.role==='user'?profile:null;
}
async function reviewKind(env,self){
  if(!self)return 'none';
  const strict=await strictGlobalHold(env,self.id);
  if(strict)return 'related';
  const reason=String(self.ban_reason||'');
  if(self.banned_until&&Date.parse(self.banned_until)>Date.now() &&
    (/^AIO_REVIEW_V1:/.test(reason)||/^AIO_IP_V42:/.test(reason)))return 'related';
  // A non-relationship account or e-mail block remains an appeal-only case.
  if(self.banned_until&&Date.parse(self.banned_until)>Date.now())return 'other';
  return 'none';
}
async function confirmedPeers(env,self){
  const db=env.COMMUNITY_DB,owner=await getOwnerId(env);
  const proven=new Map();
  const mailbox=self.verified_at?gmailMailbox(self.email):null;
  if(mailbox){
    // The same independently verified Gmail mailbox (including +aliases/dots).
    // This is NOT a fuzzy e-mail, name or shared-IP match.
    const rows=await db.prepare(`SELECT p.id,p.display_name,p.created_at,a.email
      FROM community_profiles p JOIN community_auth a ON a.user_id=p.id
      JOIN aio_email_verifications v ON v.user_id=p.id
      WHERE v.verified_at IS NOT NULL AND p.role='user'
        AND (lower(a.email) LIKE '%@gmail.com' OR lower(a.email) LIKE '%@googlemail.com')
      ORDER BY p.created_at DESC LIMIT 3000`).all();
    for(const row of rows.results||[]){
      if(row.id!==self.id&&row.id!==owner&&gmailMailbox(row.email)===mailbox)
        proven.set(row.id,{id:row.id,name:fmt(row.display_name),created_at:row.created_at});
    }
  }
  // A group expressly created by the site owner as a CONFIRMED shared quota.
  // Never return provisional matches from the owner analytics/scoring table.
  const linked=await db.prepare(`SELECT other.user_id AS id,p.display_name AS name,p.created_at
    FROM aio_multikonta_quota_members_v2 mine
    JOIN aio_multikonta_quota_members_v2 other ON other.group_id=mine.group_id
    JOIN community_profiles p ON p.id=other.user_id
    WHERE mine.user_id=? AND other.user_id<>? AND p.role='user'
    ORDER BY p.created_at DESC LIMIT 20`).bind(self.id,self.id).all()
    .catch(e=>{if(/no such table/i.test(String(e?.message||'')))return {results:[]};throw e;});
  for(const row of linked.results||[]){
    if(row.id!==owner)proven.set(row.id,{id:row.id,name:fmt(row.name),created_at:row.created_at});
  }
  return [...proven.values()].slice(0,20).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
}
async function ensureAttemptTable(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS aio_self_resolve_attempts_v1 (
    user_id TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0,
    period_start TEXT NOT NULL,blocked_until TEXT
  )`).run();
}
async function limitAttempt(db,userId){
  await ensureAttemptTable(db);
  const now=Date.now(),stamp=new Date(now).toISOString();
  const since=new Date(now-15*60000).toISOString(),until=new Date(now+15*60000).toISOString();
  const row=await db.prepare(`INSERT INTO aio_self_resolve_attempts_v1
    (user_id,attempts,period_start,blocked_until) VALUES(?,1,?,NULL)
    ON CONFLICT(user_id) DO UPDATE SET
      attempts=CASE WHEN period_start<? THEN 1 ELSE attempts+1 END,
      period_start=CASE WHEN period_start<? THEN excluded.period_start ELSE period_start END,
      blocked_until=CASE WHEN period_start<? THEN NULL WHEN attempts>=4 THEN ? ELSE blocked_until END
    RETURNING attempts,blocked_until`).bind(userId,stamp,since,since,since,until).first();
  if((row?.blocked_until&&Date.parse(row.blocked_until)>now)||Number(row?.attempts||0)>5)
    throw bad(429,'Zbyt wiele prób. Spróbuj ponownie później lub wyślij odwołanie.');
}
async function isPaidOrProtected(db,targetId){
  const queries=[
    `SELECT 1 v FROM aio_vip_grants WHERE user_id=? AND status='active' AND datetime(expires_at)>datetime('now') LIMIT 1`,
    `SELECT 1 v FROM aio_access_account_grants WHERE user_id=? AND datetime(expires_at)>datetime('now') LIMIT 1`,
    `SELECT 1 v FROM aio_access_approval_requests WHERE user_id=? AND status='pending' LIMIT 1`,
    `SELECT 1 v FROM aio_support_intents WHERE user_id=? AND status IN ('started','reported') LIMIT 1`
  ];
  for(const sql of queries){
    const row=await db.prepare(sql).bind(targetId).first()
      .catch(e=>{if(/no such table/i.test(String(e?.message||'')))return null;throw e;});
    if(row)return true;
  }
  return false;
}
async function hasExternallyStoredContent(db,targetId){
  // The existing account deletion helper removes D1 rows, not every R2 object.
  // Never imply a complete self-service deletion when media could remain orphaned.
  const checks=[
    `SELECT 1 v FROM community_profiles WHERE id=? AND COALESCE(avatar_key,'')<>'' LIMIT 1`,
    `SELECT 1 v FROM community_posts WHERE author_id=? AND attachments IS NOT NULL AND trim(attachments) NOT IN ('','[]') LIMIT 1`,
    `SELECT 1 v FROM community_chat_messages WHERE author_id=? AND attachments IS NOT NULL AND trim(attachments) NOT IN ('','[]') LIMIT 1`,
    `SELECT 1 v FROM aio_list_submissions WHERE user_id=? LIMIT 1`
  ];
  for(const sql of checks){
    const row=await db.prepare(sql).bind(targetId).first()
      .catch(e=>{if(/no such table/i.test(String(e?.message||'')))return null;throw e;});
    if(row)return true;
  }
  return false;
}

async function mergedQuotaStatements(env,keeperId,removedId){
  const db=env.COMMUNITY_DB,now=Date.now();
  const [a,b]=await Promise.all([monthlyStatus(env,keeperId,now),monthlyStatus(env,removedId,now)]);
  const group=await db.prepare(`SELECT mine.group_id AS gid,
    (SELECT group_id FROM aio_multikonta_quota_members_v2 WHERE user_id=?) AS other_gid
    FROM aio_multikonta_quota_members_v2 mine WHERE mine.user_id=? LIMIT 1`)
    .bind(removedId,keeperId).first()
    .catch(e=>{if(/no such table/i.test(String(e?.message||'')))return null;throw e;});
  if(group?.gid&&group.gid===group.other_gid){return [];}
  // Do not split an existing quota group into independent, reusable allowances.
  if(group?.other_gid&&group.other_gid!==group.gid)
    throw bad(409,'Rozliczenie pobrań wymaga indywidualnego rozpatrzenia. Wyślij odwołanie.');
  const used=Math.min(3,Math.max(0,Number(a.free_used)||0)+Math.max(0,Number(b.free_used)||0));
  const cur=[a.free_resets_at,b.free_resets_at].map(v=>v?Date.parse(v):0).filter(v=>Number.isFinite(v));
  const newReset=used===3?Math.max(nextCalendarMonth(now),...cur):0;
  const stamp=new Date(now).toISOString();
  const startMs=now;
  if(group?.gid){
    // Existing confirmed group survives; adding deleted account's unshared quota.
    return [db.prepare(`UPDATE aio_multikonta_quota_groups_v2 SET used=?,
      started_ms=CASE WHEN started_ms=0 THEN ? ELSE started_ms END,
      third_ms=CASE WHEN ?=3 AND third_ms=0 THEN ? ELSE third_ms END,
      resets_ms=CASE WHEN ?=3 THEN MAX(resets_ms,?) ELSE resets_ms END
      WHERE group_id=?`).bind(used,startMs,used,now,used,newReset,group.gid)];
  }
  return [db.prepare(`INSERT INTO aio_access_monthly_cycles
    (user_id,started_ms,used,third_ms,resets_ms,source,updated_at)
    VALUES(?,?,?,?,?,'self_resolve',?)
    ON CONFLICT(user_id) DO UPDATE SET
      used=MAX(aio_access_monthly_cycles.used,excluded.used),
      started_ms=CASE WHEN aio_access_monthly_cycles.started_ms=0 THEN excluded.started_ms ELSE aio_access_monthly_cycles.started_ms END,
      third_ms=CASE WHEN excluded.used=3 THEN MAX(aio_access_monthly_cycles.third_ms,excluded.third_ms) ELSE aio_access_monthly_cycles.third_ms END,
      resets_ms=MAX(aio_access_monthly_cycles.resets_ms,excluded.resets_ms),
      source='self_resolve',updated_at=excluded.updated_at`)
    .bind(keeperId,startMs,used,used===3?now:0,newReset,stamp)];
}
async function maybeReleaseStrict(env,selfId){
  const db=env.COMMUNITY_DB;
  const protectedReview=await db.prepare(`SELECT 1 v FROM aio_related_account_review_v1
    WHERE user_id=? AND decision='pending' LIMIT 1`).bind(selfId).first()
    .catch(e=>{if(/no such table/i.test(String(e?.message||'')))return null;throw e;});
  if(protectedReview)return false;
  if(!await strictGlobalHold(env,selfId))return false;
  try{await releaseStrictV4(env,selfId);return true;}
  catch(e){console.warn('[AIO self resolve] manual review still needed:',String(e?.message||'restricted').slice(0,80));return false;}
}
export async function onRequestGet({request,env}){
  try{
    const self=await findSelf(env,request);
    if(!self)return reply({ok:true,eligible:false,message:'Zaloguj się na zablokowane konto, aby wyświetlić informacje.'});
    const kind=await reviewKind(env,self);
    if(kind==='none')return reply({ok:true,eligible:false,released:true,message:'Brak aktywnej blokady konta.'});
    if(kind!=='related')return reply({ok:true,eligible:true,related:false,reason:'Blokada administracyjna lub inny powód bezpieczeństwa. Skorzystaj z odwołania.',accounts:[]});
    const peers=await confirmedPeers(env,self);
    return reply({ok:true,eligible:true,related:true,
      reason:'Dostęp wstrzymano z powodu wykrycia powiązanych kont.',
      keeper:{id:self.id,name:fmt(self.display_name)},accounts:peers,
      note:peers.length?'Możesz zachować bieżące konto i usunąć wybrane konta dodatkowe.':'Nie wszystkie powiązania pozwalają bezpiecznie wyświetlić nazwy kont. Możesz wysłać odwołanie.'});
  }catch(e){console.error('[AIO self resolve GET]',String(e?.message||e).slice(0,100));return reply({ok:false,error:'Nie udało się odczytać statusu. Spróbuj ponownie.'},500);}
}
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return reply({ok:false,error:'Niedozwolone źródło żądania.'},403);
  if(!String(request.headers.get('Content-Type')||'').toLowerCase().includes('application/json'))
    return reply({ok:false,error:'Wymagane dane JSON.'},415);
  try{
    const self=await findSelf(env,request);
    if(!self)return reply({ok:false,error:'Zaloguj się ponownie na zablokowane konto.'},401);
    if(await reviewKind(env,self)!=='related')return reply({ok:false,error:'Ta blokada wymaga rozpatrzenia przez właściciela.'},403);
    const body=await request.json().catch(()=>({}));
    const id=String(body.user_id||''),name=String(body.account_name||''),password=String(body.password||'');
    if(body.action!=='delete'||!VALID_ID.test(id)||id===self.id||name.length>80||password.length<1||password.length>512||body.confirm!=='USUN KONTO')
      return reply({ok:false,error:'Nieprawidłowe potwierdzenie operacji.'},400);
    const peers=await confirmedPeers(env,self);
    if(!peers.some(p=>p.id===id&&p.name===name))return reply({ok:false,error:'Nie można wykonać operacji na tym koncie.'},403);
    const db=env.COMMUNITY_DB;
    await limitAttempt(db,self.id);
    const target=await db.prepare(`SELECT p.id,p.display_name,p.role,a.email,a.password_hash,a.password_salt,a.password_iterations
      FROM community_profiles p JOIN community_auth a ON a.user_id=p.id WHERE p.id=? LIMIT 1`).bind(id).first();
    if(!target||target.role!=='user'||target.display_name!==name||await getOwnerId(env)===id)
      return reply({ok:false,error:'Nie można wykonać operacji na tym koncie.'},403);
    const computed=await hashPassword(password,target.password_salt,Number(target.password_iterations||100000));
    if(!safeEqual(computed.hash,target.password_hash))return reply({ok:false,error:'Nie udało się potwierdzić usunięcia konta.'},403);
    if(await isPaidOrProtected(db,id))return reply({ok:false,error:'Konto ma aktywne uprawnienia lub rozpatrywane zgłoszenie. Skorzystaj z odwołania.'},409);
    if(await hasExternallyStoredContent(db,id))return reply({ok:false,error:'Konto zawiera materiały lub pliki wymagające bezpiecznego usunięcia przez administrację. Wyślij odwołanie.'},409);
    const quota=await mergedQuotaStatements(env,self.id,id);
    // Transactional recheck: password/email/role must still be unchanged.
    const guard=db.prepare(`SELECT CASE WHEN EXISTS(
      SELECT 1 FROM community_profiles p JOIN community_auth a ON a.user_id=p.id
      WHERE p.id=? AND p.display_name=? AND p.role='user' AND a.email=? AND a.password_hash=?
    ) THEN 1 ELSE json_extract('AIO_SELF_RESOLVE_DENIED','$') END AS authorized`)
      .bind(id,name,target.email,target.password_hash);
    const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results||[];
    const existing=new Set(tables.map(t=>t.name));
    const cleanup=[...quota];
    if(existing.has('aio_access_monthly_cycles'))cleanup.push(db.prepare('DELETE FROM aio_access_monthly_cycles WHERE user_id=?').bind(id));
    await deleteAccountSafely(env,id,{guardStatement:guard,preDeleteStatements:cleanup});
    // Keep a non-identifying audit trail. Never touch another admin/security ban.
    await moderationLog(env,null,{targetType:'user',targetId:self.id,action:'self_resolve_related_account_removed',
      reason:'Samodzielne uporządkowanie kont przez użytkownika.',metadata:{keeper_id:self.id,removed_account_id:id}})
      .catch(()=>{});
    const released=await maybeReleaseStrict(env,self.id);
    return reply({ok:true,deleted:true,released,
      message:released?'Usunięto konto dodatkowe i zakończono odpowiednią blokadę powiązań. Zaloguj się ponownie.':'Konto dodatkowe zostało usunięte. Pozostałe ograniczenia mogą wymagać rozpatrzenia przez właściciela.'});
  }catch(e){
    console.error('[AIO self resolve POST]',String(e?.status||'error').slice(0,30));
    const status=[400,401,403,409,415,429].includes(e?.status)?e.status:500;
    return reply({ok:false,error:status===500?'Nie potwierdzono usunięcia. Żadne ponowne próby nie powinny być wykonywane bez sprawdzenia historii konta.':e.message},status);
  }
}
