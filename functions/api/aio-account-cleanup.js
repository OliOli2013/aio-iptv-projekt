/* AIO Account Cleanup V1 — verified owner only; manual, one-by-one removal.
 * GET preview; POST needs exact display name and confirmation, and D1 batch guard.
 * No unattended deletion; no raw IP or email appears in responses or audit.
 */
import {requireAdmin,getOwnerId,sha256,moderationLog} from '../_community.js';
import {ensureIpPolicy} from '../_aio_ip_one_account_v7.js';
import {deleteAccountSafely} from '../_aio_delete_account_v1.js';

const HEAD={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','vary':'Cookie'};
const out=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:HEAD});
const fail=(status,message)=>Object.assign(new Error(message),{status});
const ID=/^[0-9a-f-]{36}$/i;
const DAY=86400000, COOLDOWN_DAYS=7;
const EXCLUSIONS=[
  ['aio_vip_grants','user_id',"x.status='active' AND datetime(x.expires_at)>datetime('now')"],
  ['aio_access_account_grants','user_id',"datetime(x.expires_at)>datetime('now')"],
  ['aio_access_approval_requests','user_id',"x.status='pending'"],
  ['aio_support_intents','user_id',"x.status IN ('started','reported')"],
  ['community_posts','author_id','1=1'],
  ['community_chat_messages','author_id','1=1'],
  ['community_comments','author_id','1=1'],
  ['aio_list_submissions','user_id','1=1'],
  ['aio_list_inbox','sender_id','1=1'],
  ['community_reports','reporter_id','1=1']
];
async function tables(db){
  const r=await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  return new Set((r.results||[]).map(x=>x.name));
}
function sqlFor(exists,individual){
  const required=['community_profiles','community_auth','aio_email_verifications'];
  if(required.some(x=>!exists.has(x)))throw fail(503,'Niepełny schemat kont i weryfikacji e-mail.');
  const deny=EXCLUSIONS.filter(x=>exists.has(x[0])).map(([table,column,predicate])=>
    `AND NOT EXISTS (SELECT 1 FROM ${table} x WHERE x.${column}=p.id AND ${predicate})`).join('\n');
  return `SELECT p.id,p.display_name,p.created_at,v.sent_at
    FROM community_profiles p
    JOIN community_auth a ON a.user_id=p.id
    JOIN aio_email_verifications v ON v.user_id=p.id
    WHERE p.role='user' AND p.id<>? AND v.verified_at IS NULL
      AND COALESCE(p.avatar_key,'')=''
      AND v.sent_at IS NOT NULL
      AND datetime(p.created_at)<datetime('now','-7 days')
      AND datetime(v.sent_at)<datetime('now','-7 days')
      ${deny} ${individual?'AND p.id=?':''}`;
}
async function getCandidates(db,owner,exists){
  return (await db.prepare(sqlFor(exists,false)+" ORDER BY p.created_at ASC LIMIT 200").bind(owner).all()).results||[];
}
async function keysForUser(db,userId,exists){
  const keys=new Set();
  if(exists.has('aio_ip_policy_claims')){
    const r=await db.prepare('SELECT ip_key FROM aio_ip_policy_claims WHERE user_id=?').bind(userId).all();
    for(const x of r.results||[])if(/^[a-f0-9]{64}$/i.test(x.ip_key))keys.add(x.ip_key);
  }
  if(exists.has('community_user_ips')){
    // Bound to recently observed networks. Never put raw IP into the cooldown table.
    const r=await db.prepare(`SELECT DISTINCT ip_address FROM community_user_ips
      WHERE user_id=? AND datetime(last_seen_at)>=datetime('now','-30 days')
      ORDER BY ip_address LIMIT 100`).bind(userId).all();
    for(const x of r.results||[]){
      const ip=String(x.ip_address||'').trim();
      if(ip && ip.length<=45)keys.add(await sha256('aio-unique-ip-v7:'+ip));
    }
  }
  return [...keys];
}
async function guardAndDelete(env,userId,owner,exists,typedName){
  const db=env.COMMUNITY_DB;
  const candidate=await db.prepare(sqlFor(exists,true)+' LIMIT 1').bind(owner,userId).first();
  if(!candidate)throw fail(409,'Konto nie spełnia już warunków usunięcia. Odśwież listę.');
  const ipKeys=await keysForUser(db,userId,exists);
  const created=new Date().toISOString(),expires=new Date(Date.now()+COOLDOWN_DAYS*DAY).toISOString();
  // Fail-closed SQL assertion runs as FIRST statement in the SAME D1 transaction
  // as cooldown inserts and deletion. If email became verified, batch aborts.
  const guard=db.prepare(`SELECT CASE WHEN EXISTS(${sqlFor(exists,true)} AND p.display_name=?)
    THEN 1 ELSE json_extract('AIO_CLEANUP_GUARD_DENIED','$') END AS authorized`).bind(owner,userId,typedName);
  const cooldown=ipKeys.map(key=>db.prepare(`INSERT INTO aio_ip_policy_cleanup_cooldowns_v1
    (ip_key,created_at,expires_at,reason) VALUES(?,?,?,'unverified_account_deleted')
    ON CONFLICT(ip_key) DO UPDATE SET
    expires_at=CASE WHEN excluded.expires_at>expires_at THEN excluded.expires_at ELSE expires_at END`)
    .bind(key,created,expires));
  await deleteAccountSafely(env,userId,{guardStatement:guard,preDeleteStatements:cooldown});
  return {name:candidate.display_name,network_cooldowns:ipKeys.length};
}
function sameOrigin(request){
  const origin=request.headers.get('Origin');
  return (!origin||origin===new URL(request.url).origin)&&request.headers.get('Sec-Fetch-Site')!=='cross-site';
}
export async function onRequestGet({request,env}){
  try{
    const session=await requireAdmin(request,env,true),owner=await getOwnerId(env);
    if(!owner||session.user.id!==owner)throw fail(403,'Brak uprawnień właściciela.');
    await ensureIpPolicy(env);
    const db=env.COMMUNITY_DB,exists=await tables(db);
    const candidates=await getCandidates(db,owner,exists);
    return out({ok:true,automatic:false,count:candidates.length,candidates,
      rules:'Co najmniej 7 dni od rejestracji oraz ostatniej wysyłki; bez aktywnych VIP/7D, zgłoszeń i własnych treści.'});
  }catch(e){return out({ok:false,error:e.status&&e.status<500?e.message:'Nie można odczytać listy kont.'},e.status||500);}
}
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return out({ok:false,error:'Niedozwolone źródło żądania.'},403);
  if(!(request.headers.get('content-type')||'').toLowerCase().includes('application/json'))return out({ok:false,error:'Wymagany JSON.'},415);
  try{
    const session=await requireAdmin(request,env,true),owner=await getOwnerId(env);
    if(!owner||session.user.id!==owner)throw fail(403,'Brak uprawnień właściciela.');
    const body=await request.json().catch(()=>null);
    if(!body||body.action!=='delete' ||body.confirm!=='USUN KONTO' ||!ID.test(body.user_id||''))
      throw fail(400,'Wymagane ID i potwierdzenie usunięcia jednego konta.');
    const typed=String(body.display_name||'');
    if(!typed||typed.length>100)throw fail(400,'Wpisz dokładną nazwę konta.');
    await ensureIpPolicy(env);
    const db=env.COMMUNITY_DB,exists=await tables(db);
    const candidate=await db.prepare(sqlFor(exists,true)+' LIMIT 1').bind(owner,body.user_id).first();
    if(!candidate||candidate.display_name!==typed)throw fail(409,'Konto nie kwalifikuje się do czyszczenia lub nazwa jest inna.');
    const result=await guardAndDelete(env,body.user_id,owner,exists,typed);
    try{await moderationLog(env,session.user.id,{targetUserId:null,targetType:'user',targetId:body.user_id,
      action:'cleanup_unverified_email',reason:'Ręczne usunięcie po 7 dniach, potwierdzone przez właściciela.',
      metadata:{cooldowns:result.network_cooldowns,manual:true}});
    }catch(e){console.error('[AIO cleanup audit]',String(e?.message||e).slice(0,120));}
    return out({ok:true,deleted:true,name:result.name,cooldowns:result.network_cooldowns,
      message:'Konto usunięte; sieci używane ostatnio objęto 7-dniowym okresem ochronnym.'});
  }catch(e){const status=[400,401,403,409,415].includes(e?.status)?e.status:500;
    if(status===500)console.error('[AIO account cleanup]',String(e?.message||e).slice(0,180));
    return out({ok:false,error:status===500?'Operacja nie została potwierdzona. Sprawdź bazę i dziennik serwera.':e.message},status);
  }
}
