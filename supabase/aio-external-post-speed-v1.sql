-- D1: new tables only. No changes to existing accounts or counters.
CREATE TABLE IF NOT EXISTS aio_external_speed_maps_v1 (
 source_hash TEXT PRIMARY KEY, r2_path TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS aio_external_speed_tickets_v1 (
 token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES community_profiles(id) ON DELETE CASCADE,
 source TEXT NOT NULL CHECK(source IN ('post','chat','catalog')), source_id TEXT NOT NULL,
 comment_id TEXT NOT NULL, href TEXT NOT NULL, expires_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aio_ext_speed_expiry_v1 ON aio_external_speed_tickets_v1(expires_ms);
CREATE INDEX IF NOT EXISTS idx_aio_ext_speed_user_v1 ON aio_external_speed_tickets_v1(user_id,expires_ms);
CREATE TABLE IF NOT EXISTS aio_external_speed_policy_v1 (
 id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL CHECK(enabled IN(0,1)), updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO aio_external_speed_policy_v1(id,enabled,updated_at) VALUES(1,0,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
