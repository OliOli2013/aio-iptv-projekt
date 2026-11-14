/* AIO BLOCKED APPEAL V2: dedicated 30-minute cookie, NEVER a normal community session.
 * The only consumer is /api/aio-review-appeal. No changes to requireUser / regular APIs.
 */
import {randomToken,sha256} from './_community.js';
const COOKIE='aio_appeal_session';
const TTL_MS=30*60*1000;
let schemaPromise=null;
async function ensureSchema(env){
  if(!env?.COMMUNITY_DB)throw new Error('Appeal: missing D1');
  if(!schemaPromise){
    schemaPromise=env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_appeal_sessions_v2 (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE
    )`).run().catch(e=>{schemaPromise=null;throw e;});
  }
  await schemaPromise;
}
function readCookie(request,name){
  const cookie=request.headers.get('Cookie')||'';
  for(const part of cookie.split(';')){
    const pair=part.trim();const eq=pair.indexOf('=');
    if(eq<0||pair.slice(0,eq)!==name)continue;
    try{return decodeURIComponent(pair.slice(eq+1));}catch(_){return '';}
  }
  return '';
}
export async function issueAppealSession(env,userId){
  await ensureSchema(env);
  const token=randomToken(32), hash=await sha256(token);
  const now=new Date().toISOString(),end=new Date(Date.now()+TTL_MS).toISOString();
  await env.COMMUNITY_DB.prepare('DELETE FROM aio_appeal_sessions_v2 WHERE expires_at<=?')
    .bind(now).run();
  await env.COMMUNITY_DB.prepare(`INSERT INTO aio_appeal_sessions_v2
    (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)`)
    .bind(hash,userId,now,end).run();
  return COOKIE+'='+encodeURIComponent(token)+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=1800';
}
export async function readAppealSession(request,env){
  const token=readCookie(request,COOKIE);
  if(!token||token.length>256)return null;
  await ensureSchema(env);
  const tokenHash=await sha256(token);
  const row=await env.COMMUNITY_DB.prepare(`SELECT p.id, p.display_name
    FROM aio_appeal_sessions_v2 a JOIN community_profiles p ON p.id=a.user_id
    WHERE a.token_hash=? AND a.expires_at>? LIMIT 1`)
    .bind(tokenHash,new Date().toISOString()).first();
  return row?{id:row.id,name:String(row.display_name||'Użytkownik').slice(0,60)}:null;
}
