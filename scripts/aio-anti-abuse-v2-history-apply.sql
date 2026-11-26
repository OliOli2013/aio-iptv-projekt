-- OWNER ACTION: D1 remote SQL FILE import, not --command.
-- Run preview first. Apply only after testing on aio-community-test.
-- Uses the existing profile ban and moderation log, not a new block layer.
-- All statements must be executed in one atomic D1 import.
WITH candidates AS (
  SELECT p.id AS user_id,p.display_name,old.id AS peer_id,old.display_name AS peer_name,
         reg.id AS registration_id,j.id AS evidence_id,j.event,j.created_at AS evidence_at,
         reg.created_at AS registration_at,reg.ip_fingerprint,
         round((julianday(reg.created_at)-julianday(j.created_at))*86400,1) AS seconds_before,
         row_number() OVER (PARTITION BY p.id ORDER BY CASE WHEN j.event='login_failed' THEN 1 ELSE 0 END,
           j.created_at DESC,j.id DESC,reg.id DESC) AS priority
  FROM aio_security_journal reg
  JOIN community_profiles p ON p.id=reg.user_id AND p.role='user' AND p.id<>'__AIO_OWNER_USER_ID__'
  JOIN aio_security_journal j ON j.ip_fingerprint=reg.ip_fingerprint
    AND j.user_id<>reg.user_id AND j.created_at<reg.created_at
  JOIN community_profiles old ON old.id=j.user_id AND old.role='user' AND old.id<>'__AIO_OWNER_USER_ID__'
  WHERE length('__AIO_OWNER_USER_ID__')=36 AND EXISTS (SELECT 1 FROM community_profiles WHERE id='__AIO_OWNER_USER_ID__') AND reg.event='register_ok' AND length(reg.ip_fingerprint)=43
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
INSERT INTO community_moderation_log
  (id,actor_id,target_user_id,target_type,target_id,action,reason,ip_address,metadata,created_at)
SELECT 'aio-anti-abuse-v2:'||user_id,NULL,user_id,'user',user_id,
  'aio_anti_abuse_v2_pending',
  'AIO_ANTI_ABUSE_V2: naruszenie zasady 1 IP = 1 konto; zgodny pelny skrot sieci.',NULL,
  json_object('peer_user_id',peer_id,'registration_id',registration_id,'evidence_id',evidence_id,
    'event',event,'seconds_before',seconds_before,'full_hash_match',1),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM selected s WHERE NOT EXISTS (SELECT 1 FROM community_moderation_log m
  WHERE m.id='aio-anti-abuse-v2:'||s.user_id);

UPDATE community_profiles SET banned_until='9999-12-31T23:59:59.000Z',
  ban_reason='AIO_ANTI_ABUSE_V2: naruszenie zasady 1 IP = 1 konto; zgodny pelny skrot sieci.',
  banned_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),banned_by=NULL,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE length('__AIO_OWNER_USER_ID__')=36 AND EXISTS (SELECT 1 FROM community_profiles WHERE id='__AIO_OWNER_USER_ID__') AND id<>'__AIO_OWNER_USER_ID__' AND role='user' AND (banned_until IS NULL OR datetime(banned_until)<=datetime('now'))
  AND EXISTS (SELECT 1 FROM community_moderation_log m
    WHERE m.target_user_id=community_profiles.id AND m.action='aio_anti_abuse_v2_pending'
      AND m.id='aio-anti-abuse-v2:'||community_profiles.id);

DELETE FROM community_sessions WHERE user_id IN (
  SELECT p.id FROM community_profiles p JOIN community_moderation_log m ON m.target_user_id=p.id
  WHERE length('__AIO_OWNER_USER_ID__')=36 AND EXISTS (SELECT 1 FROM community_profiles WHERE id='__AIO_OWNER_USER_ID__') AND p.id<>'__AIO_OWNER_USER_ID__' AND p.role='user' AND p.ban_reason LIKE 'AIO_ANTI_ABUSE_V2:%'
    AND m.action='aio_anti_abuse_v2_pending' AND m.id='aio-anti-abuse-v2:'||p.id
);

UPDATE community_moderation_log SET action='aio_anti_abuse_v2_historical_ban'
WHERE action='aio_anti_abuse_v2_pending' AND EXISTS (
  SELECT 1 FROM community_profiles p WHERE p.id=community_moderation_log.target_user_id
  AND length('__AIO_OWNER_USER_ID__')=36 AND EXISTS (SELECT 1 FROM community_profiles WHERE id='__AIO_OWNER_USER_ID__') AND p.id<>'__AIO_OWNER_USER_ID__' AND p.role='user' AND p.ban_reason LIKE 'AIO_ANTI_ABUSE_V2:%'
  AND community_moderation_log.id='aio-anti-abuse-v2:'||p.id
);
