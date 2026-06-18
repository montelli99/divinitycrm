// =============================================================
// Migration: Student Roster + Vacation Coverage Columns
// =============================================================
// Adds to users table:
//   - payment_tier, square_customer_id, start_date
//   - assigned_markets, offer_type, closer_payout_percent
//   - student_status, vacation_mode, substitute_id
//   - coverage_start, coverage_end, vacation_reason
// =============================================================

const { query } = require('./connection');

async function migrate() {
  console.log('Running student roster migration...');

  // Add student metadata columns
  const studentCols = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_tier TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS square_customer_id TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS start_date DATE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_markets TEXT[]`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS offer_type TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS closer_payout_percent NUMERIC(5,2)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS student_status TEXT DEFAULT 'active'`,
  ];

  // Add vacation coverage columns
  const vacationCols = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS vacation_mode BOOLEAN DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS substitute_id UUID REFERENCES users(id) ON DELETE SET NULL`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS coverage_start TIMESTAMPTZ`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS coverage_end TIMESTAMPTZ`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS vacation_reason TEXT`,
  ];

  const allCols = [...studentCols, ...vacationCols];

  for (const sql of allCols) {
    try {
      await query(sql);
      console.log('  OK:', sql.substring(0, 60) + '...');
    } catch (err) {
      console.error('  FAIL:', sql.substring(0, 60) + '...', err.message);
    }
  }

  // Add index on vacation_mode for quick scans
  try {
    await query(`CREATE INDEX IF NOT EXISTS idx_users_vacation ON users(vacation_mode) WHERE vacation_mode = true`);
    console.log('  OK: vacation_mode index');
  } catch (err) {
    console.error('  FAIL: vacation_mode index', err.message);
  }

  console.log('Student roster migration complete.');
}

// Run if called directly
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}

module.exports = { migrate };
