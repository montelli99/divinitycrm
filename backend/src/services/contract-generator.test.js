const test = require('node:test');
const assert = require('node:assert/strict');

const { generateContract, generateRabbitSignPayload } = require('./contract-generator.js');

test('generates a subto contract package', () => {
  const pkg = generateContract({
    address: '123 Main St',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    apn: 'APN123',
    price: 250000,
    contacts: {
      seller_name: 'Jane Seller',
      seller_email: 'jane@example.com',
      seller_phone: '555-111-2222',
    },
    underwriting: {
      arv: 320000,
      repairs_estimate: 30000,
      existing_loan: 180000,
      existing_rate: 0.045,
    },
    property_details: { rent: 2500 },
  }, 'subto');

  assert.equal(pkg.contractType, 'subto');
  assert.equal(pkg.property.address, '123 Main St');
  assert.equal(pkg.parties.seller, 'Jane Seller');
  assert.equal(pkg.financials.purchasePrice, 250000);
  assert.equal(pkg.timeline.inspectionPeriodDays, 14);
});

test('generates a RabbitSign payload from a contract package', () => {
  const pkg = generateContract({
    address: '123 Main St',
    price: 250000,
    contacts: { seller_name: 'Jane Seller', seller_email: 'jane@example.com' },
  }, 'cash');

  const payload = generateRabbitSignPayload(pkg, { apiKey: 'test-key', signerName: 'Jane Seller', signerEmail: 'jane@example.com' });

  assert.equal(payload.apiKey, 'test-key');
  assert.match(payload.folder.name, /123 Main St/);
  assert.equal(payload.folder.signers[0].email, 'jane@example.com');
  assert.equal(payload.folder.signers[1].name, 'Montelli Scott');
});
