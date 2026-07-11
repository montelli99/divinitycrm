-- Migration 004: Add closed_date to leads for post-close engine
ALTER TABLE leads ADD COLUMN IF NOT EXISTS closed_date DATE;