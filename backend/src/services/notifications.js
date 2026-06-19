// =============================================================
// Divinity CRM — Notifications Service
// =============================================================
// In-app notification inbox with role-based routing.
// Replaces SMTP emails for team coordination.

const { query } = require('../db/connection');

// =============================================================
// Create a notification
// =============================================================

async function createNotification({ recipientId, leadId = null, type, title, body, actionUrl = null, actionLabel = null }) {
  await query(
    `INSERT INTO notifications (recipient_id, lead_id, type, title, body, action_url, action_label)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [recipientId, leadId, type, title, body, actionUrl, actionLabel]
  );
}

// =============================================================
// Resolve recipient(s) by role or email
// =============================================================

async function getUserByEmail(email) {
  const r = await query('SELECT id FROM users WHERE email = $1', [email]);
  return r[0]?.id || null;
}

async function getUsersByRole(role) {
  const r = await query('SELECT id FROM users WHERE role = $1', [role]);
  return r.map(x => x.id);
}

// =============================================================
// Stage-triggered notifications (replaces send_email)
// =============================================================

const STAGE_NOTIFICATION_RECIPIENTS = {
  // Stage transition -> { recipients: ['email' | 'role'], type, title template, body template, actionUrl }
  'CONTACT_MADE:OFFER_READY': {
    recipients: [{ type: 'email', value: 'claytoninvestmentsolutions@gmail.com' }],
    type: 'loi_request',
    titleTemplate: (lead) => `LOI Request: ${lead.address}`,
    bodyTemplate: (lead) => `New deal needs your underwriting review. Address: ${lead.address}. Price: $${Number(lead.price).toLocaleString()}. Monthly rent: $${Number(lead.monthly_rent).toLocaleString()}. ARV: $${Number(lead.arv).toLocaleString()}.`,
    actionUrl: (lead) => `/leads/${lead.id}`,
    actionLabel: 'Open Lead',
  },
  'OFFER_READY:OFFER_SENT': {
    recipients: [{ type: 'email', value: 'homewithkaylamauser@gmail.com' }],
    type: 'loi_ready',
    titleTemplate: (lead) => `LOI Ready: ${lead.address}`,
    bodyTemplate: (lead) => `LOI has been sent to seller. Please monitor for response within 48 hours. Address: ${lead.address}.`,
    actionUrl: (lead) => `/leads/${lead.id}`,
    actionLabel: 'View LOI',
  },
  'OFFER_SENT:GAIN_FEEDBACK': {
    recipients: [{ type: 'email', value: 'homewithkaylamauser@gmail.com' }],
    type: 'gain_feedback',
    titleTemplate: (lead) => `Gain Feedback: ${lead.address}`,
    bodyTemplate: (lead) => `48hr realignment call scheduled. Student will gain feedback. Address: ${lead.address}.`,
    actionUrl: (lead) => `/leads/${lead.id}`,
    actionLabel: 'View Lead',
  },
  'TERMS_AGREED:PSA_SENT': {
    recipients: [
      { type: 'email', value: 'homewithkaylamauser@gmail.com' },
    ],
    type: 'psa_sent',
    titleTemplate: (lead) => `PSA Sent: ${lead.address}`,
    bodyTemplate: (lead) => `Kayla has sent the PSA to the seller for review and authorization. Address: ${lead.address}.`,
    actionUrl: (lead) => `/leads/${lead.id}`,
    actionLabel: 'View Lead',
  },
  'PSA_SENT:UNDER_CONTRACT': {
    // Per Master Playbook Part 7: TC takes over here — inspection, appraisal, title
    recipients: [
      { type: 'email', value: 'homewithkaylamauser@gmail.com' },
    ],
    type: 'tc_takeover',
    titleTemplate: (lead) => `TC Takeover: ${lead.address}`,
    bodyTemplate: (lead) => `PSA authorized. Contract is now fully executed. TC takes over next steps per Master Playbook Part 7: (1) Kayla arranges home inspector + sewer scope, (2) After completed, appraisal ordered, (3) Montelli contacts title for wiring instructions. Standard 30 day closing. Address: ${lead.address}.`,
    actionUrl: (lead) => `/leads/${lead.id}`,
    actionLabel: 'View Lead',
  },
};

// =============================================================
// Fire notifications for a stage transition
// =============================================================

async function fireStageNotifications(fromStage, toStage, leadData) {
  const key = `${fromStage}:${toStage}`;
  const config = STAGE_NOTIFICATION_RECIPIENTS[key];
  if (!config) return { fired: 0 };

  let fired = 0;
  for (const recipientSpec of config.recipients) {
    let recipientId = null;
    if (recipientSpec.type === 'email') {
      recipientId = await getUserByEmail(recipientSpec.value);
      if (!recipientId) {
        console.warn(`[notifications] Recipient ${recipientSpec.value} not found in users table`);
        continue;
      }
    } else if (recipientSpec.type === 'role') {
      const roleIds = await getUsersByRole(recipientSpec.value);
      for (const rid of roleIds) {
        await createNotification({
          recipientId: rid,
          leadId: leadData.id,
          type: config.type,
          title: config.titleTemplate(leadData),
          body: config.bodyTemplate(leadData),
          actionUrl: config.actionUrl?.(leadData) || null,
          actionLabel: config.actionLabel || null,
        });
        fired++;
      }
      continue;
    }

    await createNotification({
      recipientId,
      leadId: leadData.id,
      type: config.type,
      title: config.titleTemplate(leadData),
      body: config.bodyTemplate(leadData),
      actionUrl: config.actionUrl?.(leadData) || null,
      actionLabel: config.actionLabel || null,
    });
    fired++;
  }

  return { fired };
}

// =============================================================
// Mark notifications read
// =============================================================

async function markRead(notificationId, userId) {
  await query(
    `UPDATE notifications SET read_at = NOW()
     WHERE id = $1 AND recipient_id = $2 AND read_at IS NULL`,
    [notificationId, userId]
  );
}

async function markAllRead(userId) {
  await query(
    `UPDATE notifications SET read_at = NOW()
     WHERE recipient_id = $1 AND read_at IS NULL`,
    [userId]
  );
}

async function archive(notificationId, userId) {
  await query(
    `UPDATE notifications SET archived_at = NOW()
     WHERE id = $1 AND recipient_id = $2`,
    [notificationId, userId]
  );
}

// =============================================================
// Fetch notifications for a user (with filters)
// =============================================================

async function getNotificationsForUser(userId, { filter = 'all', limit = 50 } = {}) {
  let where = `WHERE recipient_id = $1 AND archived_at IS NULL`;
  if (filter === 'unread') where += ` AND read_at IS NULL`;
  if (filter === 'me') where += ` AND recipient_id = $1`;

  const r = await query(
    `SELECT n.*, l.address as lead_address
     FROM notifications n
     LEFT JOIN leads l ON n.lead_id = l.id
     ${where}
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  const unreadCount = await query(
    `SELECT COUNT(*) as count FROM notifications WHERE recipient_id = $1 AND read_at IS NULL AND archived_at IS NULL`,
    [userId]
  );

  return {
    notifications: r,
    unreadCount: parseInt(unreadCount[0].count),
  };
}

module.exports = {
  createNotification,
  fireStageNotifications,
  markRead,
  markAllRead,
  archive,
  getNotificationsForUser,
  getUserByEmail,
  getUsersByRole,
};