// =============================================================
// Teleprompter API — Integrated stage scripts for call mode
// 
// Folds the standalone teleprompter project into the CRM.
// All 21 stages + scripts + variable substitution.
// 
// When called with a lead context, auto-fills {address}, {seller_name},
// {seller_phone}, {seller_email}, {price}, etc. from the lead record.
// =============================================================

const { Router } = require('express');
const { query } = require('../db/connection');
const { STAGES, STAGE_LABELS, OWNERS, STAGE_BUCKETS } = require('./stages');
const { SCRIPTS, renderScript } = require('../services/teleprompter-scripts');

const router = Router();

// GET /api/teleprompter/stages — list all stages with labels + owners
router.get('/stages', (req, res) => {
  res.json({
    stages: STAGES,
    labels: STAGE_LABELS,
    owners: OWNERS,
    buckets: STAGE_BUCKETS,
  });
});

// GET /api/teleprompter/scripts — bulk fetch all scripts (for preloading)
router.get('/scripts', (req, res) => {
  res.json({ scripts: SCRIPTS });
});

// GET /api/teleprompter/:stageId — get script for a stage with optional ?vars=...
router.get('/:stageId', async (req, res) => {
  const { stageId } = req.params;
  if (!SCRIPTS[stageId]) {
    return res.status(404).json({ error: 'Stage not found', validStages: STAGES });
  }

  let variables = { ...req.query };

  // If lead_id is passed, auto-populate from lead data
  if (req.query.lead_id) {
    try {
      const rows = await query(
        `SELECT address, city, state, zip, seller_name, seller_phone, seller_email,
                agent_name, agent_phone, agent_email, price, contract_type, 
                monthly_rent, arv, condition, psa_signed_date, tc_email, tc_name,
                inspection_end_date, contract_draft_url
         FROM leads WHERE id = $1`,
        [req.query.lead_id]
      );
      const lead = rows && rows[0];
      if (lead) {
        variables = {
          ...variables,
          address: lead.address ? `${lead.address}, ${lead.city || ''} ${lead.state || ''}`.trim() : variables.address,
          seller_name: lead.seller_name || variables.seller_name,
          seller_phone: lead.seller_phone || variables.seller_phone,
          seller_email: lead.seller_email || variables.seller_email,
          agent_name: lead.agent_name || variables.agent_name,
          agent_phone: lead.agent_phone || variables.agent_phone,
          agent_email: lead.agent_email || variables.agent_email,
          price: lead.price ? `$${Number(lead.price).toLocaleString()}` : variables.price,
          contract_type: (lead.contract_type || '').toUpperCase() || variables.contract_type,
          condition_notes: lead.condition || variables.condition_notes,
          tc_email: lead.tc_email || variables.tc_email,
          tc_name: lead.tc_name || variables.tc_name,
          inspection_end_date: lead.inspection_end_date
            ? new Date(lead.inspection_end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
            : variables.inspection_end_date,
          contract_deadline: variables.contract_deadline || (() => {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            return d.toLocaleDateString('en-US', { weekday: 'long' });
          })(),
        };
        // Compute follow_up_date if missing
        if (!variables.follow_up_date && variables.address) {
          const d = new Date();
          d.setDate(d.getDate() + 2);
          variables.follow_up_date = d.toLocaleDateString('en-US', { weekday: 'long' });
        }
      }
    } catch (err) {
      console.warn('Teleprompter: failed to load lead context', err.message);
      // continue with query variables
    }
  }

  const rendered = renderScript(stageId, variables);
  res.json({
    stage: stageId,
    label: STAGE_LABELS[stageId],
    owner: OWNERS[stageId],
    variables,
    script: rendered,
  });
});

// POST /api/teleprompter/:stageId/render — render with explicit variables
router.post('/:stageId/render', (req, res) => {
  const { stageId } = req.params;
  const variables = (req.body && req.body.variables) || {};
  if (!SCRIPTS[stageId]) {
    return res.status(404).json({ error: 'Stage not found' });
  }
  const rendered = renderScript(stageId, variables);
  res.json({
    stage: stageId,
    label: STAGE_LABELS[stageId],
    owner: OWNERS[stageId],
    script: rendered,
  });
});

// GET /api/teleprompter/:currentStage/next — get the next stage
router.get('/:currentStage/next', (req, res) => {
  const idx = STAGES.indexOf(req.params.currentStage);
  if (idx === -1) return res.status(404).json({ error: 'Unknown stage' });
  if (idx === STAGES.length - 1) {
    return res.json({ current: req.params.currentStage, next: null, message: 'Pipeline complete' });
  }
  const next = STAGES[idx + 1];
  res.json({ current: req.params.currentStage, next, label: STAGE_LABELS[next] });
});

module.exports = router;
