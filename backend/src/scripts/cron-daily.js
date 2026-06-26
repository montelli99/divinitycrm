// 7 AM cron — post today's pipeline to Telegram topic 7220
// 7 PM cron — post today's stage transitions + activities to Telegram topic 7220
const https = require('https');
const { query } = require('../db/connection');
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TOPIC_DIVINITY_CRM } = require('../config/telegram');

const STAGE_LABELS = {
  LEAD_ENTERED: '🎯 NEW LEAD',
  CONTACT_MADE: '📞 CONTACTED',
  OFFER_READY: '📋 OFFER READY',
  OFFER_SENT: '📤 OFFER SENT',
  OFFER_RECEIVED: '📥 OFFER RECEIVED',
  GAIN_FEEDBACK: '💬 GAIN FEEDBACK',
  NO_ANSWER: '📵 NO ANSWER',
  SELLER_DECLINED: '❌ DECLINED',
  ACTIVE_NEGOTIATION: '🤝 NEGOTIATING',
  TERMS_AGREED: '✅ TERMS AGREED',
  AWAITING_TITLE: '⏳ AWAITING TITLE',
  CONTRACT_OUT: '📄 CONTRACT OUT',
  UNDER_CONTRACT: '✍️ UNDER CONTRACT',
  INSPECTION_PERIOD: '🔍 INSPECTION',
  INSPECTION_COMPLETE: '✓ INSPECTION DONE',
  APPRAISAL_ORDERED: '📊 APPRAISAL ORDERED',
  APPRAISAL_DONE: '📈 APPRAISAL DONE',
  JV_SENT: '🤝 JV SENT',
  JV_SIGNED: '✓ JV SIGNED',
  WIRE_SETUP: '💸 WIRE SETUP',
  CLOSING_DATE: '🎉 CLOSING',
};

async function getPipelineForToday() {
  // Today's active leads (not CLOSED, not DEAD) — what Emily should work today
  const r = await query(`
    SELECT id, address, city, state, zip, stage, recommended_strategy,
           cash_offer, f50_offer, f10_offer, subto_offer, novation_offer,
           updated_at
    FROM leads
    WHERE stage NOT IN ('CLOSED')
      AND stage IS NOT NULL
    ORDER BY
      CASE stage
        WHEN 'LEAD_ENTERED' THEN 1
        WHEN 'CONTACT_MADE' THEN 2
        WHEN 'OFFER_SENT' THEN 3
        WHEN 'OFFER_RECEIVED' THEN 4
        WHEN 'ACTIVE_NEGOTIATION' THEN 5
        WHEN 'TERMS_AGREED' THEN 6
        WHEN 'UNDER_CONTRACT' THEN 7
        WHEN 'CLOSING_DATE' THEN 8
        ELSE 9
      END,
      updated_at DESC
    LIMIT 50
  `);
  return r;
}

async function getTodaysActivity() {
  const r = await query(`
    SELECT a.id, a.action, a.details, a.created_at,
           l.address, l.stage,
           u.first_name, u.last_name
    FROM activity_log a
    LEFT JOIN leads l ON l.id = a.lead_id
    LEFT JOIN users u ON u.id = a.user_id
    WHERE a.created_at > NOW() - INTERVAL '12 hours'
    ORDER BY a.created_at DESC
    LIMIT 50
  `);
  return r;
}

