/* AIO Range Issue V1: one counted issuance for the HTTP 206 fragments of
 * the same file, authenticated session and short transfer window. Each new
 * full HTTP 200 GET still consumes a new quota unit. Not a completion receipt.
 */
import {getSession} from './_community.js';
const LEASE_MS=15*60*1000;

export function rangeIssueDecision(row,now){
  if(!row||Number(row.expires_ms)<=now)return 'new';
  return row.state==='issued'?'reuse':'pending';
}
async function verifiedSession(env,request,userId){
  const s=await getSession(request,env,{touch:false,allowUnverified:true});
  if(!s?.tokenHash||s.user?.id!==userId||s.banned||s.blocked)throw new Error('Sesja pobierania jest nieprawidłowa.');
  return s.tokenHash;
}
async function rowFor(db,userId,token,fileKey){
  return db.prepare(`SELECT state,expires_ms FROM aio_range_issued_v1
    WHERE user_id=? AND session_hash=? AND file_key=? LIMIT 1`)
    .bind(userId,token,fileKey).first();
}
export async function canResumeRange(env,request,userId,fileKey){
  if(request.method!=='GET'||!request.headers.get('Range'))return false;
  const token=await verifiedSession(env,request,userId);
  return rangeIssueDecision(await rowFor(env.COMMUNITY_DB,userId,token,fileKey),Date.now())==='reuse';
}
export async function authorizeRange(env,request,userId,fileKey,consume){
  const token=await verifiedSession(env,request,userId),db=env.COMMUNITY_DB;
  const now=Date.now();
  if(Math.random()<0.02)await db.prepare('DELETE FROM aio_range_issued_v1 WHERE expires_ms<?')
    .bind(now).run().catch(()=>{});
  await db.prepare(`DELETE FROM aio_range_issued_v1
    WHERE user_id=? AND session_hash=? AND file_key=? AND expires_ms<=?`)
    .bind(userId,token,fileKey,now).run();
  const claimed=await db.prepare(`INSERT OR IGNORE INTO aio_range_issued_v1
    (user_id,session_hash,file_key,state,created_ms,expires_ms)
    VALUES(?,?,?,'pending',?,?)`)
    .bind(userId,token,fileKey,now,now+LEASE_MS).run();
  if(Number(claimed.meta?.changes||0)!==1){
    // Parallel range requests share the first debit. Wait briefly for the first
    // fragment's transaction, without a second charge on this session/file.
    for(let attempt=0;attempt<8;attempt++){
      const state=rangeIssueDecision(await rowFor(db,userId,token,fileKey),Date.now());
      if(state==='reuse')return {allowed:true,reason:'range_chunk',range_chunk:true};
      if(state==='new')break;
      await new Promise(resolve=>setTimeout(resolve,125));
    }
    return {allowed:false,reason:'range_pending'}; // fail closed on unresolved concurrency
  }
  let debited=false;
  try{
    const result=await consume();
    if(!result.allowed){
      await db.prepare(`DELETE FROM aio_range_issued_v1 WHERE user_id=? AND session_hash=? AND file_key=? AND state='pending'`)
        .bind(userId,token,fileKey).run();
      return result;
    }
    debited=true;
    const done=await db.prepare(`UPDATE aio_range_issued_v1 SET state='issued'
      WHERE user_id=? AND session_hash=? AND file_key=? AND state='pending'`)
      .bind(userId,token,fileKey).run();
    if(Number(done.meta?.changes||0)!==1)throw new Error('Nie udało się potwierdzić pierwszego fragmentu pobrania.');
    return {...result,first_range:true};
  }catch(error){
    // If debit might have succeeded, never silently permit unmetered fragments.
    if(!debited)await db.prepare(`DELETE FROM aio_range_issued_v1
      WHERE user_id=? AND session_hash=? AND file_key=? AND state='pending'`)
      .bind(userId,token,fileKey).run().catch(()=>{});
    throw error;
  }
}
