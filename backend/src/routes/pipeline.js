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
    const userId = req.user.userId;

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
          stage: lead.stage,
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
    const userId = req.user.userId;
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
    const userId = req.user.userId;

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
    const userId = req.user.userId;

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

// GET /api/pipeline/health — Full pipeline health scan (uses pipeline-monitor service)
router.get('/health', async (req, res, next) => {
  try {
    const { scanPipeline, formatReport } = require('../services/pipeline-monitor');
    const result = await scanPipeline();
    const report = formatReport(result);

    res.json({
      success: true,
      stats: result.stats,
      alerts: result.alerts,
      anomalies: result.anomalies,
      remindersDue: result.remindersDue,
      report,
      scannedAt: result.scannedAt,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/pipeline/stalled — Stalled leads (>7 days in stage)
router.get('/stalled', async (req, res, next) => {
  try {
    const { getStalledLeads } = require('../services/pipeline-monitor');
    const stalled = await getStalledLeads();
    res.json({ success: true, stalled, count: stalled.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/pipeline/overdue — Overdue 48hr follow-ups
router.get('/overdue', async (req, res, next) => {
  try {
    const { getOverdueFollowUps } = require('../services/pipeline-monitor');
    const overdue = await getOverdueFollowUps();
    res.json({ success: true, overdue, count: overdue.length });
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

// =============================================================
// DISPOSITION TRACKER
// =============================================================

const {
  getDispositions,
  getDispoSummary,
  createDispoRecord,
  transitionDispoStatus,
  assignBuyer,
} = require('../services/dispo-tracker');

// GET /api/pipeline/dispositions — All dispo records
router.get('/dispositions', async (req, res, next) => {
  try {
    const { status, limit, offset } = req.query;
    const result = await getDispositions({
      status,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// GET /api/pipeline/dispositions/summary — Dispo dashboard summary
router.get('/dispositions/summary', async (req, res, next) => {
  try {
    const summary = await getDispoSummary();
    res.json({ success: true, ...summary });
  } catch (err) {
    next(err);
  }
});

// POST /api/pipeline/dispositions — Create dispo record for a closed lead
router.post('/dispositions', async (req, res, next) => {
  try {
    const { leadId, holdStrategy, buyerTier, buyerName, buyerEmail, buyerPhone, assignmentFeePercent, estimatedSalePrice, targetCOE } = req.body;
    if (!leadId || !holdStrategy || !buyerTier) {
      return res.status(400).json({ error: 'leadId, holdStrategy, and buyerTier are required' });
    }
    const result = await createDispoRecord({
      leadId, holdStrategy, buyerTier, buyerName, buyerEmail, buyerPhone,
      assignmentFeePercent, estimatedSalePrice, targetCOE,
    });
    res.json({ success: true, dispo: result });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/pipeline/dispositions/:leadId/status — Transition dispo status
router.patch('/dispositions/:leadId/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required' });
    const result = await transitionDispoStatus(req.params.leadId, status);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// POST /api/pipeline/dispositions/:leadId/assign — Assign buyer to dispo
router.post('/dispositions/:leadId/assign', async (req, res, next) => {
  try {
    const { buyerName, buyerEmail, buyerPhone, buyerTier, holdStrategy, estimatedSalePrice, targetCOE } = req.body;
    if (!buyerName || !buyerTier) {
      return res.status(400).json({ error: 'buyerName and buyerTier are required' });
    }
    const result = await assignBuyer(req.params.leadId, {
      buyerName, buyerEmail, buyerPhone, buyerTier, holdStrategy, estimatedSalePrice, targetCOE,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// =============================================================
// POST-CLOSE ENGINE
// =============================================================

const {
  registerPostClose,
  sendTestimonialRequest,
  sendReferralRequest,
  runPokemonSpawn,
  tick: postCloseTick,
  getPostCloseStatus,
} = require('../services/post-close-engine');

// POST /api/pipeline/postclose/register — Register post-close hooks for a lead
router.post('/postclose/register', async (req, res, next) => {
  try {
    const { leadId, closeDate } = req.body;
    if (!leadId) return res.status(400).json({ error: 'leadId is required' });
    const result = await registerPostClose(leadId, closeDate);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// POST /api/pipeline/postclose/tick — Run daily post-close processing (cron)
router.post('/postclose/tick', async (req, res, next) => {
  try {
    const result = await postCloseTick();
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// GET /api/pipeline/postclose/:leadId — Get post-close status for a lead
router.get('/postclose/:leadId', async (req, res, next) => {
  try {
    const result = await getPostCloseStatus(req.params.leadId);
    if (!result) return res.status(404).json({ error: 'Lead not found' });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// POST /api/pipeline/postclose/:leadId/testimonial — Send testimonial request
router.post('/postclose/:leadId/testimonial', async (req, res, next) => {
  try {
    const result = await sendTestimonialRequest(req.params.leadId);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// POST /api/pipeline/postclose/:leadId/referral — Send referral request
router.post('/postclose/:leadId/referral', async (req, res, next) => {
  try {
    const result = await sendReferralRequest(req.params.leadId);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// POST /api/pipeline/postclose/:leadId/pokemon — Spawn Pokémon (buyer match)
router.post('/postclose/:leadId/pokemon', async (req, res, next) => {
  try {
    const result = await runPokemonSpawn(req.params.leadId);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
