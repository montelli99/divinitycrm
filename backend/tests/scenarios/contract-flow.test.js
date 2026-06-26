// =============================================================
// contract-flow.test.js — End-to-end coverage of the contract
// generation + review + RabbitSign send flow.
// LRN-20260626-008 / user directive 2026-06-26 14:20 EDT
//   underwriting -> strategy -> contract_type -> draft -> REVIEW -> sign
// =============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

// Resolve all routes from the backend root regardless of cwd
const BACKEND_ROOT = path.resolve(__dirname, '..', '..');

// --------------------------------------------------
// Helper: load a router with mocked dependencies
// --------------------------------------------------
function loadRouter(routeRelPath, mocks = {}) {
  const fullPath = path.isAbsolute(routeRelPath) ? routeRelPath : path.join(BACKEND_ROOT, routeRelPath);
  const origResolve = Module._resolveFilename;
  const origLoad = Module._load;
  Module._resolveFilename = function (request, ...rest) {
    if (mocks[request]) return `mock:${request}`;
    return origResolve.call(this, request, ...rest);
  };
  Module._load = function (request, ...rest) {
    if (mocks[request]) return mocks[request];
    return origLoad.call(this, request, ...rest);
  };
  try {
    delete require.cache[require.resolve(fullPath)];
    // Also evict any mocked deps so the route handler's late `require()` picks up the mock
    Object.keys(mocks).forEach(k => {
      try { delete require.cache[require.resolve(k)]; } catch (e) { /* not in cache */ }
      // Also resolve relative to the route file
      try {
        const fromRoute = require.resolve(path.join(path.dirname(fullPath), k));
        delete require.cache[fromRoute];
      } catch (e) { /* not in cache */ }
    });
    return require(fullPath);
  } finally {
    Module._resolveFilename = origResolve;
    Module._load = origLoad;
    delete require.cache[require.resolve(fullPath)];
  }
}

async function callRoute(router, method, routePath, { params = {}, query = {}, body = {}, user = { userId: 'user-1' }, runtimeMocks = {} } = {}) {
  // Apply runtimeMocks to a fresh router if provided
  let r = router;
  if (Object.keys(runtimeMocks).length) {
    // For per-call runtime mocks, just wrap into existing router's stack via re-resolution
    // Simpler: error if needed. Most tests use loadRouter with shared mocks.
  }
  let layer = null;
  for (const l of r.stack || []) {
    if (l.route && l.route.methods[method.toLowerCase()] && l.route.path === routePath) {
      layer = l; break;
    }
  }
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);
  const req = { params, query, body, user, headers: {} };
  const res = await new Promise((resolve, reject) => {
    const out = { statusCode: 200, headers: {}, body: null };
    const r2 = {
      status(c) { out.statusCode = c; return this; },
      json(b) { out.body = b; resolve(out); return this; },
      setHeader(k, v) { out.headers[k] = v; },
      send(b) { out.body = b; resolve(out); return this; },
    };
    Promise.resolve(layer.route.stack[0].handle(req, r2, (err) => err ? reject(err) : resolve(out))).catch(reject);
  });
  return res;
}

// =============================================================
// 1. strategy -> contract_type selection (selectContractType)
// =============================================================

test('selectContractType maps PascalCase SubTo to lowercase subto', () => {
  const { selectContractType } = require(path.join(BACKEND_ROOT, 'src/services/contract-generator'));
  assert.equal(selectContractType({ strategy: 'SubjectTo', contractType: 'SubTo' }), 'subto');
});

test('selectContractType maps Stack to stack50', () => {
  const { selectContractType } = require(path.join(BACKEND_ROOT, 'src/services/contract-generator'));
  assert.equal(selectContractType({ strategy: 'Stack', contractType: 'Stack' }), 'stack50');
});

test('selectContractType maps Cash to cash', () => {
  const { selectContractType } = require(path.join(BACKEND_ROOT, 'src/services/contract-generator'));
  assert.equal(selectContractType({ contractType: 'Cash' }), 'cash');
});

test('selectContractType maps Novation to commercial', () => {
  const { selectContractType } = require(path.join(BACKEND_ROOT, 'src/services/contract-generator'));
  assert.equal(selectContractType({ strategy: 'Novation', contractType: 'Novation' }), 'commercial');
});

test('selectContractType accepts lowercase directly', () => {
  const { selectContractType } = require(path.join(BACKEND_ROOT, 'src/services/contract-generator'));
  assert.equal(selectContractType({ contractType: 'jv' }), 'jv');
  assert.equal(selectContractType({ contractType: 'portfolio' }), 'portfolio');
  assert.equal(selectContractType({ contractType: 'stack10' }), 'stack10');
});

test('selectContractType throws on unsupported type (no silent fallback)', () => {
  const { selectContractType } = require(path.join(BACKEND_ROOT, 'src/services/contract-generator'));
  assert.throws(
    () => selectContractType({ contractType: 'Bitcoin' }),
    /cannot map 'Bitcoin'/
  );
});

