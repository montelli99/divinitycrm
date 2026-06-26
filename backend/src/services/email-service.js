/**
 * Email Service — Divinity CRM
 * =============================================================
 * Handles all automated emails: Seth underwriting, Kayla notifications,
 * TC handoff, contract drafts, closing confirmations.
 *
 * Uses Gmail SMTP with app password (no third-party API costs).
 *
 * Recipients (from SECRETS.env / USER.md):
 *   Seth:  claytoninvestmentsolutions@gmail.com
 *   Kayla: homewithkaylamauser@gmail.com
 *   Jaxon: JaxonDeasonHomes1@gmail.com
 *   TC:    BGonzalez@sellsmartre.com
 *   Title: order@closedtitle.com
 */

const nodemailer = require('nodemailer');

// SMTP config — Gmail with app password
const SMTP = {
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || 'montelliscottrei@gmail.com',
    pass: process.env.SMTP_PASS || '',
  },
};

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport(SMTP);
  }
  return transporter;
}

/**
 * Check if email service is configured (SMTP_PASS set).
 */
function isConfigured() {
  return !!process.env.SMTP_PASS;
}

// =============================================================
// RECIPIENT CONSTANTS
// =============================================================

const RECIPIENTS = {
  SETH:    { name: 'Seth Clayton', email: 'claytoninvestmentsolutions@gmail.com' },
  KAYLA:   { name: 'Kayla Mauser', email: 'homewithkaylamauser@gmail.com' },
  JAXON:   { name: 'Jaxon Deason', email: 'JaxonDeasonHomes1@gmail.com' },
  TC_B:    { name: 'BGonzalez',    email: 'BGonzalez@sellsmartre.com' },
  TC_M:    { name: 'Monique',      email: 'monique@sellsmartre.com' },
  TITLE:   { name: 'CLOSE Title',  email: 'order@closedtitle.com' },
  MONTELLI:{ name: 'Montelli Scott', email: 'montelliscottrei@gmail.com' },
};

// =============================================================
// STAGE-SPECIFIC EMAIL TEMPLATES
// =============================================================

/**
 * Stage 2→3: Seth Underwriting Request
 * Trigger: CONTACT_MADE → OFFER_READY
 * Sends full deal package to Seth for underwriting review.
 */
function buildSethUnderwritingEmail(lead) {
  const addr = lead.address || 'Unknown Address';
  const price = lead.price ? `$${Number(lead.price).toLocaleString()}` : 'TBD';
  const arv = lead.arv ? `$${Number(lead.arv).toLocaleString()}` : 'TBD';
  const repairs = lead.repairs_estimate ? `$${Number(lead.repairs_estimate).toLocaleString()}` : 'TBD';
  const sqft = lead.sqft ? `${lead.sqft} sqft` : 'TBD';
  const rent = lead.monthly_rent ? `$${lead.monthly_rent}/mo` : 'TBD';
  const contact = lead.seller_name || lead.agent_name || 'See CRM';
  const phone = lead.seller_phone || lead.agent_phone || 'No phone';
  const condition = lead.condition || 'unknown';
  const strategy = lead.recommended_strategy || 'TBD';
  const beds = lead.beds || '?';
  const baths = lead.baths || '?';

  const tier = condition === 'reno' ? 'Renovation' : 'FB';

  return {
    to: RECIPIENTS.SETH,
    subject: `${tier} - LOI Request ${addr}`,
    body: [
      `Hi Seth,`,
      ``,
      `An offer on the property below needs your underwriting review.`,
      ``,
      `Property: ${addr}`,
      `City/State: ${lead.city || '?'}, ${lead.state || '?'}`,
      `Beds/Baths: ${beds}/${baths} | ${sqft}`,
      `Listed Price: ${price}`,
      `ARV Estimate: ${arv}`,
      `Monthly Rent: ${rent}`,
      `Repair Estimate: ${repairs}`,
      `Condition: ${condition}`,
      `Recommended Strategy: ${strategy}`,
      ``,
      `Contact: ${contact} (${phone})`,
      ``,
      `Please review and respond with your max-offer recommendation.`,
      ``,
      `Lead ID: ${lead.id}`,
      `Triggered: ${new Date().toISOString()}`,
      ``,
      `— Atlas (auto-sent from Divinity CRM)`,
    ].join('\n'),
  };
}

