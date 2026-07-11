-- Migration 002: Communications table + SMS daily log
-- Date: 2026-07-10
-- Unified SMS/email/call/note/transcript logging

-- Drop types if they exist (safe — they're new)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comm_type') THEN
    CREATE TYPE comm_type AS ENUM ('sms','email','call','note','voicemail','transcript');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comm_direction') THEN
    CREATE TYPE comm_direction AS ENUM ('inbound','outbound','internal');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comm_status') THEN
    CREATE TYPE comm_status AS ENUM ('pending','sent','delivered','failed','received','read','scheduled','canceled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  opportunity_id UUID,
  type comm_type NOT NULL,
  direction comm_direction NOT NULL,
  status comm_status NOT NULL DEFAULT 'pending',
  phone_number TEXT,
  email_address TEXT,
  sender_name TEXT,
  recipient_name TEXT,
  subject TEXT,
  message_body TEXT NOT NULL,
  external_id TEXT,
  external_status TEXT,
  recording_url TEXT,
  transcription TEXT,
  duration_seconds INT,
  template_key TEXT,
  stage TEXT,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comm_lead ON communications(lead_id);
CREATE INDEX IF NOT EXISTS idx_comm_user ON communications(user_id);
CREATE INDEX IF NOT EXISTS idx_comm_phone ON communications(phone_number);
CREATE INDEX IF NOT EXISTS idx_comm_created ON communications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_external ON communications(external_id);

-- SMS daily rate limit tracking
CREATE TABLE IF NOT EXISTS sms_daily_log (
  did TEXT NOT NULL,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (did, log_date)
);

-- Add normalized phone to leads for inbound matching
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone_normalized TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_phone_norm ON leads(phone_normalized) WHERE phone_normalized IS NOT NULL;