const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_FRI6QcAp0fJu@ep-divine-term-adcheii9-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' });

async function test() {
  const client = await pool.connect();
  
  // Test 1: simple
  const r1 = await client.query('SELECT 1 as n');
  console.log('simple:', r1.rows[0].n);

  // Test 2: composed query with params
  const uid = '7e80ebd0-fa54-43b3-a936-495c96e38cef';
  const r2 = await client.query(
    'SELECT * FROM leads WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3',
    [uid, 3, 0]
  );
  console.log('composed OK, rows:', r2.rows.length);

  // Test 3: dynamic UPDATE
  const r3 = await client.query(
    'UPDATE leads SET notes = $1 WHERE id = $2 RETURNING *',
    ['test note', uid]
  );
  console.log('dynamic UPDATE OK, returned:', r3.rows.length);

  client.release();
  await pool.end();
  console.log('All tests passed');
  process.exit(0);
}
test().catch(e => { console.error(e.message); process.exit(1); });
