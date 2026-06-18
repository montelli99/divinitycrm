// =============================================================
// Followup Alert Service — Divinity CRM
// =============================================================
// Built: 2026-06-18 by Atlas (Phase 5)
// Source: ghl-automations/modules/followup-alert.js
//
// Purpose: 48hr offer follow-up triggers and auto-escalation.
//          Scans leads at OFFER_SENT with no response for >48hr.
//          Creates reminders, logs alerts, and escalates after 72hr.
//
// Rules:
//   - 48hr: Alert to assigned user (call/text the seller)
//   - 72hr: Escalation to admin + Kayla
//   - 96hr+: Auto-mark as NO_ANSWER if still no response
// =============================================================

const { query } = require('../db/connection');

// =============================================================
// THRESHOLDS
// =============================================================

const THRESHOLDS = {
  FOLLOW_UP_48HR: 48 * 60 * 60 * 1000,   // 48 hours in ms
  ESCALATION_72HR: 72 * 60 * 60 * 1000,  // 72 hours in ms
  AUTO_NO_ANSWER: 96 * 60 * 60 * 1000,    // 96 hours in ms
};

// =============================================================
// FOLLOW-UP SCRIPT TEMPLATES
// =============================================================

const FOLLOWUP_SCRIPTS = {
  first_48hr: {
    label: '48hr Follow-up (First Call)',
    script: `Happy {day}! I'm just now finding some time to realign with you regarding {address}. I wanted to follow up on the offer we sent over — have you had a chance to review it? I'd love to answer any questions or address any concerns you might have.`,
    action: 'Call seller, then text if no answer.',
  },
  second_72hr: {
    label: '72hr Escalation (Second Attempt)',
    script: `Hi {seller_name}, this is {agent_name} following up again on {address}. We're still very interested and I'd love to discuss the offer with you. If this timing doesn't work, let me know when would be better. Looking forward to connecting!`,
    action: 'Escalate to Kayla. Call + text + email.',
  },
  final_96hr: {
    label: '96hr Auto-Transition (No Answer)',
    script: null,
    action: 'Auto-transition lead to NO_ANSWER. Send SD text. Begin 30/60/90/181 nurture.',
  },
};

// =============================================================
// SCAN FOR OVERDUE FOLLOW-UPS
// =============================================================

async function scanOverdueFollowUps({ now = new Date() } = {}) {
  const nowMs = now.getTime();

  // All leads at OFFER_SENT with follow_up_48hr_due in the past
  const overdue48 = await query(
    `SELECT id, address, seller_name, seller_phone, seller_email, user_id,
            stage, follow_up_48hr_due, follow_up_48hr_done, 
            last_stage_change_at, price, recommended_strategy
    FROM leads 
    WHERE stage = 'OFFER_SENT' 
    AND follow_up_48hr_done = false 
    AND follow_up_48hr_due < $1
    ORDER BY follow_up_48hr_due ASC`,
    [now]
  );

  // Escalation: >72hr (no follow-up done, still at OFFER_SENT)
  const escalation72 = overdue48.filter(l => {
    const hoursSince = (nowMs - new Date(l.last_stage_change_at).getTime()) / (60 * 60 * 1000);
    return hoursSince >= 72;
  });

  // Auto-transition: >96hr (no follow-up done, still at OFFER_SENT)
  const autoNoAnswer = overdue48.filter(l => {
    const hoursSince = (nowMs - new Date(l.last_stage_change_at).getTime()) / (60 * 60 * 1000);
    return hoursSince >= 96;
  });

  return {
    overdue48: overdue48.map(l => ({
      ...l,
      hoursSinceOffer: Math.round((nowMs - new Date(l.last_stage_change_at).getTime()) / (60 * 60 * 1000)),
    })),
    escalation72: escalation72.map(l => ({
      ...l,
      hoursSinceOffer: Math.round((nowMs - new Date(l.last_stage_change_at).getTime()) / (60 * 60 * 1000)),
    })),
    autoNoAnswer: autoNoAnswer.map(l => ({
      ...l,
      hoursSinceOffer: Math.round((nowMs - new Date(l.last_stage_change_at).getTime()) / (60 * 60 * 1000)),
    })),
    scannedAt: now.toISOString(),
  };
}

