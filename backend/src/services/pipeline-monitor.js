// =============================================================
// Pipeline Monitor Service — Divinity CRM
// =============================================================
// Built: 2026-06-18 by Atlas (Phase 4)
// Source: ghl-automations/modules/pipeline-monitor.js
//
// Purpose: Automated 30-min pipeline health scans.
//          Detects stalled deals, stage anomalies, offer drop-offs,
//          contract gaps, overdue follow-ups.
//          Wires into /api/pipeline/health endpoint.
//
// Scan rules:
//   1. STALE LEAD: Stage 1 (LEAD_ENTERED) > 7 days
//   2. ABANDONED: Any stage > 30 days
//   3. OFFER STALLED: OFFER_SENT > 2 days
//   4. CONTRACT UNSIGNED: AWAITING_TITLE/CONTRACT_OUT > 3 days
//   5. JV UNSIGNED: JV_SENT/JV_SIGNED > 5 days
//   6. OFFER CLIFF: >5 offers sent, 0 received
//   7. CONTRACT GAP: >3 contracts out, 0 under contract
//   8. 48HR OVERDUE: follow_up_48hr_due past due
//   9. TITLE OVERDUE: AWAITING_TITLE > 3 days
//  10. INSPECTION OVERDUE: INSPECTION_PERIOD past end date
// =============================================================

const { query } = require('../db/connection');

// =============================================================
// STAGE LABELS
// =============================================================

const STAGE_LABELS = {
  LEAD_ENTERED: 'Lead Entered',
  CONTACT_MADE: 'Contact Made',
  OFFER_READY: 'Offer Ready',
  OFFER_SENT: 'Offer Sent',
  OFFER_RECEIVED: 'Offer Received',
  GAIN_FEEDBACK: 'Gain Feedback',
  NO_ANSWER: 'No Answer',
  SELLER_DECLINED: 'Seller Declined',
  ACTIVE_NEGOTIATION: 'Active Negotiation',
  TERMS_AGREED: 'Terms Agreed',
  AWAITING_TITLE: 'Awaiting Title',
  CONTRACT_OUT: 'Contract Out',
  UNDER_CONTRACT: 'Under Contract',
  INSPECTION_PERIOD: 'Inspection Period',
  INSPECTION_COMPLETE: 'Inspection Complete',
  APPRAISAL_ORDERED: 'Appraisal Ordered',
  APPRAISAL_DONE: 'Appraisal Done',
  JV_SENT: 'JV Sent',
  JV_SIGNED: 'JV Signed',
  WIRE_SETUP: 'Wire Setup',
  CLOSING_DATE: 'Closing Date',
};

// =============================================================
// SCAN RULES
// =============================================================

const SCAN_RULES = [
  {
    id: 'stale_lead',
    severity: 'yellow',
    check: (lead, daysInStage) => lead.stage === 'LEAD_ENTERED' && daysInStage > 7,
    message: (lead, days) => `${days} days at Lead Entered — no contact made`,
  },
  {
    id: 'abandoned',
    severity: 'red',
    check: (lead, daysInStage) => daysInStage > 30 && lead.stage !== 'CLOSING_DATE',
    message: (lead, days) => `${days} days no movement — mark lost?`,
  },
  {
    id: 'offer_stalled',
    severity: 'red',
    check: (lead, daysInStage) => lead.stage === 'OFFER_SENT' && daysInStage > 2,
    message: (lead, days) => `${days} days at Offer Sent — no response from seller. Call.`,
  },
  {
    id: 'contract_unsigned',
    severity: 'red',
    check: (lead, daysInStage) =>
      (lead.stage === 'CONTRACT_OUT' || lead.stage === 'AWAITING_TITLE') && daysInStage > 3,
    message: (lead, days) => `${days} days — contract unsigned. Follow up.`,
  },
  {
    id: 'jv_unsigned',
    severity: 'red',
    check: (lead, daysInStage) =>
      (lead.stage === 'JV_SENT' || lead.stage === 'JV_SIGNED') && daysInStage > 5,
    message: (lead, days) => `${days} days — JV not finalized. Follow up.`,
  },
  {
    id: '48hr_overdue',
    severity: 'red',
    check: (lead) =>
      lead.stage === 'OFFER_SENT' &&
      !lead.follow_up_48hr_done &&
      lead.follow_up_48hr_due &&
      new Date(lead.follow_up_48hr_due) < new Date(),
    message: () => '48hr follow-up overdue — call now.',
  },
  {
    id: 'title_overdue',
    severity: 'red',
    check: (lead, daysInStage) => lead.stage === 'AWAITING_TITLE' && daysInStage > 3,
    message: (lead, days) => `${days} days — title info not received. Follow up.`,
  },
  {
    id: 'inspection_overdue',
    severity: 'yellow',
    check: (lead) =>
      lead.stage === 'INSPECTION_PERIOD' &&
      lead.inspection_end_date &&
      new Date(lead.inspection_end_date) < new Date(),
    message: () => 'Inspection period has ended — advance to Inspection Complete.',
  },
  {
    id: 'nurture_due',
    severity: 'yellow',
    check: (lead) =>
      lead.nurture_stage &&
      lead.nurture_stage !== 'none' &&
      lead.stage === 'SELLER_DECLINED',
    message: (lead) => `Nurture stage: ${lead.nurture_stage} — check if follow-up is due.`,
  },
];

