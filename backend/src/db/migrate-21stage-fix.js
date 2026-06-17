/**
 * Migration Fix: Convert pipeline_stage from ENUM to TEXT
 * Run: node src/db/migrate-21stage-fix.js
 * 
 * The old pipeline_stage enum doesn't include the 21 new stage names.
 * We need to convert the stage column to TEXT to support all 21 stages.
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

async function fix() {
  console.log('=== 21-STAGE PIPELINE MIGRATION FIX ===');
  console.log('Testing connection...');
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('Database connection failed. Aborting.');
    process.exit(1);
  }
  console.log('Connected to Neon DB.');

  // Step 1: Convert stage column from enum to TEXT
  console.log('\nStep 1: Converting stage column from enum to TEXT...');
  try {
    // First, drop the default
    await query(`ALTER TABLE leads ALTER COLUMN stage DROP DEFAULT`);
    console.log('  ✓ Dropped default');
    
    // Convert the column type using USING clause
    await query(`ALTER TABLE leads ALTER COLUMN stage TYPE TEXT USING stage::TEXT`);
    console.log('  ✓ Converted stage column to TEXT');
    
    // Set new default
    await query(`ALTER TABLE leads ALTER COLUMN stage SET DEFAULT 'LEAD_ENTERED'`);
    console.log('  ✓ Set new default to LEAD_ENTERED');
  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`);
  }

  // Step 2: Also convert lead_history stage columns
  console.log('\nStep 2: Converting lead_history stage columns...');
  try {
    await query(`ALTER TABLE lead_history ALTER COLUMN from_stage TYPE TEXT USING from_stage::TEXT`);
    console.log('  ✓ Converted lead_history.from_stage to TEXT');
  } catch (err) {
    console.error(`  ✗ from_stage: ${err.message}`);
  }
  try {
    await query(`ALTER TABLE lead_history ALTER COLUMN to_stage TYPE TEXT USING to_stage::TEXT`);
    console.log('  ✓ Converted lead_history.to_stage to TEXT');
  } catch (err) {
    console.error(`  ✗ to_stage: ${err.message}`);
  }

  // Step 3: Convert script_templates stage column
  console.log('\nStep 3: Converting script_templates stage column...');
  try {
    await query(`ALTER TABLE script_templates ALTER COLUMN stage TYPE TEXT USING stage::TEXT`);
    console.log('  ✓ Converted script_templates.stage to TEXT');
  } catch (err) {
    console.error(`  ✗: ${err.message}`);
  }

  // Step 4: Now map existing leads to new stage names
  console.log('\nStep 4: Mapping existing leads to new stage names...');
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

  // Step 5: Update script_templates stage references
  console.log('\nStep 5: Updating script template stage references...');
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

  // Step 6: Drop the old enum type (optional — cleanup)
  console.log('\nStep 6: Dropping old enum types...');
  try {
    await query(`DROP TYPE IF EXISTS pipeline_stage CASCADE`);
    console.log('  ✓ Dropped pipeline_stage enum');
  } catch (err) {
    console.error(`  ✗: ${err.message}`);
  }

  // Step 7: Verify
  console.log('\nStep 7: Verifying...');
  const stageCheck = await query(`SELECT DISTINCT stage FROM leads`);
  const currentStages = stageCheck.map(r => r.stage);
  console.log(`  Current stages in DB: ${currentStages.join(', ')}`);

  console.log('\n=== MIGRATION FIX COMPLETE ===');
  console.log('All 21 stages now supported. Restart backend to pick up changes.');
}

fix().catch(err => {
  console.error('Migration fix failed:', err);
  process.exit(1);
});
