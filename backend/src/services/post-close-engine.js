// =============================================================
// Post-Close Engine Service — Divinity CRM
// =============================================================
// Built: 2026-06-18 by Atlas (Phase 6)
// Source: ghl-automations/modules/post-close-engine.js
//
// Purpose: Manage the AFTER-CLOSE lifecycle of every deal.
//   +7d  → Testimonial request (email + SMS)
//   +14d → Referral request (with $500 referral check offer)
//   +30d → Pokémon spawn: scan dispo buyer DB for local matches
//
// Idempotency: each step uses reminder type markers.
//   Never re-sends if the reminder is already completed.
// =============================================================

const { query } = require('../db/connection');
const { sendStageEmail } = require('./email-service');
const { sendStageSMS } = require('./sms-service');

// =============================================================
// CONFIGURATION
// =============================================================

const REFERRAL_LINK = process.env.POSTCLOSE_REFERRAL_LINK || 'https://divinityaligned.net/refer';
const TESTIMONIAL_LINK = process.env.POSTCLOSE_TESTIMONIAL_LINK || 'https://g.page/r/divinity-aligned/review';
const TESTIMONIAL_FROM = process.env.POSTCLOSE_TESTIMONIAL_FROM || 'atlas@divinityaligned.net';

// =============================================================
// EMAIL/SMS TEMPLATES
// =============================================================

const TESTIMONIAL_EMAIL_TEMPLATE = {
  subject: 'Quick favor, {{firstName}}?',
  body: `Hi {{firstName}},

It's Atlas on behalf of Montelli — we closed on {{propertyAddress}} {{daysSinceClose}} days ago.

If you have 90 seconds, would you mind sharing a quick Google review of your experience? It makes a huge difference for our small team and helps other sellers in your position find us.

Review link: {{testimonialLink}}

If a written testimonial would be easier, just hit reply and tell me one thing that surprised you about working with us. I'll format it for the website.

Thanks again for trusting us with your home — it was a real pleasure.

— Atlas
Divinity Aligned LLC
divinityaligned.net/testimonials`,
};

const TESTIMONIAL_SMS_TEMPLATE = `Hi {{firstName}} — Atlas here. We closed on {{propertyAddress}} {{daysSinceClose}} days ago. If you have 90 seconds, would you mind leaving us a quick Google review? {{testimonialLink}} Thanks so much!`;

const REFERRAL_EMAIL_TEMPLATE = {
  subject: 'Know anyone else in your position?',
  body: `Hi {{firstName}},

Hope you're settling in well at {{propertyAddress}} (or the next chapter!).

Quick ask: do you know anyone else — a neighbor, friend, family member — who's been thinking "I need to sell but I don't want to list it"?

If they mention your name, I'll send you a $500 referral check the day we close on their property. (No forms, no hoops — just a real check in the mail.)

Share link: {{referralLink}}

Even if nothing comes of it, thanks for keeping us in mind.

— Atlas
Divinity Aligned LLC`,
};

const REFERRAL_SMS_TEMPLATE = `Hi {{firstName}} — Atlas here. We closed on {{propertyAddress}} a few weeks back. If you know anyone else who needs to sell without listing, send them my way: I'll send you a $500 check the day we close on their deal. {{referralLink}}`;

const POKEMON_EMAIL_TEMPLATE = {
  subject: 'New off-market deal in your area — {{propertyAddress}}',
  body: `Hi {{buyerName}},

We just closed a property that fits the {{buyerTier}} profile:

  {{propertyAddress}}
  Type: {{contractType}}
  Beds: {{beds}}  Baths: {{baths}}
  ARV: ${{arv}}
  Rent: ${{monthlyRent}}/mo

If you want first-look on similar deals, reply with your criteria
(price range, strategy, target cap rate) and I'll add you to our
weekly deal-flow digest.

— Atlas
Divinity Aligned LLC`,
};

// =============================================================
// REMINDER TYPES
// =============================================================

const POSTCLOSE_STEPS = [
  { type: 'testimonial', daysAfterClose: 7, label: '+7d Testimonial Request' },
  { type: 'referral', daysAfterClose: 14, label: '+14d Referral Request' },
  { type: 'pokemon', daysAfterClose: 30, label: '+30d Pokémon Spawn (Buyer Match)' },
];

// =============================================================
// REGISTER POST-CLOSE HOOKS (call on COE)
// =============================================================

