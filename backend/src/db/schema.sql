-- =============================================================
-- Divinity CRM Platform — Neon Postgres Schema
-- Built: 2026-06-15 | Rebuilt: 2026-06-17 (21-stage pipeline)
-- Stack: Neon + Express + React + Clerk
-- =============================================================
-- 
-- How to apply:
--   1. Create Neon project at neon.tech
--   2. Copy connection string
--   3. Run: psql [connection_string] -f schema.sql
--   OR paste into Neon SQL Editor
--
-- Branching: Neon supports database branching.
--   - main branch = production
--   - dev branch = development (branch off main, merge when ready)
-- =============================================================

-- =============================================================
-- ENUMS
-- =============================================================

CREATE TYPE pipeline_stage AS ENUM (
  -- MONTELLI (Stages 1-3)
  'LEAD_ENTERED',
  'CONTACT_MADE',
  'OFFER_READY',
  -- KAYLA (Stages 4-10)
  'OFFER_SENT',
  'OFFER_RECEIVED',
  'GAIN_FEEDBACK',
  'NO_ANSWER',
  'SELLER_DECLINED',
  'ACTIVE_NEGOTIATION',
  'TERMS_AGREED',
  -- CONTRACTS (Stages 11-12)
  'AWAITING_TITLE',
  'CONTRACT_OUT',
  -- TC PIPELINE (Stages 13-17)
  'UNDER_CONTRACT',
  'INSPECTION_PERIOD',
  'INSPECTION_COMPLETE',
  'APPRAISAL_ORDERED',
  'APPRAISAL_DONE',
  -- JV (Stages 18-19)
  'JV_SENT',
  'JV_SIGNED',
  -- CLOSING (Stages 20-21)
  'WIRE_SETUP',
  'CLOSING_DATE',
  -- Terminal
  'ARCHIVED',
  'DEAD'
);

CREATE TYPE contract_type AS ENUM (
  'subto',
  'cash',
  'seller_finance',
  'stack50',
  'stack10',
  'jv',
  'commercial',
  'portfolio',
  'novation',
  'zero_down',
  'interest_only',
  'mfh_stack'
);

CREATE TYPE lead_source AS ENUM (
  'kayla_sheet',
  'ppc',
  'facebook',
  'website',
  'list_pull',
  'referral',
  'zillow',
  'redfin',
  'other'
);

CREATE TYPE property_condition AS ENUM (
  'turnkey',
  'reno',
  'livable',
  'unknown'
);

CREATE TYPE occupancy_status AS ENUM (
  'occupied',
  'vacant',
  'unknown'
);

CREATE TYPE lease_type AS ENUM (
  'mtm',
  'annual',
  'none',
  'unknown'
);

CREATE TYPE repair_tier AS ENUM (
  'light',
  'mid',
  'full'
);

CREATE TYPE user_role AS ENUM (
  'admin',
  'student',
  'closer',
  'underwriter'
);

CREATE TYPE jv_type AS ENUM (
  '3_party',
  '4_party',
  'none'
);

CREATE TYPE nurture_stage AS ENUM (
  '30_day',
  '60_day',
  '90_day',
  '181_day',
  'none'
);

