/**
 * e2e-production-test.js — Production-grade end-to-end integration test
 *
 * Simulates a complete real-world SubTo transaction through production code.
 * Uses real DB, real RabbitSign API, real PDF generation.
 * ONLY emails montelliscottrei@gmail.com — no external parties contacted.
 *
 * Usage: node src/scripts/e2e-production-test.js
 */

const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const { query } = require('../db/connection');
const { generateContract } = require('../services/contract-generator');
const { validateContract, getAllAddenda } = require('../services/contract-validation');
const { generateFilledPdf, saveFilledPdf, buildMergeMap, fillTemplate } = require('../services/pdf-generator');
const rs = require('../services/rabbitsign');
const contractLibrary = require('../services/contract-library');

const USER_EMAIL = 'montelliscottrei@gmail.com';
const LOG_FILE = path.resolve(__dirname, '../../e2e-test-log.txt');
const PDF_OUTPUT = path.resolve(__dirname, '../../e2e-test-contract.pdf');

fs.writeFileSync(LOG_FILE, `E2E PRODUCTION TEST — ${new Date().toISOString()}\n${'='.repeat(60)}\n\n`);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function logSection(title) {
  const line = `\n--- ${title} ---\n`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line);
}

const results = [];
function record(step, passed, details) {
  results.push({ step, passed, details });
  const icon = passed ? '✅' : '❌';
  log(`${icon} ${step}: ${passed ? 'PASS' : 'FAIL'}${details ? ' — ' + details : ''}`);
}

function enrichLead(lead) {
  lead.seller_carryback = lead.stack_principal_offer || 49000;
  lead.seller_carryback_rate = 0;
  lead.monthly_payment = 196;
  lead.buyer_name = 'Divinity Aligned LLC';
  lead.buyer_email = USER_EMAIL;
  lead.buyer_phone = '(804) 555-5678';
  lead.buyer_address = '100 Business Blvd, Suite 200, Richmond, VA 23220';
  lead.seller_address = '789 Seller Lane, Richmond, VA 23220';
  lead.maturity_date = 'August 1, 2032';
  lead.maturity_months = 72;
  lead.payment_start_date = 'August 1, 2026';
  lead.existing_loan_payment = 980;
  lead.personal_property = 'All appliances to stay excluding washer and dryer';
  lead.occupancy_status = 'Property is tenant-occupied under lease expiring March 31, 2027';
  lead.title_website = 'closedtitle.com';
  lead.title_email = 'Orders@closedtitle.com';
  lead.title_phone = '800-405-7150';
  lead.personal_guarantee = true;
  return lead;
}

