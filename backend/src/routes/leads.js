// =============================================================
// Divinity CRM Platform — Leads API Routes
// =============================================================

const { Router } = require('express');
const { sql } = require('../db/connection');
const { v4: uuid } = require('uuid');
const { executeStageAutomations, getAvailableTransitions } = require('../services/stage-automations');

const router = Router();

// GET /api/leads — List all leads for the authenticated user
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.userId; // Clerk user ID
    const { stage, search, limit = 50, offset = 0 } = req.query;

    let query = sql`SELECT * FROM leads WHERE user_id = ${userId}`;
    
    if (stage) {
      query = sql`${query} AND stage = ${stage}`;
    }
    if (search) {
      query = sql`${query} AND (address ILIKE ${'%' + search + '%'} OR agent_name ILIKE ${'%' + search + '%'} OR seller_name ILIKE ${'%' + search + '%'})`;
    }

    query = sql`${query} ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const leads = await query;
    res.json({ leads, total: leads.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/:id — Get single lead
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const lead = await sql`
      SELECT * FROM leads 
      WHERE id = ${req.params.id} 
      AND user_id = ${userId}
    `;

    if (lead.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Get history
    const history = await sql`
      SELECT * FROM lead_history WHERE lead_id = ${req.params.id} ORDER BY created_at DESC
    `;

    // Get reminders
    const reminders = await sql`
      SELECT * FROM reminders WHERE lead_id = ${req.params.id} ORDER BY due_date
    `;

    res.json({ lead: lead[0], history, reminders });
  } catch (err) {
    next(err);
  }
});

// POST /api/leads — Create new lead
router.post('/', async (req, res, next) => {
  try {
    const clerkId = req.user.userId;
    const user = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`;
    
    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found. Ensure Clerk webhook has synced your account.' });
    }

    const userId = user[0].id;
    const {
      address, city, state, zip, price, source,
      beds, baths, sqft, year_built, condition,
      agent_name, agent_phone, agent_email,
      seller_name, seller_phone, seller_email,
      notes,
    } = req.body;

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    const lead = await sql`
      INSERT INTO leads (
        id, user_id, address, city, state, zip, price, source,
        beds, baths, sqft, year_built, condition,
        agent_name, agent_phone, agent_email,
        seller_name, seller_phone, seller_email,
        notes, stage
      ) VALUES (
        ${uuid()}, ${userId}, ${address}, ${city || null}, ${state || null}, ${zip || null},
        ${price || null}, ${source || 'other'},
        ${beds || null}, ${baths || null}, ${sqft || null}, ${year_built || null},
        ${condition || 'unknown'},
        ${agent_name || null}, ${agent_phone || null}, ${agent_email || null},
        ${seller_name || null}, ${seller_phone || null}, ${seller_email || null},
        ${notes || ''}, 'NEW_LEAD'
      )
      RETURNING *
    `;

    // Log activity
    await sql`
      INSERT INTO activity_log (user_id, lead_id, action, details)
      VALUES (${userId}, ${lead[0].id}, 'lead_created', ${JSON.stringify({ address, price, source })})
    `;

    res.status(201).json({ lead: lead[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/leads/:id — Update lead
router.patch('/:id', async (req, res, next) => {
  try {
    const clerkId = req.user.userId;
    const user = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`;
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const userId = user[0].id;
    const leadId = req.params.id;

    // Verify ownership
    const existing = await sql`SELECT id FROM leads WHERE id = ${leadId} AND user_id = ${userId}`;
    if (existing.length === 0) return res.status(404).json({ error: 'Lead not found' });

    // Build dynamic UPDATE — only set fields that are provided
    const allowedFields = [
      'address', 'city', 'state', 'zip', 'apn', 'price', 'source', 'stage',
      'beds', 'baths', 'sqft', 'lot_size', 'year_built', 'condition', 'condition_rating', 'property_type',
      'population', 'population_ok', 'buy_box_passed',
      'agent_name', 'agent_phone', 'agent_email',
      'seller_name', 'seller_phone', 'seller_email',
      'roof_age', 'hvac_age', 'occupancy', 'monthly_rent', 'lease', 'utilities_on',
      'arv', 'repair_tier', 'repair_tier_rate', 'repairs_estimate', 'wholesale_fee',
      'existing_loan_balance', 'existing_loan_rate', 'existing_loan_type',
      'one_percent_rule', 'one_percent_value', 'dscr', 'cash_flow', 'monthly_payment',
      'recommended_strategy',
      'cash_offer', 'f50_offer', 'f50_down', 'f50_carryback',
      'f10_offer', 'f10_down', 'f10_carryback',
      'subto_offer', 'subto_assumed_debt',
      'midterm_offer', 'midterm_monthly_rent',
      'contract', 'psa_signed_date', 'coe_date', 'inspection_end_date',
      'inspection_period_days', 'emd_amount', 'has_subto_addendum',
      'title_company', 'title_company_email', 'title_company_phone',
      'tc_name', 'tc_email', 'tc_phone', 'llc_name', 'llc_role',
      'dead_reason', 'dom', 'dom_181_reminder_date',
      'offer_sent_date', 'follow_up_48hr_due', 'follow_up_48hr_done',
      'loi_sent_date', 'loi_approved_date', 'contract_date', 'closed_date',
      'notes',
    ];

    const updates = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(req.body)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updates.push(`${key} = $${idx}`);
        values.push(value);
        idx++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(leadId);
    const query = `UPDATE leads SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
    
    const result = await sql.unsafe(query, values);
    
    // Stage change automation — fires GHL-equivalent workflows
    let automation = null;
    if (req.body.stage && existing[0].stage !== req.body.stage) {
      automation = await executeStageAutomations(leadId, userId, existing[0].stage, req.body.stage, existing[0]);
    }
    
    // Log activity
    await sql`
      INSERT INTO activity_log (user_id, lead_id, action, details)
      VALUES (${userId}, ${leadId}, 'lead_updated', ${JSON.stringify(req.body)})
    `;

    res.json({ lead: result[0], automation });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/leads/:id — Delete lead
router.delete('/:id', async (req, res, next) => {
  try {
    const clerkId = req.user.userId;
    const user = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`;
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const userId = user[0].id;
    const result = await sql`DELETE FROM leads WHERE id = ${req.params.id} AND user_id = ${userId} RETURNING id`;
    
    if (result.length === 0) return res.status(404).json({ error: 'Lead not found' });

    res.json({ deleted: true, id: result[0].id });
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/:id/transitions — Get available next stages
router.get('/:id/transitions', async (req, res, next) => {
  try {
    const clerkId = req.user.userId;
    const user = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`;
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const lead = await sql`SELECT stage FROM leads WHERE id = ${req.params.id} AND user_id = ${user[0].id}`;
    if (lead.length === 0) return res.status(404).json({ error: 'Lead not found' });

    const transitions = getAvailableTransitions(lead[0].stage);
    res.json({ current_stage: lead[0].stage, available_transitions: transitions });
  } catch (err) {
    next(err);
  }
});

// POST /api/leads/:id/advance — Advance to next stage with automations
router.post('/:id/advance', async (req, res, next) => {
  try {
    const clerkId = req.user.userId;
    const user = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`;
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const userId = user[0].id;
    const leadId = req.params.id;
    const { to_stage } = req.body;

    if (!to_stage) {
      return res.status(400).json({ error: 'to_stage is required' });
    }

    // Get current lead
    const existing = await sql`SELECT * FROM leads WHERE id = ${leadId} AND user_id = ${userId}`;
    if (existing.length === 0) return res.status(404).json({ error: 'Lead not found' });

    const fromStage = existing[0].stage;
    const validTransitions = getAvailableTransitions(fromStage);

    if (!validTransitions.includes(to_stage)) {
      return res.status(400).json({ 
        error: `Invalid transition: ${fromStage} → ${to_stage}`,
        available_transitions: validTransitions 
      });
    }

    // Update stage
    const result = await sql`
      UPDATE leads SET stage = ${to_stage} WHERE id = ${leadId} RETURNING *
    `;

    // Execute automations
    const automation = await executeStageAutomations(leadId, userId, fromStage, to_stage, existing[0]);

    res.json({ lead: result[0], automation });
  } catch (err) {
    next(err);
  }
});

// POST /api/leads/:id/reminders — Add reminder
router.post('/:id/reminders', async (req, res, next) => {
  try {
    const clerkId = req.user.userId;
    const user = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`;
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const { type, due_date, notes } = req.body;
    if (!type || !due_date) {
      return res.status(400).json({ error: 'type and due_date are required' });
    }

    const reminder = await sql`
      INSERT INTO reminders (id, lead_id, user_id, type, due_date, notes)
      VALUES (${uuid()}, ${req.params.id}, ${user[0].id}, ${type}, ${due_date}, ${notes || null})
      RETURNING *
    `;

    res.status(201).json({ reminder: reminder[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/leads/:id/reminders/:reminderId — Complete reminder
router.patch('/:id/reminders/:reminderId', async (req, res, next) => {
  try {
    const result = await sql`
      UPDATE reminders 
      SET completed = true, completed_at = now()
      WHERE id = ${req.params.reminderId} AND lead_id = ${req.params.id}
      RETURNING *
    `;

    if (result.length === 0) return res.status(404).json({ error: 'Reminder not found' });
    res.json({ reminder: result[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

