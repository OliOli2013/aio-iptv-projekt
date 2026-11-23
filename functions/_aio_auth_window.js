// One D1 write decides one attempt. Active penalties are not extended by retries.
export const WINDOW_SQL = `
  INSERT INTO community_login_attempts(key,attempts,first_at,last_at,blocked_until)
  VALUES(?1,1,?2,?2,NULL)
  ON CONFLICT(key) DO UPDATE SET
    attempts=CASE WHEN first_at<=?3 THEN 1 ELSE attempts+1 END,
    first_at=CASE WHEN first_at<=?3 THEN excluded.first_at ELSE first_at END,
    last_at=excluded.last_at,
    blocked_until=CASE WHEN first_at>?3 AND attempts>=?4 THEN ?5 ELSE NULL END
  WHERE blocked_until IS NULL OR blocked_until<=?2
  RETURNING blocked_until`;

export async function consumeWindowLimit(env,key,limit,windowMs) {
  const ms=Date.now(), iso=t=>new Date(t).toISOString();
  const row=await env.COMMUNITY_DB.prepare(WINDOW_SQL)
    .bind(key,iso(ms),iso(ms-windowMs),limit,iso(ms+windowMs)).first();
  if(!row || row.blocked_until) throw Object.assign(new Error('Za dużo prób. Spróbuj ponownie później.'),{status:429});
}
