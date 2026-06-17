// =============================================================
// Divinity CRM Platform — Database Connection (Neon Serverless)
// =============================================================

const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not set. Copy .env.example to .env and fill in your Neon connection string.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// Test connection on startup
async function testConnection() {
  try {
    const result = await sql`SELECT 1 AS connected`;
    console.log('Neon database connected:', result[0].connected === 1 ? 'OK' : 'FAIL');
    return true;
  } catch (err) {
    console.error('Database connection failed:', err.message);
    return false;
  }
}

module.exports = { sql, testConnection };