// =============================================================
// CREATE FOLLOW-UP ALERTS (called by pipeline-monitor or cron)
// =============================================================

async function createFollowUpAlerts(scanResult) {
  const alerts = [];

  // Process 48hr overdue
  for (const lead of scanResult.overdue48) {
    // Check if reminder already exists
    const existing = await query(
      `SELECT id FROM reminders WHERE lead_id = $1 AND type = '48hr_followup' AND completed = false`,
      [lead.id]
    );

    if (existing.length === 0) {
      // Create reminder
      await query(
        `INSERT INTO reminders (lead_id, user_id, type, due_date, notes, completed, created_at)
        VALUES ($1, $2, '48hr_followup', $3, $4, false, now())`,
        [lead.id, lead.user_id, lead.follow_up_48hr_due, `48hr follow-up overdue for ${lead.address}. ${FOLLOWUP_SCRIPTS.first_48hr.action}`]
      );

      // Log alert
      await query(
        `INSERT INTO activity_log (lead_id, user_id, action, details, created_at)
        VALUES ($1, $2, 'followup_alert_48hr', $3, now())`,
        [lead.id, lead.user_id, JSON.stringify({
          hoursSinceOffer: lead.hoursSinceOffer,
          sellerName: lead.seller_name,
          sellerPhone: lead.seller_phone,
          script: FOLLOWUP_SCRIPTS.first_48hr.script,
        })]
      );

      alerts.push({
        type: '48hr_overdue',
        severity: 'red',
        leadId: lead.id,
        address: lead.address,
        hoursSinceOffer: lead.hoursSinceOffer,
        message: `${lead.address} at Offer Sent for ${lead.hoursSinceOffer}hrs — call seller now.`,
        script: FOLLOWUP_SCRIPTS.first_48hr.script,
      });
    }
  }

  // Process 72hr escalation
  for (const lead of scanResult.escalation72) {
    const existing = await query(
      `SELECT id FROM reminders WHERE lead_id = $1 AND type = '48hr_followup' AND completed = true`,
      [lead.id]
    );

    if (existing.length === 0) {
      // Create escalation reminder
      await query(
        `INSERT INTO reminders (lead_id, user_id, type, due_date, notes, completed, created_at)
        VALUES ($1, $2, '48hr_followup', now(), $3, false, now())`,
        [lead.id, lead.user_id, `ESCALATION: 72hr+ no follow-up on ${lead.address}. Escalate to Kayla.`]
      );

      await query(
        `INSERT INTO activity_log (lead_id, user_id, action, details, created_at)
        VALUES ($1, $2, 'followup_escalation_72hr', $3, now())`,
        [lead.id, lead.user_id, JSON.stringify({
          hoursSinceOffer: lead.hoursSinceOffer,
          sellerName: lead.seller_name,
          escalation: true,
          script: FOLLOWUP_SCRIPTS.second_72hr.script,
        })]
      );

      alerts.push({
        type: '72hr_escalation',
        severity: 'red',
        leadId: lead.id,
        address: lead.address,
        hoursSinceOffer: lead.hoursSinceOffer,
        message: `ESCALATION: ${lead.address} at Offer Sent for ${lead.hoursSinceOffer}hrs — escalate to Kayla.`,
        script: FOLLOWUP_SCRIPTS.second_72hr.script,
      });
    }
  }

  // Process 96hr auto-transition to NO_ANSWER
  for (const lead of scanResult.autoNoAnswer) {
    // Transition to NO_ANSWER
    await query(
      `UPDATE leads SET 
        stage = 'NO_ANSWER',
        nurture_stage = '30_day',
        follow_up_48hr_done = true,
        updated_at = now(),
        last_stage_change_at = now()
      WHERE id = $1`,
      [lead.id]
    );

    // Log stage change in lead_history
    await query(
      `INSERT INTO lead_history (lead_id, from_stage, to_stage, notes, created_at)
      VALUES ($1, 'OFFER_SENT', 'NO_ANSWER', 'Auto-transitioned: 96hr+ with no response after offer', now())`,
      [lead.id]
    );

    // Create 30-day nurture reminder
    const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await query(
      `INSERT INTO reminders (lead_id, user_id, type, due_date, notes, completed, created_at)
      VALUES ($1, $2, '30_day_nurture', $3, '30-day nurture follow-up (auto-created after 96hr no answer)', false, now())`,
      [lead.id, lead.user_id, thirtyDaysOut]
    );

    // Log auto-transition
    await query(
      `INSERT INTO activity_log (lead_id, user_id, action, details, created_at)
      VALUES ($1, $2, 'auto_no_answer', $3, now())`,
      [lead.id, lead.user_id, JSON.stringify({
        hoursSinceOffer: lead.hoursSinceOffer,
        autoTransitioned: true,
        newStage: 'NO_ANSWER',
        nurtureStage: '30_day',
      })]
    );

    alerts.push({
      type: '96hr_auto_no_answer',
      severity: 'yellow',
      leadId: lead.id,
      address: lead.address,
      hoursSinceOffer: lead.hoursSinceOffer,
      message: `Auto-transitioned ${lead.address} to NO_ANSWER. 30-day nurture started.`,
    });
  }

  return {
    totalAlerts: alerts.length,
    overdue48Count: scanResult.overdue48.length,
    escalation72Count: scanResult.escalation72.length,
    autoNoAnswerCount: scanResult.autoNoAnswer.length,
    autoTransitioned: scanResult.autoNoAnswer.length,
    alerts,
    scannedAt: scanResult.scannedAt,
  };
}