-- =============================================================
-- USERS (synced with Clerk via webhook)
-- =============================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id TEXT UNIQUE NOT NULL,          -- Clerk user ID
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role user_role NOT NULL DEFAULT 'student',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- LEADS (the core table — 21-stage pipeline)
-- =============================================================

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Property
  address TEXT NOT NULL,
  city TEXT,
  state TEXT,
  zip TEXT,
  apn TEXT,
  
  -- Basic info
  price NUMERIC(12,2),
  source lead_source DEFAULT 'other',
  stage pipeline_stage NOT NULL DEFAULT 'LEAD_ENTERED',
  
  -- Property details
  beds INTEGER,
  baths NUMERIC(3,1),
  sqft INTEGER,
  lot_size NUMERIC(10,2),
  year_built INTEGER,
  condition property_condition DEFAULT 'unknown',
  condition_rating INTEGER CHECK (condition_rating BETWEEN 1 AND 10),
  property_type TEXT DEFAULT 'sfr',       -- sfr, mfh, commercial, land
  
  -- Buy box
  population INTEGER,
  population_ok BOOLEAN,
  buy_box_passed BOOLEAN,
  buy_box_match BOOLEAN DEFAULT true,
  
  -- Contacts
  agent_name TEXT,
  agent_phone TEXT,
  agent_email TEXT,
  seller_name TEXT,
  seller_phone TEXT,
  seller_email TEXT,
  
  -- Property details from call
  roof_age INTEGER,
  hvac_age INTEGER,
  occupancy occupancy_status DEFAULT 'unknown',
  monthly_rent NUMERIC(10,2),
  lease lease_type DEFAULT 'unknown',
  utilities_on BOOLEAN,
  
  -- Underwriting
  arv NUMERIC(12,2),
  repair_tier repair_tier,
  repair_tier_rate NUMERIC(5,2),          -- $/sqft (30, 45, or 60)
  repairs_estimate NUMERIC(12,2),
  wholesale_fee NUMERIC(12,2) DEFAULT 20000,
  existing_loan_balance NUMERIC(12,2) DEFAULT 0,
  existing_loan_rate NUMERIC(5,4) DEFAULT 0,
  existing_loan_type TEXT,                -- conventional, FHA, VA, etc.
  one_percent_rule BOOLEAN,
  one_percent_value NUMERIC(5,4),
  dscr NUMERIC(5,2),
  cash_flow NUMERIC(10,2),
  monthly_payment NUMERIC(10,2),
  
  -- Strategy
  recommended_strategy TEXT,
  cash_offer NUMERIC(12,2),
  f50_offer NUMERIC(12,2),
  f50_down NUMERIC(12,2),
  f50_carryback NUMERIC(12,2),
  f10_offer NUMERIC(12,2),
  f10_down NUMERIC(12,2),
  f10_carryback NUMERIC(12,2),
  subto_offer NUMERIC(12,2),
  subto_assumed_debt NUMERIC(12,2),
  midterm_offer NUMERIC(12,2),
  midterm_monthly_rent NUMERIC(10,2),
  
  -- Contract
  contract contract_type,
  contract_type TEXT,                     -- human-readable: 'PSA Creative SubTo', 'Stack PSA', etc.
  contract_draft_url TEXT,                -- URL to generated contract document
  psa_signed_date DATE,
  coe_date DATE,
  inspection_end_date DATE,
  inspection_period_days INTEGER DEFAULT 14,
  inspection_scheduled_date DATE,
  emd_amount NUMERIC(10,2) DEFAULT 100,
  has_subto_addendum BOOLEAN DEFAULT false,
  wrap_around_disclosure BOOLEAN DEFAULT false,
  title_company TEXT DEFAULT 'CLOSE Title',
  title_company_email TEXT DEFAULT 'order@closedtitle.com',
  title_company_phone TEXT DEFAULT '1-800-405-7150',
  tc_name TEXT DEFAULT 'BGonzalez',
  tc_email TEXT DEFAULT 'BGonzalez@sellsmartre.com',
  tc_phone TEXT DEFAULT '262-440-2916',
  llc_name TEXT,
  llc_role TEXT,
  
  -- RabbitSign
  rabbitsign_envelope_id TEXT,
  rabbitsign_status TEXT,                 -- sent, viewed, signed, completed, declined
  
  -- JV
  jv_type jv_type DEFAULT 'none',
  jv_parties TEXT[],                      -- array of party names
  jv_percentages NUMERIC(5,2)[],         -- array of percentages
  title_holder TEXT,                      -- entity holding title
  
  -- Wire / Closing
  wire_confirmed BOOLEAN DEFAULT false,
  subto_processor_confirmed BOOLEAN DEFAULT false,
  closing_cost_breakdown JSONB,           -- full breakdown from closing-cost-allocator
  estimated_profit NUMERIC(12,2),
  
  -- Appraisal
  appraisal_value NUMERIC(12,2),
  
  -- Negotiation
  seller_counter NUMERIC(12,2),
  
  -- Disposition
  disposition_status TEXT,                -- pending, assigned, sold, novated
  disposition_payout NUMERIC(12,2),
  
  -- Nurture
  nurture_stage nurture_stage DEFAULT 'none',
  
  -- Loan details (for SubTo)
  loan_number TEXT,
  lender_servicer TEXT,
  monthly_pi NUMERIC(10,2),              -- monthly principal + interest on existing loan
  
  -- Lead source tracking
  lead_source TEXT,                       -- detailed source (PPC, FB, Website, List_Pull, Referral, etc.)
  
  -- Dead deal tracking
  dead_reason TEXT,
  dom INTEGER,                            -- Days on Market
  dom_181_reminder_date DATE,
  
  -- Dates
  offer_sent_date TIMESTAMPTZ,
  follow_up_48hr_due TIMESTAMPTZ,
  follow_up_48hr_done BOOLEAN DEFAULT false,
  loi_sent_date TIMESTAMPTZ,
  loi_approved_date TIMESTAMPTZ,
  contract_date TIMESTAMPTZ,
  closed_date TIMESTAMPTZ,
  
  -- Metadata
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_stage_change_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_leads_user_id ON leads(user_id);
CREATE INDEX idx_leads_stage ON leads(stage);
CREATE INDEX idx_leads_created_at ON leads(created_at);
CREATE INDEX idx_leads_address ON leads(address);
CREATE INDEX idx_leads_follow_up ON leads(follow_up_48hr_due) WHERE follow_up_48hr_done = false;
CREATE INDEX idx_leads_nurture ON leads(nurture_stage) WHERE nurture_stage != 'none';
CREATE INDEX idx_leads_rabbitsign ON leads(rabbitsign_envelope_id) WHERE rabbitsign_envelope_id IS NOT NULL;

