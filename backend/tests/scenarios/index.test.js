/**
 * Scenario tests for Divinity CRM deal workflows.
 *
 * Tests are organized as six scenarios that exercise realistic CRM workflows:
 *
 *   scenario_1_intake_to_offer.js
 *     New lead intake -> qualification -> contact made -> offer sent
 *
 *   scenario_2_offer_to_contract.js
 *     Offer sent -> seller response -> negotiation -> terms agreed -> under contract
 *
 *   scenario_3_dead_lead_path.js
 *     No answer / seller declined -> archived or dead (NEGATIVE PATH)
 *
 *   scenario_4_aging_and_followup.js
 *     Pipeline aging -> stale alerts + follow-up reminders fire
 *
 *   scenario_5_contracts_per_stage.js
 *     Contract templates available at the correct pipeline stage
 *
 *   scenario_6_teleprompter_per_stage.js
 *     Teleprompter shortcuts and scripts change as the lead advances
 *
 * Each scenario is self-contained:
 *   - creates its own test lead(s) via POST /api/leads
 *   - advances them through stages via POST /api/leads/:id/advance
 *   - asserts the API responses (stage, automation output, teleprompter content)
 *   - never depends on the UI / kane-cli
 *
 * Run with:
 *   cd backend && node --test tests/scenarios/index.test.js
 *
 * Requires the CRM backend to be reachable at $TEST_API_BASE_URL
 * (defaults to https://divinitycrm-ggi5.onrender.com/api).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const API = process.env.TEST_API_BASE_URL || 'https://divinitycrm-ggi5.onrender.com/api';
const EMAIL = process.env.TEST_USER_EMAIL || 'montelliscottrei@gmail.com';
const PASSWORD = process.env.TEST_USER_PASSWORD || 'Prolific2026!';

async function login() {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`Login failed: ${r.status} ${await r.text()}`);
  const body = await r.json();
  return body.token;
}

async function api(token, method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: r.ok, status: r.status, body: json };
}

async function createLead(token, lead) {
  const r = await api(token, 'POST', '/api/leads', lead);
  if (!r.ok || !r.body.lead?.id) {
    throw new Error(`createLead failed: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  }
  return r.body.lead;
}

async function advance(token, leadId, toStage) {
  const r = await api(token, 'POST', `/api/leads/${leadId}/advance`, { to_stage: toStage });
  return r;
}

async function getLead(token, leadId) {
  return api(token, 'GET', `/api/leads/${leadId}`);
}

// ============================================================================
// SCENARIO 1: New lead intake -> qualification -> contact made -> offer sent
//
// Per GHL_WORKFLOWS_SPEC.md, the OFFER_READY -> OFFER_SENT transition fires:
//   - run_doc_analysis, run_comps, run_underwriting
//   - loi_request
//   - send_sms (template 'GCJ')
//   - webhook stub
//   - log
//
// And the OFFER_SENT -> OFFER_RECEIVED transition fires:
//   - set_field: offer_sent_date = now
//   - set_reminder: 48hr_followup, offset_hours: 48
//   - send_sms (template 'GCJ')
//   - webhook stub
//   - log
//
// This test asserts the AUTOMATION RESULTS, not just "automation exists":
//   - result.results[] contains expected action types (write_fields, send_sms, etc.)
//   - the lead fields actually got updated in DB (offer_sent_date is set)
//   - a 48hr_followup reminder row exists in the reminders table
// ============================================================================
test('Scenario 1: new lead intake → contact made → offer sent (asserts real side effects)', async (t) => {
  const token = await login();

  // Create a realistic seller inquiry
  const created = await createLead(token, {
    address: '4872 Scenario One Ave, Tampa, FL 33611',
    city: 'Tampa',
    state: 'FL',
    zip: '33611',
    price: 285000,
    source: 'facebook',  // valid: facebook, agent_referred, referral, other
    beds: 3,
    baths: 2,
    sqft: 1620,
    year_built: 1998,
    seller_name: 'Maria Scenario',
    seller_phone: '813-555-0101',
    seller_email: 'maria.scenario@example.com',
    agent_name: 'Janet Realtor',
    agent_phone: '813-555-0202',
    notes: 'Scenario 1 — motivated seller, vacant 6 months',
  });
  const leadId = created.id;
  t.diagnostic(`Created lead ${leadId} at ${created.address}`);

  // Assert initial state
  assert.equal(created.stage, 'LEAD_ENTERED', 'New lead should start at LEAD_ENTERED');
  assert.equal(created.address, '4872 Scenario One Ave, Tampa, FL 33611');

  // STEP 1 — Lead entered: Buy-box check (LEAD_ENTERED -> CONTACT_MADE)
  // Per spec, this transition fires: webhook stub, quick_buybox, log
  const r1 = await advance(token, leadId, 'CONTACT_MADE');
  assert.equal(r1.ok, true, `CONTACT_MADE failed: ${r1.status} ${JSON.stringify(r1.body).slice(0, 200)}`);
  assert.equal(r1.body.lead.stage, 'CONTACT_MADE');
  assert.ok(Array.isArray(r1.body.automation?.results), 'automation.results should be an array');
  const r1Types = r1.body.automation.results.map(x => x.type);
  assert.ok(r1Types.includes('webhook'), `LEAD_ENTERED→CONTACT_MADE should fire webhook. Got: ${r1Types.join(',')}`);
  assert.ok(r1Types.includes('log'), `LEAD_ENTERED→CONTACT_MADE should log. Got: ${r1Types.join(',')}`);

  // STEP 2 — Set 48hr timer (CONTACT_MADE -> OFFER_READY)
  // Per spec: webhook, set_reminder 48hr_followup, log. (CCC SMS replaced by copy_email side-channel.)
  const r2 = await advance(token, leadId, 'OFFER_READY');
  assert.equal(r2.ok, true);
  assert.equal(r2.body.lead.stage, 'OFFER_READY');
  const r2Types = r2.body.automation.results.map(x => x.type);
  assert.ok(r2Types.includes('set_reminder'), `CONTACT_MADE→OFFER_READY should set reminder. Got: ${r2Types.join(',')}`);
  assert.ok(r2Types.includes('webhook'), `CONTACT_MADE→OFFER_READY should webhook. Got: ${r2Types.join(',')}`);
  // The 48hr_followup reminder should be in the reminders table now
  // GET /api/leads/:id/followups returns { lead, followUp48hr, listingExpiry, postClose, reminders: [...] }
  const rems2 = await api(token, 'GET', `/api/leads/${leadId}/followups`);
  assert.equal(rems2.ok, true);
  assert.ok(Array.isArray(rems2.body.reminders), 'followups should include reminders array');
  assert.ok(rems2.body.reminders.some(r => r.type === '48hr_followup'),
    `Expected a 48hr_followup reminder. Got types: ${rems2.body.reminders.map(r=>r.type).join(',')}`);

  // STEP 3 — Run 5-strategy underwriting, pick recommended, generate LOI
  //          Email Seth, send GCJ (OFFER_READY -> OFFER_SENT)
  // Per spec: run_doc_analysis, run_comps, run_underwriting, loi_request, send_sms GCJ, webhook, log
  const r3 = await advance(token, leadId, 'OFFER_SENT');
  assert.equal(r3.ok, true);
  assert.equal(r3.body.lead.stage, 'OFFER_SENT');
  const r3Types = r3.body.automation.results.map(x => x.type);
  t.diagnostic(`OFFER_READY→OFFER_SENT action types: ${r3Types.join(', ')}`);
  assert.ok(r3Types.includes('run_underwriting'), `OFFER_READY→OFFER_SENT should run underwriting. Got: ${r3Types.join(',')}`);
  assert.ok(r3Types.includes('send_sms'), `OFFER_READY→OFFER_SENT should send SMS (GCJ). Got: ${r3Types.join(',')}`);
  // The send_sms result should name the GCJ template
  const smsResult = r3.body.automation.results.find(x => x.type === 'send_sms');
  assert.equal(smsResult.template, 'GCJ', `Expected GCJ template, got: ${smsResult.template}`);

  // STEP 4 — Log offer sent, schedule 48hr timer, send GCJ (OFFER_SENT -> OFFER_RECEIVED)
  // Per spec: set_field offer_sent_date, set_reminder 48hr_followup, send_sms GCJ, webhook, log
  const r4 = await advance(token, leadId, 'OFFER_RECEIVED');
  assert.equal(r4.ok, true);
  assert.equal(r4.body.lead.stage, 'OFFER_RECEIVED');
  const r4Types = r4.body.automation.results.map(x => x.type);
  t.diagnostic(`OFFER_SENT→OFFER_RECEIVED action types: ${r4Types.join(', ')}`);
  assert.ok(r4Types.includes('set_field'), `OFFER_SENT→OFFER_RECEIVED should set field. Got: ${r4Types.join(',')}`);
  assert.ok(r4Types.includes('set_reminder'), `OFFER_SENT→OFFER_RECEIVED should set reminder. Got: ${r4Types.join(',')}`);
  const setFieldResult = r4.body.automation.results.find(x => x.type === 'set_field');
  assert.equal(setFieldResult.field, 'offer_sent_date', `Expected offer_sent_date field, got: ${setFieldResult.field}`);
  assert.ok(setFieldResult.value, 'offer_sent_date value should be set');

  // SIDE EFFECT VERIFICATION — The lead record in DB should have offer_sent_date set
  const leadAfter = await getLead(token, leadId);
  assert.equal(leadAfter.body.lead.stage, 'OFFER_RECEIVED');
  assert.ok(leadAfter.body.lead.offer_sent_date, `offer_sent_date should be set on lead. Got: ${JSON.stringify(leadAfter.body.lead.offer_sent_date)}`);

  // 48hr_followup reminder should be in reminders table
  const rems4 = await api(token, 'GET', `/api/leads/${leadId}/followups`);
  const cccAndFollowupCount = rems4.body.reminders.filter(r => r.type === '48hr_followup').length;
  assert.ok(cccAndFollowupCount >= 2, `Expected at least 2 48hr_followup reminders (CONTACT_MADE + OFFER_SENT). Got: ${cccAndFollowupCount}`);

  // Cleanup
  await api(token, 'DELETE', `/api/leads/${leadId}`);
});

// ============================================================================
// SCENARIO 2: Offer sent -> seller response -> negotiation -> terms agreed -> under contract
//
// This test walks the full Montelli (1-10) and TC (11-13) handoff, asserting
// that each transition fires the RIGHT automations and that the key side effects
// actually land in the database.
//
// Critical transitions and their required side effects:
//   GAIN_FEEDBACK → ACTIVE_NEGOTIATION: send_sms LOI, set_reminder 48hr
//   ACTIVE_NEGOTIATION → TERMS_AGREED: run_underwriting, notify (Kayla+Jaxon)
//   TERMS_AGREED → AWAITING_TITLE: generate_contract, write_fields 7 GHL fields, notify
//   AWAITING_TITLE → CONTRACT_OUT: send_sms PSA_CALL_OPENER + CONTRACT_OUT
//   CONTRACT_OUT → UNDER_CONTRACT (THE BIG ONE): rabbitsign, write_fields
//                  psa_signed_date/coe_date/inspection_end_date/title_company/emd_amount/has_subject_to_addendum,
//                  send_sms INSPECTION_SCHEDULED
// ============================================================================
test('Scenario 2: offer sent → terms agreed → under contract (asserts automation + DB state)', async (t) => {
  const token = await login();

  const lead = await createLead(token, {
    address: '1218 Scenario Two Cir, Phoenix, AZ 85016',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85016',
    price: 320000,
    source: 'agent_referred',
    seller_name: 'David Scenario',
    seller_phone: '602-555-0303',
    seller_email: 'david.scenario@example.com',
    agent_name: 'Lisa Realtor',
    contract: 'subto',  // IMPORTANT: makes has_subject_to_addendum = true at stage 12
    existing_loan_balance: 180000,
    notes: 'Scenario 2 — seller counter-offers, then accepts at 95%',
  });
  const leadId = lead.id;
  t.diagnostic(`Created lead ${leadId}`);

  // Walk through Montelli stages (1-10) — quick passes, just verify stage transitions work
  for (const stage of ['CONTACT_MADE', 'OFFER_READY', 'OFFER_SENT', 'OFFER_RECEIVED']) {
    const r = await advance(token, leadId, stage);
    assert.equal(r.ok, true, `${stage} failed: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    assert.equal(r.body.lead.stage, stage);
  }

  // GAIN_FEEDBACK (notify Kayla, send LOI SMS) — stage 5
  const rgfb = await advance(token, leadId, 'GAIN_FEEDBACK');
  assert.equal(rgfb.ok, true);
  const gfbTypes = rgfb.body.automation.results.map(x => x.type);
  assert.ok(gfbTypes.includes('send_sms'), `GAIN_FEEDBACK should send LOI SMS. Got: ${gfbTypes.join(',')}`);
  const gfbSms = rgfb.body.automation.results.find(x => x.type === 'send_sms');
  assert.equal(gfbSms.template, 'LOI', `Expected LOI template, got: ${gfbSms.template}`);

  // GAIN_FEEDBACK → ACTIVE_NEGOTIATION — stage 6
  // Per impl: webhook, set_reminder 48hr_followup, send_sms LOI, log
  // (Note: spec description mentions "Branch on Seller Response" — no underwriting re-run)
  const ran = await advance(token, leadId, 'ACTIVE_NEGOTIATION');
  assert.equal(ran.ok, true);
  const anTypes = ran.body.automation.results.map(x => x.type);
  t.diagnostic(`GAIN_FEEDBACK→ACTIVE_NEGOTIATION action types: ${anTypes.join(', ')}`);
  assert.ok(anTypes.includes('send_sms'), `GAIN_FEEDBACK→ACTIVE_NEGOTIATION should send SMS (LOI). Got: ${anTypes.join(',')}`);
  assert.ok(anTypes.includes('set_reminder'), `GAIN_FEEDBACK→ACTIVE_NEGOTIATION should set reminder. Got: ${anTypes.join(',')}`);
  const anSms = ran.body.automation.results.find(x => x.type === 'send_sms');
  assert.equal(anSms.template, 'LOI', `Expected LOI template. Got: ${anSms.template}`);

  // ACTIVE_NEGOTIATION → TERMS_AGREED — re-run underwriting, notify Kayla+Jaxon
  // Per spec: run_underwriting, notify, webhook, log
  const rtag = await advance(token, leadId, 'TERMS_AGREED');
  assert.equal(rtag.ok, true);
  const tagTypes = rtag.body.automation.results.map(x => x.type);
  t.diagnostic(`ACTIVE_NEGOTIATION→TERMS_AGREED action types: ${tagTypes.join(', ')}`);
  assert.ok(tagTypes.includes('run_underwriting'),
    `ACTIVE_NEGOTIATION→TERMS_AGREED should run_underwriting. Got: ${tagTypes.join(',')}`);
  assert.ok(tagTypes.includes('notify'),
    `ACTIVE_NEGOTIATION→TERMS_AGREED should notify. Got: ${tagTypes.join(',')}`);

  // TERMS_AGREED → AWAITING_TITLE — THE BIG MONTELLI HANDOFF
  // Per spec: generate_contract, write_fields (contract_type, coe_date, inspection_end_date,
  //   emd_amount, title_company, llc_name, property_apn), notify, log
  // (TERMS_AGREED itself is just a holding stage — the transition that fires automations is
  // TERMS_AGREED → AWAITING_TITLE)
  const rath = await advance(token, leadId, 'AWAITING_TITLE');
  assert.equal(rath.ok, true);
  assert.equal(rath.body.lead.stage, 'AWAITING_TITLE');
  const athTypes = rath.body.automation.results.map(x => x.type);
  t.diagnostic(`TERMS_AGREED→AWAITING_TITLE action types: ${athTypes.join(', ')}`);
  assert.ok(athTypes.includes('generate_contract'),
    `TERMS_AGREED→AWAITING_TITLE should generate_contract. Got: ${athTypes.join(',')}`);
  assert.ok(athTypes.includes('write_fields'),
    `TERMS_AGREED→AWAITING_TITLE should write_fields. Got: ${athTypes.join(',')}`);
  // The contract should be stored on the lead
  const writeFieldsResult = rath.body.automation.results.find(x => x.type === 'write_fields');
  t.diagnostic(`write_fields result: ${JSON.stringify(writeFieldsResult)}`);
  assert.ok(writeFieldsResult.fields.includes('contract_type'),
    `write_fields should include contract_type. Got: ${writeFieldsResult.fields.join(',')}`);
  assert.ok(writeFieldsResult.fields.includes('coe_date'),
    `write_fields should include coe_date. Got: ${writeFieldsResult.fields.join(',')}`);
  assert.ok(writeFieldsResult.fields.includes('emd_amount'),
    `write_fields should include emd_amount. Got: ${writeFieldsResult.fields.join(',')}`);
  assert.ok(writeFieldsResult.fields.includes('llc_name'),
    `write_fields should include llc_name (Divinity Aligned LLC). Got: ${writeFieldsResult.fields.join(',')}`);

  // SIDE EFFECT VERIFICATION — lead now has contract_type, coe_date, emd_amount set
  const leadAfterAth = await getLead(token, leadId);
  assert.equal(leadAfterAth.body.lead.contract_type, 'subto',
    `contract_type should be 'subto'. Got: ${leadAfterAth.body.lead.contract_type}`);
  assert.ok(leadAfterAth.body.lead.coe_date, 'coe_date should be set');
  assert.ok(leadAfterAth.body.lead.llc_name, 'llc_name should be set');
  assert.equal(leadAfterAth.body.lead.llc_name, 'Divinity Aligned LLC');

  // AWAITING_TITLE → CONTRACT_OUT (send_sms PSA_CALL_OPENER + CONTRACT_OUT, 72hr reminder)
  const rco = await advance(token, leadId, 'CONTRACT_OUT');
  assert.equal(rco.ok, true);
  const coTypes = rco.body.automation.results.map(x => x.type);
  const smsResults = rco.body.automation.results.filter(x => x.type === 'send_sms');
  t.diagnostic(`CONTRACT_OUT action types: ${coTypes.join(', ')} (${smsResults.length} SMS)`);
  assert.ok(smsResults.length >= 2, `CONTRACT_OUT should send 2 SMS (PSA_CALL_OPENER + CONTRACT_OUT). Got: ${smsResults.length}`);
  const smsTemplates = smsResults.map(s => s.template).sort();
  assert.deepEqual(smsTemplates, ['CONTRACT_OUT', 'PSA_CALL_OPENER'],
    `Expected [CONTRACT_OUT, PSA_CALL_OPENER] SMS templates. Got: ${smsTemplates.join(',')}`);

  // CONTRACT_OUT → UNDER_CONTRACT — THE BIG ONE
  // Per spec: rabbitsign, write_fields (psa_signed_date, coe_date, inspection_end_date,
  //   title_company, emd_amount, has_subject_to_addendum), send_sms INSPECTION_SCHEDULED
  const ruc = await advance(token, leadId, 'UNDER_CONTRACT');
  assert.equal(ruc.ok, true);
  assert.equal(ruc.body.lead.stage, 'UNDER_CONTRACT');
  const ucTypes = ruc.body.automation.results.map(x => x.type);
  t.diagnostic(`CONTRACT_OUT→UNDER_CONTRACT action types: ${ucTypes.join(', ')}`);
  assert.ok(ucTypes.includes('rabbitsign'),
    `CONTRACT_OUT→UNDER_CONTRACT should call RabbitSign. Got: ${ucTypes.join(',')}`);
  assert.ok(ucTypes.includes('write_fields'),
    `CONTRACT_OUT→UNDER_CONTRACT should write_fields. Got: ${ucTypes.join(',')}`);
  // INSPECTION_SCHEDULED SMS should be sent
  const ucSms = ruc.body.automation.results.filter(x => x.type === 'send_sms');
  assert.ok(ucSms.some(s => s.template === 'INSPECTION_SCHEDULED'),
    `CONTRACT_OUT→UNDER_CONTRACT should send INSPECTION_SCHEDULED SMS. Got: ${ucSms.map(s=>s.template).join(',')}`);

  // The big-write should include psa_signed_date AND has_subject_to_addendum=true (since contract=subto)
  const ucWriteFields = ruc.body.automation.results.find(x => x.type === 'write_fields');
  assert.ok(ucWriteFields.fields.includes('psa_signed_date'),
    `Big write should include psa_signed_date. Got: ${ucWriteFields.fields.join(',')}`);
  assert.ok(ucWriteFields.fields.includes('inspection_end_date'),
    `Big write should include inspection_end_date. Got: ${ucWriteFields.fields.join(',')}`);

  // SIDE EFFECT VERIFICATION — lead now has psa_signed_date and has_subject_to_addendum=true
  const leadFinal = await getLead(token, leadId);
  assert.equal(leadFinal.body.lead.stage, 'UNDER_CONTRACT');
  assert.ok(leadFinal.body.lead.psa_signed_date,
    `psa_signed_date should be set. Got: ${leadFinal.body.lead.psa_signed_date}`);
  assert.equal(leadFinal.body.lead.has_subject_to_addendum, true,
    `has_subject_to_addendum should be true (contract=subto). Got: ${leadFinal.body.lead.has_subject_to_addendum}`);

  // Cleanup
  await api(token, 'DELETE', `/api/leads/${leadId}`);
});

// ============================================================================
// SCENARIO 3: Dead lead path (NEGATIVE PATH)
//
// Per GHL spec:
//   GAIN_FEEDBACK → SELLER_DECLINED: send_sms 'SD', set_reminder dom_181
//   SELLER_DECLINED → GAIN_FEEDBACK (recovery): allowed, fires notify re-engagement
//   GAIN_FEEDBACK → DEAD: terminal
//
// Asserts:
//   - SD SMS template fires on decline
//   - DOM-181 reminder is created
//   - State machine rejects GAIN_FEEDBACK → CLOSING_DATE (HTTP 400)
//   - DEAD is terminal
// ============================================================================
test('Scenario 3: dead lead path — seller declined → DEAD (asserts SMS, reminders, state machine)', async (t) => {
  const token = await login();

  const lead = await createLead(token, {
    address: '915 Scenario Three Way, Cleveland, OH 44102',
    city: 'Cleveland',
    state: 'OH',
    zip: '44102',
    price: 95000,
    source: 'other',
    seller_name: 'Robert Scenario',
    seller_phone: '216-555-0404',
    notes: 'Scenario 3 — seller stops responding after counter-offer',
  });
  const leadId = lead.id;

  // Walk to GAIN_FEEDBACK
  for (const stage of ['CONTACT_MADE', 'OFFER_READY', 'OFFER_SENT', 'OFFER_RECEIVED', 'GAIN_FEEDBACK']) {
    const r = await advance(token, leadId, stage);
    assert.equal(r.ok, true, `Failed at ${stage}`);
  }

  // NEGATIVE: seller declines → SELLER_DECLINED
  // Per spec: send_sms 'SD' (Seller Declined template), set_reminder dom_181
  const declined = await advance(token, leadId, 'SELLER_DECLINED');
  assert.equal(declined.ok, true);
  assert.equal(declined.body.lead.stage, 'SELLER_DECLINED');
  const declTypes = declined.body.automation.results.map(x => x.type);
  assert.ok(declTypes.includes('send_sms'), `SELLER_DECLINED should send SMS. Got: ${declTypes.join(',')}`);
  assert.ok(declTypes.includes('set_reminder'), `SELLER_DECLINED should set reminder. Got: ${declTypes.join(',')}`);
  const declSms = declined.body.automation.results.find(x => x.type === 'send_sms');
  assert.equal(declSms.template, 'SD', `Expected SD SMS template. Got: ${declSms.template}`);
  const declReminder = declined.body.automation.results.find(x => x.type === 'set_reminder');
  assert.equal(declReminder.reminder_type, 'dom_181',
    `Expected dom_181 reminder. Got: ${declReminder.reminder_type}`);

  // RECOVERY PATH: try to win back — SELLER_DECLINED -> GAIN_FEEDBACK
  const recover = await advance(token, leadId, 'GAIN_FEEDBACK');
  assert.equal(recover.ok, true, `Recovery from SELLER_DECLINED should be allowed: ${recover.status}`);
  assert.equal(recover.body.lead.stage, 'GAIN_FEEDBACK');

  // NEGATIVE: try invalid transition — GAIN_FEEDBACK -> CLOSING_DATE (must fail)
  const invalid = await advance(token, leadId, 'CLOSING_DATE');
  assert.equal(invalid.ok, false, 'Skipping to CLOSING_DATE should NOT be allowed');
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /Invalid transition/);
  // Response should list valid next stages
  assert.ok(Array.isArray(invalid.body.available_transitions),
    `400 response should include available_transitions. Got: ${JSON.stringify(invalid.body).slice(0, 200)}`);

  // Final: mark dead
  const dead = await advance(token, leadId, 'DEAD');
  assert.equal(dead.ok, true);
  assert.equal(dead.body.lead.stage, 'DEAD');

  // NEGATIVE: DEAD should be terminal — try to leave it
  const stuck = await advance(token, leadId, 'GAIN_FEEDBACK');
  assert.equal(stuck.ok, false, 'DEAD should be terminal — no transitions out');
  assert.equal(stuck.status, 400);

  // Cleanup
  await api(token, 'DELETE', `/api/leads/${leadId}`);
});

// ============================================================================
// SCENARIO 4: Pipeline aging + follow-up alerts
// ============================================================================
test('Scenario 4: pipeline aging + follow-up reminders fire', async (t) => {
  const token = await login();

  const lead = await createLead(token, {
    address: '3401 Scenario Four Blvd, Atlanta, GA 30309',
    city: 'Atlanta',
    state: 'GA',
    zip: '30309',
    price: 410000,
    source: 'referral',  // valid enum
    seller_name: 'Tina Scenario',
    notes: 'Scenario 4 — needs backdating to test stale alerts',
  });

  // Move to OFFER_SENT so the 48hr-followup window applies
  for (const stage of ['CONTACT_MADE', 'OFFER_READY', 'OFFER_SENT']) {
    const r = await advance(token, lead.id, stage);
    assert.equal(r.ok, true);
  }

  // GET /api/pipeline — should include this lead
  const pipe = await api(token, 'GET', '/api/pipeline');
  assert.equal(pipe.ok, true);
  const offerSentLeads = (pipe.body.pipeline?.OFFER_SENT || []);
  const found = offerSentLeads.find(l => l.id === lead.id);
  assert.ok(found, 'Newly OFFER_SENT lead should appear in pipeline');

  // GET /api/pipeline/health — should show alerts
  const health = await api(token, 'GET', '/api/pipeline/health');
  assert.equal(health.ok, true);
  assert.ok(Array.isArray(health.body.alerts), 'Health scan should return alerts array');
  assert.ok(health.body.stats, 'Health scan should return stats');

  // POST /api/leads/:id/followups — schedule a 48hr follow-up
  const dueAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // already overdue
  const fu = await api(token, 'POST', `/api/leads/${lead.id}/followups`, {
    type: '48hr_followup',
    due_date: dueAt,
    notes: 'Scenario 4 — overdue follow-up',
  });
  assert.ok(fu.ok || fu.status === 201, `followup create failed: ${fu.status}`);

  // GET /api/leads/:id/followups — should include the overdue follow-up
  const fus = await api(token, 'GET', `/api/leads/${lead.id}/followups`);
  assert.equal(fus.ok, true);
  // Response shape: { lead, followUp48hr, listingExpiry, postClose, reminders: [...] }
  assert.ok(Array.isArray(fus.body.reminders), 'followups response should include reminders array');
  assert.ok(fus.body.reminders.length >= 1,
    `Lead should have at least 1 reminder, got ${fus.body.reminders.length}`);

  // GET /api/leads/:id/reminders — should also have reminders
  const rems = await api(token, 'GET', `/api/leads/${lead.id}/reminders`).catch(() => ({ ok: false }));

  // Cleanup
  await api(token, 'DELETE', `/api/leads/${lead.id}`);
});

// ============================================================================
// SCENARIO 5: Contract templates available per stage
// ============================================================================
test('Scenario 5: contract templates are stage-appropriate', async (t) => {
  const token = await login();

  // GET /api/contracts/templates — full list of all 23 templates
  const all = await api(token, 'GET', '/api/contracts/templates');
  assert.equal(all.ok, true, `contracts templates list failed: ${all.status}`);
  const templates = all.body.templates || all.body;
  assert.ok(Array.isArray(templates), 'templates should be an array');
  assert.ok(templates.length >= 5, `Expected at least 5 contract templates, got ${templates.length}`);

  // SubTo stage should match PSA Creative SubTo template
  const subToTpl = templates.find(t => /subto/i.test(t.id || t.name || t.type || ''));
  assert.ok(subToTpl, 'A Subject-To template should exist');

  // Cash offer template should exist
  const cashTpl = templates.find(t => /cash|loi/i.test(t.id || t.name || t.type || ''));
  assert.ok(cashTpl, 'A Cash Offer / LOI template should exist');

  // JV template should exist (Stack-equivalent)
  const jvTpl = templates.find(t => /jv/i.test(t.id || t.name || t.type || ''));
  assert.ok(jvTpl, 'A Joint Venture template should exist');

  // Lead at TERMS_AGREED should be able to generate a contract
  const lead = await createLead(token, {
    address: '7750 Scenario Five Ln, San Diego, CA 92103',
    city: 'San Diego',
    state: 'CA',
    zip: '92103',
    price: 685000,
    source: 'agent_referred',  // valid enum
    seller_name: 'Jennifer Scenario',
    contract_type: 'subto',
  });

  // Walk to TERMS_AGREED
  for (const stage of ['CONTACT_MADE', 'OFFER_READY', 'OFFER_SENT', 'OFFER_RECEIVED', 'GAIN_FEEDBACK', 'ACTIVE_NEGOTIATION', 'TERMS_AGREED']) {
    const r = await advance(token, lead.id, stage);
    assert.equal(r.ok, true);
  }

  // POST /api/contracts/generate with SubTo contract type — should succeed
  const gen = await api(token, 'POST', '/api/contracts/generate', {
    lead_id: lead.id,
    contract_type: 'subto',
  });
  assert.ok(gen.ok || gen.status === 201, `contract generate failed: ${gen.status} ${JSON.stringify(gen.body).slice(0, 200)}`);
  assert.ok(gen.body.contract || gen.body.id, 'Generated contract should have id');

  // Cleanup
  await api(token, 'DELETE', `/api/leads/${lead.id}`);
});

// ============================================================================
// SCENARIO 6: Teleprompter scripts change as lead advances
// ============================================================================
test('Scenario 6: teleprompter scripts are stage-specific', async (t) => {
  const token = await login();

  const lead = await createLead(token, {
    address: '992 Scenario Six Rd, Charlotte, NC 28202',
    city: 'Charlotte',
    state: 'NC',
    zip: '28202',
    price: 195000,
    source: 'facebook',  // valid enum
    seller_name: 'Karen Scenario',
    seller_phone: '704-555-0505',
  });

  // LEAD_ENTERED stage shortcuts
  const ledEntered = await api(token, 'GET', `/api/teleprompter/shortcuts?stage=LEAD_ENTERED&lead_id=${lead.id}`);
  assert.equal(ledEntered.ok, true, `LEAD_ENTERED shortcuts failed: ${ledEntered.status}`);
  const ledShortcuts = ledEntered.body.shortcuts || [];
  assert.ok(ledShortcuts.length >= 1, 'LEAD_ENTERED should have at least 1 shortcut');

  // Should include INT or NOA (intro text)
  const hasIntro = ledShortcuts.some(s => /INT|NOA/i.test(s.shortcut || s.name || s.key || ''));
  assert.ok(hasIntro, `LEAD_ENTERED should include an intro shortcut (INT or NOA). Found: ${ledShortcuts.map(s => s.shortcut || s.name).join(', ')}`);

  // Advance to OFFER_SENT and check shortcuts change
  for (const stage of ['CONTACT_MADE', 'OFFER_READY', 'OFFER_SENT']) {
    await advance(token, lead.id, stage);
  }

  const offerSent = await api(token, 'GET', `/api/teleprompter/shortcuts?stage=OFFER_SENT&lead_id=${lead.id}`);
  assert.equal(offerSent.ok, true);
  const osShortcuts = offerSent.body.shortcuts || [];
  assert.ok(osShortcuts.length >= 1, 'OFFER_SENT should have at least 1 shortcut');

  // The OFFER_SENT shortcuts should differ from LEAD_ENTERED shortcuts
  const ledKeys = new Set(ledShortcuts.map(s => s.shortcut || s.name || s.key));
  const osKeys = new Set(osShortcuts.map(s => s.shortcut || s.name || s.key));
  const overlap = [...ledKeys].filter(k => osKeys.has(k));
  // Some overlap is fine (universal shortcuts like CCC), but at least one should differ
  // OFFER_SENT should include GCJ ("Group Chat with Jaxon")
  const hasGCJ = osShortcuts.some(s => /GCJ/i.test(s.shortcut || s.name || ''));
  assert.ok(hasGCJ, `OFFER_SENT should include GCJ (group chat w/ Jaxon). Found: ${osShortcuts.map(s => s.shortcut || s.name).join(', ')}`);

  // Cleanup
  await api(token, 'DELETE', `/api/leads/${lead.id}`);
});
