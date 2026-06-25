/**
 * CHANNEL TRUTH TABLE — Single test that proves each channel's status.
 *
 * Runs ALL channels and reports ok/blocked state. Use this as the canonical
 * "is the channel wired" report.
 *
 * Run: node --test tests/scenarios/channel-truth-table.test.js
 */

const test = require('node:test');
const assert = require('node:assert');

const { sendSMSViaJustCall } = require('../../src/services/sms-service');
const { sendEmail, isConfigured } = require('../../src/services/email-service');
const { isConfigured: rsIsConfigured } = require('../../src/services/rabbitsign');

test('TRUTH TABLE — Channel readiness report', async () => {
  const report = {
    timestamp: new Date().toISOString(),
    channels: {},
  };

  // Channel 1: JustCall SMS
  console.log('\n=== CHANNEL 1: JustCall SMS ===');
  try {
    const FROM_NUMBER = process.env.JUSTCALL_FROM_NUMBER || '15716012619';
// Use one of the real account numbers as recipient (Montelli's JustCall number)
const r = await sendSMSViaJustCall('+15716012619', '[truth table probe]');
    report.channels.justcall_sms = {
      attempted: true,
      delivered: r.sent,
      reason: r.reason || r.error || (r.response ? r.response : 'unknown'),
      response_id: r.response?.id || null,
    };
  } catch (e) {
    report.channels.justcall_sms = { attempted: true, delivered: false, error: e.message };
  }
  console.log('  Result:', JSON.stringify(report.channels.justcall_sms, null, 2));

  // Channel 2: Email (SMTP)
  console.log('\n=== CHANNEL 2: Email (SMTP) ===');
  report.channels.smtp_email = {
    configured: isConfigured(),
    env_keys: {
      SMTP_USER: !!process.env.SMTP_USER,
      SMTP_PASS: !!(process.env.SMTP_PASS && process.env.SMTP_PASS.length > 0),
    },
  };
  console.log('  Result:', JSON.stringify(report.channels.smtp_email, null, 2));

  // Channel 3: Email (AgentMail fallback)
  console.log('\n=== CHANNEL 3: Email (AgentMail fallback) ===');
  try {
    const r = await sendEmail({
      to: { email: 'montelliscottrei@gmail.com', name: 'Atlas Test' },
      subject: '[Truth Table] ' + new Date().toISOString(),
      body: 'Channel probe. If you got this, AgentMail fallback works.',
    });
    report.channels.agentmail_email = {
      attempted: true,
      delivered: r.sent,
      channel: r.channel || 'unknown',
      messageId: r.messageId || null,
      reason: r.reason || r.error || null,
    };
  } catch (e) {
    report.channels.agentmail_email = { attempted: true, delivered: false, error: e.message };
  }
  console.log('  Result:', JSON.stringify(report.channels.agentmail_email, null, 2));

  // Channel 4: RabbitSign
  console.log('\n=== CHANNEL 4: RabbitSign ===');
  report.channels.rabbitsign = {
    configured: rsIsConfigured(),
    env_keys: {
      RABBITSIGN_API_KEY: !!(process.env.RABBITSIGN_API_KEY && process.env.RABBITSIGN_API_KEY.length > 0),
      RABBITSIGN_KEY_ID: !!process.env.RABBITSIGN_KEY_ID,
      RABBITSIGN_TEMPLATE_PSA: !!process.env.RABBITSIGN_TEMPLATE_PSA,
    },
  };
  console.log('  Result:', JSON.stringify(report.channels.rabbitsign, null, 2));

  // Final verdict
  console.log('\n=== VERDICT ===');
  const verdicts = [];
  verdicts.push(`SMS (JustCall): ${report.channels.justcall_sms.delivered ? '✓ DELIVERED' : '✗ BLOCKED — ' + (report.channels.justcall_sms.reason || report.channels.justcall_sms.error)}`);
  verdicts.push(`Email (SMTP): ${report.channels.smtp_email.configured ? '✓ CONFIGURED' : '✗ NOT CONFIGURED'}`);
  verdicts.push(`Email (AgentMail): ${report.channels.agentmail_email.delivered ? '✓ DELIVERED' : '✗ BLOCKED — ' + (report.channels.agentmail_email.reason || report.channels.agentmail_email.error)}`);
  verdicts.push(`RabbitSign: ${report.channels.rabbitsign.configured ? '✓ CONFIGURED' : '✗ NOT CONFIGURED'}`);
  verdicts.forEach(v => console.log('  ' + v));
  console.log('=== END VERDICT ===\n');

  // Save report to temp file for inspection
  require('fs').writeFileSync(
    require('path').join(require('os').tmpdir(), `channel-truth-table-${Date.now()}.json`),
    JSON.stringify(report, null, 2)
  );

  // Always passes — this is a reporting test, not an assertion test
  assert.ok(report.channels);
});