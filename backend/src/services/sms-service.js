/**
 * SMS Service — Divinity CRM
 * =============================================================
 * Sends automated SMS for stage transitions.
 * Uses GHL Conversations API (already authenticated via LOCATION_ID + TOKEN).
 *
 * Templates mapped from sms-templates.js and script-prompts.js.
 * Each stage transition has specific SMS triggers.
 */

const https = require('https');

const TOKEN = process.env.GHL_API_TOKEN || 'pit-b8e79120-be2e-46c9-9615-336385d15315';
const LOCATION_ID = process.env.GHL_LOCATION_ID || '61XPzSqRy7UKMwW9DeB8';
const BASE = 'services.leadconnectorhq.com';

function isConfigured() {
  return !!(TOKEN && LOCATION_ID);
}

/**
 * Send SMS via GHL Conversations API.
 * @param {string} contactId - GHL contact ID
 * @param {string} message - SMS body
 * @returns {Object} { sent, messageId?, error? }
 */
async function sendSMS(contactId, message) {
  if (!isConfigured()) {
    console.warn('[sms-service] GHL not configured — skipping SMS');
    return { sent: false, reason: 'GHL not configured' };
  }

  return new Promise((resolve) => {
    const body = JSON.stringify({
      type: 'SMS',
      contactId,
      message,
    });

    const req = https.request({
      hostname: BASE,
      path: `/conversations/v1/conversations/message`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Version': '2021-04-15',
        'locationId': LOCATION_ID,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          console.log(`[sms-service] Sent SMS → contactId=${contactId} (${parsed.id || 'ok'})`);
          resolve({ sent: true, messageId: parsed.id });
        } catch (e) {
          console.error(`[sms-service] Parse error: ${e.message}`);
          resolve({ sent: false, error: e.message });
        }
      });
    });

    req.on('error', (err) => {
      console.error(`[sms-service] Request error: ${err.message}`);
      resolve({ sent: false, error: err.message });
    });

    req.write(body);
    req.end();
  });
}

// =============================================================
// STAGE-SPECIFIC SMS TEMPLATES (pre-filled from lead data)
// =============================================================

function getDayName() {
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
}

/**
 * Fill template placeholders with lead data.
 */
function fillSMSTemplate(template, lead) {
  let msg = template;
  const day = getDayName();
  const name = lead.seller_name || lead.agent_name || 'there';
  const addr = lead.address || 'the property';

  msg = msg.replace(/\[day\]/gi, day);
  msg = msg.replace(/\[their name\]|\[client name\]|\[seller_name\]/gi, name);
  msg = msg.replace(/\[property address\]|\[address\]/gi, addr);
  msg = msg.replace(/\[your name\]/gi, 'Montelli');
  msg = msg.replace(/\[business partner\]/gi, 'Jaxon');
  msg = msg.replace(/\[email\]/gi, 'montelliscottrei@gmail.com');

  return msg;
}

// =============================================================
// SMS TEMPLATE LIBRARY
// =============================================================

const SMS_TEMPLATES = {
  // Stage 1→2: INT — Intro text before calling
  INT: `Happy [day] [their name] I had called intending to introduce myself regarding purchasing [property address] as a rental for my portfolio. I'm going to give my lender a quick call, they only look at servicing the debt based on the rental income with a DSCR loan. To streamline the communication I will loop you in with my business partner Jaxon who will be purchasing with me regarding the finer details of our offer.`,

  // Stage 1→2: CCC — Contact card after call
  CCC: `It is great aligning with you [seller_name], I look forward to connecting the dots with you shortly at [address]. Here is my contact card.`,

  // Stage 1→2: NOA — No answer follow-up
  NOA: `Happy [day] [their name] I had called intending to introduce myself regarding purchasing [property address] as a rental for my portfolio. I'm going to give my lender a quick call, they only look at servicing the debt based on the rental income with a DSCR loan. To streamline the communication I will loop you in with my business partner Jaxon who will be purchasing with me regarding the finer details of our offer.`,

  // Stage 2→3: F50 — 50% down seller finance pitch
  F50: `Happy [day] [their name] I had called intending to introduce myself regarding purchasing [property address] as a rental for my portfolio. Would you be opposed to taking half your price now and the rest in one lump sum in the near future?`,

  // Stage 2→3: F10 — 10% down 24-month balloon pitch
  F10: `Happy [day] [their name] I had called intending to introduce myself regarding purchasing [property address] as a rental for my portfolio. Would you be opposed to taking 10% of your price now and the rest in one lump sum in just 24 months?`,

  // Stage 3→4: GCJ — Group chat with Jaxon
  GCJ: `Happy [day] [their name] I'm going to loop you into a group chat with my business partner Jaxon who will be purchasing with me regarding the finer details of our offer.`,

  // Stage 5→6: LOI — LOI follow-up
  LOI: `Happy [day] [their name] I am just now finding some time to realign with you, we spoke [Day you spoke] regarding the property at [address]. We had sent an offer over to you. Is there any clarification I can align further regarding the details of our offer?`,

  // Stage 6→7: LOI2DAYS — 48hr LOI follow-up
  LOI2DAYS: `Happy [day] [their name] checking in regarding the offer we sent over for [address]. We're still very interested — is there anything we can clarify?`,

  // Stage 6→7 / 7→8: SD — Seller declined / keeps door open
  SD: `Happy [day] [their name] I completely understand. If anything changes or you have other properties you're looking to offload, please keep us in mind. We're always looking to add to our portfolio.`,

  // Stage 11→12: PSA_CALL_OPENER — Pre-call text for PSA signing
  PSA_CALL_OPENER: `Happy [day] [their name] I'm going to give you a quick call to walk through the purchase agreement — should take about 10-15 minutes. Talk soon!`,

  // Stage 11→12: CONTRACT_OUT — After PSA signed
  CONTRACT_OUT: `Great news [their name]! The purchase agreement for [address] is fully signed. Here's the timeline: Inspection ends [date], Closing on [date]. I'll keep you updated every step of the way.`,

  // Stage 12→13: INSPECTION_SCHEDULED — Day 7 of inspection
  INSPECTION_SCHEDULED: `Hi [their name], just a quick update — the inspection for [address] is scheduled. We'll need utilities on and access arranged. I'll send the exact date/time once confirmed.`,

  // Stage 16→17: APPRAISAL_DONE — Appraisal complete
  APPRAISAL_DONE: `Hi [their name], the appraisal for [address] is complete. Everything is on track for closing. I'll keep you posted on next steps.`,

  // Stage 18→19: JV_SIGNED — JV fully executed
  JV_SIGNED: `Great news [their name]! The joint venture agreement for [address] is fully signed by all parties. Moving forward to closing.`,

  // Stage 20→21: CLOSING_CONFIRMED — 7 days before COE
  CLOSING_CONFIRMED: `Hi [their name], we're one week away from closing on [address]! Everything is on track. I'll send final wire instructions shortly. Thank you for trusting us with this transaction.`,

  // Stage 20→21: SUBTO_PROCESSOR — 48hr before COE for SubTo
  SUBTO_PROCESSOR: `Hi [their name], just confirming the third-party processing company is set up for the Subject-To closing on [address]. Everything is on track for [date].`,

  // Stage 5→6: EVERYBODY_WINS — Seller hesitating
  EVERYBODY_WINS: `Hi [their name], I wanted to share how we structure these deals so everybody wins. We're not flippers — we hold properties as long-term rentals. The structure we proposed lets you get your price while we make the numbers work as a rental. Happy to walk through it on a quick call.`,

  // Stage 7→8: PEND — Still interested check
  PEND: `Happy [day] [their name], just checking in — still interested in [address] if it hasn't sold yet. Our offer stands.`,

  // Post-close: TESTIMONIAL — +7 days
  TESTIMONIAL: `Hi [their name], hope you're doing well! We'd love a quick testimonial about your experience selling [address] to us. It helps other sellers feel confident working with us. Here's the link: [review link]`,

  // Post-close: REFERRAL — +14 days
  REFERRAL: `Hi [their name], quick follow-up — we pay a $500 referral bonus for any property owner you send our way that we end up closing on. If you know anyone looking to sell, we'd love the introduction!`,
};

