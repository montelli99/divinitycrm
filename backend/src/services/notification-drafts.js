const { query } = require('../db/connection');
const { createCommunication } = require('./communications-service');

/**
 * Create an email/notification draft that is NOT sent.
 * Instead it is logged to communications as type='email', direction='internal',
 * status='pending' for operator review.
 *
 * This respects the operator's no-email-delivery policy while keeping the
 * workflow data in one place.
 */
async function createDraft({
  userId,
  leadId,
  recipientRole,
  recipientEmail,
  subject,
  body,
  stage,
  trigger,
  createdBy,
}) {
  if (!userId) throw new Error('userId is required');

  return createCommunication({
    userId,
    leadId,
    type: 'email',
    direction: 'internal',
    status: 'pending',
    emailAddress: recipientEmail,
    recipientName: recipientRole,
    subject,
    messageBody: body,
    stage,
    templateKey: trigger,
    createdBy,
  });
}

/**
 * Seth underwriter review draft — triggered when a lead does NOT cash flow
 * above the $250/mo offer gate.
 */
async function createSethReviewDraft(lead, underwriterEmail = 'seth@prolificcapital.com') {
  const userId = lead?.user_id;
  if (!userId) return { skipped: true, reason: 'lead has no user_id' };

  const body = [
    `Lead: ${lead.address || lead.seller_name || lead.id}`,
    `Purchase Price: $${lead.price || 'N/A'}`,
    `Monthly Rent: $${lead.monthly_rent || 'N/A'}`,
    `Cash Flow: $${lead.cash_flow || 'N/A'}`,
    `DSCR: ${lead.dscr || 'N/A'}`,
    `1% Rule: ${lead.one_percent_rule ? 'PASS' : 'FAIL'}`,
    '',
    'This deal does not meet the $250/mo cash-flow offer gate per Kayla\'s Stack Method process.',
    'Please review and advise next step.',
  ].join('\n');

  return createDraft({
    userId,
    leadId: lead.id,
    recipientRole: 'Seth (Underwriter)',
    recipientEmail: underwriterEmail,
    subject: `Underwriter Review: ${lead.address || lead.id}`,
    body,
    stage: lead.stage,
    trigger: 'underwriter_review_cashflow',
    createdBy: userId,
  });
}

/**
 * Kayla notification draft — triggered on stage transitions that need TC/closer attention.
 */
async function createKaylaNotificationDraft(lead, event, kaylaEmail = 'info@divinityaligned.net') {
  const userId = lead?.user_id;
  if (!userId) return { skipped: true, reason: 'lead has no user_id' };

  const body = [
    `Lead: ${lead.address || lead.seller_name || lead.id}`,
    `Stage: ${lead.stage}`,
    `Event: ${event}`,
    '',
    'This lead needs TC/closer attention. Please check the CRM for next actions.',
  ].join('\n');

  return createDraft({
    userId,
    leadId: lead.id,
    recipientRole: 'Kayla (TC/Closer)',
    recipientEmail: kaylaEmail,
    subject: `CRM Notification: ${event} — ${lead.address || lead.id}`,
    body,
    stage: lead.stage,
    trigger: event,
    createdBy: userId,
  });
}

module.exports = {
  createDraft,
  createSethReviewDraft,
  createKaylaNotificationDraft,
};
