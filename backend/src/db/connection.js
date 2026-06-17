// =============================================================
// Divinity CRM Platform — Database Connection (Neon Serverless)
// Uses Pool for standard parameterized queries ($1, $2, ...)
// =============================================================

const { Pool } = require('@neondatabase/serverless');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not set. Copy .env.example to .env and fill in your Neon connection string.');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

// Query helper — standard pg parameterized queries
async function query(text, params) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows;
  } finally {
    client.release();
  }
}

// Single-row query helper
async function queryOne(text, params) {
  const rows = await query(text, params);
  return rows[0] || null;
}

// Test connection on startup
async function testConnection() {
  try {
    const result = await query('SELECT 1 AS connected');
    console.log('Neon database connected:', result[0].connected === 1 ? 'OK' : 'FAIL');
    return true;
  } catch (err) {
    console.error('Database connection failed:', err.message);
    return false;
  }
}

module.exports = { pool, query, queryOne, testConnection };
