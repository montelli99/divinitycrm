// =============================================================
// Emily — Daily Lead Queue + Next-Action Engine
// =============================================================
// Surfaces the prioritized list of leads Emily (the operations assistant)
// should push forward each day, plus the exact next action and script
// shortcut for each lead. Used by cron-daily.js and any dashboard widget.

const { query } = require('../db/connection');
const { OUTREACH_SCRIPTS } = require('./script-prompts');

const STAGE_PRIORITY = {
  LEAD_ENTERED: 1,
  CONTACT_MADE: 2,
  OFFER_READY: 3,
  OFFER_SENT: 4,
  OFFER_RECEIVED: 5,
  GAIN_FEEDBACK: 6,
  ACTIVE_NEGOTIATION: 7,
  TERMS_AGREED: 8,
  NO_ANSWER: 9,
  SELLER_DECLINED: 10,
  AWAITING_TITLE: 11,
  CONTRACT_OUT: 12,
  UNDER_CONTRACT: 13,
  INSPECTION_PERIOD: 14,
  INSPECTION_COMPLETE: 15,
  APPRAISAL_ORDERED: 16,
  APPRAISAL_DONE: 17,
  JV_SENT: 18,
  JV_SIGNED: 19,
  WIRE_SETUP: 20,
  CLOSING_DATE: 21,
};

const STAGE_LABELS = {
  LEAD_ENTERED: '🎯 NEW LEAD',
  CONTACT_MADE: '📞 CONTACTED',
  OFFER_READY: '📋 OFFER READY',
  OFFER_SENT: '📤 OFFER SENT',
  OFFER_RECEIVED: '📥 OFFER RECEIVED',
  GAIN_FEEDBACK: '💬 GAIN FEEDBACK',
  NO_ANSWER: '📵 NO ANSWER',
  SELLER_DECLINED: '❌ DECLINED',
  ACTIVE_NEGOTIATION: '🤝 NEGOTIATING',
  TERMS_AGREED: '✅ TERMS AGREED',
  AWAITING_TITLE: '⏳ AWAITING TITLE',
  CONTRACT_OUT: '📄 CONTRACT OUT',
  UNDER_CONTRACT: '✍️ UNDER CONTRACT',
  INSPECTION_PERIOD: '🔍 INSPECTION',
  INSPECTION_COMPLETE: '✓ INSPECTION DONE',
  APPRAISAL_ORDERED: '📊 APPRAISAL ORDERED',
  APPRAISAL_DONE: '📈 APPRAISAL DONE',
  JV_SENT: '🤝 JV SENT',
  JV_SIGNED: '✓ JV SIGNED',
  WIRE_SETUP: '💸 WIRE SETUP',
  CLOSING_DATE: '🎉 CLOSING',
};

const NEXT_ACTIONS = {
  LEAD_ENTERED: { action: 'Send intro text / call seller', script: 'INT', owner: 'Montelli' },
  CONTACT_MADE: { action: 'Send contact card + set 48hr follow-up', script: 'CCC', owner: 'Montelli' },
  OFFER_READY: { action: 'Run underwriting and generate LOI', script: null, owner: 'Seth/Montelli' },
  OFFER_SENT: { action: 'Confirm LOI received; schedule GCJ', script: 'GCJ', owner: 'Montelli' },
  OFFER_RECEIVED: { action: 'Hand off to Kayla for feedback', script: null, owner: 'Kayla' },
  GAIN_FEEDBACK: { action: 'Follow up for seller feedback', script: 'LOI', owner: 'Montelli' },
  NO_ANSWER: { action: 'Voice memo + LOI2DAYS sequence', script: 'LOI2DAYS', owner: 'Montelli' },
  SELLER_DECLINED: { action: 'Send decline nurture; schedule 30-day revisit', script: 'SD', owner: 'Montelli' },
  ACTIVE_NEGOTIATION: { action: 'Re-run underwriting with counter', script: null, owner: 'Montelli/Kayla' },
  TERMS_AGREED: { action: 'Draft contract + notify TC', script: null, owner: 'Kayla/Jaxon' },
  AWAITING_TITLE: { action: 'Request mortgage statement / title docs', script: 'PSA_CALL_OPENER', owner: 'TC' },
  CONTRACT_OUT: { action: 'Send RabbitSign envelope for signature', script: null, owner: 'TC' },
  UNDER_CONTRACT: { action: 'Schedule inspection + day-7 SMS', script: 'INSPECTION_SCHEDULED', owner: 'TC' },
  INSPECTION_PERIOD: { action: 'Monitor inspection countdown', script: null, owner: 'TC' },
  INSPECTION_COMPLETE: { action: 'Order appraisal', script: null, owner: 'TC' },
  APPRAISAL_ORDERED: { action: 'Coordinate appraiser access', script: null, owner: 'TC' },
  APPRAISAL_DONE: { action: 'Branch JV or wire setup based on appraisal', script: null, owner: 'TC' },
  JV_SENT: { action: 'Collect JV signatures', script: 'JV_SIGNED', owner: 'TC' },
  JV_SIGNED: { action: 'Move to wire setup', script: null, owner: 'TC' },
  WIRE_SETUP: { action: 'Confirm wire instructions + closing', script: 'CLOSING_CONFIRMED', owner: 'Closing' },
  CLOSING_DATE: { action: 'Closing today — COE checklist', script: 'COE_MINUS_7', owner: 'Closing' },
};

async function getTodaysQueue(limit = 50) {
  const r = await query(`
    SELECT id, address, city, state, zip, stage, recommended_strategy,
           cash_offer, f50_offer, f10_offer, subto_offer,
           seller_name, agent_name, seller_phone AS phone, seller_email AS email, updated_at
    FROM leads
    WHERE stage NOT IN ('ARCHIVED', 'DEAD')
      AND stage IS NOT NULL
    ORDER BY
      CASE stage
        ${Object.entries(STAGE_PRIORITY).map(([stage, prio]) => `WHEN '${stage}' THEN ${prio}`).join('\n        ')}
        ELSE 99
      END,
      updated_at DESC
    LIMIT $1
  `, [limit]);
  return r.map(lead => ({
    ...lead,
    label: STAGE_LABELS[lead.stage] || lead.stage,
    priority: STAGE_PRIORITY[lead.stage] || 99,
    nextAction: NEXT_ACTIONS[lead.stage] || { action: 'Review lead', script: null, owner: 'Unassigned' },
    scriptBody: lead.stage && OUTREACH_SCRIPTS[lead.nextAction?.script]?.body ? OUTREACH_SCRIPTS[lead.nextAction.script].body : null,
  }));
}

function formatQueueForText(leads) {
  const counts = {};
  leads.forEach(l => { counts[l.stage] = (counts[l.stage] || 0) + 1; });
  const summary = Object.entries(counts)
    .map(([stage, n]) => `${STAGE_LABELS[stage] || stage}: ${n}`)
    .slice(0, 12)
    .join('\n');

  const top = leads.slice(0, 5).map(l => {
    const action = l.nextAction;
    return `• ${l.address} ${l.city || ''} ${l.state || ''}\n  ${l.label} → ${action.action}${action.script ? ` [${action.script}]` : ''}`;
  }).join('\n');

  return { summary, top, total: leads.length };
}

module.exports = {
  getTodaysQueue,
  formatQueueForText,
  STAGE_PRIORITY,
  STAGE_LABELS,
  NEXT_ACTIONS,
};
