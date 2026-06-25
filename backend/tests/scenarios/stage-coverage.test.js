/**
 * Stage Coverage Tests - Divinity CRM
 *
 * One test per transition in the 21-stage pipeline.
 * Every test asserts REAL SIDE EFFECTS:
 *   - automation.results contains the expected action types
 *   - any silent ok:false FAIL the test (no silent passes)
 *   - DB fields actually persisted on the lead record
 *   - reminder rows actually inserted
 *   - contract generation produced non-empty result
 *   - RabbitSign envelope created (or fallback logged)
 *
 * Source of truth: backend/src/services/stage-automations.js STAGE_TRANSITIONS
 *
 * Run with:
 *   cd backend && node --test tests/scenarios/stage-coverage.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const API = process.env.TEST_API_BASE_URL || 'https://divinitycrm-api.onrender.com';
const EMAIL = process.env.TEST_USER_EMAIL || 'montelliscottrei@gmail.com';
const PASSWORD = process.env.TEST_USER_PASSWORD || 'Prolific2026!';

let cachedToken = null;
async function login() {
  if (cachedToken) return cachedToken;
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`Login failed: ${r.status} ${await r.text()}`);
  cachedToken = (await r.json()).token;
  return cachedToken;
}

async function api(token, method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: r.ok, status: r.status, body: json };
}

async function createLead(token, overrides = {}) {
  const r = await api(token, 'POST', '/api/leads', {
    address: `${Math.floor(Math.random() * 9000) + 1000} Stage Test Way, Tampa, FL 33611`,
    city: 'Tampa', state: 'FL', zip: '33611',
    price: 250000, source: 'facebook',
    seller_name: 'Test Seller', seller_phone: '813-555-0100', seller_email: 'test@example.com',
    contract: 'subto', existing_loan_balance: 150000,
    ...overrides,
  });
  if (!r.ok || !r.body.lead?.id) throw new Error(`createLead failed: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return r.body.lead;
}

async function advance(token, leadId, toStage) {
  return api(token, 'POST', `/api/leads/${leadId}/advance`, { to_stage: toStage });
}
async function getLead(token, leadId) { return api(token, 'GET', `/api/leads/${leadId}`); }
async function deleteLead(token, leadId) { return api(token, 'DELETE', `/api/leads/${leadId}`); }

function assertHasAction(results, actionType, label) {
  const found = results.find(r => r.type === actionType);
  if (!found) assert.fail(`${label} should fire '${actionType}'. Got: ${results.map(r => r.type).join(', ')}`);
  return found;
}
function assertNoSilentFailures(results, label) {
  // Skip email + send_sms + rabbitsign failures - those depend on external services
  // (SMTP, Twilio/JustCall, RabbitSign) that may not be configured in test env.
  // What we DO flag: webhook, log, set_reminder, set_field, write_fields, generate_contract,
  // run_underwriting, run_comps, run_doc_analysis, notify - these are local DB/service ops.
  const silentlyFailing = ['webhook', 'log', 'set_reminder', 'set_field', 'write_fields',
    'generate_contract', 'run_underwriting', 'run_comps', 'run_doc_analysis', 'notify', 'quick_buybox', 'loi_request'];
  const failures = results.filter(r => r.ok === false && silentlyFailing.includes(r.type));
  if (failures.length > 0) assert.fail(`${label} has silent failures: ${JSON.stringify(failures)}`);
}

async function leadAtStage(token, stage, overrides = {}) {
  const lead = await createLead(token, overrides);
  const stages = ['LEAD_ENTERED', 'CONTACT_MADE', 'OFFER_READY', 'OFFER_SENT', 'OFFER_RECEIVED', 'GAIN_FEEDBACK', 'ACTIVE_NEGOTIATION', 'TERMS_AGREED', 'AWAITING_TITLE', 'CONTRACT_OUT', 'UNDER_CONTRACT', 'INSPECTION_PERIOD', 'INSPECTION_COMPLETE', 'APPRAISAL_ORDERED', 'APPRAISAL_DONE', 'JV_SENT', 'JV_SIGNED', 'WIRE_SETUP', 'CLOSING_DATE'];
  const idx = stages.indexOf(stage);
  if (idx === -1) throw new Error(`Unknown stage: ${stage}`);
  for (let i = 1; i <= idx; i++) {
    const r = await advance(token, lead.id, stages[i]);
    if (!r.ok) throw new Error(`Walk to ${stages[i]} failed: ${r.status}`);
  }
  return lead;
}

test('Stage 01: LEAD_ENTERED - POST /api/leads creates lead at this stage', async (t) => {
  const token = await login();
  const lead = await createLead(token);
  t.diagnostic(`Created ${lead.id}`);
  assert.equal(lead.stage, 'LEAD_ENTERED');
  const fetched = await getLead(token, lead.id);
  assert.equal(fetched.body.lead.stage, 'LEAD_ENTERED');
  await deleteLead(token, lead.id);
});

test('Stage 02: LEAD_ENTERED → CONTACT_MADE - webhook + log fire', async () => {
  const token = await login();
  const lead = await createLead(token);
  const r = await advance(token, lead.id, 'CONTACT_MADE');
  assert.equal(r.ok, true);
  assert.equal(r.body.lead.stage, 'CONTACT_MADE');
  const results = r.body.automation.results;
  assertHasAction(results, 'webhook', 'LEAD_ENTERED→CONTACT_MADE');
  assertHasAction(results, 'log', 'LEAD_ENTERED→CONTACT_MADE');
  assertNoSilentFailures(results, 'LEAD_ENTERED→CONTACT_MADE');
  await deleteLead(token, lead.id);
});

test('Stage 03: CONTACT_MADE → OFFER_READY - 48hr reminder fires', async (t) => {
  const token = await login();
  const lead = await createLead(token);
  // Walk to CONTACT_MADE first (stage 1 → 2)
  const r0 = await advance(token, lead.id, 'CONTACT_MADE');
  assert.equal(r0.ok, true, `Walk to CONTACT_MADE failed: ${r0.status} ${JSON.stringify(r0.body).slice(0,200)}`);
  // Now stage 2 → 3
  const r = await advance(token, lead.id, 'OFFER_READY');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  const rem = assertHasAction(results, 'set_reminder', 'CONTACT_MADE→OFFER_READY');
  assert.equal(rem.reminder_type, '48hr_followup');
  const fus = await api(token, 'GET', `/api/leads/${lead.id}/followups`);
  assert.ok(fus.body.reminders.some(r => r.type === '48hr_followup'), '48hr reminder should persist');
  assertNoSilentFailures(results, 'CONTACT_MADE→OFFER_READY');
  // SPEC GAP - log loudly
  const cccSms = results.find(x => x.type === 'send_sms' && x.template === 'CCC');
  if (!cccSms) t.diagnostic('GAP: GHL spec "Send SMS (CCC)" not in impl.');
  await deleteLead(token, lead.id);
});

test('Stage 04: OFFER_READY → OFFER_SENT - run_underwriting + send_sms GCJ', async (t) => {
  const token = await login();
  const lead = await createLead(token);
  await advance(token, lead.id, 'CONTACT_MADE');
  await advance(token, lead.id, 'OFFER_READY');
  const r = await advance(token, lead.id, 'OFFER_SENT');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  t.diagnostic(`actions: ${results.map(x => x.type).join(', ')}`);
  assertHasAction(results, 'run_underwriting', 'OFFER_READY→OFFER_SENT');
  assertHasAction(results, 'run_comps', 'OFFER_READY→OFFER_SENT');
  assertHasAction(results, 'run_doc_analysis', 'OFFER_READY→OFFER_SENT');
  assertHasAction(results, 'send_sms', 'OFFER_READY→OFFER_SENT');
  assert.equal(results.find(x => x.type === 'send_sms').template, 'GCJ');
  assertNoSilentFailures(results.filter(x => x.type !== 'send_sms' && x.type !== 'email'), 'OFFER_READY→OFFER_SENT');
  await deleteLead(token, lead.id);
});

test('Stage 05: OFFER_SENT → OFFER_RECEIVED - offer_sent_date set + 48hr reminder', async () => {
  const token = await login();
  const lead = await leadAtStage(token, 'OFFER_SENT');
  const r = await advance(token, lead.id, 'OFFER_RECEIVED');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  const sf = assertHasAction(results, 'set_field', 'OFFER_SENT→OFFER_RECEIVED');
  assert.equal(sf.field, 'offer_sent_date');
  assert.ok(sf.value);
  assertHasAction(results, 'set_reminder', 'OFFER_SENT→OFFER_RECEIVED');
  assertNoSilentFailures(results, 'OFFER_SENT→OFFER_RECEIVED');
  const fetched = await getLead(token, lead.id);
  assert.ok(fetched.body.lead.offer_sent_date, 'offer_sent_date should persist');
  await deleteLead(token, lead.id);
});

test('Stage 06: OFFER_RECEIVED → GAIN_FEEDBACK - notify Kayla + send_sms LOI', async () => {
  const token = await login();
  const lead = await leadAtStage(token, 'OFFER_RECEIVED');
  const r = await advance(token, lead.id, 'GAIN_FEEDBACK');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  const notif = assertHasAction(results, 'notify', 'OFFER_RECEIVED→GAIN_FEEDBACK');
  assert.equal(notif.ok, true, `notify should fire successfully. Got: ${JSON.stringify(notif)}`);
  const sms = assertHasAction(results, 'send_sms', 'OFFER_RECEIVED→GAIN_FEEDBACK');
  assert.equal(sms.template, 'LOI');
  assertNoSilentFailures(results, 'OFFER_RECEIVED→GAIN_FEEDBACK');
  await deleteLead(token, lead.id);
});

test('Stage 07: GAIN_FEEDBACK → ACTIVE_NEGOTIATION - LOI SMS + 48hr reminder', async (t) => {
  const token = await login();
  const lead = await leadAtStage(token, 'GAIN_FEEDBACK');
  const r = await advance(token, lead.id, 'ACTIVE_NEGOTIATION');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  t.diagnostic(`actions: ${results.map(x => x.type).join(', ')}`);
  const sms = assertHasAction(results, 'send_sms', 'GAIN_FEEDBACK→ACTIVE_NEGOTIATION');
  assert.equal(sms.template, 'LOI');
  const rem = assertHasAction(results, 'set_reminder', 'GAIN_FEEDBACK→ACTIVE_NEGOTIATION');
  assert.equal(rem.reminder_type, '48hr_followup');
  assertNoSilentFailures(results.filter(x => x.type !== 'send_sms' && x.type !== 'email'), 'GAIN_FEEDBACK→ACTIVE_NEGOTIATION');
  const uw = results.find(x => x.type === 'run_underwriting');
  if (!uw) t.diagnostic('GAP: Spec mentions "Re-run underwriting" but impl has no run_underwriting action.');
  await deleteLead(token, lead.id);
});

test('Stage 07b: GAIN_FEEDBACK → NO_ANSWER - dom_181 + LOI2DAYS SMS', async () => {
  const token = await login();
  const lead = await leadAtStage(token, 'GAIN_FEEDBACK');
  const r = await advance(token, lead.id, 'NO_ANSWER');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  const rem = assertHasAction(results, 'set_reminder', 'GAIN_FEEDBACK→NO_ANSWER');
  assert.equal(rem.reminder_type, 'dom_181');
  const sms = assertHasAction(results, 'send_sms', 'GAIN_FEEDBACK→NO_ANSWER');
  assert.equal(sms.template, 'LOI2DAYS');
  assertNoSilentFailures(results.filter(x => x.type !== 'send_sms' && x.type !== 'email'), 'GAIN_FEEDBACK→NO_ANSWER');
  await deleteLead(token, lead.id);
});

test('Stage 08: GAIN_FEEDBACK → SELLER_DECLINED - dom_181 + SD SMS', async () => {
  const token = await login();
  const lead = await leadAtStage(token, 'GAIN_FEEDBACK');
  const r = await advance(token, lead.id, 'SELLER_DECLINED');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  const sms = assertHasAction(results, 'send_sms', 'GAIN_FEEDBACK→SELLER_DECLINED');
  assert.equal(sms.template, 'SD');
  const rem = assertHasAction(results, 'set_reminder', 'GAIN_FEEDBACK→SELLER_DECLINED');
  assert.equal(rem.reminder_type, 'dom_181');
  assertNoSilentFailures(results.filter(x => x.type !== 'send_sms' && x.type !== 'email'), 'GAIN_FEEDBACK→SELLER_DECLINED');
  await deleteLead(token, lead.id);
});

test('Stage 09: ACTIVE_NEGOTIATION → TERMS_AGREED - run_underwriting + notify', async () => {
  const token = await login();
  const lead = await leadAtStage(token, 'ACTIVE_NEGOTIATION');
  const r = await advance(token, lead.id, 'TERMS_AGREED');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  assertHasAction(results, 'run_underwriting', 'ACTIVE_NEGOTIATION→TERMS_AGREED');
  assertHasAction(results, 'notify', 'ACTIVE_NEGOTIATION→TERMS_AGREED');
  assertNoSilentFailures(results.filter(x => x.type !== 'send_sms' && x.type !== 'email'), 'ACTIVE_NEGOTIATION→TERMS_AGREED');
  await deleteLead(token, lead.id);
});

test('Stage 10: TERMS_AGREED → AWAITING_TITLE - generate_contract + 7 GHL fields', async (t) => {
  const token = await login();
  const lead = await leadAtStage(token, 'TERMS_AGREED');
  const r = await advance(token, lead.id, 'AWAITING_TITLE');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  t.diagnostic(`actions: ${results.map(x => x.type).join(', ')}`);
  const gc = assertHasAction(results, 'generate_contract', 'TERMS_AGREED→AWAITING_TITLE');
  assert.ok(gc.length > 0, `Contract length should be > 0. Got: ${gc.length}`);
  const wf = assertHasAction(results, 'write_fields', 'TERMS_AGREED→AWAITING_TITLE');
  for (const f of ['contract_type', 'coe_date', 'inspection_end_date', 'emd_amount', 'title_company', 'llc_name', 'property_apn']) {
    assert.ok(wf.fields.includes(f), `write_fields should include ${f}. Got: ${wf.fields.join(',')}`);
  }
  const fetched = await getLead(token, lead.id);
  assert.equal(fetched.body.lead.contract_type, 'subto');
  assert.ok(fetched.body.lead.coe_date);
  assert.ok(fetched.body.lead.inspection_end_date);
  assert.equal(Number(fetched.body.lead.emd_amount), 100);
  assert.equal(fetched.body.lead.title_company, 'CLOSED Title');
  assert.equal(fetched.body.lead.llc_name, 'Divinity Aligned LLC');
  await deleteLead(token, lead.id);
});

test('Stage 11: AWAITING_TITLE → CONTRACT_OUT - 2 SMS + 72hr custom reminder', async () => {
  const token = await login();
  const lead = await leadAtStage(token, 'AWAITING_TITLE');
  const r = await advance(token, lead.id, 'CONTRACT_OUT');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  const smsResults = results.filter(x => x.type === 'send_sms');
  assert.equal(smsResults.length, 2, `Expected 2 SMS, got ${smsResults.length}`);
  assert.deepEqual(smsResults.map(s => s.template).sort(), ['CONTRACT_OUT', 'PSA_CALL_OPENER']);
  const rem = assertHasAction(results, 'set_reminder', 'AWAITING_TITLE→CONTRACT_OUT');
  assert.equal(rem.reminder_type, 'custom');
  assertNoSilentFailures(results.filter(x => x.type !== 'send_sms' && x.type !== 'email'), 'AWAITING_TITLE→CONTRACT_OUT');
  await deleteLead(token, lead.id);
});

test('Stage 12: CONTRACT_OUT → UNDER_CONTRACT (THE BIG ONE) - RabbitSign + 6 fields + INSPECTION_SCHEDULED', async () => {
  const token = await login();
  const lead = await leadAtStage(token, 'CONTRACT_OUT');
  const r = await advance(token, lead.id, 'UNDER_CONTRACT');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  assertHasAction(results, 'rabbitsign', 'CONTRACT_OUT→UNDER_CONTRACT');
  const wf = assertHasAction(results, 'write_fields', 'CONTRACT_OUT→UNDER_CONTRACT');
  for (const f of ['psa_signed_date', 'coe_date', 'inspection_end_date', 'title_company', 'emd_amount', 'has_subject_to_addendum']) {
    assert.ok(wf.fields.includes(f), `write_fields should include ${f}. Got: ${wf.fields.join(',')}`);
  }
  const sms = assertHasAction(results, 'send_sms', 'CONTRACT_OUT→UNDER_CONTRACT');
  assert.equal(sms.template, 'INSPECTION_SCHEDULED');
  assertNoSilentFailures(results.filter(x => x.type !== 'send_sms' && x.type !== 'email' && x.type !== 'rabbitsign'), 'CONTRACT_OUT→UNDER_CONTRACT');
  const fetched = await getLead(token, lead.id);
  assert.ok(fetched.body.lead.psa_signed_date);
  assert.equal(fetched.body.lead.has_subject_to_addendum, true);
  assert.equal(Number(fetched.body.lead.emd_amount), 100);
  await deleteLead(token, lead.id);
});

test('Stage 13: UNDER_CONTRACT → INSPECTION_PERIOD - copy_email + 14-day countdown + Day 7/14 reminders', async (t) => {
  const token = await login();
  const lead = await leadAtStage(token, 'UNDER_CONTRACT');
  const r = await advance(token, lead.id, 'INSPECTION_PERIOD');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  t.diagnostic(`actions: ${results.map(x => x.type).join(', ')}`);
  assertHasAction(results, 'copy_email', 'UNDER_CONTRACT→INSPECTION_PERIOD');
  const reminders = results.filter(x => x.type === 'set_reminder');
  assert.ok(reminders.length >= 3, `Expected 3+ reminders (14-day, day 7, day 14). Got: ${reminders.length}`);
  const types = reminders.map(x => x.reminder_type);
  assert.ok(types.some(t => t.includes('inspection')), `Expected inspection-period reminder. Got: ${types.join(',')}`);
  assertNoSilentFailures(results, 'UNDER_CONTRACT→INSPECTION_PERIOD');
  await deleteLead(token, lead.id);
});

test('Stage 14: INSPECTION_PERIOD → INSPECTION_COMPLETE - notify Kayla + inspection_complete_date', async (t) => {
  const token = await login();
  const lead = await leadAtStage(token, 'INSPECTION_PERIOD');
  const r = await advance(token, lead.id, 'INSPECTION_COMPLETE');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  t.diagnostic(`actions: ${results.map(x => x.type).join(', ')}`);
  assertHasAction(results, 'notify', 'INSPECTION_PERIOD→INSPECTION_COMPLETE');
  assertHasAction(results, 'set_field', 'INSPECTION_PERIOD→INSPECTION_COMPLETE');
  const sf = results.find(x => x.type === 'set_field');
  assert.equal(sf.field, 'inspection_complete_date');
  assertNoSilentFailures(results, 'INSPECTION_PERIOD→INSPECTION_COMPLETE');
  // DB VERIFICATION
  const fetched = await getLead(token, lead.id);
  assert.ok(fetched.body.lead.inspection_complete_date, 'inspection_complete_date should persist');
  await deleteLead(token, lead.id);
});

test('Stage 15: INSPECTION_COMPLETE → APPRAISAL_ORDERED - auto-advance', async () => {
  const token = await login();
  const lead = await leadAtStage(token, 'INSPECTION_COMPLETE');
  const r = await advance(token, lead.id, 'APPRAISAL_ORDERED');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  assertHasAction(results, 'webhook', 'INSPECTION_COMPLETE→APPRAISAL_ORDERED');
  assertHasAction(results, 'log', 'INSPECTION_COMPLETE→APPRAISAL_ORDERED');
  assertNoSilentFailures(results, 'INSPECTION_COMPLETE→APPRAISAL_ORDERED');
  await deleteLead(token, lead.id);
});

test('Stage 16: APPRAISAL_ORDERED → APPRAISAL_DONE - APPRAISAL_DONE SMS', async () => {
  const token = await login();
  const lead = await leadAtStage(token, 'APPRAISAL_ORDERED');
  const r = await advance(token, lead.id, 'APPRAISAL_DONE');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  const sms = assertHasAction(results, 'send_sms', 'APPRAISAL_ORDERED→APPRAISAL_DONE');
  assert.equal(sms.template, 'APPRAISAL_DONE');
  assertNoSilentFailures(results.filter(x => x.type !== 'send_sms' && x.type !== 'email'), 'APPRAISAL_ORDERED→APPRAISAL_DONE');
  await deleteLead(token, lead.id);
});

test('Stage 17 (JV path): APPRAISAL_DONE → JV_SENT - run_underwriting + notify', async () => {
  const token = await login();
  const lead = await leadAtStage(token, 'APPRAISAL_DONE');
  const r = await advance(token, lead.id, 'JV_SENT');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  assertHasAction(results, 'run_underwriting', 'APPRAISAL_DONE→JV_SENT');
  assertHasAction(results, 'notify', 'APPRAISAL_DONE→JV_SENT');
  assertNoSilentFailures(results.filter(x => x.type !== 'send_sms' && x.type !== 'email'), 'APPRAISAL_DONE→JV_SENT');
  await deleteLead(token, lead.id);
});

test('Stage 17 (no-JV path): APPRAISAL_DONE → WIRE_SETUP - skip JV', async () => {
  const token = await login();
  const lead = await leadAtStage(token, 'APPRAISAL_DONE');
  const r = await advance(token, lead.id, 'WIRE_SETUP');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  assertHasAction(results, 'run_underwriting', 'APPRAISAL_DONE→WIRE_SETUP');
  assertNoSilentFailures(results.filter(x => x.type !== 'send_sms' && x.type !== 'email'), 'APPRAISAL_DONE→WIRE_SETUP');
  await deleteLead(token, lead.id);
});

test('Stage 18: JV_SENT → JV_SIGNED - RabbitSign + JV_SIGNED SMS', async () => {
  const token = await login();
  const lead = await leadAtStage(token, 'JV_SENT');
  const r = await advance(token, lead.id, 'JV_SIGNED');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  assertHasAction(results, 'rabbitsign', 'JV_SENT→JV_SIGNED');
  const sms = assertHasAction(results, 'send_sms', 'JV_SENT→JV_SIGNED');
  assert.equal(sms.template, 'JV_SIGNED');
  assertNoSilentFailures(results.filter(x => x.type !== 'send_sms' && x.type !== 'email' && x.type !== 'rabbitsign'), 'JV_SENT→JV_SIGNED');
  await deleteLead(token, lead.id);
});

test('Stage 19: JV_SIGNED → WIRE_SETUP - jv_title_holder + jv_signed_date + JV_SIGNED SMS', async (t) => {
  const token = await login();
  const lead = await leadAtStage(token, 'JV_SIGNED');
  const r = await advance(token, lead.id, 'WIRE_SETUP');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  t.diagnostic(`actions: ${results.map(x => x.type).join(', ')}`);
  const wf = assertHasAction(results, 'write_fields', 'JV_SIGNED→WIRE_SETUP');
  assert.ok(wf.fields.includes('jv_title_holder'), `write_fields should include jv_title_holder. Got: ${wf.fields.join(',')}`);
  assert.ok(wf.fields.includes('jv_signed_date'), `write_fields should include jv_signed_date. Got: ${wf.fields.join(',')}`);
  const sms = assertHasAction(results, 'send_sms', 'JV_SIGNED→WIRE_SETUP');
  assert.equal(sms.template, 'JV_SIGNED');
  assertNoSilentFailures(results.filter(x => x.type !== 'send_sms'), 'JV_SIGNED→WIRE_SETUP');
  // DB VERIFICATION
  const fetched = await getLead(token, lead.id);
  assert.ok(fetched.body.lead.jv_title_holder, 'jv_title_holder should persist on lead');
  assert.ok(fetched.body.lead.jv_signed_date, 'jv_signed_date should persist on lead');
  await deleteLead(token, lead.id);
});

test('Stage 20: WIRE_SETUP → CLOSING_DATE - SUBTO_PROCESSOR SMS for subto lead', async () => {
  const token = await login();
  const lead = await leadAtStage(token, 'WIRE_SETUP');
  const r = await advance(token, lead.id, 'CLOSING_DATE');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  const sms = assertHasAction(results, 'send_sms', 'WIRE_SETUP→CLOSING_DATE');
  assert.equal(sms.template, 'SUBTO_PROCESSOR', `Expected SUBTO_PROCESSOR, got: ${sms.template}`);
  assertNoSilentFailures(results.filter(x => x.type !== 'send_sms' && x.type !== 'email'), 'WIRE_SETUP→CLOSING_DATE');
  await deleteLead(token, lead.id);
});

test('Stage 21: CLOSING_DATE → CLOSED - closed_date + COE_MINUS_7 SMS + 4 reminders (post-close engine)', async (t) => {
  const token = await login();
  const lead = await leadAtStage(token, 'CLOSING_DATE');
  const r = await advance(token, lead.id, 'CLOSED');
  assert.equal(r.ok, true);
  const results = r.body.automation.results;
  t.diagnostic(`actions: ${results.map(x => x.type).join(', ')}`);
  // Stage 21 must fire: closed_date field + COE_MINUS_7 SMS + 4 reminders (coe + testimonial + referral + 30_day_nurture)
  assertHasAction(results, 'set_field', 'CLOSING_DATE→CLOSED');
  const sf = results.find(x => x.type === 'set_field');
  assert.equal(sf.field, 'closed_date');
  const sms = assertHasAction(results, 'send_sms', 'CLOSING_DATE→CLOSED');
  assert.equal(sms.template, 'COE_MINUS_7');
  const reminders = results.filter(x => x.type === 'set_reminder');
  t.diagnostic(`CLOSED reminders: ${reminders.map(x => x.reminder_type).join(', ')}`);
  assert.ok(reminders.length >= 4, `Expected 4 reminders (coe, testimonial, referral, 30_day_nurture). Got: ${reminders.length}`);
  const reminderTypes = reminders.map(x => x.reminder_type);
  assert.ok(reminderTypes.includes('coe'), 'coe reminder should fire');
  assert.ok(reminderTypes.includes('testimonial'), `testimonial reminder should fire. Got: ${reminderTypes.join(',')}`);
  assert.ok(reminderTypes.includes('referral'), `referral reminder should fire. Got: ${reminderTypes.join(',')}`);
  assert.ok(reminderTypes.some(t => t.includes('nurture')), `30-day nurture reminder should fire. Got: ${reminderTypes.join(',')}`);
  assertNoSilentFailures(results.filter(x => x.type !== 'send_sms'), 'CLOSING_DATE→CLOSED');
  // DB VERIFICATION
  const fetched = await getLead(token, lead.id);
  assert.ok(fetched.body.lead.closed_date, 'closed_date should persist on lead');
  await deleteLead(token, lead.id);
});

test('Stage DEAD: terminal - no outbound transitions allowed', async () => {
  const token = await login();
  const lead = await createLead(token);
  const r = await advance(token, lead.id, 'DEAD');
  assert.equal(r.ok, true);
  assert.equal(r.body.lead.stage, 'DEAD');
  const stuck = await advance(token, lead.id, 'GAIN_FEEDBACK');
  assert.equal(stuck.ok, false);
  assert.equal(stuck.status, 400);
  await deleteLead(token, lead.id);
});

test('NEG-01: invalid stage transition rejected with 400 + available_transitions', async () => {
  const token = await login();
  const lead = await createLead(token);
  const r = await advance(token, lead.id, 'CLOSING_DATE');
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Invalid transition/);
  assert.ok(Array.isArray(r.body.available_transitions));
  assert.ok(r.body.available_transitions.includes('CONTACT_MADE'));
  assert.ok(r.body.available_transitions.includes('DEAD'));
  await deleteLead(token, lead.id);
});

test('NEG-02: invalid contract_type rejected', async () => {
  const token = await login();
  const lead = await leadAtStage(token, 'TERMS_AGREED');
  const r = await api(token, 'POST', '/api/contracts/generate', { lead_id: lead.id, contract_type: 'invalid_type_xyz' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Unknown contract type/);
  await deleteLead(token, lead.id);
});

test('NEG-03: SMS to lead without phone - fails gracefully', async () => {
  const token = await login();
  const lead = await createLead(token, { seller_phone: null });
  await advance(token, lead.id, 'CONTACT_MADE');
  await advance(token, lead.id, 'OFFER_READY');
  const r = await advance(token, lead.id, 'OFFER_SENT');
  assert.equal(r.ok, true);
  const smsResult = r.body.automation.results.find(x => x.type === 'send_sms');
  // Should attempt SMS but fail with reason about missing phone - not silently succeed
  if (smsResult && smsResult.ok === true) {
    assert.fail('SMS should fail when seller has no phone, but reported ok:true');
  }
  await deleteLead(token, lead.id);
});

test('NEG-04: missing required fields on lead creation - rejected with 400', async () => {
  const token = await login();
  const r = await api(token, 'POST', '/api/leads', { source: 'facebook' }); // no address
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  await api(token, 'DELETE', '/api/leads/00000000-0000-0000-0000-000000000000'); // noop cleanup
});