async function registerPostClose(leadId, closeDate) {
  const lead = await query('SELECT id, address, seller_name, seller_email, seller_phone, closed_date, user_id FROM leads WHERE id = $1', [leadId]);
  if (lead.length === 0) throw new Error('Lead not found');

  const coe = closeDate || lead[0].closed_date || new Date();
  const coeDate = new Date(coe);

  // Create 3 reminders: +7d testimonial, +14d referral, +30d Pokémon
  const reminders = [];
  for (const step of POSTCLOSE_STEPS) {
    const dueDate = new Date(coeDate.getTime() + step.daysAfterClose * 86400000);

    // Check if reminder already exists
    const existing = await query(
      `SELECT id FROM reminders WHERE lead_id = $1 AND type = $2 AND completed = false`,
      [leadId, step.type === 'testimonial' ? 'testimonial' : step.type === 'referral' ? 'referral' : 'other']
    );

    // Use specific reminder types
    const reminderType = step.type === 'testimonial' ? 'testimonial' : step.type === 'referral' ? 'referral' : 'other';

    await query(
      `INSERT INTO reminders (lead_id, user_id, type, due_date, notes, completed, created_at)
      VALUES ($1, $2, $3, $4, $5, false, now())`,
      [leadId, lead[0].user_id, reminderType, dueDate.toISOString(), `${step.label} for ${lead[0].address}`]
    );

    reminders.push({ type: step.type, dueDate: dueDate.toISOString(), label: step.label });
  }

  // Log registration
  await query(
    `INSERT INTO activity_log (lead_id, user_id, action, details, created_at)
    VALUES ($1, $2, 'postclose_registered', $3, now())`,
    [leadId, lead[0].user_id, JSON.stringify({
      closeDate: coeDate.toISOString(),
      reminders: reminders.map(r => ({ type: r.type, dueDate: r.dueDate })),
    })]
  );

  return { leadId, closeDate: coeDate.toISOString(), reminders };
}

// =============================================================
// SEND TESTIMONIAL REQUEST (+7d)
// =============================================================

async function sendTestimonialRequest(leadId) {
  const lead = await query(
    `SELECT id, address, seller_name, seller_email, seller_phone, closed_date, user_id FROM leads WHERE id = $1`,
    [leadId]
  );
  if (lead.length === 0) throw new Error('Lead not found');

  // Check if already sent (idempotency)
  const existing = await query(
    `SELECT id FROM activity_log WHERE lead_id = $1 AND action = 'testimonial_sent'`,
    [leadId]
  );
  if (existing.length > 0) {
    return { skipped: true, reason: 'testimonial already sent' };
  }

  const l = lead[0];
  const daysSinceClose = Math.floor((Date.now() - new Date(l.closed_date).getTime()) / 86400000);
  const firstName = (l.seller_name || 'there').split(' ')[0];

  // Build template context
  const context = {
    firstName,
    propertyAddress: l.address,
    daysSinceClose,
    testimonialLink: TESTIMONIAL_LINK,
  };

  // Send email
  let emailResult = { sent: false, reason: 'no email' };
  if (l.seller_email) {
    try {
      const subject = TESTIMONIAL_EMAIL_TEMPLATE.subject.replace('{{firstName}}', context.firstName);
      const body = TESTIMONIAL_EMAIL_TEMPLATE.body
        .replace(/\{\{firstName\}\}/g, context.firstName)
        .replace(/\{\{propertyAddress\}\}/g, context.propertyAddress)
        .replace(/\{\{daysSinceClose\}\}/g, context.daysSinceClose)
        .replace(/\{\{testimonialLink\}\}/g, context.testimonialLink);

      await sendStageEmail({
        to: l.seller_email,
        subject,
        body,
        leadId: l.id,
        type: 'testimonial_request',
      });
      emailResult = { sent: true };
    } catch (err) {
      emailResult = { sent: false, reason: err.message };
    }
  }

  // Send SMS
  let smsResult = { sent: false, reason: 'no phone' };
  if (l.seller_phone) {
    try {
      const smsBody = TESTIMONIAL_SMS_TEMPLATE
        .replace(/\{\{firstName\}\}/g, context.firstName)
        .replace(/\{\{propertyAddress\}\}/g, context.propertyAddress)
        .replace(/\{\{daysSinceClose\}\}/g, context.daysSinceClose)
        .replace(/\{\{testimonialLink\}\}/g, context.testimonialLink);

      await sendStageSMS({
        to: l.seller_phone,
        body: smsBody,
        leadId: l.id,
        type: 'testimonial_request',
      });
      smsResult = { sent: true };
    } catch (err) {
      smsResult = { sent: false, reason: err.message };
    }
  }

  // Mark reminder as completed
  await query(
    `UPDATE reminders SET completed = true, completed_at = now() WHERE lead_id = $1 AND type = 'testimonial' AND completed = false`,
    [leadId]
  );

  // Log
  await query(
    `INSERT INTO activity_log (lead_id, user_id, action, details, created_at)
    VALUES ($1, $2, 'testimonial_sent', $3, now())`,
    [leadId, l.user_id, JSON.stringify({ email: emailResult, sms: smsResult, daysSinceClose })]
  );

  return { leadId, email: emailResult, sms: smsResult, sent: emailResult.sent || smsResult.sent };
}

