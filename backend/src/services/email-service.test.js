const test = require('node:test');
const assert = require('node:assert/strict');

const { getTransitionScripts } = require('./script-prompts.js');
const { STAGE_EMAIL_KEYS, sendStageEmail } = require('./email-service.js');

test('stage 5 uses the gain feedback transition key', () => {
  assert.equal(STAGE_EMAIL_KEYS.has('OFFER_RECEIVED→GAIN_FEEDBACK'), true);
  assert.equal(STAGE_EMAIL_KEYS.has('OFFER_SENT→GAIN_FEEDBACK'), false);
});

test('stage 5 scripts are resolved from the offer received transition', () => {
  const scripts = getTransitionScripts('OFFER_RECEIVED', 'GAIN_FEEDBACK', { address: '123 Main St' });
  assert.ok(Array.isArray(scripts));
  assert.ok(scripts.length > 0);

  const staleScripts = getTransitionScripts('OFFER_SENT', 'GAIN_FEEDBACK', { address: '123 Main St' });
  assert.deepEqual(staleScripts, []);
});

test('non-templated transitions are skipped, not treated as email failures', async () => {
  const result = await sendStageEmail('OFFER_SENT', 'GAIN_FEEDBACK', { id: 'lead-1' });
  assert.equal(result.skipped, true);
  assert.match(result.reason, /No email template/);
});
