-- READ ONLY. New signup denials and applied historical bans.
SELECT created_at,event,detail,user_id AS account_id
FROM aio_security_journal WHERE event='anti_abuse_signup_denied_v2'
UNION ALL
SELECT created_at,action,metadata,target_user_id
FROM community_moderation_log WHERE action='aio_anti_abuse_v2_historical_ban'
ORDER BY created_at DESC LIMIT 500;
