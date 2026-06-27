/**
 * Stage Automation Engine — 21-Stage Montelli/Kayla Pipeline
 * =============================================================
 * Rebuilt 2026-06-17. Full 21-stage pipeline matching:
 *   - HANDBOOK_AND_SOP.md (Mermaid flowcharts)
 *   - GHL_WORKFLOWS_SPEC.md (exact actions per stage)
 *   - TRACK_MONTELLI.md (Montelli scripts)
 *   - TRACK_STUDENT.md (Student scripts)
 *   - TRACK_KAYLA_JAXON.md (Kayla/Jaxon command center)
 *
 * Each transition returns a RICH PROMPT with:
 *   1. Pre-filled text messages (with actual names, addresses, emails)
 *   2. Who to send it to (agent, seller, closer)
 *   3. What actions to take before/after
 *   4. Follow-up reminders
 *   5. Owner assignment (Montelli, Kayla, Contracts, TC, JV, Closing)
 */

const { query } = require('../db/connection');
const { getTransitionScripts, fillTemplate, OUTREACH_SCRIPTS, SELLER_UPDATE_TEMPLATES } = require('./script-prompts');
const { sendTemplate } = require('./sms-service');
// System notifications via in-app inbox (replaces SMTP)
const { fireStageNotifications, getUserByEmail, createNotification } = require('./notifications');
const { STAGE_EMAIL_KEYS, sendStageEmail } = require('./email-service');
const { createFolderFromTemplate } = require('./rabbitsign');

const CONTRACT_TEMPLATE_MAP = {
  psa_creative_subto: 'w5EC5hnVWRoGVYUTbxuHwz',
  stack_psa: 'Vf0ahJ1AXi3QWVhXNCBN0C',
  jv_4party: 'rPx7lrG27B1u2pxVzwl21e',
  subto_addendum: '3sIaAVDxaLO386eHCPXe2F',
};
const { generateCompsReport, saveCompsReport } = require('./comps-engine');
const { createMenteeRecord, reassignLead, setVacationMode, endVacationMode } = require('./student-roster');
const { createDispoRecord, transitionDispoStatus } = require('./dispo-tracker');
const { scanPipeline, getStalledLeads, getOverdueFollowUps } = require('./pipeline-monitor');
const { scanOverdueFollowUps, createFollowUpAlerts } = require('./followup-alert');
// Dead handlers removed: registerPostClose, sendTestimonialRequest, sendReferralRequest, runPokemonSpawn (fabricated, not in source)
const { allocateClosingCosts, saveAllocationToLead } = require('./closing-cost-allocator');
// mid-term-pivot removed — not in source (Master Playbook only has Cash, Stack, 10% Down, Sub2)
const { runDocAnalysis, quickBuyBoxCheck } = require('./doc-analyzer');
const { tagLeadSource, scoreLead } = require('./lead-source-tracker');

// =============================================================
// OWNER SECTIONS — derived from AIREI_MASTER_PLAYBOOK.md Part 2 + Part 7
// =============================================================
// Per source:
//   MONTELLI — student calls seller, imports lead, gets LOI, gains feedback,
//     handles counter. (Steps 1-11 of Master Playbook Part 2.)
//   KAYLA — drafts agreement, sends to TC, assigns TC. (Part 7: "Acceptance →
//     Kay sends agreement to transaction coordinator.")
//   TC — runs inspection, appraisal, title. (Part 7: "After completed, appraisal
//     ordered. Montelli contacts title for wiring instructions.")
//   CLOSING — wire + close of escrow. (Part 7: "Close of Escrow → All funds
//     distributed at title company.")
//
// TC / Closing stages remain part of the current 21-stage pipeline.

const OWNERS = {
  MONTELLI: {
    name: 'Montelli',
    stages: ['LEAD_ENTERED', 'CONTACT_MADE', 'OFFER_READY', 'OFFER_SENT', 'OFFER_RECEIVED', 'GAIN_FEEDBACK', 'NO_ANSWER', 'SELLER_DECLINED', 'ACTIVE_NEGOTIATION', 'TERMS_AGREED'],
    color: '#0066cc',
  },
  TC: {
    name: 'TC',
    stages: ['AWAITING_TITLE', 'CONTRACT_OUT', 'UNDER_CONTRACT', 'INSPECTION_PERIOD', 'INSPECTION_COMPLETE', 'APPRAISAL_ORDERED', 'APPRAISAL_DONE', 'JV_SENT', 'JV_SIGNED'],
    color: '#00cc00',
  },
  CLOSING: {
    name: 'Closing',
    stages: ['WIRE_SETUP', 'CLOSING_DATE'],
    color: '#cc0066',
  },
};

function getOwnerForStage(stage) {
  for (const [key, owner] of Object.entries(OWNERS)) {
    if (owner.stages.includes(stage)) return owner;
  }
  return { name: 'Unknown', stages: [], color: '#999' };
}

// =============================================================
// COMPREHENSIVE STAGE TRANSITION PROMPTS — source of truth
// =============================================================

