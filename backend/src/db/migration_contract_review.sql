-- =============================================================
-- migration_contract_review.sql
-- Adds review/approval fields to contracts table for the
-- underwriting → strategy → contract draft → REVIEW → sign flow
-- (LRN-20260626-008 / user directive 2026-06-26 14:20 EDT)
-- =============================================================

-- Add review status column to contracts
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS selection_reason TEXT;  -- why this contract type was chosen

-- Index for filtering draft contracts awaiting review
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_drafts ON contracts(lead_id) WHERE status = 'draft';

-- Allowed values (validated in app code via CHECK constraint)
-- 'draft' = generated, awaiting review
-- 'approved' = human reviewed, ready to send
-- 'sent' = RabbitSign envelope created
-- 'declined' = review rejected, contract discarded
-- 'superseded' = newer draft replaced this one