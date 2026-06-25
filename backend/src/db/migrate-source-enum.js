const { query } = require('../db/connection');

(async () => {
  try {
    const r = await query("SELECT enum_range(NULL::lead_source) AS values");
    console.log('Current enum:', r[0].values);

    // Add the missing frontend source values
    const newValues = ['kayla_sheet', 'ppc', 'website', 'list_pull', 'cold_call', 'direct_mail', 'bandit_sign', 'open_house', 'zillow', 'redfin'];
    for (const v of newValues) {
      try {
        await query(`ALTER TYPE lead_source ADD VALUE IF NOT EXISTS '${v}'`);
        console.log(`  + ${v}`);
      } catch (e) {
        console.log(`  ~ ${v}: ${e.message}`);
      }
    }
    const r2 = await query("SELECT enum_range(NULL::lead_source) AS values");
    console.log('New enum:', r2[0].values);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();