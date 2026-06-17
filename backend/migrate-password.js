const { neon } = require('@neondatabase/serverless');
require('dotenv').config();
const sql = neon(process.env.DATABASE_URL);

async function main() {
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`;
  console.log('password_hash column added');
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
