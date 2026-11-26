/* AIO Anti-Abuse V2: hard signup gate on the FULL server-side IP fingerprint.
 * No account is created on a denied signup. Failed login is not an IP claim:
 * only a recent attempt on an already blocked account can deny a new signup.
 * Never suspend the referenced existing account based on an unauthenticated attempt.
 */
const FULL_HASH=/^[A-Za-z0-9_-]{43}$/;
const WINDOW_MS=30*60*1000;
export const EXACT_SIGNUP_SQL=`SELECT j.id AS evidence_id,j.user_id AS peer_user_id,j.event,j.created_at
  FROM aio_security_journal j JOIN community_profiles p ON p.id=j.user_id
  WHERE j.ip_fingerprint=? AND j.created_at<=? AND p.role='user' AND p.id<>?
    AND (j.event IN ('register_ok','login_ok','login_review_blocked')
      OR (j.event='download_denied' AND lower(j.detail) LIKE 'limit%')
      OR (j.event='login_failed' AND j.created_at>=? AND datetime(p.banned_until)>datetime(?)))
  ORDER BY CASE WHEN j.event='login_failed' THEN 1 ELSE 0 END,j.created_at DESC,j.id DESC LIMIT 1`;
export async function exactSignupConflict(db,fingerprint,ownerId,now=Date.now()){
  if(!FULL_HASH.test(String(fingerprint||'')))throw new Error('Invalid full security fingerprint');
  const end=new Date(now).toISOString(),start=new Date(now-WINDOW_MS).toISOString();
  return await db.prepare(EXACT_SIGNUP_SQL).bind(fingerprint,end,String(ownerId||''),start,end).first()||null;
}
