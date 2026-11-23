/* AIO Owner Unified Access V1 (2026-11-17)
 * Owner-only single view of known account access restrictions + one controlled release.
 * Do not interpret last observed IP as the live request IP. Refuse shared /64, foreign
 * active claims, and global network bans instead of silently weakening other accounts.
 */
import {requireAdmin,getOwnerId,sha256,moderationLog,clientIp} from '../_community.js';
import {ensureIpPolicy} from '../_aio_ip_one_account_v7.js';
import {ensureStrictV4,networkIdentity} from '../_aio_strict_ip_v4.js';
import {ensureEmailBlockTable,emailHash} from '../_aio_email_blocks.js';
import {ensureV6} from '../_aio_security_v6.js';
import {ensureSecurityJournal} from '../_aio_security_journal.js';
import {ensureMultikontaGuard} from '../_aio_multikonta_guard_v2.js';
import {emailVerificationStatus} from '../_aio_email_verification.js';

const HEAD={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEAD});
const bad=(status,message)=>Object.assign(new Error(message),{status});
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IPS=50,MAX_PEERS=501;
const isActiveDate=value=>Boolean(value&&Number.isFinite(Date.parse(value))&&Date.parse(value)>Date.now());
const isActiveIpBlock=row=>Boolean(row?.active&&(row.permanent===1||row.expires_at===null||isActiveDate(row.expires_at)));
const err=e=>reply({ok:false,error:[400,401,403,404,409,415].includes(e?.status)?e.message:'Nie można zweryfikować wszystkich rejestrów. Niczego nie odblokowano.'},[400,401,403,404,409,415].includes(e?.status)?e.status:503);
const sameOrigin=r=>r.headers.get('origin')===new URL(r.url).origin&&r.headers.get('sec-fetch-site')!=='cross-site';
const now=()=>new Date().toISOString();
const choose=(x,y)=>Number(x||0)+Number(y||0);

