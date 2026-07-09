const { query } = require('../db/connection');
const { createNotification } = require('../services/notifications');
const { TEAM_VIEW_ROLES, TEAM_VIEW_EMAILS } = require('../services/access');

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

async function getCronRecipients() {
  const roles = Array.from(TEAM_VIEW_ROLES);
  const emails = Array.from(TEAM_VIEW_EMAILS);
  return query(
    `SELECT id FROM users WHERE role = ANY($1::text[]) OR email = ANY($2::text[])`,
    [roles, emails]
  );
}

async function deliverInboxSummary(title, text) {
  const recipients = await getCronRecipients();
  const results = [];
  for (const recipient of recipients) {
    const result = await createNotification({
      recipientId: recipient.id,
      type: 'cron_summary',
      title,
      body: text,
      actionUrl: '/notifications',
      actionLabel: 'Open Inbox',
    });
    results.push(result);
  }
  return results;
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

  const text = `CRM Morning Brief — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}\n\n${leads.length} active leads\n\n${stageSummary}${closingsText}${contractAuditText}\n\nOpen pipeline: divinitycrm-ggi5.onrender.com/#/pipeline`;
  return await deliverInboxSummary('CRM Morning Brief', text);
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

  const text = `CRM Evening Digest — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}\n\nStage moves today:\n${stageSummary}\n\nRecent activity:\n${recentActions}`;
  return await deliverInboxSummary('CRM Evening Digest', text);
}

module.exports = { morningBrief, eveningDigest, deliverInboxSummary };

if (require.main === module) {
  const arg = process.argv[2];
  if (arg === 'morning') morningBrief().then(r => { console.log('Sent morning brief'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
  else if (arg === 'evening') eveningDigest().then(r => { console.log('Sent evening digest'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
  else { console.error('Usage: node cron-daily.js morning|evening'); process.exit(1); }
}