// =============================================================
// MARK FOLLOW-UP DONE
// =============================================================

async function markFollowUpDone(leadId) {
  // Mark the 48hr follow-up as complete
  await query(
    `UPDATE reminders SET completed = true, completed_at = now() 
    WHERE lead_id = $1 AND type = '48hr_followup' AND completed = false`,
    [leadId]
  );

  // Mark the lead's follow_up_48hr_done flag
  await query(
    `UPDATE leads SET follow_up_48hr_done = true, updated_at = now() WHERE id = $1`,
    [leadId]
  );

  // Log it
  await query(
    `INSERT INTO activity_log (lead_id, action, details, created_at)
    VALUES ($1, 'followup_48hr_completed', $2, now())`,
    [leadId, JSON.stringify({ completedAt: new Date().toISOString() })]
  );

  return { leadId, completed: true };
}

// =============================================================
// GET FOLLOW-UPS FOR A LEAD
// =============================================================

async function getFollowUps(leadId) {
  const reminders = await query(
    `SELECT * FROM reminders WHERE lead_id = $1 AND type LIKE '%followup%' ORDER BY due_date`,
    [leadId]
  );

  const history = await query(
    `SELECT * FROM activity_log WHERE lead_id = $1 AND action LIKE '%followup%' ORDER BY created_at DESC`,
    [leadId]
  );

  const lead = await query(
    `SELECT id, address, stage, follow_up_48hr_due, follow_up_48hr_done, last_stage_change_at FROM leads WHERE id = $1`,
    [leadId]
  );

  if (lead.length === 0) return null;

  const hoursSinceOffer = Math.round(
    (Date.now() - new Date(lead[0].last_stage_change_at).getTime()) / (60 * 60 * 1000)
  );

  return {
    lead: lead[0],
    hoursSinceOffer,
    isOverdue: lead[0].follow_up_48hr_due && !lead[0].follow_up_48hr_done && new Date(lead[0].follow_up_48hr_due) < new Date(),
    needsEscalation: hoursSinceOffer >= 72,
    needsAutoTransition: hoursSinceOffer >= 96,
    reminders,
    history,
  };
}

// =============================================================
// RUN FULL FOLLOW-UP SCAN (for cron/scheduler)
// =============================================================

async function run() {
  console.log(`[Followup Alert] Scanning at ${new Date().toISOString()}...`);
  const scanResult = await scanOverdueFollowUps();
  const result = await createFollowUpAlerts(scanResult);

  console.log(`[Followup Alert] Found ${result.overdue48Count} overdue 48hr, ${result.escalation72Count} needing escalation, ${result.autoNoAnswerCount} auto-transitioned`);

  return result;
}

// =============================================================
// EXPORT
// =============================================================

module.exports = {
  THRESHOLDS,
  FOLLOWUP_SCRIPTS,
  scanOverdueFollowUps,
  createFollowUpAlerts,
  markFollowUpDone,
  getFollowUps,
  run,
};