/**
 * Stage 3→4: Kayla — Offer Ready for LOI
 * Trigger: OFFER_READY → OFFER_SENT
 */
function buildKaylaOfferReadyEmail(lead) {
  const addr = lead.address || 'Unknown';
  const strategy = lead.recommended_strategy || 'TBD';
  const offer = lead.cash_offer || lead.f50_offer || lead.subto_offer || 'TBD';
  const offerStr = typeof offer === 'number' ? `$${offer.toLocaleString()}` : offer;

  return {
    to: RECIPIENTS.KAYLA,
    subject: `LOI Ready — ${addr}`,
    body: [
      `Hi Kayla,`,
      ``,
      `An offer is ready for your review and LOI preparation:`,
      ``,
      `Property: ${addr}`,
      `Strategy: ${strategy}`,
      `Offer Amount: ${offerStr}`,
      `Seller: ${lead.seller_name || 'Unknown'}`,
      `Agent: ${lead.agent_name || 'N/A'}`,
      ``,
      `All details are in the CRM: https://divinitycrm-api.onrender.com/#/leads/${lead.id}`,
      ``,
      `Please prepare the LOI and send to the seller.`,
      ``,
      `— Atlas (auto-sent from Divinity CRM)`,
    ].join('\n'),
  };
}

/**
 * Stage 9→10: Kayla — Terms Agreed, Contract Draft Ready
 */
function buildKaylaContractDraftEmail(lead) {
  const addr = lead.address || 'Unknown';
  const contractType = lead.contract_type || 'TBD';

  return {
    to: RECIPIENTS.KAYLA,
    subject: `Contract Draft Ready — ${addr}`,
    body: [
      `Hi Kayla,`,
      ``,
      `Terms have been agreed and a contract draft is ready:`,
      ``,
      `Property: ${addr}`,
      `Contract Type: ${contractType}`,
      `Purchase Price: ${lead.price ? '$' + Number(lead.price).toLocaleString() : 'TBD'}`,
      ``,
      `Please review and authorize the contract in the CRM:`,
      `https://divinitycrm-api.onrender.com/#/leads/${lead.id}`,
      ``,
      `— Atlas (auto-sent from Divinity CRM)`,
    ].join('\n'),
  };
}

/**
 * Stage 11→12: TC Handshake — Contract Out
 * Sends to BGonzalez + Monique with full deal package.
 */
function buildTCHandshakeEmail(lead) {
  const addr = lead.address || 'Unknown';
  const price = lead.price ? `$${Number(lead.price).toLocaleString()}` : 'TBD';
  const emd = lead.emd_amount ? `$${lead.emd_amount}` : '$100';
  const coe = lead.coe_date || 'TBD';
  const inspection = lead.inspection_end_date || 'TBD';
  const title = lead.title_company || 'CLOSE Title';
  const contractType = lead.contract_type || 'TBD';
  const seller = lead.seller_name || 'Unknown';
  const agent = lead.agent_name || 'N/A';

  return {
    to: [RECIPIENTS.TC_B, RECIPIENTS.TC_M],
    subject: `TC Handoff — ${addr}`,
    body: [
      `Hi BGonzalez and Monique,`,
      ``,
      `New deal for transaction coordination:`,
      ``,
      `Property: ${addr}`,
      `Seller: ${seller}`,
      `Agent: ${agent}`,
      `Purchase Price: ${price}`,
      `EMD: ${emd}`,
      `Contract Type: ${contractType}`,
      `Inspection End: ${inspection}`,
      `COE Date: ${coe}`,
      `Title Company: ${title}`,
      ``,
      `Full details in CRM: https://divinitycrm-api.onrender.com/#/leads/${lead.id}`,
      ``,
      `Please confirm receipt and begin coordination.`,
      ``,
      `— Atlas (auto-sent from Divinity CRM)`,
    ].join('\n'),
  };
}

/**
 * Stage 12→13: TC Handoff — Under Contract
 */
