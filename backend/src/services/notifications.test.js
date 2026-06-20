const test = require('node:test');
const assert = require('node:assert/strict');

const { STAGE_NOTIFICATION_RECIPIENTS } = require('./notifications.js');

test('stage notification map uses current stage transitions', () => {
  assert.equal(STAGE_NOTIFICATION_RECIPIENTS['CONTACT_MADE:OFFER_READY'] != null, true);
  assert.equal(STAGE_NOTIFICATION_RECIPIENTS['OFFER_READY:OFFER_SENT'] != null, true);
  assert.equal(STAGE_NOTIFICATION_RECIPIENTS['OFFER_RECEIVED:GAIN_FEEDBACK'] != null, true);
  assert.equal(STAGE_NOTIFICATION_RECIPIENTS['ACTIVE_NEGOTIATION:TERMS_AGREED'] != null, true);
  assert.equal(STAGE_NOTIFICATION_RECIPIENTS['TERMS_AGREED:PSA_SENT'], undefined);
  assert.equal(STAGE_NOTIFICATION_RECIPIENTS['PSA_SENT:UNDER_CONTRACT'], undefined);
});
