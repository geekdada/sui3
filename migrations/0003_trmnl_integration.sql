-- Migration number: 0003 	 2026-07-29
CREATE TABLE trmnl_integration (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  device_key_ciphertext TEXT NOT NULL,
  device_key_iv TEXT NOT NULL,
  image BLOB,
  image_content_type TEXT,
  image_filename TEXT,
  image_url TEXT,
  rendered_at TEXT,
  refresh_rate INTEGER,
  fetched_at INTEGER,
  expires_at INTEGER,
  last_attempt_at INTEGER,
  retry_after_at INTEGER,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);