// =============================================================
// STAGE-TRIGGERED SMS SENDERS
// =============================================================

/**
 * Send the appropriate SMS for a stage transition.
 * Called by stage-automations.js.
 * @param {string} fromStage
 * @param {string} toStage
 * @param {Object} lead - full lead record
 * @param {string} contactId - GHL contact ID (optional, falls back to lead.ghl_contact_id)
 * @returns {Object} { sent, template?, messageId?, error? }
 */
async function sendStageSMS(fromStage, toStage, lead, contactId) {
  const cid = contactId || lead.ghl_contact_id;
  if (!cid) return { sent: false, reason: 'No GHL contact ID' };

  const key = `${fromStage}→${toStage}`;
  const templateMap = {
    'LEAD_ENTERED→CONTACT_MADE':       ['INT', 'CCC'],
    'CONTACT_MADE→OFFER_READY':        [], // F50/F10 sent manually based on condition
    'OFFER_READY→OFFER_SENT':          ['GCJ'],
    'OFFER_RECEIVED→GAIN_FEEDBACK':    ['LOI'],
    'GAIN_FEEDBACK→NO_ANSWER':         ['LOI2DAYS', 'SD'],
    'NO_ANSWER→SELLER_DECLINED':       ['SD'],
    'AWAITING_TITLE→CONTRACT_OUT':     ['PSA_CALL_OPENER', 'CONTRACT_OUT'],
    'CONTRACT_OUT→UNDER_CONTRACT':     ['INSPECTION_SCHEDULED'],
    'APPRAISAL_ORDERED→APPRAISAL_DONE':['APPRAISAL_DONE'],
    'JV_SENT→JV_SIGNED':               ['JV_SIGNED'],
    'WIRE_SETUP→CLOSING_DATE':         ['CLOSING_CONFIRMED'],
  };

  const templates = templateMap[key];
  if (!templates || templates.length === 0) {
    return { sent: false, reason: `No SMS templates for ${key}` };
  }

  const results = [];
  for (const tplKey of templates) {
    const template = SMS_TEMPLATES[tplKey];
    if (!template) { results.push({ template: tplKey, sent: false, error: 'Template not found' }); continue; }

    const message = fillSMSTemplate(template, lead);
    const result = await sendSMS(cid, message);
    results.push({ template: tplKey, ...result });
  }

  return { sent: results.some(r => r.sent), templates: results };
}

/**
 * Send a specific SMS template for a lead (manual trigger).
 */
async function sendTemplate(lead, templateKey, contactId) {
  const cid = contactId || lead.ghl_contact_id;
  if (!cid) return { sent: false, reason: 'No GHL contact ID' };

  const template = SMS_TEMPLATES[templateKey];
  if (!template) return { sent: false, reason: `Unknown template: ${templateKey}` };

  const message = fillSMSTemplate(template, lead);
  return sendSMS(cid, message);
}

module.exports = {
  isConfigured,
  sendSMS,
  sendStageSMS,
  sendTemplate,
  fillSMSTemplate,
  SMS_TEMPLATES,
};
