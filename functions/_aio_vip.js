/* AIO VIP V1: one calendar month of owner-controlled unlimited local downloads.
 * Independent of 7-day grants and free daily quotas. Never accepts a browser-side VIP flag.
 */
let vipSchemaPromise;
export async function ensureVipSchema(env) {
  if (!env.COMMUNITY_DB) throw new Error('Brak COMMUNITY_DB.');
  if (!vipSchemaPromise) vipSchemaPromise = (async () => {
    await env.COMMUNITY_DB.batch([
      env.COMMUNITY_DB.prepare(`CREATE TABLE IF NOT EXISTS aio_vip_grants (
        user_id TEXT PRIMARY KEY,
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
        activated_by TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        revoked_at TEXT,
        revoked_by TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES community_profiles(id) ON DELETE CASCADE
      )`),
      env.COMMUNITY_DB.prepare('CREATE INDEX IF NOT EXISTS idx_aio_vip_expires ON aio_vip_grants(status,expires_at)')
    ]);
  })().catch(error => { vipSchemaPromise = null; throw error; });
  await vipSchemaPromise;
}
export function oneCalendarMonth(started) {
  const start = new Date(started);
  if (!Number.isFinite(start.getTime())) throw new Error('Nieprawidłowa data aktywacji VIP.');
  const year = start.getUTCFullYear(), month = start.getUTCMonth(), day = start.getUTCDate();
  const target = new Date(Date.UTC(year, month + 1, 1,
    start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}
export async function getVipStatus(env,userId) {
  await ensureVipSchema(env);
  const row = await env.COMMUNITY_DB.prepare(`SELECT issued_at,expires_at FROM aio_vip_grants
    WHERE user_id=? AND status='active' AND expires_at>? LIMIT 1`)
    .bind(userId,new Date().toISOString()).first();
  return row ? {active:true,issued_at:row.issued_at,expires_at:row.expires_at} : {active:false};
}