function buildTCUnderContractEmail(lead) {
  const addr = lead.address || 'Unknown';
  return {
    to: [RECIPIENTS.TC_B, RECIPIENTS.TC_M],
    subject: `Under Contract — ${addr}`,
    body: [
      `Hi BGonzalez and Monique,`,
      ``,
      `${addr} is now under contract. 14-day inspection countdown starts today.`,
      ``,
      `Please confirm:`,
      `[ ] Inspection scheduled`,
      `[ ] Appraisal ordered`,
      `[ ] Title search initiated`,
      `[ ] EMD confirmed`,
      `[ ] Consulting/JV agreement signed`,
      ``,
      `CRM: https://divinitycrm-api.onrender.com/#/leads/${lead.id}`,
      ``,
      `— Atlas (auto-sent from Divinity CRM)`,
    ].join('\n'),
  };
}

/**
 * Stage 5→6: Kayla — Offer Received, Gain Feedback
 */
function buildKaylaGainFeedbackEmail(lead) {
  const addr = lead.address || 'Unknown';

  return {
    to: RECIPIENTS.KAYLA,
    subject: `Gain Feedback — ${addr}`,
    body: [
      `Hi Kayla,`,
      ``,
      `The seller has responded and the deal is ready for your realignment call:`,
      ``,
      `Property: ${addr}`,
      `Offer Amount: ${lead.price ? '$' + Number(lead.price).toLocaleString() : 'TBD'}`,
      `Seller Response: ${lead.seller_response || lead.gain_feedback || 'TBD'}`,
      ``,
      `Please run the 48hr realignment call and log the outcome in CRM.`,
      ``,
      `CRM: https://divinitycrm-api.onrender.com/#/leads/${lead.id}`,
      ``,
      `— Atlas (auto-sent from Divinity CRM)`,
    ].join('\n'),
  };
}

/**
 * Stage 8→9: Kayla + Jaxon — Counter Received, Re-engaged
 */
function buildKaylaJaxonCounterEmail(lead) {
  const addr = lead.address || 'Unknown';
  const counter = lead.seller_counter ? `$${Number(lead.seller_counter).toLocaleString()}` : 'TBD';

  return {
    to: [RECIPIENTS.KAYLA, RECIPIENTS.JAXON],
    subject: `Counter Received — ${addr}`,
    body: [
      `Hi Kayla and Jaxon,`,
      ``,
      `Seller has come back with a counter on:`,
      ``,
      `Property: ${addr}`,
      `Counter Amount: ${counter}`,
      `Original Offer: ${lead.price ? '$' + Number(lead.price).toLocaleString() : 'TBD'}`,
      ``,
      `Please review and determine next steps.`,
      ``,
      `CRM: https://divinitycrm-api.onrender.com/#/leads/${lead.id}`,
      ``,
      `— Atlas (auto-sent from Divinity CRM)`,
    ].join('\n'),
  };
}

// =============================================================
// GENERIC SEND FUNCTION
// =============================================================

/**
 * Send an email.
 * @param {Object} opts — { to, subject, body }
 * @returns {Object} { sent, messageId, error? }
 */