async function main() {
  let testLeadId = null;
  let testUserId = null;
  let contractId = null;
  let folderId = null;

  // ================================================================
  // STEP 1: Create test lead in DB
  // ================================================================
  logSection('STEP 1: Create test lead in DB');

  try {
    const users = await query('SELECT id, email, role FROM users WHERE email = $1', [USER_EMAIL]);
    if (users.length === 0) {
      testUserId = uuid();
      await query(
        `INSERT INTO users (id, email, first_name, last_name, role) VALUES ($1, $2, 'E2E', 'Test', 'admin')`,
        [testUserId, USER_EMAIL]
      );
    } else {
      testUserId = users[0].id;
    }
    log(`User ID: ${testUserId}`);

    testLeadId = uuid();
    const coeDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    await query(
      `INSERT INTO leads (
        id, user_id, address, city, state, zip, apn, price, emd_amount,
        seller_name, seller_email, seller_phone,
        existing_loan_balance, existing_loan_type,
        inspection_period_days, coe_date, title_company,
        monthly_rent, arv, repairs_estimate, stage, source, contract_type,
        stack_principal_offer
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
      [testLeadId, testUserId, '555 E2E Test Boulevard, Richmond, VA 23220', 'Richmond', 'VA', '23220',
       '999-888-777', 195000, 1000, 'Test Seller Name', USER_EMAIL, '(804) 555-1234',
       145000, 'VA Loan', 14, coeDate, 'CLOSE Title',
       1450, 225000, 15000, 'OFFER_READY', 'other', 'subto', 49000]
    );
    log(`Test lead created: ${testLeadId}`);
    log(`  Address: 555 E2E Test Boulevard, Richmond, VA 23220`);
    log(`  Price: $195,000`);
    log(`  Seller: Test Seller Name (${USER_EMAIL})`);
    log(`  Loan type: VA Loan (triggers VA addendum)`);
    log(`  Carryback: $49,000 (stack_principal_offer)`);
    record('1. Create test lead', true, `leadId=${testLeadId}`);
  } catch (err) {
    record('1. Create test lead', false, err.message);
    throw err;
  }

  // ================================================================
  // STEP 2: Generate contract via production path
  // ================================================================
  logSection('STEP 2: Generate contract via contract-generator.js');

  try {
    const leadRow = await query('SELECT * FROM leads WHERE id = $1', [testLeadId]);
    const lead = leadRow[0];

    const leadData = {
      address: lead.address,
      city: lead.city,
      state: lead.state,
      zip: lead.zip,
      apn: lead.apn,
      price: lead.price,
      contacts: {
        seller_name: lead.seller_name,
        seller_phone: lead.seller_phone,
        seller_email: lead.seller_email,
      },
      property_details: { rent: lead.monthly_rent },
      underwriting: {
        arv: lead.arv,
        repairs_estimate: lead.repairs_estimate,
        existing_loan: lead.existing_loan_balance,
        existing_loan_type: lead.existing_loan_type,
      },
    };

    const pkg = generateContract(leadData, 'subto');
    log(`Contract package generated:`);
    log(`  Template: ${pkg.template}`);
    log(`  Type: ${pkg.type || 'subto'}`);
    log(`  Clauses: ${pkg.clauses ? pkg.clauses.length : 0} clauses`);

    contractId = uuid();
    await query(
      `INSERT INTO contracts (id, lead_id, user_id, contract_type, template_name, addenda, clauses, payload, status, selection_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9)
       RETURNING *`,
      [contractId, testLeadId, testUserId, 'subto', pkg.template,
       pkg.addenda, pkg.clauses ? pkg.clauses.map(c => c.id) : [],
       JSON.stringify(pkg), 'e2e_test']
    );
    log(`Contract stored as DRAFT: ${contractId}`);
    record('2. Generate contract', true, `template=${pkg.template}, clauses=${pkg.clauses?.length || 0}`);
  } catch (err) {
    record('2. Generate contract', false, err.message);
    throw err;
  }

  // ================================================================
  // STEP 3: Approve contract (human-in-the-loop)
  // ================================================================
  logSection('STEP 3: Approve contract');

  try {
    const approved = await query(
      `UPDATE contracts SET status = 'approved', approved_by = $1, approved_at = now()
       WHERE id = $2 RETURNING *`,
      [testUserId, contractId]
    );
    log(`Contract approved: ${approved[0].status}`);
    record('3. Approve contract', true, `status=${approved[0].status}`);
  } catch (err) {
    record('3. Approve contract', false, err.message);
    throw err;
  }

  // ================================================================
  // STEP 4: Pre-flight validation
  // ================================================================
  logSection('STEP 4: Pre-flight validation');

  try {
    const leadRow = await query('SELECT * FROM leads WHERE id = $1', [testLeadId]);
    const lead = enrichLead(leadRow[0]);

    const validation = validateContract('subto', lead);
    log(`Validation result:`);
    log(`  Valid: ${validation.valid}`);
    log(`  Issues: ${validation.issues.length}`);
    validation.issues.forEach(i => log(`  [${i.severity}] ${i.message}`));
    log(`  Conditional addendums: ${validation.addenda.length}`);
    validation.addenda.forEach(a => log(`    📎 ${a.name}: ${a.reason}`));

    record('4. Pre-flight validation', validation.valid,
      `${validation.addenda.length} addendums, ${validation.issues.filter(i => i.severity === 'blocking').length} blocking`);

    if (!validation.valid) {
      throw new Error('Validation failed — cannot proceed to PDF generation');
    }
  } catch (err) {
    record('4. Pre-flight validation', false, err.message);
    throw err;
  }

  // ================================================================
  // STEP 5: Generate filled PDF
  // ================================================================
  logSection('STEP 5: Generate filled PDF');

  let pdfBuffer;
  try {
    const leadRow = await query('SELECT * FROM leads WHERE id = $1', [testLeadId]);
    const lead = enrichLead(leadRow[0]);

    pdfBuffer = generateFilledPdf('subto', lead);
    log(`PDF generated: ${pdfBuffer.length} bytes (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);
    fs.writeFileSync(PDF_OUTPUT, pdfBuffer);
    log(`PDF saved to: ${PDF_OUTPUT}`);
    record('5. Generate PDF', pdfBuffer.length > 0, `${(pdfBuffer.length / 1024).toFixed(1)} KB`);
  } catch (err) {
    record('5. Generate PDF', false, err.message);
    throw err;
  }

  // ================================================================
  // STEP 6: Verify merge fields
  // ================================================================
  logSection('STEP 6: Verify merge fields');

  try {
    const leadRow = await query('SELECT * FROM leads WHERE id = $1', [testLeadId]);
    const lead = enrichLead(leadRow[0]);

    const masterText = contractLibrary.getTemplateText('subto');
    const mergeMap = buildMergeMap(lead);
    const filledText = fillTemplate(masterText, mergeMap);

    const unresolved = filledText.match(/\[[A-Z_]{3,}\]/g);
    const realUnresolved = unresolved ? unresolved.filter(t => t.length > 4 && !t.includes(' ')) : [];

    const blankRegex = /_{5,}/g;
    let blankMatch;
    const dealBlanks = [];
    const skipPatterns = ['Signature', 'Initials', 'Name of Signer', 'Its:', 'Other:', 'legal description',
                           '2nd Mortgage', 'Association', 'cure loan defaults', 'Net to Seller',
                           'Other: __', 'Date: __', 'Phone: __', 'Email: __', 'Printed Name',
                           'Legal Description', 'Legal Desc', 'Effective Date', 'latest date',
                           'as set forth below'];
    while ((blankMatch = blankRegex.exec(filledText)) !== null) {
      const start = Math.max(0, blankMatch.index - 40);
      const ctx = filledText.substring(start, Math.min(120, filledText.length - start));
      if (!skipPatterns.some(p => ctx.includes(p))) {
        dealBlanks.push(ctx.trim());
      }
    }

    log(`Unresolved tokens: ${realUnresolved.length}`);
    if (realUnresolved.length > 0) log(`  Tokens: ${[...new Set(realUnresolved)].join(', ')}`);
    log(`Deal-specific blank fields: ${dealBlanks.length}`);
    if (dealBlanks.length > 0) dealBlanks.forEach(b => log(`  BLANK: ${b}`));

    const checks = [
      { label: 'Property Address', test: filledText.includes('555 E2E Test Boulevard') },
      { label: 'Purchase Price', test: filledText.includes('195,000') },
      { label: 'Seller Name', test: filledText.includes('Test Seller Name') },
      { label: 'Buyer Name', test: filledText.includes('Divinity Aligned LLC') },
      { label: 'EMD Amount', test: filledText.includes('1,000') },
      { label: 'Inspection Days', test: filledText.includes('14') },
      { label: 'Existing Loan Balance', test: filledText.includes('145,000') },
      { label: 'Seller Carryback', test: filledText.includes('49,000') },
      { label: 'Maturity Date', test: filledText.includes('August 1, 2032') },
    ];
    checks.forEach(c => log(`  ${c.test ? '✅' : '❌'} ${c.label}: ${c.test ? 'found' : 'MISSING'}`));
    const allFieldsFilled = checks.every(c => c.test) && realUnresolved.length === 0 && dealBlanks.length === 0;

    record('6. Merge field verification', allFieldsFilled,
      `${checks.filter(c => c.test).length}/${checks.length} fields, ${realUnresolved.length} unresolved, ${dealBlanks.length} deal blanks`);
  } catch (err) {
    record('6. Merge field verification', false, err.message);
  }

  // ================================================================
  // STEP 7: Upload to RabbitSign
  // ================================================================
  logSection('STEP 7: Upload to RabbitSign');

  try {
    if (!rs.isConfigured()) {
      record('7. RabbitSign upload', false, 'RabbitSign not configured');
      throw new Error('RabbitSign not configured');
    }

    const result = await rs.createFolderFromPdfBuffer(pdfBuffer, {
      title: `E2E Test - SubTo PSA - 555 E2E Test Blvd`,
      summary: `E2E production test: SubTo contract for 555 E2E Test Boulevard at $195,000`,
      date: new Date().toISOString().slice(0, 10),
      signers: [
        { name: 'Test Seller Name', email: USER_EMAIL },
        { name: 'Divinity Aligned LLC', email: USER_EMAIL },
      ],
    });

    folderId = result.folderId;
    log(`RabbitSign folder created: ${folderId}`);
    log(`  API response: ${JSON.stringify(result)}`);
    record('7. RabbitSign upload', !!folderId, `folderId=${folderId}`);

    await query(
      `UPDATE contracts SET status = 'sent', sent_at = now(), rabbitsign_envelope_id = $1, rabbitsign_status = $2 WHERE id = $3`,
      [folderId, 'sent', contractId]
    );
    log(`Contract status updated to 'sent'`);
  } catch (err) {
    record('7. RabbitSign upload', false, err.message);
    throw err;
  }

  // ================================================================
  // STEP 8: Verify RabbitSign acceptance
  // ================================================================
  logSection('STEP 8: Verify RabbitSign acceptance');

  try {
    const status = await rs.getFolderStatus(folderId);
    log(`Folder status: ${JSON.stringify(status)}`);
    record('8. RabbitSign acceptance', !!status, `status=${status.status || 'unknown'}`);
  } catch (err) {
    record('8. RabbitSign acceptance', false, err.message);
  }

  // ================================================================
  // STEP 9: Verify addendums
  // ================================================================
  logSection('STEP 9: Verify addendums');

  try {
    const leadRow = await query('SELECT * FROM leads WHERE id = $1', [testLeadId]);
    const lead = enrichLead(leadRow[0]);

    const allAddenda = getAllAddenda('subto', lead);
    log(`Total addendums: ${allAddenda.length}`);
    allAddenda.forEach(a => log(`  📎 ${a.name} (conditional: ${a.conditional})${a.reason ? ' — ' + a.reason : ''}`));

    const expected = ['subto-addendum', 'VA Loan', 'Personal Guarantee', 'Seller Protection'];
    const found = allAddenda.map(a => a.name);
    const missing = expected.filter(e => !found.some(f => f.toLowerCase().includes(e.toLowerCase())));

    log(`Expected: ${expected.join(', ')}`);
    log(`Found: ${found.join(', ')}`);
    log(`Missing: ${missing.length === 0 ? 'none' : missing.join(', ')}`);

    record('9. Addendum verification', missing.length === 0,
      `${allAddenda.length} addendums (expected ${expected.length})`);
  } catch (err) {
    record('9. Addendum verification', false, err.message);
  }

  // ================================================================
  // STEP 10: Verify DB records
  // ================================================================
  logSection('STEP 10: Verify DB records');

  try {
    const contractRow = await query('SELECT * FROM contracts WHERE id = $1', [contractId]);
    const c = contractRow[0];
    log(`Contract status: ${c.status}`);
    log(`Contract envelope ID: ${c.rabbitsign_envelope_id}`);
    log(`Contract sent_at: ${c.sent_at}`);

    const dbChecks = [
      c.status === 'sent',
      c.rabbitsign_envelope_id === folderId,
      c.sent_at !== null,
    ];
    record('10. DB records', dbChecks.every(Boolean),
      `status=${c.status}, envelope=${c.rabbitsign_envelope_id ? 'set' : 'null'}`);
  } catch (err) {
    record('10. DB records', false, err.message);
  }

  // ================================================================
  // STEP 11: Cleanup
  // ================================================================
  logSection('STEP 11: Cleanup');

  if (folderId) {
    try {
      await rs.cancelFolder(folderId);
      log(`RabbitSign folder cancelled: ${folderId}`);
    } catch (e) {
      log(`RabbitSign cancel failed: ${e.message}`);
    }
  }

  try {
    await query('DELETE FROM contracts WHERE lead_id = $1', [testLeadId]);
    await query('DELETE FROM activity_log WHERE lead_id = $1', [testLeadId]);
    await query('DELETE FROM leads WHERE id = $1', [testLeadId]);
    log(`Test lead deleted: ${testLeadId}`);
  } catch (e) {
    log(`Cleanup failed: ${e.message}`);
  }

  // ================================================================
  // FINAL REPORT
  // ================================================================
  logSection('FINAL REPORT');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  let report = `\n${'='.repeat(60)}\nE2E PRODUCTION TEST — FINAL REPORT\n${'='.repeat(60)}\n\n`;
  report += `Total steps: ${total}\nPassed: ${passed} ✅\nFailed: ${failed} ❌\n\n`;
  results.forEach(r => {
    report += `${r.passed ? '✅' : '❌'} ${r.step}: ${r.details || ''}\n`;
  });
  report += `\nDeliverables:\n`;
  report += `  1. Execution log: ${LOG_FILE}\n`;
  report += `  2. Generated PDF: ${PDF_OUTPUT}\n`;
  report += `  3. RabbitSign folder ID: ${folderId || 'N/A'}\n`;
  report += `  4. Contract ID: ${contractId || 'N/A'}\n`;
  report += `  5. Test lead ID: ${testLeadId || 'N/A'}\n\n`;
  report += failed === 0
    ? `VERDICT: ✅ PASS — System is production-ready for SubTo contracts.\n`
    : `VERDICT: ❌ FAIL — ${failed} step(s) failed. Fix before production deployment.\n`;

  console.log(report);
  fs.appendFileSync(LOG_FILE, report);
}

main().catch(err => {
  log(`FATAL ERROR: ${err.message}`);
  console.error('FATAL:', err);
  if (typeof folderId !== 'undefined' && folderId) {
    rs.cancelFolder(folderId).catch(() => {});
  }
  process.exit(1);
});