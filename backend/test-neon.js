const { neon } = require('@neondatabase/serverless');
const sql = neon('postgresql://neondb_owner:npg_FRI6QcAp0fJu@ep-divine-term-adcheii9-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require');

async function test() {
  // Test 1: simple query
  try { const r = await sql`SELECT 1 as n`; console.log('simple:', r[0].n); } catch(e) { console.log('simple FAIL:', e.message); }
  
  // Test 2: composed query (like the GET handler)
  try {
    let q = sql`SELECT * FROM leads WHERE user_id = ${'7e80ebd0-fa54-43b3-a936-495c96e38cef'}`;
    q = sql`${q} ORDER BY updated_at DESC LIMIT ${3} OFFSET ${0}`;
    const r = await q;
    console.log('composed OK, rows:', r.length);
  } catch(e) { console.log('composed FAIL:', e.message); }
  
  // Test 3: dynamic UPDATE with sql.unsafe
  try {
    const frag = sql`${sql.unsafe('notes')} = ${'test note'}`;
    const r = await sql`UPDATE leads SET ${frag} WHERE id = ${'test-id'} RETURNING *`;
    console.log('dynamic UPDATE OK');
  } catch(e) { console.log('dynamic UPDATE FAIL:', e.message); }
  
  process.exit(0);
}
test();
