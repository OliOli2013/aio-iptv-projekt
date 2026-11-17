/* AIO TunerHub — one-time verified-owner cleanup, 2026-11-17.
 * NEVER use display_name as identity. Owner is permanently protected by fixed ID AND login email.
 * GET: exact preview, POST: confirmed preview hash, atomic per-account deletion.
 * Remove this route from the repository immediately after the operation.
 */
import {requireAdmin, getOwnerId, moderationLog} from '../_community.js';
import {deleteAccountSafely} from '../_aio_delete_account_v1.js';

const OWNER_ID='0af87cfc-d3eb-483f-811f-9d93f45532f8';
const OWNER_EMAIL='pawelzarzycki61@gmail.com';
const TEST_EMAIL='msisystem@t.pl';
const EMPTY_ID='dfa550cb-eba0-4736-9c68-5aeff3e4321e';
const CONFIRM='USUN WSKAZANE KONTA';
const H={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','vary':'Cookie'};
const result=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:H});
const norm=s=>String(s??'').trim().toLowerCase();
const problem=(s,m)=>Object.assign(new Error(m),{status:s});
const clean=str=>String(str??'').slice(0,180);

async function authorize(request,env){
  if(!env.COMMUNITY_DB)throw problem(503,'Brak podłączenia D1.');
  const session=await requireAdmin(request,env,true);
  if(session?.user?.id!==OWNER_ID || (await getOwnerId(env))!==OWNER_ID)throw problem(403,'Tylko konto właściciela.');
  const owner=await env.COMMUNITY_DB.prepare(`SELECT p.id,p.role,p.email AS pe,a.email AS ae
    FROM community_profiles p JOIN community_auth a ON a.user_id=p.id WHERE p.id=? LIMIT 1`).bind(OWNER_ID).first();
  if(owner?.role!=='admin'||norm(owner.ae)!==OWNER_EMAIL||
     (owner.pe && norm(owner.pe)!==OWNER_EMAIL))throw problem(409,'Konto właściciela nie odpowiada oczekiwanym danym. Operacja wstrzymana.');
  return session;
}
function sameOrigin(req){
  const origin=req.headers.get('Origin');
  return (!origin||origin===new URL(req.url).origin)&&req.headers.get('Sec-Fetch-Site')!=='cross-site';
}
async function catalog(db){
  const r=await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  return new Set((r.results||[]).map(x=>x.name));
}

