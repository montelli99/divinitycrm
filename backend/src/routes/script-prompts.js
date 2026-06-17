// =============================================================
// Divinity CRM Platform — Script Prompts API
// Returns pre-filled messages for the student to copy/send
// =============================================================

const { Router } = require('express');
const { sql } = require('../db/connection');
const { getTransitionScripts, getScriptsForStage, getTemplateByShortcut, listAllShortcuts } = require('../services/script-prompts');
const { getStagePrompt } = require('../services/stage-automations');

const router = Router();

// GET /api/scripts/prompts/:lead_id — Get all scripts for current lead stage
router.get('/prompts/:lead_id', async (req, res, next) => {
  try {
    const clerkId = req.user.userId;
    const user = await sql`SELECT id FROM users WHERE id = ${clerkId}`;
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
    const clerkId = req.user.userId;
    const user = await sql`SELECT id FROM users WHERE id = ${clerkId}`;
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

// GET /api/scripts/prompts/stage/:lead_id/:stage — Get rich prompt for a lead's current stage
router.get('/prompts/stage/:lead_id/:stage', async (req, res, next) => {
  try {
    const clerkId = req.user.userId;
    const user = await sql`SELECT id FROM users WHERE id = ${clerkId}`;
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const lead = await sql`SELECT * FROM leads WHERE id = ${req.params.lead_id} AND user_id = ${user[0].id}`;
    if (lead.length === 0) return res.status(404).json({ error: 'Lead not found' });

    const prompt = getStagePrompt(req.params.stage, lead[0]);
    const scripts = getScriptsForStage(req.params.stage, lead[0]);

    res.json({
      lead_id: req.params.lead_id,
      stage: req.params.stage,
      prompt,
      scripts,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/scripts/prompts/shortcuts — List all available template shortcuts
router.get('/prompts/shortcuts', async (req, res, next) => {
  try {
    const shortcuts = listAllShortcuts();
    res.json({ shortcuts });
  } catch (err) {
    next(err);
  }
});

// POST /api/scripts/prompts/fill — Fill a single template by shortcut code
router.post('/prompts/fill', async (req, res, next) => {
  try {
    const clerkId = req.user.userId;
    const user = await sql`SELECT id FROM users WHERE id = ${clerkId}`;
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const { lead_id, shortcut } = req.body;
    if (!lead_id || !shortcut) {
      return res.status(400).json({ error: 'lead_id and shortcut required' });
    }

    const lead = await sql`SELECT * FROM leads WHERE id = ${lead_id} AND user_id = ${user[0].id}`;
    if (lead.length === 0) return res.status(404).json({ error: 'Lead not found' });

    const result = getTemplateByShortcut(shortcut, lead[0]);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
