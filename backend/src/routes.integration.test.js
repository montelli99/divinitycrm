const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const TELEPROMPTER_GHL_SMS = path.join(path.resolve(path.join(ROOT, 'src/routes'), '../../../../ghl-automations/modules'), 'sms-templates.js');

function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    redirectUrl: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    redirect(url) {
      this.redirectUrl = url;
      return this;
    },
  };
}

function findRoute(router, method, routePath) {
  const layer = router.stack.find(item => item.route && item.route.path === routePath && item.route.methods[method]);
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);
  const routeLayer = layer.route.stack[layer.route.stack.length - 1];
  return routeLayer.handle;
}

async function callRoute(router, method, routePath, { params = {}, query = {}, body = {}, user = { userId: 'user-1' }, headers = {}, runtimeMocks = {} } = {}) {
  const req = { params, query, body, user, headers };
  const res = makeRes();
  const next = err => { if (err) throw err; };
  const handler = findRoute(router, method, routePath);
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(runtimeMocks, request)) return runtimeMocks[request];
    return originalLoad.apply(this, arguments);
  };
  try {
    await handler(req, res, next);
  } finally {
    Module._load = originalLoad;
  }
  return res;
}

function loadRouter(routeRelPath, mocks = {}) {
  const resolvedRoute = path.join(ROOT, routeRelPath);
  const originalLoad = Module._load;
  const routeModulePath = require.resolve(resolvedRoute);

  delete require.cache[routeModulePath];
  for (const mockPath of Object.keys(mocks)) {
    try {
      delete require.cache[require.resolve(mockPath, { paths: [path.dirname(routeModulePath)] })];
    } catch {}
  }

  Module._load = function(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.apply(this, arguments);
  };

  try {
    return require(resolvedRoute);
  } finally {
    Module._load = originalLoad;
  }
}

test('script prompts routes return canonical stage shortcut', async () => {
  const queryCalls = [];
  const router = loadRouter('src/routes/script-prompts.js', {
    '../db/connection': {
      query: async (sql, params) => {
        queryCalls.push({ sql, params });
        if (sql.includes('FROM users')) return [{ id: 'user-1' }];
        if (sql.includes('FROM leads')) return [{ id: 'lead-1', user_id: 'user-1', stage: 'OFFER_SENT', seller_name: 'Jane Seller', address: '123 Main St' }];
        return [];
      },
    },
  });

  const stageRes = await callRoute(router, 'get', '/stage/:lead_id/:stage', { params: { lead_id: 'lead-1', stage: 'OFFER_SENT' } });
  assert.equal(stageRes.statusCode, 200);
  assert.equal(stageRes.body.stage, 'OFFER_SENT');
  assert.equal(stageRes.body.primaryShortcut.shortcut, 'GCJ');
  assert.equal(stageRes.body.scripts.length, 1);

  const fillRes = await callRoute(router, 'post', '/fill', { body: { lead_id: 'lead-1', shortcut: 'INT' } });
  assert.equal(fillRes.body.shortcut, 'INT');
  assert.match(fillRes.body.filled, /123 Main St/);

  const shortcutsRes = await callRoute(router, 'get', '/shortcuts');
  assert.ok(Array.isArray(shortcutsRes.body.shortcuts));
  assert.ok(shortcutsRes.body.shortcuts.length > 0);
  assert.ok(queryCalls.length >= 2);
});

test('lead transition route enforces allowed next stages', async () => {
  const automation = { automated: true, workflow: 'wf', owner: 'Montelli' };
  const router = loadRouter('src/routes/leads.js', {
    '../db/connection': {
      query: async (sql, params) => {
        if (sql.includes('SELECT * FROM leads WHERE id = $1 AND user_id = $2')) return [{ id: 'lead-1', user_id: 'user-1', stage: 'LEAD_ENTERED' }];
        if (sql.includes('UPDATE leads SET stage = $1 WHERE id = $2 RETURNING *')) return [{ id: 'lead-1', stage: params[0] }];
        if (sql.includes('SELECT * FROM lead_history')) return [];
        if (sql.includes('SELECT * FROM reminders')) return [];
        return [];
      },
    },
    '../services/stage-automations': {
      executeStageAutomations: async () => automation,
      getAvailableTransitions: () => ['CONTACT_MADE', 'DEAD'],
    },
  });

  const transitionsRes = await callRoute(router, 'get', '/:id/transitions', { params: { id: 'lead-1' } });
  assert.deepEqual(transitionsRes.body.available_transitions, ['CONTACT_MADE', 'DEAD']);

  const advanceRes = await callRoute(router, 'post', '/:id/advance', { params: { id: 'lead-1' }, body: { to_stage: 'CONTACT_MADE' } });
  assert.equal(advanceRes.body.lead.stage, 'CONTACT_MADE');
  assert.equal(advanceRes.body.automation.workflow, 'wf');
});

test('users stats routes return current pipeline stage counts', async () => {
  const router = loadRouter('src/routes/users.js', {
    '../db/connection': {
      query: async (sql, params) => {
        if (sql.includes('SELECT role FROM users WHERE id = $1')) return [{ role: 'admin' }];
        if (sql.includes('FROM users u') && sql.includes('COUNT(l.id) AS total_leads')) {
          return [{ id: 'student-1', email: 'student@example.com', first_name: 'Stu', last_name: 'Dent', role: 'student', created_at: new Date().toISOString(), total_leads: 3, active_leads: 2, offers_sent: 1, deals_closed: 1, deals_lost: 0, new_leads: 1, qualified_leads: 1, loi_leads: 1, under_contract: 1, last_activity: new Date().toISOString() }];
        }
        if (sql.includes('SELECT id, email, first_name, last_name, role, created_at FROM users WHERE id = $1')) return [{ id: 'student-1', email: 'student@example.com', first_name: 'Stu', last_name: 'Dent', role: 'student', created_at: new Date().toISOString() }];
        if (sql.includes('SELECT stage, COUNT(*) as count FROM leads WHERE user_id = $1 GROUP BY stage ORDER BY count DESC')) return [
          { stage: 'LEAD_ENTERED', count: 1 },
          { stage: 'CONTACT_MADE', count: 1 },
          { stage: 'OFFER_SENT', count: 1 },
          { stage: 'GAIN_FEEDBACK', count: 1 },
          { stage: 'CLOSED', count: 1 },
        ];
        if (sql.includes('SELECT source, COUNT(*) as count FROM leads WHERE user_id = $1 GROUP BY source ORDER BY count DESC')) return [{ source: 'referral', count: 2 }];
        if (sql.includes('SELECT a.*, l.address')) return [];
        if (sql.includes('COUNT(*) AS total_leads')) return [{ total_leads: 5, active: 3, closed: 1, dead: 1, avg_days_to_close: 12 }];
        return [];
      },
    },
  });

  const rosterRes = await callRoute(router, 'get', '/students', {});
  assert.equal(rosterRes.body.success, true);
  assert.equal(rosterRes.body.students[0].offers_sent, 1);

  const statsRes = await callRoute(router, 'get', '/students/:id/stats', { params: { id: 'student-1' } });
  assert.equal(statsRes.body.success, true);
  assert.equal(statsRes.body.pipelineProgress.step11_followup, 1);
  assert.equal(statsRes.body.stats.conversion_rate, 50);
});

test('contract routes generate and hand off contracts', async () => {
  const calls = [];
  const router = loadRouter('src/routes/contracts.js', {
    '../db/connection': {
      query: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes('SELECT * FROM leads WHERE id = $1 AND user_id = $2')) return [{ id: 'lead-1', user_id: 'user-1', stage: 'TERMS_AGREED', address: '123 Main St', city: 'Austin', state: 'TX', zip: '78701', apn: 'APN123', price: 250000, seller_name: 'Jane Seller', seller_email: 'jane@example.com', seller_phone: '555-111-2222', existing_loan_balance: 180000, existing_loan_rate: 0.045, contract_type: 'subto' }];
        if (sql.includes('INSERT INTO contracts')) return [{ id: 'contract-1' }];
        if (sql.includes('UPDATE leads SET')) return [{ id: 'lead-1' }];
        if (sql.includes('INSERT INTO activity_log')) return [];
        return [];
      },
    },
    '../services/stage-automations': {
      executeStageAutomations: async () => ({ automated: true, workflow: 'contract', owner: 'TC' }),
      getAvailableTransitions: () => ['UNDER_CONTRACT'],
    },
  });

  const templateRes = await callRoute(router, 'post', '/generate-from-template', {
    body: { lead_id: 'lead-1', template_id: 'PSA_CREATIVE_SUBTO' },
  });
  assert.equal(templateRes.body.success, true);
  assert.equal(templateRes.body.template.id, 'PSA_CREATIVE_SUBTO');

  const generateRes = await callRoute(router, 'post', '/generate', {
    body: { lead_id: 'lead-1', contract_type: 'subto' },
  });
  assert.equal(generateRes.body.formatted.includes('123 Main St'), true);
  assert.equal(generateRes.body.automation.workflow, 'contract');
  assert.ok(calls.some(call => call.sql.includes('INSERT INTO contracts')));
});

