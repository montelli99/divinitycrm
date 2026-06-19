const { neon } = require('@neondatabase/serverless');
require('dotenv').config({path: 'C:/Users/mscott/AI_Workspace/prolificcapital/divinitycrm/backend/.env'});
const sql = neon(process.env.DATABASE_URL);

(async()=>{
  const r = await sql("SELECT id, name, category, stage, LENGTH(body) as len, body FROM script_templates ORDER BY category, name");
  console.log('Total script_templates:',r.length);
  for (const x of r) console.log(x.id.padEnd(20), '|', x.category.padEnd(18), '|', (x.stage||'-').padEnd(22), '|', x.name.padEnd(40), '|', x.len, 'chars');
})().catch(e=>{console.error('ERR:',e.message);process.exit(1)});
