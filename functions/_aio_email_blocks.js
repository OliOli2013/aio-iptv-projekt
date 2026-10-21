/* Owner-only email denylist. Keep hashed addresses, not raw email, in D1. */
let ready;
export async function ensureEmailBlockTable(env){
  if(!ready)ready=env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_owner_email_blocks (
    email_hash TEXT PRIMARY KEY, user_id TEXT, created_at TEXT NOT NULL,
    created_by TEXT NOT NULL, reason TEXT NOT NULL DEFAULT ''
  )`).run().catch(e=>{ready=null;throw e;});
  await ready;
}
export async function emailHash(email){
  const data=new TextEncoder().encode(String(email||'').trim().toLowerCase());
  const hash=await crypto.subtle.digest('SHA-256',data);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function emailIsBlocked(env,email){
  await ensureEmailBlockTable(env);
  const row=await env.COMMUNITY_DB.prepare('SELECT 1 AS active FROM aio_owner_email_blocks WHERE email_hash=? LIMIT 1').bind(await emailHash(email)).first();
  return !!row;
}