// =============================================================
// SEND REFERRAL REQUEST (+14d)
// =============================================================

async function sendReferralRequest(leadId) {
  const lead = await query(
    `SELECT id, address, seller_name, seller_email, seller_phone, closed_date, user_id FROM leads WHERE id = $1`,
    [leadId]
  );
  if (lead.length === 0) throw new Error('Lead not found');

  // Idempotency check
  const existing = await query(
    `SELECT id FROM activity_log WHERE lead_id = $1 AND action = 'referral_sent'`,
    [leadId]
  );
  if (existing.length > 0) {
    return { skipped: true, reason: 'referral already sent' };
  }

  const l = lead[0];
  const daysSinceClose = Math.floor((Date.now() - new Date(l.closed_date).getTime()) / 86400000);
  const firstName = (l.seller_name || 'there').split(' ')[0];

  const context = { firstName, propertyAddress: l.address, referralLink: REFERRAL_LINK };

  // Send email
  let emailResult = { sent: false, reason: 'no email' };
  if (l.seller_email) {
    try {
      const subject = REFERRAL_EMAIL_TEMPLATE.subject;
      const body = REFERRAL_EMAIL_TEMPLATE.body
        .replace(/\{\{firstName\}\}/g, context.firstName)
        .replace(/\{\{propertyAddress\}\}/g, context.propertyAddress)
        .replace(/\{\{referralLink\}\}/g, context.referralLink);

      await sendStageEmail({
        to: l.seller_email,
        subject,
        body,
        leadId: l.id,
        type: 'referral_request',
      });
      emailResult = { sent: true };
    } catch (err) {
      emailResult = { sent: false, reason: err.message };
    }
  }

  // Send SMS
  let smsResult = { sent: false, reason: 'no phone' };
  if (l.seller_phone) {
    try {
      const smsBody = REFERRAL_SMS_TEMPLATE
        .replace(/\{\{firstName\}\}/g, context.firstName)
        .replace(/\{\{propertyAddress\}\}/g, context.propertyAddress)
        .replace(/\{\{referralLink\}\}/g, context.referralLink);

      await sendStageSMS({
        to: l.seller_phone,
        body: smsBody,
        leadId: l.id,
        type: 'referral_request',
      });
      smsResult = { sent: true };
    } catch (err) {
      smsResult = { sent: false, reason: err.message };
    }
  }

  // Mark reminder as completed
  await query(
    `UPDATE reminders SET completed = true, completed_at = now() WHERE lead_id = $1 AND type = 'referral' AND completed = false`,
    [leadId]
  );

  // Log
  await query(
    `INSERT INTO activity_log (lead_id, user_id, action, details, created_at)
    VALUES ($1, $2, 'referral_sent', $3, now())`,
    [leadId, l.user_id, JSON.stringify({ email: emailResult, sms: smsResult, daysSinceClose })]
  );

  return { leadId, email: emailResult, sms: smsResult, sent: emailResult.sent || smsResult.sent };
}

// =============================================================
// POKÉMON SPAWN (+30d — buyer match alert)
// =============================================================

async function runPokemonSpawn(leadId) {
  const lead = await query(
    `SELECT id, address, city, state, price, beds, baths, sqft, arv, monthly_rent, 
            recommended_strategy, contract_type, closed_date, user_id
    FROM leads WHERE id = $1`,
    [leadId]
  );
  if (lead.length === 0) throw new Error('Lead not found');

  // Idempotency check
  const existing = await query(
    `SELECT id FROM activity_log WHERE lead_id = $1 AND action = 'pokemon_spawn'`,
    [leadId]
  );
  if (existing.length > 0) {
    return { skipped: true, reason: 'pokemon already spawned' };
  }

  const l = lead[0];

  // Search for matching buyers in dispo tracker
  // For now: find users with role='closer' who might be interested
  // In production: search dispo-tracker buyer database by market/strategy
  const buyers = await query(
    `SELECT id, email, first_name, last_name, role FROM users WHERE role IN ('closer', 'admin') AND id != $1`,
    [l.user_id]
  );

  const alertsSent = [];
  for (const buyer of buyers) {
    if (!buyer.email) continue;

    try {
      const subject = POKEMON_EMAIL_TEMPLATE.subject
        .replace('{{propertyAddress}}', l.address);
      const body = POKEMON_EMAIL_TEMPLATE.body
        .replace('{{buyerName}}', buyer.first_name || buyer.email)
        .replace('{{buyerTier}}', l.recommended_strategy || 'general')
        .replace('{{propertyAddress}}', l.address)
        .replace('{{contractType}}', l.contract_type || l.recommended_strategy || 'SubTo')
        .replace('{{beds}}', l.beds || '?')
        .replace('{{baths}}', l.baths || '?')
        .replace('{{arv}}', l.arv || 'TBD')
        .replace('{{monthlyRent}}', l.monthly_rent || 'TBD');

      await sendStageEmail({
        to: buyer.email,
        subject,
        body,
        leadId: l.id,
        type: 'pokemon_spawn',
      });
      alertsSent.push({ buyer: buyer.email, sent: true });
    } catch (err) {
      alertsSent.push({ buyer: buyer.email, sent: false, error: err.message });
    }
  }

  // Mark reminder as completed
  await query(
    `UPDATE reminders SET completed = true, completed_at = now() WHERE lead_id = $1 AND type = 'other' AND notes LIKE '%Pok%C3%A9mon%' AND completed = false`,
    [leadId]
  );

  // Log
  await query(
    `INSERT INTO activity_log (lead_id, user_id, action, details, created_at)
    VALUES ($1, $2, 'pokemon_spawn', $3, now())`,
    [leadId, l.user_id, JSON.stringify({
      address: l.address,
      strategy: l.recommended_strategy,
      buyersAlerted: alertsSent.length,
      results: alertsSent,
    })]
  );

  return { leadId, alertsSent: alertsSent.length, results: alertsSent };
}

