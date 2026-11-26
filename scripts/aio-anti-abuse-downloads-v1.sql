-- READ ONLY. Actual file names for the events present in these audit tables.
-- No credentials, full external URLs or session hashes. Not proof of completion.
WITH files AS (
 SELECT d.created_at,d.user_id,d.file_name,CASE WHEN COALESCE(d.source_post_id,'')<>'' THEN 'post_local' ELSE 'local' END AS source,d.access_reason AS reason,
        d.status_code,'local_issued' AS event
 FROM aio_owner_downloads d WHERE d.user_id IS NOT NULL AND d.status_code IN (200,206)
 UNION ALL
 SELECT l.created_at,l.user_id,l.file_name,l.source,l.reason,NULL,l.event
 FROM aio_link_events_v1 l WHERE l.user_id IS NOT NULL AND l.event='external_handoff'
 UNION ALL
 SELECT h.created_at,h.user_id,h.file_name,'post',h.reason,NULL,'external_handoff'
 FROM aio_post_link_handoffs h WHERE h.user_id IS NOT NULL AND h.kind='external'
)
SELECT f.created_at,p.display_name,f.user_id,f.file_name,f.source,f.reason,f.status_code,f.event
FROM files f LEFT JOIN community_profiles p ON p.id=f.user_id
WHERE f.created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')
ORDER BY f.created_at DESC LIMIT 3000;
