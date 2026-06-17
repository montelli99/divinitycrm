// =============================================================
// Divinity CRM Platform — Pipeline API Routes
// =============================================================

const { Router } = require('express');
const { query } = require('../db/connection');

const router = Router();

// GET /api/pipeline — Full pipeline view with health scan
router.get('/', async (req, res, next) => {
  try {
    const clerkId = req.user.userId;
    const user = await query('SELECT id FROM users WHERE clerk_id = $1', [clerkId]);
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const userId = user[0].id;

    // Get all active leads grouped by stage
    const leads = await query(
      `SELECT * FROM leads 
      WHERE user_id = $1 
      AND stage NOT IN ('ARCHIVED', 'CLOSED', 'DEAD')
      ORDER BY updated_at DESC`,
      [userId]
    );

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
    const stats = await query(
      `SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE stage NOT IN ('ARCHIVED', 'CLOSED', 'DEAD')) AS active,
        COUNT(*) FILTER (WHERE stage = 'CLOSED') AS closed,
        COUNT(*) FILTER (WHERE stage = 'DEAD') AS dead
      FROM leads WHERE user_id = $1`,
      [userId]
    );

    const conversionRate = stats[0].total > 0 
      ? Math.round((stats[0].closed / (stats[0].closed + stats[0].dead)) * 100) 
      : 0;

    // Health alerts (full pipeline-monitor.js logic)
    const alerts = [];
    
    const newLeads = byStage['NEW_LEAD'] || [];
    const qualified = byStage['QUALIFIED'] || [];
    const loiRequested = byStage['LOI_REQUESTED'] || [];
    const loiApproved = byStage['LOI_APPROVED'] || [];
    const offerSent = byStage['OFFER_SENT'] || [];
    const negotiating = byStage['NEGOTIATING'] || [];
    const underContract = byStage['UNDER_CONTRACT'] || [];

    // 1. Stale leads: Stage 1 > 7 days
    newLeads.forEach(l => {
      if (l.days_in_stage > 7) alerts.push({ severity: 'yellow', type: 'stale_lead', lead: l.address, detail: `${l.days_in_stage} days at New Lead — no contact made` });
    });

    // 2. Abandoned: Any stage > 30 days
    [...newLeads, ...qualified, ...loiRequested, ...loiApproved, ...offerSent, ...negotiating, ...underContract].forEach(l => {
      if (l.days_in_stage > 30) alerts.push({ severity: 'red', type: 'abandoned', lead: l.address, detail: `${l.days_in_stage} days no movement — mark lost?` });
    });

    // 3. Offer stalled: Offer Sent > 2 days (48hr)
    offerSent.forEach(l => {
      if (l.days_in_stage > 2) alerts.push({ severity: 'red', type: 'offer_stalled', lead: l.address, detail: `${l.days_in_stage} days at Offer Sent — no response. Call.` });
    });

    // 4. Contract unsigned: Under Contract > 3 days
    underContract.forEach(l => {
      if (l.days_in_stage > 3) alerts.push({ severity: 'red', type: 'contract_unsigned', lead: l.address, detail: `${l.days_in_stage} days — contract unsigned. Follow up.` });
    });

    // 5. Offer cliff: 5+ offers sent, 0 approved
    if (offerSent.length > 5 && loiApproved.length === 0) {
      alerts.push({ severity: 'red', type: 'offer_cliff', lead: 'PIPELINE-WIDE', detail: `${offerSent.length} offers sent, 0 approved. Sellers are ghosting.` });
    }

    // 6. Contract gap: 3+ under contract, 0 closed
    if (underContract.length > 3 && stats[0].closed === 0) {
      alerts.push({ severity: 'red', type: 'contract_gap', lead: 'PIPELINE-WIDE', detail: `${underContract.length} under contract, 0 closed. Deals dying in final stage.` });
    }

    // 7. 48hr follow-up overdue
    const overdue48hr = leads.filter(l => l.stage === 'OFFER_SENT' && !l.follow_up_48hr_done && l.follow_up_48hr_due && new Date(l.follow_up_48hr_due) < new Date());
    overdue48hr.forEach(l => {
      alerts.push({ severity: 'red', type: '48hr_overdue', lead: l.address, detail: `48hr follow-up overdue — call now.` });
    });

    // Reminders due today
    const today = new Date().toISOString().split('T')[0];
    const reminders = await query(
      `SELECT r.*, l.address 
      FROM reminders r 
      JOIN leads l ON r.lead_id = l.id 
      WHERE r.user_id = $1 
      AND r.completed = false 
      AND r.due_date::date <= $2
      ORDER BY r.due_date`,
      [userId, today]
    );

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
    const clerkId = req.user.userId;
    const user = await query('SELECT id FROM users WHERE clerk_id = $1', [clerkId]);
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const userId = user[0].id;
    const today = new Date().toISOString().split('T')[0];

    // AM tasks by stage
    const amTasks = {
      contract_out: await query('SELECT id, address FROM leads WHERE user_id = $1 AND stage = $2', [userId, 'UNDER_CONTRACT']),
      awaiting_info: await query('SELECT id, address FROM leads WHERE user_id = $1 AND stage = $2', [userId, 'NEGOTIATING']),
      terms_agreed: await query('SELECT id, address FROM leads WHERE user_id = $1 AND stage = $2', [userId, 'LOI_APPROVED']),
      active_negotiation: await query('SELECT id, address FROM leads WHERE user_id = $1 AND stage = $2', [userId, 'NEGOTIATING']),
    };

    // Follow-ups due
    const followUps = await query(
      `SELECT r.*, l.address 
      FROM reminders r 
      JOIN leads l ON r.lead_id = l.id 
      WHERE r.user_id = $1 
      AND r.completed = false 
      AND r.due_date::date <= $2
      ORDER BY r.due_date`,
      [userId, today]
    );

    // Overdue 48hr offers
    const overdue = await query(
      `SELECT id, address, follow_up_48hr_due 
      FROM leads 
      WHERE user_id = $1 
      AND stage = 'OFFER_SENT' 
      AND follow_up_48hr_done = false 
      AND follow_up_48hr_due < now()`,
      [userId]
    );

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
    const clerkId = req.user.userId;
    const user = await query('SELECT id FROM users WHERE clerk_id = $1', [clerkId]);
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const userId = user[0].id;

    const stats = await query(
      `SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE stage NOT IN ('ARCHIVED', 'CLOSED', 'DEAD')) AS active,
        COUNT(*) FILTER (WHERE stage = 'CLOSED') AS closed,
        COUNT(*) FILTER (WHERE stage = 'DEAD') AS dead,
        AVG(EXTRACT(DAY FROM (closed_date - created_at))) FILTER (WHERE stage = 'CLOSED') AS avg_days_to_close,
        COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) AS added_today
      FROM leads WHERE user_id = $1`,
      [userId]
    );

    const bySource = await query(
      'SELECT source, COUNT(*) AS count FROM leads WHERE user_id = $1 GROUP BY source ORDER BY count DESC',
      [userId]
    );

    const byStage = await query(
      'SELECT stage, COUNT(*) AS count FROM leads WHERE user_id = $1 GROUP BY stage ORDER BY count DESC',
      [userId]
    );

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

// GET /api/pipeline/health — Dedicated pipeline health scan
router.get('/health', async (req, res, next) => {
  try {
    const clerkId = req.user.userId;
    const user = await query('SELECT id FROM users WHERE clerk_id = $1', [clerkId]);
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const userId = user[0].id;

    const leads = await query(
      `SELECT id, address, stage, price, created_at, last_stage_change_at,
             follow_up_48hr_due, follow_up_48hr_done, updated_at
      FROM leads 
      WHERE user_id = $1 
      AND stage NOT IN ('ARCHIVED', 'CLOSED', 'DEAD')
      ORDER BY last_stage_change_at ASC`,
      [userId]
    );

    const now = new Date();
    const alerts = [];
    const stats = { total: leads.length, byStage: {}, stalled: 0, overdue48hr: 0, abandoned: 0 };

    leads.forEach(l => {
      stats.byStage[l.stage] = (stats.byStage[l.stage] || 0) + 1;
      const daysInStage = Math.floor((now - new Date(l.last_stage_change_at)) / 86400000);

      // Stale: New Lead > 7 days
      if (l.stage === 'NEW_LEAD' && daysInStage > 7) {
        stats.stalled++;
        alerts.push({ type: 'stale_lead', severity: 'yellow', leadId: l.id, address: l.address, daysInStage, detail: `${daysInStage} days at New Lead — no contact made` });
      }

      // Abandoned: Any stage > 30 days
      if (daysInStage > 30) {
        stats.abandoned++;
        alerts.push({ type: 'abandoned', severity: 'red', leadId: l.id, address: l.address, daysInStage, detail: `${daysInStage} days no movement — mark lost?` });
      }

      // Offer stalled: Offer Sent > 2 days
      if (l.stage === 'OFFER_SENT' && daysInStage > 2) {
        alerts.push({ type: 'offer_stalled', severity: 'red', leadId: l.id, address: l.address, daysInStage, detail: `${daysInStage} days at Offer Sent — no response. Call.` });
      }

      // 48hr overdue
      if (l.stage === 'OFFER_SENT' && !l.follow_up_48hr_done && l.follow_up_48hr_due && new Date(l.follow_up_48hr_due) < now) {
        stats.overdue48hr++;
        alerts.push({ type: '48hr_overdue', severity: 'red', leadId: l.id, address: l.address, detail: '48hr follow-up overdue — call now.' });
      }

      // Contract unsigned: Under Contract > 3 days
      if (l.stage === 'UNDER_CONTRACT' && daysInStage > 3) {
        alerts.push({ type: 'contract_unsigned', severity: 'red', leadId: l.id, address: l.address, daysInStage, detail: `${daysInStage} days — contract unsigned. Follow up.` });
      }
    });

    // Pipeline-wide anomalies
    const offerSentCount = stats.byStage['OFFER_SENT'] || 0;
    const loiApprovedCount = stats.byStage['LOI_APPROVED'] || 0;
    const underContractCount = stats.byStage['UNDER_CONTRACT'] || 0;

    const closedResult = await query('SELECT COUNT(*) as c FROM leads WHERE user_id = $1 AND stage = $2', [userId, 'CLOSED']);
    const closedCount = closedResult[0].c;

    if (offerSentCount > 5 && loiApprovedCount === 0) {
      alerts.push({ type: 'offer_cliff', severity: 'red', detail: `${offerSentCount} offers sent, 0 approved. Sellers are ghosting.` });
    }
    if (underContractCount > 3 && closedCount === 0) {
      alerts.push({ type: 'contract_gap', severity: 'red', detail: `${underContractCount} under contract, 0 closed. Deals dying in final stage.` });
    }

    res.json({
      success: true,
      stats: { ...stats, closedCount },
      alerts,
      scannedAt: now.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
