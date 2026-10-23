/* AIO Account Delete Fix V1 — owner-only caller; atomic D1 deletion.
 * Address restrictive FK dependencies from owner messages introduced after the legacy delete routine.
 * Never remove shared network signup permits; remove user-specific IP claims and exceptions.
 * Preserve SET NULL historical journal entries for accountability.
 */

const OPTIONAL_USER_TABLES = [
  'aio_owner_message_reads',
  'aio_ip_policy_claims',
  'aio_ip_policy_exceptions',
  'aio_ip_policy_hold_reviews_v9',
  'aio_access_account_grants',
  'aio_access_account_daily',
  'aio_access_account_flows',
  'aio_access_account_file_retries',
  'aio_v6_rate'
];

export async function deleteAccountSafely(env, userId) {
  const db = env.COMMUNITY_DB;
  if (!db || !/^[0-9a-f-]{36}$/i.test(String(userId || ''))) {
    throw Object.assign(new Error('Nieprawidłowe ID konta lub brak bazy danych.'), {status:400});
  }
  // Query the schema before changing anything. Optional modules may not have initialized yet.
  const catalog = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const existing = new Set((catalog.results || []).map(x => x.name));
  const steps = [];
  for (const table of OPTIONAL_USER_TABLES) {
    if (existing.has(table)) {
      // Table names are static internal constants, never taken from request parameters.
      steps.push(db.prepare(`DELETE FROM ${table} WHERE user_id=?`).bind(userId));
    }
  }
  if (existing.has('aio_owner_messages')) {
    // These FKs are NO ACTION. The old deletion failed for recipients of AIO owner messages.
    // Message reads on those messages are removed by ON DELETE CASCADE.
    steps.push(db.prepare('DELETE FROM aio_owner_messages WHERE recipient_user_id=? OR sender_user_id=?').bind(userId, userId));
  }
  // FIX V2: preserve the historical moderation log while detaching deleted users.
  // Production D1 schema: actor_id and target_user_id are restrictive FKs (NO ACTION).
  if (existing.has('community_moderation_log')) {
    steps.push(db.prepare('UPDATE community_moderation_log SET target_user_id=NULL WHERE target_user_id=?').bind(userId));
    steps.push(db.prepare('UPDATE community_moderation_log SET actor_id=NULL WHERE actor_id=?').bind(userId));
  }
  // Keep active network rules but detach references to the removed account.
  if (existing.has('community_ip_blocks')) {
    steps.push(db.prepare('UPDATE community_ip_blocks SET target_user_id=NULL WHERE target_user_id=?').bind(userId));
    steps.push(db.prepare('UPDATE community_ip_blocks SET created_by=NULL WHERE created_by=?').bind(userId));
  }
  // Reports filed by this account require deletion (reporter_id is NOT NULL),
  // while reviewed reports from other users must retain their decision history.
  if (existing.has('community_reports')) {
    steps.push(db.prepare('UPDATE community_reports SET reviewed_by=NULL WHERE reviewed_by=?').bind(userId));
    steps.push(db.prepare('DELETE FROM community_reports WHERE reporter_id=?').bind(userId));
  }
  steps.push(
    db.prepare('DELETE FROM community_sessions WHERE user_id=?').bind(userId),
    db.prepare('DELETE FROM community_auth WHERE user_id=?').bind(userId),
    db.prepare('DELETE FROM community_comments WHERE author_id=?').bind(userId),
    db.prepare('DELETE FROM community_reactions WHERE user_id=?').bind(userId),
    db.prepare('DELETE FROM community_subscriptions WHERE user_id=?').bind(userId),
    db.prepare('DELETE FROM community_posts WHERE author_id=?').bind(userId),
    db.prepare('DELETE FROM community_profiles WHERE id=?').bind(userId)
  );
  // D1 .batch() is transactional: a foreign key failure must not partially remove the account.
  const results = await db.batch(steps);
  const last = results[results.length - 1];
  if (Number(last?.meta?.changes || 0) !== 1) {
    throw new Error('Usuwanie konta nie zostało potwierdzone przez bazę D1.');
  }
  const remains = await db.prepare('SELECT id FROM community_profiles WHERE id=?').bind(userId).first();
  if (remains) throw new Error('Błąd weryfikacji usunięcia konta.');
  return {deleted:true, cleaned_statements:steps.length};
}
