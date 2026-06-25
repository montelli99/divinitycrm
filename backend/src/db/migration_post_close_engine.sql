-- Migration: Add missing GHL-aligned fields to leads table
-- These fields are referenced by stage automations but don't exist in the schema:
--   - jv_title_holder: Set at JV_SIGNED → WIRE_SETUP
--   - jv_signed_date: Set at JV_SIGNED → WIRE_SETUP
--   - inspection_complete_date: Set at INSPECTION_PERIOD → INSPECTION_COMPLETE

ALTER TABLE leads ADD COLUMN IF NOT EXISTS jv_title_holder TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS jv_signed_date TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS inspection_complete_date TIMESTAMPTZ;