const STAGE_TRANSITIONS = {
  // 21-stage pipeline per GHL_WORKFLOWS_SPEC.md Section A.
  // Each transition: stageNumber, workflow, owner, name, description, automations, ghl_actions.
  'LEAD_ENTERED→CONTACT_MADE': { stageNumber: 1, workflow: 'wf_lead_entered_buybox', owner: 'Montelli', name: 'Lead Entered → Contact Made', description: 'Buy-box check. Pre-screen Zillow. Daily AM lead queue.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/lead-entered' }, { type: 'quick_buybox' }, { type: 'log', message: 'Stage 1: Buy-box check passed.' }], ghl_actions: ['Wait', 'Add Note'] },
  'CONTACT_MADE→OFFER_READY': { stageNumber: 2, workflow: 'wf_contact_made_ccc', owner: 'Montelli', name: 'Contact Made → Offer Ready', description: 'Send CCC SMS. Set 48hr nurture timer. PPC AM workflow if PPC.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/stage-transition' }, { type: 'send_sms', template: 'CCC' }, { type: 'set_reminder', reminder_type: '48hr_followup', offset_hours: 48 }, { type: 'log', message: 'Stage 2: CCC prepared. 48hr timer set.' }], ghl_actions: ['Send SMS (CCC)', 'Write Custom Field', 'Internal Notification'] },
  'OFFER_READY→OFFER_SENT': { stageNumber: 3, workflow: 'wf_offer_ready_run_underwriter', owner: 'Montelli', name: 'Offer Ready → Offer Sent', description: 'Run 5-strategy underwriting. Pick recommended. Generate LOI doc. Email Seth.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/offer-ready' }, { type: 'run_doc_analysis' }, { type: 'run_comps' }, { type: 'run_underwriting' }, { type: 'loi_request' }, { type: 'send_sms', template: 'GCJ' }, { type: 'log', message: 'Stage 3: Underwriting complete. LOI generated.' }], ghl_actions: ['Generate Document', 'Send Email', 'Internal Notification', 'Wait', 'Write Custom Field'] },
  'OFFER_SENT→OFFER_RECEIVED': { stageNumber: 4, workflow: 'wf_offer_sent_48hr_timer', owner: 'Montelli', name: 'Offer Sent → Offer Received', description: 'Log Offer Sent At. Schedule 48hr timer. Send GCJ SMS.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/stage-transition' }, { type: 'set_field', field: 'offer_sent_date', value: 'now' }, { type: 'set_reminder', reminder_type: '48hr_followup', offset_hours: 48 }, { type: 'send_sms', template: 'GCJ' }, { type: 'log', message: 'Stage 4: Offer Sent. 48hr timer scheduled. GCJ SMS fired.' }], ghl_actions: ['Send SMS (GCJ)', 'Wait', 'Write Custom Field'] },
  'OFFER_RECEIVED→GAIN_FEEDBACK': { stageNumber: 5, workflow: 'wf_offer_received_notify_kayla', owner: 'Montelli', name: 'Offer Received → Gain Feedback', description: 'Notify Kayla. Do NOT auto-advance — Kayla controls this stage.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/stage-transition' }, { type: 'notify', recipient: 'Kayla', method: 'telegram+email' }, { type: 'send_sms', template: 'LOI' }, { type: 'log', message: 'Stage 5: Kayla notified.' }], ghl_actions: ['Internal Notification', 'Send Email'] },
  'GAIN_FEEDBACK→ACTIVE_NEGOTIATION': { stageNumber: 6, workflow: 'wf_gain_feedback_realign', owner: 'Montelli', name: 'Gain Feedback → Active Negotiation', description: 'Re-run underwriting with counter offer. Send LOI intent SMS. Schedule 48hr escalation. Branch on Seller Response.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/stage-transition' }, { type: 'run_underwriting' }, { type: 'set_reminder', reminder_type: '48hr_followup', offset_hours: 48 }, { type: 'send_sms', template: 'LOI' }, { type: 'log', message: 'Stage 6: Underwriting re-run with counter offer. LOI follow-up sent.' }], ghl_actions: ['Send SMS (LOI)', 'Wait', 'If/Then'] },
  'GAIN_FEEDBACK→NO_ANSWER': { stageNumber: 7, workflow: 'wf_no_answer_escalation', owner: 'Montelli', name: 'No Answer After GFB', description: 'Voice memo day 0. LOI2DAYS day 2. SD day 4. DOM-181 calendar.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/stage-transition' }, { type: 'set_reminder', reminder_type: 'dom_181' }, { type: 'send_sms', template: 'LOI2DAYS' }, { type: 'log', message: 'Stage 7: Voice memo + LOI2DAYS + SD scheduled. DOM-181 set.' }], ghl_actions: ['Wait', 'Send SMS', 'Create Task'] },
  'GAIN_FEEDBACK→SELLER_DECLINED': { stageNumber: 8, workflow: 'wf_seller_declined_nurture', owner: 'Montelli', name: 'Seller Declined', description: 'SD SMS. 30-day revisit schedule. DOM-181 reminder.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/stage-transition' }, { type: 'set_reminder', reminder_type: 'dom_181' }, { type: 'send_sms', template: 'SD' }, { type: 'log', message: 'Stage 8: SD sent. 30-day revisit scheduled.' }], ghl_actions: ['Send SMS (SD)', 'Wait', 'Add Note'] },
  'ACTIVE_NEGOTIATION→TERMS_AGREED': { stageNumber: 9, workflow: 'wf_active_negotiation_recalc', owner: 'Montelli', name: 'Active Negotiation → Terms Agreed', description: 'Re-run underwriting with counter offer. Notify Kayla + Jaxon.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/offer-ready' }, { type: 'run_underwriting' }, { type: 'notify' }, { type: 'log', message: 'Stage 9: Recalc done. Kayla + Jaxon notified.' }], ghl_actions: ['Internal Notification', 'Write Custom Field'] },
  'TERMS_AGREED→AWAITING_TITLE': { stageNumber: 10, workflow: 'wf_terms_agreed_contract_draft', owner: 'Montelli', name: 'Terms Agreed → Awaiting Title', description: 'Generate contract doc. Set 12 GHL fields. 72hr wait.', automations: [{ type: 'generate_contract' }, { type: 'write_fields', fields: ['contract_type', 'coe_date', 'inspection_end_date', 'emd_amount', 'title_company', 'llc_name', 'property_apn'] }, { type: 'notify' }, { type: 'log', message: 'Stage 10: Contract drafted. 12 GHL fields set.' }], ghl_actions: ['Generate Document', 'Write Custom Field', 'Internal Notification', 'Wait'] },
  'AWAITING_TITLE→CONTRACT_OUT': { stageNumber: 11, workflow: 'wf_awaiting_title_72hr', owner: 'TC', name: 'Awaiting Title → Contract Out', description: 'SMS seller for mortgage statement. 72hr alert if Loan Balance not set.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/stage-transition' }, { type: 'set_reminder', reminder_type: 'custom', offset_hours: 72 }, { type: 'send_sms', template: 'PSA_CALL_OPENER' }, { type: 'send_sms', template: 'CONTRACT_OUT' }, { type: 'log', message: 'Stage 11: SMS sent to seller.' }], ghl_actions: ['Send SMS', 'Wait', 'If/Then'] },
  'CONTRACT_OUT→UNDER_CONTRACT': { stageNumber: 12, workflow: 'wf_contract_out_rabbitsign', owner: 'TC', name: 'Contract Out → Under Contract (THE BIG ONE)', description: 'RabbitSign envelope. PSA + Addendum if SubTo. + JV if applicable. Set PSA Signed Date, COE Date (+30), Inspection End Date (+14), Title Company, EMD Amount ($100), Has Subject To Addendum.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/contract-sign' }, { type: 'rabbitsign' }, { type: 'write_fields', fields: ['psa_signed_date', 'coe_date', 'inspection_end_date', 'title_company', 'emd_amount', 'has_subject_to_addendum'] }, { type: 'send_sms', template: 'INSPECTION_SCHEDULED' }, { type: 'log', message: 'Stage 12: RabbitSign envelope generated.' }], ghl_actions: ['Generate Document', 'Send Email', 'Write Custom Field', 'Wait'] },
  'UNDER_CONTRACT→INSPECTION_PERIOD': { stageNumber: 13, workflow: 'wf_under_contract_tc_handoff', owner: 'TC', name: 'Under Contract → Inspection Period', description: 'TC handshake email (BGonzalez only — Kayla + Monique paused 2026-06-26). 14-day countdown. Day 7 SMS.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/stage-transition' }, { type: 'copy_email', to: 'BGonzalez@sellsmartre.com', subject: 'TC Handoff - {{address}}', bodyTemplate: 'Inspection period started for {{address}}. 14-day countdown begins. Day 7 SMS to seller scheduled.' }, { type: 'set_reminder', reminder_type: 'inspection_day_7_sms', offset_days: 7 }, { type: 'set_reminder', reminder_type: 'inspection_period_end', offset_days: 14 }, { type: 'log', message: 'Stage 13: TC handshake sent (BGonzalez only). 14-day countdown started. Day 7 SMS scheduled. Kayla + Monique paused (2026-06-26).' }], ghl_actions: ['Send Email', 'Wait', 'Create Task'] },
  'INSPECTION_PERIOD→INSPECTION_COMPLETE': { stageNumber: 14, workflow: 'wf_inspection_period_daily_check', owner: 'TC', name: 'Inspection Period → Inspection Complete', description: 'Day 14 alert to Kayla. Inspection period complete. Auto-advance to appraisal.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/stage-transition' }, { type: 'notify', recipient: 'Kayla', method: 'telegram+email' }, { type: 'set_field', field: 'inspection_complete_date', value: 'now' }, { type: 'log', message: 'Stage 14: Inspection complete. Kayla notified.' }], ghl_actions: ['Internal Notification', 'If/Then'] },
  'INSPECTION_COMPLETE→APPRAISAL_ORDERED': { stageNumber: 15, workflow: 'wf_inspection_complete', owner: 'TC', name: 'Inspection Complete → Appraisal Ordered', description: 'Auto-advance. No human action required. Set appraisal_ordered_date.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/stage-transition' }, { type: 'set_field', field: 'appraisal_ordered_date', value: 'now' }, { type: 'log', message: 'Stage 15: Inspection complete. Auto-advance to Stage 16. Appraisal ordered.' }], ghl_actions: ['Write Custom Field'] },
  'APPRAISAL_ORDERED→APPRAISAL_DONE': { stageNumber: 16, workflow: 'wf_appraisal_ordered', owner: 'TC', name: 'Appraisal Ordered → Appraisal Done', description: 'Coordinate with TC for appraiser access. Wait for Appraisal Result field. Set appraisal_done_date + appraisal_value.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/stage-transition' }, { type: 'set_field', field: 'appraisal_done_date', value: 'now' }, { type: 'set_field', field: 'appraisal_value', value: '{{appraisal_value}}' }, { type: 'send_sms', template: 'APPRAISAL_DONE' }, { type: 'log', message: 'Stage 16: Appraisal ordered, then done. appraisal_value stored.' }], ghl_actions: ['Create Task', 'Wait', 'Write Custom Field'] },
  'APPRAISAL_DONE→JV_SENT': { stageNumber: 17, workflow: 'wf_appraisal_done_recalc', owner: 'TC', name: 'Appraisal Done → JV Sent (JV path — auto when appraisal < PP)', description: 'Re-run underwriting with appraisal value. Branch on appraisal < PP. Move to JV_SENT if JV deal.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/offer-ready' }, { type: 'run_underwriting' }, { type: 'notify' }, { type: 'set_field', field: 'branched_to_jv', value: 'true' }, { type: 'log', message: 'Stage 17 (JV path): appraisal < PP, branched to JV_SENT.' }], ghl_actions: ['Internal Notification', 'Send SMS', 'Write Custom Field', 'If/Then'] },
  'APPRAISAL_DONE→WIRE_SETUP': { stageNumber: 17, workflow: 'wf_appraisal_done_recalc', owner: 'TC', name: 'Appraisal Done → Wire Setup (no JV — auto when appraisal >= PP)', description: 'Skip JV. Go directly to wire setup when no JV deal.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/offer-ready' }, { type: 'run_underwriting' }, { type: 'set_field', field: 'branched_to_jv', value: 'false' }, { type: 'log', message: 'Stage 17 (no-JV path): appraisal >= PP, skipped JV.' }], ghl_actions: ['Send SMS', 'Write Custom Field'] },
  'JV_SENT→JV_SIGNED': { stageNumber: 18, workflow: 'wf_jv_sent_rabbitsign', owner: 'TC', name: 'JV Sent → JV Signed', description: 'Determine JV type (3-party or 4-party). Pre-fill parties + percentages. Generate RabbitSign envelope.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/contract-sign' }, { type: 'rabbitsign' }, { type: 'send_sms', template: 'JV_SIGNED' }, { type: 'log', message: 'Stage 18: JV RabbitSign envelope generated.' }], ghl_actions: ['Generate Document', 'Send SMS', 'Wait'] },
  'JV_SIGNED→WIRE_SETUP': { stageNumber: 19, workflow: 'wf_jv_signed_books_setup', owner: 'TC', name: 'JV Signed → Wire Setup', description: 'Set JV Title Holder. Send JV_SIGNED SMS. Move to Wire Setup.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/stage-transition' }, { type: 'write_fields', fields: ['jv_title_holder', 'jv_signed_date'] }, { type: 'send_sms', template: 'JV_SIGNED' }, { type: 'log', message: 'Stage 19: JV signed. JV Title Holder set. Moving to wire setup.' }], ghl_actions: ['Write Custom Field', 'Send SMS'] },
  'WIRE_SETUP→CLOSING_DATE': { stageNumber: 20, workflow: 'wf_wire_setup_final_prep', owner: 'Closing', name: 'Wire Setup → Closing Date', description: 'Confirm wire instructions received from title. 3rd-party processor for SubTo. Move to Closing.', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/stage-transition' }, { type: 'send_sms', templateResolver: (lead = {}) => (String(lead.contract || lead.contract_type || '').toLowerCase().includes('subto') ? 'SUBTO_PROCESSOR' : 'CLOSING_CONFIRMED') }, { type: 'log', message: 'Stage 20: Wire setup confirmed.' }], ghl_actions: ['Create Task', 'Wait'] },
  'CLOSING_DATE→CLOSED': { stageNumber: 21, workflow: 'wf_closing_countdown', owner: 'Closing', name: 'Closing Date → Closed', description: 'COE -7 SMS to seller. Wire request from title. Post-close engine (+7d testimonial, +14d referral, +30d check-in).', automations: [{ type: 'webhook', endpoint: '/webhook/ghl/stage-transition' }, { type: 'set_field', field: 'closed_date', value: 'now' }, { type: 'send_sms', template: 'COE_MINUS_7' }, { type: 'set_reminder', reminder_type: 'coe', offset_days: 0 }, { type: 'set_reminder', reminder_type: 'testimonial', offset_days: 7 }, { type: 'set_reminder', reminder_type: 'referral', offset_days: 14 }, { type: 'set_reminder', reminder_type: '30_day_nurture', offset_days: 30 }, { type: 'log', message: 'Stage 21: Closed. COE -7 SMS sent. Post-close engine started (+7d testimonial, +14d referral, +30d check-in).' }], ghl_actions: ['Send SMS', 'Wait', 'Create Task', 'If/Then'] },
};



