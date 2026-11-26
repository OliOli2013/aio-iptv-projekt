-- READ ONLY. New accounts with their first counted issue/hand-off and refusal signals.
-- Journal events are not identical to quota debits or successfully finished downloads.
WITH recent AS (
 SELECT id,display_name,created_at,banned_until FROM community_profiles
 WHERE role='user' AND datetime(created_at)>=datetime('now','-7 days')
), activity AS (
 SELECT j.user_id,
  MIN(CASE WHEN j.event IN ('download_issued','post_link_handoff','external_link_handoff') THEN j.created_at END) AS first_issue,
  SUM(CASE WHEN j.event IN ('download_issued','post_link_handoff','external_link_handoff') THEN 1 ELSE 0 END) AS issued,
  SUM(CASE WHEN j.event='download_denied' THEN 1 ELSE 0 END) AS denied,
  SUM(CASE WHEN j.event='login_failed' THEN 1 ELSE 0 END) AS login_failed,
  SUM(CASE WHEN j.event='login_ok' THEN 1 ELSE 0 END) AS login_ok
 FROM aio_security_journal j JOIN recent p ON p.id=j.user_id
 WHERE datetime(j.created_at)>=datetime(p.created_at)
 GROUP BY j.user_id
)
SELECT p.id,p.display_name,p.created_at,a.first_issue,
 round((julianday(a.first_issue)-julianday(p.created_at))*1440,1) AS min_to_first_issue,
 COALESCE(a.issued,0) AS issued,COALESCE(a.denied,0) AS denied,
 COALESCE(a.login_failed,0) AS login_failed,COALESCE(a.login_ok,0) AS login_ok,
 q.used AS monthly_used,q.resets_ms,m.status AS review_status,m.risk_score,m.indicators,
 p.banned_until
FROM recent p LEFT JOIN activity a ON a.user_id=p.id
LEFT JOIN aio_access_monthly_cycles q ON q.user_id=p.id
LEFT JOIN aio_multikonta_reviews_v2 m ON m.user_id=p.id
ORDER BY COALESCE(a.denied,0) DESC,COALESCE(a.issued,0) DESC,p.created_at DESC;
