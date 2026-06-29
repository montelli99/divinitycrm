/**
 * proof-pdf.js — Test command: validate + generate a filled PDF locally for visual inspection
 *
 * Usage:
 *   node proof-pdf.js <contractType> [outputPath]
 *
 * Example:
 *   node proof-pdf.js subto ./proof-subto.pdf
 *   node proof-pdf.js cash ./test-cash.pdf
 *
 * Runs validation, shows issues/addendums, then generates the PDF.
 * NO RabbitSign API calls. NO emails. Local only.
 */

const path = require('path');
const { saveFilledPdf } = require('../services/pdf-generator');
const { validateContract } = require('../services/contract-validation');

// Fake lead for testing — realistic data
const TEST_LEAD = {
  id: 'test-lead-001',
  address: '123 Test Street, Arlington, VA 22201',
  city: 'Arlington',
  state: 'VA',
  zip: '22201',
  apn: '123-456-789',
  price: 250000,
  emd_amount: 500,
  seller_name: 'John TestSeller',
  seller_email: 'seller@test.com',
  seller_phone: '(555) 123-4567',
  seller_address: '789 Seller Ave, Richmond, VA 23220',
  buyer_name: 'Divinity Aligned LLC',
  buyer_email: 'montelliscottrei@gmail.com',
  buyer_phone: '(555) 987-6543',
  buyer_address: '100 Business Blvd, Suite 200, Arlington, VA 22201',
  inspection_period_days: 14,
  coe_days: 30,
  coe_date: null,
  title_company: 'CLOSE Title',
  existing_loan_balance: 180000,
  existing_loan_type: 'Conventional',
  existing_loan_payment: 1235,
  seller_carryback: 69500,
  seller_carryback_rate: 0.0,
  monthly_payment: 276.39,
  maturity_date: 'August 1, 2056',
  maturity_months: 72,
  payment_start_date: 'August 1, 2026',
  cash_at_coe: 0,
  down_payment: 25000,
  contact_phone: '555-000-0000',
  contact_name: 'Operations',
  company_name: 'Divinity Aligned LLC',
  company_website: 'divinityaligned.net',
  party_a_name: 'Party A',
  party_a_email: 'a@test.com',
  party_b_name: 'Party B',
  party_b_email: 'b@test.com',
  party_c_name: 'Party C',
  party_c_email: 'c@test.com',
  party_d_name: 'Party D',
  party_d_email: 'd@test.com',
  managing_party: 'Party A',
  party_a_percent: 25,
  party_b_percent: 25,
  party_c_percent: 25,
  party_d_percent: 25,
  party_a_payout: 15000,
  party_b_payout: 4800,
  party_c_payout: 4800,
  party_d_payout: 6400,
  party_a_seller_payment: 5000,
  party_a_assignment_fee: 10000,
  initial_capital: 5000,
  manager_authority_threshold: 2500,
  title_website: 'closedtitle.com',
  personal_property: 'All appliances to stay excluding washer and dryer',
  occupancy_status: 'Property is leased and tenant may continue in possession after COE',
  title_holding_instructions: 'TBD',
  default_interest_rate: 25,
  party_b_default_percent: 30,
  party_c_default_percent: 30,
  party_d_default_percent: 40,
  personal_guarantee: false,
};

async function main() {
  const contractType = process.argv[2] || 'subto';
  const outputPath = process.argv[3] || path.resolve(__dirname, `../../proof-${contractType}.pdf`);

  console.log(`\n=== PROOF: ${contractType.toUpperCase()} contract ===\n`);

  // Step 1: Validate
  console.log('Step 1: Pre-flight validation...');
  const validation = validateContract(contractType, TEST_LEAD);
  console.log(validation.summary);

  if (validation.issues.length > 0) {
    console.log('\nIssues:');
    for (const issue of validation.issues) {
      const icon = issue.severity === 'blocking' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      console.log(`  ${icon} [${issue.severity}] ${issue.message}`);
      if (issue.proposedFix) {
        console.log(`     Fix: ${issue.proposedFix}`);
      }
    }
  }

  if (validation.addenda.length > 0) {
    console.log('\nConditional addendums selected:');
    for (const add of validation.addenda) {
      console.log(`  📎 ${add.name} (${add.file})`);
      console.log(`     Reason: ${add.reason}`);
    }
  }

  // Step 2: Generate PDF (only if validation passes)
  if (!validation.valid) {
    console.log('\n❌ Validation failed — PDF not generated. Fix blocking issues first.');
    process.exit(1);
  }

  console.log('\nStep 2: Generating filled PDF...');
  const result = saveFilledPdf(contractType, TEST_LEAD, outputPath);
  console.log(`✅ PDF generated successfully!`);
  console.log(`   Type: ${contractType}`);
  console.log(`   Path: ${result.path}`);
  console.log(`   Size: ${(result.size / 1024).toFixed(1)} KB (${result.bytes} bytes)`);
  console.log(`\nOpen the PDF to visually inspect merge fields and addendums.`);
}

main();