// =============================================================
// EXECUTION ENGINE
// =============================================================

async function executeStageAutomations(leadId, userId, fromStage, toStage, leadData, actionRequest = null) {
  const key = `${fromStage}→${toStage}`;
  const config = STAGE_TRANSITIONS[key] || STAGE_TRANSITIONS[`*→${toStage}`];
  const results = [];
  const now = new Date();

  if (config && config.automations) {
    for (const action of config.automations) {
      try {
        switch (action.type) {
          case 'webhook': {
            // The CRM IS the system of record (no GHL). Log the conceptual webhook
            // call to activity_log so the trail is auditable, but do not POST to
            // any external URL. Field writes are handled by write_fields/set_field
            // cases below.
            try {
              await query(
                'INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)',
                [userId, leadId, 'stage_webhook_logged', JSON.stringify({ endpoint: action.endpoint, from_stage: fromStage, to_stage: toStage })]
              );
              results.push({ type: 'webhook', ok: true, endpoint: action.endpoint, mode: 'crm-as-source-of-truth' });
            } catch (e) {
              results.push({ type: 'webhook', ok: false, error: e.message });
            }
            break;
          }
          case 'write_fields': {
            // Bulk write multiple lead fields at once (per GHL_FIELD_MAPPING.md)
            try {
              const fieldMap = {};
              for (const f of (action.fields || [])) {
                let value;
                if (f === 'psa_signed_date') value = now.toISOString().split('T')[0];
                else if (f === 'coe_date') { const d = new Date(now); d.setDate(d.getDate() + 30); value = d.toISOString().split('T')[0]; }
                else if (f === 'inspection_end_date') { const d = new Date(now); d.setDate(d.getDate() + 14); value = d.toISOString().split('T')[0]; }
                else if (f === 'emd_amount') value = 100;
                else if (f === 'title_company') value = 'CLOSED Title';
                else if (f === 'has_subject_to_addendum') value = (leadData.contract === 'subto' || leadData.contract_type === 'subto');
                else if (f === 'llc_name') value = 'Divinity Aligned LLC';
                else if (f === 'property_apn') value = leadData.apn || null;
                else if (f === 'contract_type') value = leadData.contract || leadData.contract_type || 'cash';
                else if (f === 'jv_title_holder') value = leadData.jv_title_holder || leadData.title_company || 'CLOSED Title';
                else if (f === 'jv_signed_date') value = now.toISOString().split('T')[0];
                else if (f === 'closed_date') value = now.toISOString().split('T')[0];
                else if (f === 'inspection_complete_date') value = now.toISOString().split('T')[0];
                if (value !== undefined) fieldMap[f] = value;
              }
              const cols = Object.keys(fieldMap);
              if (cols.length > 0) {
                const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
                const values = cols.map(c => fieldMap[c]);
                await query(`UPDATE leads SET ${setClause} WHERE id = $${cols.length + 1}`, [...values, leadId]);
              }
              results.push({ type: 'write_fields', ok: true, fields: cols });
            } catch (e) {
              results.push({ type: 'write_fields', ok: false, error: e.message });
            }
            break;
          }
          case 'generate_contract': {
            // Real contract generation — fill template + merge tokens + return
            // ready-to-download text. Uses the same contract-generator.js the
            // legacy code already had.
            try {
              // Resolve contractType in this priority:
              //   1. action.template (set in automation config)
              //   2. action.contract_type (alias for template)
              //   3. leadData.contract_type (set on lead record)
              //   4. leadData.contract (legacy field)
              //   5. fallback to 'cash'
              const contractType = action.template || action.contract_type || leadData.contract_type || leadData.contract || 'cash';
              const { generateContract, formatForTelegram } = require('./contract-generator');
              const generated = generateContract(leadData, contractType);
              if (generated.error) {
                results.push({ type: 'generate_contract', ok: false, error: generated.error, contractType });
                break;
              }
              // Format the structured pkg into a single text blob for storage.
              const text = formatForTelegram ? formatForTelegram(generated) : JSON.stringify(generated);
              await query(
                `UPDATE leads SET draft_contract_url = $1, contract = $2 WHERE id = $3`,
                [text.substring(0, 65535), contractType, leadId]
              );
              await query(
                'INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)',
                [userId, leadId, 'contract_generated', JSON.stringify({ contractType, length: text.length, parties: generated.parties, financials: generated.financials, timeline: generated.timeline })]
              );
              results.push({
                type: 'generate_contract',
                ok: true,
                contractType,
                length: text.length,
                parties: generated.parties,
                financials: generated.financials,
                timeline: generated.timeline,
                note: 'Contract generated from contract-generator.js (real templates, 23 types)',
              });
            } catch (e) {
              results.push({ type: 'generate_contract', ok: false, error: e.message });
            }
            break;
          }
          case 'rabbitsign': {
            // Real RabbitSign envelope creation. ok:false if it fails.
            try {
              const contractType = leadData.contract || leadData.contract_type || 'psa_creative_subto';
              const { createContractEnvelope } = require('./rabbitsign');
              let envelopeResult = null;
              let envelopeErr = null;
              try {
                envelopeResult = await createContractEnvelope(leadData, contractType);
              } catch (e) {
                envelopeErr = e.message;
              }
              if (envelopeResult && envelopeResult.folderId) {
                await query(
                  `UPDATE leads SET rabbitsign_folder_id = $1, contract_status = 'sent' WHERE id = $2`,
                  [envelopeResult.folderId, leadId]
                );
                await query(
                  'INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)',
                  [userId, leadId, 'rabbitsign_envelope_created', JSON.stringify({ folderId: envelopeResult.folderId, contractType })]
                );
                results.push({ type: 'rabbitsign', ok: true, folderId: envelopeResult.folderId, contractType });
              } else {
                // Fail loudly - the user said no silent ok:true on real channel failures
                await query(
                  'INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)',
                  [userId, leadId, 'rabbitsign_envelope_failed', JSON.stringify({ contractType, error: envelopeErr || 'no folderId returned' })]
                );
                results.push({
                  type: 'rabbitsign',
                  ok: false,
                  contractType,
                  error: envelopeErr || 'no folderId returned',
                  blocker: 'RABBITSIGN_API_KEY may be invalid, expired, or template/template id is wrong',
                });
              }
            } catch (e) {
              results.push({ type: 'rabbitsign', ok: false, error: e.message });
            }
            break;
          }
          case 'copy_email': {
            // Stores pre-filled email content in activity_log so student can
            // copy it into their Gmail. Replaces SMTP for student CRM.
            try {
              const to = action.to;
              const subject = action.subject || `Re: ${leadData.address || 'Property'}`;
              let body = action.bodyTemplate || '';
              // Replace simple placeholders with lead data
              body = body
                .replace(/\{\{address\}\}/g, leadData.address || '')
                .replace(/\{\{seller_name\}\}/g, leadData.seller_name || '')
                .replace(/\{\{agent_name\}\}/g, leadData.agent_name || '')
                .replace(/\{\{price\}\}/g, leadData.price ? `$${Number(leadData.price).toLocaleString()}` : '')
                .replace(/\{\{monthly_rent\}\}/g, leadData.monthly_rent ? `$${Number(leadData.monthly_rent).toLocaleString()}` : '')
                .replace(/\{\{contract_type\}\}/g, leadData.contract || leadData.contract_type || 'cash');
              await query(
                'INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)',
                [userId, leadId, 'copy_email_prefilled', JSON.stringify({ to, subject, body, from_stage: fromStage, to_stage: toStage })]
              );
              results.push({ type: 'copy_email', ok: true, to, subject, body, length: body.length });
            } catch (e) {
              results.push({ type: 'copy_email', ok: false, error: e.message });
            }
            break;
          }
          case 'send_sms': {
            try {
              const templateKey = typeof action.templateResolver === 'function'
                ? action.templateResolver(leadData, fromStage, toStage)
                : action.template;
              if (!templateKey) {
                results.push({ type: 'send_sms', ok: false, error: 'Missing SMS template' });
                break;
              }

              const smsResult = await sendTemplate(leadData, templateKey, action.contactId);
              await query(
                'INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)',
                [userId, leadId, 'sms_sent', JSON.stringify({ template: templateKey, from_stage: fromStage, to_stage: toStage, sent: smsResult.sent === true, reason: smsResult.reason || null, error: smsResult.error || null })]
              );
              results.push({ type: 'send_sms', ok: !!smsResult?.sent, template: templateKey, ...smsResult });
            } catch (e) {
              results.push({ type: 'send_sms', ok: false, error: e.message });
            }
            break;
          }
          case 'set_field': {
            let value = action.value;
            if (value === 'now') value = now.toISOString();
            else if (value === 'now+48h') { const d = new Date(now); d.setHours(d.getHours() + 48); value = d.toISOString(); }
            else if (value === 'now+30d') { const d = new Date(now); d.setDate(d.getDate() + 30); value = d.toISOString().split('T')[0]; }
            else if (value === 'now+14d') { const d = new Date(now); d.setDate(d.getDate() + 14); value = d.toISOString().split('T')[0]; }
            // Template substitution for {{field_name}} patterns (e.g. {{appraisal_value}})
            else if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
              const fieldName = value.slice(2, -2).trim();
              value = leadData[fieldName] ?? actionRequest?.body?.[fieldName] ?? null;
            }
            // from_llc_name auto-resolve REMOVED — Part 7 says student informs Kayla manually if fee in LLC name
            await query(`UPDATE leads SET ${action.field} = $1 WHERE id = $2`, [value, leadId]);
            results.push({ type: 'set_field', field: action.field, value, ok: true });
            break;
          }
          case 'set_reminder': {
            let dueDate = new Date(now);
            if (action.offset_hours) dueDate.setHours(dueDate.getHours() + action.offset_hours);
            else if (action.offset_days) dueDate.setDate(dueDate.getDate() + action.offset_days);
            await query(
              'INSERT INTO reminders (id, lead_id, user_id, type, due_date, notes) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)',
              [leadId, userId, action.reminder_type, dueDate.toISOString(), action.notes || null]
            );
            results.push({ type: 'set_reminder', reminder_type: action.reminder_type, ok: true });
            break;
          }
          case 'run_underwriting': {
            const toNum = value => Number(value || 0);
            const { price, monthly_rent: rent, sqft, arv, condition, existing_loan_balance, existing_loan_rate } = leadData;
            const priceNum = toNum(price);
            const rentNum = toNum(rent);
            const sqftNum = toNum(sqft);
            const arvNum = toNum(arv);
            const loanBalanceNum = toNum(existing_loan_balance);
            const loanRateNum = toNum(existing_loan_rate);
            const onePercentValue = priceNum > 0 ? rentNum / priceNum : 0;
            const onePercentRule = onePercentValue >= 0.01;
            let rate = 30; if (condition === 'reno') rate = 60; else if (condition === 'livable') rate = 45;
            const repairs = sqftNum * rate;
            const fee = toNum(leadData.wholesale_fee) || 20000;
            const inv = arvNum * 0.70;
            const cash = inv - repairs - fee;
            const f50 = cash > 0 ? Math.round(cash * 1.27) : 0;
            const subto = arvNum > 0 ? arvNum - repairs - loanBalanceNum : 0;
            let rec = 'cash';
            if (loanBalanceNum > 0 && loanRateNum > 0 && loanRateNum < 0.05) rec = 'subto';
            else if (condition === 'turnkey') rec = 'f50';
            else if (condition === 'reno') rec = 'f10';
            await query(
              `UPDATE leads SET one_percent_rule=$1, one_percent_value=$2, repair_tier_rate=$3, repairs_estimate=$4, cash_offer=$5, f50_offer=$6, f50_down=$7, f50_carryback=$8, f10_offer=$9, f10_down=$10, f10_carryback=$11, subto_offer=$12, recommended_strategy=$13 WHERE id=$14`,
              [onePercentRule, onePercentValue, rate, repairs, cash, f50, Math.round(f50 * 0.5), Math.round(f50 * 0.5), f50, Math.round(f50 * 0.1), Math.round(f50 * 0.9), subto, rec, leadId]
            );
            results.push({ type: 'run_underwriting', ok: true, data: { onePercentRule, cash, f50, subto, rec } });
            break;
          }
          case 'run_comps': {
            const report = generateCompsReport(leadData);
            await saveCompsReport(leadId, userId, report);
            results.push({ type: 'run_comps', ok: true, data: { buyBoxPass: report.buyBox.allPass, strategy: report.strategy.strategy } });
            break;
          }
          case 'run_doc_analysis': {
            const docResult = await runDocAnalysis(leadId);
            results.push({ type: 'run_doc_analysis', ok: true, data: docResult });
            break;
          }
          case 'quick_buybox': {
            const bbResult = quickBuyBoxCheck(leadId);
            results.push({ type: 'quick_buybox', ok: true, data: bbResult });
            break;
          }
          case 'tag_source': {
            const sourceResult = tagLeadSource(leadId, leadData.source || 'other');
            const scoreResult = scoreLead(leadData);
            results.push({ type: 'tag_source', ok: true, data: { source: sourceResult, score: scoreResult } });
            break;
          }
          
          
          
          
          case 'scan_followups': {
            const fuResult = await scanOverdueFollowUps(leadId);
            if (fuResult.overdue) {
              await createFollowUpAlerts(leadId, userId, fuResult);
            }
            results.push({ type: 'scan_followups', ok: true, data: fuResult });
            break;
          }
          case 'notify': {
            try {
              const notifResult = await fireStageNotifications(fromStage, toStage, leadData);
              await query(
                'INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)',
                [userId, leadId, 'notification_fired', JSON.stringify({ stage: toStage, count: notifResult.fired, emailsSent: notifResult.emailsSent, emailsFailed: notifResult.emailsFailed })]
              );
              // notify is "ok" if in-app inbox fired — that's the primary delivery path.
              // Email is supplementary; if it fails we surface stats but don't fail the action.
              const ok = notifResult.fired > 0;
              results.push({
                type: 'notify',
                ok,
                fired: notifResult.fired,
                emailsSent: notifResult.emailsSent,
                emailsFailed: notifResult.emailsFailed,
                emailChannel: notifResult.emailsSent > 0 ? 'agentmail' : (notifResult.emailsFailed > 0 ? 'blocked' : 'none'),
              });
              if (notifResult.emailsFailed > 0) {
                console.warn(`[stage-automations] notify partial-email-fail: inAppFired=${notifResult.fired}, emailsSent=${notifResult.emailsSent}, emailsFailed=${notifResult.emailsFailed}`);
              }
            } catch (e) {
              results.push({ type: 'notify', ok: false, error: e.message });
            }
            break;
          }
          case 'loi_request': {
            // Verbatim from AIREI_MASTER_PLAYBOOK.md Part 2 Step 6:
            // "If turnkey + 1% rule pass → email Seth at claytoninvestmentsolutions@gmail.com,
            //  subject 'FB LOI Request' or 'Renovation – LOI Request [address]'.
            //  Seth sends approved LOI."
            try {
              const dealType = leadData.condition === 'turnkey' ? 'FB LOI Request' : 'Renovation – LOI Request';
              const sellerRent = leadData.monthly_rent || 0;
              const purchasePrice = Number(leadData.price || 0);
              const onePercentTest = purchasePrice > 0 ? (sellerRent / purchasePrice) >= 0.01 : false;
              const subject = `${dealType} – ${leadData.address || ''}`;
              const body = `Property: ${leadData.address || ''}
Asking: $${purchasePrice.toLocaleString()}
Market Rent: $${sellerRent}/mo
1% Rule Test: ${onePercentTest ? 'PASS' : 'FAIL'} (need rent ≥ 1% of price)
Condition: ${leadData.condition || 'unknown'}
Beds/Baths: ${leadData.beds || '?'}/${leadData.baths || '?'}
Sqft: ${leadData.sqft || '?'}

Source of truth: 17C-OH-3.12 transcript — "Seth is going to be underwriting all LOI potential requests so that if it doesn't cash flow at the 1% rule, after looking at..."`;

              // Notify Seth (if he has an account) — and always log activity so student can copy the email content
              const sethId = await getUserByEmail('claytoninvestmentsolutions@gmail.com');
              if (sethId) {
                await createNotification({
                  recipientId: sethId,
                  leadId: leadData.id,
                  type: 'loi_request',
                  title: subject,
                  body: body,
                  actionUrl: `/leads/${leadData.id}`,
                  actionLabel: 'Open Lead',
                });
              }

              await query(
                'INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)',
                [userId, leadId, 'loi_requested_seth', JSON.stringify({ subject, onePercentTest, condition: leadData.condition })]
              );

              // Set reminder for student to follow up with Seth if no LOI in 48hrs
              await query(
                `INSERT INTO reminders (id, lead_id, user_id, type, due_date, notes)
                 VALUES (gen_random_uuid(), $1, $2, 'custom', NOW() + INTERVAL '48 hours', $3)`,
                [leadData.id, userId, `Follow up with Seth on LOI: ${subject}`]
              );

              // Generate LOI doc via contract-generator and persist draft URL + body
              let loiResult = null;
              try {
                const { generateContract, CLAUSES, CONTRACT_TYPES } = require('./contract-generator');
                const pkg = generateContract(leadData, 'loi');
                // Build LOI body from template + clauses
                const loiBody = [
                  `LETTER OF INTENT`,
                  ``,
                  `Date: ${new Date().toISOString().split('T')[0]}`,
                  `Property: ${leadData.address || 'TBD'}`,
                  `Buyer: Divinity Aligned LLC`,
                  `Seller: ${leadData.seller_name || leadData.contacts?.seller_name || 'TBD'}`,
                  ``,
                  `Terms:`,
                  `  Purchase Price: $${pkg.financials?.purchasePrice || leadData.price || 0}`,
                  `  Template: ${pkg.template || 'LOIStandard'}`,
                  ``,
                  `Clauses:`,
                  ...(pkg.clauses || []).map((c, i) => `  ${i + 1}. [${c.id || c.name || 'clause'}]: ${(c.text || c.body || '').slice(0, 200)}`),
                  ``,
                  `This Letter of Intent is non-binding and serves as a formal expression of interest to acquire the above property.`,
                ].join('\n');
                loiResult = {
                  contractType: 'loi',
                  templateName: pkg.template || 'LOIStandard',
                  body: loiBody,
                  clausesIncluded: pkg.clauses?.length || Object.keys(CLAUSES).length,
                  length: loiBody.length,
                  parties: pkg.parties,
                  financials: pkg.financials,
                };
                await query(
                  'UPDATE leads SET draft_loi_url = $1, draft_loi_body = $2 WHERE id = $3',
                  [`loi://${leadId}`, loiBody, leadId]
                );
                await query(
                  'INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)',
                  [userId, leadId, 'loi_doc_generated', JSON.stringify({ templateName: pkg.template, length: loiBody.length, clauses: pkg.clauses?.length || 0 })]
                );
              } catch (genErr) {
                loiResult = { error: genErr.message };
              }

              results.push({ type: 'loi_request', ok: true, subject, onePercentTest, sethNotified: !!sethId, loi: loiResult });
            } catch (e) {
              results.push({ type: 'loi_request', ok: false, error: e.message });
            }
            break;
          }
          case 'hand_to_kayla': {
            // Verbatim from 10-STEP3-Pt2-Jaxon-Closed-Student-Deal-Walkthrough.txt (lines 2353-2400):
            // "Next steps for us would be was looping our transaction coordinator in who's on staff
            //  they would get the agreement together and get that sent over for your review
            //  and your authorization. Once that happened we would get it over to title —
            //  it would be a standard 30 day closing and we would run our inspections
            //  our appraisal and all of that."
            //
            // ALSO from AIREI_MASTER_PLAYBOOK.md Part 7:
            // "Acceptance → Kay sends agreement to transaction coordinator → TC sends to client for authorization
            //  Inform Kayla if you want fee in LLC name (instead of personal name)
            //  Kayla sends JV/consulting agreement outlining profit split
            //  Inspection + Appraisal → Kay arranges home inspector + sewer scope
            //  Consulting Agreement → Sent after property passes inspection + appraisal
            //  Close of Escrow → All funds distributed at title company → direct deposit"
            //
            // Assignment fee: $10,000 to Kayla Mouser (per Lead-to-CRM-AI-Offer-System transcript)
            try {
              const sellerName = leadData.seller_name || 'Seller';
              const sellerPhone = leadData.seller_phone || '';
              const sellerEmail = leadData.seller_email || '';
              const price = Number(leadData.price || 0).toLocaleString();
              const handoffBody = `TERMS AGREED — Kayla/Jaxon closing process.

SELLER INFO
Seller: ${sellerName}
Phone: ${sellerPhone}
Email: ${sellerEmail}

PROPERTY
Address: ${leadData.address || ''}
Agreed Price: $${price}
Structure: ${leadData.contract_structure || '50% down at closing / 50% seller carry back / 72mo balloon / deed in lieu (per Master Playbook Part 5 + 15_Pt_4_SubTo_Pt2 transcript)'}

NEXT STEPS (per AIREI_MASTER_PLAYBOOK.md Part 7)
1. Kayla sends JV/consulting agreement to TC
2. TC sends agreement to seller for review + authorization
3. Kayla arranges home inspector + sewer scope
4. Appraisal ordered after inspection passes
5. Montelli contacts title for wiring instructions
6. Standard 30 day closing
7. Student gets $10K assignment fee via direct deposit from title
8. ALWAYS ask seller: "Do you have any other properties you're looking to offload?"

MONTELLI'S ROLE FROM HERE
Text seller every 3-5 days: "Hey [name] — just checking in — everything smooth on your end?"
First check-in: 3 days from now. Continue until close.`;

              // Notify Kayla (primary closer) — PAUSED 2026-06-26 21:42 EDT
              // User directive: stop emailing/notifying Kayla + Monique.
              // Comment out the notification; the notifications.js pause will
              // also block it as a belt-and-suspenders measure.
              // To resume: uncomment this block AND set NOTIFICATIONS_PAUSE_KAYLA_MONIQUE=false.
              /*
              const kaylaId = await getUserByEmail('homewithkaylamauser@gmail.com');
              if (kaylaId) {
                await createNotification({
                  recipientId: kaylaId,
                  leadId: leadData.id,
                  type: 'agreement_handoff',
                  title: `Draft & Send Agreement: ${leadData.address || ''}`,
                  body: handoffBody,
                  actionUrl: `/leads/${leadData.id}`,
                  actionLabel: 'Open Lead',
                });
              }
              */
              console.warn(`[stage-automations] KAYLA-MONIQUE-PAUSE: skipping agreement_handoff notification for ${leadData.address}`);

              // Notify Jaxon (closer on the call in many transcripts)
              const jaxonId = await getUserByEmail('jaxondeasonhomes1@gmail.com');
              if (jaxonId) {
                await createNotification({
                  recipientId: jaxonId,
                  leadId: leadData.id,
                  type: 'agreement_handoff',
                  title: `Closing Handoff: ${leadData.address || ''}`,
                  body: handoffBody,
                  actionUrl: `/leads/${leadData.id}`,
                  actionLabel: 'Open Lead',
                });
              }

              // Notify Montelli (lead owner) to begin seller monitoring cadence
              if (leadData.user_id) {
                await createNotification({
                  recipientId: leadData.user_id,
                  leadId: leadData.id,
                  type: 'monitor_seller',
                  title: `Begin Seller Monitoring: ${leadData.address || ''}`,
                  body: `Kayla is sending the agreement. Your only job from now until close: text ${sellerName} every 3-5 days. First check-in: "Hey ${sellerName} — just checking in — everything smooth on your end?"`,
                  actionUrl: `/leads/${leadData.id}`,
                  actionLabel: 'View Lead',
                });
              }

              // Set seller monitoring reminder (3 days)
              await query(
                `INSERT INTO reminders (id, lead_id, user_id, type, due_date, notes)
                 VALUES (gen_random_uuid(), $1, $2, 'custom', NOW() + INTERVAL '3 days', $3)`,
                [leadData.id, leadData.user_id, `Text seller ${sellerName}: "Hey — just checking in — everything smooth on your end?"`]
              );

              await query(
                'INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)',
                [userId, leadId, 'handed_to_kayla', JSON.stringify({ structure: leadData.contract_structure || '50% down / 72mo balloon / deed in lieu', assignmentFee: 10000 })]
              );
              results.push({ type: 'hand_to_kayla', ok: true, kaylaNotified: !!kaylaId, jaxonNotified: !!jaxonId, montelliMonitoring: true });
            } catch (e) {
              results.push({ type: 'hand_to_kayla', ok: false, error: e.message });
            }
            break;
          }
          case 'rabbitsign_envelope': {
            try {
              const contractType = action.contract_type || 'psa_creative_subto';
              const templateId = CONTRACT_TEMPLATE_MAP[contractType];
              if (!templateId) {
                results.push({ type: 'rabbitsign_envelope', ok: false, error: `Unknown contract_type: ${contractType}` });
                break;
              }
              const sellerEmail = leadData.seller_email || leadData.owner_email;
              const sellerName = leadData.seller_name || leadData.owner_name || 'Seller';
              const folder = await createFolderFromTemplate(templateId, {
                title: `${contractType} — ${leadData.address || 'Property'}`,
                summary: `Auto-generated from CRM at TERMS_AGREED stage. Lead ID: ${leadId}`,
                date: new Date().toISOString().split('T')[0],
                roles: [
                  { roleName: 'Seller', email: sellerEmail, name: sellerName },
                  { roleName: 'Buyer', email: 'montelliscottrei@gmail.com', name: 'Montelli Scott' },
                ],
              });
              await query(
                `UPDATE leads SET rabbitsign_folder_id = $1, contract_status = 'sent' WHERE id = $2`,
                [folder.folderId, leadId]
              );
              await query(
                'INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)',
                [userId, leadId, 'rabbitsign_envelope_created', JSON.stringify({ folderId: folder.folderId, contractType })]
              );
              results.push({ type: 'rabbitsign_envelope', ok: true, folderId: folder.folderId, contractType });
            } catch (e) {
              results.push({ type: 'rabbitsign_envelope', ok: false, error: e.message });
            }
            break;
          }
          case 'log': {
            await query(
              'INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)',
              [userId, leadId, 'automation_log', JSON.stringify({ message: action.message })]
            );
            results.push({ type: 'log', message: action.message, ok: true });
            break;
          }
          default: results.push({ type: action.type, ok: false, error: 'Unknown action type' });
        }
      } catch (err) {
        results.push({ type: action.type, ok: false, error: err.message });
      }
    }
  }

  // Only record email work when the transition has an actual template.
  const emailKey = `${fromStage}→${toStage}`;
  if (STAGE_EMAIL_KEYS.has(emailKey)) {
    try {
      const emailResult = await sendStageEmail(fromStage, toStage, leadData);
      results.push({ type: 'email', ok: !!emailResult?.sent, ...emailResult });
    } catch (e) {
      results.push({ type: 'email', ok: false, error: e.message });
    }
  }

  // Build the rich prompt with pre-filled templates
  let prompt = null;
  if (config && config.prompt) {
    prompt = buildRichPrompt(config.prompt, leadData);
  }

  // Also get legacy scripts for backward compatibility
  let scripts = [];
  try {
    scripts = getTransitionScripts(fromStage, toStage, leadData);
  } catch (err) {
    scripts = [{ error: err.message }];
  }

  return {
    automated: !!config,
    workflow: config?.name || `${fromStage}→${toStage}`,
    owner: config?.owner || 'Unknown',
    description: config?.description || '',
    actions_executed: results.length,
    results,
    prompt,
    scripts,
  };
}

