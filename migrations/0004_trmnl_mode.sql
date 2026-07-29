-- Migration number: 0004 	 2026-07-29
-- SQLite cannot add a CHECK constraint via ALTER TABLE, so the allowed values
-- ('mirror', 'device') are enforced in app code by parseTrmnlMode().
ALTER TABLE trmnl_integration ADD COLUMN mode TEXT NOT NULL DEFAULT 'mirror';
