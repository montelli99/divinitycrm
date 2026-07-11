const test = require('node:test');
const assert = require('node:assert/strict');

const { createCommunication, listCommunications, markRead, markAllRead, archive, getInboxCount, normalizeLimit } = require('./communications-service');

test('normalizeLimit clamps invalid and oversized values', () => {
  assert.equal(normalizeLimit(undefined), 50);
  assert.equal(normalizeLimit('0'), 50);
  assert.equal(normalizeLimit('12'), 12);
  assert.equal(normalizeLimit('999'), 200);
});

test('createCommunication inserts a communications record', async () => {
  const calls = [];
  const inserted = {
    id: 'comm-1',
    user_id: 'user-1',
    lead_id: 'lead-1',
    type: 'sms',
    direction: 'outbound',
    status: 'scheduled',
  };

  const record = await createCommunication({
    userId: 'user-1',
    leadId: 'lead-1',
    type: 'sms',
    direction: 'outbound',
    status: 'scheduled',
    messageBody: 'Hello there',
    templateKey: 'INT',
  }, async (sql, params) => {
    calls.push({ sql, params });
    return [inserted];
  });

  assert.equal(record.id, 'comm-1');
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO communications/);
  assert.equal(calls[0].params[0], 'user-1');
  assert.equal(calls[0].params[11], 'Hello there');
});

test('listCommunications filters by user and limit', async () => {
  const calls = [];
  const rows = await listCommunications({ userId: 'user-1', limit: 10, type: 'sms' }, async (sql, params) => {
    calls.push({ sql, params });
    return [{ id: 'comm-1' }];
  });

  assert.equal(rows.length, 1);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /FROM communications/);
  assert.match(calls[0].sql, /WHERE user_id = \$1 AND type = \$2 AND archived_at IS NULL/);
  assert.equal(calls[0].params[2], 10);
});

test('markRead archives a single communications row', async () => {
  const calls = [];
  const row = await markRead('comm-1', 'user-1', async (sql, params) => {
    calls.push({ sql, params });
    return [{ id: 'comm-1' }];
  });

  assert.equal(row.id, 'comm-1');
  assert.match(calls[0].sql, /UPDATE communications/);
  assert.equal(calls[0].params[0], 'comm-1');
  assert.equal(calls[0].params[1], 'user-1');
});

test('markAllRead updates all unarchived rows', async () => {
  const calls = [];
  const rows = await markAllRead('user-1', async (sql, params) => {
    calls.push({ sql, params });
    return [{ id: 'comm-1' }, { id: 'comm-2' }];
  });

  assert.equal(rows.length, 2);
  assert.match(calls[0].sql, /UPDATE communications/);
  assert.equal(calls[0].params[0], 'user-1');
});

test('archive hides a communications row', async () => {
  const calls = [];
  const row = await archive('comm-1', 'user-1', async (sql, params) => {
    calls.push({ sql, params });
    return [{ id: 'comm-1' }];
  });

  assert.equal(row.id, 'comm-1');
  assert.match(calls[0].sql, /UPDATE communications/);
});

test('getInboxCount returns the count', async () => {
  const count = await getInboxCount('user-1', async (sql, params) => {
    assert.match(sql, /SELECT COUNT\(\*\)::int AS count/);
    assert.equal(params[0], 'user-1');
    return [{ count: 4 }];
  });

  assert.equal(count, 4);
});