/**
 * Build a rich prompt object with pre-filled templates.
 * Fills in actual lead data (names, addresses, prices) into each template.
 */
function buildRichPrompt(promptDef, leadData) {
  const filledSteps = promptDef.steps.map(step => {
    const filled = { ...step };

    // Fill template if specified
    if (step.templateKey) {
      const allDefs = { ...OUTREACH_SCRIPTS, ...SELLER_UPDATE_TEMPLATES };
      const def = allDefs[step.templateKey];
      if (def) {
        const filledTemplate = fillTemplate(step.templateKey, def, leadData);
        filled.filledMessage = filledTemplate.filled;
        filled.unfilled = filledTemplate.unfilled;
        filled.recipientName = filledTemplate.recipient;
        filled.recipientType = filledTemplate.recipientType;
        filled.actionRequired = filledTemplate.actionRequired;
      }
    }

    // Fill script placeholders
    if (step.script && leadData) {
      let script = step.script;
      script = script.replace(/\[day\]/gi, getDayName());
      script = script.replace(/\[their name\]|\[Client Name\]|\[client name\]/gi,
        leadData.seller_name || leadData.agent_name || '[Name]');
      script = script.replace(/\[property address\]|\[address\]/gi,
        leadData.address || '[Address]');
      script = script.replace(/\[Day you spoke\]/gi, '[Day you spoke]');
      filled.filledScript = script;
    }

    // Fill script variants
    if (step.scriptVariants && leadData) {
      const filledVariants = {};
      for (const [key, script] of Object.entries(step.scriptVariants)) {
        let s = script;
        s = s.replace(/\[day\]/gi, getDayName());
        s = s.replace(/\[address\]/gi, leadData.address || '[Address]');
        filledVariants[key] = s;
      }
      filled.filledScriptVariants = filledVariants;
    }

    // Fill objection scripts
    if (step.objectionScripts && leadData) {
      const filledObj = {};
      for (const [key, script] of Object.entries(step.objectionScripts)) {
        let s = script;
        s = s.replace(/\[agent name\]/gi, leadData.agent_name || '[Agent Name]');
        s = s.replace(/\[address\]/gi, leadData.address || '[Address]');
        filledObj[key] = s;
      }
      filled.filledObjectionScripts = filledObj;
    }

    return filled;
  });

  // Fill reminders with actual dates
  const filledReminders = (promptDef.reminders || []).map(r => {
    const due = new Date();
    if (r.offset_hours) due.setHours(due.getHours() + r.offset_hours);
    if (r.offset_days) due.setDate(due.getDate() + r.offset_days);
    return { ...r, due_date: due.toISOString(), due_date_formatted: due.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) };
  });

  return {
    title: promptDef.title,
    description: promptDef.description,
    steps: filledSteps,
    reminders: filledReminders,
    leadName: leadData?.seller_name || leadData?.agent_name || leadData?.address || 'Unknown',
    leadAddress: leadData?.address || 'Unknown',
  };
}

