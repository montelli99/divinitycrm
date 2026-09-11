'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const request=require('supertest');
const {createPpcContextWebhook}=require('./ppc-context-webhook');
const {LOCATION_ID,NOTE_WORKFLOW_ID}=require('../../vendor/ppc-worker/ppc-sales-dialer-webhook-inbox.cjs');

const valid={location:{id:LOCATION_ID},contact_id:'contact-1',workflow:{id:NOTE_WORKFLOW_ID},
  customData:{ppc_event:'team_note_changed'},note:{body:'private note'}};
function fixture({fail=false}={}){
  const saved=[];const runtime={getInbox:()=>({enqueue:async payload=>{
    saved.push(payload);if(fail)throw Error('database unavailable');return {result:'QUEUED'};
  }})};
  const app=express();app.use(express.json());app.use('/api/webhooks/ppc-context',
    createPpcContextWebhook({runtime,secret:'test-secret',maxBytes:512}));
  return {app,saved};
}
test('requires scoped bearer auth before durable enqueue',async()=>{
  const f=fixture();
  assert.equal((await request(f.app).post('/api/webhooks/ppc-context').send(valid)).status,401);
  assert.equal((await request(f.app).post('/api/webhooks/ppc-context').set('authorization','Bearer wrong').send(valid)).status,401);
  assert.equal(f.saved.length,0);
});
test('accepts only the exact PPC workflow and location',async()=>{
  for(const payload of [{...valid,workflow:{id:'other'}},{...valid,location:{id:'other'}}]){
    const f=fixture();
    assert.equal((await request(f.app).post('/api/webhooks/ppc-context').set('authorization','Bearer test-secret').send(payload)).status,403);
    assert.equal(f.saved.length,0);
  }
});
test('acknowledges only after durable enqueue and retries storage failure',async()=>{
  const f=fixture();const ok=await request(f.app).post('/api/webhooks/ppc-context').set('authorization','Bearer test-secret').send(valid);
  assert.equal(ok.status,200);assert.equal(ok.body.result,'QUEUED');assert.equal(f.saved.length,1);
  const failed=fixture({fail:true});
  assert.equal((await request(failed.app).post('/api/webhooks/ppc-context').set('authorization','Bearer test-secret').send(valid)).status,503);
});
test('rejects oversized and malformed workflow payloads',async()=>{
  const f=fixture();
  assert.equal((await request(f.app).post('/api/webhooks/ppc-context').set('authorization','Bearer test-secret').send({...valid,padding:'x'.repeat(600)})).status,413);
  assert.equal((await request(f.app).post('/api/webhooks/ppc-context').set('authorization','Bearer test-secret').send({...valid,contact_id:null})).status,400);
  assert.equal(f.saved.length,0);
});
