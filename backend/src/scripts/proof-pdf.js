/**
 * proof-pdf.js — Test command: generate a filled PDF locally for visual inspection
 *
 * Usage:
 *   node proof-pdf.js <contractType> [outputPath]
 *
 * Example:
 *   node proof-pdf.js subto ./test-subto.pdf
 *   node proof-pdf.js cash ./test-cash.pdf
 *
 * Creates a fake lead with realistic data, fills the contract, generates a PDF,
 * and saves it to the output path (default: ./proof-<type>.pdf).
 */

const path = require('path');
const { saveFilledPdf } = require('../services/pdf-generator');

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
  buyer_name: 'Divinity Aligned LLC',
  buyer_email: 'montelliscottrei@gmail.com',
  inspection_period_days: 14,
  coe_days: 30,
  coe_date: null, // will be calculated
  title_company: 'CLOSE Title',
  existing_loan_balance: 180000,
  existing_loan_type: 'Conventional',
  seller_carryback: 69500,
  seller_carryback_rate: 0.0,
  monthly_payment: 276.39,
  maturity_date: 'August 1, 2056',
  cash_at_coe: 0,
};

async function main() {
  const contractType = process.argv[2] || 'subto';
  const outputPath = process.argv[3] || path.resolve(__dirname, `proof-${contractType}.pdf`);

  console.log(`\n=== PROOF: Generate filled PDF for '${contractType}' ===\n`);

  try {
    const result = saveFilledPdf(contractType, TEST_LEAD, outputPath);
    console.log(`✅ PDF generated successfully!`);
    console.log(`   Type: ${contractType}`);
    console.log(`   Path: ${result.path}`);
    console.log(`   Size: ${(result.size / 1024).toFixed(1)} KB (${result.bytes} bytes)`);
    console.log(`\nOpen the PDF to visually inspect merge fields.`);
  } catch (err) {
    console.error(`❌ Failed: ${err.message}`);
    process.exit(1);
  }
}

main();