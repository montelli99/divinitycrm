// =============================================================
// Teleprompter API — Text Shortcut Reference for Students
// =============================================================
// User correction (2026-06-19):
//   "The teleprompters are supposed to be for the tech shortcuts that
//    are supposed to have their name, information, address, and things
//    filled out. They can copy from that to their mobile device and hit
//    send from their cell phone the message that we would be sending."
//
// This is NOT a call-mode script reader. It's a UI for the 33+ text
// shortcuts (INT, NOA, CCC, GCJ, LOI, F50, CONTRACT_OUT, etc.) that
// students send to sellers/agents via their personal phones.
//
// Flow:
//   1. Student opens a lead in CRM
//   2. Lead's current stage determines which shortcuts are available
//   3. Each shortcut's body is pre-filled with {{Seller Name}},
//      {{Property Address}}, {{COE Date}}, etc. from the lead record
//   4. Student sees the pre-filled text, taps Copy, pastes to phone,
//      hits Send
//   5. Tap "Mark as Sent" to log it to activity_log
//
// Sources of truth:
//   - divinitycrm/backend/src/services/script-prompts.js (OUTREACH_SCRIPTS,
//     CALL_SCRIPTS, PITCH_SCRIPTS, SELLER_UPDATE_TEMPLATES) — all local text
//     shortcuts used by the standalone app
// =============================================================

const { Router } = require('express');
const { query } = require('../db/connection');

const { STAGES, STAGE_LABELS, OWNERS, STAGE_BUCKETS } = require('./stages');
const {
  listAllShortcuts,
  getTemplateByShortcut,
  fillShortcutBySource,
  OUTREACH_SCRIPTS,
  CALL_SCRIPTS,
  PITCH_SCRIPTS,
} = require('../services/script-prompts');

const router = Router();

// Map our 21 pipeline stages to seller-update template stages (numeric)
const SELLER_UPDATE_STAGE_NUM = {
  CONTRACT_OUT: 12,
  INSPECTION_SCHEDULED: 14,
  APPRAISAL_DONE: 17,
  JV_SIGNED: 19,
  CLOSING_CONFIRMED: 21,
  EVERYBODY_WINS_PITCH: 3,
  PSA_CALL_OPENER_SMS: 12,
  SUBTO_PROCESSOR_CONFIRMED: 20,
};

const STAGE_NUM_TO_NAME = {};
Object.entries(SELLER_UPDATE_STAGE_NUM).forEach(([key, num]) => {
  STAGE_NUM_TO_NAME[num] = STAGE_NUM_TO_NAME[num] || [];
  STAGE_NUM_TO_NAME[num].push(key);
});

// Stage index (1-based) for our 21 stages
const STAGE_INDEX = {};
STAGES.forEach((s, i) => STAGE_INDEX[s] = i + 1);

