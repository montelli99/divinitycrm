const test = require('node:test');
const assert = require('node:assert/strict');

// Pre-populate module cache with mocks before cron-daily.js requires them.
const queryCalls = [];
const notifications = [];

let mockLeads = [];
let mockActivity = [];
let mockUsers = [];

require.cache[require.resolve('../db/connection')] = {
  id: require.resolve('../db/connection'),
  filename: require.resolve('../db/connection'),
  loaded: true,
  exports: {
    query: async (text, params) => {
      queryCalls.push({ text, params });
      const sql = text.replace(/\s+/g, ' ').trim();
      if (sql.startsWith('SELECT id, address')) {
        return mockLeads;
      }
      if (sql.startsWith('SELECT a.id, a.action')) {
        return mockActivity;
      }
      if (sql.startsWith('SELECT id FROM users')) {
        return mockUsers;
      }
      return [];
    },
    queryOne: async () => null,
    testConnection: async () => true,
  },
};

require.cache[require.resolve('../services/notifications')] = {
  id: require.resolve('../services/notifications'),
  filename: require.resolve('../services/notifications'),
  loaded: true,
  exports: {
    createNotification: async (opts) => {
      notifications.push(opts);
      return { id: notifications.length };
    },
  },
};

const { morningBrief, eveningDigest, deliverInboxSummary } = require('./cron-daily.js');

test('morningBrief delivers a summary notification to each cron recipient', async () => {
  mockLeads = [
    { id: 1, address: '123 Main St', city: 'Dallas', state: 'TX', stage: 'LEAD_ENTERED', f50_offer: 200000 },
    { id: 2, address: '456 Oak Ave', city: 'Austin', state: 'TX', stage: 'OFFER_SENT', cash_offer: 150000 },
    { id: 3, address: '789 Pine Rd', city: 'Houston', state: 'TX', stage: 'CLOSING_DATE', f50_offer: 300000 },
  ];
  mockUsers = [{ id: 'u1' }, { id: 'u2' }];
  queryCalls.length = 0;
  notifications.length = 0;

  const results = await morningBrief();

  assert.equal(results.length, 2);
  assert.equal(notifications.length, 2);
  assert.ok(notifications.every(n => n.title === 'CRM Morning Brief'));
  assert.ok(notifications[0].body.includes('3 active leads'));
  assert.ok(notifications[0].body.includes('🎯 NEW LEAD: 1'));
  assert.ok(notifications[0].body.includes('📤 OFFER SENT: 1'));
  assert.ok(notifications[0].body.includes('🎉 CLOSING'));
  assert.ok(notifications[0].body.includes("Emily's Top Picks"));
  assert.ok(notifications[0].body.includes('[INT]'));
  assert.ok(notifications[0].body.includes('divinitycrm-ggi5.onrender.com/#/pipeline'));
});

test('eveningDigest reports stage transitions and recent activity', async () => {
  mockActivity = [
    { id: 1, action: 'stage_transition', details: JSON.stringify({ to_stage: 'OFFER_SENT' }), created_at: new Date(), address: '456 Oak Ave', first_name: 'Montelli', last_name: 'Scott' },
    { id: 2, action: 'stage_transition', details: JSON.stringify({ to_stage: 'TERMS_AGREED' }), created_at: new Date(), address: '123 Main St', first_name: 'Montelli', last_name: 'Scott' },
    { id: 3, action: 'note_added', details: null, created_at: new Date(), address: '789 Pine Rd', first_name: 'system' },
  ];
  mockUsers = [{ id: 'u1' }];
  queryCalls.length = 0;
  notifications.length = 0;

  const results = await eveningDigest();

  assert.equal(results.length, 1);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].title, 'CRM Evening Digest');
  assert.ok(notifications[0].body.includes('📤 OFFER SENT: 1'));
  assert.ok(notifications[0].body.includes('✅ TERMS AGREED: 1'));
  // The "system" actor only appears when first_name is missing; otherwise the actor name is shown.
  assert.ok(notifications[0].body.includes('system: note_added') || notifications[0].body.includes('note_added'));
  assert.ok(notifications[0].body.includes('789 Pine Rd'), `Body was: ${notifications[0].body}`);
});

test('deliverInboxSummary skips sending when no recipients exist', async () => {
  mockUsers = [];
  queryCalls.length = 0;
  notifications.length = 0;

  const results = await deliverInboxSummary('Empty Test', 'Nothing to see');

  assert.equal(results.length, 0);
  assert.equal(notifications.length, 0);
});
