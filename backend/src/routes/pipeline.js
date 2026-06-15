// =============================================================
// Student CRM Platform — Pipeline API Routes
// =============================================================

const { Router } = require('express');
const { sql } = require('../db/connection');

const router = Router();

// GET /api/pipeline — Full pipeline view with health scan
router.get('/', async (req, res, next) => {
  try {
    const clerkId = req.auth.userId;
    const user = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`;
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const userId = user[0].id;

    // Get all active leads grouped by stage
    const leads = await sql`
      SELECT * FROM leads 
      WHERE user_id = ${userId} 
      AND stage NOT IN ('ARCHIVED', 'CLOSED', 'DEAD')
      ORDER BY updated_at DESC
    `;

    // Group by stage
    const byStage = {};
    const STAGES = ['NEW_LEAD', 'QUALIFIED', 'LOI_REQUESTED', 'LOI_APPROVED', 'OFFER_SENT', 'NEGOTIATING', 'UNDER_CONTRACT'];
    
    STAGES.forEach(stage => { byStage[stage] = []; });
    
    leads.forEach(lead => {
      const stage = lead.stage;
      if (byStage[stage]) {
        const daysInStage = Math.floor((Date.now() - new Date(lead.last_stage_change_at).getTime()) / 86400000);
        byStage[stage].push({
          id: lead.id,
          address: lead.address,
          price: lead.price,
          days_in_stage: daysInStage,
          next_action: getNextAction(lead),
          stalled: daysInStage > 7,
        });
      }
    });

    // Stats
    const stats = await sql`
      SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE stage NOT IN ('ARCHIVED', 'CLOSED', 'DEAD')) AS active,
        COUNT(*) FILTER (WHERE stage = 'CLOSED') AS closed,
        COUNT(*) FILTER (WHERE stage = 'DEAD') AS dead
      FROM leads WHERE user_id = ${userId}
    `;

    const conversionRate = stats[0].total > 0 
      ? Math.round((stats[0].closed / (stats[0].closed + stats[0].dead)) * 100) 
      : 0;

    // Health alerts (pipeline-monitor.js logic)
    const alerts = [];
    
    const newLeads = byStage['NEW_LEAD'] || [];
    const offerSent = byStage['OFFER_SENT'] || [];
    const loiApproved = byStage['LOI_APPROVED'] || [];
    const underContract = byStage['UNDER_CONTRACT'] || [];

    newLeads.forEach(l => {
      if (l.days_in_stage > 7) alerts.push({ severity: 'yellow', type: 'stale_lead', lead: l.address, detail: `${l.days_in_stage} days at New Lead` });
    });

    offerSent.forEach(l => {
      if (l.days_in_stage > 2) alerts.push({ severity: 'red', type: 'offer_stalled', lead: l.address, detail: `${l.days_in_stage} days at Offer Sent — no response` });
    });

    if (offerSent.length > 5 && loiApproved.length === 0) {
      alerts.push({ severity: 'red', type: 'offer_cliff', lead: 'PIPELINE', detail: `${offerSent.length} offers sent, 0 approved` });
    }

    if (underContract.length > 3 && stats[0].closed === 0) {
      alerts.push({ severity: 'red', type: 'contract_gap', lead: 'PIPELINE', detail: `${underContract.length} under contract, 0 closed` });
    }

    // Reminders due today
    const today = new Date().toISOString().split('T')[0];
    const reminders = await sql`
      SELECT r.*, l.address 
      FROM reminders r 
      JOIN leads l ON r.lead_id = l.id 
      WHERE r.user_id = ${userId} 
      AND r.completed = false 
      AND r.due_date::date <= ${today}
      ORDER BY r.due_date
    `;

    res.json({
      pipeline: byStage,
      stats: { ...stats[0], conversion_rate: conversionRate },
      alerts,
      reminders_due: reminders,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/pipeline/today — What's due today
router.get('/today', async (req, res, next) => {
  try {
    const clerkId = req.auth.userId;
    const user = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`;
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const userId = user[0].id;
    const today = new Date().toISOString().split('T')[0];

    // AM tasks by stage
    const amTasks = {
      contract_out: await sql`SELECT id, address FROM leads WHERE user_id = ${userId} AND stage = 'UNDER_CONTRACT'`,
      awaiting_info: await sql`SELECT id, address FROM leads WHERE user_id = ${userId} AND stage = 'NEGOTIATING'`,
      terms_agreed: await sql`SELECT id, address FROM leads WHERE user_id = ${userId} AND stage = 'LOI_APPROVED'`,
      active_negotiation: await sql`SELECT id, address FROM leads WHERE user_id = ${userId} AND stage = 'NEGOTIATING'`,
    };

    // Follow-ups due
    const followUps = await sql`
      SELECT r.*, l.address 
      FROM reminders r 
      JOIN leads l ON r.lead_id = l.id 
      WHERE r.user_id = ${userId} 
      AND r.completed = false 
      AND r.due_date::date <= ${today}
      ORDER BY r.due_date
    `;

    // Overdue 48hr offers
    const overdue = await sql`
      SELECT id, address, follow_up_48hr_due 
      FROM leads 
      WHERE user_id = ${userId} 
      AND stage = 'OFFER_SENT' 
      AND follow_up_48hr_done = false 
      AND follow_up_48hr_due < now()
    `;

    res.json({
      am_tasks: amTasks,
      follow_ups_due: followUps,
      overdue_48hr: overdue,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/pipeline/stats — Pipeline statistics
router.get('/stats', async (req, res, next) => {
  try {
    const clerkId = req.auth.userId;
    const user = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`;
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const userId = user[0].id;

    const stats = await sql`
      SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE stage NOT IN ('ARCHIVED', 'CLOSED', 'DEAD')) AS active,
        COUNT(*) FILTER (WHERE stage = 'CLOSED') AS closed,
        COUNT(*) FILTER (WHERE stage = 'DEAD') AS dead,
        AVG(EXTRACT(DAY FROM (closed_date - created_at))) FILTER (WHERE stage = 'CLOSED') AS avg_days_to_close,
        COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) AS added_today
      FROM leads WHERE user_id = ${userId}
    `;

    const bySource = await sql`
      SELECT source, COUNT(*) AS count 
      FROM leads WHERE user_id = ${userId} 
      GROUP BY source ORDER BY count DESC
    `;

    const byStage = await sql`
      SELECT stage, COUNT(*) AS count 
      FROM leads WHERE user_id = ${userId} 
      GROUP BY stage ORDER BY count DESC
    `;

    res.json({
      ...stats[0],
      conversion_rate: stats[0].total > 0 ? Math.round((stats[0].closed / (stats[0].closed + stats[0].dead)) * 100) : 0,
      by_source: bySource,
      by_stage: byStage,
    });
  } catch (err) {
    next(err);
  }
});

// Helper: determine next action based on stage
function getNextAction(lead) {
  const actions = {
    'NEW_LEAD': 'Send INT text + call',
    'QUALIFIED': 'Send CCC + check 1% rule',
    'LOI_REQUESTED': 'Wait for Seth LOI',
    'LOI_APPROVED': 'Send GCJ + offer',
    'OFFER_SENT': '48hr follow-up call',
    'NEGOTIATING': 'Overcome objections / relay to Kayla',
    'UNDER_CONTRACT': 'Monitor inspection + appraisal',
  };
  return actions[lead.stage] || 'Review';
}

module.exports = router;