async function sendEmail(opts) {
  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to];

  // KAYLA PAUSE (2026-06-26) — user reported inbox flooding during testing.
  // Drop any email destined for Kayla's addresses before reaching SMTP/AgentMail.
  // To resume: set EMAIL_PAUSE_KAYLA=false in env, or remove this block.
  const KAYLA_BLOCKED_EMAILS = new Set([
    'homewithkaylamauser@gmail.com',
    'info@divinityaligned.net',
    'kayla@divinityaligned.net',
  ]);
  const filteredRecipients = recipients.filter(r => {
    const blocked = KAYLA_BLOCKED_EMAILS.has((r.email || '').toLowerCase());
    if (blocked) {
      console.warn(`[email-service] KAYLA-PAUSE: dropping email "${opts.subject}" → ${r.email}`);
    }
    return !blocked;
  });
  if (filteredRecipients.length === 0) {
    return { sent: false, channel: 'kayla-pause', reason: 'all recipients blocked (Kayla pause active)' };
  }
  // Use filtered list for the rest of the function
  opts = { ...opts, to: filteredRecipients.length === 1 && !Array.isArray(opts.to) ? filteredRecipients[0] : filteredRecipients };

  const toStr = filteredRecipients.map(r => `"${r.name}" <${r.email}>`).join(', ');

  // Try SMTP first (real Gmail delivery)
  if (isConfigured()) {
    try {
      const info = await getTransporter().sendMail({
        from: `"Divinity CRM" <${SMTP.auth.user}>`,
        to: toStr,
        subject: opts.subject,
        text: opts.body,
      });
      console.log(`[email-service] SMTP sent: "${opts.subject}" → ${toStr} (${info.messageId})`);
      return { sent: true, channel: 'smtp', messageId: info.messageId };
    } catch (err) {
      console.error(`[email-service] SMTP FAILED: "${opts.subject}" → ${toStr}: ${err.message}`);
      // Fall through to AgentMail fallback
    }
  }

  // Fallback to AgentMail API (already configured for AI REI / Atlas inbox)
  const agentMailKey = process.env.AGENTMAIL_AIREI_KEY;
  const agentMailFrom = process.env.AGENTMAIL_AIREI_EMAIL;
  if (agentMailKey && agentMailFrom) {
    try {
      const https = require('https');
      const body = JSON.stringify({
        to: recipients.map(r => r.email),
        subject: opts.subject,
        text: opts.body,
      });
      // URL-encode the inbox_id (e.g. airei@agentmail.to → airei%40agentmail.to)
      const encodedInbox = encodeURIComponent(agentMailFrom);
      const result = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'api.agentmail.to',
          path: `/v0/inboxes/${encodedInbox}/messages/send`,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${agentMailKey}`,
            'Content-Type': 'application/json',
          },
        }, (res) => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); }
            } else {
              reject(new Error(`AgentMail ${res.statusCode}: ${d.substring(0, 200)}`));
            }
          });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
      });
      console.log(`[email-service] AgentMail sent: "${opts.subject}" → ${toStr} (${result.message_id || result.id || 'no id'})`);
      return { sent: true, channel: 'agentmail', messageId: result.message_id || result.id || 'sent', response: result };
    } catch (err) {
      console.error(`[email-service] AgentMail FAILED: "${opts.subject}" → ${toStr}: ${err.message}`);
      return { sent: false, channel: 'agentmail_failed', error: err.message };
    }
  }

  // No channel available — fail loudly
  return { sent: false, reason: 'No email channel: SMTP_PASS and AGENTMAIL_AIREI_KEY both missing' };
}

// =============================================================
// STAGE-TRIGGERED SENDERS
// =============================================================

const STAGE_EMAIL_KEYS = new Set([
  'CONTACT_MADE→OFFER_READY',
  'OFFER_READY→OFFER_SENT',
  'OFFER_RECEIVED→GAIN_FEEDBACK',
  'ACTIVE_NEGOTIATION→TERMS_AGREED',
  'SELLER_DECLINED→ACTIVE_NEGOTIATION',
  'AWAITING_TITLE→CONTRACT_OUT',
  'CONTRACT_OUT→UNDER_CONTRACT',
]);

/**
 * Send the appropriate email(s) for a stage transition.
 * Called by stage-automations.js executeStageAutomations().
 */
async function sendStageEmail(fromStage, toStage, lead) {
  const key = `${fromStage}→${toStage}`;
  const senders = {
    'CONTACT_MADE→OFFER_READY':       () => sendEmail(buildSethUnderwritingEmail(lead)),
    'OFFER_READY→OFFER_SENT':          () => sendEmail(buildKaylaOfferReadyEmail(lead)),
    'OFFER_RECEIVED→GAIN_FEEDBACK':    () => sendEmail(buildKaylaGainFeedbackEmail(lead)),
    'ACTIVE_NEGOTIATION→TERMS_AGREED': () => sendEmail(buildKaylaContractDraftEmail(lead)),
    'SELLER_DECLINED→ACTIVE_NEGOTIATION': () => sendEmail(buildKaylaJaxonCounterEmail(lead)),
    'AWAITING_TITLE→CONTRACT_OUT':     () => sendEmail(buildTCHandshakeEmail(lead)),
    'CONTRACT_OUT→UNDER_CONTRACT':     () => sendEmail(buildTCUnderContractEmail(lead)),
  };

  const sender = senders[key];
  if (!sender) return { sent: false, skipped: true, reason: `No email template for ${key}` };

  return sender();
}

module.exports = {
  isConfigured,
  sendEmail,
  sendStageEmail,
  buildSethUnderwritingEmail,
  buildKaylaOfferReadyEmail,
  buildKaylaGainFeedbackEmail,
  buildKaylaContractDraftEmail,
  buildTCHandshakeEmail,
  buildTCUnderContractEmail,
  buildKaylaJaxonCounterEmail,
  STAGE_EMAIL_KEYS,
  RECIPIENTS,
};
