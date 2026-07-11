const { query: defaultQuery } = require('../db/connection');

function normalizeLimit(value, fallback = 50, max = 200) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function buildCommunicationsWhere(filters, params) {
  const clauses = [];
  if (filters.userId) {
    params.push(filters.userId);
    clauses.push(`user_id = $${params.length}`);
  }
  if (filters.leadId) {
    params.push(filters.leadId);
    clauses.push(`lead_id = $${params.length}`);
  }
  if (filters.type) {
    params.push(filters.type);
    clauses.push(`type = $${params.length}`);
  }
  if (filters.direction) {
    params.push(filters.direction);
    clauses.push(`direction = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`status = $${params.length}`);
  }
  return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
}

async function listCommunications(filters = {}, dbQuery = defaultQuery) {
  const params = [];
  const clauses = [];
  const baseClause = buildCommunicationsWhere(filters, params);
  if (baseClause) clauses.push(baseClause.replace(/^WHERE\s+/, ''));
  if (!filters.includeArchived) clauses.push('archived_at IS NULL');
  const limit = normalizeLimit(filters.limit, 50, 200);

  params.push(limit);
  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await dbQuery(
    `SELECT id, user_id, lead_id, opportunity_id, type, direction, status, phone_number, email_address,
            sender_name, recipient_name, subject, message_body, external_id, external_status,
            recording_url, transcription, duration_seconds, template_key, stage,
            scheduled_at, sent_at, delivered_at, failed_reason, read_at, archived_at, created_by, created_at
      FROM communications
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params
  );

  return rows;
}

async function createCommunication(entry, dbQuery = defaultQuery) {
  const {
    userId,
    leadId = null,
    opportunityId = null,
    type,
    direction,
    status = 'pending',
    phoneNumber = null,
    emailAddress = null,
    senderName = null,
    recipientName = null,
    subject = null,
    messageBody,
    externalId = null,
    externalStatus = null,
    recordingUrl = null,
    transcription = null,
    durationSeconds = null,
    templateKey = null,
    stage = null,
    scheduledAt = null,
    sentAt = null,
    deliveredAt = null,
    failedReason = null,
    readAt = null,
    archivedAt = null,
    createdBy = null,
  } = entry || {};

  if (!userId) throw new Error('userId is required');
  if (!type) throw new Error('type is required');
  if (!direction) throw new Error('direction is required');
  if (!messageBody) throw new Error('messageBody is required');

  const rows = await dbQuery(
    `INSERT INTO communications (
       user_id, lead_id, opportunity_id, type, direction, status, phone_number, email_address,
       sender_name, recipient_name, subject, message_body, external_id, external_status,
        recording_url, transcription, duration_seconds, template_key, stage,
        scheduled_at, sent_at, delivered_at, failed_reason, read_at, archived_at, created_by
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13, $14,
       $15, $16, $17, $18, $19,
       $20, $21, $22, $23, $24, $25, $26
     )
     RETURNING id, user_id, lead_id, opportunity_id, type, direction, status, phone_number, email_address,
               sender_name, recipient_name, subject, message_body, external_id, external_status,
               recording_url, transcription, duration_seconds, template_key, stage,
               scheduled_at, sent_at, delivered_at, failed_reason, read_at, archived_at, created_by, created_at`,
    [
      userId,
      leadId,
      opportunityId,
      type,
      direction,
      status,
      phoneNumber,
      emailAddress,
      senderName,
      recipientName,
      subject,
      messageBody,
      externalId,
      externalStatus,
      recordingUrl,
      transcription,
      durationSeconds,
      templateKey,
      stage,
      scheduledAt,
      sentAt,
      deliveredAt,
      failedReason,
      readAt,
      archivedAt,
      createdBy,
    ]
  );

  return rows[0] || null;
}

async function markRead(communicationId, userId, dbQuery = defaultQuery) {
  const rows = await dbQuery(
    `UPDATE communications
     SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
     RETURNING id`,
    [communicationId, userId]
  );
  return rows[0] || null;
}

async function markAllRead(userId, dbQuery = defaultQuery) {
  const rows = await dbQuery(
    `UPDATE communications
     SET read_at = COALESCE(read_at, now())
     WHERE user_id = $1 AND archived_at IS NULL AND read_at IS NULL
     RETURNING id`,
    [userId]
  );
  return rows;
}

async function archive(communicationId, userId, dbQuery = defaultQuery) {
  const rows = await dbQuery(
    `UPDATE communications
     SET archived_at = COALESCE(archived_at, now())
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [communicationId, userId]
  );
  return rows[0] || null;
}

async function getInboxCount(userId, dbQuery = defaultQuery) {
  const rows = await dbQuery(
    `SELECT COUNT(*)::int AS count
     FROM communications
     WHERE user_id = $1 AND archived_at IS NULL`,
    [userId]
  );
  return rows[0]?.count || 0;
}

module.exports = {
  createCommunication,
  listCommunications,
  markRead,
  markAllRead,
  archive,
  getInboxCount,
  normalizeLimit,
};