test('selectContractType throws on missing strategy', () => {
  const { selectContractType } = require(path.join(BACKEND_ROOT, 'src/services/contract-generator'));
  assert.throws(() => selectContractType({}), /strategy is required|strategy must include/);
  assert.throws(() => selectContractType(null), /strategy is required|strategy must include/);
});

// =============================================================
// 2. Draft created before send (POST /generate returns status=draft)
// =============================================================

test('POST /generate creates contract as draft, NOT auto-sends', async () => {
  const insertCalls = [];
  const router = loadRouter('src/routes/contracts.js', {
    '../db/connection': {
      query: async (sql, params) => {
        if (sql.includes('SELECT role, email FROM users WHERE id = $1')) return [{ role: 'student', email: 'student@example.com' }];
        if (sql.includes('SELECT * FROM leads WHERE id = $1')) return [{ id: 'lead-1', user_id: 'user-1', stage: 'TERMS_AGREED', address: '123 Main St', city: 'Austin', state: 'TX', zip: '78701', apn: 'APN123', price: 250000, seller_name: 'Jane Seller', seller_email: 'jane@example.com', seller_phone: '555-111-2222', existing_loan_balance: 180000, existing_loan_rate: 0.045, contract_type: 'subto' }];
        if (sql.includes('INSERT INTO contracts')) {
          insertCalls.push({ sql, params });
          return [{ id: 'contract-draft-1', status: 'draft' }];
        }
        if (sql.includes('UPDATE leads SET')) return [{ id: 'lead-1' }];
        if (sql.includes('INSERT INTO activity_log')) return [];
        return [];
      },
    },
    '../services/stage-automations': {
      executeStageAutomations: async () => ({ automated: false, workflow: null }),
      getAvailableTransitions: () => ['UNDER_CONTRACT'],
    },
  });

  const res = await callRoute(router, 'post', '/generate', {
    body: { lead_id: 'lead-1', contract_type: 'subto', source: 'underwriting-auto' },
  });
  assert.equal(res.statusCode, 200);

  // LRN-20260626-008: must insert with status='draft', NOT advance stage
  const insert = insertCalls.find(c => c.sql.includes('INSERT INTO contracts'));
  assert.ok(insert, 'INSERT INTO contracts should fire');
  assert.ok(insert.sql.includes("'draft'"), 'INSERT must default status to draft');
  // selection_reason records the source so we can audit auto-selection later
  assert.equal(insert.params[insert.params.length - 1], 'source=underwriting-auto');

  // No stage advance (UPDATE leads SET ... stage = 'UNDER_CONTRACT')
  const stageAdvance = insertCalls.find(c => c.sql.includes('UPDATE leads SET') && c.sql.includes("stage = 'UNDER_CONTRACT'"));
  assert.equal(stageAdvance, undefined, 'Stage must NOT advance on draft creation');

  // Response points to next step (approve)
  assert.ok(res.body.next_step.includes('/approve'),
    'response should direct caller to /approve endpoint');
});

// =============================================================
// 3. Approve -> Send (POST /send-rabbitsign requires approved status)
// =============================================================

test('POST /send-rabbitsign blocked when no approved contract exists (409)', async () => {
  const router = loadRouter('src/routes/contracts.js', {
    '../db/connection': {
      query: async (sql) => {
        if (sql.includes('SELECT role, email FROM users WHERE id = $1')) return [{ role: 'student', email: 'student@example.com' }];
        if (sql.includes('SELECT * FROM leads WHERE id = $1')) return [{ id: 'lead-1', user_id: 'user-1', stage: 'TERMS_AGREED', address: '123 Main St', city: 'Austin', state: 'TX', zip: '78701', price: 250000, contract_type: 'subto' }];
        if (sql.includes("status = 'approved'")) return [];  // no approved contract
        return [];
      },
    },
  });

  const res = await callRoute(router, 'post', '/send-rabbitsign', {
    body: { leadId: 'lead-1', contractType: 'SubTo' },
    runtimeMocks: {
      '../services/rabbitsign': {
        isConfigured: () => true,
        createContractEnvelope: async () => ({ folderId: 'should-not-fire', status: 'sent' }),
      },
    },
  });
  assert.equal(res.statusCode, 409, 'must reject send without approved contract');
  assert.ok(res.body.error.includes('approved contract'),
    'error message should mention approval requirement');
});

