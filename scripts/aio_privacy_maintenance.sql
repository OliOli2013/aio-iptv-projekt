-- AIO MAINTENANCE V1 — tylko odczyt (bezpieczny przegląd z D1)
-- Wykonuj przez Cloudflare D1 SQL Console / wrangler z właściwą bazą.
-- Nie używaj skryptu do automatycznego czyszczenia danych ani do publikacji wyników.
SELECT 'expired_sessions_over_2_days' AS category, COUNT(*) AS rows_count FROM community_sessions
 WHERE datetime(expires_at)<datetime('now','-2 days');
SELECT 'expired_password_reset_tokens_over_1_day' AS category, COUNT(*) AS rows_count FROM community_password_resets
 WHERE datetime(expires_at)<datetime('now','-1 day');
SELECT 'login_and_ai_rate_counters_over_30_days' AS category, COUNT(*) AS rows_count FROM community_login_attempts
 WHERE datetime(last_at)<datetime('now','-30 days') AND (blocked_until IS NULL OR datetime(blocked_until)<datetime('now'));
SELECT 'ip_history_over_90_days' AS category, COUNT(*) AS rows_count FROM community_user_ips
 WHERE datetime(last_seen_at)<datetime('now','-90 days');
-- Pamiętaj również o analizie retencji innych danych: logów, kopii, R2 i danych kont.
