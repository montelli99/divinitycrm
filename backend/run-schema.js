// Run schema against Neon using pg driver directly
const { Pool } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  const client = await pool.connect();
  
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'src', 'db', 'schema.sql'), 'utf8');
    
    // Execute the entire schema as one transaction
    console.log('Running schema...');
    await client.query('BEGIN');
    await client.query(schema);
    await client.query('COMMIT');
    console.log('Schema applied successfully!');
    
    // Verify
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    console.log('Tables:', tables.rows.map(r => r.table_name).join(', '));
    
    const clauses = await client.query('SELECT COUNT(*) FROM clauses');
    console.log('Clauses:', clauses.rows[0].count);
    
    const scripts = await client.query('SELECT COUNT(*) FROM script_templates');
    console.log('Scripts:', scripts.rows[0].count);
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err.message);
    console.error('Detail:', err.detail || 'none');
  } finally {
    client.release();
    await pool.end();
  }
  
  console.log('Done!');
  process.exit(0);
}

run();

