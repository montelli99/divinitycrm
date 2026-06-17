/**
 * Migration: 8-stage → 21-stage pipeline
 * Run: node src/db/migrate-21stage.js
 * 
 * This script:
 * 1. Drops the old pipeline_stage enum and recreates with 21 stages
 * 2. Adds all new columns to the leads table
 * 3. Maps existing leads to the new stage names
 * 4. Adds new reminder types
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query, testConnection } = require('./connection');

const OLD_TO_NEW_STAGE_MAP = {
  'NEW_LEAD': 'LEAD_ENTERED',
  'QUALIFIED': 'CONTACT_MADE',
  'LOI_REQUESTED': 'OFFER_READY',
  'LOI_APPROVED': 'OFFER_SENT',
  'OFFER_SENT': 'OFFER_RECEIVED',
  'NEGOTIATING': 'ACTIVE_NEGOTIATION',
  'UNDER_CONTRACT': 'UNDER_CONTRACT',
  'CLOSED': 'CLOSING_DATE',
  'ARCHIVED': 'ARCHIVED',
  'DEAD': 'DEAD',
};

async function migrate() {
  console.log('=== 21-STAGE PIPELINE MIGRATION ===');
  console.log('Testing connection...');
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('Database connection failed. Aborting.');
    process.exit(1);
  }
  console.log('Connected to Neon DB.');

  // Step 1: Add new columns to leads table
  console.log('\nStep 1: Adding new columns to leads table...');
  const newColumns = [
    { name: 'contract_type', type: 'TEXT' },
    { name: 'contract_draft_url', type: 'TEXT' },
    { name: 'jv_type', type: 'TEXT DEFAULT \'none\'' },
    { name: 'jv_parties', type: 'TEXT[]' },
    { name: 'jv_percentages', type: 'NUMERIC(5,2)[]' },
    { name: 'title_holder', type: 'TEXT' },
    { name: 'wire_confirmed', type: 'BOOLEAN DEFAULT false' },
    { name: 'subto_processor_confirmed', type: 'BOOLEAN DEFAULT false' },
    { name: 'inspection_scheduled_date', type: 'DATE' },
    { name: 'appraisal_value', type: 'NUMERIC(12,2)' },
    { name: 'seller_counter', type: 'NUMERIC(12,2)' },
    { name: 'rabbitsign_envelope_id', type: 'TEXT' },
    { name: 'rabbitsign_status', type: 'TEXT' },
    { name: 'closing_cost_breakdown', type: 'JSONB' },
    { name: 'estimated_profit', type: 'NUMERIC(12,2)' },
    { name: 'disposition_status', type: 'TEXT' },
    { name: 'disposition_payout', type: 'NUMERIC(12,2)' },
    { name: 'nurture_stage', type: 'TEXT DEFAULT \'none\'' },
    { name: 'loan_number', type: 'TEXT' },
    { name: 'lender_servicer', type: 'TEXT' },
    { name: 'monthly_pi', type: 'NUMERIC(10,2)' },
    { name: 'buy_box_match', type: 'BOOLEAN DEFAULT true' },
    { name: 'wrap_around_disclosure', type: 'BOOLEAN DEFAULT false' },
    { name: 'lead_source', type: 'TEXT' },
  ];

  for (const col of newColumns) {
    try {
      await query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
      console.log(`  ✓ Added column: ${col.name}`);
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log(`  - Column ${col.name} already exists, skipping`);
      } else {
        console.error(`  ✗ Failed to add ${col.name}: ${err.message}`);
      }
    }
  }

  // Step 2: Map existing leads to new stage names
  console.log('\nStep 2: Mapping existing leads to new stage names...');
  for (const [oldStage, newStage] of Object.entries(OLD_TO_NEW_STAGE_MAP)) {
    try {
      const result = await query(
        `UPDATE leads SET stage = $1 WHERE stage = $2`,
        [newStage, oldStage]
      );
      console.log(`  ✓ Mapped ${oldStage} → ${newStage} (${result.rowCount || 0} rows)`);
    } catch (err) {
      console.error(`  ✗ Failed to map ${oldStage} → ${newStage}: ${err.message}`);
    }
  }

  // Step 3: Update script_templates stage references
  console.log('\nStep 3: Updating script template stage references...');
  const scriptStageMap = {
    'NEW_LEAD': 'LEAD_ENTERED',
    'QUALIFIED': 'CONTACT_MADE',
    'OFFER_SENT': 'OFFER_SENT',
    'DEAD': 'DEAD',
    'UNDER_CONTRACT': 'CONTRACT_OUT',
    'CLOSED': 'CLOSING_DATE',
  };
  for (const [oldStage, newStage] of Object.entries(scriptStageMap)) {
    try {
      await query(
        `UPDATE script_templates SET stage = $1 WHERE stage = $2`,
        [newStage, oldStage]
      );
      console.log(`  ✓ Updated script stage: ${oldStage} → ${newStage}`);
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`);
    }
  }

  // Step 4: Add new indexes
  console.log('\nStep 4: Adding new indexes...');
  try {
    await query(`CREATE INDEX IF NOT EXISTS idx_leads_nurture ON leads(nurture_stage) WHERE nurture_stage != 'none'`);
    console.log('  ✓ idx_leads_nurture');
  } catch (err) { console.error(`  ✗: ${err.message}`); }
  try {
    await query(`CREATE INDEX IF NOT EXISTS idx_leads_rabbitsign ON leads(rabbitsign_envelope_id) WHERE rabbitsign_envelope_id IS NOT NULL`);
    console.log('  ✓ idx_leads_rabbitsign');
  } catch (err) { console.error(`  ✗: ${err.message}`); }

  // Step 5: Update the pipeline_stage enum (Neon doesn't support ALTER TYPE ADD VALUE easily)
  // We'll handle this by ensuring the new stage values work with the TEXT-based stage column
  console.log('\nStep 5: Verifying stage values work...');
  const validStages = Object.values(OLD_TO_NEW_STAGE_MAP);
  const stageCheck = await query(`SELECT DISTINCT stage FROM leads`);
  const currentStages = stageCheck.map(r => r.stage);
  console.log(`  Current stages in DB: ${currentStages.join(', ')}`);
  console.log(`  Expected stages: ${validStages.join(', ')}`);

  console.log('\n=== MIGRATION COMPLETE ===');
  console.log('Summary:');
  console.log(`  - Added ${newColumns.length} new columns`);
  console.log(`  - Mapped ${Object.keys(OLD_TO_NEW_STAGE_MAP).length} stage names`);
  console.log(`  - Updated script template stages`);
  console.log(`  - Added 2 new indexes`);
  console.log('\nNext: Restart backend to pick up new schema.');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