// Helper: build data dict for fillTemplate from a lead row
function leadToTemplateData(lead) {
  if (!lead) return {};
  const d = new Date();
  return {
    'Seller Name': lead.seller_name || '',
    'Property Address': lead.address ? `${lead.address}${lead.city ? ', ' + lead.city : ''}${lead.state ? ' ' + lead.state : ''}${lead.zip ? ' ' + lead.zip : ''}`.trim() : '',
    'Sender Name': lead.agent_name || 'Montelli',
    'Sender Phone': lead.agent_phone || '',
    'Sender Email': lead.agent_email || '',
    'Seller Phone': lead.seller_phone || '',
    'Seller Email': lead.seller_email || '',
    'Price': lead.price ? `$${Number(lead.price).toLocaleString()}` : '',
    'COE Date': lead.coe_date ? new Date(lead.coe_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '',
    'PSA Signed Date': lead.psa_signed_date ? new Date(lead.psa_signed_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '',
    'Inspection End Date': lead.inspection_end_date ? new Date(lead.inspection_end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '',
    'Inspection Period Days': lead.inspection_period_days || '14',
    'EMD': lead.emd_amount ? `$${Number(lead.emd_amount).toLocaleString()}` : '$100',
    'Title Company': lead.title_company || 'CLOSED Title',
    'TC Name': lead.tc_name || 'BGonzalez',
    'TC Email': lead.tc_email || '',
    'TC Phone': lead.tc_phone || '',
    'LLC Name': lead.llc_name || 'Divinity Aligned LLC',
    'Contract Type': (lead.contract_type || '').toUpperCase() || 'SUBTO',
    'Condition': lead.condition || '',
    'Day': d.toLocaleDateString('en-US', { weekday: 'long' }),
  };
}

// GET /api/teleprompter/shortcuts?stage=X&lead_id=Y
// Returns the list of shortcuts applicable to the given stage,
// with each shortcut's body pre-filled from the lead's data.
router.get('/shortcuts', async (req, res) => {
  const { stage: stageParam, lead_id } = req.query;
  // If no stage provided, return ALL shortcuts across all stages (useful for browsing/listing)
  const stage = stageParam || '__ALL__';

  let lead = null;
  if (lead_id) {
    try {
      const rows = await query(
        `SELECT address, city, state, zip, seller_name, seller_phone, seller_email,
                agent_name, agent_phone, agent_email, price, contract_type, 
                condition, psa_signed_date, coe_date, inspection_end_date, 
                inspection_period_days, emd_amount, title_company, title_company_email,
                title_company_phone, tc_name, tc_email, tc_phone, llc_name
         FROM leads WHERE id = $1`,
        [lead_id]
      );
      lead = rows && rows[0];
    } catch (err) {
      console.warn('Teleprompter: lead query failed', err.message);
    }
  }

  const data = leadToTemplateData(lead);
  const stageNum = STAGE_INDEX[stage];
  const showAllStages = stage === '__ALL__';
  const shortcuts = [];

  // 1) Pull from CRM script-prompts.js (OUTREACH_SCRIPTS, CALL_SCRIPTS, PITCH_SCRIPTS)
  const crmAll = [
    ...Object.values(OUTREACH_SCRIPTS || {}),
    ...Object.values(CALL_SCRIPTS || {}),
    ...Object.values(PITCH_SCRIPTS || {}),
  ];
  crmAll.forEach(tpl => {
    if (!showAllStages && tpl.stage !== stage) return;
    try {
      // getTemplateByShortcut already calls fillTemplate internally
      // Note: returns { filled, unfilled, recipient, actionRequired, ... }
      const filled = getTemplateByShortcut ? getTemplateByShortcut(tpl.shortcut, lead || {}) : { filled: tpl.body };
      shortcuts.push({
        source: 'crm',
        key: tpl.shortcut,
        name: tpl.name || tpl.shortcut,
        description: tpl.description || '',
        recipientType: tpl.recipientType || 'seller',
        body: filled.filled || tpl.body,
        unfilled: filled.unfilled || [],
        recipient: filled.recipient,
      });
    } catch (err) {
      console.warn(`Teleprompter: failed to fill ${tpl.shortcut}:`, err.message);
    }
  });

  // 2) Pull from local seller-update templates (standalone copy)
  if (showAllStages) {
    // Pull from all stages when showing all
    Object.values(STAGE_NUM_TO_NAME).flat().forEach(key => {
      try {
        const filled = fillShortcutBySource ? fillShortcutBySource('sms', key, lead || {}) : null;
        if (filled && !filled.error) {
          shortcuts.push({
            source: 'sms',
            key,
            name: filled.name || key,
            description: 'Seller update SMS — pre-filled with lead data',
            recipientType: 'seller',
            body: filled.body,
            unfilled: filled.unfilled || [],
          });
        }
      } catch (err) {
        console.warn(`Teleprompter: failed to fill seller update ${key}:`, err.message);
      }
    });
  } else if (stageNum && SELLER_UPDATE_STAGE_NUM) {
    const sellerKeys = STAGE_NUM_TO_NAME[stageNum] || [];
    sellerKeys.forEach(key => {
      try {
        const filled = fillShortcutBySource ? fillShortcutBySource('sms', key, lead || {}) : null;
        if (filled && !filled.error) {
          shortcuts.push({
            source: 'sms',
            key,
            name: filled.name || key,
            description: 'Seller update SMS — pre-filled with lead data',
            recipientType: 'seller',
            body: filled.body,
            unfilled: filled.unfilled || [],
          });
        }
      } catch (err) {
        console.warn(`Teleprompter: failed to fill seller update ${key}:`, err.message);
      }
    });
  }

  res.json({
    stage: stage === '__ALL__' ? 'ALL' : stage,
    stageLabel: stage === '__ALL__' ? 'All Stages' : STAGE_LABELS[stage],
    stageNumber: stageNum,
    lead: lead ? { id: lead_id, address: lead.address, seller_name: lead.seller_name } : null,
    shortcuts,
  });
});

// GET /api/teleprompter/shortcuts/:source/:key?lead_id=Y
// Returns one shortcut fully filled (for the detail view)
router.get('/shortcuts/:source/:key', async (req, res) => {
  const { source, key } = req.params;
  const { lead_id } = req.query;

  let lead = null;
  if (lead_id) {
    try {
      const rows = await query(
        `SELECT address, city, state, zip, seller_name, seller_phone, seller_email,
                agent_name, agent_phone, agent_email, price, contract_type, 
                condition, psa_signed_date, coe_date, inspection_end_date, 
                inspection_period_days, emd_amount, title_company, title_company_email,
                title_company_phone, tc_name, tc_email, tc_phone, llc_name
         FROM leads WHERE id = $1`,
        [lead_id]
      );
      lead = rows && rows[0];
    } catch (err) {
      console.warn('Teleprompter: lead query failed', err.message);
    }
  }

  const data = leadToTemplateData(lead);

  if (source === 'crm') {
    const filled = getTemplateByShortcut ? getTemplateByShortcut(key, lead || {}) : { error: 'not found' };
    if (filled.error) return res.status(404).json({ error: filled.error });
    return res.json({
      source, key, name: filled.name || key, description: filled.description || '',
      recipientType: filled.recipientType || 'seller', stage: filled.stage,
      body: filled.filled, unfilled: filled.unfilled || [],
      recipient: filled.recipient,
    });
  } else if (source === 'sms') {
    const filled = fillShortcutBySource ? fillShortcutBySource('sms', key, lead || {}) : null;
    if (!filled || filled.error) return res.status(404).json({ error: 'SMS template not found' });
    return res.json({
      source, key, name: filled.name, description: filled.description || 'Seller update SMS',
      recipientType: filled.recipientType || 'seller', stage: filled.stage,
      body: filled.filled || filled.body, unfilled: filled.unfilled || [],
    });
  } else {
    return res.status(400).json({ error: 'source must be "crm" or "sms"' });
  }
});

// GET /api/teleprompter/stages — list all stages with labels + owners
router.get('/stages', (req, res) => {
  res.json({
    stages: STAGES,
    labels: STAGE_LABELS,
    owners: OWNERS,
    buckets: STAGE_BUCKETS,
  });
});

// POST /api/teleprompter/mark-sent
// Body: { lead_id, source, key, body, recipient, channel }
// Logs the action to activity_log so we know when each shortcut was sent.
router.post('/mark-sent', async (req, res) => {
  const { lead_id, source, key, body, recipient, channel } = req.body || {};
  if (!lead_id || !source || !key || !body) {
    return res.status(400).json({ error: 'lead_id, source, key, body required' });
  }
  try {
    // Try to insert into activity_log (use existing schema if available)
    await query(
      `INSERT INTO activity_log (lead_id, user_id, type, description, metadata, created_at)
       VALUES ($1, NULL, 'shortcut_sent', $2, $3, NOW())
       ON CONFLICT DO NOTHING`,
      [
        lead_id,
        `${source}:${key} sent via ${channel || 'manual'} to ${recipient || 'unknown'}`,
        JSON.stringify({ source, key, body, recipient, channel, sent_at: new Date().toISOString() })
      ]
    ).catch(err => {
      // Fallback: log to console if activity_log doesn't have the columns we need
      console.log('[TELEPROMPTER] shortcut sent:', { lead_id, source, key, recipient });
    });
    res.json({ ok: true, logged_at: new Date().toISOString() });
  } catch (err) {
    console.warn('Teleprompter: mark-sent failed', err.message);
    res.json({ ok: true, logged_at: new Date().toISOString(), warning: 'logged to console only' });
  }
});

module.exports = router;
