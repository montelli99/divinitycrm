const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const { createCommunicationsRouter } = require('./communications');

function buildApp(dbQuery) {
  const app = express();
  app.use(express.json());
  app.use('/api/communications', createCommunicationsRouter({
    authenticate: (req, res, next) => {
      req.user = { userId: 'user-1' };
      next();
    },
    dbQuery,
  }));
  return app;
}

test('GET /api/communications returns inbox rows', async () => {
  const calls = [];
  const app = buildApp(async (sql, params) => {
    calls.push({ sql, params });
    return [{ id: 'comm-1', type: 'sms' }];
  });

  const res = await request(app).get('/api/communications?limit=5&type=sms');

  assert.equal(res.status, 200);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.communications[0].id, 'comm-1');
  assert.equal(calls.length, 1);
});

test('POST /api/communications/sms stores an outbound message', async () => {
  const calls = [];
  const app = buildApp(async (sql, params) => {
    calls.push({ sql, params });
    return [{ id: 'comm-2', message_body: 'Testing message' }];
  });

  const res = await request(app)
    .post('/api/communications/sms')
    .send({
      leadId: 'lead-1',
      messageBody: 'Testing message',
      phoneNumber: '+15555550100',
      templateKey: 'INT',
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.communication.id, 'comm-2');
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO communications/);
});

test('POST /api/communications/sms/template validates templateKey', async () => {
  const app = buildApp(async () => []);

  const res = await request(app)
    .post('/api/communications/sms/template')
    .send({ lead: { id: 'lead-1' } });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'templateKey is required');
});
