-- D1, additive and idempotent. No changes to existing limits or grants.
CREATE TABLE IF NOT EXISTS aio_download_speed_users_v1 (
  user_id TEXT PRIMARY KEY REFERENCES community_profiles(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK(mode IN ('custom','unlimited')),
  kbps INTEGER,
  expires_ms INTEGER CHECK(expires_ms IS NULL OR expires_ms>0),
  reason TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK((mode='custom' AND kbps IS NOT NULL AND typeof(kbps)='integer' AND kbps BETWEEN 5 AND 10000) OR (mode='unlimited' AND kbps IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_aio_download_speed_users_exp_v1 ON aio_download_speed_users_v1(expires_ms);
