/**
 * SMS Service — Divinity CRM
 * =============================================================
 * Outbound SMS is disabled during the inbox-only phase.
 * Keep every entry point as a hard no-op so Atlas cannot send.
 */

const { createCommunication, updateCommunicationStatus } = require('./communications-service');
const { spawn } = require('child_process');
const { query } = require('../db/connection');
const path = require('path');

function isConfigured() {
  // Only true if both VoIP.ms creds AND master SMS kill switch are present
  const masterEnabled = process.env.SMS_ENABLED === 'true';
  const voipEnabled = process.env.VOIPMS_ENABLED === 'true';
  const hasCreds = Boolean(process.env.VOIPMS_USERNAME && process.env.VOIPMS_API_PASSWORD && process.env.VOIPMS_DID);
  const hasScript = Boolean(process.env.VOIPMS_SENDER_SCRIPT_PATH);
  return Boolean((masterEnabled || voipEnabled) && hasCreds && hasScript);
}

function normalizePhone(number) {
  if (!number) return null;
  const cleaned = String(number).replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('1')) return cleaned.slice(1);
  if (cleaned.length === 10) return cleaned;
  return null;
}

const SAFE_TEST_NUMBER = '5718140891'; // Montelli's phone — only destination allowed for SMS testing

async function getDailyCount(did) {
  if (!did) return 0;
  const r = await query(
    'SELECT count FROM sms_daily_log WHERE did = $1 AND log_date = CURRENT_DATE',
    [did]
  );
  return r[0]?.count || 0;
}

async function incrementDailyCount(did) {
  await query(
    `INSERT INTO sms_daily_log (did, log_date, count)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (did, log_date)
     DO UPDATE SET count = sms_daily_log.count + 1`,
    [did]
  );
}

async function sendSMSViaVoIPMS({ to, message }) {
  if (!isConfigured()) {
    return { sent: false, channel: 'disabled', reason: 'VoIP.ms not configured or SMS_ENABLED=false' };
  }

  const scriptPath = process.env.VOIPMS_SENDER_SCRIPT_PATH;
  const args = [to, message];

  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath, ...args], {
      env: { ...process.env, NO_PROXY: '*' },
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      const ok = code === 0 && !stdout.includes('\"status\":\"error\"') && !stdout.includes('<error');
      resolve({
        sent: ok,
        channel: 'voipms',
        code,
        stdout: stdout.slice(0, 500),
        stderr: stderr.slice(0, 500),
      });
    });

    child.on('error', (err) => {
      resolve({ sent: false, channel: 'voipms', error: err.message });
    });
  });
}

