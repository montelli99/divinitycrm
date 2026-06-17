const { neon } = require('@neondatabase/serverless');
const sql = neon('postgresql://neondb_owner:npg_FRI6QcAp0fJu@ep-divine-term-adcheii9-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require');

async function test() {
  // Test 1: simple
  const r1 = await sql`SELECT 1 as n`;
  console.log('simple:', r1[0].n);

  // Test 2: composed query
  const uid = '7e80ebd0-fa54-43b3-a936-495c96e38cef';
  let q = sql`SELECT * FROM leads WHERE user_id = ${uid}`;
  q = sql`${q} ORDER BY updated_at DESC LIMIT ${3} OFFSET ${0}`;
  try {
    const r2 = await q;
    console.log('composed OK, rows:', r2.length);
  } catch(e) {
    console.log('composed FAIL:', e.message);
  }

  // Test 3: sql.unsafe
  console.log('sql.unsafe type:', typeof sql.unsafe);
  if (typeof sql.unsafe === 'function') {
    try {
      const frag = sql`${sql.unsafe('notes')} = ${'test'}`;
      console.log('unsafe frag OK');
    } catch(e) {
      console.log('unsafe frag FAIL:', e.message);
    }
  }

  process.exit(0);
}
test();
