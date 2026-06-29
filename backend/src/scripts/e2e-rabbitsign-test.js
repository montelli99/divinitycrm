/**
 * e2e-rabbitsign-test.js — End-to-end test: generate filled PDF → send to RabbitSign
 *
 * Tests the full flow: .txt master → merge fields → PDF → S3 upload → create folder
 * Does NOT touch the database — tests the RabbitSign API path only.
 *
 * Usage: node src/scripts/e2e-rabbitsign-test.js [contractType]
 */

const { generateFilledPdf } = require('../services/pdf-generator');
const rs = require('../services/rabbitsign');

const TEST_LEAD = {
  address: '456 E2E Test Lane, Richmond, VA 23220',
  city: 'Richmond',
  state: 'VA',
  zip: '23220',
  apn: '999-888-777',
  price: 175000,
  emd_amount: 500,
  seller_name: 'E2E Test Seller',
  seller_email: 'e2e-test-seller@example.com',
  seller_phone: '(804) 555-1234',
  buyer_name: 'Divinity Aligned LLC',
  buyer_email: 'montelliscottrei@gmail.com',
  inspection_period_days: 14,
  coe_days: 30,
  title_company: 'CLOSE Title',
  existing_loan_balance: 0,
  existing_loan_type: '',
};

async function main() {
  const contractType = process.argv[2] || 'cash';

  console.log('=== E2E: Filled PDF → RabbitSign ===\n');
  console.log(`Contract type: ${contractType} (no RabbitSign template — using filled PDF)`);
  console.log(`Lead: ${TEST_LEAD.address} at $${TEST_LEAD.price.toLocaleString()}\n`);

  // Step 1: Generate filled PDF
  console.log('Step 1: Generating filled PDF from .txt master...');
  const pdfBuffer = generateFilledPdf(contractType, TEST_LEAD);
  console.log(`✅ PDF generated: ${pdfBuffer.length} bytes\n`);

  // Step 2: Upload to RabbitSign via API (bypass DB)
  console.log('Step 2: Uploading filled PDF to RabbitSign...');
  if (!rs.isConfigured()) {
    console.error('❌ RabbitSign not configured. Set RABBITSIGN_API_KEY.');
    process.exit(1);
  }

  // Direct API call — no DB interaction
  const result = await rs.createFolderFromPdfBuffer(pdfBuffer, {
    title: `E2E Test - ${contractType} - ${TEST_LEAD.address}`,
    summary: `E2E test: ${contractType} contract for ${TEST_LEAD.address}`,
    date: new Date().toISOString().slice(0, 10),
    signers: [
      { name: TEST_LEAD.seller_name, email: TEST_LEAD.seller_email },
      { name: TEST_LEAD.buyer_name, email: TEST_LEAD.buyer_email },
    ],
  });

  console.log(`✅ RabbitSign folder created!`);
  console.log(`   Folder ID: ${result.folderId}`);
  console.log(`   Status: ${result.status || 'sent'}`);
  console.log(`\n=== E2E TEST PASSED ===`);
  console.log(`\nSigner will receive an email from RabbitSign to sign the filled contract.`);
  console.log(`Check: https://www.rabbitsign.com/dashboard to see the folder.`);
}

main().catch(err => {
  console.error(`\n❌ E2E TEST FAILED: ${err.message}`);
  process.exit(1);
});