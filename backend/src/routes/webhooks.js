// =============================================================
// Divinity CRM Platform — Webhooks Routes
// Clerk user sync + RabbitSign completion
// =============================================================

const { Router } = require('express');
const { sql } = require('../db/connection');
const { v4: uuid } = require('uuid');

const router = Router();

// POST /api/webhooks/clerk — Clerk user creation/update webhook
// Clerk sends this when a user is created, updated, or deleted.
// Configure in Clerk Dashboard → Webhooks → Add Endpoint: [YOUR_URL]/api/webhooks/clerk
// Events to subscribe to: user.created, user.updated, user.deleted
router.post('/clerk', async (req, res, next) => {
  try {
    const { type, data } = req.body;
    
    if (type === 'user.created' || type === 'user.updated') {
      const { id: clerkId, email_addresses, first_name, last_name, image_url } = data;
      const email = email_addresses?.[0]?.email_address;

      if (!email) {
        return res.status(400).json({ error: 'No email address in webhook payload' });
      }

      // Upsert user
      await sql`
        INSERT INTO users (id, clerk_id, email, first_name, last_name, avatar_url)
        VALUES (${uuid()}, ${clerkId}, ${email}, ${first_name || null}, ${last_name || null}, ${image_url || null})
        ON CONFLICT (clerk_id) 
        DO UPDATE SET 
          email = EXCLUDED.email,
          first_name = COALESCE(EXCLUDED.first_name, users.first_name),
          last_name = COALESCE(EXCLUDED.last_name, users.last_name),
          avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url)
      `;

      console.log(`Clerk webhook: user ${type} — ${email}`);
    } else if (type === 'user.deleted') {
      const { id: clerkId } = data;
      if (clerkId) {
        await sql`DELETE FROM users WHERE clerk_id = ${clerkId}`;
        console.log(`Clerk webhook: user deleted — ${clerkId}`);
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Clerk webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// POST /api/webhooks/rabbitsign — RabbitSign signing completion webhook
// RabbitSign fires this when all signers complete a folder.
// Configure in RabbitSign → My Account → Developer API → Webhook URL
router.post('/rabbitsign', async (req, res, next) => {
  try {
    const { folderId, status, signers } = req.body;

    // Find the contract by RabbitSign envelope ID
    const contract = await sql`
      SELECT * FROM contracts WHERE rabbitsign_envelope_id = ${folderId}
    `;

    if (contract.length > 0) {
      await sql`
        UPDATE contracts SET rabbitsign_status = ${status} WHERE id = ${contract[0].id}
      `;

      if (status === 'completed') {
        // Update lead stage to UNDER_CONTRACT if not already
        await sql`
          UPDATE leads SET stage = 'UNDER_CONTRACT' 
          WHERE id = ${contract[0].lead_id} AND stage != 'UNDER_CONTRACT'
        `;

        // Log activity
        await sql`
          INSERT INTO activity_log (user_id, lead_id, action, details)
          VALUES (${contract[0].user_id}, ${contract[0].lead_id}, 'contract_signed', ${JSON.stringify({ folderId, status })})
        `;
      }

      console.log(`RabbitSign webhook: folder ${folderId} — ${status}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('RabbitSign webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;