test('POST /send-rabbitsign succeeds after /:id/approve', async () => {
  let approved = false;
  const folderIds = [];
  // Pre-set the env var so real createContractEnvelope doesn't throw at the gate.
  // We'll monkey-patch the real rabbitsign module instead of mocking the require
  // (because contracts.js requires it at call-time inside the route handler).
  process.env.RABBITSIGN_TEMPLATE_SUBTO = 'mock-template-id-abc123';
  const rsPath = path.join(BACKEND_ROOT, 'src/services/rabbitsign');
  const realRs = require(rsPath);
  const origCreate = realRs.createContractEnvelope;
  realRs.createContractEnvelope = async (lead, type) => {
    folderIds.push({ lead: lead.id, type });
    return { folderId: 'folder-after-approval', status: 'sent' };
  };

  try {

  const router = loadRouter('src/routes/contracts.js', {
    '../db/connection': {
      query: async (sql) => {
        if (sql.includes('SELECT role, email FROM users WHERE id = $1')) return [{ role: 'student', email: 'student@example.com' }];
        if (sql.includes('SELECT * FROM leads WHERE id = $1')) return [{ id: 'lead-1', user_id: 'user-1', stage: 'TERMS_AGREED', address: '123 Main St', city: 'Austin', state: 'TX', zip: '78701', price: 250000, contract_type: 'subto' }];
        if (sql.includes('FROM contracts c') && sql.includes('JOIN leads l')) {
          return [{ id: 'contract-1', lead_id: 'lead-1', lead_owner: 'user-1', contract_type: 'subto', status: approved ? 'approved' : 'draft' }];
        }
        if (sql.startsWith('SELECT') && sql.includes("status = 'approved'") && !sql.includes('UPDATE')) {
          return approved ? [{ id: 'contract-1', contract_type: 'subto', status: 'approved', lead_id: 'lead-1' }] : [];
        }
        if (sql.includes('UPDATE contracts')) { approved = true; return [{ id: 'contract-1', status: 'approved' }]; }
        return [];
      },
    },
  });

  // Step 1: approve
  const approveRes = await callRoute(router, 'post', '/:id/approve', {
    params: { id: 'contract-1' },
  });
  assert.equal(approveRes.statusCode, 200);
  assert.equal(approveRes.body.status, 'approved');

  // Step 2: send
  const sendRes = await callRoute(router, 'post', '/send-rabbitsign', {
    body: { leadId: 'lead-1', contractType: 'subto' },
  });
  assert.equal(sendRes.statusCode, 200);
  assert.equal(sendRes.body.folderId, 'folder-after-approval');
  assert.equal(folderIds.length, 1, 'RabbitSign should be called exactly once');
  assert.equal(folderIds[0].lead, 'lead-1');
  assert.equal(folderIds[0].type, 'subto');
  } finally {
    realRs.createContractEnvelope = origCreate;
    delete process.env.RABBITSIGN_TEMPLATE_SUBTO;
  }
});

// =============================================================
// 4. Missing template -> hard error (no silent fallback)
// =============================================================

test('createContractEnvelope throws when RABBITSIGN_TEMPLATE_SUBTO missing', async () => {
  const rs = require(path.join(BACKEND_ROOT, 'src/services/rabbitsign'));
  // Ensure env var is unset for this test
  delete process.env.RABBITSIGN_TEMPLATE_SUBTO;
  await assert.rejects(
    () => rs.createContractEnvelope({ id: 'lead-1', address: '123 Test' }, 'subto'),
    /No RabbitSign template configured for contract type 'subto'/
  );
});

test('createContractEnvelope throws when RABBITSIGN_TEMPLATE_CASH missing', async () => {
  const rs = require(path.join(BACKEND_ROOT, 'src/services/rabbitsign'));
  delete process.env.RABBITSIGN_TEMPLATE_CASH;
  await assert.rejects(
    () => rs.createContractEnvelope({ id: 'lead-1', address: '123 Test' }, 'cash'),
    /No RabbitSign template configured for contract type 'cash'/
  );
});

test('createContractEnvelope throws on unsupported contract type', async () => {
  const rs = require(path.join(BACKEND_ROOT, 'src/services/rabbitsign'));
  await assert.rejects(
    () => rs.createContractEnvelope({ id: 'lead-1', address: '123 Test' }, 'bitcoin'),
    /Unsupported contract type/
  );
});

test('createContractEnvelope accepts env var override and uses it', async () => {
  const rs = require(path.join(BACKEND_ROOT, 'src/services/rabbitsign'));
  process.env.RABBITSIGN_TEMPLATE_SUBTO = 'custom-template-id-12345';
  // Now createContractEnvelope won't throw on missing template, but it'll fail at
  // the actual HTTPS call (no template auth from test). We just check that it
  // does NOT throw the 'no template' error.
  try {
    await rs.createContractEnvelope({ id: 'lead-1', address: '123 Test', price: 100000 }, 'subto');
  } catch (err) {
    assert.ok(!err.message.includes('No RabbitSign template configured'),
      `should not throw template-missing error when env var is set: ${err.message}`);
  }
  delete process.env.RABBITSIGN_TEMPLATE_SUBTO;
});