async function setup(env){
  if(!env.COMMUNITY_DB)throw bad(503,'Brak bazy D1.');
  await Promise.all([ensureIpPolicy(env),ensureStrictV4(env),ensureEmailBlockTable(env),ensureV6(env),ensureSecurityJournal(env),ensureMultikontaGuard(env)]);
}
async function ownerAccount(env,request,id){
  const s=await requireAdmin(request,env,true),owner=await getOwnerId(env);
  if(!owner||s.user.id!==owner||s.user.role!=='admin')throw bad(403,'Dostęp wyłącznie dla właściciela.');
  if(!ID.test(String(id||'')))throw bad(400,'Wymagany pełny identyfikator konta.');
  const a=await env.COMMUNITY_DB.prepare(`SELECT p.id,p.role,p.display_name,p.banned_until,p.ban_reason,a.email
    FROM community_profiles p JOIN community_auth a ON a.user_id=p.id
    WHERE p.id=? LIMIT 1`).bind(id).first();
  if(!a)throw bad(404,'Konto nie istnieje lub nie ma poprawnego logowania i e-maila.');
  if(a.role!=='user'||a.id===owner)throw bad(403,'Nie wolno modyfikować konta właściciela ani kont uprzywilejowanych.');
  return {actor:s.user.id,owner,account:a};
}
async function value(db,sql,...args){const row=await db.prepare(sql).bind(...args).first();return Number(row?.n||0);}
async function claim(db,table,col,key){
  // Table and column are fixed internal literals, never user controlled.
  return db.prepare(`SELECT c.user_id,c.source,c.created_at,p.role
    FROM ${table} c LEFT JOIN community_profiles p ON p.id=c.user_id
    WHERE c.${col}=? LIMIT 1`).bind(key).first();
}
async function peers(db,net,owner,id){
  let rows;
  if(net.kind==='ipv4'){
    const r=await db.prepare(`SELECT DISTINCT ui.user_id,ui.ip_address,p.role,p.display_name
      FROM community_user_ips ui JOIN community_profiles p ON p.id=ui.user_id
      WHERE ui.ip_address=? AND p.role='user' AND p.id<>? AND p.id<>? LIMIT ?`)
      .bind(net.canonical,id,owner,MAX_PEERS).all();
    rows=r.results||[];
  }else{
    const prefix=net.canonical.split(':').slice(0,3).join(':')+':';
    const r=await db.prepare(`SELECT ui.user_id,ui.ip_address,p.role,p.display_name
      FROM community_user_ips ui JOIN community_profiles p ON p.id=ui.user_id
      WHERE ui.ip_address LIKE ? AND p.role='user' AND p.id<>? AND p.id<>? LIMIT ?`)
      .bind(prefix+'%',id,owner,MAX_PEERS).all();
    rows=(r.results||[]).filter(x=>networkIdentity(x.ip_address)?.canonical===net.canonical);
  }
  if(rows.length>=MAX_PEERS)throw bad(409,'Zbyt wiele przypisań w sieci, nie można bezpiecznie zwolnić automatycznie.');
  return [...new Map(rows.map(x=>[x.user_id,{id:x.user_id,name:x.display_name}])).values()];
}
async function networks(db,id,owner){
  const [rec,sessions]=await Promise.all([
    db.prepare(`SELECT ip_address,MAX(last_seen_at) AS last_seen_at
      FROM community_user_ips WHERE user_id=? GROUP BY ip_address
      ORDER BY last_seen_at DESC LIMIT ?`).bind(id,MAX_IPS+1).all(),
    db.prepare(`SELECT ip_address,last_seen_at FROM community_sessions
      WHERE user_id=? AND ip_address IS NOT NULL AND TRIM(ip_address)<>''
      AND datetime(expires_at)>datetime('now') ORDER BY last_seen_at DESC LIMIT ?`)
      .bind(id,MAX_IPS+1).all()
  ]);
  const unique=new Map();
  for(const row of [...(rec.results||[]),...(sessions.results||[])]){
    const ip=String(row.ip_address||'').trim();if(!ip)continue;
    const old=unique.get(ip);
    if(!old||String(row.last_seen_at||'')>String(old.last_seen_at||''))unique.set(ip,{ip_address:ip,last_seen_at:row.last_seen_at});
  }
  const list=[...unique.values()].sort((a,b)=>String(b.last_seen_at||'').localeCompare(String(a.last_seen_at||'')));
  if(list.length>MAX_IPS)throw bad(409,'Konto ma ponad 50 zapisanych adresów IP. Bezpieczna operacja wymaga osobnego przeglądu.');
  const result=[];
  for(const {ip_address,last_seen_at} of list){
    const net=networkIdentity(ip_address);
    if(!net)throw bad(409,'Nie można zidentyfikować jednej z sieci zapisanych dla konta.');
    const [v7,v4,ipBlock,others]=await Promise.all([
      sha256('aio-unique-ip-v7:'+ip_address),
      sha256('aio-strict-ip-v4:'+net.kind+':'+net.canonical),
      db.prepare('SELECT id,active,permanent,expires_at,target_user_id FROM community_ip_blocks WHERE ip_address=? LIMIT 1').bind(ip_address).first(),
      peers(db,net,owner,id)
    ]);
    const [v7Claim,v4Claim]=await Promise.all([
      claim(db,'aio_ip_policy_claims','ip_key',v7),
      claim(db,'aio_strict_ip_claims_v4','network_key',v4)
    ]);
    const staleClaim=x=>Boolean(x&&x.user_id!==id&&!x.role&&!(x.source==='register'&&Date.now()-Date.parse(x.created_at||'')<600000));
    const foreignClaim=x=>Boolean(x&&x.user_id!==id&&!staleClaim(x));
    result.push({ip:ip_address,last_seen_at,kind:net.kind,network:net.canonical,
      v7_key:v7,v4_key:v4,other_accounts:others,
      v7_claim_owner:v7Claim?.user_id||null,v4_claim_owner:v4Claim?.user_id||null,
      v7_claim_conflict:foreignClaim(v7Claim),v4_claim_conflict:foreignClaim(v4Claim),
      v7_claim_stale:staleClaim(v7Claim),v4_claim_stale:staleClaim(v4Claim),
      ip_block_active:isActiveIpBlock(ipBlock),
      ip_block_target:ipBlock?.target_user_id||null,
      ip_block_global:isActiveIpBlock(ipBlock)&&ipBlock?.target_user_id!==id
    });
  }
  return result;
}
async function overview(env,id,owner,account){
  const db=env.COMMUNITY_DB;
  const hash=await emailHash(account.email);
  const [nets,verification,strict,v8,v7,v6,shared,paid,review,multi,emailBan]=await Promise.all([
    networks(db,id,owner),emailVerificationStatus(env,id),
    value(db,"SELECT COUNT(*) n FROM aio_strict_ip_holds_v4 WHERE user_id=? AND status='active'",id),
    value(db,"SELECT COUNT(*) n FROM aio_ip_policy_holds_v8 WHERE user_id=? AND status='active'",id),
    value(db,"SELECT COUNT(*) n FROM aio_ip_policy_holds WHERE user_id=? AND status='active'",id),
    value(db,"SELECT COUNT(*) n FROM aio_v6_blocks WHERE user_id=? AND status='active' AND datetime(expires_at)>datetime('now')",id),
    value(db,"SELECT COUNT(*) n FROM aio_security_shared_holds WHERE user_id=? AND status='active' AND datetime(expires_at)>datetime('now')",id),
    value(db,"SELECT COUNT(*) n FROM aio_security_paid_holds WHERE user_id=? AND status='active' AND datetime(expires_at)>datetime('now')",id),
    value(db,"SELECT COUNT(*) n FROM aio_related_account_review_v1 WHERE user_id=? AND decision='pending'",id),
    value(db,"SELECT COUNT(*) n FROM aio_multikonta_reviews_v2 WHERE user_id=? AND status='pending'",id),
    value(db,'SELECT COUNT(*) n FROM aio_owner_email_blocks WHERE email_hash=?',hash)
  ]);
  const signals={profile:isActiveDate(account.banned_until)?1:0,strict_v42:strict,ip_v8:v8,ip_v7:v7,
    blocked_ip:nets.filter(n=>n.ip_block_active).length,email_block:emailBan,security_v6:v6,
    shared_download:shared,paid_download:paid,manual_review:review,multikonta_review:multi,
    ip_claim_conflict:nets.filter(n=>n.v7_claim_conflict||n.v4_claim_conflict||n.other_accounts.length>0).length,
    email_verification:verification.required?1:0};
  const blockers=Object.entries(signals).filter(([k,v])=>v>0&&k!=='manual_review'&&k!=='multikonta_review').map(([key])=>key);
  const issues=[];
  if(!nets.length)issues.push('Brak zapisanego IP. Nie można potwierdzić dostępu dla bieżącej sieci użytkownika.');
  for(const n of nets){
    if(n.other_accounts.length)issues.push('Sieć '+n.network+' jest powiązana z '+n.other_accounts.length+' innymi aktywnymi profilami.');
    if(n.v7_claim_conflict)issues.push('Przypisanie IP V7 należy do innego identyfikatora: '+n.ip);
    if(n.v4_claim_conflict)issues.push('Przypisanie Strict V4.2 należy do innego identyfikatora: '+n.network);
    if(n.ip_block_global)issues.push('Blokada '+n.ip+' jest globalna lub dotyczy innego konta.');
  }
  if(review)issues.push('Konto ma otwarty przegląd AIO_REVIEW_V1. Nie musi to oznaczać aktywnej blokady sesji.');
  if(multi)issues.push('Konto ma otwartą kontrolę multikonta V2. Nie musi to oznaczać aktywnej blokady sesji.');
  if(verification.required)issues.push('Użytkownik musi sam potwierdzić e-mail; odblokowanie nie zastępuje weryfikacji.');
  const unsafe=nets.some(n=>n.other_accounts.length||n.v7_claim_conflict||n.v4_claim_conflict||n.ip_block_global);
  const status=issues.length?'requires_review':blockers.length?'blocked':'no_known_blocks';
  return {user:{id:account.id,name:account.display_name,email:account.email},profile_ban_until:account.banned_until||null,checked_at:now(),
    status,can_release:!unsafe,signals,blockers,issues,
    last_known_ip:nets[0]?.ip||null,networks:nets.map(n=>({
      ip:n.ip,last_seen_at:n.last_seen_at,network:n.network,kind:n.kind,
      other_accounts:n.other_accounts,ip_block_active:n.ip_block_active,
      ip_block_global:n.ip_block_global,v7_claim_owner:n.v7_claim_owner,
      v4_claim_owner:n.v4_claim_owner,v7_claim_stale:n.v7_claim_stale,v4_claim_stale:n.v4_claim_stale
    })),
    // Do not promise a live access result: the browser's current IP can differ.
    note:'Status dotyczy konta i jego ostatnio zapisanych sieci. Nie jest testem bieżącej sesji użytkownika ani zewnętrznych reguł Cloudflare.'
  };
}
function guard(db,sql,...args){return db.prepare(`SELECT CASE WHEN (${sql}) THEN 1 ELSE json_extract('AIO_UNIFIED_GUARD_DENIED','$') END AS allowed`).bind(...args);}
function releaseFor(db,account,owner,nets,hash){
  const id=account.id,time=now(),steps=[];
  // This assertion is first in an atomic D1 batch; a changed identity aborts all writes.
  steps.push(guard(db,"EXISTS (SELECT 1 FROM community_profiles p JOIN community_auth a ON a.user_id=p.id WHERE p.id=? AND p.role='user' AND lower(trim(a.email))=? AND p.id<>?)",id,account.email.trim().toLowerCase(),owner));
  for(const n of nets){
    // Recheck no new peer under the same IPv4 or IPv6 prefix inside the batch.
    if(n.kind==='ipv4')steps.push(guard(db,"NOT EXISTS (SELECT 1 FROM community_user_ips ui JOIN community_profiles p ON p.id=ui.user_id WHERE ui.ip_address=? AND p.role='user' AND p.id<>? AND p.id<>?)",n.ip,id,owner));
    else{
      const prefix=n.network.split(':').slice(0,3).join(':')+':';
      steps.push(guard(db,"NOT EXISTS (SELECT 1 FROM community_user_ips ui JOIN community_profiles p ON p.id=ui.user_id WHERE ui.ip_address LIKE ? AND p.role='user' AND p.id<>? AND p.id<>?)",prefix+'%',id,owner));
    }
    for(const [table,keycol,key] of [['aio_ip_policy_claims','ip_key',n.v7_key],['aio_strict_ip_claims_v4','network_key',n.v4_key]]){
      steps.push(guard(db,`NOT EXISTS (SELECT 1 FROM ${table} c JOIN community_profiles p ON p.id=c.user_id WHERE c.${keycol}=? AND c.user_id<>?)`,key,id));
      // Protect a registration reservation made by another request in the last 10 minutes.
      steps.push(guard(db,`NOT EXISTS (SELECT 1 FROM ${table} c LEFT JOIN community_profiles p ON p.id=c.user_id WHERE c.${keycol}=? AND c.user_id<>? AND p.id IS NULL AND c.source='register' AND datetime(c.created_at)>datetime('now','-10 minutes'))`,key,id));
    }
    steps.push(guard(db,"NOT EXISTS (SELECT 1 FROM community_ip_blocks b WHERE b.ip_address=? AND b.active=1 AND (b.permanent=1 OR b.expires_at IS NULL OR datetime(b.expires_at)>datetime('now')) AND (b.target_user_id IS NULL OR b.target_user_id<>?))",n.ip,id));
  }
  steps.push(db.prepare(`UPDATE community_profiles SET banned_until=NULL,ban_reason=NULL,
    banned_by=NULL,banned_at=NULL,updated_at=? WHERE id=? AND role='user'`).bind(time,id));
  steps.push(db.prepare("UPDATE aio_strict_ip_holds_v4 SET status='released',released_at=?,released_by=? WHERE user_id=? AND status='active'").bind(time,owner,id));
  steps.push(db.prepare("UPDATE aio_ip_policy_holds_v8 SET status='released',released_at=?,released_by=? WHERE user_id=? AND status='active'").bind(time,owner,id));
  steps.push(db.prepare("UPDATE aio_ip_policy_holds SET status='released',released_at=?,released_by=? WHERE user_id=? AND status='active'").bind(time,owner,id));
  steps.push(db.prepare("UPDATE aio_v6_blocks SET status='released',released_at=?,released_by=? WHERE user_id=? AND status='active'").bind(time,owner,id));
  steps.push(db.prepare("UPDATE aio_security_shared_holds SET status='released',released_at=?,released_by=? WHERE user_id=? AND status='active'").bind(time,owner,id));
  steps.push(db.prepare("UPDATE aio_security_paid_holds SET status='released',released_at=?,released_by=? WHERE user_id=? AND status='active'").bind(time,owner,id));
  steps.push(db.prepare("UPDATE aio_related_account_review_v1 SET decision='released' WHERE user_id=? AND decision='pending'").bind(id));
  steps.push(db.prepare("UPDATE aio_multikonta_reviews_v2 SET status='released',reviewed_at=?,reviewed_by=? WHERE user_id=? AND status='pending'").bind(time,owner,id));
  steps.push(db.prepare('DELETE FROM aio_owner_email_blocks WHERE email_hash=?').bind(hash));
  for(const n of nets){
    steps.push(db.prepare("UPDATE community_ip_blocks SET active=0,updated_at=? WHERE ip_address=? AND active=1 AND target_user_id=?").bind(time,n.ip,id));
    // Clean only self-owned or orphaned claims, never a live third-party owner.
    steps.push(db.prepare("DELETE FROM aio_ip_policy_claims WHERE ip_key=? AND (user_id=? OR NOT EXISTS (SELECT 1 FROM community_profiles p WHERE p.id=aio_ip_policy_claims.user_id))").bind(n.v7_key,id));
    steps.push(db.prepare("INSERT OR IGNORE INTO aio_ip_policy_claims(ip_key,user_id,created_at,source) VALUES(?,?,?,'owner_unified_v1')").bind(n.v7_key,id,time));
    steps.push(db.prepare("DELETE FROM aio_strict_ip_claims_v4 WHERE network_key=? AND (user_id=? OR NOT EXISTS (SELECT 1 FROM community_profiles p WHERE p.id=aio_strict_ip_claims_v4.user_id))").bind(n.v4_key,id));
    steps.push(db.prepare("INSERT OR IGNORE INTO aio_strict_ip_claims_v4(network_key,user_id,created_at,source) VALUES(?,?,?,'owner_unified_v1')").bind(n.v4_key,id,time));
  }
  return steps;
}
export async function onRequestGet({request,env}){
  try{
    const id=new URL(request.url).searchParams.get('user_id');
    const target=await ownerAccount(env,request,id);
    await setup(env);
    const status=await overview(env,target.account.id,target.owner,target.account);
    return reply({ok:true,version:'AIO_OWNER_UNIFIED_ACCESS_V1',...status});
  }catch(e){console.error('[AIO unified GET]',String(e?.message||e).slice(0,160));return err(e);}
}
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return reply({ok:false,error:'Niedozwolone pochodzenie żądania.'},403);
  if(!/application\/json/i.test(request.headers.get('content-type')||''))return reply({ok:false,error:'Wymagany JSON.'},415);
  try{
    const body=await request.json().catch(()=>null);
    if(body?.action!=='release_all'||body?.confirm!=='ODBLOKUJ')throw bad(400,'Nie potwierdzono odblokowania.');
    const target=await ownerAccount(env,request,body.user_id);
    if(String(body.email||'').trim().toLowerCase()!==String(target.account.email||'').trim().toLowerCase())throw bad(409,'Zmienił się adres e-mail konta — odśwież dane.');
    const reason=String(body.reason||'').trim().slice(0,300);
    if(reason.length<8)throw bad(400,'Podaj uzasadnienie (minimum 8 znaków).');
    await setup(env);
    const before=await overview(env,target.account.id,target.owner,target.account);
    if(!before.can_release) return reply({ok:false,needs_review:true,error:'Wykryto współdzieloną sieć, cudze przypisanie IP lub globalną blokadę. Operacja nie została wykonana.',status:before},409);
    // Reconstruct keys server-side; never trust raw keys supplied by the browser.
    const nets=await networks(env.COMMUNITY_DB,target.account.id,target.owner);
    const hash=await emailHash(target.account.email);
    const steps=releaseFor(env.COMMUNITY_DB,target.account,target.owner,nets,hash);
    await env.COMMUNITY_DB.batch(steps); // Atomic D1 transaction, with preflight guards.
    // Preserve audit trail (no rollback after successful commit on logging failure).
    try{await moderationLog(env,target.actor,{targetUserId:target.account.id,targetType:'user',targetId:target.account.id,
      action:'owner_unified_release_all_v1',reason,ip:clientIp(request),metadata:{networks:nets.length,guarded:true}});
    }catch(e){console.error('[AIO unified audit]',String(e?.message||e).slice(0,120));}
    const fresh=await env.COMMUNITY_DB.prepare(`SELECT p.id,p.role,p.display_name,p.banned_until,p.ban_reason,a.email
      FROM community_profiles p JOIN community_auth a ON a.user_id=p.id WHERE p.id=?`).bind(target.account.id).first();
    if(!fresh)throw bad(409,'Konto zniknęło podczas odblokowywania.');
    const after=await overview(env,fresh.id,target.owner,fresh);
    return reply({ok:true,version:'AIO_OWNER_UNIFIED_ACCESS_V1',released:true,
      access_restored_in_known_networks:after.status==='no_known_blocks',
      message:after.status==='no_known_blocks'?'Zwolniono wszystkie znane ograniczenia. Potwierdź dostęp w sesji użytkownika.':'Zapisano odblokowanie, ale pozostały ograniczenia wymagające wyjaśnienia.',
      before:before.signals,status:after});
  }catch(e){console.error('[AIO unified POST]',String(e?.message||e).slice(0,160));return err(e);}
}