// Owner-provided snapshot criteria: old truly empty profile; every profile using test mailbox;
// duplicate FULL e-mail across distinct IDs; every non-owner account on a shared exact IP.
async function candidates(db){
  const reasons=new Map();
  function mark(id,label){if(id===OWNER_ID)return;if(!reasons.has(id))reasons.set(id,new Set());reasons.get(id).add(label);}
  const emails=await db.prepare(`WITH mail AS (
    SELECT id AS user_id,LOWER(TRIM(email)) AS email FROM community_profiles
      WHERE TRIM(COALESCE(email,''))<>''
    UNION ALL
    SELECT user_id,LOWER(TRIM(email)) FROM community_auth
      WHERE TRIM(COALESCE(email,''))<>''
  ), dup AS (
    SELECT email FROM mail GROUP BY email HAVING COUNT(DISTINCT user_id)>1
  ) SELECT DISTINCT m.user_id FROM mail m JOIN dup d ON d.email=m.email`).all();
  for(const x of emails.results||[])mark(x.user_id,'ten sam pełny e-mail u różnych ID');

  const test=await db.prepare(`SELECT p.id FROM community_profiles p
    LEFT JOIN community_auth a ON a.user_id=p.id
    WHERE LOWER(TRIM(COALESCE(p.email,'')))=? OR LOWER(TRIM(COALESCE(a.email,'')))=?`)
    .bind(TEST_EMAIL,TEST_EMAIL).all();
  for(const x of test.results||[])mark(x.id,'konto testowe: '+TEST_EMAIL);

  const ips=await db.prepare(`WITH live_ip AS (
    SELECT DISTINCT u.user_id,TRIM(u.ip_address) AS ip
    FROM community_user_ips u JOIN community_profiles p ON p.id=u.user_id
    WHERE TRIM(COALESCE(u.ip_address,''))<>''
  ), dup_ip AS (
    SELECT ip FROM live_ip GROUP BY ip HAVING COUNT(DISTINCT user_id)>1
  ) SELECT x.user_id,x.ip FROM live_ip x JOIN dup_ip d ON d.ip=x.ip
    ORDER BY x.ip,x.user_id LIMIT 5000`).all();
  const ipNames=new Map();
  for(const x of ips.results||[]){
    mark(x.user_id,'wspólny dokładny IP');
    if(!ipNames.has(x.user_id))ipNames.set(x.user_id,[]);
    ipNames.get(x.user_id).push(x.ip);
  }
  if((ips.results||[]).length>=5000)throw problem(409,'Przekroczono limit wyników IP; nie uruchamiaj masowego usuwania.');

  // One specifically observed empty historical profile, not a name-based sweep.
  const empty=await db.prepare(`SELECT p.id FROM community_profiles p WHERE p.id=? AND p.role='user'
    AND TRIM(COALESCE(p.email,''))='' AND p.banned_until IS NULL
    AND COALESCE(p.trusted,0)=0
    AND (p.updated_at IS NULL OR datetime(p.updated_at)<=datetime(p.created_at,'+1 minute'))
    AND TRIM(COALESCE(p.avatar_key,'')||COALESCE(p.avatar_url,'')||COALESCE(p.bio,'')||
      COALESCE(p.tuner_model,'')||COALESCE(p.system_name,'')||
      COALESCE(p.system_version,'')||COALESCE(p.python_version,''))=''
    AND NOT EXISTS (SELECT 1 FROM community_auth a WHERE a.user_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM aio_email_verifications v WHERE v.user_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM community_sessions s WHERE s.user_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM community_user_ips u WHERE u.user_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM aio_access_events t WHERE t.user_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM aio_security_journal t WHERE t.user_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM community_posts t WHERE t.author_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM community_comments t WHERE t.author_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM community_chat_messages t WHERE t.author_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM community_reactions t WHERE t.user_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM community_subscriptions t WHERE t.user_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM aio_list_submissions t WHERE t.user_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM aio_post_link_handoffs t WHERE t.user_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM aio_support_intents t WHERE t.user_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM community_password_reset_requests t WHERE t.user_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM aio_vip_grants t WHERE t.user_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM aio_access_account_grants t WHERE t.user_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM community_moderation_log t WHERE t.target_user_id=p.id OR t.actor_id=p.id OR t.target_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM community_reports t WHERE t.reporter_id=p.id OR t.reviewed_by=p.id)
    AND NOT EXISTS (SELECT 1 FROM aio_owner_messages t WHERE t.sender_user_id=p.id OR t.recipient_user_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM aio_ip_policy_claims t WHERE t.user_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM aio_strict_ip_claims_v4 t WHERE t.user_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM aio_strict_ip_holds_v4 t WHERE t.user_id=p.id OR t.primary_user_id=p.id)
    AND NOT EXISTS (SELECT 1 FROM aio_security_shared_holds t WHERE t.user_id=p.id OR t.peer_user_id=p.id)
  `).bind(EMPTY_ID).all();
  for(const x of empty.results||[])mark(x.id,'pusty profil po szczegółowym audycie');

  if(reasons.size>100)throw problem(409,'Ponad 100 kandydatów. Bezpieczeństwo wymaga osobnej analizy; nic nie usunięto.');
  if(!reasons.size)return [];
  const rows=await db.prepare(`SELECT p.id,p.role,p.display_name,p.email AS email_profilu,
      a.email AS email_logowania,p.created_at,p.updated_at,p.banned_until,
      (SELECT COUNT(*) FROM community_posts t WHERE t.author_id=p.id) AS posty,
      (SELECT COUNT(*) FROM community_comments t WHERE t.author_id=p.id) AS komentarze,
      (SELECT COUNT(*) FROM community_sessions t WHERE t.user_id=p.id) AS sesje,
      (SELECT COUNT(*) FROM aio_vip_grants t WHERE t.user_id=p.id) AS historia_vip
    FROM community_profiles p LEFT JOIN community_auth a ON a.user_id=p.id
    WHERE p.role='user' AND p.id<>? ORDER BY p.created_at`).bind(OWNER_ID).all();
  const selected=[];
  for(const x of rows.results||[]){
    if(!reasons.has(x.id))continue;
    selected.push({...x,powody:[...reasons.get(x.id)].sort(),wspolne_ip:(ipNames.get(x.id)||[]).slice(0,30)});
  }
  if(selected.length!==reasons.size)throw problem(409,'Co najmniej jeden kandydat ma inną rolę albo już nie istnieje. Operacja wstrzymana.');
  return selected;
}
async function digest(items){
  const encoded=new TextEncoder().encode(JSON.stringify(items.map(x=>[
    x.id,x.role,x.email_profilu,x.email_logowania,x.updated_at,x.powody,x.wspolne_ip
  ])));
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',encoded));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
async function remove(env,x,tables){
  const db=env.COMMUNITY_DB;
  // Per-account fail-closed guard runs atomically with the deletion batch.
  const guard=db.prepare(`SELECT CASE WHEN EXISTS (
    SELECT 1 FROM community_profiles p LEFT JOIN community_auth a ON a.user_id=p.id
    WHERE p.id=? AND p.role='user' AND p.id<>?
      AND LOWER(TRIM(COALESCE(p.email,'')))=?
      AND LOWER(TRIM(COALESCE(a.email,'')))=?
      AND COALESCE(p.updated_at,'')=?
      AND EXISTS(SELECT 1 FROM community_profiles own JOIN community_auth oa ON oa.user_id=own.id
        WHERE own.id=? AND own.role='admin' AND LOWER(TRIM(oa.email))=?)
  ) THEN 1 ELSE json_extract('AIO_GUARD_BLOCK','$') END AS guarded`)
    .bind(x.id,OWNER_ID,norm(x.email_profilu),norm(x.email_logowania),
      String(x.updated_at||''),OWNER_ID,OWNER_EMAIL);
  const pre=[];
  // Strict V4 network reservations lack FKs and are absent from legacy helper.
  if(tables.has('aio_strict_ip_claims_v4'))pre.push(db.prepare('DELETE FROM aio_strict_ip_claims_v4 WHERE user_id=?').bind(x.id));
  await deleteAccountSafely(env,x.id,{guardStatement:guard,preDeleteStatements:pre});
}
function errorResponse(e){
  const s=[400,401,403,409,415,503].includes(e.status)?e.status:500;
  if(s===500)console.error('[AIO one-time cleanup]',clean(e?.message));
  return result({ok:false,error:s===500?'Nie można potwierdzić zakończenia operacji. Sprawdź wynik i ponów podgląd.':e.message},s);
}
export async function onRequestGet({request,env}){
  try{
    await authorize(request,env);
    const items=await candidates(env.COMMUNITY_DB);
    return result({ok:true,preview:true,owner_email:OWNER_EMAIL,owner_id:OWNER_ID,
      candidate_count:items.length,hash:await digest(items),items});
  }catch(e){return errorResponse(e);}
}
export async function onRequestPost({request,env}){
  if(!sameOrigin(request))return result({ok:false,error:'Niedozwolone źródło żądania.'},403);
  if(!(request.headers.get('content-type')||'').includes('application/json'))return result({ok:false,error:'Wymagany JSON.'},415);
  try{
    const owner=await authorize(request,env);
    const body=await request.json().catch(()=>({}));
    if(body.action!=='delete' || body.confirm!==CONFIRM || !/^[a-f0-9]{64}$/.test(String(body.hash||'')))
      throw problem(400,'Brak potwierdzenia i poprawnego identyfikatora podglądu.');
    const items=await candidates(env.COMMUNITY_DB);
    if(!items.length)throw problem(409,'Brak kont do usunięcia.');
    if(await digest(items)!==body.hash)throw problem(409,'Lista kont uległa zmianie. Otwórz nowy podgląd; nic nie usunięto.');
    const tables=await catalog(env.COMMUNITY_DB);
    const deleted=[];
    for(const x of items){
      try{
        await remove(env,x,tables);
        deleted.push({id:x.id,powody:x.powody});
        try{await moderationLog(env,owner.user.id,{targetUserId:null,targetType:'user',targetId:x.id,
          action:'owner_one_time_cleanup_20261117',reason:'Jednorazowe usunięcie zatwierdzone przez właściciela.',
          metadata:{reason_classes:x.powody,one_time:true}});}catch(e){
          console.error('[AIO cleanup audit]',clean(e?.message));
        }
      }catch(e){
        console.error('[AIO cleanup stopped]',x.id,clean(e?.message));
        return result({ok:false,partial:true,deleted_count:deleted.length,deleted,
          failed_id:x.id,error:'Przerwano. Część kont została usunięta; otwórz nowy podgląd, by zobaczyć pozostałe. Szczegóły błędu w logach Cloudflare.'},500);
      }
    }
    return result({ok:true,deleted_count:deleted.length,deleted,
      message:'Usunięto wskazane konta. Konto właściciela zostało zachowane.'});
  }catch(e){return errorResponse(e);}
}
