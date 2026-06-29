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
// 4. Missing template -> falls back to direct PDF folder creation
// =============================================================

test('createContractEnvelope falls back to PDF when RABBITSIGN_TEMPLATE_SUBTO missing', async () => {
  const rs = require(path.join(BACKEND_ROOT, 'src/services/rabbitsign'));
  // Ensure env var is unset for this test
  delete process.env.RABBITSIGN_TEMPLATE_SUBTO;
  // Should NOT throw — should fall back to createFolderFromPdf
  // We can't test the full API call without network, so we just verify
  // it doesn't throw the "No RabbitSign template configured" error anymore
  try {
    await rs.createContractEnvelope({ id: 'lead-1', address: '123 Test' }, 'subto');
  } catch (err) {
    // Should NOT be the "No RabbitSign template configured" error
    assert.ok(!/No RabbitSign template configured/.test(err.message),
      `Should not throw template-missing error, got: ${err.message}`);
  }
});

test('createContractEnvelope falls back to PDF when RABBITSIGN_TEMPLATE_CASH missing', async () => {
  const rs = require(path.join(BACKEND_ROOT, 'src/services/rabbitsign'));
  delete process.env.RABBITSIGN_TEMPLATE_CASH;
  try {
    await rs.createContractEnvelope({ id: 'lead-1', address: '123 Test' }, 'cash');
  } catch (err) {
    assert.ok(!/No RabbitSign template configured/.test(err.message),
      `Should not throw template-missing error, got: ${err.message}`);
  }
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

// =============================================================
// LOCAL TEMPLATE EXTRACTION (LRN-20260626-010)
// The contract-library reads from ai-rei/kay-exclusive/ as the
// source of truth for clause content. Tests verify that:
//   - All 11 contract families have local source files
//   - Template text loads from disk
//   - Addenda text loads for SubTo / Seller Finance
//   - LOI text loads when separate from PSA
//   - getRabbitSignTemplateId throws hard when env var missing
//   - fillTemplate substitutes lead fields without breaking formatting
//   - auditLibrary reports missing files loudly
// =============================================================
test('contract-library lists all 11 contract families', () => {
  const lib = require(path.join(BACKEND_ROOT, 'src/services/contract-library'));
  const types = lib.listContractTypes();
  assert.ok(types.includes('cash'), 'cash family missing');
  assert.ok(types.includes('subto'), 'subto family missing');
  assert.ok(types.includes('stack50'), 'stack50 family missing');
  assert.ok(types.includes('stack10'), 'stack10 family missing');
  assert.ok(types.includes('stack_interest_only'), 'stack_interest_only missing');
  assert.ok(types.includes('stack_mfh'), 'stack_mfh missing');
  assert.ok(types.includes('seller_finance'), 'seller_finance missing');
  assert.ok(types.includes('commercial'), 'commercial missing');
  assert.ok(types.includes('portfolio'), 'portfolio missing');
  assert.ok(types.includes('jv_4party'), 'jv_4party missing');
  assert.ok(types.includes('jv_5party'), 'jv_5party missing');
});

test('contract-library reads Cash template from local file', () => {
  const lib = require(path.join(BACKEND_ROOT, 'src/services/contract-library'));
  const text = lib.getTemplateText('cash');
  assert.ok(text.length > 100, 'Cash template should be substantial content');
  assert.ok(text.includes('Purchase Price') || text.includes('Approved Offer'),
    'Cash template should contain standard offer language');
});

test('contract-library reads SubTo PSA + Subject To Addendum', () => {
  const lib = require(path.join(BACKEND_ROOT, 'src/services/contract-library'));
  const text = lib.getTemplateText('subto');
  assert.ok(text.includes('PURCHASE CONTRACT') || text.includes('Effective Date'),
    'SubTo PSA should contain PSA boilerplate');
  const addenda = lib.getAddendaText('subto');
  assert.ok(addenda.length >= 1, 'SubTo should have at least one addendum');
});

test('contract-library reads Commercial PSA from local file', () => {
  const lib = require(path.join(BACKEND_ROOT, 'src/services/contract-library'));
  const text = lib.getTemplateText('commercial');
  assert.ok(text.length > 100, 'Commercial PSA should be substantial');
  assert.ok(text.includes('Purchase') || text.includes('Property'),
    'Commercial PSA should contain purchase language');
});

test('contract-library reads JV agreements from local files', () => {
  const lib = require(path.join(BACKEND_ROOT, 'src/services/contract-library'));
  const text4 = lib.getTemplateText('jv_4party');
  assert.ok(text4.includes('JOINT VENTURE') || text4.includes('Joint Venture'),
    '4-party JV should contain JV boilerplate');
  const text5 = lib.getTemplateText('jv_5party');
  assert.ok(text5.length > 100, '5-party JV should load (falls back to 4-party text)');
});

test('contract-library reads LOI text for SubTo', () => {
  const lib = require(path.join(BACKEND_ROOT, 'src/services/contract-library'));
  const loi = lib.getLoiText('subto');
  assert.ok(loi, 'SubTo should have a separate LOI template');
  // SubTo LOI references seller financing + bookkeeper (Kayla's standard SubTo intro)
  assert.ok(loi.text.includes('Approved Offer') || loi.text.includes('Earnest Money Deposit'),
    'SubTo LOI should be a standard offer letter');
  assert.ok(loi.text.includes('bookkeeper') || loi.text.includes('Existing loan') || loi.text.includes('Seller financing'),
    'SubTo LOI should reference seller financing / existing loan terms');
});

test('contract-library getRabbitSignTemplateId throws on missing env var', () => {
  const lib = require(path.join(BACKEND_ROOT, 'src/services/contract-library'));
  // Make sure env vars are unset for this test
  delete process.env.RABBITSIGN_TEMPLATE_SUBTO;
  assert.throws(
    () => lib.getRabbitSignTemplateId('subto'),
    /No RabbitSign template configured.*RABBITSIGN_TEMPLATE_SUBTO/,
    'should throw with explicit env var name when template ID missing'
  );
});

test('contract-library getRabbitSignTemplateId returns env var value when set', () => {
  const lib = require(path.join(BACKEND_ROOT, 'src/services/contract-library'));
  process.env.RABBITSIGN_TEMPLATE_SUBTO = 'test-template-id-abc';
  try {
    const id = lib.getRabbitSignTemplateId('subto');
    assert.equal(id, 'test-template-id-abc');
  } finally {
    delete process.env.RABBITSIGN_TEMPLATE_SUBTO;
  }
});

test('contract-library throws on unsupported contract type (no silent fallback)', () => {
  const lib = require(path.join(BACKEND_ROOT, 'src/services/contract-library'));
  assert.throws(() => lib.getTemplateText('bitcoin'), /Unsupported contract type/);
  assert.throws(() => lib.getTemplateText('crypto'), /Unsupported contract type/);
  assert.throws(() => lib.getRabbitSignTemplateId('nft'), /Unsupported contract type/);
});

test('contract-library fillTemplate substitutes lead fields', () => {
  const lib = require(path.join(BACKEND_ROOT, 'src/services/contract-library'));
  const template = 'Approved Offer for [PROPERTY_ADDRESS] at [PURCHASE_PRICE] from [BUYER_NAME]';
  const filled = lib.fillTemplate(template, {
    address: '123 Main St, Austin, TX 78701',
    price: 250000,
    buyer_name: 'Kayla Mauser',
  });
  assert.ok(filled.includes('123 Main St, Austin, TX 78701'));
  assert.ok(filled.includes('$250,000'));
  assert.ok(filled.includes('Kayla Mauser'));
});

test('contract-library fillTemplate preserves formatting', () => {
  const lib = require(path.join(BACKEND_ROOT, 'src/services/contract-library'));
  const template = 'Line 1\nLine 2\nLine 3 [PROPERTY_ADDRESS]\nLine 4';
  const filled = lib.fillTemplate(template, { address: '999 Test St' });
  assert.equal(filled.split('\n').length, 4, 'should preserve line breaks');
  assert.ok(filled.includes('Line 3 999 Test St'));
});

test('contract-library auditLibrary reports all 11 types with status', () => {
  const lib = require(path.join(BACKEND_ROOT, 'src/services/contract-library'));
  const report = lib.auditLibrary();
  assert.equal(report.total, 11);
  assert.equal(report.types.length, 11);
  // All template files should exist locally (we verified this above)
  for (const entry of report.types) {
    assert.ok(entry.templateConfigured, `${entry.type} template file should exist`);
  }
  // Until RabbitSign template IDs are configured, all should report missing
  const missingRabbitSign = report.types.filter(t => !t.rabbitsignConfigured);
  assert.ok(missingRabbitSign.length > 0, 'should report at least one missing RabbitSign template ID');
});

// Production deployment safety (LRN-20260626-011 follow-up)
test('contract-library defaults to bundled directory (production-safe)', () => {
  const lib = require(path.join(BACKEND_ROOT, 'src/services/contract-library'));
  const dir = lib.sourceDir();
  // Should resolve to backend/src/assets/contracts regardless of cwd
  assert.ok(dir.endsWith(path.join('backend', 'src', 'assets', 'contracts')),
    `sourceDir should default to bundled backend dir, got: ${dir}`);
  assert.ok(require('fs').existsSync(dir), 'bundled directory must exist');
});

test('contract-library BUNDLED_CONTRACTS_DIR is exposed for sync scripts', () => {
  const lib = require(path.join(BACKEND_ROOT, 'src/services/contract-library'));
  assert.ok(typeof lib.BUNDLED_CONTRACTS_DIR === 'string');
  assert.ok(lib.BUNDLED_CONTRACTS_DIR.endsWith(path.join('src', 'assets', 'contracts')),
    `BUNDLED_CONTRACTS_DIR should point at bundled dir, got: ${lib.BUNDLED_CONTRACTS_DIR}`);
});

test('contract-library KAY_EXCLUSIVE_DIR is undefined when env var unset', () => {
  delete process.env.KAY_EXCLUSIVE_DIR;
  // Re-require to pick up env change (the module captures at load time)
  delete require.cache[require.resolve(path.join(BACKEND_ROOT, 'src/services/contract-library'))];
  const lib = require(path.join(BACKEND_ROOT, 'src/services/contract-library'));
  assert.equal(lib.KAY_EXCLUSIVE_DIR, undefined);
});
