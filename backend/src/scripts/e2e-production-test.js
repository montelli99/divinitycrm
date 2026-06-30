/**
 * e2e-production-test.js — Production-grade end-to-end integration test
 *
 * Simulates a complete real-world transaction through the CRM production pipeline.
 * Uses real database, real RabbitSign API, real PDF generation.
 * ONLY emails montelliscottrei@gmail.com — no external parties contacted.
 *
 * Flow:
 * 1. Create test lead in DB
 * 2. Generate contract (POST /api/contracts/generate path)
 * 3. Approve contract (POST /api/contracts/:id/approve path)
 * 4. Pre-flight validation
 * 5. Generate filled PDF (master + addendums)
 * 6. Upload to RabbitSign via API
 * 7. Verify RabbitSign accepted
 * 8. Check folder status
 * 9. Verify merge fields in PDF
 * 10. Verify all addendums included
 * 11. Cleanup: cancel RabbitSign folder, delete test lead
 * 12. Final PASS/FAIL report
 *
 * Usage: node src/scripts/e2e-production-test.js
 */

const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const { query } = require('../db/connection');
const { generateContract, formatForTelegram } = require('../services/contract-generator');
const { validateContract } = require('../services/contract-validation');
const { generateFilledPdf, saveFilledPdf, buildMergeMap, fillTemplate } = require('../services/pdf-generator');
const rs = require('../services/rabbitsign');
const contractLibrary = require('../services/contract-library');

const USER_EMAIL = 'montelliscottrei@gmail.com';
const LOG_FILE = path.resolve(__dirname, '../../e2e-test-log.txt');
const PDF_OUTPUT = path.resolve(__dirname, '../../e2e-test-contract.pdf');

// Clear log
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

