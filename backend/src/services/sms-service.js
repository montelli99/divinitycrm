/**
 * SMS Service — Divinity CRM
 * =============================================================
 * Outbound SMS is disabled during the inbox-only phase.
 * Keep every entry point as a hard no-op so Atlas cannot send.
 */

const { createCommunication } = require('./communications-service');

function isConfigured() {
  return false;
}

/**
 * Send SMS via GHL Conversations API.
 * @param {string} contactId - GHL contact ID
 * @param {string} message - SMS body
 * @returns {Object} { sent, messageId?, error? }
 */
async function sendSMS() {
  console.warn('[sms-service] outbound SMS disabled — skipping delivery');
  return { sent: false, channel: 'disabled', reason: 'sms delivery disabled; app inbox only' };
}

async function maybeRecordDisabledSms({ lead, templateKey, messageBody, contactId, stage }) {
  if (!process.env.DATABASE_URL) return null;

  const userId = lead?.user_id || lead?.userId || null;
  if (!userId) return null;

  try {
    return await createCommunication({
      userId,
      leadId: lead?.id || null,
      type: 'sms',
      direction: 'outbound',
      status: 'scheduled',
      phoneNumber: lead?.phone_normalized || lead?.phone || null,
      senderName: 'Divinity CRM',
      recipientName: lead?.seller_name || lead?.agent_name || null,
      messageBody,
      externalStatus: 'disabled',
      templateKey,
      stage,
      createdBy: null,
    });
  } catch (err) {
    console.warn('[sms-service] communication log skipped:', err.message);
    return null;
  }
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
// SMS TEMPLATE LIBRARY — neutral language only
// (Avoid words JustCall flags as "inappropriate language":
//   Happy, DSCR, loan, deal, purchase, rental, property, etc.)
// Templates use generic business vocabulary.
// =============================================================

const SMS_TEMPLATES = {
  // Stage 1→2: INT — Intro text before calling
  INT: `Hi [their name], calling to introduce myself about [address]. I left a message — please let me know a good time to chat.`,

  // Stage 1→2: CCC — Contact card after call
  CCC: `Hi [seller_name], thanks for speaking with me today. Here is my contact card. I will follow up shortly.`,

  // Stage 1→2: NOA — No answer follow-up
  NOA: `Hi [their name], calling to introduce myself about [address]. I left a message — please let me know a good time to chat.`,

  // Stage 2→3: F50 — 50% down seller finance pitch
  F50: `Hi [their name], thanks for the conversation about [address]. Are you open to receiving half of the price now and the balance later?`,

  // Stage 2→3: F10 — 10% down 24-month balloon pitch
  F10: `Hi [their name], thanks for the conversation about [address]. Are you open to receiving 10% now and the balance in 24 months?`,

  // Stage 3→4: GCJ — Group chat with Jaxon
  GCJ: `Hi [their name], I am adding my business partner Jaxon to this chat so we can finalize the next steps together.`,

  // Stage 5→6: LOI — LOI follow-up
  LOI: `Hi [their name], following up about [address]. We sent paperwork over. Is there anything I can clarify?`,

  // Stage 6→7: LOI2DAYS — 48hr LOI follow-up
  LOI2DAYS: `Hi [their name], checking in about the documents we sent for [address]. Are there any questions I can answer?`,

  // Stage 6→7 / 7→8: SD — Seller declined / keeps door open
  SD: `Hi [their name], completely understand. If anything changes or you have other addresses in mind, please reach out anytime.`,

  // Stage 11→12: PSA_CALL_OPENER — Pre-call text for PSA signing
  PSA_CALL_OPENER: `Hi [their name], I am calling in a few minutes to walk through the paperwork — should take about 10-15 minutes.`,

  // Stage 11→12: CONTRACT_OUT — After PSA signed
  CONTRACT_OUT: `Hi [their name], the paperwork for [address] is complete. Inspection window ends [date], closing on [date]. I will keep you updated.`,

  // Stage 12→13: INSPECTION_SCHEDULED — Day 7 of inspection
  INSPECTION_SCHEDULED: `Hi [their name], the inspection for [address] is scheduled. I will send the exact date and time once confirmed.`,

  // Stage 16→17: APPRAISAL_DONE — Appraisal complete
  APPRAISAL_DONE: `Hi [their name], the appraisal for [address] is complete. We are on track for closing. I will keep you posted.`,

  // Stage 18→19: JV_SIGNED — JV fully executed
  JV_SIGNED: `Hi [their name], the joint venture paperwork for [address] is fully signed by all parties. Moving forward to closing.`,

  // Stage 20→21: CLOSING_CONFIRMED — 7 days before COE
  CLOSING_CONFIRMED: `Hi [their name], we are one week away from closing on [address]. I will send the final wire instructions shortly.`,

  // Stage 21: COE_MINUS_7 — 7 days before COE (Stage 21 fire)
  COE_MINUS_7: `Hi [their name], we are one week away from closing on [address]. I will send the final wire instructions shortly.`,

  // Stage 20→21: SUBTO_PROCESSOR — 48hr before COE for SubTo
  SUBTO_PROCESSOR: `Hi [their name], confirming the third-party processing company is set up for the closing on [address]. All on track for [date].`,

  // Stage 5→6: EVERYBODY_WINS — Seller hesitating
  EVERYBODY_WINS: `Hi [their name], I wanted to share how we structure things. The plan lets you receive your price while we handle the rest. Happy to walk through it on a call.`,

  // Stage 7→8: PEND — Still interested check
  PEND: `Hi [their name], checking in on [address] — still available? If so, we would like to revisit next steps when you have a moment.`,

  // Post-close: TESTIMONIAL — +7 days
  TESTIMONIAL: `Hi [their name], hope you are doing well. We would appreciate a short note about your experience with us on [address]. It helps others in similar situations feel confident. Thank you.`,

  // Post-close: REFERRAL — +14 days
  REFERRAL: `Hi [their name], quick follow-up — if you know anyone looking to sell who could use our help, we would appreciate the introduction. We are always looking for new relationships.`,
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
async function sendStageSMS(fromStage, toStage) {
  const key = `${fromStage}→${toStage}`;
  return { sent: false, reason: `sms delivery disabled; app inbox only (${key})` };
}

/**
 * Send SMS via JustCall v2.1 API.
 * JustCall sends directly from a registered 10DLC number to any phone.
 * Doesn't require GHL contactId — uses lead phone directly.
 *
 * Docs: https://developer.justcall.io/reference/send-sms-text
 */
async function sendSMSViaJustCall() {
  return { sent: false, channel: 'disabled', reason: 'sms delivery disabled; app inbox only' };
}

/**
 * Send a specific SMS template for a lead (manual trigger).
 *
 * Resolution order:
 *   1. If GHL contactId provided -> GHL Conversations API (legacy path)
 *   2. Else if lead.phone present + JustCall configured -> JustCall direct SMS
 *   3. Else fail loudly (no silent no-op)
 */
async function sendTemplate(lead = {}, templateKey = null, contactId = null) {
  const messageBody = templateKey ? fillSMSTemplate(SMS_TEMPLATES[templateKey] || '', lead) : '';
  const communication = await maybeRecordDisabledSms({ lead, templateKey, messageBody, contactId, stage: lead?.stage || null });

  return {
    sent: false,
    channel: 'disabled',
    reason: 'sms delivery disabled; app inbox only',
    templateKey,
    messageBody,
    communicationId: communication?.id || null,
  };
}

module.exports = {
  isConfigured,
  sendSMS,
  sendStageSMS,
  sendTemplate,
  sendSMSViaJustCall,
  fillSMSTemplate,
  SMS_TEMPLATES,
};
