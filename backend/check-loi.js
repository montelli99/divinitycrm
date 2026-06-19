const { neon } = require('@neondatabase/serverless');
require('dotenv').config({path: 'C:/Users/mscott/AI_Workspace/prolificcapital/divinitycrm/backend/.env'});
const sql = neon(process.env.DATABASE_URL);
(async()=>{
  const r = await sql("SELECT id, lead_id, action, details FROM activity_log WHERE action='loi_requested_seth' OR action LIKE '%loi%' ORDER BY created_at DESC LIMIT 5");
  for (const x of r) console.log(x.action.padEnd(28), '|', x.details);
})();
