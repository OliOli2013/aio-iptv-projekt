-- WYŁĄCZNIE PODGLĄD — NIE USUWA DANYCH.
SELECT COUNT(*) AS expired_ip_records FROM community_user_ips WHERE datetime(last_seen_at) < datetime('now','-90 days');
SELECT COUNT(*) AS expired_sessions FROM community_sessions WHERE datetime(expires_at) < datetime('now');
