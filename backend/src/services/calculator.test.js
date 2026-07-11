const test = require('node:test');
const assert = require('node:assert/strict');

const { calculate, STACK_CASH_FLOW_MIN, STACK_CASH_FLOW_SOFT } = require('./calculator.js');

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
  assert.equal(result.decisionMatrix.qualifiesForOffer, true);
});

test('calculator rejects zero or negative ARV / asking price and negative rent', () => {
  const badInputs = [
    { arv: 0, askingPrice: 250000, monthlyRent: 2500 },
    { arv: 325000, askingPrice: -1000, monthlyRent: 2500 },
    { arv: 325000, askingPrice: 250000, monthlyRent: -100 },
  ];
  for (const input of badInputs) {
    const result = calculate(input);
    assert.equal(result.error, 'Invalid input: arv, askingPrice must be positive numbers and monthlyRent must be non-negative.');
    assert.equal(result.structures.length, 0);
    assert.equal(result.decisionMatrix.pass, false);
    assert.ok(result.decisionMatrix.kill.some(k => k.includes('Invalid input')));
  }
});

test('calculator allows zero rent and still produces structures', () => {
  const result = calculate({
    arv: 325000,
    askingPrice: 250000,
    monthlyRent: 0,
    loanAmount: 175000,
    interestRate: 0.07,
    insuranceMonthly: 120,
    propertyType: 'turnkey',
  });

  assert.equal(result.error, undefined);
  assert.equal(result.structures.length, 8);
  assert.equal(result.decisionMatrix.onePercent, false);
  assert.ok(result.decisionMatrix.kill.some(k => k.includes('1% rule fails')));
  assert.ok(result.decisionMatrix.kill.some(k => k.includes('DSCR')));
});

test('calculator distinguishes offer-qualified from soft-pass on cash flow', () => {
  // Rent is high enough to pass 1% and DSCR but cash flow sits between SOFT and MIN gates.
  const monthlyRent = 2300; // 2300/250000 = 0.92% — fails 1% rule, so adjust asking price to hit 1%
  const result = calculate({
    arv: 325000,
    askingPrice: 230000, // 1% rule passes
    monthlyRent,
    loanAmount: 175000,
    interestRate: 0.07,
    insuranceMonthly: 120,
    propertyType: 'turnkey',
  });

  assert.equal(result.decisionMatrix.onePercent, true);
  assert.equal(result.decisionMatrix.dscr, true);
  assert.equal(result.decisionMatrix.cashFlowSoft, result.metadata.cashFlow >= STACK_CASH_FLOW_SOFT);
  assert.equal(result.decisionMatrix.qualifiesForOffer, result.metadata.cashFlow >= STACK_CASH_FLOW_MIN);
});