async function main() {
  let testLeadId = null;
  let testUserId = null;
  let contractId = null;
  let folderId = null;

  try {
    // ================================================================
    // STEP 1: Create test lead in production database
    // ================================================================
    logSection('STEP 1: Create test lead in DB');

    // Find Montelli's user ID
    const users = await query('SELECT id, email, role FROM users WHERE email = $1', [USER_EMAIL]);
    if (users.length === 0) {
      // Create a test user if not exists
      log('User not found, creating test user...');
      testUserId = uuid();
      await query(
        `INSERT INTO users (id, email, first_name, last_name, role) VALUES ($1, $2, 'E2E', 'Test', 'admin')`,
        [testUserId, USER_EMAIL]
      );
    } else {
      testUserId = users[0].id;
    }
    log(`User ID: ${testUserId}`);

    // Create test lead — only use real DB columns
    testLeadId = uuid();
    const coeDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const leadData = {
      id: testLeadId,
      user_id: testUserId,
      address: '555 E2E Test Boulevard, Richmond, VA 23220',
      city: 'Richmond',
      state: 'VA',
      zip: '23220',
      apn: '999-888-777',
      price: 195000,
      emd_amount: 1000,
      seller_name: 'Test Seller Name',
      seller_email: USER_EMAIL,
      seller_phone: '(804) 555-1234',
      existing_loan_balance: 145000,
      existing_loan_type: 'VA Loan',
      inspection_period_days: 14,
      coe_date: coeDate,
      title_company: 'CLOSE Title',
      monthly_rent: 1450,
      arv: 225000,
      repairs_estimate: 15000,
      stage: 'OFFER_READY',
      source: 'other',
      contract_type: 'subto',
      stack_principal_offer: 49000, // maps to seller_carryback in merge map
    };

    await query(
      `INSERT INTO leads (
        id, user_id, address, city, state, zip, apn, price, emd_amount,
        seller_name, seller_email, seller_phone,
        existing_loan_balance, existing_loan_type,
        inspection_period_days, coe_date, title_company,
        monthly_rent, arv, repairs_estimate, stage, source, contract_type,
        stack_principal_offer
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
      [leadData.id, leadData.user_id, leadData.address, leadData.city, leadData.state, leadData.zip,
       leadData.apn, leadData.price, leadData.emd_amount, leadData.seller_name, leadData.seller_email,
       leadData.seller_phone, leadData.existing_loan_balance, leadData.existing_loan_type,
       leadData.inspection_period_days, leadData.coe_date, leadData.title_company,
       leadData.monthly_rent, leadData.arv, leadData.repairs_estimate,
       leadData.stage, leadData.source, leadData.contract_type, leadData.stack_principal_offer]
    );
    log(`Test lead created: ${testLeadId}`);
    log(`  Address: ${leadData.address}`);
    log(`  Price: $${leadData.price.toLocaleString()}`);
    log(`  Seller: ${leadData.seller_name} (${USER_EMAIL})`);
    log(`  Loan type: ${leadData.existing_loan_type} (should trigger VA addendum)`);
    log(`  Carryback: $${(leadData.stack_principal_offer || 0).toLocaleString()}`);
    record('1. Create test lead', true, `leadId=${testLeadId}`);
  } catch (err) {
    record('1. Create test lead', false, err.message);
    throw err;
  }

  try {
    // ================================================================
    // STEP 2: Generate contract (production path: contract-generator.js)
    // ================================================================
    logSection('STEP 2: Generate contract via production path');

    const leadRow = await query('SELECT * FROM leads WHERE id = $1', [testLeadId]);
    const lead = leadRow[0];

    // Map DB lead to contract-generator format (same as routes/contracts.js)
    const leadData = {
      address: lead.address,
      city: lead.city,
      state: lead.state,
      zip: lead.zip,
      apn: lead.apn,
      price: lead.price,
      contacts: {
        agent_name: lead.agent_name,
        agent_phone: lead.agent_phone,
        agent_email: lead.agent_email,
        seller_name: lead.seller_name,
        seller_phone: lead.seller_phone,
        seller_email: lead.seller_email,
      },
      property_details: { rent: lead.monthly_rent },
      underwriting: {
        arv: lead.arv,
        repairs_estimate: lead.repairs_estimate,
        existing_loan: lead.existing_loan_balance,
        existing_rate: lead.existing_loan_rate,
        existing_loan_type: lead.existing_loan_type,
      },
    };

    const pkg = generateContract(leadData, 'subto');
    log(`Contract package generated:`);
    log(`  Template: ${pkg.template}`);
    log(`  Type: ${pkg.type || 'subto'}`);
    log(`  Addenda: ${JSON.stringify(pkg.addenda)}`);
    log(`  Clauses: ${pkg.clauses ? pkg.clauses.length : 0} clauses`);
    log(`  Financials: EMD=$${pkg.financials?.emdAmount}, COE=${pkg.timeline?.coeDate}`);

    // Store in contracts table (DRAFT status — same as production)
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

  try {
    // ================================================================
    // STEP 3: Approve contract (human-in-the-loop)
    // ================================================================
    logSection('STEP 3: Approve contract');

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

  try {
    // ================================================================
    // STEP 4: Pre-flight validation
    // ================================================================
    logSection('STEP 4: Pre-flight validation');

    const leadRow = await query('SELECT * FROM leads WHERE id = $1', [testLeadId]);
    const lead = leadRow[0];
    lead.personal_guarantee = true; // Test: triggers personal guarantee addendum
    // Map DB columns to merge map fields
    lead.seller_carryback = lead.stack_principal_offer || 49000;
    lead.seller_carryback_rate = 0;
    lead.monthly_payment = 196;
    lead.buyer_name = 'Divinity Aligned LLC';
    lead.buyer_email = USER_EMAIL;

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

  let pdfBuffer;
  try {
    // ================================================================
    // STEP 5: Generate filled PDF (master + addendums)
    // ================================================================
    logSection('STEP 5: Generate filled PDF');

    const leadRow = await query('SELECT * FROM leads WHERE id = $1', [testLeadId]);
    const lead = leadRow[0];
    lead.personal_guarantee = true;
    // Map DB columns to merge map fields
    lead.seller_carryback = lead.stack_principal_offer || 49000;
    lead.seller_carryback_rate = 0;
    lead.monthly_payment = 196;
    lead.buyer_name = 'Divinity Aligned LLC';
    lead.buyer_email = USER_EMAIL;

    pdfBuffer = generateFilledPdf('subto', lead);
    log(`PDF generated: ${pdfBuffer.length} bytes (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);

    // Save to file for inspection
    fs.writeFileSync(PDF_OUTPUT, pdfBuffer);
    log(`PDF saved to: ${PDF_OUTPUT}`);

    record('5. Generate PDF', pdfBuffer.length > 0, `${(pdfBuffer.length / 1024).toFixed(1)} KB`);
  } catch (err) {
    record('5. Generate PDF', false, err.message);
    throw err;
  }

  try {
    // ================================================================
    // STEP 6: Verify merge fields in PDF
    // ================================================================
    logSection('STEP 6: Verify merge fields');

    const leadRow = await query('SELECT * FROM leads WHERE id = $1', [testLeadId]);
    const lead = leadRow[0];
    lead.personal_guarantee = true;
    lead.seller_carryback = lead.stack_principal_offer || 49000;
    lead.seller_carryback_rate = 0;
    lead.monthly_payment = 196;
    lead.buyer_name = 'Divinity Aligned LLC';
    lead.buyer_email = USER_EMAIL;

    // Get the master template text, fill it, and check for unresolved tokens
    const masterText = contractLibrary.getTemplateText('subto');
    const mergeMap = buildMergeMap(lead);
    const filledText = fillTemplate(masterText, mergeMap);

    // Check for unresolved [TOKEN] patterns
    const unresolved = filledText.match(/\[[A-Z_]{3,}\]/g);
    const realUnresolved = unresolved ? unresolved.filter(t => t.length > 4 && !t.includes(' ')) : [];

    // Check for blank fields that are NOT signature/initial lines
    const blankRegex = /_{5,}/g;
    let blankMatch;
    const dealBlanks = [];
    while ((blankMatch = blankRegex.exec(filledText)) !== null) {
      const start = Math.max(0, blankMatch.index - 40);
      const ctx = filledText.substring(start, Math.min(120, filledText.length - start));
      // Skip signature, initial, signer name/title lines (handwritten at signing)
      // Also skip legitimate optional fields (legal description, 2nd mortgage, HOA, cure defaults, net to seller, "Other" expense)
      const skipPatterns = ['Signature', 'Initials', 'Name of Signer', 'Its:', 'Other:', 'legal description',
                             '2nd Mortgage', 'Association', 'cure loan defaults', 'Net to Seller',
                             'Other: __', 'Date: __', 'Phone: __', 'Email: __', 'Printed Name',
                             'Legal Description', 'Legal Desc', 'Effective Date', 'latest date',
                             'as set forth below'];
      if (!skipPatterns.some(p => ctx.includes(p))) {
        dealBlanks.push(ctx.trim());
      }
    }

    log(`Unresolved tokens: ${realUnresolved.length}`);
    if (realUnresolved.length > 0) log(`  Tokens: ${[...new Set(realUnresolved)].join(', ')}`);
    log(`Deal-specific blank fields: ${dealBlanks.length}`);
    if (dealBlanks.length > 0) dealBlanks.forEach(b => log(`  BLANK: ${b}`));

    // Verify key fields are filled
    const checks = [
      { label: 'Property Address', test: filledText.includes('555 E2E Test Boulevard') },
      { label: 'Purchase Price', test: filledText.includes('195,000') },
      { label: 'Seller Name', test: filledText.includes('Test Seller Name') },
      { label: 'Buyer Name', test: filledText.includes('Divinity Aligned LLC') },
      { label: 'EMD Amount', test: filledText.includes('1,000') },
      { label: 'Inspection Days', test: filledText.includes('14') },
      { label: 'COE Days', test: filledText.includes('30') },
      { label: 'Existing Loan Balance', test: filledText.includes('145,000') },
      { label: 'Seller Carryback', test: filledText.includes('49,000') },
    ];
    checks.forEach(c => log(`  ${c.test ? '✅' : '❌'} ${c.label}: ${c.test ? 'found' : 'MISSING'}`));
    const allFieldsFilled = checks.every(c => c.test) && realUnresolved.length === 0 && dealBlanks.length === 0;

    record('6. Merge field verification', allFieldsFilled,
      `${checks.filter(c => c.test).length}/${checks.length} fields found, ${realUnresolved.length} unresolved tokens, ${dealBlanks.length} deal blanks`);
  } catch (err) {
    record('6. Merge field verification', false, err.message);
  }

  try {
    // ================================================================
    // STEP 7: Upload to RabbitSign via API
    // ================================================================
    logSection('STEP 7: Upload to RabbitSign');

    if (!rs.isConfigured()) {
      record('7. RabbitSign upload', false, 'RabbitSign not configured');
      throw new Error('RabbitSign not configured');
    }

    const leadRow = await query('SELECT * FROM leads WHERE id = $1', [testLeadId]);
    const lead = leadRow[0];

    // Use SAME email for both signers (verified: RabbitSign allows duplicates)
    const result = await rs.createFolderFromPdfBuffer(pdfBuffer, {
      title: `E2E Test - SubTo PSA - ${lead.address}`,
      summary: `E2E production test: SubTo contract for ${lead.address} at $${lead.price.toLocaleString()}`,
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

    // Update contract record (same as production /send-rabbitsign)
    await query(
      `UPDATE contracts SET status = 'sent', sent_at = now(), rabbitsign_envelope_id = $1, rabbitsign_status = $2 WHERE id = $3`,
      [folderId, 'sent', contractId]
    );
    log(`Contract status updated to 'sent'`);
  } catch (err) {
    record('7. RabbitSign upload', false, err.message);
    throw err;
  }

  try {
    // ================================================================
    // STEP 8: Verify RabbitSign accepted the document
    // ================================================================
    logSection('STEP 8: Verify RabbitSign acceptance');

    const status = await rs.getFolderStatus(folderId);
    log(`Folder status: ${JSON.stringify(status)}`);
    record('8. RabbitSign acceptance', !!status, `status=${status.status || 'unknown'}`);
  } catch (err) {
    record('8. RabbitSign acceptance', false, err.message);
  }

  try {
    // ================================================================
    // STEP 9: Verify addendums included in PDF
    // ================================================================
    logSection('STEP 9: Verify addendums');

    const leadRow = await query('SELECT * FROM leads WHERE id = $1', [testLeadId]);
    const lead = leadRow[0];
    lead.personal_guarantee = true;
    lead.seller_carryback = lead.stack_principal_offer || 49000;
    lead.seller_carryback_rate = 0;
    lead.monthly_payment = 196;
    lead.buyer_name = 'Divinity Aligned LLC';
    lead.buyer_email = USER_EMAIL;

    const { getAllAddenda } = require('../services/contract-validation');
    const allAddenda = getAllAddenda('subto', lead);
    log(`Total addendums: ${allAddenda.length}`);
    allAddenda.forEach(a => log(`  📎 ${a.name} (conditional: ${a.conditional})${a.reason ? ' — ' + a.reason : ''}`));

    const expected = ['subto-addendum', 'VA Loan Addendum', 'Personal Guarantee Addendum', 'Seller Protection Addendum'];
    const found = allAddenda.map(a => a.name);
    const missing = expected.filter(e => !found.some(f => f.includes(e.replace(/ /g, '_')) || f.toLowerCase().includes(e.toLowerCase())));

    log(`Expected: ${expected.join(', ')}`);
    log(`Found: ${found.join(', ')}`);
    log(`Missing: ${missing.length === 0 ? 'none' : missing.join(', ')}`);

    record('9. Addendum verification', missing.length === 0,
      `${allAddenda.length} addendums (expected ${expected.length})`);
  } catch (err) {
    record('9. Addendum verification', false, err.message);
  }

  try {
    // ================================================================
    // STEP 10: Verify DB records updated
    // ================================================================
    logSection('STEP 10: Verify DB records');

    const contractRow = await query('SELECT * FROM contracts WHERE id = $1', [contractId]);
    const c = contractRow[0];
    log(`Contract status: ${c.status}`);
    log(`Contract envelope ID: ${c.rabbitsign_envelope_id}`);
    log(`Contract sent_at: ${c.sent_at}`);

    const activityRows = await query('SELECT * FROM activity_log WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 5', [testLeadId]);
    log(`Activity log entries: ${activityRows.length}`);
    activityRows.forEach(a => log(`  ${a.action}: ${a.details}`));

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

  // Cancel RabbitSign folder (so no reminder emails)
  if (folderId) {
    try {
      await rs.cancelFolder(folderId);
      log(`RabbitSign folder cancelled: ${folderId}`);
    } catch (e) {
      log(`RabbitSign cancel failed: ${e.message}`);
    }
  }

  // Delete test lead + contract
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

  let report = `\n${'='.repeat(60)}\n`;
  report += `E2E PRODUCTION TEST — FINAL REPORT\n`;
  report += `${'='.repeat(60)}\n\n`;
  report += `Total steps: ${total}\n`;
  report += `Passed: ${passed} ✅\n`;
  report += `Failed: ${failed} ❌\n\n`;

  results.forEach(r => {
    report += `${r.passed ? '✅' : '❌'} ${r.step}: ${r.details || ''}\n`;
  });

  report += `\nDeliverables:\n`;
  report += `  1. Execution log: ${LOG_FILE}\n`;
  report += `  2. Generated PDF: ${PDF_OUTPUT}\n`;
  report += `  3. RabbitSign folder ID: ${folderId || 'N/A'}\n`;
  report += `  4. Contract ID: ${contractId || 'N/A'}\n`;
  report += `  5. Test lead ID: ${testLeadId || 'N/A'}\n\n`;

  if (failed === 0) {
    report += `VERDICT: ✅ PASS — System is production-ready for SubTo contracts.\n`;
  } else {
    report += `VERDICT: ❌ FAIL — ${failed} step(s) failed. Fix before production deployment.\n`;
  }

  console.log(report);
  fs.appendFileSync(LOG_FILE, report);
}

main().catch(err => {
  log(`FATAL ERROR: ${err.message}`);
  console.error('FATAL:', err);
  // Cleanup on fatal
  if (typeof folderId !== 'undefined' && folderId) { rs.cancelFolder(folderId).catch(() => {}); }
  process.exit(1);
});