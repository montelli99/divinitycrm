const test = require('node:test');
const assert = require('node:assert/strict');

let mockLeads = [];
require.cache[require.resolve('../db/connection')] = {
  id: require.resolve('../db/connection'),
  filename: require.resolve('../db/connection'),
  loaded: true,
  exports: {
    query: async (text, params) => {
      const sql = text.replace(/\s+/g, ' ').trim();
      if (sql.includes('FROM leads')) return mockLeads;
      return [];
    },
    queryOne: async () => null,
    testConnection: async () => true,
  },
};

const { getTodaysQueue, formatQueueForText, NEXT_ACTIONS, STAGE_LABELS } = require('./emily.js');

test('getTodaysQueue enriches leads with labels, priority, and next actions', async () => {
  mockLeads = [
    { id: 1, address: '100 Alpha Ln', city: 'Dallas', state: 'TX', stage: 'LEAD_ENTERED', updated_at: new Date() },
    { id: 2, address: '200 Beta Rd', city: 'Austin', state: 'TX', stage: 'OFFER_SENT', updated_at: new Date() },
    { id: 3, address: '300 Gamma St', city: 'Houston', state: 'TX', stage: 'CLOSING_DATE', updated_at: new Date() },
  ];

  const queue = await getTodaysQueue(50);

  assert.equal(queue.length, 3);
  assert.equal(queue[0].stage, 'LEAD_ENTERED');
  assert.equal(queue[0].label, STAGE_LABELS.LEAD_ENTERED);
  assert.equal(queue[0].nextAction.script, 'INT');
  assert.equal(queue[1].stage, 'OFFER_SENT');
  assert.equal(queue[1].nextAction.script, 'GCJ');
  assert.equal(queue[2].stage, 'CLOSING_DATE');
  assert.equal(queue[2].nextAction.script, 'COE_MINUS_7');
});

test('formatQueueForText returns stage summary and top leads', async () => {
  mockLeads = [
    { id: 1, address: '100 Alpha Ln', city: 'Dallas', state: 'TX', stage: 'LEAD_ENTERED', updated_at: new Date() },
    { id: 2, address: '200 Beta Rd', city: 'Austin', state: 'TX', stage: 'LEAD_ENTERED', updated_at: new Date() },
    { id: 3, address: '300 Gamma St', city: 'Houston', state: 'TX', stage: 'OFFER_SENT', updated_at: new Date() },
  ];

  const queue = await getTodaysQueue(50);
  const formatted = formatQueueForText(queue);

  assert.equal(formatted.total, 3);
  assert.ok(formatted.summary.includes('🎯 NEW LEAD: 2'));
  assert.ok(formatted.summary.includes('📤 OFFER SENT: 1'));
  assert.ok(formatted.top.includes('100 Alpha Ln'));
  assert.ok(formatted.top.includes('[INT]'));
});

test('NEXT_ACTIONS covers all 21 non-terminal stages', () => {
  const stages = Object.keys(STAGE_LABELS);
  for (const stage of stages) {
    assert.ok(NEXT_ACTIONS[stage], `Missing next action for ${stage}`);
    assert.ok(NEXT_ACTIONS[stage].action, `Empty action for ${stage}`);
    assert.ok(NEXT_ACTIONS[stage].owner, `Missing owner for ${stage}`);
  }
});
