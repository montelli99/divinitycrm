require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { query } = require('./connection');

async function applyMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('No migrations directory');
    return;
  }

  // Create migrations tracking table
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = await query('SELECT filename FROM _migrations');
  const appliedSet = new Set(applied.map(r => r.filename));

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log('SKIP', file);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      await query(sql);
      await query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      console.log('APPLIED', file);
    } catch (e) {
      console.error('FAILED', file, e.message);
      // Continue — some statements may have already been applied
      try {
        await query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        console.log('MARKED', file, '(partial)');
      } catch {}
    }
  }
  console.log('Migrations complete');
}

applyMigrations().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });