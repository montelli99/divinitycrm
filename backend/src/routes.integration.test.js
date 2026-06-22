const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { Webhook } = require('standardwebhooks');

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
  const req = { method: method.toUpperCase(), params, query, body, user, headers };
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

test('under contract stage no longer shows the previous inspection SMS shortcut', async () => {
  const router = loadRouter('src/routes/script-prompts.js', {
    '../db/connection': {
      query: async (sql, params) => {
        if (sql.includes('FROM users')) return [{ id: 'user-1' }];
        if (sql.includes('FROM leads')) return [{ id: 'lead-1', user_id: 'user-1', stage: 'UNDER_CONTRACT', seller_name: 'Jane Seller', address: '123 Main St' }];
        return [];
      },
    },
  });

  const stageRes = await callRoute(router, 'get', '/stage/:lead_id/:stage', {
    params: { lead_id: 'lead-1', stage: 'UNDER_CONTRACT' },
  });

  assert.equal(stageRes.statusCode, 200);
  assert.equal(stageRes.body.primaryShortcut, null);
  assert.deepEqual(stageRes.body.scripts, []);
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

test('pipeline stats return zero conversion when no closed or dead deals exist', async () => {
  const router = loadRouter('src/routes/pipeline.js', {
    '../db/connection': {
      query: async sql => {
        if (sql.includes('COUNT(*) AS total')) return [{ total: 1, active: 1, closed: 0, dead: 0, avg_days_to_close: null }];
        if (sql.includes('GROUP BY source')) return [{ source: 'other', count: 1 }];
        if (sql.includes('GROUP BY stage')) return [{ stage: 'LEAD_ENTERED', count: 1 }];
        return [];
      },
    },
  });

  const statsRes = await callRoute(router, 'get', '/stats', {});
  assert.equal(statsRes.statusCode, 200);
  assert.equal(statsRes.body.conversion_rate, 0);
});

test('users stats routes return current pipeline stage counts', async () => {
  const router = loadRouter('src/routes/users.js', {
    '../db/connection': {
      query: async (sql, params) => {
        if (sql.includes('SELECT role') && sql.includes('FROM users WHERE id = $1')) return [{ role: 'admin' }];
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

test('team members can view student funnels', async () => {
  const router = loadRouter('src/routes/users.js', {
    '../db/connection': {
      query: async (sql, params) => {
        if (sql.includes('SELECT role, email FROM users WHERE id = $1')) return [{ role: 'closer', email: 'homewithkaylamauser@gmail.com' }];
        if (sql.includes('FROM users u') && sql.includes('COUNT(l.id) AS total_leads')) {
          return [{ id: 'student-1', email: 'student@example.com', first_name: 'Stu', last_name: 'Dent', role: 'student', created_at: new Date().toISOString(), total_leads: 2, active_leads: 1, offers_sent: 1, deals_closed: 0, deals_lost: 0, new_leads: 1, qualified_leads: 0, loi_leads: 1, under_contract: 0, last_activity: new Date().toISOString() }];
        }
        if (sql.includes('SELECT id, email, first_name, last_name, role, created_at FROM users WHERE id = $1')) return [{ id: 'student-1', email: 'student@example.com', first_name: 'Stu', last_name: 'Dent', role: 'student', created_at: new Date().toISOString() }];
        if (sql.includes('SELECT stage, COUNT(*) as count FROM leads WHERE user_id = $1 GROUP BY stage ORDER BY count DESC')) return [{ stage: 'OFFER_SENT', count: 1 }];
        if (sql.includes('SELECT source, COUNT(*) as count FROM leads WHERE user_id = $1 GROUP BY source ORDER BY count DESC')) return [{ source: 'referral', count: 1 }];
        if (sql.includes('SELECT a.*, l.address')) return [];
        if (sql.includes('COUNT(*) AS total_leads')) return [{ total_leads: 2, active: 1, closed: 0, dead: 0, avg_days_to_close: null }];
        return [];
      },
    },
  });

  const rosterRes = await callRoute(router, 'get', '/students', { user: { userId: 'closer-1' } });
  assert.equal(rosterRes.body.success, true);
  assert.equal(rosterRes.body.students[0].email, 'student@example.com');

  const detailRes = await callRoute(router, 'get', '/students/:id/stats', { params: { id: 'student-1' }, user: { userId: 'closer-1' } });
  assert.equal(detailRes.body.success, true);
  assert.equal(detailRes.body.pipelineProgress.step10_offer_sent, 1);
});

test('contract routes generate and hand off contracts', async () => {
  const calls = [];
  const router = loadRouter('src/routes/contracts.js', {
    '../db/connection': {
      query: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes('SELECT role, email FROM users WHERE id = $1')) return [{ role: 'student', email: 'student@example.com' }];
        if (sql.includes('SELECT * FROM leads WHERE id = $1')) return [{ id: 'lead-1', user_id: 'user-1', stage: 'TERMS_AGREED', address: '123 Main St', city: 'Austin', state: 'TX', zip: '78701', apn: 'APN123', price: 250000, seller_name: 'Jane Seller', seller_email: 'jane@example.com', seller_phone: '555-111-2222', existing_loan_balance: 180000, existing_loan_rate: 0.045, contract_type: 'subto' }];
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

test('team viewers can generate shared contracts and RabbitSign envelopes', async () => {
  const router = loadRouter('src/routes/contracts.js', {
    '../db/connection': {
      query: async (sql, params) => {
        if (sql.includes('SELECT role, email FROM users WHERE id = $1')) return [{ role: 'closer', email: 'homewithkaylamauser@gmail.com' }];
        if (sql.includes('SELECT * FROM leads WHERE id = $1')) return [{ id: 'lead-2', user_id: 'owner-1', stage: 'TERMS_AGREED', address: '456 Oak Ave', city: 'Austin', state: 'TX', zip: '78702', apn: 'APN456', price: 300000, seller_name: 'Jane Seller', seller_email: 'jane@example.com', seller_phone: '555-111-2222', existing_loan_balance: 180000, existing_loan_rate: 0.045, contract_type: 'subto' }];
        if (sql.includes('INSERT INTO contracts')) return [{ id: 'contract-2' }];
        if (sql.includes('UPDATE leads SET')) return [{ id: 'lead-2' }];
        if (sql.includes('INSERT INTO activity_log')) return [];
        return [];
      },
    },
    '../services/stage-automations': {
      executeStageAutomations: async () => ({ automated: true, workflow: 'contract', owner: 'TC' }),
      getAvailableTransitions: () => ['UNDER_CONTRACT'],
    },
  });

  const genRes = await callRoute(router, 'post', '/generate-from-template', {
    body: { lead_id: 'lead-2', template_id: 'PSA_CREATIVE_SUBTO' },
    user: { userId: 'closer-1' },
  });
  assert.equal(genRes.statusCode, 200);
  assert.equal(genRes.body.contract.id, 'contract-2');

  const rsRes = await callRoute(router, 'post', '/send-rabbitsign', {
    body: { leadId: 'lead-2', contractType: 'SubTo' },
    user: { userId: 'closer-1' },
    runtimeMocks: {
      '../services/rabbitsign': {
        isConfigured: () => true,
        createContractEnvelope: async (lead, contractType) => ({ folderId: `folder-${lead.id}`, status: contractType }),
        getFolderStatus: async () => ({}),
      },
    },
  });
  assert.equal(rsRes.statusCode, 200);
  assert.equal(rsRes.body.folderId, 'folder-lead-2');
});

test('lead managers can assign new leads on upload', async () => {
  const router = loadRouter('src/routes/leads.js', {
    '../db/connection': {
      query: async (sql, params) => {
        if (sql.includes('SELECT role, email FROM users WHERE id = $1')) return [{ role: 'lead_manager', email: 'manager@example.com' }];
        if (sql.includes('SELECT id, role FROM users WHERE id = $1') && params?.[0] === 'student-1') return [{ id: 'student-1', role: 'student' }];
        if (sql.includes('INSERT INTO leads')) return [{ id: 'lead-1', user_id: params?.[1] }];
        if (sql.includes('INSERT INTO activity_log')) return [];
        return [];
      },
    },
    '../services/stage-automations': {
      executeStageAutomations: async () => null,
      getAvailableTransitions: () => ['CONTACT_MADE'],
    },
  });

  const createRes = await callRoute(router, 'post', '/', {
    body: { address: '123 Main St', assigned_user_id: 'student-1' },
    user: { userId: 'manager-1' },
  });

  assert.equal(createRes.statusCode, 201);
  assert.equal(createRes.body.lead.user_id, 'student-1');
});

test('team viewers can open shared lead detail and stage scripts', async () => {
  const router = loadRouter('src/routes/leads.js', {
    '../db/connection': {
      query: async (sql, params) => {
        if (sql.includes('SELECT role, email FROM users WHERE id = $1')) return [{ role: 'closer', email: 'homewithkaylamauser@gmail.com' }];
        if (sql.includes('SELECT * FROM leads WHERE id = $1')) return [{ id: 'lead-1', user_id: 'owner-1', stage: 'CONTACT_MADE', address: '123 Main St' }];
        if (sql.includes('SELECT * FROM lead_history')) return [];
        if (sql.includes('SELECT * FROM reminders')) return [];
        return [];
      },
    },
  });

  const detailRes = await callRoute(router, 'get', '/:id', { params: { id: 'lead-1' }, user: { userId: 'closer-1' } });
  assert.equal(detailRes.statusCode, 200);
  assert.equal(detailRes.body.lead.id, 'lead-1');

  const promptsRouter = loadRouter('src/routes/script-prompts.js', {
    '../db/connection': {
      query: async (sql, params) => {
        if (sql.includes('SELECT role, email FROM users WHERE id = $1')) return [{ role: 'closer', email: 'homewithkaylamauser@gmail.com' }];
        if (sql.includes('SELECT * FROM leads WHERE id = $1')) return [{ id: 'lead-1', user_id: 'owner-1', stage: 'CONTACT_MADE', address: '123 Main St', seller_name: 'Jane Seller' }];
        return [];
      },
    },
  });

  const promptRes = await callRoute(promptsRouter, 'get', '/stage/:lead_id/:stage', {
    params: { lead_id: 'lead-1', stage: 'CONTACT_MADE' },
    user: { userId: 'closer-1' },
  });

  assert.equal(promptRes.statusCode, 200);
  assert.equal(promptRes.body.lead_id, 'lead-1');
});

test('bulk lead import maps fields and assigns leads to students', async () => {
  const router = loadRouter('src/routes/leads.js', {
    '../db/connection': {
      query: async (sql, params) => {
        if (sql.includes('SELECT role, email FROM users WHERE id = $1')) return [{ role: 'lead_manager', email: 'manager@example.com' }];
        if (sql.includes('SELECT id, role FROM users WHERE id = $1') && params?.[0] === 'student-1') return [{ id: 'student-1', role: 'student' }];
        if (sql.includes('INSERT INTO leads')) return [{ id: 'lead-1', user_id: params?.[1], address: params?.[2], city: params?.[3], state: params?.[4], price: params?.[6] }];
        if (sql.includes('INSERT INTO activity_log')) return [];
        return [];
      },
    },
    '../services/stage-automations': {
      executeStageAutomations: async () => null,
      getAvailableTransitions: () => ['CONTACT_MADE'],
    },
  });

  const res = await callRoute(router, 'post', '/import', {
    user: { userId: 'manager-1' },
    body: {
      rows: [{ street: '123 Main St', town: 'Austin', region: 'TX', sale_price: '250000' }],
      fieldMap: { address: 'street', city: 'town', state: 'region', price: 'sale_price' },
      defaultAssignedUserId: 'student-1',
      source: 'referral',
    },
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.created, 1);
  assert.equal(res.body.leads[0].user_id, 'student-1');
  assert.equal(res.body.leads[0].price, 250000);
});

test('lead updates still succeed when automation fails', async () => {
  const router = loadRouter('src/routes/leads.js', {
    '../db/connection': {
      query: async (sql, params) => {
        if (sql.includes('SELECT id, stage FROM leads WHERE id = $1 AND user_id = $2')) return [{ id: 'lead-1', stage: 'LEAD_ENTERED' }];
        if (sql.includes('UPDATE leads SET')) return [{ id: 'lead-1', stage: params[0] }];
        if (sql.includes('INSERT INTO activity_log')) return [];
        return [];
      },
    },
    '../services/stage-automations': {
      executeStageAutomations: async () => { throw new Error('has undefined'); },
      getAvailableTransitions: () => ['CONTACT_MADE', 'DEAD'],
    },
  });

  const res = await callRoute(router, 'patch', '/:id', {
    params: { id: 'lead-1' },
    body: { stage: 'CONTACT_MADE', notes: 'updated' },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.lead.stage, 'CONTACT_MADE');
  assert.equal(res.body.automation.error, 'has undefined');
});

test('profile scheduling link saves through users me patch', async () => {
  const router = loadRouter('src/routes/users.js', {
    '../db/connection': {
      query: async (sql, params) => {
        if (sql.includes('UPDATE users') && sql.includes('scheduling_link')) {
          return [{ id: 'user-1', email: 'student@example.com', scheduling_link: params[2] }];
        }
        return [];
      },
    },
  });

  const res = await callRoute(router, 'patch', '/me', {
    body: { scheduling_link: 'https://cal.example.com/30' },
    user: { userId: 'user-1' },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.scheduling_link, 'https://cal.example.com/30');
});

test('rabbit sign route passes normalized contract type and lead record', async () => {
  const calls = [];
  const router = loadRouter('src/routes/contracts.js', {
    '../db/connection': {
      query: async (sql, params) => {
        if (sql.includes('SELECT role, email FROM users WHERE id = $1')) return [{ role: 'student', email: 'student@example.com' }];
        if (sql.includes('SELECT * FROM leads WHERE id = $1')) return [{ id: 'lead-1', user_id: 'user-1', stage: 'TERMS_AGREED', address: '123 Main St', city: 'Austin', state: 'TX', zip: '78701', price: 250000, contract_type: 'subto' }];
        return [];
      },
    },
  });

  const res = await callRoute(router, 'post', '/send-rabbitsign', {
    body: { leadId: 'lead-1', contractType: 'SubTo' },
    runtimeMocks: {
      '../services/rabbitsign': {
        isConfigured: () => true,
        createContractEnvelope: async (lead, contractType) => {
          calls.push({ lead, contractType });
          return { folderId: 'folder-1', status: 'sent' };
        },
        getFolderStatus: async () => ({}),
      },
    },
  });

  assert.equal(res.body.folderId, 'folder-1');
  assert.equal(calls[0].lead.id, 'lead-1');
  assert.equal(calls[0].contractType, 'subto');
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

test('auth routes handle login and google oauth flow', async () => {
  const router = loadRouter('src/routes/auth.js', {
    '../auth/auth': {
      login: async (email, password) => (email === 'user@example.com' && password === 'secret' ? { token: 'tok-123', user: { id: 'user-1', email } } : null),
      authMiddleware: (req, res, next) => { req.user = { userId: 'user-1' }; next(); },
    },
    '../services/google-oauth': {
      getAuthUrl: (redirectUri, state) => `https://google.example/auth?redirect=${encodeURIComponent(redirectUri)}&state=${state}`,
      handleCallback: async () => ({ tokens: { access_token: 'a', refresh_token: 'r' }, profile: { email: 'user@example.com', name: 'User', picture: 'pic' } }),
      saveGoogleTokens: async () => undefined,
      getGoogleStatus: async () => ({ connected: true, email: 'user@example.com' }),
      disconnectGoogle: async () => undefined,
    },
  });

  const badLogin = await callRoute(router, 'post', '/login', { body: { email: 'user@example.com' } });
  assert.equal(badLogin.statusCode, 400);

  const loginRes = await callRoute(router, 'post', '/login', { body: { email: 'user@example.com', password: 'secret' } });
  assert.equal(loginRes.body.token, 'tok-123');

  const googleUrlRes = await callRoute(router, 'get', '/google/url', {});
  assert.match(googleUrlRes.body.url, /google\.example/);

  const callbackRes = await callRoute(router, 'get', '/google/callback', { query: { code: 'code-123', state: Buffer.from(JSON.stringify({ userId: 'user-1' })).toString('base64') } });
  assert.equal(callbackRes.redirectUrl, 'http://localhost:5173/profile?google=connected');

  const statusRes = await callRoute(router, 'get', '/google/status', {});
  assert.equal(statusRes.body.connected, true);

  const disconnectRes = await callRoute(router, 'post', '/google/disconnect', {});
  assert.equal(disconnectRes.body.success, true);
});

test('calculator routes return analysis and persisted lead data', async () => {
  const router = loadRouter('src/routes/calculator.js', {
    '../db/connection': {
      query: async (sql, params) => {
        if (sql.includes('SELECT role, email FROM users WHERE id = $1')) return [{ role: 'student', email: 'student@example.com' }];
        if (sql.includes('UPDATE leads')) return [{ id: 'lead-1' }];
        if (sql.includes('INSERT INTO activity_log')) return [];
        if (sql.includes('FROM activity_log a') && sql.includes("underwriting_run")) {
          return [{ id: 'hist-1', user_id: 'user-1', lead_id: 'lead-1', action: 'underwriting_run', details: JSON.stringify({ recommended: 'Stack50', dscr: '1.40', cashFlow: 250 }), created_at: new Date().toISOString(), address: '123 Main St' }];
        }
        if (sql.includes('FROM leads') && sql.includes('WHERE id = $1')) {
          return [{ id: 'lead-1', user_id: 'user-1', address: '123 Main St', city: 'Austin', state: 'TX', zip: '78701', price: 250000, arv: 325000, beds: 3, baths: 2, sqft: 1800, condition: 'turnkey', repairs_estimate: 20000, cash_offer: 150000, f50_offer: 175000, subto_offer: 180000, recommended_strategy: 'stack50', one_percent_rule: true, dscr: 1.3, cash_flow: 450, existing_loan_balance: 180000, existing_loan_rate: 0.045, monthly_rent: 2500, has_hoa: false, has_pool: false, in_flood_zone: false, population: 12000, occupancy: 'occupied', source: 'referral', stage: 'OFFER_READY' }];
        }
        return [];
      },
    },
    '../services/calculator': {
      calculate: () => ({ structures: [{ offer: 111 }, { offer: 222 }, {}, {}, { offer: 333 }], metadata: { percRule: 1.1, dscr: 1.4, cashFlow: 250 } }),
      checkBuyBox: () => ({ allPass: true, failures: [] }),
      recommendStrategy: () => ({ strategy: 'Stack50' }),
    },
  });

  const badAnalyze = await callRoute(router, 'post', '/analyze', { body: { askingPrice: 250000 } });
  assert.equal(badAnalyze.statusCode, 400);

  const analyzeRes = await callRoute(router, 'post', '/analyze', { body: { arv: 325000, askingPrice: 250000, monthlyRent: 2500, leadId: 'lead-1' } });
  assert.equal(analyzeRes.body.success, true);
  assert.equal(analyzeRes.body.leadUpdated, true);

  const standaloneAnalyze = await callRoute(router, 'post', '/analyze', { body: { arv: 325000, askingPrice: 250000, monthlyRent: 2500 } });
  assert.equal(standaloneAnalyze.body.leadUpdated, false);
  assert.equal(standaloneAnalyze.body.savedToHistory, true);

  const buyboxRes = await callRoute(router, 'post', '/buybox', { body: { state: 'TX', population: 12000, hasHOA: false, hasPool: false, inFloodZone: false } });
  assert.equal(buyboxRes.body.success, true);
  assert.equal(buyboxRes.body.buyBox.allPass, true);

  const historyRes = await callRoute(router, 'get', '/history', {});
  assert.equal(historyRes.body.success, true);
  assert.equal(historyRes.body.history[0].address, '123 Main St');

  const leadRes = await callRoute(router, 'get', '/lead/:id', { params: { id: 'lead-1' } });
  assert.equal(leadRes.body.success, true);
  assert.equal(leadRes.body.lead.stage, 'OFFER_READY');
});

test('shared leads can load calculator data for team viewers', async () => {
  const router = loadRouter('src/routes/calculator.js', {
    '../db/connection': {
      query: async (sql, params) => {
        if (sql.includes('SELECT role, email FROM users WHERE id = $1')) return [{ role: 'closer', email: 'homewithkaylamauser@gmail.com' }];
        if (sql.includes('FROM leads') && sql.includes('WHERE id = $1')) return [{ id: 'lead-2', user_id: 'owner-1', address: '456 Oak Ave', city: 'Austin', state: 'TX', zip: '78702', price: 300000, arv: 375000, beds: 4, baths: 2, sqft: 2100, condition: 'turnkey', repairs_estimate: 10000, cash_offer: 180000, f50_offer: 195000, subto_offer: 205000, recommended_strategy: 'stack50', one_percent_rule: true, dscr: 1.4, cash_flow: 550, existing_loan_balance: 200000, existing_loan_rate: 0.047, monthly_rent: 3200, has_hoa: false, has_pool: false, in_flood_zone: false, population: 14000, occupancy: 'occupied', source: 'referral', stage: 'OFFER_READY' }];
        if (sql.includes('UPDATE leads')) return [{ id: 'lead-2' }];
        if (sql.includes('INSERT INTO activity_log')) return [];
        return [];
      },
    },
    '../services/calculator': {
      calculate: () => ({ structures: [{ offer: 111 }, { offer: 222 }, {}, {}, { offer: 333 }], metadata: { percRule: 1.1, dscr: 1.4, cashFlow: 250 } }),
      checkBuyBox: () => ({ allPass: true, failures: [] }),
      recommendStrategy: () => ({ strategy: 'Stack50' }),
    },
  });

  const leadRes = await callRoute(router, 'get', '/lead/:id', { params: { id: 'lead-2' }, user: { userId: 'closer-1' } });
  assert.equal(leadRes.statusCode, 200);
  assert.equal(leadRes.body.lead.address, '456 Oak Ave');

  const analyzeRes = await callRoute(router, 'post', '/analyze', {
    body: { arv: 375000, askingPrice: 300000, monthlyRent: 3200, leadId: 'lead-2' },
    user: { userId: 'closer-1' },
  });
  assert.equal(analyzeRes.statusCode, 200);
  assert.equal(analyzeRes.body.leadUpdated, true);
});

test('notifications routes list, count, and update inbox items', async () => {
  const actions = [];
  const router = loadRouter('src/routes/notifications.js', {
    '../auth/auth': { authMiddleware: (req, res, next) => next() },
    '../services/notifications': {
      getNotificationsForUser: async (userId, opts) => ({ notifications: [{ id: 'n-1', recipient_id: userId, title: `filter:${opts.filter}` }], unreadCount: 4 }),
      markRead: async (id, userId) => actions.push(['read', id, userId]),
      markAllRead: async userId => actions.push(['read-all', userId]),
      archive: async (id, userId) => actions.push(['archive', id, userId]),
    },
  });

  const listRes = await callRoute(router, 'get', '/', { query: { filter: 'unread', limit: 25 } });
  assert.equal(listRes.body.unreadCount, 4);
  assert.equal(listRes.body.notifications[0].title, 'filter:unread');

  const unreadCountRes = await callRoute(router, 'get', '/unread-count', {
    runtimeMocks: {
      '../db/connection': {
        query: async () => [{ count: '7' }],
      },
    },
  });
  assert.equal(unreadCountRes.body.count, 7);

  const readRes = await callRoute(router, 'post', '/:id/read', { params: { id: 'n-1' } });
  const readAllRes = await callRoute(router, 'post', '/read-all', {});
  const archiveRes = await callRoute(router, 'post', '/:id/archive', { params: { id: 'n-1' } });

  assert.equal(readRes.body.success, true);
  assert.equal(readAllRes.body.success, true);
  assert.equal(archiveRes.body.success, true);
  assert.deepEqual(actions, [['read', 'n-1', 'user-1'], ['read-all', 'user-1'], ['archive', 'n-1', 'user-1']]);
});

test('webhooks routes handle clerk and rabbitsign events', async () => {
  const queryCalls = [];
  const router = loadRouter('src/routes/webhooks.js', {
    '../db/connection': {
      query: async (sql, params) => {
        queryCalls.push({ sql, params });
        if (sql.includes('SELECT id, stage FROM leads WHERE rabbitsign_envelope_id = $1')) return [{ id: 'lead-1', stage: 'CONTRACT_OUT' }];
        return [];
      },
    },
    uuid: { v4: () => 'uuid-1' },
  });

  const clerkSecret = `whsec_${Buffer.from('clerk-test-secret').toString('base64')}`;
  const clerkWebhook = new Webhook(clerkSecret);
  const previousClerkSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  process.env.CLERK_WEBHOOK_SIGNING_SECRET = clerkSecret;

  try {
    const clerkCreateBody = { type: 'user.created', data: { id: 'clerk-1', email_addresses: [{ email_address: 'new@example.com' }], first_name: 'New', last_name: 'User', image_url: 'https://img.example/avatar.png' } };
    const clerkCreateTimestamp = Math.floor(Date.now() / 1000);
    const clerkCreateSignature = clerkWebhook.sign('msg-clerk-create', new Date(clerkCreateTimestamp * 1000), JSON.stringify(clerkCreateBody));

    const clerkCreate = await callRoute(router, 'post', '/clerk', {
      body: clerkCreateBody,
      headers: {
        'svix-id': 'msg-clerk-create',
        'svix-timestamp': String(clerkCreateTimestamp),
        'svix-signature': clerkCreateSignature,
      },
    });
    assert.equal(clerkCreate.body.received, true);

    const clerkDeleteBody = { type: 'user.deleted', data: { id: 'clerk-1' } };
    const clerkDeleteTimestamp = Math.floor(Date.now() / 1000);
    const clerkDeleteSignature = clerkWebhook.sign('msg-clerk-delete', new Date(clerkDeleteTimestamp * 1000), JSON.stringify(clerkDeleteBody));

    const clerkDelete = await callRoute(router, 'post', '/clerk', {
      body: clerkDeleteBody,
      headers: {
        'svix-id': 'msg-clerk-delete',
        'svix-timestamp': String(clerkDeleteTimestamp),
        'svix-signature': clerkDeleteSignature,
      },
    });
    assert.equal(clerkDelete.body.received, true);

    const rabbitsignRes = await callRoute(router, 'post', '/rabbitsign', {
      body: { status: 'completed' },
      runtimeMocks: {
        '../services/rabbitsign': {
          handleWebhook: async (_headers, body) => ({ verified: true, status: body.status }),
        },
      },
    });
    assert.equal(rabbitsignRes.body.received, true);
    assert.equal(rabbitsignRes.body.verified, true);
    assert.equal(rabbitsignRes.body.status, 'completed');
  } finally {
    if (previousClerkSecret === undefined) {
      delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    } else {
      process.env.CLERK_WEBHOOK_SIGNING_SECRET = previousClerkSecret;
    }
  }
});

test('admin dashboard returns aggregates for admins only', async () => {
  const router = loadRouter('src/routes/admin.js', {
    '../db/connection': {
      query: async (sql, params) => {
        if (sql.includes('SELECT role') && sql.includes('FROM users WHERE id = $1')) return [{ role: params?.[0] === 'admin-1' ? 'admin' : 'student' }];
        if (sql.includes('COUNT(*) AS total_leads')) return [{ total_leads: 10, active: 6, closed: 3, dead: 1, added_today: 2, avg_days_to_close: 14 }];
        if (sql.includes('SUM(price) AS total_value')) return [{ total_value: 1230000, total_profit: 210000, active_count: 6 }];
        if (sql.includes('COUNT(l.id) AS total_leads')) return [{ id: 'student-1', email: 'student@example.com', first_name: 'Stu', last_name: 'Dent', role: 'student', total_leads: 4, active_leads: 2, deals_closed: 1, deals_lost: 1, offers_sent: 1, active_negotiations: 1, contracts_to_draft: 1, under_contract: 1, last_activity: new Date().toISOString() }];
        if (sql.includes('FROM leads') && sql.includes('GROUP BY stage')) return [{ stage: 'OFFER_SENT', count: 2 }];
        if (sql.includes('days_stalled')) return [{ id: 'lead-1', address: '123 Main St', stage: 'OFFER_SENT', price: 250000, student_email: 'student@example.com', first_name: 'Stu', days_stalled: 9 }];
        if (sql.includes('follow_up_48hr_due')) return [{ id: 'lead-2', address: '456 Oak Ave', price: 300000, student_email: 'student@example.com', first_name: 'Stu', follow_up_48hr_due: new Date().toISOString(), offer_sent_date: new Date().toISOString() }];
        if (sql.includes('FROM activity_log')) return [{ id: 'act-1', address: '123 Main St', student_email: 'student@example.com', first_name: 'Stu' }];
        if (sql.includes('GROUP BY source')) return [{ source: 'referral', count: 5 }];
        return [];
      },
    },
  });

  const forbiddenRes = await callRoute(router, 'get', '/dashboard', { user: { userId: 'student-1' } });
  assert.equal(forbiddenRes.statusCode, 403);

  const dashboardRes = await callRoute(router, 'get', '/dashboard', { user: { userId: 'admin-1' } });
  assert.equal(dashboardRes.body.success, true);
  assert.equal(dashboardRes.body.overall.total_leads, 10);
  assert.equal(dashboardRes.body.overall.conversion_rate, 75);
  assert.equal(dashboardRes.body.students[0].conversion_rate, 50);
  assert.equal(dashboardRes.body.stageDistribution[0].stage, 'OFFER_SENT');
  assert.equal(dashboardRes.body.sourceBreakdown[0].source, 'referral');
});
