// =============================================================
// Divinity CRM Platform — Webhooks Routes
// Clerk user sync + RabbitSign completion
// =============================================================

const { Router } = require('express');
const { query } = require('../db/connection');
const { v4: uuid } = require('uuid');
const { verifyWebhook } = require('@clerk/backend/webhooks');

const router = Router();

// POST /api/webhooks/clerk — Clerk user creation/update webhook
// Clerk sends this when a user is created, updated, or deleted.
// Configure in Clerk Dashboard → Webhooks → Add Endpoint: [YOUR_URL]/api/webhooks/clerk
// Events to subscribe to: user.created, user.updated, user.deleted
router.post('/clerk', async (req, res, next) => {
  try {
    const webhookRequest = new Request('http://localhost/api/webhooks/clerk', {
      method: req.method,
      headers: req.headers,
      body: req.rawBody || JSON.stringify(req.body || {}),
    });
    const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET || process.env.CLERK_WEBHOOK_SECRET;
    const event = await verifyWebhook(webhookRequest, {
      signingSecret,
    });
    const { type, data } = event;

    if (type === 'user.created' || type === 'user.updated') {
      const { id: clerkId, email_addresses, first_name, last_name, image_url } = data;
      const email = email_addresses?.[0]?.email_address;

      if (!email) {
        return res.status(400).json({ error: 'No email address in webhook payload' });
      }

      // Upsert user
      await query(
        `INSERT INTO users (id, clerk_id, email, first_name, last_name, avatar_url)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (clerk_id) 
        DO UPDATE SET 
          email = EXCLUDED.email,
          first_name = COALESCE(EXCLUDED.first_name, users.first_name),
          last_name = COALESCE(EXCLUDED.last_name, users.last_name),
          avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url)`,
        [uuid(), clerkId, email, first_name || null, last_name || null, image_url || null]
      );

      console.log(`Clerk webhook: user ${type} — ${email}`);
    } else if (type === 'user.deleted') {
      const { id: clerkId } = data;
      if (clerkId) {
        await query('DELETE FROM users WHERE clerk_id = $1', [clerkId]);
        console.log(`Clerk webhook: user deleted — ${clerkId}`);
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Clerk webhook error:', err);
    const status = /webhook|signature|secret/i.test(err.message) ? 400 : 500;
    res.status(status).json({ error: 'Webhook processing failed' });
  }
});

// POST /api/webhooks/rabbitsign — RabbitSign signing completion webhook
// RabbitSign fires this when all signers complete a folder.
// Configure in RabbitSign → My Account → Developer API → Webhook URL
router.post('/rabbitsign', async (req, res, next) => {
  try {
    const rs = require('../services/rabbitsign');
    const result = await rs.handleWebhook(req.headers, req.body);
    console.log(`RabbitSign webhook handled: ${JSON.stringify(result)}`);
    res.json({ received: true, ...result });
  } catch (err) {
    console.error('RabbitSign webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

.// POST /api/webhooks/retell/call — Retell call ended/transcription webhook
// Retell sends this when a call completes and recording/transcript is available.
// Configure in Retell dashboard → Webhook URL: [YOUR_URL]/api/webhooks/retell/call
router.post('/retell/call', async (req, res, next) => {
  try {
    const {
      call_id,
      status,
      recording_url,
      transcript,
      duration,
      from_number,
      to_number,
      metadata,
    } = req.body || {};

    if (!call_id) {
      return res.status(400).json({ error: 'call_id is required' });
    }

    // Metadata is expected to contain lead_id and user_id from the outbound call request
    const leadId = metadata?.leadId || metadata?.lead_id || null;
    const userId = metadata?.userId || metadata?.user_id || null;
    const direction = from_number === process.env.RETELL_FROM_NUMBER ? 'outbound' : 'inbound';

    // Try to find lead by phone if metadata missing
    let resolvedLeadId = leadId;
    let resolvedUserId = userId;
    if (!resolvedLeadId && to_number) {
      const cleaned = String(to_number).replace(/\D/g, '');
      const rows = await query(
        'SELECT id, user_id FROM leads WHERE phone_normalized = $1 OR seller_phone = $2 OR agent_phone = $2 LIMIT 1',
        [cleaned, cleaned]
      );
      if (rows.length > 0) {
        resolvedLeadId = rows[0].id;
        resolvedUserId = rows[0].user_id;
      }
    }

    // Look up or create a communications row for this call
    const existing = await query('SELECT id FROM communications WHERE external_id = $1 LIMIT 1', [call_id]);

    if (existing.length > 0) {
      await query(
        `UPDATE communications
         SET status = $1,
             recording_url = COALESCE($2, recording_url),
             transcription = COALESCE($3, transcription),
             duration_seconds = COALESCE($4, duration_seconds),
             external_status = $5,
             sent_at = COALESCE(sent_at, now()),
             delivered_at = now()
         WHERE id = $6`,
        [status === 'completed' ? 'delivered' : status, recording_url, transcript, duration, status, existing[0].id]
      );
    } else if (resolvedUserId) {
      await query(
        `INSERT INTO communications (
           user_id, lead_id, type, direction, status, phone_number, sender_name, message_body,
           recording_url, transcription, duration_seconds, external_id, external_status,
           created_by, delivered_at
         ) VALUES ($1, $2, 'call', $3, $4, $5, 'Retell', $6, $7, $8, $9, $10, $11, $12, now())`,
        [
          resolvedUserId,
          resolvedLeadId,
          direction,
          status === 'completed' ? 'delivered' : status,
          to_number || from_number,
          transcript || '[call transcript pending]',
          recording_url,
          transcript,
          duration,
          call_id,
          status,
          resolvedUserId,
        ]
      );
    }

    console.log(`Retell call ${call_id}: ${status} ${duration}s lead=${resolvedLeadId}`);
    res.json({ received: true, callId: call_id, leadId: resolvedLeadId });
  } catch (err) {
    console.error('Retell webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// POST /api/webhooks/voipms/sms — VoIP.ms inbound SMS webhook
// Configure in VoIP.ms DID settings → SMS/MMS Webhook URL
router.post('/voipms/sms', async (req, res, next) => {
  try {
    const { id, to, from, message, date } = req.body || {};

    if (!from || !message) {
      return res.status(400).json({ error: 'from and message are required' });
    }

    const cleanedFrom = String(from).replace(/\D/g, '');
    const leadRows = await query(
      'SELECT id, user_id, seller_name, agent_name FROM leads WHERE phone_normalized = $1 OR seller_phone = $2 OR agent_phone = $2 LIMIT 1',
      [cleanedFrom, cleanedFrom]
    );

    const lead = leadRows[0] || null;
    const userId = lead?.user_id || null;

    if (userId) {
      await query(
        `INSERT INTO communications (
           user_id, lead_id, type, direction, status, phone_number, sender_name, message_body,
           external_id, created_by, delivered_at
         ) VALUES ($1, $2, 'sms', 'inbound', 'received', $3, $4, $5, $6, $7, now())`,
        [userId, lead.id, cleanedFrom, lead.seller_name || lead.agent_name || 'Unknown', message, id || null, userId]
      );
    }

    console.log(`VoIP.ms inbound SMS from ${from} lead=${lead?.id || 'unmatched'}`);
    res.type('text/plain').send('OK');
  } catch (err) {
    console.error('VoIP.ms SMS webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
