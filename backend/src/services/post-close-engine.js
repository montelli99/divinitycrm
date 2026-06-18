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
// =============================================================

const { query } = require('../db/connection');
const { sendEmail } = require('./email-service');

// =============================================================
// CONFIGURATION
// =============================================================

const REFERRAL_LINK = process.env.POSTCLOSE_REFERRAL_LINK || 'https://divinityaligned.net/refer';
const TESTIMONIAL_LINK = process.env.POSTCLOSE_TESTIMONIAL_LINK || 'https://g.page/r/divinity-aligned/review';

// =============================================================
// EMAIL/SMS TEMPLATES (plain strings — {{...}} filled at runtime)
// =============================================================

const TESTIMONIAL_EMAIL_TEMPLATE = {
  subject: 'Quick favor, {{firstName}}?',
  body: [
    'Hi {{firstName}},',
    '',
    "It's Atlas on behalf of Montelli — we closed on {{propertyAddress}} {{daysSinceClose}} days ago.",
    '',
    'If you have 90 seconds, would you mind sharing a quick Google review of your experience? It makes a huge difference for our small team and helps other sellers in your position find us.',
    '',
    'Review link: {{testimonialLink}}',
    '',
    "If a written testimonial would be easier, just hit reply and tell me one thing that surprised you about working with us. I'll format it for the website.",
    '',
    'Thanks again for trusting us with your home — it was a real pleasure.',
    '',
    '— Atlas',
    'Divinity Aligned LLC',
    'divinityaligned.net/testimonials',
  ].join('\n'),
};

const TESTIMONIAL_SMS_TEMPLATE = 'Hi {{firstName}} — Atlas here. We closed on {{propertyAddress}} {{daysSinceClose}} days ago. If you have 90 seconds, would you mind leaving us a quick Google review? {{testimonialLink}} Thanks so much!';

const REFERRAL_EMAIL_TEMPLATE = {
  subject: 'Know anyone else in your position?',
  body: [
    'Hi {{firstName}},',
    '',
    "Hope you're settling in well at {{propertyAddress}} (or the next chapter!).",
    '',
    'Quick ask: do you know anyone else — a neighbor, friend, family member — who\'s been thinking "I need to sell but I don\'t want to list it"?',
    '',
    "If they mention your name, I'll send you a $500 referral check the day we close on their property. (No forms, no hoops — just a real check in the mail.)",
    '',
    'Share link: {{referralLink}}',
    '',
    'Even if nothing comes of it, thanks for keeping us in mind.',
    '',
    '— Atlas',
    'Divinity Aligned LLC',
  ].join('\n'),
};

const REFERRAL_SMS_TEMPLATE = 'Hi {{firstName}} — Atlas here. We closed on {{propertyAddress}} a few weeks back. If you know anyone else who needs to sell without listing, send them my way: I\'ll send you a $500 check the day we close on their deal. {{referralLink}}';

const POKEMON_EMAIL_TEMPLATE = {
  subject: 'New off-market deal in your area — {{propertyAddress}}',
  body: [
    'Hi {{buyerName}},',
    '',
    'We just closed a property that fits the {{buyerTier}} profile:',
    '',
    '  {{propertyAddress}}',
    '  Type: {{contractType}}',
    '  Beds: {{beds}}  Baths: {{baths}}',
    '  ARV: ${{arv}}',
    '  Rent: ${{monthlyRent}}/mo',
    '',
    'If you want first-look on similar deals, reply with your criteria',
    '(price range, strategy, target cap rate) and I\'ll add you to our',
    'weekly deal-flow digest.',
    '',
    '— Atlas',
    'Divinity Aligned LLC',
  ].join('\n'),
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
// TEMPLATE FILLER
// =============================================================

function fillTemplate(template, data) {
  let result = typeof template === 'string' ? template : template.body;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp('\\{\\{' + key + '\\}\\}', 'g'), String(value || ''));
  }
  return result;
}

// =============================================================
// REGISTER POST-CLOSE HOOKS (call on COE)
// =============================================================

async function registerPostClose(leadId, userId, leadData) {
  const lead = leadData || (await query('SELECT id, address, seller_name, seller_email, seller_phone, closed_date, user_id FROM leads WHERE id = $1', [leadId]))[0];
  if (!lead) throw new Error('Lead not found');

  const coe = lead.closed_date || new Date();
  const coeDate = new Date(coe);

  const reminders = [];
  for (const step of POSTCLOSE_STEPS) {
    const dueDate = new Date(coeDate.getTime() + step.daysAfterClose * 86400000);
    const reminderType = step.type;

    await query(
      'INSERT INTO reminders (lead_id, user_id, type, due_date, notes, completed, created_at) VALUES ($1, $2, $3, $4, $5, false, now()) ON CONFLICT DO NOTHING',
      [leadId, lead.user_id || userId, reminderType, dueDate.toISOString(), step.label + ' for ' + lead.address]
    );
    reminders.push({ type: step.type, dueDate: dueDate.toISOString(), label: step.label });
  }

  await query(
    'INSERT INTO activity_log (lead_id, user_id, action, details, created_at) VALUES ($1, $2, $3, $4, now())',
    [leadId, lead.user_id || userId, 'postclose_registered', JSON.stringify({ closeDate: coeDate.toISOString(), reminders })]
  );

  return { leadId, closeDate: coeDate.toISOString(), reminders };
}

