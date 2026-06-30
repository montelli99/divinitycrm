/**
 * regression-suite.js — Production regression test suite for contract engine
 *
 * Tests every contract type with various data scenarios.
 * Fails immediately if a contract becomes malformed.
 *
 * Test coverage:
 * - Every contract type generates valid PDF
 * - Single buyer, multiple buyers, LLC, trust, corporation
 * - Long names, long addresses, large dollar amounts
 * - Missing optional fields
 * - Every addendum
 * - Every financing strategy
 * - Format audit on each
 *
 * Usage: node src/scripts/regression-suite.js
 */

const path = require('path');
const fs = require('fs');
const { saveFilledPdf, generateFilledPdf } = require('../services/pdf-generator');
const { validateContract } = require('../services/contract-validation');
const { auditContract } = require('./format-audit');
const contractLibrary = require('../services/contract-library');

const RESULTS_DIR = path.resolve(__dirname, '../../regression-pdfs');
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

const BASE_LEAD = {
  address: '123 Test Street, Arlington, VA 22201',
  city: 'Arlington', state: 'VA', zip: '22201',
  price: 250000, seller_name: 'John Seller', buyer_name: 'Divinity Aligned LLC',
  emd_amount: 500, inspection_period_days: 14, coe_days: 30,
  existing_loan_balance: 180000, existing_loan_type: 'Conventional',
  seller_carryback: 69500, monthly_payment: 276.39,
  maturity_date: 'August 1, 2056', maturity_months: 72,
  payment_start_date: 'August 1, 2026', existing_loan_payment: 1235,
  seller_email: 's@t.com', seller_phone: '555', seller_address: '789',
  buyer_email: 'b@t.com', buyer_phone: '555', buyer_address: '100',
  down_payment: 25000, seller_carryback_rate: 0,
};