// =============================================================
// PIPELINE-WIDE ANOMALY CHECKS
// =============================================================

function checkPipelineAnomalies(stageCounts) {
  const anomalies = [];

  const offerSent = stageCounts['OFFER_SENT'] || 0;
  const offerReceived = stageCounts['OFFER_RECEIVED'] || 0;
  const contractOut = stageCounts['CONTRACT_OUT'] || 0;
  const underContract = stageCounts['UNDER_CONTRACT'] || 0;
  const leadEntered = stageCounts['LEAD_ENTERED'] || 0;
  const contactMade = stageCounts['CONTACT_MADE'] || 0;

  // Offer cliff: >5 offers sent, 0 received
  if (offerSent > 5 && offerReceived === 0) {
    anomalies.push({
      type: 'offer_cliff',
      severity: 'red',
      detail: `${offerSent} offers sent, 0 received. Sellers are ghosting.`,
    });
  }

  // Contract gap: >3 contracts out, 0 under contract
  if (contractOut > 3 && underContract === 0) {
    anomalies.push({
      type: 'contract_gap',
      severity: 'red',
      detail: `${contractOut} contracts out, 0 under contract. Deals dying in final stage.`,
    });
  }

  // Lead funnel collapse: lots of leads entered, few contacted
  if (leadEntered > 10 && contactMade < 3) {
    anomalies.push({
      type: 'funnel_collapse',
      severity: 'yellow',
      detail: `${leadEntered} leads entered, only ${contactMade} contacted. Outreach bottleneck.`,
    });
  }

  return anomalies;
}

// =============================================================
// FULL PIPELINE SCAN
// =============================================================

async function scanPipeline() {
  const now = new Date();

  // Get all active leads
  const leads = await query(
    `SELECT id, address, stage, price, created_at, last_stage_change_at,
            follow_up_48hr_due, follow_up_48hr_done, nurture_stage,
            inspection_end_date, updated_at, user_id
    FROM leads 
    WHERE stage NOT IN ('ARCHIVED', 'CLOSED', 'DEAD')
    ORDER BY last_stage_change_at ASC`
  );

  const alerts = [];
  const stats = {
    total: leads.length,
    byStage: {},
    byUser: {},
    stalled: 0,
    overdue48hr: 0,
    abandoned: 0,
    open: leads.length,
    lost: 0,
    won: 0,
  };

  // Count closed/won and dead/lost
  const terminalCounts = await query(
    `SELECT 
      COUNT(*) FILTER (WHERE stage = 'CLOSED') AS won,
      COUNT(*) FILTER (WHERE stage = 'DEAD') AS lost
    FROM leads`
  );
  stats.won = parseInt(terminalCounts[0].won) || 0;
  stats.lost = parseInt(terminalCounts[0].lost) || 0;

  // Scan each lead
  leads.forEach(lead => {
    stats.byStage[lead.stage] = (stats.byStage[lead.stage] || 0) + 1;
    stats.byUser[lead.user_id || 'unassigned'] = (stats.byUser[lead.user_id || 'unassigned'] || 0) + 1;

    const daysInStage = Math.floor((now - new Date(lead.last_stage_change_at)) / 86400000);

    SCAN_RULES.forEach(rule => {
      if (rule.check(lead, daysInStage)) {
        alerts.push({
          type: rule.id,
          severity: rule.severity,
          leadId: lead.id,
          address: lead.address,
          daysInStage,
          detail: rule.message(lead, daysInStage),
        });

        if (rule.id === 'stale_lead') stats.stalled++;
        if (rule.id === 'abandoned') stats.abandoned++;
        if (rule.id === '48hr_overdue') stats.overdue48hr++;
      }
    });
  });

  // Pipeline-wide anomalies
  const anomalies = checkPipelineAnomalies(stats.byStage);
  anomalies.forEach(a => alerts.push({
    type: a.type,
    severity: a.severity,
    leadId: null,
    address: 'PIPELINE-WIDE',
    daysInStage: 0,
    detail: a.detail,
  }));

  // Get reminders due today
  const today = now.toISOString().split('T')[0];
  const remindersDue = await query(
    `SELECT r.*, l.address 
    FROM reminders r 
    JOIN leads l ON r.lead_id = l.id 
    WHERE r.completed = false 
    AND r.due_date::date <= $1
    ORDER BY r.due_date`,
    [today]
  );

  return {
    alerts,
    stats,
    anomalies,
    remindersDue,
    scannedAt: now.toISOString(),
  };
}

