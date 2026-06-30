const { query } = require('../db/connection');
async function main() {
  const r = await query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'leads' ORDER BY ordinal_position");
  r.forEach(c => console.log(c.column_name + ': ' + c.data_type));
}
main().catch(console.error);