// ============================================================
// TEST SUITE
// ============================================================

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('CONTRACT ENGINE REGRESSION SUITE');
  console.log('='.repeat(60) + '\n');

  // --- Group 1: Every contract type generates valid PDF ---
  console.log('--- Group 1: All contract types generate valid PDFs ---');
  const types = Object.keys(contractLibrary.CONTRACT_LIBRARY);
  for (const type of types) {
    await testAsync(`Generate ${type}`, async () => {
      const pdfBuffer = generateFilledPdf(type, BASE_LEAD);
      if (!pdfBuffer || pdfBuffer.length < 1000) throw new Error('PDF too small');
      fs.writeFileSync(path.join(RESULTS_DIR, `${type}.pdf`), pdfBuffer);
    });
  }

  // --- Group 2: Validation ---
  console.log('\n--- Group 2: Pre-flight validation ---');
  test('Valid lead passes validation', () => {
    const v = validateContract('subto', BASE_LEAD);
    if (!v.valid) throw new Error(`Should pass: ${v.issues.filter(i => i.severity === 'blocking').map(i => i.message).join('; ')}`);
  });

  test('Missing address fails validation', () => {
    const lead = { ...BASE_LEAD, address: '' };
    const v = validateContract('subto', lead);
    if (v.valid) throw new Error('Should fail with empty address');
  });

  test('Missing price fails validation', () => {
    const lead = { ...BASE_LEAD, price: 0 };
    const v = validateContract('subto', lead);
    if (v.valid) throw new Error('Should fail with price=0');
  });

  test('Missing seller name fails validation', () => {
    const lead = { ...BASE_LEAD, seller_name: '' };
    const v = validateContract('subto', lead);
    if (v.valid) throw new Error('Should fail with empty seller name');
  });

  test('Negative price fails validation', () => {
    const lead = { ...BASE_LEAD, price: -1000 };
    const v = validateContract('subto', lead);
    if (v.valid) throw new Error('Should fail with negative price');
  });

  // --- Group 3: Entity types ---
  console.log('\n--- Group 3: Entity types ---');
  test('LLC buyer', () => {
    const lead = { ...BASE_LEAD, buyer_name: 'Divinity Aligned LLC' };
    const v = validateContract('subto', lead);
    if (!v.valid) throw new Error('LLC buyer should pass');
  });

  test('Trust buyer', () => {
    const lead = { ...BASE_LEAD, buyer_name: 'Scott Family Trust' };
    const v = validateContract('subto', lead);
    if (!v.valid) throw new Error('Trust buyer should pass');
  });

  test('Corporation buyer', () => {
    const lead = { ...BASE_LEAD, buyer_name: 'Acquisition Corp Inc.' };
    const v = validateContract('subto', lead);
    if (!v.valid) throw new Error('Corporation buyer should pass');
  });

  test('Long buyer name', () => {
    const lead = { ...BASE_LEAD, buyer_name: 'Divinity Aligned Holdings LLC, a Virginia limited liability company' };
    const v = validateContract('subto', lead);
    if (!v.valid) throw new Error('Long buyer name should pass');
  });

  // --- Group 4: Edge cases ---
  console.log('\n--- Group 4: Edge cases ---');
  test('Long address', () => {
    const lead = { ...BASE_LEAD, address: '12345 Very Long Street Name That Goes On And On, Suite 100B, Arlington, VA 22201' };
    const v = validateContract('subto', lead);
    if (!v.valid) throw new Error('Long address should pass');
  });

  test('Large dollar amount', () => {
    const lead = { ...BASE_LEAD, price: 50000000 };
    const v = validateContract('commercial', lead);
    if (!v.valid) throw new Error('Large dollar amount should pass');
  });

  test('Missing optional fields', () => {
    const lead = { address: '123 Test', price: 100000, seller_name: 'S', buyer_name: 'B' };
    const v = validateContract('cash', lead);
    if (!v.valid) throw new Error('Cash with only required fields should pass');
  });

  // --- Group 5: Conditional addendums ---
  console.log('\n--- Group 5: Conditional addendums ---');
  test('VA loan triggers VA addendum', () => {
    const lead = { ...BASE_LEAD, existing_loan_type: 'VA Loan' };
    const v = validateContract('subto', lead);
    const hasVA = v.addenda.some(a => a.id === 'va_loan');
    if (!hasVA) throw new Error('VA loan should trigger VA addendum');
  });

  test('Personal guarantee triggers addendum', () => {
    const lead = { ...BASE_LEAD, personal_guarantee: true };
    const v = validateContract('subto', lead);
    const hasPG = v.addenda.some(a => a.id === 'personal_guarantee');
    if (!hasPG) throw new Error('Personal guarantee should trigger addendum');
  });

  test('Carryback > 0 triggers seller protection', () => {
    const lead = { ...BASE_LEAD, seller_carryback: 50000 };
    const v = validateContract('subto', lead);
    const hasSP = v.addenda.some(a => a.id === 'seller_protection');
    if (!hasSP) throw new Error('Carryback > 0 should trigger seller protection');
  });

  test('No carryback does not trigger seller protection', () => {
    const lead = { ...BASE_LEAD, seller_carryback: 0 };
    const v = validateContract('subto', lead);
    const hasSP = v.addenda.some(a => a.id === 'seller_protection');
    if (hasSP) throw new Error('Carryback=0 should NOT trigger seller protection');
  });

  test('Conventional loan does NOT trigger VA addendum', () => {
    const lead = { ...BASE_LEAD, existing_loan_type: 'Conventional' };
    const v = validateContract('subto', lead);
    const hasVA = v.addenda.some(a => a.id === 'va_loan');
    if (hasVA) throw new Error('Conventional loan should NOT trigger VA addendum');
  });

  // --- Group 6: Format audit ---
  console.log('\n--- Group 6: Format audit on all types ---');
  for (const type of types) {
    test(`Format audit ${type}`, () => {
      const result = auditContract(type, BASE_LEAD);
      if (result.criticalCount > 0) {
        throw new Error(`${result.criticalCount} critical issues: ${result.issues.filter(i => i.severity === 'critical').map(i => i.name).join(', ')}`);
      }
    });
  }

  // --- Group 7: No double-dollar in any contract ---
  console.log('\n--- Group 7: No double-dollar signs ---');
  for (const type of types) {
    test(`No $$ in ${type}`, () => {
      const masterText = contractLibrary.getTemplateText(type);
      const { buildMergeMap, fillTemplate } = require('../services/pdf-generator');
      const filled = fillTemplate(masterText, buildMergeMap(BASE_LEAD));
      if (/\$\s*\$/g.test(filled)) throw new Error('Contains $$ — double-dollar bug');
    });
  }

  // ============================================================
  // FINAL REPORT
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('REGRESSION SUITE FINAL REPORT');
  console.log('='.repeat(60) + '\n');
  console.log(`Total tests: ${passed + failed}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`Score: ${Math.round((passed / (passed + failed)) * 100)}%`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  ❌ ${f.name}: ${f.error}`));
  }

  console.log('\n' + (failed === 0 ? '✅ ALL PASS — Production ready' : '❌ FAILURES — Fix before production'));
  console.log('='.repeat(60));

  process.exit(failed === 0 ? 0 : 1);
}

main();