// =============================================================
// Divinity CRM Platform — Scripts API Routes
// =============================================================

const { Router } = require('express');
const { sql } = require('../db/connection');

const router = Router();

// GET /api/scripts — List all script templates
router.get('/', async (req, res, next) => {
  try {
    const { category } = req.query;
    let query = sql`SELECT * FROM script_templates`;
    if (category) {
      query = sql`${query} WHERE category = ${category}`;
    }
    query = sql`${query} ORDER BY category, id`;
    const scripts = await query;
    res.json({ scripts });
  } catch (err) {
    next(err);
  }
});

// GET /api/scripts/:id — Get single script template
router.get('/:id', async (req, res, next) => {
  try {
    const script = await sql`SELECT * FROM script_templates WHERE id = ${req.params.id}`;
    if (script.length === 0) return res.status(404).json({ error: 'Script not found' });
    res.json({ script: script[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/scripts/fill — Fill a script template with lead data
router.post('/fill', async (req, res, next) => {
  try {
    const clerkId = req.user.userId;
    const user = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`;
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const { script_id, lead_id } = req.body;
    if (!script_id || !lead_id) {
      return res.status(400).json({ error: 'script_id and lead_id are required' });
    }

    // Fetch script template
    const script = await sql`SELECT * FROM script_templates WHERE id = ${script_id}`;
    if (script.length === 0) return res.status(404).json({ error: 'Script template not found' });

    // Fetch lead
    const lead = await sql`SELECT * FROM leads WHERE id = ${lead_id} AND user_id = ${user[0].id}`;
    if (lead.length === 0) return res.status(404).json({ error: 'Lead not found' });

    // Fill template
    const template = script[0].body;
    const leadData = lead[0];
    
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];

    const replacements = {
      '{{seller_name}}': leadData.seller_name || leadData.agent_name || '[Seller Name]',
      '{{address}}': leadData.address || '[Address]',
      '{{day}}': today,
      '{{psa_signed_date}}': leadData.psa_signed_date || '[Date]',
      '{{inspection_days}}': leadData.inspection_period_days || '14',
      '{{inspection_end}}': leadData.inspection_end_date || '[Date]',
      '{{coe_date}}': leadData.coe_date || '[Date]',
      '{{title_company}}': leadData.title_company || 'CLOSE Title',
      '{{title_phone}}': leadData.title_company_phone || '1-800-405-7150',
      '{{tc_name}}': leadData.tc_name || 'BGonzalez',
      '{{tc_email}}': leadData.tc_email || 'BGonzalez@sellsmartre.com',
      '{{tc_phone}}': leadData.tc_phone || '262-440-2916',
      '{{net_to_seller}}': leadData.price ? `$${Number(leadData.price).toLocaleString()}` : '[Net]',
    };

    let filled = template;
    for (const [placeholder, value] of Object.entries(replacements)) {
      filled = filled.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }

    res.json({
      script_id,
      script_name: script[0].name,
      lead_address: leadData.address,
      filled_template: filled,
      unfilled_placeholders: filled.match(/\{\{[^}]+\}\}/g) || [],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

