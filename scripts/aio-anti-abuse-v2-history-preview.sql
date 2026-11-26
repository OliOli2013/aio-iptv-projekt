-- READ ONLY: exact full fingerprint, earlier account, no existing active ban.
-- Historical failed-login evidence refers to the peer's CURRENT ban status.
WITH candidates AS (
  SELECT p.id AS user_id,p.display_name,old.id AS peer_id,old.display_name AS peer_name,
         reg.id AS registration_id,j.id AS evidence_id,j.event,j.created_at AS evidence_at,
         reg.created_at AS registration_at,reg.ip_fingerprint,
         round((julianday(reg.created_at)-julianday(j.created_at))*86400,1) AS seconds_before,
         row_number() OVER (PARTITION BY p.id ORDER BY CASE WHEN j.event='login_failed' THEN 1 ELSE 0 END,
           j.created_at DESC,j.id DESC,reg.id DESC) AS priority
  FROM aio_security_journal reg
  JOIN community_profiles p ON p.id=reg.user_id AND p.role='user'
  JOIN aio_security_journal j ON j.ip_fingerprint=reg.ip_fingerprint
    AND j.user_id<>reg.user_id AND j.created_at<reg.created_at
  JOIN community_profiles old ON old.id=j.user_id AND old.role='user'
  WHERE reg.event='register_ok' AND length(reg.ip_fingerprint)=43
    AND reg.ip_fingerprint NOT GLOB '*[^A-Za-z0-9_-]*'
    AND julianday(old.created_at)<julianday(p.created_at)
    AND (p.banned_until IS NULL OR datetime(p.banned_until)<=datetime('now'))
    AND (j.event IN ('register_ok','login_ok','login_review_blocked')
      OR (j.event='download_denied' AND lower(j.detail) LIKE 'limit%')
      OR (j.event='login_failed' AND datetime(old.banned_until)>datetime('now')
        AND julianday(j.created_at)>=julianday(reg.created_at)-30.0/1440))
    AND NOT EXISTS (SELECT 1 FROM community_moderation_log m
      WHERE m.target_user_id=p.id AND (m.action='aio_anti_abuse_v2_historical_ban'
        OR (m.action IN ('unban','owner_unified_release_all_v1')
          AND julianday(m.created_at)>=julianday(reg.created_at))))
), selected AS (SELECT * FROM candidates WHERE priority=1)
SELECT user_id,display_name,peer_id,peer_name,event,evidence_at,registration_at,
       seconds_before,substr(ip_fingerprint,1,10) AS network_short
FROM selected ORDER BY registration_at DESC,user_id;
