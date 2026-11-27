-- Only new private analysis tables. No mutations to users, limits or blocking policies.
CREATE TABLE IF NOT EXISTS aio_security_intelligence_report_v1 (
 id INTEGER PRIMARY KEY CHECK(id=1), checked_at TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload))
);
CREATE TABLE IF NOT EXISTS aio_security_intelligence_seen_v1 (
 case_key TEXT PRIMARY KEY, reviewed_at TEXT NOT NULL, actor_id TEXT NOT NULL
);
