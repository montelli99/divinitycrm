const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

let mockCalculator = {
  calculate: () => ({
    metadata: { percRule: '1.00%', dscr: 1.3, cashFlow: 300 },
    structures: [{ key: 'CASH', label: 'Cash Offer', offer: 200000 }],
    decisionMatrix: { onePercent: true, dscr: true, cashFlow: true, buyBox: true, pass: true, kill: [] },
    recommended: { label: 'Cash Offer' },
    midTermPivot: { pivot: false },
  }),
  checkBuyBox: () => ({ allPass: true, failures: [] }),
  recommendStrategy: () => ({ strategy: 'Cash', name: 'Cash Offer', contractType: 'Cash' }),
};

// Mock the calculator service before the route loads it.
require.cache[require.resolve('../services/calculator')] = {
  id: require.resolve('../services/calculator'),
  filename: require.resolve('../services/calculator'),
  loaded: true,
  exports: mockCalculator,
};

// Mock DB connection so the route loads without a real DB.
require.cache[require.resolve('../db/connection')] = {
  id: require.resolve('../db/connection'),
  filename: require.resolve('../db/connection'),
  loaded: true,
  exports: {
    query: async () => [],
    queryOne: async () => null,
    testConnection: async () => true,
  },
};

const calculatorRouter = require('./calculator.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { userId: 'u1', email: 'montelliscottrei@gmail.com' };
    next();
  });
  app.use('/api/calculator', calculatorRouter);
  return app;
}

test('POST /api/calculator/analyze returns deal analysis', async () => {
  const app = makeApp();
  const res = await request(app)
    .post('/api/calculator/analyze')
    .send({ arv: 325000, askingPrice: 250000, monthlyRent: 2500 })
    .expect(200);

  assert.equal(res.body.strategy.strategy, 'Cash');
  assert.equal(res.body.calculation.decisionMatrix.pass, true);
  assert.ok(Array.isArray(res.body.calculation.structures));
  assert.equal(res.body.calculation.structures[0].label, 'Cash Offer');
});

test('POST /api/calculator/analyze rejects missing required fields', async () => {
  const app = makeApp();
  const res = await request(app)
    .post('/api/calculator/analyze')
    .send({ arv: 325000 })
    .expect(400);

  assert.ok(res.body.error.includes('required'));
});