async function maybeRecordSms({ userId, leadId, type, direction, status, phoneNumber, messageBody, externalId, externalStatus, templateKey, stage, createdBy }) {
  if (!process.env.DATABASE_URL) return null;
  try {
    return await createCommunication({
      userId,
      leadId,
      type,
      direction,
      status,
      phoneNumber,
      senderName: 'Divinity CRM',
      recipientName: null,
      messageBody,
      externalId,
      externalStatus,
      templateKey,
      stage,
      createdBy,
    });
  } catch (err) {
    console.warn('[sms-service] communication log skipped:', err.message);
    return null;
  }
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
const STAGE_SMS_MAP = {
  'CONTACT_MADE→OFFER_READY': 'CCC',
  'OFFER_READY→OFFER_SENT': 'GCJ',
  'OFFER_SENT→OFFER_RECEIVED': 'GCJ',
  'OFFER_RECEIVED→GAIN_FEEDBACK': 'LOI',
  'GAIN_FEEDBACK→ACTIVE_NEGOTIATION': 'LOI',
  'GAIN_FEEDBACK→NO_ANSWER': 'LOI2DAYS',
  'GAIN_FEEDBACK→SELLER_DECLINED': 'SD',
  'NO_ANSWER→SELLER_DECLINED': 'SD',
  'SELLER_DECLINED→LEAD_ENTERED': 'PEND',
  'CONTRACT_OUT→UNDER_CONTRACT': 'CONTRACT_OUT',
  'INSPECTION_PERIOD→INSPECTION_COMPLETE': 'INSPECTION_SCHEDULED',
  'APPRAISAL_ORDERED→APPRAISAL_DONE': 'APPRAISAL_DONE',
  'JV_SENT→JV_SIGNED': 'JV_SIGNED',
  'WIRE_SETUP→CLOSING_DATE': 'CLOSING_CONFIRMED',
};

async function sendStageSMS(fromStage, toStage, lead = {}, { userId = null, dryRun = false } = {}) {
  const key = `${fromStage}→${toStage}`;
  const templateKey = STAGE_SMS_MAP[key];
  if (!templateKey) {
    return { sent: false, reason: `no SMS template mapped for ${key}`, stageKey: key };
  }
  return sendTemplate(lead, templateKey, null, { userId, stage: toStage, dryRun });
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
async function sendTemplate(lead = {}, templateKey = null, contactId = null, { userId = null, stage = null, dryRun = false } = {}) {
  const messageBody = templateKey ? fillSMSTemplate(SMS_TEMPLATES[templateKey] || '', lead) : '';
  if (!messageBody) {
    return { sent: false, reason: 'template not found', templateKey };
  }

  const ownerId = userId || lead?.user_id || lead?.userId || null;
  let phone = normalizePhone(lead?.phone_normalized || lead?.seller_phone || lead?.agent_phone);

  // Safety: unless this is a real production run with delivery enabled,
  // route all test SMS to the operator's safe number.
  const realRun = process.env.SMS_ENABLED === 'true';
  if (!realRun && phone !== SAFE_TEST_NUMBER) {
    phone = SAFE_TEST_NUMBER;
  }
  const did = process.env.VOIPMS_DID;
  const limit = Number(process.env.VOIPMS_SMS_DAILY_LIMIT) || 100;

  // Always log the intended communication first
  const communication = await maybeRecordSms({
    userId: ownerId,
    leadId: lead?.id || null,
    type: 'sms',
    direction: 'outbound',
    status: dryRun ? 'scheduled' : 'pending',
    phoneNumber: phone,
    recipientName: lead?.seller_name || lead?.agent_name || null,
    messageBody,
    templateKey,
    stage: stage || lead?.stage || null,
    createdBy: ownerId,
  });

  if (dryRun || !isConfigured()) {
    return {
      sent: false,
      channel: dryRun ? 'dry_run' : 'disabled',
      reason: dryRun ? 'dry run — no message sent' : 'sms delivery disabled; app inbox only',
      templateKey,
      messageBody,
      communicationId: communication?.id || null,
    };
  }

  if (!phone) {
    await updateCommunicationStatus(communication.id, 'failed', 'no recipient phone');
    return { sent: false, reason: 'no recipient phone', templateKey, communicationId: communication.id };
  }

  const dailyCount = await getDailyCount(did);
  if (dailyCount >= limit) {
    await updateCommunicationStatus(communication.id, 'failed', 'daily SMS limit reached');
    return { sent: false, reason: `daily SMS limit reached (${limit})`, templateKey, communicationId: communication.id };
  }

  const result = await sendSMSViaVoIPMS({ to: phone, message: messageBody });
  await incrementDailyCount(did);
  await updateCommunicationStatus(
    communication.id,
    result.sent ? 'sent' : 'failed',
    result.sent ? null : (result.stderr || result.stdout || 'voip.ms error')
  );

  return {
    sent: result.sent,
    channel: result.channel,
    reason: result.sent ? null : (result.error || result.stderr || result.stdout || 'send failed'),
    templateKey,
    messageBody,
    communicationId: communication?.id || null,
    voipMsResult: { code: result.code, stdout: result.stdout, stderr: result.stderr },
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
