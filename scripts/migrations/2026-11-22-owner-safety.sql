-- Additive, repeatable, no existing permissions, bans or quotas are changed.
CREATE TABLE IF NOT EXISTS aio_vpn_auth_counts_v2 (
 slot INTEGER NOT NULL CHECK(slot BETWEEN 0 AND 30), day TEXT NOT NULL,
 phase TEXT NOT NULL CHECK(phase IN ('login','register')), outcome TEXT NOT NULL,
 reason TEXT NOT NULL, n INTEGER NOT NULL CHECK(n>0),
 PRIMARY KEY(slot,phase,outcome,reason)
);
CREATE TABLE IF NOT EXISTS aio_owner_signal_decisions_v1 (
 seq INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES community_profiles(id) ON DELETE CASCADE,
 actor_id TEXT NOT NULL, evidence TEXT NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('watch','dismiss')), note TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_aio_ops_user_seq ON aio_owner_signal_decisions_v1(user_id,seq DESC);
