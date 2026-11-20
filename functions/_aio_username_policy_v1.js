/* AIO USERNAME PROTECTION V1 — reserved identities, unique names, legacy one-time rename. */
const DAY = 86400000;
const NOTICE_DAYS = 14;
let __aioCFReady_schemaReady = false;

export const USERNAME_POLICY_NOTICE = 'Ta nazwa użytkownika jest zastrzeżona lub zajęta. Wybierz inną nazwę.';
const RESERVED = new Set([
  'aio','aioteam','aiotunerhub','aiopanel','aiotuner','aiotunerhubofficial',
  'spolecznoscaio','spolecznoscaioteam','centrumwlasciciela',
  'pawelpawelek','pawelzarzycki','aioadministracja','administracjaaio',
  'administracja','administrator','admin','moderator','mod',
  'wlasciciel','support','helpdesk','pomoc techniczna','pomoctechniczna',
  'obsluga','obslugaaio','oficjalnekonto','oficjalnyaio','officialaio',
  'aiosupport','aiomoderator','aioadmin','aiowlasciciel','aiopomoc',
  'adminaio','moderatoraio','supportaio','wlascicielaio',
  'aiocentrum','aiocentrumwlasciciela'
].map(s=>s.replace(/\s/g,'')));

export function usernameKey(raw){
  const similar = {'а':'a','А':'a','е':'e','Е':'e','о':'o','О':'o','р':'p','Р':'p',
    'с':'c','С':'c','у':'y','У':'y','х':'x','Х':'x','і':'i','І':'i',
    'ο':'o','Ο':'o','α':'a','Α':'a','ι':'i','Ι':'i',
    'ⅼ':'l','Ⅰ':'i'};
  return String(raw??'').normalize('NFKC').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .split('').map(c=>similar[c]||c).join('')
    .toLocaleLowerCase('pl-PL').replace(/ł/g,'l')
    .replace(/[^a-z0-9]/g,'');
}
export function reservedUsername(name){
  const key=usernameKey(name);
  if(!key)return true;
  if(RESERVED.has(key))return true;
  if(/^(?:aio|admin|administrator|moderator|support|helpdesk|wlasciciel|obsluga|oficjalny|official|aioteam|aiotunerhub|pawelpawelek|pawelzarzycki)\d{0,4}$/.test(key))return true;
  if(/^(?:aio|aioteam|aiotunerhub)(?:admin|administrator|moderator|support|helpdesk|wlasciciel|obsluga|official|oficjalny|team|panel|tunerhub)(?:\d{0,4})$/.test(key))return true;
  if(/^(?:admin|administrator|moderator|support|helpdesk|wlasciciel|obsluga|official|oficjalny)(?:aio|aioteam|aiotunerhub)(?:\d{0,4})$/.test(key))return true;
  return false;
}
export function validateUsernameSyntax(raw){
  const value=String(raw??'').normalize('NFKC').trim().replace(/\s+/g,' ');
  if(value.length<2||value.length>60) return {ok:false,error:'Nazwa użytkownika musi mieć od 2 do 60 znaków.'};
  if(!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(value))
    return {ok:false,error:'Nazwa może zawierać litery, cyfry, spacje, kropkę, myślnik i podkreślenie.'};
  if(!usernameKey(value))return {ok:false,error:'Nieprawidłowa nazwa użytkownika.'};
  return {ok:true,name:value,key:usernameKey(value)};
}
export async function ensureUsernamePolicy(env){
  // AIO_CF_PROMISE_LOGIN_FIX_V1_20261119: request-bound D1 Promise is NEVER cached between HTTP requests.
  if (__aioCFReady_schemaReady) return true;
  let schemaReady = null;

  if(!schemaReady) schemaReady=(async()=>{
    await env.COMMUNITY_DB.batch([
      env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_username_rename_v1 (
        user_id TEXT PRIMARY KEY,
        original_name TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        deadline_at TEXT NOT NULL,
        grace_used_at TEXT,
        completed_at TEXT,
        new_name TEXT,
        FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE)`),
      env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_username_claims_v1 (
        name_key TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE)`),
      // AIO_USERNAME_POLICY_V1_4_20261120: one selection per normalized legacy-name collision.
      env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_username_duplicate_login_choice_v1 (
        name_key TEXT PRIMARY KEY,
        selected_user_id TEXT NOT NULL,
        selected_at TEXT NOT NULL,
        FOREIGN KEY(selected_user_id) REFERENCES community_profiles(id) ON DELETE CASCADE)`),
      env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_username_review_completed ON aio_username_rename_v1(completed_at,deadline_at)'),
      env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_display_name_nocase ON community_profiles(display_name COLLATE NOCASE)')
    ]);
  })().catch(e=>{schemaReady=null;throw e;});
  await schemaReady;
  __aioCFReady_schemaReady = true; // AIO_CF_PROMISE_LOGIN_FIX_V1_20261119
  return true;
}
// All historical display names count. A claimed name cannot be reassigned even during parallel writes.
export async function checkUsername(env,raw,excludeUserId='',isOwner=false){
  await ensureUsernamePolicy(env);
  const parsed=validateUsernameSyntax(raw);
  if(!parsed.ok)return parsed;
  if(!isOwner && reservedUsername(parsed.name))return {ok:false,code:'reserved',error:'Ta nazwa jest zastrzeżona dla administracji AIO TunerHub.'};
  const all=await env.COMMUNITY_DB.prepare('SELECT id,display_name FROM community_profiles').all();
  if((all.results||[]).some(x=>String(x.id)!==String(excludeUserId) && usernameKey(x.display_name)===parsed.key))
    return {ok:false,code:'taken',error:'Ten login jest już zajęty. Wybierz inną nazwę.'};
  const claim=await env.COMMUNITY_DB.prepare('SELECT c.user_id FROM aio_username_claims_v1 c JOIN community_profiles p ON p.id=c.user_id WHERE c.name_key=? AND c.user_id<>? LIMIT 1').bind(parsed.key,String(excludeUserId||'')).first();
  if(claim)return {ok:false,code:'taken',error:'Ten login jest już zajęty. Wybierz inną nazwę.'};
  return parsed;
}
export function claimUsernameStatement(env,userId,key){
  return env.COMMUNITY_DB.prepare(`INSERT INTO aio_username_claims_v1(name_key,user_id,created_at)
    VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET
    name_key=excluded.name_key,created_at=excluded.created_at`)
    .bind(key,userId,new Date().toISOString());
}
/** AIO_USERNAME_POLICY_V1_4_20261120
 * Existing ordinary duplicates are NOT account bans. Only the first successful
 * eligible sign-in in each legacy collision must rename. Other users keep access.
 * Persist the choice atomically; never use registration age or a previous
 * "duplicate" review as an ownership signal.
 * Banned historical profiles do not trigger an ordinary-name collision.
 */
async function reviewRow(env,id){
  return await env.COMMUNITY_DB.prepare('SELECT * FROM aio_username_rename_v1 WHERE user_id=? LIMIT 1').bind(id).first();
}
async function chosenDuplicate(env,key){
  return env.COMMUNITY_DB.prepare('SELECT selected_user_id FROM aio_username_duplicate_login_choice_v1 WHERE name_key=? LIMIT 1').bind(key).first();
}
async function eligibleNamePeers(env,key){
  const rows=await env.COMMUNITY_DB.prepare(`SELECT id,display_name,banned_until
    FROM community_profiles WHERE role='user'`).all();
  const now=Date.now();
  return (rows.results||[]).filter(p=>usernameKey(p.display_name)===key &&
    !(p.banned_until && Date.parse(p.banned_until)>now));
}
async function pickFirstSuccessfulLogin(env,key,userId,peers){
  const db=env.COMMUNITY_DB;
  let chosen=await chosenDuplicate(env,key);
  if(chosen && peers.some(p=>p.id===chosen.selected_user_id))return chosen.selected_user_id;
  const stamp=new Date().toISOString();
  if(!chosen){
    // D1 UNIQUE(name_key) makes concurrent first sign-ins deterministic.
    await db.prepare(`INSERT OR IGNORE INTO aio_username_duplicate_login_choice_v1
      (name_key,selected_user_id,selected_at) VALUES(?,?,?)`)
      .bind(key,userId,stamp).run();
  }else{
    // The previous chosen account was deleted, banned or renamed. CAS prevents
    // two later sign-ins from replacing one another's newly selected account.
    await db.prepare(`UPDATE aio_username_duplicate_login_choice_v1
      SET selected_user_id=?,selected_at=?
      WHERE name_key=? AND selected_user_id=?`)
      .bind(userId,stamp,key,chosen.selected_user_id).run();
  }
  chosen=await chosenDuplicate(env,key);
  return chosen && peers.some(p=>p.id===chosen.selected_user_id)?chosen.selected_user_id:null;
}
async function activateRenameReview(env,userId,displayName,reason,prior){
  const db=env.COMMUNITY_DB,stamp=new Date().toISOString();
  const deadline=new Date(Date.now()+NOTICE_DAYS*DAY).toISOString();
  if(!prior){
    await db.prepare(`INSERT OR IGNORE INTO aio_username_rename_v1
      (user_id,original_name,reason,created_at,deadline_at)
      VALUES(?,?,?,?,?)`).bind(userId,displayName,reason,stamp,deadline).run();
  }else if(prior.completed_at || prior.reason!==reason || prior.original_name!==displayName){
    // Keep the original review if still relevant. Reopen only on a new condition.
    await db.prepare(`UPDATE aio_username_rename_v1 SET
      original_name=?,reason=?,created_at=?,deadline_at=?,
      grace_used_at=NULL,completed_at=NULL,new_name=NULL WHERE user_id=?`)
      .bind(displayName,reason,stamp,deadline,userId).run();
  }
  return reviewRow(env,userId);
}
export async function usernameRenameReview(env,userId,displayName,role,{fullScan=false,assignOnLogin=false}={}){
  if(role==='admin')return null; // An owner/admin is never trapped by the rename gate.
  await ensureUsernamePolicy(env);
  const prior=await reviewRow(env,userId);
  if(reservedUsername(displayName)){
    return activateRenameReview(env,userId,displayName,'reserved',prior);
  }
  const key=usernameKey(displayName);
  if(!key)return null;
  // Critical V1.4 behavior: old duplicate-review rows do NOT authorize a gate.
  // No authenticated successful sign-in has chosen a rename target yet.
  let chosen=await chosenDuplicate(env,key);
  if(!assignOnLogin && (!chosen || chosen.selected_user_id!==userId))return null;
  const peers=await eligibleNamePeers(env,key);
  if(peers.length<2 || !peers.some(p=>p.id===userId))return null;
  if(assignOnLogin){
    const picked=await pickFirstSuccessfulLogin(env,key,userId,peers);
    if(picked!==userId)return null;
  }else if(!chosen || chosen.selected_user_id!==userId){
    return null;
  }
  return activateRenameReview(env,userId,displayName,'duplicate',prior);
}

export async function consumeLegacyLogin(env,userId){
  await ensureUsernamePolicy(env);
  const stamp=new Date().toISOString();
  const change=await env.COMMUNITY_DB.prepare(`UPDATE aio_username_rename_v1 SET grace_used_at=?
    WHERE user_id=? AND completed_at IS NULL AND grace_used_at IS NULL`).bind(stamp,userId).run();
  return Number(change?.meta?.changes||0)===1;
}
export function completeRenameStatement(env,userId,newName){
  return env.COMMUNITY_DB.prepare(`UPDATE aio_username_rename_v1
    SET completed_at=?,new_name=? WHERE user_id=? AND completed_at IS NULL`)
    .bind(new Date().toISOString(),newName,userId);
}
