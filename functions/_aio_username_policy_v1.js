/* AIO USERNAME PROTECTION V1 — reserved identities, unique names, legacy one-time rename. */
const DAY = 86400000;
const NOTICE_DAYS = 14;
let schemaReady;

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
      env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_username_review_completed ON aio_username_rename_v1(completed_at,deadline_at)'),
      env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_display_name_nocase ON community_profiles(display_name COLLATE NOCASE)')
    ]);
  })().catch(e=>{schemaReady=null;throw e;});
  return schemaReady;
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
async function reviewRow(env,id){
  return await env.COMMUNITY_DB.prepare('SELECT * FROM aio_username_rename_v1 WHERE user_id=? LIMIT 1').bind(id).first();
}
export async function usernameRenameReview(env,userId,displayName,role,{fullScan=false}={}){
  if(role==='admin')return null; // Owner/admin IDs must not be trapped in migration.
  await ensureUsernamePolicy(env);
  const existing=await reviewRow(env,userId);
  if(existing)return existing.completed_at?null:existing;
  let reason=reservedUsername(displayName)?'reserved':null;
  if(!reason){
    if(fullScan){
      const rows=await env.COMMUNITY_DB.prepare('SELECT id,display_name,created_at FROM community_profiles ORDER BY created_at,id').all();
      const key=usernameKey(displayName);
      const matches=(rows.results||[]).filter(r=>usernameKey(r.display_name)===key);
      if(matches.length>1 && String(matches[0].id)!==String(userId))reason='duplicate';
    }else{
      const rows=await env.COMMUNITY_DB.prepare(`SELECT id FROM community_profiles
        WHERE display_name=? COLLATE NOCASE ORDER BY created_at,id LIMIT 2`).bind(displayName).all();
      if((rows.results||[]).length>1 && String(rows.results[0].id)!==String(userId))reason='duplicate';
    }
  }
  if(!reason)return null;
  const now=Date.now(),stamp=new Date(now).toISOString();
  await env.COMMUNITY_DB.prepare(`INSERT OR IGNORE INTO aio_username_rename_v1
    (user_id,original_name,reason,created_at,deadline_at)
    VALUES(?,?,?,?,?)`).bind(userId,displayName,reason,stamp,new Date(now+NOTICE_DAYS*DAY).toISOString()).run();
  return await reviewRow(env,userId);
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
