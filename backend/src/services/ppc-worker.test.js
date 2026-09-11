'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {createPpcRuntime}=require('./ppc-worker');

test('vendored worker files match their pinned source manifest',()=>{
  const root=path.resolve(__dirname,'../../vendor/ppc-worker');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
  assert.match(manifest.source_commit,/^[a-f0-9]{40}$/);
  for(const entry of manifest.files){
    const digest=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,entry.file))).digest('hex');
    assert.equal(digest,entry.sha256,entry.file);
  }
});

test('disabled integration does not require or touch a PPC database',async()=>{
  const runtime=createPpcRuntime({});
  await runtime.start();
  assert.deepEqual(await runtime.health(),{configured:false,started:false,error:null,worker_enabled:false});
  await runtime.stop();
});
test('enabled integration fails closed without its separate database URL',async()=>{
  const runtime=createPpcRuntime({PPC_NOTE_SERVICE_ENABLED:'true'});
  await assert.rejects(runtime.start(),/PPC_AUTOMATION_DATABASE_URL/);
  assert.equal(runtime.state.configured,false);
});
