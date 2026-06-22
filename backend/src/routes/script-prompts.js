// =============================================================
// Divinity CRM Platform — Script Prompts API
// Returns pre-filled messages for the student to copy/send
// =============================================================

const { Router } = require('express');
const { query } = require('../db/connection');
const {
  getTransitionScripts,
  getScriptsForStage,
  getTemplateByShortcut,
  listAllShortcuts,
  getPrimaryShortcutForStage,
  fillShortcutBySource,
} = require('../services/script-prompts');
const { getStagePrompt } = require('../services/stage-automations');
const { isTeamViewer } = require('../services/access');

const router = Router();

async function loadLeadForCurrentUser(leadId, userId) {
  const currentUser = await query('SELECT role, email FROM users WHERE id = $1', [userId]);
  if (currentUser.length === 0) return { error: 'User not found', status: 404 };

  const lead = await query('SELECT * FROM leads WHERE id = $1', [leadId]);
  if (lead.length === 0) return { error: 'Lead not found', status: 404 };

  if (lead[0].user_id !== userId && !isTeamViewer(currentUser[0])) {
    return { error: 'Lead access required', status: 403 };
  }

  return { lead: lead[0] };
}

// NOTE: Static routes MUST come before parameterized routes
// to prevent Express from matching "shortcuts" as a :lead_id UUID

// GET /api/scripts/prompts/shortcuts — List all available template shortcuts
router.get('/shortcuts', async (req, res, next) => {
  try {
    const shortcuts = listAllShortcuts();
    res.json({ shortcuts });
  } catch (err) {
    next(err);
  }
});

// POST /api/scripts/prompts/fill — Fill a single template by shortcut code
router.post('/fill', async (req, res, next) => {
  try {
    const { lead_id, shortcut } = req.body;
    if (!lead_id || !shortcut) {
      return res.status(400).json({ error: 'lead_id and shortcut required' });
    }

    const access = await loadLeadForCurrentUser(lead_id, req.user.userId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const result = getTemplateByShortcut(shortcut, access.lead);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/scripts/prompts/transition — Get scripts for a stage transition
router.post('/transition', async (req, res, next) => {
  try {
    const { lead_id, from_stage, to_stage } = req.body;
    if (!lead_id || !from_stage || !to_stage) {
      return res.status(400).json({ error: 'lead_id, from_stage, and to_stage required' });
    }

    const access = await loadLeadForCurrentUser(lead_id, req.user.userId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const scripts = getTransitionScripts(from_stage, to_stage, access.lead);
    res.json({ lead_id, from_stage, to_stage, scripts });
  } catch (err) {
    next(err);
  }
});

function buildPrimaryStageShortcut(stage, lead) {
  const primary = getPrimaryShortcutForStage(stage, lead);
  if (!primary) return null;

  const filled = fillShortcutBySource(primary.source, primary.key, lead || {});
  if (filled?.error) return null;

  return {
    ...filled,
    primary: true,
    stage,
  };
}

function buildStageShortcutPayload(stage, lead) {
  const primary = buildPrimaryStageShortcut(stage, lead);
  const alternates = getScriptsForStage(stage, lead)
    .filter(script => !primary || script.shortcut !== primary.shortcut)
    .map(script => ({ ...script, primary: false }));

  return {
    primary,
    alternates,
    shortcuts: primary ? [primary] : [],
  };
}

// GET /api/scripts/prompts/stage/:lead_id/:stage — Get rich prompt for a lead's current stage
router.get('/stage/:lead_id/:stage', async (req, res, next) => {
  try {
    const access = await loadLeadForCurrentUser(req.params.lead_id, req.user.userId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const prompt = getStagePrompt(req.params.stage, access.lead);
    const { primary, alternates, shortcuts } = buildStageShortcutPayload(req.params.stage, access.lead);

    res.json({
      lead_id: req.params.lead_id,
      stage: req.params.stage,
      prompt,
      primaryShortcut: primary || null,
      alternates,
      scripts: shortcuts,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/scripts/prompts/:lead_id — Get all scripts for current lead stage
// MUST be last — parameterized route catches UUIDs
router.get('/:lead_id', async (req, res, next) => {
  try {
    const access = await loadLeadForCurrentUser(req.params.lead_id, req.user.userId);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const { primary, alternates, shortcuts } = buildStageShortcutPayload(access.lead.stage, access.lead);
    res.json({
      lead_id: req.params.lead_id,
      stage: access.lead.stage,
      primaryShortcut: primary || null,
      alternates,
      scripts: shortcuts,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
