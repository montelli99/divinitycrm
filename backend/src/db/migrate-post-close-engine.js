/**
 * Migration: Add post-close engine fields to leads
 * Run: node src/db/migrate-post-close-engine.js
 *
 * Adds the columns referenced by stage-automations.js but missing in schema:
 *   - jv_title_holder: Set at JV_SIGNED → WIRE_SETUP
 *   - jv_signed_date: Set at JV_SIGNED → WIRE_SETUP
 *   - inspection_complete_date: Set at INSPECTION_PERIOD → INSPECTION_COMPLETE
 *
 * Also relaxes the reminders_type_check constraint to allow post-close
 * reminder types: inspection_day_7_sms, inspection_day_14_kayla_alert,
 * inspection_period_end
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { query, testConnection } = require('./connection');

async function migrate() {
  console.log('=== POST-CLOSE ENGINE MIGRATION ===');
  console.log('Testing connection...');
  await testConnection();

  console.log('\n1. Adding jv_title_holder column...');
  await query('ALTER TABLE leads ADD COLUMN IF NOT EXISTS jv_title_holder TEXT');
  console.log('   ✓ jv_title_holder');

  console.log('\n2. Adding jv_signed_date column...');
  await query('ALTER TABLE leads ADD COLUMN IF NOT EXISTS jv_signed_date TIMESTAMPTZ');
  console.log('   ✓ jv_signed_date');

  console.log('\n3. Adding inspection_complete_date column...');
  await query('ALTER TABLE leads ADD COLUMN IF NOT EXISTS inspection_complete_date TIMESTAMPTZ');
  console.log('   ✓ inspection_complete_date');

  console.log('\n4. Adding appraisal_ordered_date column...');
  await query('ALTER TABLE leads ADD COLUMN IF NOT EXISTS appraisal_ordered_date TIMESTAMPTZ');
  console.log('   ✓ appraisal_ordered_date');

  console.log('\n5. Adding appraisal_done_date column...');
  await query('ALTER TABLE leads ADD COLUMN IF NOT EXISTS appraisal_done_date TIMESTAMPTZ');
  console.log('   ✓ appraisal_done_date');

  console.log('\n6. Adding appraisal_value column...');
  await query('ALTER TABLE leads ADD COLUMN IF NOT EXISTS appraisal_value NUMERIC');
  console.log('   ✓ appraisal_value');

  console.log('\n7. Adding draft_loi_url column...');
  await query('ALTER TABLE leads ADD COLUMN IF NOT EXISTS draft_loi_url TEXT');
  console.log('   ✓ draft_loi_url');

  console.log('\n8. Adding draft_loi_body column...');
  await query('ALTER TABLE leads ADD COLUMN IF NOT EXISTS draft_loi_body TEXT');
  console.log('   ✓ draft_loi_body');

  console.log('\n4. Dropping and recreating reminders_type_check constraint to allow inspection_day_* types...');
  try {
    await query('ALTER TABLE reminders DROP CONSTRAINT IF EXISTS reminders_type_check');
    await query(`
      ALTER TABLE reminders ADD CONSTRAINT reminders_type_check CHECK (type IN (
        '48hr_followup', 'dom_181', 'custom', 'inspection', 'inspection_day_7_sms',
        'inspection_day_14_kayla_alert', 'inspection_period_end',
        'coe', 'testimonial', 'referral', '72hr_title',
        '30_day_nurture', '60_day_nurture', '90_day_nurture', '181_day_nurture',
        'appraisal', 'closing', 'wire', 'other'
      ))
    `);
    console.log('   ✓ Constraint updated');
  } catch (e) {
    console.log(`   ! Could not update constraint: ${e.message}`);
  }

  console.log('\n=== MIGRATION COMPLETE ===');
  console.log('Re-run stage-coverage tests to verify:');
  console.log('  cd backend && node --test tests/scenarios/stage-coverage.test.js');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});