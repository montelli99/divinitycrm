// =============================================================
// Divinity CRM Platform — Leads API Routes
// =============================================================

const { Router } = require('express');
const { query } = require('../db/connection');
const { v4: uuid } = require('uuid');
const { executeStageAutomations, getAvailableTransitions } = require('../services/stage-automations');
const { canAssignLeads, canManageTeam, isTeamViewer } = require('../services/access');
const { autoBuyBoxCheck, autoPreScreen } = require('../services/lead-buybox');

const router = Router();

const BULK_IMPORT_FIELD_KEYS = [
  'address', 'city', 'state', 'zip', 'price', 'source',
  'beds', 'baths', 'sqft', 'year_built', 'condition',
  'agent_name', 'agent_phone', 'agent_email',
  'seller_name', 'seller_phone', 'seller_email',
  'notes', 'contract_type', 'contract', 'arv', 'monthly_rent',
  'repairs_estimate', 'existing_loan_balance', 'existing_loan_rate',
  'assigned_user_id',
];

function toNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeFieldValue(field, value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = String(value).trim();
  if (!text) return null;

  if (['price', 'beds', 'baths', 'sqft', 'year_built', 'arv', 'monthly_rent', 'repairs_estimate', 'existing_loan_balance', 'existing_loan_rate'].includes(field)) {
    return toNumberOrNull(text);
  }
  return text;
}

function parseCsvRows(csvText) {
  const rows = [];
  const lines = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const next = csvText[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (current.trim()) lines.push(current);
      current = '';
      if (char === '\r' && next === '\n') i += 1;
      continue;
    }
    current += char;
  }
  if (current.trim()) lines.push(current);

  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]).map(h => h.trim());
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    rows.push(row);
  }

  return rows;
}

function splitCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

async function resolveLeadOwner({ currentUser, assignedUserId, defaultAssignedUserId }) {
  const requestedUserId = assignedUserId || defaultAssignedUserId || null;
  if (!requestedUserId) return null;

  const teamAssignmentAllowed = currentUser.length > 0 && canAssignLeads(currentUser[0]);
  if (!teamAssignmentAllowed) {
    throw new Error('Lead assignment access required');
  }

  const assignee = await query('SELECT id, role FROM users WHERE id = $1', [requestedUserId]);
  if (assignee.length === 0) {
    throw new Error('Assigned user not found');
  }
  if (!['student', 'closer', 'lead_manager', 'admin'].includes(assignee[0].role || 'student')) {
    throw new Error('Assigned user must be a student or closer');
  }
  return requestedUserId;
}

async function insertLeadRecord({ creatorUserId, ownerId, leadData }) {
  const lead = await query(
    `INSERT INTO leads (
      id, user_id, address, city, state, zip, price, source,
      beds, baths, sqft, year_built, condition,
      agent_name, agent_phone, agent_email,
      seller_name, seller_phone, seller_email,
      notes, stage, contract_type, contract,
      arv, monthly_rent, repairs_estimate, existing_loan_balance, existing_loan_rate
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8,
      $9, $10, $11, $12,
      $13,
      $14, $15, $16,
      $17, $18, $19,
      $20, $21, $22, $23,
      $24, $25, $26, $27, $28
    )
    RETURNING *`,
    [
      uuid(), ownerId,
      leadData.address,
      leadData.city || null,
      leadData.state || null,
      leadData.zip || null,
      leadData.price ?? null,
      leadData.source || 'other',
      leadData.beds ?? null,
      leadData.baths ?? null,
      leadData.sqft ?? null,
      leadData.year_built ?? null,
      leadData.condition || 'unknown',
      leadData.agent_name || null,
      leadData.agent_phone || null,
      leadData.agent_email || null,
      leadData.seller_name || null,
      leadData.seller_phone || null,
      leadData.seller_email || null,
      leadData.notes || '',
      'LEAD_ENTERED',
      leadData.contract_type || leadData.contract || null,
      leadData.contract || leadData.contract_type || null,
      leadData.arv ?? null,
      leadData.monthly_rent ?? null,
      leadData.repairs_estimate ?? null,
      leadData.existing_loan_balance ?? null,
      leadData.existing_loan_rate ?? null,
    ]
  );

  await query(
    'INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)',
    [creatorUserId, lead[0].id, 'lead_created', JSON.stringify({ address: leadData.address, price: leadData.price, source: leadData.source, assigned_user_id: ownerId !== creatorUserId ? ownerId : null })]
  );

  return lead[0];
}

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
    const currentUser = await query('SELECT role, email FROM users WHERE id = $1', [userId]);
    const lead = await query(
      'SELECT * FROM leads WHERE id = $1',
      [req.params.id]
    );

    if (lead.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (lead[0].user_id !== userId && (currentUser.length === 0 || !isTeamViewer(currentUser[0]))) {
      return res.status(403).json({ error: 'Lead access required' });
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

    // Normalize source enum — derive allowed values from the live DB enum
    // (defined in src/db/schema.sql + extended by src/db/migration_lead_engine.sql
    // + src/db/migrate-source-enum.js). Unknown values map to 'other' instead of
    // throwing a 500 on insert.
    let normalizedSource = source;
    if (source) {
      const { getLeadSourceValues } = require('../scripts/lead-source-values');
      const allowed = await getLeadSourceValues();
      if (!allowed.includes(source)) {
        console.warn(`[leads] Invalid source '${source}', mapping to 'other'`);
        normalizedSource = 'other';
      }
    }

    const ownerId = await resolveLeadOwner({ currentUser, assignedUserId: assigned_user_id });
    const lead = await insertLeadRecord({
      creatorUserId: userId,
      ownerId: ownerId || userId,
      leadData: {
        address,
        city,
        state,
        zip,
        price,
        source: normalizedSource,
        beds,
        baths,
        sqft,
        year_built,
        condition,
        agent_name,
        agent_phone,
        agent_email,
        seller_name,
        seller_phone,
        seller_email,
        notes,
        contract_type,
        contract,
      },
    });

    // Auto buy-box + pre-screen
    let buyBoxResult = null;
    let preScreenResult = null;
    try {
      buyBoxResult = await autoBuyBoxCheck(lead.id);
      preScreenResult = await autoPreScreen(lead.id);
    } catch (autoErr) {
      console.warn('[leads] auto buybox/prescreen error:', autoErr.message);
    }

    res.status(201).json({ lead, source_was_normalized: source && source !== normalizedSource ? source : undefined, buyBox: buyBoxResult, preScreen: preScreenResult });
  } catch (err) {
    next(err);
  }
});