-- =============================================================
-- LEAD HISTORY (audit trail for every stage change)
-- =============================================================

CREATE TABLE lead_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_stage pipeline_stage,
  to_stage pipeline_stage NOT NULL,
  notes TEXT,
  changed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_history_lead ON lead_history(lead_id);

-- =============================================================
-- REMINDERS
-- =============================================================

CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('48hr_followup', 'dom_181', 'custom', 'inspection', 'coe', 'testimonial', 'referral', '72hr_title', '30_day_nurture', '60_day_nurture', '90_day_nurture', '181_day_nurture', 'appraisal', 'closing', 'wire', 'other')),
  due_date TIMESTAMPTZ NOT NULL,
  notes TEXT,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reminders_user ON reminders(user_id);
CREATE INDEX idx_reminders_due ON reminders(due_date) WHERE completed = false;

-- =============================================================
-- CONTRACTS (generated contract packages)
-- =============================================================

CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contract_type contract_type NOT NULL,
  template_name TEXT NOT NULL,
  addenda TEXT[],                         -- array of addendum names
  clauses TEXT[],                         -- array of clause IDs applied
  rabbitsign_envelope_id TEXT,            -- RabbitSign envelope ID after sending
  rabbitsign_status TEXT,                  -- sent, viewed, signed, completed, declined
  payload JSONB,                          -- full contract package as JSON
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contracts_lead ON contracts(lead_id);

-- =============================================================
-- CLAUSES LIBRARY (reference table — all 31 clauses)
-- =============================================================

