/**
 * Stage Automation Engine — Comprehensive Pipeline Automations
 * =============================================================
 * Rebuilt 2026-06-17 to match GHL Montelli pipeline exactly.
 * Each transition returns a RICH PROMPT with:
 *   1. Pre-filled text messages (with actual names, addresses, emails)
 *   2. Who to send it to (agent, seller, closer)
 *   3. What actions to take before/after
 *   4. Follow-up reminders
 *
 * Source: AIREI_MASTER_PLAYBOOK.md + ghl-automations sms-templates.js
 */

const { sql } = require('../db/connection');
const { getTransitionScripts, fillTemplate, OUTREACH_SCRIPTS, SELLER_UPDATE_TEMPLATES } = require('./script-prompts');

// =============================================================
// COMPREHENSIVE STAGE TRANSITION PROMPTS
// =============================================================

const STAGE_TRANSITIONS = {
  // ============================================
  // NEW_LEAD → QUALIFIED ("Contact Made")
  // ============================================
  'NEW_LEAD→QUALIFIED': {
    name: 'Contact Made',
    description: 'First contact with the agent/seller — send INT text, call, send CCC, take notes.',
    prompt: {
      title: 'Step 1: Send INT Text + Make Contact',
      description: 'Before calling, send the INT text so your name shows as caller ID. Call twice. If no answer, send voice memo. After call, send CCC + contact card.',
      steps: [
        {
          step: 1,
          action: 'send_text',
          template: 'INT',
          prefill: true,
          to: 'agent_or_seller',
          instruction: 'Send this BEFORE calling so your name shows as caller ID instead of "Unknown Caller"',
          templateKey: 'INT',
        },
        {
          step: 2,
          action: 'call',
          instruction: 'Call the client TWICE. If no answer both times, send voice memo.',
          script: 'Happy [day] [their name] I had called intending to introduce myself regarding purchasing [property address] as a rental for my portfolio. I\'m going to give my lender a quick call, they only look at servicing the debt based on the rental income with a DSCR loan. To streamline the communication I will loop you in with my business partner Jaxon who will be purchasing with me regarding the finer details of our offer.',
        },
        {
          step: 3,
          action: 'send_text',
          template: 'CCC',
          prefill: true,
          to: 'agent_or_seller',
          instruction: 'Send contact card AFTER every call — before hanging up',
          templateKey: 'CCC',
        },
        {
          step: 4,
          action: 'take_notes',
          instruction: 'Record these details during/after the call',
          fields: [
            'agent_name', 'agent_phone', 'agent_email',
            'seller_name', 'seller_phone', 'seller_email',
            'roof_age', 'hvac_age',
            'occupancy', 'current_rent', 'lease_type', 'lease_term',
            'utilities_status',
            'other_buyer_feedback',
            'condition', 'condition_rating',
          ],
        },
        {
          step: 5,
          action: 'save_contact',
          instruction: 'Save client in phone: contact type (Agent/Seller) + property address in company line',
        },
      ],
      reminders: [
        { type: '48hr_followup', offset_hours: 48, description: 'Follow up in 48 hours if no response' },
      ],
    },
    automations: [
      { type: 'set_reminder', reminder_type: '48hr_followup', offset_hours: 48 },
      { type: 'log', message: 'Contact made. INT + CCC sent. Notes recorded.' },
    ],
  },

  // ============================================
  // QUALIFIED → LOI_REQUESTED ("Evaluate & Request LOI")
  // ============================================
  'QUALIFIED→LOI_REQUESTED': {
    name: 'Evaluate & Request LOI',
    description: 'Evaluate the deal, run underwriting, and email Seth for an approved LOI.',
    prompt: {
      title: 'Step 2: Evaluate Deal + Request LOI',
      description: 'Check population, buy box, condition. Run underwriting. Email Seth for approved LOI.',
      steps: [
        {
          step: 1,
          action: 'evaluate',
          instruction: 'Check: population ≥ 10,000? Buy box passed? Turnkey or renovation?',
          fields: ['population', 'population_ok', 'buy_box_passed', 'condition'],
          detail: 'Google the city + "population". Must be ≥ 10K. If not, discard lead.',
        },
        {
          step: 2,
          action: 'run_underwriting',
          instruction: 'Calculate: ARV × 0.70 − Repairs − Fee = Max Offer',
          detail: 'Find ARV from Redfin/Zillow comps. Repair estimate: $30/sqft turnkey, $45/sqft livable, $60/sqft renovation. Wholesale fee: $20K default.',
        },
        {
          step: 3,
          action: 'send_email',
          to: 'claytoninvestmentsolutions@gmail.com',
          subject_template: 'FB LOI Request',
          subject_alt: 'Renovation – LOI Request [address]',
          instruction: 'Email Seth for approved LOI. Use "FB LOI Request" for turnkey, "Renovation – LOI Request [address]" for reno.',
          body_template: 'Include: market rent estimate, purchase price, rehab estimate, property address.',
        },
        {
          step: 4,
          action: 'check_rental_comps',
          instruction: 'Check Zillow Rent Estimate / Rentometer. Rule: rent must be ~1% of purchase price (e.g., $250K → $2,500/mo min).',
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'run_underwriting' },
      { type: 'log', message: 'LOI requested from Seth.' },
    ],
  },

  // ============================================
  // LOI_REQUESTED → LOI_APPROVED ("LOI Approved")
  // ============================================
  'LOI_REQUESTED→LOI_APPROVED': {
    name: 'LOI Approved — Prepare Offer',
    description: 'Seth approved the LOI. Notify the closer and tell the seller.',
    prompt: {
      title: 'Step 3: LOI Approved — Prepare Offer',
      description: 'Seth has approved the LOI. Notify Kayla/Jaxon to prepare the offer. Send confirmation to seller.',
      steps: [
        {
          step: 1,
          action: 'notify',
          role: 'closer',
          instruction: 'Notify Kayla/Jaxon: LOI approved, prepare offer. Send LOI link + lead details.',
          contacts: ['homewithkaylamauser@gmail.com', 'JaxonDeasonHomes1@gmail.com'],
        },
        {
          step: 2,
          action: 'send_text',
          template: 'LOI_RECIEVED_YES',
          prefill: true,
          to: 'seller',
          instruction: 'Send to seller confirming LOI received and offer is coming',
          templateKey: 'LOI_RECIEVED_YES',
        },
        {
          step: 3,
          action: 'import_loi',
          instruction: 'Import LOI link into CRM under "LOI / Offer Link" field for future reference.',
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'notify', role: 'closer', message: 'LOI approved — prepare offer' },
      { type: 'log', message: 'LOI approved. Closer notified.' },
    ],
  },

  // ============================================
  // LOI_APPROVED → OFFER_SENT ("Send Offer")
  // ============================================
  'LOI_APPROVED→OFFER_SENT': {
    name: 'Send Offer + Group Chat',
    description: 'Create group chat with Kayla/Jaxon + client. Send offer link.',
    prompt: {
      title: 'Step 4: Send Offer + Group Chat',
      description: 'Create group chat with Kayla/Jaxon + client. Send the GCJ text. Send offer link.',
      steps: [
        {
          step: 1,
          action: 'send_text',
          template: 'GCJ',
          prefill: true,
          to: 'seller',
          instruction: 'Create group chat with Kayla/Jaxon + client. Send this text to introduce the group.',
          templateKey: 'GCJ',
        },
        {
          step: 2,
          action: 'send_offer',
          instruction: 'Send offer link to client via group chat. Copy LOI/offer link into CRM.',
        },
        {
          step: 3,
          action: 'set_reminder',
          type: '48hr_followup',
          instruction: 'Set 48-hour follow-up reminder. If no response by then, run realignment script.',
        },
        {
          step: 4,
          action: 'end_of_day',
          instruction: 'Create Google Sheet with lead status + all data. Email to Kayla + Jaxon. Confirm all clients are in group chats.',
        },
      ],
      reminders: [
        { type: '48hr_followup', offset_hours: 48, description: 'Follow up in 48 hours if no response' },
      ],
    },
    automations: [
      { type: 'set_field', field: 'offer_sent_date', value: 'now' },
      { type: 'set_field', field: 'follow_up_48hr_due', value: 'now+48h' },
      { type: 'set_reminder', reminder_type: '48hr_followup', offset_hours: 48 },
      { type: 'log', message: 'Offer sent. Group chat created.' },
    ],
  },

  // ============================================
  // OFFER_SENT → NEGOTIATING ("48hr Follow-up")
  // ============================================
  'OFFER_SENT→NEGOTIATING': {
    name: '48hr Follow-up — Realign',
    description: '48 hours have passed. Call client, handle objections, realign.',
    prompt: {
      title: 'Step 5: 48hr Follow-up — Realign',
      description: 'Call the client. If no answer twice, send voice memo. Handle objections. Use realignment language.',
      steps: [
        {
          step: 1,
          action: 'call',
          instruction: 'Call client. If no answer twice, send voice memo.',
          script: 'Happy [Day] [Client Name] I am just now finding some time to realign with you, we spoke [Day you spoke] regarding the property at [property address]. We had sent an offer over to you. Is there any clarification I can align further regarding the details of our offer?',
        },
        {
          step: 2,
          action: 'send_text',
          template: 'NOA',
          prefill: true,
          to: 'seller',
          instruction: 'Send if no answer after calls',
          templateKey: 'NOA',
        },
        {
          step: 3,
          action: 'handle_objections',
          instruction: 'If they have questions: "Noted - I\'ll relay to my business partner and will get back with you." If they want cash: explain DSCR. If they ask about viewing: "Our assistant drove past..."',
          objectionScripts: {
            wants_cash: 'That\'s exactly why I\'m calling — with the property still being listed for sale — your seller hasn\'t received sufficient offers from buyers who intend to live in the property; our lender has confirmed this will not be able to be a rental for anyone due to institutional interest rates — feel free to revisit this offer right before the listing agreement expires.',
            ask_viewing: 'Our assistant drove past the property a few days back and referred it to us. The photos online look great. I\'m sure they don\'t even do the property justice! We will set up a home inspection like any real estate transaction – within 24 hours.',
            general_questions: 'Noted - what I\'ll do is relay this over to my business partner and will get back with you. I look forward to aligning the finer details with you.',
          },
        },
        {
          step: 4,
          action: 'send_text',
          template: 'EVERYBODY_WINS_PITCH',
          prefill: true,
          to: 'seller',
          instruction: 'If seller is hesitating, send the "Everybody Wins" pitch',
          templateKey: 'EVERYBODY_WINS_PITCH',
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'set_field', field: 'follow_up_48hr_done', value: true },
      { type: 'log', message: '48hr follow-up completed. Negotiating.' },
    ],
  },

  // ============================================
  // NEGOTIATING → UNDER_CONTRACT ("Contract Out")
  // ============================================
  'NEGOTIATING→UNDER_CONTRACT': {
    name: 'Contract Out — PSA Signing',
    description: 'PSA is ready. Send pre-call text, sign via RabbitSign, set key dates.',
    prompt: {
      title: 'Step 6: Contract Out — PSA Signing',
      description: 'Send pre-call text. Walk through PSA signing via RabbitSign. Set inspection and COE dates.',
      steps: [
        {
          step: 1,
          action: 'send_text',
          template: 'PSA_CALL_OPENER_SMS',
          prefill: true,
          to: 'seller',
          instruction: 'Pre-call text for PSA signing — sets expectations for 10-15 min call',
          templateKey: 'PSA_CALL_OPENER_SMS',
        },
        {
          step: 2,
          action: 'call_and_sign',
          instruction: 'Call seller. Walk through PSA. Use RabbitSign for e-signature. Need: property address, LLC name (if applicable), email.',
        },
        {
          step: 3,
          action: 'send_text',
          template: 'CONTRACT_OUT',
          prefill: true,
          to: 'seller',
          instruction: 'Send after PSA is fully signed — confirms timeline',
          templateKey: 'CONTRACT_OUT',
        },
        {
          step: 4,
          action: 'set_dates',
          instruction: 'Record key dates in CRM',
          fields: ['psa_signed_date', 'coe_date', 'inspection_end_date', 'inspection_period_days'],
          defaults: {
            psa_signed_date: 'today',
            inspection_period_days: 14,
            inspection_end_date: 'today + 14 days',
            coe_date: 'today + 30 days',
          },
        },
        {
          step: 5,
          action: 'notify_tc',
          instruction: 'Notify transaction coordinator (BGonzalez) about lockbox/utility access for inspection.',
        },
      ],
      reminders: [
        { type: 'inspection', offset_days: 7, description: 'Inspection reminder — 7 days before end' },
        { type: 'coe', offset_days: 23, description: 'COE reminder — 7 days before closing' },
      ],
    },
    automations: [
      { type: 'set_field', field: 'contract_date', value: 'now' },
      { type: 'set_field', field: 'psa_signed_date', value: 'now' },
      { type: 'set_field', field: 'coe_date', value: 'now+30d' },
      { type: 'set_field', field: 'inspection_end_date', value: 'now+14d' },
      { type: 'set_reminder', reminder_type: 'inspection', offset_days: 7 },
      { type: 'set_reminder', reminder_type: 'coe', offset_days: 23 },
      { type: 'notify', role: 'closer', message: 'Contract out — PSA signed' },
      { type: 'log', message: 'Under contract. PSA signed.' },
    ],
  },

  // ============================================
  // UNDER_CONTRACT → CLOSED ("Closed")
  // ============================================
  'UNDER_CONTRACT→CLOSED': {
    name: 'Closed — Final Steps',
    description: 'Deal closed. Send closing confirmation, ask for referrals.',
    prompt: {
      title: 'Step 7: Closing — Final Steps',
      description: 'Deal is closed! Send closing confirmation, JV agreement if applicable, and always ask for referrals.',
      steps: [
        {
          step: 1,
          action: 'send_text',
          template: 'CLOSING_CONFIRMED',
          prefill: true,
          to: 'seller',
          instruction: 'Send 7 days before COE — confirms closing details and post-close support',
          templateKey: 'CLOSING_CONFIRMED',
        },
        {
          step: 2,
          action: 'send_text',
          template: 'JV_SIGNED',
          prefill: true,
          to: 'jv_party',
          instruction: 'Send if JV deal — confirms ownership share and terms',
          templateKey: 'JV_SIGNED',
          condition: 'is_jv_deal',
        },
        {
          step: 3,
          action: 'send_text',
          template: 'SUBTO_PROCESSOR_CONFIRMED',
          prefill: true,
          to: 'seller',
          instruction: 'Send within 48hrs of COE for SubTo deals — confirms 3rd-party processor',
          templateKey: 'SUBTO_PROCESSOR_CONFIRMED',
          condition: 'is_subto',
        },
        {
          step: 4,
          action: 'ask_referral',
          instruction: 'Always ask: "Do you have any other properties you\'re looking to offload?" — double/triple/quadruple dip.',
        },
        {
          step: 5,
          action: 'archive',
          instruction: 'Archive lead in CRM. All documents saved.',
        },
      ],
      reminders: [
        { type: 'testimonial', offset_days: 7, description: 'Request testimonial 7 days after close' },
        { type: 'referral', offset_days: 14, description: 'Follow up for referrals 14 days after close' },
      ],
    },
    automations: [
      { type: 'set_field', field: 'closed_date', value: 'now' },
      { type: 'set_reminder', reminder_type: 'testimonial', offset_days: 7 },
      { type: 'set_reminder', reminder_type: 'referral', offset_days: 14 },
      { type: 'log', message: 'Closed. Testimonial + referral reminders set.' },
    ],
  },

  // ============================================
  // * → DEAD ("Marked Dead")
  // ============================================
  '*→DEAD': {
    name: 'Deal Dead — Circle Back Later',
    description: 'Deal is dead. Send seller declined text. Set calendar reminder for listing expiry.',
    prompt: {
      title: 'Deal Dead — Circle Back Later',
      description: 'Send the seller declined text. Note DOM, subtract 181 days, set calendar reminder to call when listing expires.',
      steps: [
        {
          step: 1,
          action: 'send_text',
          template: 'SD',
          prefill: true,
          to: 'seller',
          instruction: 'Send seller declined text — keeps door open for future',
          templateKey: 'SD',
        },
        {
          step: 2,
          action: 'calendar',
          instruction: 'Note Days on Market (DOM). Subtract 181 days. Set calendar reminder to call when listing expires.',
          detail: 'DOM - 181 = date to circle back. Import into calendar. Call when listing agreement expires.',
        },
        {
          step: 3,
          action: 'record_reason',
          instruction: 'Record why the deal died in CRM notes for future reference.',
          fields: ['dead_reason'],
        },
      ],
      reminders: [
        { type: 'dom_181', description: 'Circle back when listing expires (DOM - 181 days)' },
      ],
    },
    automations: [
      { type: 'set_reminder', reminder_type: 'dom_181' },
      { type: 'log', message: 'Deal marked dead. DOM-181 reminder set.' },
    ],
  },

  // ============================================
  // * → ARCHIVED
  // ============================================
  '*→ARCHIVED': {
    name: 'Archived',
    description: 'Lead archived.',
    prompt: {
      title: 'Lead Archived',
      description: 'This lead has been archived.',
      steps: [
        {
          step: 1,
          action: 'log',
          instruction: 'Lead archived. All data preserved.',
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'log', message: 'Archived.' },
    ],
  },
};

// =============================================================
// EXECUTION ENGINE
// =============================================================

async function executeStageAutomations(leadId, userId, fromStage, toStage, leadData) {
  const key = `${fromStage}→${toStage}`;
  const config = STAGE_TRANSITIONS[key] || STAGE_TRANSITIONS[`*→${toStage}`];
  const results = [];
  const now = new Date();

  if (config && config.automations) {
    for (const action of config.automations) {
      try {
        switch (action.type) {
          case 'set_field': {
            let value = action.value;
            if (value === 'now') value = now.toISOString();
            else if (value === 'now+48h') { const d = new Date(now); d.setHours(d.getHours() + 48); value = d.toISOString(); }
            else if (value === 'now+30d') { const d = new Date(now); d.setDate(d.getDate() + 30); value = d.toISOString().split('T')[0]; }
            else if (value === 'now+14d') { const d = new Date(now); d.setDate(d.getDate() + 14); value = d.toISOString().split('T')[0]; }
            await sql`UPDATE leads SET ${sql.unsafe(action.field)} = ${value} WHERE id = ${leadId}`;
            results.push({ type: 'set_field', field: action.field, value, ok: true });
            break;
          }
          case 'set_reminder': {
            let dueDate = new Date(now);
            if (action.offset_hours) dueDate.setHours(dueDate.getHours() + action.offset_hours);
            else if (action.offset_days) dueDate.setDate(dueDate.getDate() + action.offset_days);
            await sql`INSERT INTO reminders (id, lead_id, user_id, type, due_date, notes) VALUES (gen_random_uuid(), ${leadId}, ${userId}, ${action.reminder_type}, ${dueDate.toISOString()}, ${action.notes || null})`;
            results.push({ type: 'set_reminder', reminder_type: action.reminder_type, ok: true });
            break;
          }
          case 'run_underwriting': {
            const { price, monthly_rent: rent, sqft, arv, condition, existing_loan_balance, existing_loan_rate } = leadData;
            const onePercentValue = price > 0 ? rent / price : 0;
            const onePercentRule = onePercentValue >= 0.01;
            let rate = 30; if (condition === 'reno') rate = 60; else if (condition === 'livable') rate = 45;
            const repairs = (sqft || 0) * rate;
            const fee = leadData.wholesale_fee || 20000;
            const inv = (arv || 0) * 0.70;
            const cash = inv - repairs - fee;
            const f50 = cash > 0 ? Math.round(cash * 1.27) : 0;
            const subto = arv > 0 ? arv - repairs - (existing_loan_balance || 0) : 0;
            let rec = 'cash';
            if ((existing_loan_balance || 0) > 0 && existing_loan_rate > 0 && existing_loan_rate < 0.05) rec = 'subto';
            else if (condition === 'turnkey') rec = 'f50';
            else if (condition === 'reno') rec = 'f10';
            await sql`UPDATE leads SET one_percent_rule=${onePercentRule}, one_percent_value=${onePercentValue}, repair_tier_rate=${rate}, repairs_estimate=${repairs}, cash_offer=${cash}, f50_offer=${f50}, f50_down=${Math.round(f50 * 0.5)}, f50_carryback=${Math.round(f50 * 0.5)}, f10_offer=${f50}, f10_down=${Math.round(f50 * 0.1)}, f10_carryback=${Math.round(f50 * 0.9)}, subto_offer=${subto}, recommended_strategy=${rec} WHERE id=${leadId}`;
            results.push({ type: 'run_underwriting', ok: true, data: { onePercentRule, cash, f50, subto, rec } });
            break;
          }
          case 'notify': {
            await sql`INSERT INTO activity_log (user_id, lead_id, action, details) VALUES (${userId}, ${leadId}, 'notification_sent', ${JSON.stringify({ role: action.role, msg: action.message })})`;
            results.push({ type: 'notify', role: action.role, ok: true });
            break;
          }
          case 'log': {
            await sql`INSERT INTO activity_log (user_id, lead_id, action, details) VALUES (${userId}, ${leadId}, 'automation_log', ${JSON.stringify({ message: action.message })})`;
            results.push({ type: 'log', message: action.message, ok: true });
            break;
          }
          default: results.push({ type: action.type, ok: false, error: 'Unknown action type' });
        }
      } catch (err) {
        results.push({ type: action.type, ok: false, error: err.message });
      }
    }
  }

  // Build the rich prompt with pre-filled templates
  let prompt = null;
  if (config && config.prompt) {
    prompt = buildRichPrompt(config.prompt, leadData);
  }

  // Also get legacy scripts for backward compatibility
  let scripts = [];
  try {
    scripts = getTransitionScripts(fromStage, toStage, leadData);
  } catch (err) {
    scripts = [{ error: err.message }];
  }

  return {
    automated: !!config,
    workflow: config?.name || `${fromStage}→${toStage}`,
    description: config?.description || '',
    actions_executed: results.length,
    results,
    prompt,
    scripts,
  };
}

/**
 * Build a rich prompt object with pre-filled templates.
 * Fills in actual lead data (names, addresses, prices) into each template.
 */
function buildRichPrompt(promptDef, leadData) {
  const filledSteps = promptDef.steps.map(step => {
    const filled = { ...step };

    // Fill template if specified
    if (step.templateKey) {
      const allDefs = { ...OUTREACH_SCRIPTS, ...SELLER_UPDATE_TEMPLATES };
      const def = allDefs[step.templateKey];
      if (def) {
        const filledTemplate = fillTemplate(step.templateKey, def, leadData);
        filled.filledMessage = filledTemplate.filled;
        filled.unfilled = filledTemplate.unfilled;
        filled.recipientName = filledTemplate.recipient;
        filled.recipientType = filledTemplate.recipientType;
        filled.actionRequired = filledTemplate.actionRequired;
      }
    }

    // Fill script placeholders
    if (step.script && leadData) {
      let script = step.script;
      script = script.replace(/\[day\]/gi, getDayName());
      script = script.replace(/\[their name\]|\[Client Name\]|\[client name\]/gi,
        leadData.seller_name || leadData.agent_name || '[Name]');
      script = script.replace(/\[property address\]|\[address\]/gi,
        leadData.address || '[Address]');
      script = script.replace(/\[Day you spoke\]/gi, '[Day you spoke]');
      filled.filledScript = script;
    }

    // Fill objection scripts
    if (step.objectionScripts && leadData) {
      const filledObj = {};
      for (const [key, script] of Object.entries(step.objectionScripts)) {
        let s = script;
        s = s.replace(/\[agent name\]/gi, leadData.agent_name || '[Agent Name]');
        s = s.replace(/\[address\]/gi, leadData.address || '[Address]');
        filledObj[key] = s;
      }
      filled.filledObjectionScripts = filledObj;
    }

    return filled;
  });

  // Fill reminders with actual dates
  const filledReminders = (promptDef.reminders || []).map(r => {
    const due = new Date();
    if (r.offset_hours) due.setHours(due.getHours() + r.offset_hours);
    if (r.offset_days) due.setDate(due.getDate() + r.offset_days);
    return { ...r, due_date: due.toISOString(), due_date_formatted: due.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) };
  });

  return {
    title: promptDef.title,
    description: promptDef.description,
    steps: filledSteps,
    reminders: filledReminders,
    leadName: leadData?.seller_name || leadData?.agent_name || leadData?.address || 'Unknown',
    leadAddress: leadData?.address || 'Unknown',
  };
}

function getDayName() {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];
}

// =============================================================
// TRANSITION MAP
// =============================================================

function getAvailableTransitions(currentStage) {
  const fwd = {
    NEW_LEAD: ['QUALIFIED', 'DEAD'],
    QUALIFIED: ['LOI_REQUESTED', 'DEAD'],
    LOI_REQUESTED: ['LOI_APPROVED', 'DEAD'],
    LOI_APPROVED: ['OFFER_SENT', 'DEAD'],
    OFFER_SENT: ['NEGOTIATING', 'DEAD'],
    NEGOTIATING: ['UNDER_CONTRACT', 'DEAD'],
    UNDER_CONTRACT: ['CLOSED', 'DEAD'],
    CLOSED: ['ARCHIVED'],
    DEAD: ['NEW_LEAD'],
    ARCHIVED: ['NEW_LEAD'],
  };
  return fwd[currentStage] || [];
}

/**
 * Get the prompt for a specific stage (for "View Prompts" button).
 */
function getStagePrompt(stage, leadData) {
  // Find the transition that ends at this stage
  const transitionMap = {
    'QUALIFIED': 'NEW_LEAD→QUALIFIED',
    'LOI_REQUESTED': 'QUALIFIED→LOI_REQUESTED',
    'LOI_APPROVED': 'LOI_REQUESTED→LOI_APPROVED',
    'OFFER_SENT': 'LOI_APPROVED→OFFER_SENT',
    'NEGOTIATING': 'OFFER_SENT→NEGOTIATING',
    'UNDER_CONTRACT': 'NEGOTIATING→UNDER_CONTRACT',
    'CLOSED': 'UNDER_CONTRACT→CLOSED',
    'DEAD': '*→DEAD',
  };

  const key = transitionMap[stage];
  if (!key || !STAGE_TRANSITIONS[key] || !STAGE_TRANSITIONS[key].prompt) return null;

  return buildRichPrompt(STAGE_TRANSITIONS[key].prompt, leadData);
}

module.exports = {
  STAGE_TRANSITIONS,
  executeStageAutomations,
  getAvailableTransitions,
  getStagePrompt,
  buildRichPrompt,
};
