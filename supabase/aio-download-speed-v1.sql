-- D1 SQLite (not Supabase): additive, idempotent. Disabled until owner enables.
CREATE TABLE IF NOT EXISTS aio_download_speed_config_v1 (id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),kbps INTEGER NOT NULL CHECK(kbps BETWEEN 5 AND 10000),updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS aio_download_speed_leases_v1 (scope TEXT PRIMARY KEY,token TEXT NOT NULL,expires_ms INTEGER NOT NULL);
INSERT OR IGNORE INTO aio_download_speed_config_v1(id,enabled,kbps,updated_at) VALUES(1,0,25,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
