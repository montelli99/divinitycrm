const { neon } = require('@neondatabase/serverless');
require('dotenv').config({path: 'C:/Users/mscott/AI_Workspace/prolificcapital/divinitycrm/backend/.env'});
const sql = neon(process.env.DATABASE_URL);
(async()=>{
  const cols = await sql("SELECT column_name FROM information_schema.columns WHERE table_name='users'");
  console.log('users columns:', cols.map(c=>c.column_name).join(', '));
  const r = await sql("SELECT * FROM users ORDER BY role, email");
  for (const x of r) console.log((x.role||'').padEnd(8), '|', (x.email||'').padEnd(45), '|', (x.name||x.full_name||x.id));
})();