// POST /api/leads/import — Bulk import leads with field mapping
router.post('/import', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const currentUser = await query('SELECT role, email FROM users WHERE id = $1', [userId]);
    const { rows, csvText, fieldMap = {}, defaultAssignedUserId, source = 'other' } = req.body;

    const parsedRows = Array.isArray(rows) && rows.length > 0 ? rows : (csvText ? parseCsvRows(csvText) : []);
    if (parsedRows.length === 0) {
      return res.status(400).json({ error: 'rows or csvText are required' });
    }

    const ownerId = await resolveLeadOwner({ currentUser, defaultAssignedUserId });
    const created = [];
    const failed = [];

    for (const rawRow of parsedRows) {
      try {
        const leadData = { source };
        for (const field of BULK_IMPORT_FIELD_KEYS) {
          const sourceKey = fieldMap[field] || field;
          if (!sourceKey) continue;
          const rawValue = rawRow[sourceKey];
          const value = normalizeFieldValue(field, rawValue);
          if (value !== undefined && value !== null && value !== '') {
            leadData[field] = value;
          }
        }

        if (!leadData.address) {
          throw new Error('Address is required');
        }

        const rowOwnerId = await resolveLeadOwner({ currentUser, assignedUserId: leadData.assigned_user_id, defaultAssignedUserId: ownerId });
        delete leadData.assigned_user_id;
        const lead = await insertLeadRecord({
          creatorUserId: userId,
          ownerId: rowOwnerId || userId,
          leadData,
        });
        created.push(lead);
      } catch (err) {
        failed.push({ row: rawRow, error: err.message });
      }
    }

    res.status(failed.length > 0 ? 207 : 201).json({
      success: failed.length === 0,
      created: created.length,
      failed: failed.length,
      leads: created,
      errors: failed,
    });
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

    if (result.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Stage change automation — fires GHL-equivalent workflows
    let automation = null;
    if (req.body.stage && existing[0].stage !== req.body.stage) {
      try {
        automation = await executeStageAutomations(leadId, userId, existing[0].stage, req.body.stage, existing[0]);
      } catch (automationErr) {
        automation = { error: automationErr.message };
      }
    }

    // Log activity
    try {
      await query(
        'INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)',
        [userId, leadId, 'lead_updated', JSON.stringify(req.body)]
      );
    } catch (activityErr) {
      automation = automation || {};
      automation.activity_log_error = activityErr.message;
    }

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

    // If caller passed appraisal_value, persist it BEFORE running automations
    // (so the branching logic below can read the latest value)
    if (req.body.appraisal_value !== undefined && to_stage === 'APPRAISAL_DONE') {
      await query('UPDATE leads SET appraisal_value = $1 WHERE id = $2', [Number(req.body.appraisal_value), leadId]);
      // Refresh result[0] with the new value
      const refreshed = await query('SELECT * FROM leads WHERE id = $1', [leadId]);
      Object.assign(result[0], refreshed[0]);
    }

    // Execute automations
    let automation = await executeStageAutomations(leadId, userId, fromStage, to_stage, result[0], { body: req.body });

    // BRANCHING LOGIC: APPRAISAL_DONE → auto-advance based on appraisal_value vs purchase price
    if (to_stage === 'APPRAISAL_DONE') {
      const appraisalValue = Number(result[0].appraisal_value || existing[0].appraisal_value || 0);
      const purchasePrice = Number(result[0].price || existing[0].price || 0);
      const isJVDomain = appraisalValue > 0 && purchasePrice > 0 && appraisalValue < purchasePrice;
      const nextStage = isJVDomain ? 'JV_SENT' : 'WIRE_SETUP';

      // Verify the transition is allowed
      const nextTransitions = getAvailableTransitions('APPRAISAL_DONE');
      if (nextTransitions.includes(nextStage)) {
        // Run the next transition's automations too (recursive but bounded)
        await query('UPDATE leads SET stage = $1 WHERE id = $2', [nextStage, leadId]);
        const followup = await executeStageAutomations(leadId, userId, 'APPRAISAL_DONE', nextStage, result[0], { body: req.body });
        automation = { ...automation, branch: { from: 'APPRAISAL_DONE', to: nextStage, reason: isJVDomain ? 'appraisal < PP' : 'appraisal >= PP', appraisalValue, purchasePrice }, followup };
        // Refresh lead with final stage
        const finalLead = await query('SELECT * FROM leads WHERE id = $1', [leadId]);
        return res.json({ lead: finalLead[0], automation });
      }
    }

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
