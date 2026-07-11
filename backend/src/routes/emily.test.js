const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

let mockLeads = [];

let lastLimit = 50;

// Mock DB before any route loads it.
require.cache[require.resolve('../db/connection')] = {
  id: require.resolve('../db/connection'),
  filename: require.resolve('../db/connection'),
  loaded: true,
  exports: {
    query: async (text, params) => {
      const sql = text.replace(/\s+/g, ' ').trim();
      if (sql.includes('FROM leads')) {
        lastLimit = params?.[0] ?? 50;
        return mockLeads.slice(0, lastLimit);
      }
      return [];
    },
    queryOne: async () => null,
    testConnection: async () => true,
  },
};

const emilyRouter = require('./emily.js');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { userId: 'u1', email: 'montelliscottrei@gmail.com' };
    next();
  });
  app.use('/api/emily', emilyRouter);
  return app;
}

test('GET /api/emily/queue returns prioritized leads', async () => {
  mockLeads = [
    { id: 1, address: '100 Alpha Ln', city: 'Dallas', state: 'TX', stage: 'LEAD_ENTERED', updated_at: new Date() },
    { id: 2, address: '200 Beta Rd', city: 'Austin', state: 'TX', stage: 'OFFER_SENT', updated_at: new Date() },
  ];

  const app = makeApp();
  const res = await request(app).get('/api/emily/queue').expect(200);

  assert.equal(res.body.total, 2);
  assert.ok(res.body.summary.includes('🎯 NEW LEAD'));
  assert.ok(res.body.top.includes('[INT]'));
  assert.ok(Array.isArray(res.body.leads));
  assert.equal(res.body.leads[0].nextAction.script, 'INT');
});

test('GET /api/emily/queue respects limit query param cap', async () => {
  mockLeads = Array.from({ length: 110 }, (_, i) => ({
    id: i + 1,
    address: `${i + 1} Main St`,
    city: 'Dallas',
    state: 'TX',
    stage: 'LEAD_ENTERED',
    updated_at: new Date(),
  }));

  const app = makeApp();
  const res = await request(app).get('/api/emily/queue?limit=3').expect(200);

  assert.equal(lastLimit, 3);
  assert.equal(res.body.limit, 3);
});
