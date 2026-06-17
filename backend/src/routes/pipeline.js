// =============================================================
// Divinity CRM Platform — Pipeline API Routes (21-Stage)
// =============================================================

const { Router } = require('express');
const { query } = require('../db/connection');
const { getOwnerForStage } = require('../services/stage-automations');

const router = Router();

const STAGES = [
  'LEAD_ENTERED', 'CONTACT_MADE', 'OFFER_READY',
  'OFFER_SENT', 'OFFER_RECEIVED', 'GAIN_FEEDBACK',
  'NO_ANSWER', 'SELLER_DECLINED', 'ACTIVE_NEGOTIATION',
  'TERMS_AGREED',
  'AWAITING_TITLE', 'CONTRACT_OUT',
  'UNDER_CONTRACT', 'INSPECTION_PERIOD', 'INSPECTION_COMPLETE',
  'APPRAISAL_ORDERED', 'APPRAISAL_DONE',
  'JV_SENT', 'JV_SIGNED',
  'WIRE_SETUP', 'CLOSING_DATE',
];

// GET /api/pipeline — Full pipeline view with health scan
router.get('/', async (req, res, next) => {
  try {
    const clerkId = req.user.userId;
    const user = await query('SELECT id FROM users WHERE clerk_id = $1', [clerkId]);
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const userId = user[0].id;

    const leads = await query(
      `SELECT * FROM leads 
      WHERE user_id = $1 
      AND stage NOT IN ('ARCHIVED', 'CLOSING_DATE', 'DEAD')
      ORDER BY updated_at DESC`,
      [userId]
    );

    const byStage = {};
    STAGES.forEach(stage => { byStage[stage] = []; });
    
    leads.forEach(lead => {
      const stage = lead.stage;
      if (byStage[stage]) {
        const daysInStage = Math.floor((Date.now() - new Date(lead.last_stage_change_at).getTime()) / 86400000);
        const owner = getOwnerForStage(stage);
        byStage[stage].push({
          id: lead.id,
          address: lead.address,
          price: lead.price,
          seller_name: lead.seller_name,
          days_in_stage: daysInStage,
          next_action: getNextAction(lead),
          stalled: daysInStage > 7,
          owner: owner.name,
          recommended_strategy: lead.recommended_strategy,
          contract_type: lead.contract_type,
          rabbitsign_status: lead.rabbitsign_status,
        });
      }
    });

    const stats = await query(
      `SELECT 
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE stage NOT IN ('ARCHIVED', 'CLOSING_DATE', 'DEAD')) AS active,
        COUNT(*) FILTER (WHERE stage = 'CLOSING_DATE') AS closed,
        COUNT(*) FILTER (WHERE stage = 'DEAD') AS dead
      FROM leads WHERE user_id = $1`,
      [userId]
    );

    const conversionRate = stats[0].total > 0 
      ? Math.round((stats[0].closed / (stats[0].closed + stats[0].dead)) * 100) 
      : 0;

    // Health alerts
    const alerts = [];
    
    const leadEntered = byStage['LEAD_ENTERED'] || [];
    const offerSent = byStage['OFFER_SENT'] || [];
    const awaitingTitle = byStage['AWAITING_TITLE'] || [];
    const underContract = byStage['UNDER_CONTRACT'] || [];
    const allActive = Object.values(byStage).flat();

    // Stale leads: Stage 1 > 7 days
    leadEntered.forEach(l => {
      if (l.days_in_stage > 7) alerts.push({ severity: 'yellow', type: 'stale_lead', lead: l.address, detail: `${l.days_in_stage} days at Lead Entered — no contact made` });
    });

    // Abandoned: Any stage > 30 days
    allActive.forEach(l => {
      if (l.days_in_stage > 30) alerts.push({ severity: 'red', type: 'abandoned', lead: l.address, detail: `${l.days_in_stage} days no movement — mark lost?` });
    });

    // Offer stalled: Offer Sent > 2 days
    offerSent.forEach(l => {
      if (l.days_in_stage > 2) alerts.push({ severity: 'red', type: 'offer_stalled', lead: l.address, detail: `${l.days_in_stage} days at Offer Sent — no response. Call.` });
    });

    // Title overdue: Awaiting Title > 3 days
    awaitingTitle.forEach(l => {
      if (l.days_in_stage > 3) alerts.push({ severity: 'red', type: 'title_overdue', lead: l.address, detail: `${l.days_in_stage} days — title info not received. Follow up.` });
    });

    // Contract unsigned: Under Contract > 3 days
    underContract.forEach(l => {
      if (l.days_in_stage > 3) alerts.push({ severity: 'red', type: 'contract_unsigned', lead: l.address, detail: `${l.days_in_stage} days — contract unsigned. Follow up.` });
    });

    // 48hr follow-up overdue
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
        COUNT(*) FILTER (WHERE stage NOT IN ('ARCHIVED', 'CLOSING_DATE', 'DEAD')) AS active,
        COUNT(*) FILTER (WHERE stage = 'CLOSING_DATE') AS closed,
        COUNT(*) FILTER (WHERE stage = 'DEAD') AS dead,
        AVG(EXTRACT(DAY FROM (closed_date - created_at))) FILTER (WHERE stage = 'CLOSING_DATE') AS avg_days_to_close,
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

// GET /api/pipeline/profit-radar — Pipeline Profit Radar
router.get('/profit-radar', async (req, res, next) => {
  try {
    const clerkId = req.user.userId;
    const user = await query('SELECT id FROM users WHERE clerk_id = $1', [clerkId]);
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const userId = user[0].id;

    // Get all active leads with financial data
    const leads = await query(
      `SELECT id, address, price, stage, estimated_profit, cash_flow, dscr, recommended_strategy, coe_date
      FROM leads 
      WHERE user_id = $1 
      AND stage NOT IN ('ARCHIVED', 'DEAD')
      ORDER BY estimated_profit DESC NULLS LAST`,
      [userId]
    );

    const totalPipelineValue = leads.reduce((sum, l) => sum + (Number(l.price) || 0), 0);
    const totalEstimatedProfit = leads.reduce((sum, l) => sum + (Number(l.estimated_profit) || 0), 0);

    // Weighted pipeline: probability-weighted by stage
    const stageProbabilities = {
      'LEAD_ENTERED': 0.05, 'CONTACT_MADE': 0.10, 'OFFER_READY': 0.20,
      'OFFER_SENT': 0.30, 'OFFER_RECEIVED': 0.35, 'GAIN_FEEDBACK': 0.40,
      'NO_ANSWER': 0.15, 'SELLER_DECLINED': 0.05, 'ACTIVE_NEGOTIATION': 0.60,
      'TERMS_AGREED': 0.80,
      'AWAITING_TITLE': 0.85, 'CONTRACT_OUT': 0.90,
      'UNDER_CONTRACT': 0.92, 'INSPECTION_PERIOD': 0.93, 'INSPECTION_COMPLETE': 0.95,
      'APPRAISAL_ORDERED': 0.96, 'APPRAISAL_DONE': 0.97,
      'JV_SENT': 0.97, 'JV_SIGNED': 0.98,
      'WIRE_SETUP': 0.99, 'CLOSING_DATE': 1.0,
    };

    const weightedPipeline = leads.reduce((sum, l) => {
      const prob = stageProbabilities[l.stage] || 0.1;
      return sum + (Number(l.estimated_profit) || 0) * prob;
    }, 0);

    // Deals closing in next 30 days
    const now = new Date();
    const thirtyDaysOut = new Date(now.getTime() + 30 * 86400000);
    const dealsClosing30d = leads.filter(l => {
      if (!l.coe_date) return false;
      const coe = new Date(l.coe_date);
      return coe <= thirtyDaysOut && coe >= now;
    }).length;

    const avgDealSize = leads.length > 0 ? totalPipelineValue / leads.length : 0;

    // Top deals by profit
    const topDeals = leads
      .filter(l => l.estimated_profit > 0)
      .slice(0, 10)
      .map(l => ({
        id: l.id,
        address: l.address,
        price: l.price,
        estimated_profit: l.estimated_profit,
        stage: l.stage,
        strategy: l.recommended_strategy,
      }));

    res.json({
      totalPipelineValue,
      estimatedProfit: totalEstimatedProfit,
      weightedPipeline,
      avgDealSize,
      dealsClosing30d,
      topDeals,
      leadCount: leads.length,
    });
  } catch (err) {
    next(err);
  }
});

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
      AND stage NOT IN ('ARCHIVED', 'CLOSING_DATE', 'DEAD')
      ORDER BY last_stage_change_at ASC`,
      [userId]
    );

    const now = new Date();
    const alerts = [];
    const stats = { total: leads.length, byStage: {}, stalled: 0, overdue48hr: 0, abandoned: 0 };

    leads.forEach(l => {
      stats.byStage[l.stage] = (stats.byStage[l.stage] || 0) + 1;
      const daysInStage = Math.floor((now - new Date(l.last_stage_change_at)) / 86400000);

      if (l.stage === 'LEAD_ENTERED' && daysInStage > 7) {
        stats.stalled++;
        alerts.push({ type: 'stale_lead', severity: 'yellow', leadId: l.id, address: l.address, daysInStage, detail: `${daysInStage} days at Lead Entered — no contact made` });
      }

      if (daysInStage > 30) {
        stats.abandoned++;
        alerts.push({ type: 'abandoned', severity: 'red', leadId: l.id, address: l.address, daysInStage, detail: `${daysInStage} days no movement — mark lost?` });
      }

      if (l.stage === 'OFFER_SENT' && daysInStage > 2) {
        alerts.push({ type: 'offer_stalled', severity: 'red', leadId: l.id, address: l.address, daysInStage, detail: `${daysInStage} days at Offer Sent — no response. Call.` });
      }

      if (l.stage === 'OFFER_SENT' && !l.follow_up_48hr_done && l.follow_up_48hr_due && new Date(l.follow_up_48hr_due) < now) {
        stats.overdue48hr++;
        alerts.push({ type: '48hr_overdue', severity: 'red', leadId: l.id, address: l.address, detail: '48hr follow-up overdue — call now.' });
      }

      if (l.stage === 'AWAITING_TITLE' && daysInStage > 3) {
        alerts.push({ type: 'title_overdue', severity: 'red', leadId: l.id, address: l.address, daysInStage, detail: `${daysInStage} days — title info not received.` });
      }

      if (l.stage === 'UNDER_CONTRACT' && daysInStage > 3) {
        alerts.push({ type: 'contract_unsigned', severity: 'red', leadId: l.id, address: l.address, daysInStage, detail: `${daysInStage} days — contract unsigned.` });
      }
    });

    const closedResult = await query('SELECT COUNT(*) as c FROM leads WHERE user_id = $1 AND stage = $2', [userId, 'CLOSING_DATE']);
    const closedCount = closedResult[0].c;

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

// Helper: determine next action based on stage
function getNextAction(lead) {
  const actions = {
    'LEAD_ENTERED': 'Send INT text + call',
    'CONTACT_MADE': 'Send CCC + check 1% rule',
    'OFFER_READY': 'Run comps + prepare LOI',
    'OFFER_SENT': '48hr follow-up call',
    'OFFER_RECEIVED': 'Monitor seller response',
    'GAIN_FEEDBACK': 'Realignment call',
    'NO_ANSWER': 'Voice memo + LOI2DAYS',
    'SELLER_DECLINED': '30/60/90/181 nurture',
    'ACTIVE_NEGOTIATION': 'Overcome objections / relay to Kayla',
    'TERMS_AGREED': 'Draft contract',
    'AWAITING_TITLE': 'Request mortgage statement',
    'CONTRACT_OUT': 'RabbitSign + TC handshake',
    'UNDER_CONTRACT': '14-day inspection countdown',
    'INSPECTION_PERIOD': 'Daily status track',
    'INSPECTION_COMPLETE': 'Auto-advance to Appraisal',
    'APPRAISAL_ORDERED': 'Coordinate TC for access',
    'APPRAISAL_DONE': 'Re-run calc + APPRAISAL_DONE SMS',
    'JV_SENT': 'Monitor signatures',
    'JV_SIGNED': 'Set Title Holder',
    'WIRE_SETUP': 'Confirm wire instructions',
    'CLOSING_DATE': 'Post-close engine',
  };
  return actions[lead.stage] || 'Review';
}

module.exports = router;
