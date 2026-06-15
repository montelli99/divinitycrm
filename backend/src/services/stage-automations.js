// =============================================================
// Student CRM Platform — Stage Automation Engine
// Fires on every stage change — mirrors GHL workflow triggers
// =============================================================

// DB connection loaded lazily to avoid requiring DATABASE_URL at import time
let sql;
function getSql() {
  if (!sql) sql = require('../db/connection').sql;
  return sql;
}

/**
 * STAGE AUTOMATION MAP — mirrors GHL_WORKFLOWS_SPEC.md
 * Each stage transition triggers specific automated actions.
 */

const STAGE_AUTOMATIONS = {
  // Stage 1: NEW_LEAD → QUALIFIED (Contact Made)
  'NEW_LEAD→QUALIFIED': {
    name: 'Contact Made — CCC + 48hr Timer',
    actions: [
      { type: 'set_field', field: 'loi_sent_date', value: null }, // reset
      { type: 'set_reminder', reminder_type: '48hr_followup', offset_hours: 48, notes: 'Nurture follow-up — send CCC if not already sent' },
      { type: 'log', message: 'Contact made. CCC sent. 48hr nurture timer set.' },
    ],
  },

  // Stage 2: QUALIFIED → LOI_REQUESTED (Offer Ready)
  'QUALIFIED→LOI_REQUESTED': {
    name: 'Offer Ready — Run Underwriting',
    actions: [
      { type: 'run_underwriting', description: 'Calculate ARV, 1% rule, all 5 strategies' },
      { type: 'set_field', field: 'loi_sent_date', value: 'now' },
      { type: 'log', message: 'LOI requested. Underwriting calculations run.' },
    ],
  },

  // Stage 3: LOI_REQUESTED → LOI_APPROVED (Offer Received)
  'LOI_REQUESTED→LOI_APPROVED': {
    name: 'LOI Approved — Notify Closer',
    actions: [
      { type: 'set_field', field: 'loi_approved_date', value: 'now' },
      { type: 'notify', role: 'closer', message: 'LOI approved on {address}. Ready for offer.' },
      { type: 'log', message: 'LOI approved. Notified closer.' },
    ],
  },

  // Stage 4: LOI_APPROVED → OFFER_SENT (Offer Sent)
  'LOI_APPROVED→OFFER_SENT': {
    name: 'Offer Sent — 48hr Realign Timer',
    actions: [
      { type: 'set_field', field: 'offer_sent_date', value: 'now' },
      { type: 'set_field', field: 'follow_up_48hr_due', value: 'now+48h' },
      { type: 'set_field', field: 'follow_up_48hr_done', value: false },
      { type: 'set_reminder', reminder_type: '48hr_followup', offset_hours: 48, notes: 'Realign call — do NOT say "just checking in"' },
      { type: 'log', message: 'Offer sent. 48hr realign timer started.' },
    ],
  },

  // Stage 5: OFFER_SENT → NEGOTIATING (Gain Feedback)
  'OFFER_SENT→NEGOTIATING': {
    name: 'Gain Feedback — Active Negotiation',
    actions: [
      { type: 'set_field', field: 'follow_up_48hr_done', value: true },
      { type: 'log', message: 'Follow-up completed. Entering active negotiation.' },
    ],
  },

  // Stage 6: NEGOTIATING → UNDER_CONTRACT (Terms Agreed)
  'NEGOTIATING→UNDER_CONTRACT': {
    name: 'Terms Agreed — Contract Out',
    actions: [
      { type: 'set_field', field: 'contract_date', value: 'now' },
      { type: 'set_field', field: 'psa_signed_date', value: 'now' },
      { type: 'set_field', field: 'coe_date', value: 'now+30d' },
      { type: 'set_field', field: 'inspection_end_date', value: 'now+14d' },
      { type: 'set_field', field: 'inspection_period_days', value: 14 },
      { type: 'set_field', field: 'emd_amount', value: 100 },
      { type: 'set_reminder', reminder_type: 'inspection', offset_days: 7, notes: 'Send INSPECTION_SCHEDULED SMS' },
      { type: 'set_reminder', reminder_type: 'coe', offset_days: 23, notes: 'Send CLOSING_CONFIRMED SMS (7 days before COE)' },
      { type: 'notify', role: 'closer', message: 'Contract out on {address}. PSA signed.' },
      { type: 'log', message: 'Under contract. PSA signed. Inspection + COE reminders set.' },
    ],
  },

  // Stage 7: UNDER_CONTRACT → CLOSED (Closing Date)
  'UNDER_CONTRACT→CLOSED': {
    name: 'Closed — Post-Close Follow-up',
    actions: [
      { type: 'set_field', field: 'closed_date', value: 'now' },
      { type: 'set_reminder', reminder_type: 'testimonial', offset_days: 7, notes: 'Request testimonial from seller' },
      { type: 'set_reminder', reminder_type: 'referral', offset_days: 14, notes: 'Request referral — "Any other properties?"' },
      { type: 'log', message: 'Deal closed. Post-close reminders set.' },
    ],
  },

  // Any stage → DEAD
  '*→DEAD': {
    name: 'Deal Died — DOM-181 Circle Back',
    actions: [
      { type: 'set_reminder', reminder_type: 'dom_181', offset_days: null, notes: 'Circle back when DOM-181 arrives. Check listing for current DOM.' },
      { type: 'log', message: 'Deal marked dead. DOM-181 circle-back reminder set.' },
    ],
  },

  // Any stage → ARCHIVED
  '*→ARCHIVED': {
    name: 'Archived — Lessons Captured',
    actions: [
      { type: 'log', message: 'Deal archived. Lessons should be documented in notes.' },
    ],
  },
};

