const { createSethReviewDraft, createKaylaNotificationDraft } = require('./notification-drafts');
const { query } = require('../db/connection');

async function runDraftAutomations(leadId, fromStage, toStage) {
  const leadRes = await query('SELECT * FROM leads WHERE id = $1', [leadId]);
  if (!leadRes.length) return [];
  const lead = leadRes[0];
  const results = [];

  // Seth underwriter review draft: when deal does not meet $250 cash-flow offer gate
  if (
    lead.cash_flow !== null && lead.cash_flow !== undefined &&
    (Number(lead.cash_flow) < 250 || lead.qualifies_for_offer === false)
  ) {
    try {
      const draft = await createSethReviewDraft(lead);
      results.push({ type: 'seth_review_draft', ok: !!draft?.id, id: draft?.id });
    } catch (e) {
      results.push({ type: 'seth_review_draft', ok: false, error: e.message });
    }
  }

  // Kayla notification drafts for TC/closer-handoff stages
  const kaylaStages = [
    'OFFER_READY',
    'TERMS_AGREED',
    'CONTRACT_OUT',
    'UNDER_CONTRACT',
    'INSPECTION_COMPLETE',
    'APPRAISAL_DONE',
    'JV_SIGNED',
    'WIRE_SETUP',
  ];
  if (kaylaStages.includes(toStage)) {
    try {
      const draft = await createKaylaNotificationDraft(lead, `Stage ${toStage}`);
      results.push({ type: 'kayla_notify_draft', ok: !!draft?.id, id: draft?.id });
    } catch (e) {
      results.push({ type: 'kayla_notify_draft', ok: false, error: e.message });
    }
  }

  return results;
}

module.exports = { runDraftAutomations };