CREATE TABLE clauses (
  id TEXT PRIMARY KEY,                    -- e.g. 'WRAP_AROUND_FINANCING_TRANSACTION'
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  requires_initial BOOLEAN DEFAULT false,
  conditional_on TEXT,                    -- e.g. 'VA_loan', 'subto'
  category TEXT NOT NULL,                 -- subto_addendum, seller_protection, psa_standard, jv, portfolio, legal
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- SCRIPT TEMPLATES (reference table — all templates)
-- =============================================================

CREATE TABLE script_templates (
  id TEXT PRIMARY KEY,                    -- e.g. 'int', 'ccc', 'contract_out'
  name TEXT NOT NULL,
  category TEXT NOT NULL,                 -- outreach, seller_update, ppc, call_script, pitch, objection, loi, contract
  body TEXT NOT NULL,                     -- template with {{placeholders}}
  merge_fields TEXT[],                    -- array of placeholder names
  stage pipeline_stage,                   -- which stage this script is used at
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- ACTIVITY LOG (everything that happens)
-- =============================================================

CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  action TEXT NOT NULL,                   -- lead_created, stage_changed, contract_generated, etc.
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_user ON activity_log(user_id);
CREATE INDEX idx_activity_lead ON activity_log(lead_id);
CREATE INDEX idx_activity_created ON activity_log(created_at);

-- =============================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================

-- Auto-update updated_at on leads
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Auto-log stage changes to lead_history
CREATE OR REPLACE FUNCTION log_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    NEW.last_stage_change_at = now();
    INSERT INTO lead_history (lead_id, from_stage, to_stage, changed_by)
    VALUES (NEW.id, OLD.stage, NEW.stage, NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_stage_change
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION log_stage_change();

-- =============================================================
-- SEED DATA: Clauses (all 31)
-- =============================================================

INSERT INTO clauses (id, title, text, requires_initial, conditional_on, category) VALUES
('WRAP_AROUND_FINANCING_TRANSACTION', 'Wrap-Around Financing Transaction', 'This is a wrap-around financing transaction, which means Buyer will pay the Existing Loan(s) according to the terms of the Existing Loan(s) and Seller may pursue foreclosure of the Property if Buyer fails to pay the Existing Loan(s) according to the terms of the Existing Loan(s).', true, null, 'subto_addendum'),
('WRAP_AROUND_FINANCING_IS_NON_RECOURSE', 'Wrap-Around Financing is Non-Recourse', 'The note delivered by Buyer to Seller for the wrap-around financing is non-recourse, which means Seller may only pursue the foreclosure of the Property if Buyer fails to pay the Existing Loan(s) according to the terms of the Existing Loan(s), Seller may not pursue a judgment against Buyer for the amounts stated in the note, and Seller may not seek a deficiency judgment against Buyer if the foreclosure of the Property yields an amount insufficient to fully satisfy Buyer''s obligations under the note.', true, null, 'subto_addendum'),
('WRAP_AROUND_FINANCING_IS_NOT_DUE_ON_SALE', 'Wrap-Around Financing is Not Due on Sale', 'Seller understands, acknowledges, and agrees that the note and deed of trust or mortgage delivered by Buyer to Seller for the wrap-around financing will not be due on sale, which means Buyer may sell or lease the Property in any fashion at Buyer''s sole option.', true, null, 'subto_addendum'),
('NO_LONGER_DEDUCT_MORTGAGE_INTEREST', 'No Longer Deduct Mortgage Interest', 'Seller understands, acknowledges, and agrees that Seller cannot deduct mortgage interest paid by Buyer even though Seller may continue to receive a form 1098 for the Existing Loan(s).', true, null, 'subto_addendum'),
('EVENT_OF_FORECLOSURE', 'Event of Foreclosure', 'Seller understands, acknowledges, and agrees that in the event the Existing Loan(s) are not paid by Buyer, the Property and Seller may be subject to foreclosure proceedings by the servicer(s) or lender(s) of the Existing Loan(s) and such proceedings may harm Seller''s credit, result in a loss of equity in the Property and subject Seller to a lawsuit for the deficiency (subject to any anti-deficiency laws).', true, null, 'subto_addendum'),
('EXISTING_LOAN_ON_CREDIT_REPORT', 'Existing Loan(s) on Credit Report', 'Seller understands, acknowledges, and agrees that the Existing Loan(s) may continue to appear on Seller''s credit report and may impact or effect Seller''s ability to obtain other financing or loans.', true, null, 'subto_addendum'),
('VA_LOAN_ELIGIBILITY_MAY_BE_IMPACTED', 'VA Loan Eligibility May Be Impacted', 'If an Existing Loan is a VA loan Seller understands, acknowledges, and agrees that the Existing Loan will not be paid off through closing and will remain as a lien against the Property after close of escrow, which may negatively impact Seller''s ability to obtain an additional loan through the VA.', true, 'VA_loan', 'subto_addendum'),
('PROPERTY_INSURANCE_PROCEEDS', 'Property Insurance Proceeds', 'Seller understands, acknowledges, and agrees that any insurance proceeds related to any loss on the Property occurring after COE shall be paid to Buyer. Seller shall not be entitled to receive any insurance proceeds for any loss on the Property occurring after COE.', true, null, 'subto_addendum'),
('DUE_ON_SALE_CLAUSE', 'Due on Sale Clause', 'Seller understands, acknowledges and agrees that the deed(s) of trust/mortgage(s) securing the Existing Loan(s) contain due on sale clauses, which allows the lender(s) to call the Existing Loan(s) due upon transfer of the Property by Seller to Buyer.', true, null, 'subto_addendum'),
('CONTINUING_LIABILITY_ON_EXISTING_LOAN', 'Continuing Liability on Existing Loan(s)', 'Seller understands, acknowledges, and agrees that no promises have been made by Buyer to Seller that the Existing Loan(s) will be paid off by Buyer through close of escrow and that upon the close of escrow and thereafter, Seller will remain liable on the Existing Loan(s).', true, null, 'subto_addendum'),
('EXISTING_LOAN_NOT_PAID_IN_FULL', 'Existing Loan(s) Not Paid in Full', 'Seller understands, acknowledges, and agrees that the Existing Loan(s) for which Seller is the borrower, will not be paid in full as a result of this transaction.', true, null, 'subto_addendum'),
('NO_FURTHER_OWNERSHIP_OR_CONTROL', 'No Further Ownership or Control', 'Seller understands, acknowledges, and agrees that upon close of escrow, Seller will no longer own the Property and no further control over the Property. Buyer may sell or lease the Property in any fashion at Buyer''s sole option.', true, null, 'subto_addendum'),
('FOUR_LAYER_SELLER_PROTECTION', 'Four Layers of Seller Protection', 'There are four layers of protection in place for the seller: (1) A bookkeeper will be in place to ensure automated wires are sent each month via direct deposit (for the existing payments and seller financing portion), (2) a performance clause within the agreement, (3) a promissory note ensuring the balloon payment is automatically wired at maturity, (4) a deed in lieu of foreclosure that allows the seller to regain ownership of the property within 15 days of a missed payment—bypassing the foreclosure process and preserving the built-in equity and completed renovations.', false, 'subto', 'seller_protection'),
('FIVE_LAYER_SELLER_PROTECTION', 'Five Layers of Seller Protection', 'There are five layers of protection in place for the seller: (1) A bookkeeper will be in place to ensure automated wires are sent each month via direct deposit, (2) a performance clause within the agreement, (3) a promissory note ensuring the balloon payment is automatically wired at maturity, (4) a deed in lieu of foreclosure that allows the seller to regain ownership of the property within 15 days of a missed payment—bypassing the foreclosure process and preserving the built-in equity and completed renovations—and (5) a personal guarantee.', false, 'subto', 'seller_protection'),
('EMD_100_TO_1PCT', 'Earnest Money Deposit', 'Earnest money $100 minimum. Maximum 1% of the purchase price. Given after the inspection period (typically 14 days, up to 21 days if negotiated).', false, null, 'psa_standard'),
('INSPECTION_PERIOD_14_21', 'Inspection Period', 'Inspection Period: 14 Days default. 21 days maximum if negotiated. More days = more time to get bids.', false, null, 'psa_standard'),
('COE_30_DAYS', 'Close of Escrow', 'Close of Escrow: 30 days after Effective Date. Do not use a specific calendar date — use "30 days from the date this contract is fully executed" because the seller may not sign on the exact day expected.', false, null, 'psa_standard'),
('DEED_IN_LIEU', 'Deed in Lieu of Foreclosure', 'A deed in lieu will be authorized at close of escrow — if buyer misses a payment for more than 30 days then the property will be deeded back to the seller — bypassing the foreclosure process.', false, null, 'psa_standard'),
('AS_IS_SALE', 'AS-IS Sale', 'This is an AS-IS sale. Any inspection performed is for the buyer''s awareness only.', false, null, 'psa_standard'),
('THIRD_PARTY_PROCESSOR', 'Third-Party Processing Company', 'A third-party processing company will be set up within 48 hours of close of escrow. This will automate the monthly payments to the existing loan servicer and to the seller (for the seller carryback portion).', false, 'subto', 'psa_standard'),
('CLOSED_TITLE_DEFAULT', 'CLOSE Title — Default Escrow Agent', 'Escrow Agent / Closing Attorney: CLOSE Title — 6100 Executive Blvd Suite 410, Rockville, MD 20852 — 240-403-1285 — order@closedtitle.com — 1-800-405-7150. Nationwide coverage.', false, null, 'psa_standard'),
('JV_DEFAULT_25_PERCENT', 'JV Default 25% Per Party', 'Default profit allocation: 25% per party in a 4-party Joint Venture.', false, null, 'jv'),
('JV_MAJORITY_51', 'JV Majority in Interest (51%)', 'Majority in Interest means one or more Parties whose aggregate Voting Percentage is equal to or exceeds fifty-one percent (51%) of the aggregate Voting Percentage of all the Parties.', false, null, 'jv'),
('JV_SUPER_MAJORITY_66', 'JV Super Majority (66%)', 'Super Majority in Interest means one or more Parties whose Voting Percentage is equal to or exceeds sixty-six percent (66%) of the aggregate Voting Percentage of all Parties. Required for lien/sale decisions.', false, null, 'jv'),
('JV_NON_PAYMENT_25PCT_INTEREST', 'JV Non-Payment Penalty (25% Per Annum)', 'In the event a Party fails or refuses to pay their portion of the Initial Expenses, the other Party(ies) may, after five (5) days written notice, pay the non-paying Party''s share. The Party paying on behalf shall receive interest of 25% per annum on the amount paid, with interest payments paid monthly and deducted from the non-paying Party''s Monthly Cash Flow Payment.', false, null, 'jv'),
('JV_INITIAL_RESERVE_5K', 'JV Initial Reserve ($5,000)', 'The amount of cash reserves to be held for the Purpose of the Joint Venture shall initially be five thousand dollars ($5,000) or as agreed to by a vote of the Majority in Interest of the Parties.', false, null, 'jv'),
('JV_DISPUTE_MEDIATION', 'JV Dispute Resolution (Mediation)', 'In the event of a deadlock and upon written demand by one of the Parties, a disputed issue will be presented to a mediator with commercial dispute resolution experience. The mediation will be held in the state and county where the Property is located. Each Party is responsible for their pro-rata portion of the mediator''s fees.', false, null, 'jv'),
('LLC_FORMATION_AT_CLOSING', 'LLC Formation at Closing', 'Buyer and Seller agree that, on or before closing, a limited liability company (LLC) shall be formed. The Buyer and Seller shall be members of said LLC, with ownership interests to be defined in a separate Operating Agreement.', false, 'portfolio', 'portfolio'),
('OPERATING_AGREEMENT_REFERENCE', 'Operating Agreement Reference', 'The Operating Agreement of the LLC, executed contemporaneously with this Purchase and Sale Agreement, defines each Member''s initial capital contribution, distribution waterfall, management rights, transfer restrictions, and dissolution triggers.', false, 'portfolio', 'portfolio'),
('MULTI_PROPERTY_SIMULTANEOUS_CLOSING', 'Multi-Property Simultaneous Closing', 'All properties in the portfolio shall be purchased simultaneously at the total purchase price. Individual property allocations to be detailed in an attached schedule.', false, 'portfolio', 'portfolio'),
('NON_CIRCUMVENTION_CLAUSE', 'Non-Circumvention Clause', 'The Receiving Party agrees that during the term of this Agreement they shall not directly or indirectly circumvent, avoid, bypass, or attempt to circumvent the Disclosing Party in order to avoid payment of fees, commissions, or other benefits that would otherwise be due in connection with any transaction, opportunity, or relationship introduced or disclosed by the Disclosing Party.', false, null, 'legal');

-- =============================================================
-- SEED DATA: Script Templates (core set)
-- =============================================================

INSERT INTO script_templates (id, name, category, body, merge_fields, stage) VALUES
('int', 'INT - Intro Text', 'outreach', '{{seller_name}}, are you still accepting offers for {{address}}? My name is Montelli, I''m looking to purchase a rental for my portfolio.', ARRAY['seller_name', 'address'], 'LEAD_ENTERED'),
('ccc', 'CCC - Contact Card', 'outreach', 'It is great aligning with you {{seller_name}}, I look forward to connecting the dots with you shortly at {{address}}. Feel free to browse through our closings with similar clients on our website — Divinity Aligned LLC: Expert Solutions for Life''s Major Transitions', ARRAY['seller_name', 'address'], 'CONTACT_MADE'),
('gcj', 'GCJ - Group Chat Join', 'outreach', '{{seller_name}} - happy {{day}}! Creating a group chat for the purchase on {{address}} with my business partner Kayla. She is currently in a meeting with our lender; The LOI will be coming from our partner at homewithkaylamauser@gmail.com ; simply inform us it has been received for presentation, and also ensure to check other folders as well. Have a blessed rest of your week!', ARRAY['seller_name', 'day', 'address'], 'OFFER_SENT'),
('sd', 'SD - Seller Declined', 'outreach', 'Happy {{day}}! Thank you for the update – feel free to revisit this right before the listing expires if your seller has not been able to find their number with owner occupants. Wishing you a smooth closing – feel free to keep us in mind for the future if you have listings that can''t sell out right and are owned outright.', ARRAY['day'], 'DEAD'),
('contract_out', 'CONTRACT_OUT - PSA Signed', 'seller_update', 'Hi {{seller_name}}, your purchase agreement for {{address}} has been fully signed! Here''s your timeline: Contract Effective Date: {{psa_signed_date}}, Inspection Period: {{inspection_days}} days (ends {{inspection_end}}), Close of Escrow: {{coe_date}}, Title Company: {{title_company}} ({{title_phone}}). Next: Our transaction coordinator {{tc_name}} ({{tc_email}}, {{tc_phone}}) will reach out about lockbox/utility access for inspection.', ARRAY['seller_name', 'address', 'psa_signed_date', 'inspection_days', 'inspection_end', 'coe_date', 'title_company', 'title_phone', 'tc_name', 'tc_email', 'tc_phone'], 'CONTRACT_OUT'),
('closing_confirmed', 'CLOSING_CONFIRMED - 7 Days to COE', 'seller_update', 'Hi {{seller_name}}, we''re ONE WEEK from closing on {{address}}! Closing Details: Close of Escrow Date: {{coe_date}}, Title Company: {{title_company}} ({{title_phone}}), Your net proceeds: {{net_to_seller}}.', ARRAY['seller_name', 'address', 'coe_date', 'title_company', 'title_phone', 'net_to_seller'], 'CLOSING_DATE');