function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('Telegram not configured — would have sent:', text.substring(0, 200));
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      message_thread_id: TOPIC_DIVINITY_CRM,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
    const opts = {
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req = https.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve(buf));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function morningBrief() {
  const leads = await getPipelineForToday();
  const counts = {};
  leads.forEach(l => { counts[l.stage] = (counts[l.stage] || 0) + 1; });
  const stageSummary = Object.entries(counts)
    .map(([stage, n]) => `${STAGE_LABELS[stage] || stage}: ${n}`)
    .slice(0, 12)
    .join('\n');

  const todaysClosings = leads.filter(l => l.stage === 'CLOSING_DATE');
  const closingsText = todaysClosings.length
    ? '\n\n🎉 <b>CLOSING TODAY</b>\n' + todaysClosings.map(l => `• ${l.address} ${l.city || ''} ${l.state || ''} ($${Number(l.f50_offer || l.cash_offer || 0).toLocaleString()})`).join('\n')
    : '';

  // Contract library audit (LRN-20260626-011) — surfaces missing source files
  // and missing RabbitSign template IDs so operators see drift immediately.
  let contractAuditText = '';
  try {
    const { auditLibrary } = require('../services/contract-library');
    const audit = auditLibrary();
    if (audit.issues.length > 0) {
      const rabbitsignMissing = audit.types
        .filter(t => !t.rabbitsignConfigured)
        .map(t => t.type);
      const sourceMissing = audit.types
        .filter(t => !t.templateConfigured)
        .map(t => t.type);
      const lines = [];
      lines.push('\n\n⚠️ <b>Contract Library Audit</b>');
      lines.push(`Source dir: ${audit.sourceDir}`);
      if (audit.liveOverride) lines.push(`Live override: ${audit.liveOverride}`);
      if (rabbitsignMissing.length > 0) {
        lines.push(`\nMissing RabbitSign template IDs (${rabbitsignMissing.length}):`);
        lines.push(rabbitsignMissing.map(t => `• ${t}`).join('\n'));
      }
      if (sourceMissing.length > 0) {
        lines.push(`\nMissing source files (${sourceMissing.length}):`);
        lines.push(sourceMissing.map(t => `• ${t}`).join('\n'));
      }
      contractAuditText = lines.join('\n');
    } else {
      contractAuditText = '\n\n✅ Contract library: all OK';
    }
  } catch (e) {
    contractAuditText = `\n\n❌ Contract library audit failed: ${e.message}`;
  }

  const text = `🌅 <b>CRM Morning Brief — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</b>\n\n${leads.length} active leads\n\n${stageSummary}${closingsText}${contractAuditText}\n\nOpen pipeline: <a href="https://divinitycrm.onrender.com/#/pipeline">divinitycrm.onrender.com</a>`;

  return await sendTelegram(text);
}

async function eveningDigest() {
  const activity = await getTodaysActivity();
  const stageTransitions = activity.filter(a => a.action === 'stage_transition');
  const others = activity.filter(a => a.action !== 'stage_transition');
  const stageCounts = {};
  stageTransitions.forEach(a => {
    let toStage;
    try {
      const d = typeof a.details === 'string' ? JSON.parse(a.details) : a.details;
      toStage = d?.to_stage || d?.stage;
    } catch {}
    if (toStage) stageCounts[toStage] = (stageCounts[toStage] || 0) + 1;
  });

  const stageSummary = Object.entries(stageCounts)
    .map(([s, n]) => `${STAGE_LABELS[s] || s}: ${n}`)
    .join('\n') || 'No stage moves today';

  const recentActions = others.slice(0, 10).map(a => {
    const actor = a.first_name ? `${a.first_name} ${a.last_name?.[0] || ''}.` : 'system';
    const lead = a.address ? ` — ${a.address}` : '';
    return `• ${actor}: ${a.action}${lead}`;
  }).join('\n') || 'No other activity';

  const text = `🌆 <b>CRM Evening Digest — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</b>\n\n<b>Stage moves today:</b>\n${stageSummary}\n\n<b>Recent activity:</b>\n${recentActions}`;

  return await sendTelegram(text);
}

module.exports = { morningBrief, eveningDigest, sendTelegram };

if (require.main === module) {
  const arg = process.argv[2];
  if (arg === 'morning') morningBrief().then(r => { console.log('Sent morning brief'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
  else if (arg === 'evening') eveningDigest().then(r => { console.log('Sent evening digest'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
  else { console.error('Usage: node cron-daily.js morning|evening'); process.exit(1); }
}