require('dotenv').config();
const { query } = require('../db/connection');
const { updateCommunicationStatus } = require('../services/communications-service');
const { sendSMSViaVoIPMS, isConfigured } = require('../services/sms-service');

/**
 * Deliver scheduled post-close communications whose scheduled_at is due.
 * SMS delivery only runs if SMS_ENABLED=true; otherwise it stays scheduled
 * (or is marked dry_run for tracking).
 */
async function deliverScheduledCommunications() {
  const now = new Date().toISOString();
  const rows = await query(
    `SELECT id, user_id, lead_id, type, phone_number, message_body, external_status, scheduled_at
     FROM communications
     WHERE status = 'scheduled' AND scheduled_at <= $1
     ORDER BY scheduled_at
     LIMIT 100`,
    [now]
  );

  const results = [];
  for (const row of rows) {
    try {
      if (row.type === 'sms' && isConfigured()) {
        const result = await sendSMSViaVoIPMS({ to: row.phone_number, message: row.message_body });
        await updateCommunicationStatus(
          row.id,
          result.sent ? 'delivered' : 'failed',
          result.sent ? null : (result.error || 'send failed')
        );
        results.push({ id: row.id, type: row.type, status: result.sent ? 'delivered' : 'failed' });
      } else {
        // Draft-only or unsupported type: mark as dry_run
        await updateCommunicationStatus(row.id, 'pending', 'delivery disabled or unsupported type');
        results.push({ id: row.id, type: row.type, status: 'pending' });
      }
    } catch (e) {
      await updateCommunicationStatus(row.id, 'failed', e.message);
      results.push({ id: row.id, type: row.type, status: 'failed', error: e.message });
    }
  }

  return { delivered: results.length, results };
}

// Run standalone if called directly
if (require.main === module) {
  deliverScheduledCommunications()
    .then((res) => { console.log(JSON.stringify(res, null, 2)); process.exit(0); })
    .catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { deliverScheduledCommunications };
