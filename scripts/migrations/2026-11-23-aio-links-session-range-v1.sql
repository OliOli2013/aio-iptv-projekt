-- AIO Linki / Sesje / Range V1. Re-run safe. Production and Preview separately.
-- Do not store raw IP addresses, cookies, or external URLs here.
CREATE TABLE IF NOT EXISTS aio_session_network_checks_v1 (
  session_hash TEXT NOT NULL,
  network_key TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK(verdict IN ('clean','mobile','datacenter','relay','vpn','proxy','tor')),
  expires_ms INTEGER NOT NULL,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (session_hash, network_key)
);
CREATE INDEX IF NOT EXISTS idx_aio_session_network_exp_v1 ON aio_session_network_checks_v1(expires_ms);

CREATE TABLE IF NOT EXISTS aio_range_issued_v1 (
  user_id TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  file_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','issued')),
  created_ms INTEGER NOT NULL,
  expires_ms INTEGER NOT NULL,
  PRIMARY KEY (user_id, session_hash, file_key)
);
CREATE INDEX IF NOT EXISTS idx_aio_range_issued_exp_v1 ON aio_range_issued_v1(expires_ms);

-- Server-side click events and server-authorized redirects are distinct metrics.
-- Actual /pliki/ issued responses remain in aio_owner_downloads.
CREATE TABLE IF NOT EXISTS aio_link_events_v1 (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  source TEXT NOT NULL CHECK(source IN ('catalog','chat')),
  source_id TEXT NOT NULL DEFAULT '',
  event TEXT NOT NULL CHECK(event IN ('click','external_handoff')),
  host TEXT NOT NULL,
  file_name TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aio_link_events_date_v1 ON aio_link_events_v1(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aio_link_events_user_v1 ON aio_link_events_v1(user_id,created_at DESC);
