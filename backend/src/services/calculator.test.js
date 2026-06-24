const test = require('node:test');
const assert = require('node:assert/strict');

const { calculate } = require('./calculator.js');

test('calculator returns the full structure set and threshold metadata', () => {
  const result = calculate({
    arv: 325000,
    askingPrice: 250000,
    monthlyRent: 2500,
    loanAmount: 175000,
    interestRate: 0.07,
    insuranceMonthly: 120,
    existingLoanBalance: 180000,
    existingLoanRate: 0.045,
    propertyType: 'turnkey',
    equityPercent: 70,
    moveInReady: true,
  });

  assert.equal(result.structures.length, 8);
  assert.ok(result.structures.some(structure => structure.label === 'Novation'));
  assert.equal(result.metadata.dscrPass, true);
  assert.equal(result.metadata.cashFlowPass, true);
  assert.equal(result.metadata.monthlyPITI > 0, true);
  assert.equal(result.decisionMatrix.onePercent, true);
});
