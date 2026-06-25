-- Migration: Add missing GHL-aligned fields to leads table
-- These fields are referenced by stage automations but don't exist in the schema:
--   - jv_title_holder: Set at JV_SIGNED → WIRE_SETUP
--   - jv_signed_date: Set at JV_SIGNED → WIRE_SETUP
--   - inspection_complete_date: Set at INSPECTION_PERIOD → INSPECTION_COMPLETE
--   - appraisal_ordered_date: Set at INSPECTION_COMPLETE → APPRAISAL_ORDERED
--   - appraisal_done_date: Set at APPRAISAL_ORDERED → APPRAISAL_DONE
--   - appraisal_value: Set when appraiser reports value
--   - draft_loi_url: Set when LOI doc generated at OFFER_READY → OFFER_SENT
--   - draft_loi_body: Set when LOI doc generated

ALTER TABLE leads ADD COLUMN IF NOT EXISTS jv_title_holder TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS jv_signed_date TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS inspection_complete_date TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS appraisal_ordered_date TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS appraisal_done_date TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS appraisal_value NUMERIC;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS draft_loi_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS draft_loi_body TEXT;