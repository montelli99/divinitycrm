-- Migration 003: Communications inbox state
-- Date: 2026-07-11

ALTER TABLE communications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE communications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_comm_unread ON communications(user_id, read_at, archived_at, created_at DESC);