// =============================================================
// FORMAT REPORT (human-readable)
// =============================================================

function formatReport(scanResult) {
  const { alerts, stats, remindersDue } = scanResult;
  const lines = [
    `🦞 PIPELINE HEALTH — ${new Date().toLocaleDateString()}`,
    '',
    `Total: ${stats.total} leads | Open: ${stats.open} | Won: ${stats.won} | Lost: ${stats.lost}`,
    '',
    'BY STAGE:',
  ];

  const stageOrder = Object.keys(STAGE_LABELS);
  stageOrder.forEach(stage => {
    const count = stats.byStage[stage] || 0;
    if (count > 0) {
      const bar = '█'.repeat(Math.min(count, 20));
      lines.push(`  ${STAGE_LABELS[stage]}: ${bar} ${count}`);
    }
  });

  if (alerts.length > 0) {
    lines.push('');
    lines.push(`🚨 ${alerts.length} ALERTS:`);
    const bySeverity = { red: [], yellow: [], green: [] };
    alerts.forEach(a => {
      bySeverity[a.severity] = bySeverity[a.severity] || [];
      bySeverity[a.severity].push(a);
    });

    if (bySeverity.red.length > 0) {
      lines.push(`  🔴 CRITICAL (${bySeverity.red.length}):`);
      bySeverity.red.forEach(a => {
        const url = a.leadId ? ` — https://divinitycrm-ggi5.onrender.com/#/leads/${a.leadId}` : '';
        lines.push(`    - ${a.address}: ${a.detail}${url}`);
      });
    }
    if (bySeverity.yellow.length > 0) {
      lines.push(`  🟡 WARNING (${bySeverity.yellow.length}):`);
      bySeverity.yellow.forEach(a => {
        const url = a.leadId ? ` — https://divinitycrm-ggi5.onrender.com/#/leads/${a.leadId}` : '';
        lines.push(`    - ${a.address}: ${a.detail}${url}`);
      });
    }
  } else {
    lines.push('');
    lines.push('✅ No alerts. Pipeline is healthy.');
  }

  if (remindersDue.length > 0) {
    lines.push('');
    lines.push(`📅 ${remindersDue.length} REMINDERS DUE TODAY:`);
    remindersDue.forEach(r => lines.push(`  - ${r.address}: ${r.type} (due ${new Date(r.due_date).toLocaleDateString()}) — https://divinitycrm-ggi5.onrender.com/#/leads/${r.lead_id || ''}`));
  }

  return lines.join('\n');
}

// =============================================================
// RUN — full scan + report (for cron/scheduled execution)
// =============================================================

async function run() {
  console.log(`[Pipeline Monitor] Scanning at ${new Date().toISOString()}...`);
  const result = await scanPipeline();
  const report = formatReport(result);
  console.log(report);

  // Log scan to activity_log
  if (result.alerts.length > 0) {
    await query(
      `INSERT INTO activity_log (action, details, created_at)
      VALUES ('pipeline_scan', $1, now())`,
      [JSON.stringify({
        alertCount: result.alerts.length,
        redAlerts: result.alerts.filter(a => a.severity === 'red').length,
        yellowAlerts: result.alerts.filter(a => a.severity === 'yellow').length,
        scannedAt: result.scannedAt,
      })]
    );
  }

  return result;
}

// =============================================================
// GET STALLED LEADS (for dashboard widget)
// =============================================================

async function getStalledLeads() {
  const now = new Date();
  const leads = await query(
    `SELECT id, address, stage, last_stage_change_at, price, user_id
    FROM leads 
    WHERE stage NOT IN ('ARCHIVED', 'CLOSED', 'DEAD')
    ORDER BY last_stage_change_at ASC`
  );

  return leads
    .map(lead => ({
      ...lead,
      daysInStage: Math.floor((now - new Date(lead.last_stage_change_at)) / 86400000),
    }))
    .filter(lead => lead.daysInStage > 7)
    .sort((a, b) => b.daysInStage - a.daysInStage);
}

// =============================================================
// GET OVERDUE FOLLOW-UPS
// =============================================================

async function getOverdueFollowUps() {
  return query(
    `SELECT id, address, stage, follow_up_48hr_due, follow_up_48hr_done, user_id
    FROM leads 
    WHERE stage = 'OFFER_SENT' 
    AND follow_up_48hr_done = false 
    AND follow_up_48hr_due < now()
    ORDER BY follow_up_48hr_due ASC`
  );
}

// =============================================================
// EXPORT
// =============================================================

module.exports = {
  STAGE_LABELS,
  SCAN_RULES,
  scanPipeline,
  formatReport,
  run,
  getStalledLeads,
  getOverdueFollowUps,
  checkPipelineAnomalies,
};
