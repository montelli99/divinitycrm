const { query } = require('../db/connection');
async function main() {
  const r = await query("SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'lead_source'");
  r.forEach(x => console.log(x.enumlabel));
}
main().catch(console.error);