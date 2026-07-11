-- Migration 001: Feature tiers + Emily AI agent flags
-- Date: 2026-07-10
-- Adds per-account feature tier and AI agent toggle

ALTER TABLE users ADD COLUMN IF NOT EXISTS feature_tier TEXT NOT NULL DEFAULT 'free'
  CHECK (feature_tier IN ('free','base','voice','pro','enterprise'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_agent_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_agent_voice TEXT DEFAULT 'emily';
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_agent_stage_whitelist TEXT[]
  DEFAULT ARRAY['LEAD_ENTERED','CONTACT_MADE','OFFER_SENT','GAIN_FEEDBACK','NO_ANSWER','SELLER_DECLINED'];

-- Set Montelli to pro tier with Emily enabled
UPDATE users SET feature_tier = 'pro', ai_agent_enabled = true
  WHERE email = 'montelliscottrei@gmail.com';

-- Set Kayla to base tier
UPDATE users SET feature_tier = 'base'
  WHERE email = 'homewithkaylamauser@gmail.com';