// =============================================================
// TICK — process all due post-close hooks (for cron)
// =============================================================

async function tick() {
  const now = new Date();

  // Find leads that are at CLOSING_DATE with reminders due
  const dueReminders = await query(
    `SELECT r.*, l.address, l.seller_name, l.seller_email, l.seller_phone, l.closed_date
    FROM reminders r
    JOIN leads l ON r.lead_id = l.id
    WHERE r.completed = false
    AND r.due_date <= $1
    AND r.type IN ('testimonial', 'referral', 'other')
    AND l.stage = 'CLOSING_DATE'
    ORDER BY r.due_date ASC`,
    [now]
  );

  const results = [];

  for (const reminder of dueReminders) {
    try {
      if (reminder.type === 'testimonial') {
        const result = await sendTestimonialRequest(reminder.lead_id);
        results.push({ leadId: reminder.lead_id, type: 'testimonial', ...result });
      } else if (reminder.type === 'referral') {
        const result = await sendReferralRequest(reminder.lead_id);
        results.push({ leadId: reminder.lead_id, type: 'referral', ...result });
      } else {
        // Check if this is a Pokémon reminder
        if (reminder.notes && reminder.notes.toLowerCase().includes('pok')) {
          const result = await runPokemonSpawn(reminder.lead_id);
          results.push({ leadId: reminder.lead_id, type: 'pokemon', ...result });
        }
      }
    } catch (err) {
      results.push({ leadId: reminder.lead_id, type: reminder.type, error: err.message });
    }
  }

  console.log(`[Post-Close Engine] Tick: processed ${results.length} reminders`);
  return { processed: results.length, results };
}

// =============================================================
// GET POST-CLOSE STATUS FOR A LEAD
// =============================================================

async function getPostCloseStatus(leadId) {
  const lead = await query(
    'SELECT id, address, seller_name, closed_date, stage FROM leads WHERE id = $1',
    [leadId]
  );
  if (lead.length === 0) return null;

  const reminders = await query(
    `SELECT * FROM reminders WHERE lead_id = $1 AND type IN ('testimonial', 'referral', 'other') AND notes LIKE '%Post-Close%' OR (type = 'testimonial') OR (type = 'referral') ORDER BY due_date`,
    [leadId]
  );

  const history = await query(
    `SELECT * FROM activity_log WHERE lead_id = $1 AND action IN ('testimonial_sent', 'referral_sent', 'pokemon_spawn', 'postclose_registered') ORDER BY created_at DESC`,
    [leadId]
  );

  const daysSinceClose = lead[0].closed_date
    ? Math.floor((Date.now() - new Date(lead[0].closed_date).getTime()) / 86400000)
    : null;

  return {
    lead: lead[0],
    daysSinceClose,
    testimonialSent: history.some(h => h.action === 'testimonial_sent'),
    referralSent: history.some(h => h.action === 'referral_sent'),
    pokemonSpawned: history.some(h => h.action === 'pokemon_spawn'),
    reminders,
    history,
  };
}

// =============================================================
// EXPORT
// =============================================================

module.exports = {
  POSTCLOSE_STEPS,
  TESTIMONIAL_EMAIL_TEMPLATE,
  TESTIMONIAL_SMS_TEMPLATE,
  REFERRAL_EMAIL_TEMPLATE,
  REFERRAL_SMS_TEMPLATE,
  POKEMON_EMAIL_TEMPLATE,
  REFERRAL_LINK,
  TESTIMONIAL_LINK,
  registerPostClose,
  sendTestimonialRequest,
  sendReferralRequest,
  runPokemonSpawn,
  tick,
  getPostCloseStatus,
};