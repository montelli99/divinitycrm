// =============================================================
// Divinity CRM Platform — Leads API Routes
// =============================================================

const { Router } = require('express');
const { query } = require('../db/connection');
const { v4: uuid } = require('uuid');
const { executeStageAutomations, getAvailableTransitions } = require('../services/stage-automations');
const { canAssignLeads, canManageTeam } = require('../services/access');

const router = Router();

// GET /api/leads — List all leads for the authenticated user
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { stage, search, limit = 50, offset = 0 } = req.query;

    let sqlText = 'SELECT * FROM leads WHERE user_id = $1';
    const params = [userId];
    let idx = 2;

    if (stage) {
      sqlText += ` AND stage = $${idx}`;
      params.push(stage);
      idx++;
    }
    if (search) {
      sqlText += ` AND (address ILIKE $${idx} OR agent_name ILIKE $${idx + 1} OR seller_name ILIKE $${idx + 2})`;
      params.push('%' + search + '%', '%' + search + '%', '%' + search + '%');
      idx += 3;
    }

    sqlText += ` ORDER BY updated_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(Number(limit), Number(offset));

    const leads = await query(sqlText, params);
    res.json({ leads, total: leads.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/:id — Get single lead
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const lead = await query(
      'SELECT * FROM leads WHERE id = $1 AND user_id = $2',
      [req.params.id, userId]
    );

    if (lead.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Get history
    const history = await query(
      'SELECT * FROM lead_history WHERE lead_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );

    // Get reminders
    const reminders = await query(
      'SELECT * FROM reminders WHERE lead_id = $1 ORDER BY due_date',
      [req.params.id]
    );

    res.json({ lead: lead[0], history, reminders });
  } catch (err) {
    next(err);
  }
});

// POST /api/leads — Create new lead
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const currentUser = await query('SELECT role, email FROM users WHERE id = $1', [userId]);
    const {
      address, city, state, zip, price, source,
      beds, baths, sqft, year_built, condition,
      agent_name, agent_phone, agent_email,
      seller_name, seller_phone, seller_email,
      notes,
      contract_type, contract,
      assigned_user_id,
    } = req.body;

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    const teamAssignmentAllowed = currentUser.length > 0 && canAssignLeads(currentUser[0]);
    if (assigned_user_id && !teamAssignmentAllowed) {
      return res.status(403).json({ error: 'Lead assignment access required' });
    }

    let ownerId = userId;
    if (assigned_user_id) {
      const assignee = await query('SELECT id, role FROM users WHERE id = $1', [assigned_user_id]);
      if (assignee.length === 0) {
        return res.status(400).json({ error: 'Assigned student not found' });
      }
      if (!['student', 'closer', 'lead_manager', 'admin'].includes(assignee[0].role || 'student')) {
        return res.status(400).json({ error: 'Assigned user must be a student or closer' });
      }
      ownerId = assigned_user_id;
    }

    const lead = await query(
      `INSERT INTO leads (
        id, user_id, address, city, state, zip, price, source,
        beds, baths, sqft, year_built, condition,
        agent_name, agent_phone, agent_email,
        seller_name, seller_phone, seller_email,
        notes, stage, contract_type, contract
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8,
        $9, $10, $11, $12,
        $13,
        $14, $15, $16,
        $17, $18, $19,
        $20, $21, $22, $23
      )
      RETURNING *`,
      [
        uuid(), ownerId, address, city || null, state || null, zip || null,
        price || null, source || 'other',
        beds || null, baths || null, sqft || null, year_built || null,
        condition || 'unknown',
        agent_name || null, agent_phone || null, agent_email || null,
        seller_name || null, seller_phone || null, seller_email || null,
        notes || '', 'LEAD_ENTERED',
        contract_type || contract || null, contract || contract_type || null,
      ]
    );

    // Log activity
    await query(
      'INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)',
      [userId, lead[0].id, 'lead_created', JSON.stringify({ address, price, source, assigned_user_id: ownerId !== userId ? ownerId : null })]
    );

    res.status(201).json({ lead: lead[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/leads/:id/pokemon — "We Play Pokémon" — spawn new lead from closed seller
router.post('/:id/pokemon', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const leadId = req.params.id;

    // Get the closed lead
    const existing = await query('SELECT * FROM leads WHERE id = $1 AND user_id = $2', [leadId, userId]);
    if (existing.length === 0) return res.status(404).json({ error: 'Lead not found' });

    const source = existing[0];

    // Create new portfolio lead from seller
    const newLead = await query(
      `INSERT INTO leads (
        id, user_id, address, city, state, zip, price, source,
        seller_name, seller_phone, seller_email,
        agent_name, agent_phone, agent_email,
        notes, stage, lead_source
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14,
        $15, $16, $17
      )
      RETURNING *`,
      [
        uuid(), userId,
        `${source.seller_name || 'Seller'} — Portfolio`,
        source.city, source.state, source.zip,
        null, 'referral',
        source.seller_name, source.seller_phone, source.seller_email,
        source.agent_name, source.agent_phone, source.agent_email,
        `Closed deal at ${source.address}. Seller may have more properties. Spawned via "We Play Pokémon" from lead ${leadId}.`,
        'LEAD_ENTERED', 'referral',
      ]
    );

    // Log activity
    await query(
      'INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)',
      [userId, newLead[0].id, 'pokemon_spawned', JSON.stringify({ fromLeadId: leadId, fromAddress: source.address, sellerName: source.seller_name })]
    );

    res.status(201).json({
      success: true,
      message: `Pokémon spawned! New portfolio lead for ${source.seller_name || source.address}.`,
      lead: newLead[0],
      spawnedFrom: { id: leadId, address: source.address },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/leads/:id — Update lead
router.patch('/:id', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const leadId = req.params.id;

    // Verify ownership
    const existing = await query('SELECT id, stage FROM leads WHERE id = $1 AND user_id = $2', [leadId, userId]);
    if (existing.length === 0) return res.status(404).json({ error: 'Lead not found' });

    // Build dynamic UPDATE — only set fields that are provided
    const allowedFields = [
      'address', 'city', 'state', 'zip', 'apn', 'price', 'source', 'stage',
      'beds', 'baths', 'sqft', 'lot_size', 'year_built', 'condition', 'condition_rating', 'property_type',
      'population', 'population_ok', 'buy_box_passed', 'buy_box_match',
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
      'contract', 'contract_type', 'contract_draft_url',
      'psa_signed_date', 'coe_date', 'inspection_end_date', 'inspection_scheduled_date',
      'inspection_period_days', 'emd_amount', 'has_subto_addendum', 'wrap_around_disclosure',
      'title_company', 'title_company_email', 'title_company_phone',
      'tc_name', 'tc_email', 'tc_phone', 'llc_name', 'llc_role',
      'jv_type', 'jv_parties', 'jv_percentages', 'title_holder',
      'wire_confirmed', 'subto_processor_confirmed',
      'closing_cost_breakdown', 'estimated_profit',
      'appraisal_value', 'seller_counter',
      'disposition_status', 'disposition_payout',
      'nurture_stage',
      'loan_number', 'lender_servicer', 'monthly_pi',
      'lead_source',
      'rabbitsign_envelope_id', 'rabbitsign_status',
      'dead_reason', 'dom', 'dom_181_reminder_date',
      'offer_sent_date', 'follow_up_48hr_due', 'follow_up_48hr_done',
      'loi_sent_date', 'loi_approved_date', 'contract_date', 'closed_date',
      'notes',
    ];

    const setClauses = [];
    const params = [];
    let idx = 1;
    for (const [key, value] of Object.entries(req.body)) {
      if (allowedFields.includes(key) && value !== undefined) {
        setClauses.push(`${key} = $${idx}`);
        params.push(value);
        idx++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    params.push(leadId);
    const result = await query(
      `UPDATE leads SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    // Stage change automation — fires GHL-equivalent workflows
    let automation = null;
    if (req.body.stage && existing[0].stage !== req.body.stage) {
      automation = await executeStageAutomations(leadId, userId, existing[0].stage, req.body.stage, existing[0]);
    }

    // Log activity
    await query(
      'INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)',
      [userId, leadId, 'lead_updated', JSON.stringify(req.body)]
    );

    res.json({ lead: result[0], automation });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/leads/:id — Delete lead
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const result = await query(
      'DELETE FROM leads WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, userId]
    );

    if (result.length === 0) return res.status(404).json({ error: 'Lead not found' });

    res.json({ deleted: true, id: result[0].id });
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/:id/transitions — Get available next stages
router.get('/:id/transitions', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const leadId = req.params.id;

    const existing = await query('SELECT * FROM leads WHERE id = $1 AND user_id = $2', [leadId, userId]);
    if (existing.length === 0) return res.status(404).json({ error: 'Lead not found' });

    const fromStage = existing[0].stage;
    const validTransitions = getAvailableTransitions(fromStage);

    res.json({ current_stage: fromStage, available_transitions: validTransitions });
  } catch (err) {
    next(err);
  }
});

