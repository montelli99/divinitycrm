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
  const whereClause = buildCommunicationsWhere(filters, params);
  const limit = normalizeLimit(filters.limit, 50, 200);

  params.push(limit);
  const rows = await dbQuery(
    `SELECT id, user_id, lead_id, opportunity_id, type, direction, status, phone_number, email_address,
            sender_name, recipient_name, subject, message_body, external_id, external_status,
            recording_url, transcription, duration_seconds, template_key, stage,
            scheduled_at, sent_at, delivered_at, failed_reason, created_by, created_at
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
       scheduled_at, sent_at, delivered_at, failed_reason, created_by
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13, $14,
       $15, $16, $17, $18, $19,
       $20, $21, $22, $23, $24
     )
     RETURNING id, user_id, lead_id, opportunity_id, type, direction, status, phone_number, email_address,
               sender_name, recipient_name, subject, message_body, external_id, external_status,
               recording_url, transcription, duration_seconds, template_key, stage,
               scheduled_at, sent_at, delivered_at, failed_reason, created_by, created_at`,
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
      createdBy,
    ]
  );

  return rows[0] || null;
}

module.exports = {
  createCommunication,
  listCommunications,
  normalizeLimit,
};
