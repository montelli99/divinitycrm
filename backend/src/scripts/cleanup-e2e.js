const { query } = require('../db/connection');
async function main() {
  await query("DELETE FROM contracts WHERE lead_id IN (SELECT id FROM leads WHERE address LIKE '%E2E Test%')");
  await query("DELETE FROM activity_log WHERE lead_id IN (SELECT id FROM leads WHERE address LIKE '%E2E Test%')");
  await query("DELETE FROM leads WHERE address LIKE '%E2E Test%'");
  console.log('cleaned');
}
main().catch(console.error);