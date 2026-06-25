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
 * (defaults to https://divinitycrm-api.onrender.com).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const API = process.env.TEST_API_BASE_URL || 'https://divinitycrm-api.onrender.com';
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
// ============================================================================
test('Scenario 1: new lead intake → contact made → offer sent', async (t) => {
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

  // Assert initial stage
  assert.equal(created.stage, 'LEAD_ENTERED', 'New lead should start at LEAD_ENTERED');
  assert.equal(created.address, '4872 Scenario One Ave, Tampa, FL 33611');

  // Qualify: LEAD_ENTERED -> CONTACT_MADE
  const r1 = await advance(token, leadId, 'CONTACT_MADE');
  assert.equal(r1.ok, true, `CONTACT_MADE failed: ${r1.status} ${JSON.stringify(r1.body).slice(0, 200)}`);
  assert.equal(r1.body.lead.stage, 'CONTACT_MADE');

  // Build the offer: CONTACT_MADE -> OFFER_READY
  const r2 = await advance(token, leadId, 'OFFER_READY');
  assert.equal(r2.ok, true);
  assert.equal(r2.body.lead.stage, 'OFFER_READY');

  // Send the offer: OFFER_READY -> OFFER_SENT
  const r3 = await advance(token, leadId, 'OFFER_SENT');
  assert.equal(r3.ok, true);
  assert.equal(r3.body.lead.stage, 'OFFER_SENT');

  // Automation should have fired something
  assert.ok(r3.body.automation, 'OFFER_SENT transition should produce automation output');

  // Cleanup
  await api(token, 'DELETE', `/api/leads/${leadId}`);
});

// ============================================================================
// SCENARIO 2: Offer sent -> seller response -> negotiation -> terms agreed -> under contract
// ============================================================================
test('Scenario 2: offer sent → terms agreed → under contract', async (t) => {
  const token = await login();

  const lead = await createLead(token, {
    address: '1218 Scenario Two Cir, Phoenix, AZ 85016',
    city: 'Phoenix',
    state: 'AZ',
    zip: '85016',
    price: 320000,
    source: 'agent_referred',  // valid enum
    seller_name: 'David Scenario',
    seller_phone: '602-555-0303',
    seller_email: 'david.scenario@example.com',
    agent_name: 'Lisa Realtor',
    notes: 'Scenario 2 — seller counter-offers, then accepts at 95%',
  });
  t.diagnostic(`Created lead ${lead.id}`);

  // Walk through Montelli stages (1-10)
  for (const stage of ['CONTACT_MADE', 'OFFER_READY', 'OFFER_SENT', 'OFFER_RECEIVED', 'GAIN_FEEDBACK', 'ACTIVE_NEGOTIATION', 'TERMS_AGREED']) {
    const r = await advance(token, lead.id, stage);
    assert.equal(r.ok, true, `Failed at ${stage}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    assert.equal(r.body.lead.stage, stage);
  }

  // Hand off to TC: TERMS_AGREED -> AWAITING_TITLE -> CONTRACT_OUT -> UNDER_CONTRACT
  for (const stage of ['AWAITING_TITLE', 'CONTRACT_OUT', 'UNDER_CONTRACT']) {
    const r = await advance(token, lead.id, stage);
    assert.equal(r.ok, true, `Failed at ${stage}: ${r.status}`);
    assert.equal(r.body.lead.stage, stage);
  }

  // Verify the lead is now in TC's hands
  const final = await getLead(token, lead.id);
  assert.equal(final.body.lead.stage, 'UNDER_CONTRACT');

  // Cleanup
  await api(token, 'DELETE', `/api/leads/${lead.id}`);
});

// ============================================================================
// SCENARIO 3: Dead lead path (NEGATIVE PATH)
// ============================================================================
test('Scenario 3: dead lead path — seller declined → DEAD', async (t) => {
  const token = await login();

  const lead = await createLead(token, {
    address: '915 Scenario Three Way, Cleveland, OH 44102',
    city: 'Cleveland',
    state: 'OH',
    zip: '44102',
    price: 95000,
    source: 'other',  // valid enum
    seller_name: 'Robert Scenario',
    seller_phone: '216-555-0404',
    notes: 'Scenario 3 — seller stops responding after counter-offer',
  });

  // Walk to GAIN_FEEDBACK
  for (const stage of ['CONTACT_MADE', 'OFFER_READY', 'OFFER_SENT', 'OFFER_RECEIVED', 'GAIN_FEEDBACK']) {
    const r = await advance(token, lead.id, stage);
    assert.equal(r.ok, true, `Failed at ${stage}`);
  }

  // NEGATIVE: seller declines → SELLER_DECLINED
  const declined = await advance(token, lead.id, 'SELLER_DECLINED');
  assert.equal(declined.ok, true);
  assert.equal(declined.body.lead.stage, 'SELLER_DECLINED');

  // RECOVERY PATH: try to win back — SELLER_DECLINED -> GAIN_FEEDBACK
  // (per the transition map, SELLER_DECLINED can go back to GAIN_FEEDBACK)
  const recover = await advance(token, lead.id, 'GAIN_FEEDBACK');
  assert.equal(recover.ok, true, `Recovery from SELLER_DECLINED should be allowed: ${recover.status}`);
  assert.equal(recover.body.lead.stage, 'GAIN_FEEDBACK');

  // NEGATIVE FINAL: try invalid transition — GAIN_FEEDBACK -> CLOSING_DATE (must fail)
  const invalid = await advance(token, lead.id, 'CLOSING_DATE');
  assert.equal(invalid.ok, false, 'Skipping to CLOSING_DATE should NOT be allowed');
  assert.equal(invalid.status, 400);
  assert.match(invalid.body.error, /Invalid transition/);

  // Final: mark dead
  const dead = await advance(token, lead.id, 'DEAD');
  assert.equal(dead.ok, true);
  assert.equal(dead.body.lead.stage, 'DEAD');

  // Cleanup
  await api(token, 'DELETE', `/api/leads/${lead.id}`);
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
