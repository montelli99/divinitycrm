-- Migration 003: Add read/archive tracking to communications table
ALTER TABLE communications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE communications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;