test('pipeline stats and health routes respond with aggregated data', async () => {
  const router = loadRouter('src/routes/pipeline.js', {
    '../db/connection': {
      query: async (sql, params) => {
        if (sql.includes('SELECT * FROM leads')) return [
          { id: 'lead-1', stage: 'OFFER_SENT', address: '123 Main St', price: 250000, seller_name: 'Jane Seller', last_stage_change_at: new Date(Date.now() - 3 * 86400000).toISOString(), recommended_strategy: 'f50', contract_type: 'stack50', rabbitsign_status: 'sent', follow_up_48hr_done: false, follow_up_48hr_due: new Date(Date.now() - 86400000).toISOString(), estimated_profit: 20000, cash_flow: 300, dscr: 1.3, coe_date: new Date(Date.now() + 10 * 86400000).toISOString() },
        ];
        if (sql.includes('COUNT(*) AS total')) return [{ total: 1, active: 1, closed: 0, dead: 0, avg_days_to_close: null, added_today: 1 }];
        if (sql.includes('FROM reminders r')) return [];
        if (sql.includes('SELECT source, COUNT(*) AS count FROM leads')) return [{ source: 'referral', count: 1 }];
        if (sql.includes('SELECT stage, COUNT(*) AS count FROM leads')) return [{ stage: 'OFFER_SENT', count: 1 }];
        if (sql.includes('FROM leads WHERE user_id = $1 AND stage =')) return [];
        if (sql.includes('FROM reminders r') && sql.includes('due_date::date <= $2')) return [];
        if (sql.includes('FROM reminders r') && sql.includes('r.completed = false')) return [];
        if (sql.includes('COUNT(*) AS total')) return [{ total: 1, active: 1, closed: 0, dead: 0, avg_days_to_close: null, added_today: 1 }];
        return [];
      },
    },
    '../services/pipeline-monitor': {
      scanPipeline: async () => ({ stats: { total: 1 }, alerts: [], anomalies: [], remindersDue: [], scannedAt: new Date().toISOString() }),
      formatReport: result => `scanned:${result.stats.total}`,
      getStalledLeads: async () => [],
      getOverdueFollowUps: async () => [],
    },
    '../services/dispo-tracker': {
      getDispositions: async () => ({ dispositions: [], total: 0 }),
      getDispoSummary: async () => ({ total: 0 }),
      createDispoRecord: async payload => payload,
      transitionDispoStatus: async () => ({ ok: true }),
      assignBuyer: async () => ({ ok: true }),
    },
    '../services/post-close-engine': {
      registerPostClose: async () => ({ registered: true }),
      sendTestimonialRequest: async () => ({ sent: true }),
      sendReferralRequest: async () => ({ sent: true }),
      runPokemonSpawn: async () => ({ spawned: true }),
      tick: async () => ({ processed: true }),
      getPostCloseStatus: async () => ({ leadId: 'lead-1', status: 'ok' }),
    },
  });

  const statsRes = await callRoute(router, 'get', '/stats', {});
  assert.equal(statsRes.body.total, 1);
  assert.equal(statsRes.body.by_source[0].source, 'referral');

  const healthRes = await callRoute(router, 'get', '/health', {
    runtimeMocks: {
      '../services/pipeline-monitor': {
        scanPipeline: async () => ({ stats: { total: 1 }, alerts: [], anomalies: [], remindersDue: [], scannedAt: new Date().toISOString() }),
        formatReport: result => `scanned:${result.stats.total}`,
      },
    },
  });
  assert.equal(healthRes.body.success, true);
  assert.equal(healthRes.body.report, 'scanned:1');
});

test('teleprompter routes return filled shortcuts and log sends', async () => {
  const router = loadRouter('src/routes/teleprompter.js', {
    '../db/connection': {
      query: async (sql, params) => {
        if (sql.includes('FROM leads WHERE id = $1')) return [{ address: '123 Main St', city: 'Austin', state: 'TX', zip: '78701', seller_name: 'Jane Seller', seller_phone: '555-111-2222', seller_email: 'jane@example.com', agent_name: 'Agent A', agent_phone: '555-333-4444', agent_email: 'agent@example.com', price: 250000, contract_type: 'subto', condition: 'turnkey', psa_signed_date: null, coe_date: null, inspection_end_date: null, inspection_period_days: 14, emd_amount: 100, title_company: 'Close Title', title_company_email: 'title@example.com', title_company_phone: '555-555-5555', tc_name: 'TC', tc_email: 'tc@example.com', tc_phone: '555-666-7777', llc_name: 'Divinity LLC' }];
        if (sql.includes('INSERT INTO activity_log')) return [];
        return [];
      },
    },
    '../services/script-prompts': {
      ...require('./services/script-prompts.js'),
    },
    [TELEPROMPTER_GHL_SMS]: {
      fillSellerUpdate: (key, data) => ({ name: key, body: `ghl:${key}:${data['Property Address'] || ''}`, unfilled: [], stage: key, recipient: 'seller' }),
    },
  });

  const stagesRes = await callRoute(router, 'get', '/stages', {});
  assert.ok(Array.isArray(stagesRes.body.stages));

  const shortcutRes = await callRoute(router, 'get', '/shortcuts/:source/:key', {
    params: { source: 'crm', key: 'INT' },
    query: { lead_id: 'lead-1' },
  });
  assert.equal(shortcutRes.body.source, 'crm');
  assert.equal(shortcutRes.body.key, 'INT');
  assert.match(shortcutRes.body.body, /123 Main St/);

  const markSentRes = await callRoute(router, 'post', '/mark-sent', {
    body: { lead_id: 'lead-1', source: 'crm', key: 'INT', body: 'hello', recipient: 'Jane Seller', channel: 'sms' },
  });
  assert.equal(markSentRes.body.ok, true);
});
