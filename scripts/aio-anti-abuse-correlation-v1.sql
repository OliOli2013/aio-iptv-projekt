-- READ ONLY. Historical candidates; not proof of shared ownership.
-- Exact journal fingerprint and events within 30 minutes BEFORE signup.
SELECT p.display_name AS nowe_konto,reg.user_id AS nowe_id,reg.created_at AS rejestracja,
       old.display_name AS poprzednie_konto,j.user_id AS poprzednie_id,j.created_at AS poprzednie_zdarzenie,
       j.event,j.detail,substr(j.ip_fingerprint,1,10) AS skrot_sieci,
       round((julianday(reg.created_at)-julianday(j.created_at))*86400,1) AS odstep_s,
       old.banned_until AS poprzednia_blokada_teraz
FROM aio_security_journal reg
JOIN aio_security_journal j ON j.ip_fingerprint=reg.ip_fingerprint
 AND j.user_id<>reg.user_id AND j.created_at<reg.created_at
 AND julianday(j.created_at)>=julianday(reg.created_at)-30.0/1440
JOIN community_profiles p ON p.id=reg.user_id
JOIN community_profiles old ON old.id=j.user_id
WHERE reg.event='register_ok' AND reg.created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')
 AND reg.ip_fingerprint IS NOT NULL AND p.role='user' AND old.role='user'
 AND (j.event IN ('login_failed','login_review_blocked') OR (j.event='download_denied' AND lower(j.detail) LIKE 'limit%'))
ORDER BY reg.created_at DESC,j.created_at DESC LIMIT 500;