// POST /api/leads/:id/advance — Advance lead to next stage
router.post('/:id/advance', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const leadId = req.params.id;
    const { to_stage } = req.body;

    if (!to_stage) {
      return res.status(400).json({ error: 'to_stage is required' });
    }

    // Get current lead
    const existing = await query('SELECT * FROM leads WHERE id = $1 AND user_id = $2', [leadId, userId]);
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
    const result = await query(
      'UPDATE leads SET stage = $1 WHERE id = $2 RETURNING *',
      [to_stage, leadId]
    );

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
    const userId = req.user.userId;

    const { type, due_date, notes } = req.body;
    if (!type || !due_date) {
      return res.status(400).json({ error: 'type and due_date are required' });
    }

    const reminder = await query(
      'INSERT INTO reminders (id, lead_id, user_id, type, due_date, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [uuid(), req.params.id, userId, type, due_date, notes || null]
    );

    res.status(201).json({ reminder: reminder[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/leads/:id/reminders/:reminderId — Complete reminder
router.patch('/:id/reminders/:reminderId', async (req, res, next) => {
  try {
    const result = await query(
      'UPDATE reminders SET completed = true, completed_at = now() WHERE id = $1 AND lead_id = $2 RETURNING *',
      [req.params.reminderId, req.params.id]
    );

    if (result.length === 0) return res.status(404).json({ error: 'Reminder not found' });
    res.json({ reminder: result[0] });
  } catch (err) {
    next(err);
  }
});

// =============================================================
// FOLLOW-UP SYSTEM
// =============================================================

// GET /api/leads/:id/followups — Get follow-up status for a lead
router.get('/:id/followups', async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const lead = await query(
      `SELECT id, address, stage, offer_sent_date, follow_up_48hr_due, follow_up_48hr_done,
             dom, dom_181_reminder_date, created_at, closed_date, updated_at
      FROM leads WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId]
    );
    if (lead.length === 0) return res.status(404).json({ error: 'Lead not found' });

    const l = lead[0];

    // Calculate DOM
    const dom = l.dom || (l.created_at ? Math.floor((Date.now() - new Date(l.created_at).getTime()) / 86400000) : null);

    // 48hr follow-up status
    const now = new Date();
    const followUp48hr = {
      due: l.follow_up_48hr_due,
      done: l.follow_up_48hr_done,
      overdue: l.follow_up_48hr_due && !l.follow_up_48hr_done && new Date(l.follow_up_48hr_due) < now,
      hoursRemaining: l.follow_up_48hr_due
        ? Math.max(0, Math.floor((new Date(l.follow_up_48hr_due) - now) / 3600000))
        : null,
    };

    // 181-day listing expiry
    const listingExpiry = {
      dom,
      daysUntilExpiry: dom ? Math.max(0, 181 - dom) : null,
      expired: dom ? dom >= 181 : false,
      reminderDate: l.dom_181_reminder_date,
    };

    // Post-close follow-ups
    const postClose = l.closed_date ? {
      closedDate: l.closed_date,
      daysSinceClose: Math.floor((now - new Date(l.closed_date)) / 86400000),
      testimonialDue: Math.floor((now - new Date(l.closed_date)) / 86400000) >= 7,
      referralDue: Math.floor((now - new Date(l.closed_date)) / 86400000) >= 14,
    } : null;

    // Get all reminders for this lead
    const reminders = await query(
      'SELECT * FROM reminders WHERE lead_id = $1 ORDER BY due_date',
      [req.params.id]
    );

    res.json({
      success: true,
      leadId: l.id,
      address: l.address,
      stage: l.stage,
      dom,
      followUp48hr,
      listingExpiry,
      postClose,
      reminders,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/leads/:id/followups — Create follow-up reminder
router.post('/:id/followups', async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const { type, due_date, notes } = req.body;
    if (!type || !due_date) {
      return res.status(400).json({ error: 'type and due_date are required' });
    }

    const validTypes = ['48hr_followup', 'listing_expiry', 'testimonial', 'referral', 'call_back', 'inspection', 'appraisal', 'closing', 'other'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
    }

    const reminder = await query(
      'INSERT INTO reminders (id, lead_id, user_id, type, due_date, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [uuid(), req.params.id, userId, type, due_date, notes || null]
    );

    // If 48hr follow-up, also update lead record
    if (type === '48hr_followup') {
      await query(
        'UPDATE leads SET follow_up_48hr_due = $1 WHERE id = $2',
        [due_date, req.params.id]
      );
    }

    // If listing expiry, update DOM reminder
    if (type === 'listing_expiry') {
      await query(
        'UPDATE leads SET dom_181_reminder_date = $1 WHERE id = $2',
        [due_date, req.params.id]
      );
    }

    res.status(201).json({ success: true, reminder: reminder[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/leads/:id/followups/:followUpId — Complete follow-up
router.patch('/:id/followups/:followUpId', async (req, res, next) => {
  try {
    const { completed, notes } = req.body;
    const followUpId = req.params.followUpId;
    const leadId = req.params.id;

    const setClauses = [];
    const params = [];
    let idx = 1;

    if (completed !== undefined) {
      setClauses.push(`completed = $${idx}`);
      params.push(completed);
      idx++;
      if (completed) {
        setClauses.push(`completed_at = now()`);
      }
    }
    if (notes !== undefined) {
      setClauses.push(`notes = $${idx}`);
      params.push(notes);
      idx++;
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    params.push(followUpId, leadId);
    const result = await query(
      `UPDATE reminders SET ${setClauses.join(', ')} WHERE id = $${idx} AND lead_id = $${idx + 1} RETURNING *`,
      params
    );

    if (result.length === 0) return res.status(404).json({ error: 'Follow-up not found' });

    // If completing 48hr follow-up, update lead
    if (completed && result[0].type === '48hr_followup') {
      await query(
        'UPDATE leads SET follow_up_48hr_done = true WHERE id = $1',
        [req.params.id]
      );
    }

    res.json({ success: true, reminder: result[0] });
  } catch (err) {
    next(err);
  }
});

// =============================================================
// FOLLOW-UP ALERTS
// =============================================================

const {
  scanOverdueFollowUps,
  createFollowUpAlerts,
  markFollowUpDone,
  getFollowUps,
  run: runFollowupScan,
} = require('../services/followup-alert');

// GET /api/leads/:id/followups — Follow-up status for a specific lead
router.get('/:id/followups', async (req, res, next) => {
  try {
    const result = await getFollowUps(req.params.id);
    if (!result) return res.status(404).json({ error: 'Lead not found' });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// POST /api/leads/:id/followups/complete — Mark 48hr follow-up as done
router.post('/:id/followups/complete', async (req, res, next) => {
  try {
    const result = await markFollowUpDone(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// POST /api/leads/followups/scan — Run follow-up scan (admin/cron)
router.post('/followups/scan', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const currentUser = await query('SELECT role, email FROM users WHERE id = $1', [userId]);
    if (currentUser.length === 0 || !canManageTeam(currentUser[0])) {
      return res.status(403).json({ error: 'Team management access required' });
    }

    const scanResult = await scanOverdueFollowUps();
    const result = await createFollowUpAlerts(scanResult);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// =============================================================
// LEAD SOURCE TRACKER
// =============================================================

const {
  LEAD_SOURCES,
  scoreLead,
  getSourceAttribution,
  getSourceSummary,
  tagLeadSource,
  bulkTagSource,
  getSourcePerformance,
} = require('../services/lead-source-tracker');

// GET /api/leads/sources — List all lead sources
router.get('/sources', async (req, res, next) => {
  try {
    res.json({ success: true, sources: LEAD_SOURCES });
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/sources/attribution — Source ROI attribution
router.get('/sources/attribution', async (req, res, next) => {
  try {
    const attribution = await getSourceAttribution();
    res.json({ success: true, attribution });
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/sources/summary — Source summary for dashboard
router.get('/sources/summary', async (req, res, next) => {
  try {
    const summary = await getSourceSummary();
    res.json({ success: true, ...summary });
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/sources/performance — Source performance over time
router.get('/sources/performance', async (req, res, next) => {
  try {
    const { days } = req.query;
    const performance = await getSourcePerformance(days ? parseInt(days) : 90);
    res.json({ success: true, ...performance });
  } catch (err) {
    next(err);
  }
});

// POST /api/leads/:id/source — Tag a lead with source
router.post('/:id/source', async (req, res, next) => {
  try {
    const { source, sourceDetails } = req.body;
    if (!source) return res.status(400).json({ error: 'source is required' });
    const result = await tagLeadSource(req.params.id, source, sourceDetails);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// POST /api/leads/sources/bulk-tag — Bulk tag leads by source
router.post('/sources/bulk-tag', async (req, res, next) => {
  try {
    const { leadIds, source } = req.body;
    if (!leadIds || !source) return res.status(400).json({ error: 'leadIds and source are required' });
    const result = await bulkTagSource(leadIds, source);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
