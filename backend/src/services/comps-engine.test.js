const test = require('node:test');
const assert = require('node:assert/strict');

const {
  checkBuyBox,
  estimateRepairs,
  checkOnePercentRule,
  calculateDSCR,
  calculateCashFlow,
  recommendStrategy,
  generateCompsReport,
} = require('./comps-engine.js');

test('buy box and underwriting calculators work on a passing lead', () => {
  const buyBox = checkBuyBox({ state: 'TX', population: 12000, hasHOA: false, hasPool: false, inFloodZone: false, beds: 3, price: 250000 });
  assert.equal(buyBox.allPass, true);

  const repairs = estimateRepairs('turnkey', 2000);
  assert.equal(repairs.rate, 30);
  assert.equal(repairs.estimate, 60000);

  const onePercent = checkOnePercentRule(2500, 250000);
  assert.equal(onePercent.pass, true);

  const dscr = calculateDSCR(2500, 175000, 0.07, 120, 0);
  assert.equal(typeof dscr.pass, 'boolean');

  const cashFlow = calculateCashFlow(2500, 1100, 120, 0);
  assert.equal(cashFlow.pass, true);

  const strategy = recommendStrategy({ equityPercent: 55, moveInReady: true });
  assert.equal(strategy.strategy, 'Stack50');
});

test('comps report includes summary and recommendation', () => {
  const report = generateCompsReport({
    id: 'lead-1',
    address: '123 Main St',
    state: 'TX',
    population: 15000,
    has_hoa: false,
    has_pool: false,
    in_flood_zone: false,
    beds: 3,
    price: 250000,
    monthly_rent: 2500,
    sqft: 2000,
    condition: 'turnkey',
    equity_percent: 55,
  });

  assert.equal(report.address, '123 Main St');
  assert.equal(report.summary.buyBoxPass, true);
  assert.equal(report.strategy.strategy, 'Stack50');
});
