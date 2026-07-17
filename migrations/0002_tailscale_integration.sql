-- Migration number: 0002 	 2026-07-17
CREATE TABLE tailscale_integration (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  client_id TEXT NOT NULL,
  client_secret_ciphertext TEXT NOT NULL,
  client_secret_iv TEXT NOT NULL,
  tailnet_dns_name TEXT NOT NULL,
  cached_services_json TEXT NOT NULL DEFAULT '[]',
  last_sync_at INTEGER,
  last_sync_attempt_at INTEGER,
  last_sync_error TEXT,
  updated_at INTEGER NOT NULL
);
