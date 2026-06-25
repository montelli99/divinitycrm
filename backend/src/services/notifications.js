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
  'OFFER_RECEIVED:GAIN_FEEDBACK': {
    recipients: [{ type: 'email', value: 'homewithkaylamauser@gmail.com' }],
    type: 'gain_feedback',
    titleTemplate: (lead) => `Gain Feedback: ${lead.address}`,
    bodyTemplate: (lead) => `48hr realignment call scheduled. Student will gain feedback. Address: ${lead.address}.`,
    actionUrl: (lead) => `/leads/${lead.id}`,
    actionLabel: 'View Lead',
  },
  'ACTIVE_NEGOTIATION:TERMS_AGREED': {
    recipients: [
      { type: 'email', value: 'homewithkaylamauser@gmail.com' },
      { type: 'email', value: 'JaxonDeasonHomes1@gmail.com' },
    ],
    type: 'contract_draft',
    titleTemplate: (lead) => `Contract Draft Ready: ${lead.address}`,
    bodyTemplate: (lead) => `Terms are agreed and the contract draft is ready for review. Address: ${lead.address}.`,
    actionUrl: (lead) => `/leads/${lead.id}`,
    actionLabel: 'View Lead',
  },
  'TERMS_AGREED:AWAITING_TITLE': {
    recipients: [
      { type: 'email', value: 'homewithkaylamauser@gmail.com' },
    ],
    type: 'contract_drafted',
    titleTemplate: (lead) => `Contract Drafted: ${lead.address}`,
    bodyTemplate: (lead) => `Contract has been drafted and the TC handoff is next. Address: ${lead.address}.`,
    actionUrl: (lead) => `/leads/${lead.id}`,
    actionLabel: 'Open Lead',
  },
  'AWAITING_TITLE:CONTRACT_OUT': {
    recipients: [
      { type: 'email', value: 'BGonzalez@sellsmartre.com' },
      { type: 'email', value: 'monique@sellsmartre.com' },
    ],
    type: 'tc_takeover',
    titleTemplate: (lead) => `TC Takeover: ${lead.address}`,
    bodyTemplate: (lead) => `Contract is out and TC owns the next steps: inspection, appraisal, and title coordination. Address: ${lead.address}.`,
    actionUrl: (lead) => `/leads/${lead.id}`,
    actionLabel: 'View Lead',
  },
  'CONTRACT_OUT:UNDER_CONTRACT': {
    recipients: [
      { type: 'email', value: 'BGonzalez@sellsmartre.com' },
      { type: 'email', value: 'monique@sellsmartre.com' },
    ],
    type: 'under_contract',
    titleTemplate: (lead) => `Under Contract: ${lead.address}`,
    bodyTemplate: (lead) => `Contract is fully executed. Inspection and appraisal coordination starts now. Address: ${lead.address}.`,
    actionUrl: (lead) => `/leads/${lead.id}`,
    actionLabel: 'View Lead',
  },
  'INSPECTION_PERIOD:INSPECTION_COMPLETE': {
    recipients: [
      { type: 'email', value: 'homewithkaylamauser@gmail.com' },
    ],
    type: 'inspection_complete',
    titleTemplate: (lead) => `Inspection Complete: ${lead.address}`,
    bodyTemplate: (lead) => `Inspection period finished. Ready to move to appraisal. Address: ${lead.address}.`,
    actionUrl: (lead) => `/leads/${lead.id}`,
    actionLabel: 'View Lead',
  },
  'INSPECTION_COMPLETE:APPRAISAL_ORDERED': {
    recipients: [
      { type: 'email', value: 'homewithkaylamauser@gmail.com' },
    ],
    type: 'appraisal_ordered',
    titleTemplate: (lead) => `Appraisal Ordered: ${lead.address}`,
    bodyTemplate: (lead) => `Inspection complete — appraisal has been ordered. Address: ${lead.address}.`,
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
  let emailsSent = 0;
  let emailsFailed = 0;
  for (const recipientSpec of config.recipients) {
    let recipientId = null;
    let recipientEmail = null;
    let recipientName = null;
    if (recipientSpec.type === 'email') {
      recipientEmail = recipientSpec.value;
      recipientName = recipientSpec.value.split('@')[0];
      recipientId = await getUserByEmail(recipientSpec.value);
      // If user not in users table, still send email but skip in-app notification
      // (don't fail the whole notify just because recipient hasn't signed up yet)
    } else if (recipientSpec.type === 'role') {
      const roleIds = await getUsersByRole(recipientSpec.value);
      for (const rid of roleIds) {
        const u = await query('SELECT email, first_name FROM users WHERE id = $1', [rid]);
        recipientEmail = u[0]?.email;
        recipientName = u[0]?.first_name || recipientEmail?.split('@')[0] || 'Team';
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
        // Real email delivery
        if (recipientEmail) {
          const r = await sendRealEmailForNotification({
            recipientEmail,
            recipientName,
            title: config.titleTemplate(leadData),
            body: config.bodyTemplate(leadData),
            leadId: leadData.id,
          });
          if (r.sent) emailsSent++;
          else emailsFailed++;
        }
      }
      continue;
    }

    // Only create in-app notification if user is in users table
    if (recipientId) {
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
    } else {
      console.warn(`[notifications] ${recipientEmail} not in users table — sending email only, skipping in-app`);
    }
    // Real email delivery for direct-email recipients (always attempt)
    if (recipientEmail) {
      const r = await sendRealEmailForNotification({
        recipientEmail,
        recipientName,
        title: config.titleTemplate(leadData),
        body: config.bodyTemplate(leadData),
        leadId: leadData.id,
      });
      if (r.sent) emailsSent++;
      else emailsFailed++;
    }
  }

  return { fired, emailsSent, emailsFailed };
}

// =============================================================
// Send real email via SMTP or AgentMail (in addition to in-app inbox)
// =============================================================

async function sendRealEmailForNotification({ recipientEmail, recipientName, title, body, leadId }) {
  const { sendEmail } = require('./email-service');
  const result = await sendEmail({
    to: { email: recipientEmail, name: recipientName },
    subject: title,
    body: `${body}\n\n---\nOpen in CRM: https://divinitycrm.onrender.com/leads/${leadId}\n\nAtlas (Divinity CRM)`,
  });
  if (result.sent) {
    console.log(`[notifications] Real email sent via ${result.channel}: ${title} → ${recipientEmail}`);
  } else {
    console.warn(`[notifications] Real email FAILED: ${title} → ${recipientEmail}: ${result.reason || result.error}`);
  }
  return result;
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
  STAGE_NOTIFICATION_RECIPIENTS,
};
