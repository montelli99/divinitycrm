const test = require('node:test');
const assert = require('node:assert/strict');

const { STAGE_TRANSITIONS } = require('./stage-automations.js');

function hasAction(key, type) {
  return STAGE_TRANSITIONS[key]?.automations?.some(action => action.type === type) || false;
}

test('core transitions include SMS actions', () => {
  assert.equal(hasAction('OFFER_READY→OFFER_SENT', 'send_sms'), true);
  assert.equal(hasAction('OFFER_RECEIVED→GAIN_FEEDBACK', 'send_sms'), true);
  assert.equal(hasAction('GAIN_FEEDBACK→NO_ANSWER', 'send_sms'), true);
  assert.equal(hasAction('GAIN_FEEDBACK→SELLER_DECLINED', 'send_sms'), true);
  assert.equal(hasAction('AWAITING_TITLE→CONTRACT_OUT', 'send_sms'), true);
  assert.equal(hasAction('CONTRACT_OUT→UNDER_CONTRACT', 'send_sms'), true);
  assert.equal(hasAction('APPRAISAL_ORDERED→APPRAISAL_DONE', 'send_sms'), true);
  assert.equal(hasAction('JV_SENT→JV_SIGNED', 'send_sms'), true);
  assert.equal(hasAction('WIRE_SETUP→CLOSING_DATE', 'send_sms'), true);
});