/**
 * Execute automations for a stage transition.
 * Called by the PATCH /api/leads/:id endpoint when stage changes.
 * 
 * @param {string} leadId 
 * @param {string} userId 
 * @param {string} fromStage 
 * @param {string} toStage 
 * @param {Object} leadData - current lead data for merge fields
 * @returns {Object} results of automation execution
 */
async function executeStageAutomations(leadId, userId, fromStage, toStage, leadData) {
  const key = `${fromStage}→${toStage}`;
  const wildcardKey = `*→${toStage}`;
  const config = STAGE_AUTOMATIONS[key] || STAGE_AUTOMATIONS[wildcardKey];

  if (!config) {
    return { automated: false, message: `No automations defined for ${fromStage} → ${toStage}` };
  }

  const results = [];
  const now = new Date();

  for (const action of config.actions) {
    try {
      switch (action.type) {
        case 'set_field': {
          let value = action.value;
          if (value === 'now') {
            value = now.toISOString();
          } else if (value === 'now+48h') {
            const d = new Date(now);
            d.setHours(d.getHours() + 48);
            value = d.toISOString();
          } else if (value === 'now+30d') {
            const d = new Date(now);
            d.setDate(d.getDate() + 30);
            value = d.toISOString().split('T')[0];
          } else if (value === 'now+14d') {
            const d = new Date(now);
            d.setDate(d.getDate() + 14);
            value = d.toISOString().split('T')[0];
          }
          
          await getSql()`UPDATE leads SET ${sql(action.field)} = ${value} WHERE id = ${leadId}`;
          results.push({ type: 'set_field', field: action.field, value, ok: true });
          break;
        }

        case 'set_reminder': {
          let dueDate = new Date(now);
          if (action.offset_hours) {
            dueDate.setHours(dueDate.getHours() + action.offset_hours);
          } else if (action.offset_days) {
            dueDate.setDate(dueDate.getDate() + action.offset_days);
          }
          
          await getSql()`
            INSERT INTO reminders (id, lead_id, user_id, type, due_date, notes)
            VALUES (gen_random_uuid(), ${leadId}, ${userId}, ${action.reminder_type}, ${dueDate.toISOString()}, ${action.notes || null})
          `;
          results.push({ type: 'set_reminder', reminder_type: action.reminder_type, due_date: dueDate.toISOString(), ok: true });
          break;
        }

        case 'run_underwriting': {
          // Calculate 1% rule
          const price = leadData.price || 0;
          const rent = leadData.monthly_rent || 0;
          const sqft = leadData.sqft || 0;
          const arv = leadData.arv || 0;
          
          const onePercentValue = price > 0 ? rent / price : 0;
          const onePercentRule = onePercentValue >= 0.01;
          
          // Calculate repairs based on condition
          let repairTierRate = 30; // default light
          if (leadData.condition === 'reno') repairTierRate = 60;
          else if (leadData.condition === 'livable') repairTierRate = 45;
          
          const repairsEstimate = sqft * repairTierRate;
          const wholesaleFee = leadData.wholesale_fee || 20000;
          
          // Cash offer
          const investorBuy = arv > 0 ? arv * 0.70 : 0;
          const cashOffer = investorBuy - repairsEstimate - wholesaleFee;
          
          // F50
          const f50Offer = cashOffer > 0 ? Math.round(cashOffer * 1.27) : 0;
          const f50Down = Math.round(f50Offer * 0.5);
          const f50Carryback = f50Offer - f50Down;
          
          // F10
          const f10Offer = f50Offer;
          const f10Down = Math.round(f10Offer * 0.1);
          const f10Carryback = f10Offer - f10Down;
          
          // SubTo
          const existingLoan = leadData.existing_loan_balance || 0;
          const subtoOffer = arv > 0 ? arv - repairsEstimate - existingLoan : 0;
          
          // Mid-term
          const midtermMonthly = arv > 0 ? Math.round(arv * 0.012) : 0;
          
          // Recommend strategy
          let recommended = 'cash';
          if (existingLoan > 0 && leadData.existing_loan_rate > 0 && leadData.existing_loan_rate < 0.05) {
            recommended = 'subto';
          } else if (leadData.condition === 'turnkey') {
            recommended = 'f50';
          } else if (leadData.condition === 'reno') {
            recommended = 'f10';
          }
          
          await getSql()`
            UPDATE leads SET
              one_percent_rule = ${onePercentRule},
              one_percent_value = ${onePercentValue},
              repair_tier_rate = ${repairTierRate},
              repairs_estimate = ${repairsEstimate},
              cash_offer = ${cashOffer},
              f50_offer = ${f50Offer},
              f50_down = ${f50Down},
              f50_carryback = ${f50Carryback},
              f10_offer = ${f10Offer},
              f10_down = ${f10Down},
              f10_carryback = ${f10Carryback},
              subto_offer = ${subtoOffer},
              midterm_offer = ${arv},
              midterm_monthly_rent = ${midtermMonthly},
              recommended_strategy = ${recommended}
            WHERE id = ${leadId}
          `;
          
          results.push({ 
            type: 'run_underwriting', 
            ok: true, 
            data: { onePercentRule, onePercentValue, repairsEstimate, cashOffer, f50Offer, f10Offer, subtoOffer, midtermMonthly, recommended }
          });
          break;
        }

        case 'notify': {
          // Log notification (actual notification delivery depends on channel integration)
          await getSql()`
            INSERT INTO activity_log (user_id, lead_id, action, details)
            VALUES (${userId}, ${leadId}, 'notification_sent', ${JSON.stringify({ role: action.role, message: action.message.replace('{address}', leadData.address || 'Unknown') })})
          `;
          results.push({ type: 'notify', role: action.role, ok: true, note: 'Notification logged. Channel delivery pending integration.' });
          break;
        }

        case 'log': {
          await getSql()`
            INSERT INTO activity_log (user_id, lead_id, action, details)
            VALUES (${userId}, ${leadId}, 'automation_log', ${JSON.stringify({ message: action.message })})
          `;
          results.push({ type: 'log', message: action.message, ok: true });
          break;
        }

        default:
          results.push({ type: action.type, ok: false, error: 'Unknown action type' });
      }
    } catch (err) {
      results.push({ type: action.type, ok: false, error: err.message });
    }
  }

  return {
    automated: true,
    workflow: config.name,
    actions_executed: results.length,
    results,
  };
}

/**
 * Get available stage transitions for a lead.
 * Returns which stages are valid next steps.
 */
function getAvailableTransitions(currentStage) {
  const forward = {
    'NEW_LEAD': ['QUALIFIED', 'DEAD'],
    'QUALIFIED': ['LOI_REQUESTED', 'DEAD'],
    'LOI_REQUESTED': ['LOI_APPROVED', 'DEAD'],
    'LOI_APPROVED': ['OFFER_SENT', 'DEAD'],
    'OFFER_SENT': ['NEGOTIATING', 'DEAD'],
    'NEGOTIATING': ['UNDER_CONTRACT', 'DEAD'],
    'UNDER_CONTRACT': ['CLOSED', 'DEAD'],
    'CLOSED': ['ARCHIVED'],
    'DEAD': ['NEW_LEAD'], // resurrect
    'ARCHIVED': ['NEW_LEAD'], // resurrect
  };
  return forward[currentStage] || [];
}

module.exports = {
  STAGE_AUTOMATIONS,
  executeStageAutomations,
  getAvailableTransitions,
};

