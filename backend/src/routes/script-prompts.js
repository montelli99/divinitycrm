// =============================================================
// Divinity CRM Platform — Script Prompts API
// Returns pre-filled messages for the student to copy/send
// =============================================================

const { Router } = require('express');
const { sql } = require('../db/connection');
const { getTransitionScripts, getScriptsForStage } = require('../services/script-prompts');

const router = Router();

// GET /api/scripts/prompts/:lead_id — Get all scripts for current lead stage
router.get('/prompts/:lead_id', async (req, res, next) => {
  try {
    const clerkId = req.auth.userId;
    const user = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`;
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const lead = await sql`SELECT * FROM leads WHERE id = ${req.params.lead_id} AND user_id = ${user[0].id}`;
    if (lead.length === 0) return res.status(404).json({ error: 'Lead not found' });

    const scripts = getScriptsForStage(lead[0].stage, lead[0]);
    res.json({ lead_id: req.params.lead_id, stage: lead[0].stage, scripts });
  } catch (err) {
    next(err);
  }
});

// POST /api/scripts/prompts/transition — Get scripts for a stage transition
router.post('/prompts/transition', async (req, res, next) => {
  try {
    const clerkId = req.auth.userId;
    const user = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`;
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const { lead_id, from_stage, to_stage } = req.body;
    if (!lead_id || !from_stage || !to_stage) {
      return res.status(400).json({ error: 'lead_id, from_stage, and to_stage required' });
    }

    const lead = await sql`SELECT * FROM leads WHERE id = ${lead_id} AND user_id = ${user[0].id}`;
    if (lead.length === 0) return res.status(404).json({ error: 'Lead not found' });

    const scripts = getTransitionScripts(from_stage, to_stage, lead[0]);
    res.json({ lead_id, from_stage, to_stage, scripts });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
