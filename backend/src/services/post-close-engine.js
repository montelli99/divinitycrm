const { query } = require('../db/connection');
const { createCommunication } = require('./communications-service');

/**
 * Schedule post-close follow-up communications after a lead reaches CLOSING_DATE.
 * No messages are sent here; rows are created with status='scheduled' and a future
 * scheduled_at so a cron job can deliver them when due.
 */
async function schedulePostCloseCommunications(leadId) {
  const leadRes = await query('SELECT id, user_id, seller_name, agent_name, seller_phone, agent_phone, address, closed_date FROM leads WHERE id = $1', [leadId]);
  if (!leadRes.length) return { skipped: true, reason: 'lead not found' };
  const lead = leadRes[0];
  if (!lead.closed_date) return { skipped: true, reason: 'no closed_date' };

  const base = new Date(lead.closed_date);
  const phone = lead.seller_phone || lead.agent_phone || null;
  const recipient = lead.seller_name || lead.agent_name || 'Seller';

  const schedule = [
    { days: 7,  type: 'note', stage: 'POST_CLOSE_7',  subject: 'Post-close check-in', body: `Hi ${recipient}, just checking in after closing on ${lead.address || 'your property'}. How is everything going?` },
    { days: 14, type: 'sms',  stage: 'POST_CLOSE_14', subject: 'Referral request', body: `Hi ${recipient}, if you know anyone looking to sell a property in the area, we'd love an introduction. Thanks!` },
    { days: 30, type: 'sms',  stage: 'POST_CLOSE_30', subject: 'Testimonial request', body: `Hi ${recipient}, would you mind leaving a quick review of your experience selling ${lead.address || 'your property'}? It helps a lot.` },
  ];

  const created = [];
  for (const item of schedule) {
    const scheduledAt = new Date(base);
    scheduledAt.setDate(scheduledAt.getDate() + item.days);

    try {
      const comm = await createCommunication({
        userId: lead.user_id,
        leadId: lead.id,
        type: item.type,
        direction: 'outbound',
        status: 'scheduled',
        phoneNumber: item.type === 'sms' ? phone : null,
        recipientName: recipient,
        subject: item.subject,
        messageBody: item.body,
        stage: item.stage,
        scheduledAt: scheduledAt.toISOString(),
        createdBy: lead.user_id,
      });
      created.push({ stage: item.stage, scheduledAt, communicationId: comm.id });
    } catch (e) {
      created.push({ stage: item.stage, error: e.message });
    }
  }

  return { leadId, closedDate: base.toISOString(), created };
}

module.exports = { schedulePostCloseCommunications };
