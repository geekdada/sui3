-- Migration number: 0001 	 2026-07-15
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'auth')),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE apps (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE passkey_credentials (
  id TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL,
  transports TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE access_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL
);

CREATE TABLE webauthn_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  type TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX apps_category_id_idx ON apps(category_id);
CREATE INDEX categories_sort_order_idx ON categories(sort_order);
CREATE INDEX access_tokens_expires_at_idx ON access_tokens(expires_at);
CREATE INDEX webauthn_challenges_expires_at_idx ON webauthn_challenges(expires_at);