function getDayName() {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];
}

// =============================================================
// TRANSITION MAP — matches the source-of-truth STAGE_TRANSITIONS above
// 21 stages per GHL_WORKFLOWS_SPEC.md Section A
function getAvailableTransitions(currentStage) {
  const fwd = {
    // ===== Montelli (Stages 1-10) =====
    LEAD_ENTERED: ['CONTACT_MADE', 'DEAD'],
    CONTACT_MADE: ['OFFER_READY', 'DEAD'],
    OFFER_READY: ['OFFER_SENT', 'DEAD'],
    OFFER_SENT: ['OFFER_RECEIVED', 'DEAD'],
    OFFER_RECEIVED: ['GAIN_FEEDBACK', 'DEAD'],
    GAIN_FEEDBACK: ['ACTIVE_NEGOTIATION', 'NO_ANSWER', 'SELLER_DECLINED', 'DEAD'],
    NO_ANSWER: ['GAIN_FEEDBACK', 'SELLER_DECLINED', 'DEAD'],
    SELLER_DECLINED: ['GAIN_FEEDBACK', 'DEAD'],
    ACTIVE_NEGOTIATION: ['TERMS_AGREED', 'GAIN_FEEDBACK', 'DEAD'],
    TERMS_AGREED: ['AWAITING_TITLE', 'DEAD'],

    // ===== TC (Stages 11-19) =====
    AWAITING_TITLE: ['CONTRACT_OUT', 'DEAD'],
    CONTRACT_OUT: ['UNDER_CONTRACT', 'DEAD'],
    UNDER_CONTRACT: ['INSPECTION_PERIOD', 'DEAD'],
    INSPECTION_PERIOD: ['INSPECTION_COMPLETE', 'SELLER_DECLINED', 'DEAD'],
    INSPECTION_COMPLETE: ['APPRAISAL_ORDERED', 'DEAD'],
    APPRAISAL_ORDERED: ['APPRAISAL_DONE', 'DEAD'],
    APPRAISAL_DONE: ['JV_SENT', 'WIRE_SETUP', 'TERMS_AGREED', 'DEAD'],
    JV_SENT: ['JV_SIGNED', 'DEAD'],
    JV_SIGNED: ['WIRE_SETUP', 'DEAD'],

    // ===== Closing (Stages 20-21) =====
    WIRE_SETUP: ['CLOSING_DATE', 'DEAD'],
    CLOSING_DATE: ['CLOSED', 'DEAD'],
    CLOSED: [],
  };
  return fwd[currentStage] || [];
}