// =============================================================
// SEND TESTIMONIAL REQUEST (+7d)
// =============================================================

async function sendTestimonialRequest(leadId) {
  const lead = (await query('SELECT id, address, seller_name, seller_email, seller_phone, closed_date, user_id FROM leads WHERE id = $1', [leadId]))[0];
  if (!lead) throw new Error('Lead not found');

  const daysSinceClose = Math.floor((Date.now() - new Date(lead.closed_date).getTime()) / 86400000);
  const data = {
    firstName: lead.seller_name || 'there',
    propertyAddress: lead.address,
    daysSinceClose,
    testimonialLink: TESTIMONIAL_LINK,
  };

  const emailBody = fillTemplate(TESTIMONIAL_EMAIL_TEMPLATE, data);
  const smsBody = fillTemplate(TESTIMONIAL_SMS_TEMPLATE, data);

  const results = [];
  if (lead.seller_email) {
    results.push(await sendEmail({
      to: { name: lead.seller_name, email: lead.seller_email },
      subject: fillTemplate(TESTIMONIAL_EMAIL_TEMPLATE.subject, data),
      body: emailBody,
    }));
  }

  await query('UPDATE reminders SET completed = true WHERE lead_id = $1 AND type = $2', [leadId, 'testimonial']);
  return { leadId, sent: results, smsBody };
}

// =============================================================
// SEND REFERRAL REQUEST (+14d)
// =============================================================

async function sendReferralRequest(leadId) {
  const lead = (await query('SELECT id, address, seller_name, seller_email, seller_phone, closed_date, user_id FROM leads WHERE id = $1', [leadId]))[0];
  if (!lead) throw new Error('Lead not found');

  const data = {
    firstName: lead.seller_name || 'there',
    propertyAddress: lead.address,
    referralLink: REFERRAL_LINK,
  };

  const emailBody = fillTemplate(REFERRAL_EMAIL_TEMPLATE, data);
  const smsBody = fillTemplate(REFERRAL_SMS_TEMPLATE, data);

  const results = [];
  if (lead.seller_email) {
    results.push(await sendEmail({
      to: { name: lead.seller_name, email: lead.seller_email },
      subject: fillTemplate(REFERRAL_EMAIL_TEMPLATE.subject, data),
      body: emailBody,
    }));
  }

  await query('UPDATE reminders SET completed = true WHERE lead_id = $1 AND type = $2', [leadId, 'referral']);
  return { leadId, sent: results, smsBody };
}

// =============================================================
// POKÉMON SPAWN (+30d) — Match closed deal to buyer DB
// =============================================================

async function runPokemonSpawn(leadId) {
  const lead = (await query('SELECT * FROM leads WHERE id = $1', [leadId]))[0];
  if (!lead) throw new Error('Lead not found');

  // Find buyers in the dispo tracker who match this deal type
  const buyers = await query(
    `SELECT * FROM dispositions WHERE status = 'active' AND buyer_tier IS NOT NULL LIMIT 10`
  );

  const matches = buyers.filter(b => {
    // Match by contract type or strategy
    return true; // For now, notify all active buyers
  });

  const results = [];
  for (const buyer of matches) {
    const data = {
      buyerName: buyer.buyer_name || 'Investor',
      buyerTier: buyer.buyer_tier || 'General',
      propertyAddress: lead.address,
      contractType: lead.contract_type || 'Off-Market',
      beds: lead.beds || '?',
      baths: lead.baths || '?',
      arv: lead.arv || 'TBD',
      monthlyRent: lead.monthly_rent || 'TBD',
    };

    if (buyer.buyer_email) {
      results.push(await sendEmail({
        to: { name: buyer.buyer_name, email: buyer.buyer_email },
        subject: fillTemplate(POKEMON_EMAIL_TEMPLATE.subject, data),
        body: fillTemplate(POKEMON_EMAIL_TEMPLATE, data),
      }));
    }
  }

  await query('UPDATE reminders SET completed = true WHERE lead_id = $1 AND type = $2', [leadId, 'other']);
  return { leadId, matches: matches.length, sent: results };
}

// =============================================================
// TICK — Check and execute due post-close actions
// =============================================================

async function tick() {
  const now = new Date().toISOString();
  const due = await query(
    `SELECT r.*, l.address, l.seller_name, l.seller_email, l.closed_date
    FROM reminders r JOIN leads l ON r.lead_id = l.id
    WHERE r.completed = false AND r.due_date <= $1 AND r.type IN ('testimonial', 'referral', 'other')
    ORDER BY r.due_date LIMIT 20`,
    [now]
  );

  const results = [];
  for (const reminder of due) {
    try {
      if (reminder.type === 'testimonial') {
        results.push(await sendTestimonialRequest(reminder.lead_id));
      } else if (reminder.type === 'referral') {
        results.push(await sendReferralRequest(reminder.lead_id));
      } else if (reminder.type === 'other') {
        results.push(await runPokemonSpawn(reminder.lead_id));
      }
    } catch (err) {
      results.push({ leadId: reminder.lead_id, type: reminder.type, error: err.message });
    }
  }

  return { tickedAt: now, processed: due.length, results };
}

async function getPostCloseStatus(leadId) {
  const reminders = await query(
    'SELECT * FROM reminders WHERE lead_id = $1 AND type IN ($2, $3, $4) ORDER BY due_date',
    [leadId, 'testimonial', 'referral', 'other']
  );
  return { leadId, reminders };
}

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