/**
 * Get the prompt for a specific stage (for "View Prompts" button).
 */
function getStagePrompt(stage, leadData) {
  const transitionMap = {
    // Montelli
    'CONTACT_MADE': 'LEAD_ENTERED→CONTACT_MADE',
    'OFFER_READY': 'CONTACT_MADE→OFFER_READY',
    'OFFER_SENT': 'OFFER_READY→OFFER_SENT',
    'OFFER_RECEIVED': 'OFFER_SENT→OFFER_RECEIVED',
    'GAIN_FEEDBACK': 'OFFER_RECEIVED→GAIN_FEEDBACK',
    'NO_ANSWER': 'GAIN_FEEDBACK→NO_ANSWER',
    'SELLER_DECLINED': 'GAIN_FEEDBACK→SELLER_DECLINED',
    'ACTIVE_NEGOTIATION': 'GAIN_FEEDBACK→ACTIVE_NEGOTIATION',
    'TERMS_AGREED': 'ACTIVE_NEGOTIATION→TERMS_AGREED',
    // TC
    'AWAITING_TITLE': 'TERMS_AGREED→AWAITING_TITLE',
    'CONTRACT_OUT': 'AWAITING_TITLE→CONTRACT_OUT',
    'UNDER_CONTRACT': 'CONTRACT_OUT→UNDER_CONTRACT',
    'INSPECTION_PERIOD': 'UNDER_CONTRACT→INSPECTION_PERIOD',
    'INSPECTION_COMPLETE': 'INSPECTION_PERIOD→INSPECTION_COMPLETE',
    'APPRAISAL_ORDERED': 'INSPECTION_COMPLETE→APPRAISAL_ORDERED',
    'APPRAISAL_DONE': 'APPRAISAL_ORDERED→APPRAISAL_DONE',
    'JV_SENT': 'APPRAISAL_DONE→JV_SENT',
    'JV_SIGNED': 'JV_SENT→JV_SIGNED',
    // Closing
    'WIRE_SETUP': 'JV_SIGNED→WIRE_SETUP',
    'CLOSING_DATE': 'WIRE_SETUP→CLOSING_DATE',
  };

  const key = transitionMap[stage];
  if (!key || !STAGE_TRANSITIONS[key] || !STAGE_TRANSITIONS[key].prompt) return null;

  return buildRichPrompt(STAGE_TRANSITIONS[key].prompt, leadData);
}

module.exports = {
  STAGE_TRANSITIONS,
  executeStageAutomations,
  getAvailableTransitions,
  getStagePrompt,
  buildRichPrompt,
  getOwnerForStage,
  OWNERS,
};
