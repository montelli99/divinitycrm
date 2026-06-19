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
// System notifications via in-app inbox (replaces SMTP)
const { fireStageNotifications, getUserByEmail, createNotification } = require('./notifications');
const { createFolderFromTemplate } = require('./rabbitsign');

const CONTRACT_TEMPLATE_MAP = {
  psa_creative_subto: 'w5EC5hnVWRoGVYUTbxuHwz',
  stack_psa: 'Vf0ahJ1AXi3QWVhXNCBN0C',
  jv_4party: 'rPx7lrG27B1u2pxVzwl21e',
  subto_addendum: '3sIaAVDxaLO386eHCPXe2F',
};
// SMS: Students copy pre-filled templates from prompts and paste into their own phones.
// No automated SMS sending in student CRM.
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
// Removed stages: AWAITING_TITLE, JV_SENT, JV_SIGNED (not in source).
// These were either conflated with adjacent stages or fabricated.

const OWNERS = {
  MONTELLI: {
    name: 'Montelli',
    stages: ['LEAD_ENTERED', 'CONTACT_MADE', 'OFFER_READY', 'OFFER_SENT', 'GAIN_FEEDBACK', 'SELLER_DECLINED', 'ACTIVE_NEGOTIATION'],
    color: '#0066cc',
  },
  KAYLA: {
    name: 'Kayla',
    stages: ['TERMS_AGREED', 'PSA_SENT'],
    color: '#cc6600',
  },
  TC: {
    name: 'TC',
    stages: ['UNDER_CONTRACT', 'INSPECTION_COMPLETE', 'APPRAISAL_DONE'],
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
  // ============================================
  // STAGE 1→2: LEAD_ENTERED → CONTACT_MADE
  // Owner: Montelli
  // Source: AIREI_MASTER_PLAYBOOK.md Part 2 Steps 1-5
  // ============================================
  'LEAD_ENTERED→CONTACT_MADE': {
    name: 'Initial Contact — First Outreach',
    owner: 'Montelli',
    description: 'Send INT/DNCT text, call seller/agent, log notes.',
    prompt: {
      title: 'Stage 1→2: Initial Contact',
      description: 'First outreach to seller. Send text first, then call. Use the right script for the lead type.',
      steps: [
        {
          step: 1,
          action: 'send_text',
          template: 'INT',
          prefill: true,
          to: 'seller',
          instruction: 'SEND INT TEXT FIRST (per Master Playbook Step 3): "Are you still accepting offers for [address]?"',
          templateKey: 'INT',
        },
        {
          step: 2,
          action: 'call',
          instruction: 'CALL SELLER/AGENT. Use Agent Initial Script (if going through agent) or Seller Initial Script (if FSBO).',
          scriptVariants: {
            agent: 'Smile. Happy [day], I\'m calling regarding the property at [address] — I\'m interested in potentially purchasing this as a rental for my portfolio. I just have a couple questions — did I catch you at a good time?',
            seller: 'Happy [day], my name is [my_name] are you still accepting offers at [address]? Great — I\'m interested in potentially purchasing this as a rental for my portfolio.',
          },
        },
        {
          step: 3,
          action: 'take_notes',
          instruction: 'LOG: agent name, agent phone, agent email, seller name, seller phone, roof age, HVAC age, occupancy, rent (if occupied), lease type, utilities. (Per Master Playbook Part 2 Step 7.)',
          fields: ['agent_name', 'agent_phone', 'agent_email', 'seller_name', 'seller_phone', 'roof_age', 'hvac_age', 'occupancy', 'monthly_rent', 'lease_type', 'utilities_on'],
        },
        {
          step: 4,
          action: 'send_text',
          template: 'CCC',
          prefill: true,
          to: 'seller_or_agent',
          instruction: 'SEND CCC TEXT (per Step 5) after every call. Keep door open for follow-up.',
          templateKey: 'CCC',
        },
      ],
      reminders: [
        { type: '48hr_followup', offset_hours: 48, description: '48hr: Follow up if no response' },
      ],
    },
    automations: [
      { type: 'quick_buybox' },
      { type: 'tag_source' },
      { type: 'set_reminder', reminder_type: '48hr_followup', offset_hours: 48 },
      { type: 'log', message: 'Lead contacted. INT sent. Notes logged. CCC template ready.' },
    ],
  },

  // ============================================
  // STAGE 2→3: CONTACT_MADE → OFFER_READY
  // Owner: Montelli
  // Source: AIREI_MASTER_PLAYBOOK.md Part 2 Step 6
  // ============================================
  'CONTACT_MADE→OFFER_READY': {
    name: 'Offer Ready — Underwriting & LOI Request',
    owner: 'Montelli',
    description: 'Evaluate deal type. Run 1% rule. Email Seth for approved LOI.',
    prompt: {
      title: 'Stage 2→3: Evaluate Deal — Request LOI from Seth',
      description: 'Decide: turnkey (F50) or renovation (F10). Run 1% rule. Email Seth for approved LOI.',
      steps: [
        {
          step: 1,
          action: 'evaluate',
          instruction: 'EVALUATE DEAL TYPE (per Master Playbook Step 6): If turnkey/move-in ready → propose F50 (50% down at close, balance in lump sum) or F10 (10% down, payoff in 24 months). If needs renovation → use F10.',
          fields: ['condition', 'rehab_estimate'],
        },
        {
          step: 2,
          action: 'check_rental_comps',
          instruction: 'CHECK RENTAL COMPS via Zillow Rent Estimate / Rentometer. 1% Rule: rent must be ≥ 1% of purchase price (e.g., $250K purchase → $2,500/mo rent minimum).',
          fields: ['market_rent', 'one_percent_value'],
        },
        {
          step: 3,
          action: 'send_email',
          instruction: 'EMAIL SETH: claytoninvestmentsolutions@gmail.com. Subject: "FB LOI Request" (turnkey) or "Renovation – LOI Request [address]" (reno). Include: market rent, purchase price, rehab estimate. (Per Step 6 verbatim.)',
          to: 'claytoninvestmentsolutions@gmail.com',
        },
        {
          step: 4,
          action: 'wait_for_seth',
          instruction: 'WAIT FOR SETH: If passes 1% rule, Seth sends approved LOI. Student imports LOI link into CRM.',
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'run_doc_analysis' },
      { type: 'run_comps' },
      { type: 'run_underwriting' },
      { type: 'loi_request' },
      { type: 'notify' },
      { type: 'log', message: 'Deal evaluated. 1% rule tested. LOI requested from Seth (claytoninvestmentsolutions@gmail.com) per Master Playbook Step 6.' },
    ],
  },

  // ============================================
  // STAGE 3→4: OFFER_READY → OFFER_SENT
  // Owner: Montelli
  // Source: AIREI_MASTER_PLAYBOOK.md Part 2 Steps 7-10
  // ============================================
  'OFFER_READY→OFFER_SENT': {
    name: 'Offer Sent — Import LOI, AI Sends, GCJ',
    owner: 'Montelli',
    description: 'Import Seth\'s approved LOI. Send GCJ group chat. AI sends the offer. 48hr timer starts.',
    prompt: {
      title: 'Stage 3→4: Offer Sent',
      description: 'Import the approved LOI link from Seth. Send GCJ to create group chat. AI sends the offer. 48hr timer starts.',
      steps: [
        {
          step: 1,
          action: 'import_loi',
          instruction: 'IMPORT LOI LINK: From Seth\'s email, copy the approved LOI link. Import into CRM opportunity. (Per Step 7 + Step 10.)',
          fields: ['loi_link'],
        },
        {
          step: 2,
          action: 'send_text',
          template: 'GCJ',
          prefill: true,
          to: 'seller',
          instruction: 'SEND GCJ TEXT (per Step 8): "Creating a group chat for the purchase on [address] with my business partner Kayla. She is currently in a meeting with our lender; The LOI will be coming from our partner at Homewithkaylamauser@gmail.com."',
          templateKey: 'GCJ',
        },
        {
          step: 3,
          action: 'ai_sends_offer',
          instruction: 'AI SENDS THE OFFER (per Part 11 Video 2): "AI sends the actual offer emails for you. Your job: populate the data, import into GHL, send to Kayla + Jaxon, AI handles the offer."',
        },
        {
          step: 4,
          action: 'move_stage',
          instruction: 'MOVE LEAD to "Offer Sent" stage once offer is out. 48hr follow-up timer starts.',
        },
      ],
      reminders: [
        { type: '48hr_followup', offset_hours: 48, description: '48hr: Call to gain feedback (per Step 11)' },
      ],
    },
    automations: [
      { type: 'set_field', field: 'offer_sent_date', value: 'now' },
      { type: 'set_reminder', reminder_type: '48hr_followup', offset_hours: 48 },
      { type: 'notify' },
      { type: 'log', message: 'Offer sent. LOI imported. GCJ group chat created. AI sent the offer. 48hr timer started.' },
    ],
  },

  // ============================================
  // STAGE 4→5: OFFER_SENT → GAIN_FEEDBACK
  // Owner: Montelli
  // Source: AIREI_MASTER_PLAYBOOK.md Part 2 Step 11
  // (combined OFFER_RECEIVED + GAIN_FEEDBACK — same student action)
  // ============================================
  'OFFER_SENT→GAIN_FEEDBACK': {
    name: 'Gain Feedback — 48hr Realignment Call',
    owner: 'Montelli',
    description: '48hr post-offer call. Use realignment language. Relay questions to Kayla. SD text after call.',
    prompt: {
      title: 'Stage 4→5: Gain Feedback — Realign at 48hr',
      description: '48 hours after the offer was sent, call the client. Use the Post-Offer Script. If they have questions, relay to Kayla ("Noted — I\'ll relay this to my business partner"). After the call, send SD text and note DOM-181.',
      steps: [
        {
          step: 1,
          action: 'call',
          instruction: 'REALIGNMENT CALL (per Step 11 + Post-Offer script). "Happy [day] [name] I am just now finding some time to realign with you, we spoke [day] regarding the property at [address]. We had sent an offer over to you. Is there any clarification I can align further regarding the details of our offer?"',
          scriptKey: 'post_offer_48hr',
        },
        {
          step: 2,
          action: 'handle_objections',
          instruction: 'HANDLE OBJECTIONS using realignment language. NEVER say "just checking in" or "just following up". For questions: "Noted — I\'ll relay this to my business partner." Email/text Kayla immediately with the question.',
          objectionScripts: {
            wants_cash: 'That\'s exactly why I\'m calling [agent name] — with the property still being listed for sale — your seller hasn\'t received sufficient offers from buyers who intend to live in the property; our lender has confirmed this will not be able to be a rental for anyone due to institutional interest rates — feel free to revisit this offer right before the listing agreement expires.',
            ask_viewing: 'Our assistant drove past the property a few days back and referred it to us. The photos online look great. We will set up a home inspection like any real estate transaction – within 24 hours.',
            general_questions: 'Noted - what I\'ll do is relay this over to my business partner and will get back with you. I look forward to aligning the finer details with you.',
          },
        },
        {
          step: 3,
          action: 'send_text',
          template: 'SD',
          prefill: true,
          to: 'agent_or_seller',
          instruction: 'SEND SD TEXT after the call (per Step 11): "Feel free to revisit this right before the listing expires if your seller has not been able to find their number with owner occupants." Keeps door open.',
          templateKey: 'SD',
        },
        {
          step: 4,
          action: 'calendar',
          instruction: 'NOTE DAYS ON MARKET. Subtract 181 days. Import into calendar. Call when listing expires. (Per Step 11 verbatim.)',
          fields: ['dom', 'dom_181_reminder_date'],
        },
      ],
      reminders: [
        { type: 'dom_181', description: 'DOM-181: Circle back when listing expires (per Step 11)' },
      ],
    },
    automations: [
      { type: 'set_reminder', reminder_type: 'dom_181' },
      { type: 'notify' },
      { type: 'log', message: '48hr realignment call completed. SD text sent. DOM-181 reminder set.' },
    ],
  },

  // ============================================
  // STAGE 5→6: GAIN_FEEDBACK → SELLER_DECLINED
  // Owner: Montelli
  // Source: Step 11: send SD + DOM-181 callback
  // ============================================
  'GAIN_FEEDBACK→SELLER_DECLINED': {
    name: 'Seller Declined — Nurture via DOM-181',
    owner: 'Montelli',
    description: 'Seller not interested. SD text sent. DOM-181 nurture callback scheduled.',
    prompt: {
      title: 'Stage 5→6: Seller Declined — DOM-181 Nurture',
      description: 'Seller is not interested now. SD text already sent. Schedule DOM-181 callback.',
      steps: [
        {
          step: 1,
          action: 'log',
          instruction: 'Record why the deal died in CRM notes for future reference.',
          fields: ['dead_reason'],
        },
        {
          step: 2,
          action: 'ask_referral',
          instruction: 'Ask: "Other properties to offload?" — double/triple/quadruple dip.',
        },
        {
          step: 3,
          action: 'calendar',
          instruction: 'DOM-181 is already set from previous stage. Wait for that reminder to fire.',
        },
      ],
      reminders: [
        { type: '181_day_nurture', offset_days: 181, description: '181-day: Listing expiring — call NOW (per source)' },
      ],
    },
    automations: [
      { type: 'set_field', field: 'nurture_stage', value: 'declined_awaiting_dom181' },
      { type: 'set_reminder', reminder_type: '181_day_nurture', offset_days: 181 },
      { type: 'log', message: 'Seller declined. SD template already sent. DOM-181 nurture callback scheduled.' },
    ],
  },

  // ============================================
  // STAGE 6→7: GAIN_FEEDBACK → ACTIVE_NEGOTIATION
  // Owner: Montelli
  // Source: Counter received from seller (implied in script objections)
  // ============================================
  'GAIN_FEEDBACK→ACTIVE_NEGOTIATION': {
    name: 'Active Negotiation — Counter Received',
    owner: 'Montelli',
    description: 'Seller countered. Re-run comps + underwriting. Relay counter to Kayla.',
    prompt: {
      title: 'Stage 6→7: Active Negotiation',
      description: 'Seller sent a counter. Re-run the offer calc with the new price. Relay the counter to Kayla for response.',
      steps: [
        {
          step: 1,
          action: 'document_counter',
          instruction: 'DOCUMENT COUNTER: Record seller\'s counter terms in CRM. New asking price, any other changes (close date, EMD, etc.).',
          fields: ['seller_counter', 'counter_price', 'counter_terms'],
        },
        {
          step: 2,
          action: 'run_underwriting',
          instruction: 'RE-RUN OFFER CALC with new price. Test all 4 strategies (Cash, Stack, 10% Down, Sub2 — per Master Playbook Part 5).',
          detail: 'If new numbers break 1% rule, deal is dead. If they pass, move forward.',
        },
        {
          step: 3,
          action: 'notify',
          role: 'closer',
          instruction: 'NOTIFY KAYLA: "Counter received on [address]. New price [X]. Numbers attached."',
          contacts: ['homewithkaylamauser@gmail.com'],
        },
        {
          step: 4,
          action: 'await_kayla',
          instruction: 'AWAIT KAYLA RESPONSE: Kayla generates a counter-response. Student delivers the counter to seller.',
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'run_comps' },
      { type: 'run_underwriting' },
      { type: 'notify' },
      { type: 'log', message: 'Counter received. Comps + offer calc re-run. Kayla notified.' },
    ],
  },

  // ============================================
  // STAGE 7→8: ACTIVE_NEGOTIATION → TERMS_AGREED
  // Owner: Montelli
  // Source: Seller accepts counter (or original) terms
  // ============================================
  'ACTIVE_NEGOTIATION→TERMS_AGREED': {
    name: 'Terms Agreed — Hand to Kayla',
    owner: 'Montelli',
    description: 'Seller accepts. Hand the deal to Kayla for agreement drafting.',
    prompt: {
      title: 'Stage 7→8: Terms Agreed — Hand to Kayla',
      description: 'Both parties aligned on terms. Hand the deal to Kayla for the agreement drafting and sending. Student\'s job: monitor seller every 3-5 days until close.',
      steps: [
        {
          step: 1,
          action: 'document_terms',
          instruction: 'DOCUMENT FINAL TERMS: agreed price, structure (50% down / 50% carry / 72mo balloon / deed in lieu per Master Playbook Part 5), close date target, EMD, seller/agent contact info.',
          fields: ['agreed_price', 'contract_structure', 'coe_target_date', 'emd_amount'],
        },
        {
          step: 2,
          action: 'log',
          instruction: 'TERMS AGREED. Hand the deal to Kayla via the CRM. (See hand_to_kayla automation.)',
        },
        {
          step: 3,
          action: 'monitor_seller',
          instruction: 'BEGIN SELLER MONITORING CADENCE: text seller every 3-5 days: "Hey [name] — just checking in — everything smooth on your end?" Continue until close.',
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'notify' },
      { type: 'hand_to_kayla' },
      { type: 'log', message: 'Terms agreed. Handed to Kayla for agreement drafting. Student begins seller monitoring.' },
    ],
  },

  // ============================================
  // STAGE 8→9: TERMS_AGREED → PSA_SENT
  // Owner: Kayla
  // Source: AIREI_MASTER_PLAYBOOK.md Part 7 step 1
  // RENAMED: "CONTRACT_OUT" → "PSA_SENT" (per source: PSA sent for authorization)
  // ============================================
  'TERMS_AGREED→PSA_SENT': {
    name: 'PSA Sent — For Seller Authorization',
    owner: 'Kayla',
    description: 'Kayla drafts agreement, sends to TC. TC sends to seller for review + authorization.',
    prompt: {
      title: 'Stage 8→9: PSA Sent for Authorization',
      description: 'Kayla drafts the agreement (PSA / JV / Consulting). Sends to TC. TC sends to seller for review and authorization. (Per Master Playbook Part 7 step 1.)',
      steps: [
        {
          step: 1,
          action: 'kayla_drafts',
          instruction: 'KAYLA DRAFTS agreement from template (Creative SubTo / Stack / Cash / JV as appropriate).',
        },
        {
          step: 2,
          action: 'tc_sends',
          instruction: 'KAYLA SENDS agreement to TC. TC sends to seller for review and authorization.',
          detail: 'TC Handshake Package: Property address, seller/agent info, agreed terms, draft agreement PDF.',
        },
        {
          step: 3,
          action: 'await_signature',
          instruction: 'AWAIT SELLER AUTHORIZATION: Once seller signs/authorizes, lead moves to UNDER_CONTRACT.',
        },
        {
          step: 4,
          action: 'student_monitors',
          instruction: 'STUDENT: Continue monitoring seller every 3-5 days: "Hey [name] — just checking in — everything smooth on your end?"',
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'set_field', field: 'psa_signed_date', value: 'now' },  // Field tracks when PSA sent for authorization (per Part 7)
      { type: 'set_field', field: 'coe_date', value: 'now+30d' },  // 30-day standard closing per Part 7
      { type: 'notify' },
      { type: 'log', message: 'PSA sent to seller for authorization (per Master Playbook Part 7 step 1). Awaiting signature.' },
    ],
  },

  // ============================================
  // STAGE 9→10: PSA_SENT → UNDER_CONTRACT
  // Owner: TC
  // Source: AIREI_MASTER_PLAYBOOK.md Part 7 step 2
  // ============================================
  'PSA_SENT→UNDER_CONTRACT': {
    name: 'Under Contract — TC Handoff',
    owner: 'TC',
    description: 'PSA signed. TC takes over. Inspection + appraisal + title work begins.',
    prompt: {
      title: 'Stage 9→10: Under Contract — TC Takes Over',
      description: 'Seller has signed/authorized. Lead is now under contract. TC takes over next steps. (Per Part 7 step 2: "Kay arranges home inspector + sewer scope. After completed, appraisal ordered.")',
      steps: [
        {
          step: 1,
          action: 'tc_handoff',
          instruction: 'TC HANDOFF: TC receives signed agreement. Begins inspection + appraisal + title work in parallel.',
        },
        {
          step: 2,
          action: 'schedule_inspection',
          instruction: 'KAYLA ARRANGES home inspector + sewer scope. (Per Part 7 step 2 verbatim.)',
        },
        {
          step: 3,
          action: 'student_continues_monitoring',
          instruction: 'STUDENT: Continue monitoring seller every 3-5 days.',
        },
      ],
      reminders: [
        { type: 'inspection', offset_days: 7, description: 'Inspection reminder — 7 days in' },
      ],
    },
    automations: [
      { type: 'set_reminder', reminder_type: 'inspection', offset_days: 7 },
      { type: 'set_reminder', reminder_type: 'coe', offset_days: 23 },  // 30d COE minus 7d buffer
      { type: 'notify' },
      { type: 'log', message: 'Under contract. TC handoff complete. Inspection + appraisal + title work in progress.' },
    ],
  },

  // ============================================
  // STAGE 10→11: UNDER_CONTRACT → INSPECTION_COMPLETE
  // Owner: TC
  // Source: AIREI_MASTER_PLAYBOOK.md Part 7 step 2
  // (combined UNDER_CONTRACT → INSPECTION_PERIOD → INSPECTION_COMPLETE)
  // ============================================
  'UNDER_CONTRACT→INSPECTION_COMPLETE': {
    name: 'Inspection Complete — Move to Appraisal',
    owner: 'TC',
    description: 'Inspection done. Appraisal next. (Inspection period is variable; not 14 days in source.)',
    prompt: {
      title: 'Stage 10→11: Inspection Complete',
      description: 'Inspection done. Move to appraisal. (Per Part 7: "After completed, appraisal ordered.")',
      steps: [
        {
          step: 1,
          action: 'log',
          instruction: 'Record inspection results, any issues found, repairs requested.',
          fields: ['inspection_results', 'repairs_requested'],
        },
        {
          step: 2,
          action: 'order_appraisal',
          instruction: 'APPRAISAL ORDERED. (Per Part 7: "After completed, appraisal ordered.")',
        },
        {
          step: 3,
          action: 'student_continues_monitoring',
          instruction: 'STUDENT: Continue monitoring seller every 3-5 days.',
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'log', message: 'Inspection complete. Appraisal ordered (per Master Playbook Part 7 step 2).' },
    ],
  },

  // ============================================
  // STAGE 11→12: INSPECTION_COMPLETE → APPRAISAL_DONE
  // Owner: TC
  // Source: AIREI_MASTER_PLAYBOOK.md Part 7 step 2 + 10-STEP3-Pt2 transcript
  // (combined INSPECTION_COMPLETE → APPRAISAL_ORDERED → APPRAISAL_DONE)
  // ============================================
  'INSPECTION_COMPLETE→APPRAISAL_DONE': {
    name: 'Appraisal Done — Move to Wire Setup',
    owner: 'TC',
    description: 'Appraisal complete. Re-run offer calc with appraisal value. If low, renegotiate.',
    prompt: {
      title: 'Stage 11→12: Appraisal Done',
      description: 'Appraisal result in. Re-run offer calc with appraisal value. If appraisal < purchase price, renegotiate or pull deal. (Per 10-STEP3-Pt2 transcript: "if appraisal comes in low, we can renegotiate.")',
      steps: [
        {
          step: 1,
          action: 'run_underwriting',
          instruction: 'RE-RUN OFFER CALC with appraisal value. Compare new DSCR/cash flow to pre-appraisal.',
          fields: ['appraisal_value'],
        },
        {
          step: 2,
          action: 'evaluate',
          instruction: 'IF APPRAISAL ≥ PP: move forward. IF APPRAISAL < PP: alert Kayla, consider renegotiating or pulling deal.',
        },
        {
          step: 3,
          action: 'student_continues_monitoring',
          instruction: 'STUDENT: Continue monitoring seller every 3-5 days.',
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'run_underwriting' },
      { type: 'notify' },
      { type: 'log', message: 'Appraisal done. Offer calc re-run. Ready for wire setup.' },
    ],
  },

  // ============================================
  // STAGE 12→13: APPRAISAL_DONE → WIRE_SETUP
  // Owner: Closing
  // Source: AIREI_MASTER_PLAYBOOK.md Part 7 (Montelli contacts title for wiring)
  // (combined APPRAISAL_DONE → JV_SENT → JV_SIGNED → WIRE_SETUP since JV is the consulting agreement, part of Kayla's flow)
  // ============================================
  'APPRAISAL_DONE→WIRE_SETUP': {
    name: 'Wire Setup — Title Wire Instructions',
    owner: 'Closing',
    description: 'Montelli contacts title for wiring instructions. Kayla sends consulting agreement. (Per Part 7 step 3.)',
    prompt: {
      title: 'Stage 12→13: Wire Setup',
      description: 'Appraisal passed. Title work in progress. Montelli contacts title for wire instructions. Kayla sends consulting agreement (per Part 7 step 3).',
      steps: [
        {
          step: 1,
          action: 'kayla_sends_consulting',
          instruction: 'KAYLA SENDS CONSULTING AGREEMENT. (Per Part 7 step 3: "Signed by Kayla + Mentee. Sent to title by TC.")',
        },
        {
          step: 2,
          action: 'montelli_wire',
          instruction: 'MONTELLI CONTACTS TITLE for wire instructions. (Per Part 7 step 2: "Montelli contacts title for wiring instructions.")',
          fields: ['wire_instructions'],
        },
        {
          step: 3,
          action: 'student_final_ask',
          instruction: 'FINAL CHECK-IN WITH SELLER: "Closing is [date]. Excited to close! Any last questions before we sign?"',
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'log', message: 'Wire setup. Consulting agreement sent. Title wire instructions requested.' },
    ],
  },

  // ============================================
  // STAGE 13→14: WIRE_SETUP → CLOSING_DATE
  // Owner: Closing
  // Source: AIREI_MASTER_PLAYBOOK.md Part 7 step 4
  // ============================================
  'WIRE_SETUP→CLOSING_DATE': {
    name: 'Closing Date — Final Steps',
    owner: 'Closing',
    description: 'Wire funds. Close at title. Always ask for referrals.',
    prompt: {
      title: 'Stage 13→14: Closing Date — Final Steps',
      description: 'Wire funds to title. Close at title company. Always ask for referrals (per Part 7 step 4 + Master Playbook Part 2 Step 12).',
      steps: [
        {
          step: 1,
          action: 'wire_funds',
          instruction: 'WIRE FUNDS to title company. Verify all documents signed.',
          fields: ['wire_confirmed', 'wire_amount'],
        },
        {
          step: 2,
          action: 'close_at_title',
          instruction: 'CLOSE AT TITLE. Funds distributed. (Per Part 7 step 4: "All funds distributed at title company.")',
        },
        {
          step: 3,
          action: 'ask_referrals',
          instruction: 'ALWAYS ASK: "Do you have any other properties you\'re looking to offload? Anyone in your network who might be a fit? We pay referral fees." (Per Part 2 Step 12: "double/triple/quadruple dip".)',
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'set_field', field: 'closed_date', value: 'now' },
      { type: 'log', message: 'Closed. Funds distributed at title. Always ask for referrals (per Master Playbook Part 2 Step 12).' },
    ],
  },

  // ============================================
  // STAGE 14→15: CLOSING_DATE → ARCHIVED
  // Owner: System
  // Source: AIREI_MASTER_PLAYBOOK.md Part 2 Step 12
  // ============================================
  'CLOSING_DATE→ARCHIVED': {
    name: 'Archived — Deal Closed',
    owner: 'System',
    description: 'Lead archived. All documents preserved.',
    prompt: {
      title: 'Lead Archived',
      description: 'Deal closed and archived. All documents preserved.',
      steps: [
        {
          step: 1,
          action: 'log',
          instruction: 'Lead archived. Data preserved.',
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'log', message: 'Archived.' },
    ],
  },

  // ============================================
  // ============================================
  // STAGE 6: SELLER_DECLINED → ACTIVE_NEGOTIATION
  // (soft decline — seller re-engages, counter received)
  // Owner: Montelli
  // ============================================
  'SELLER_DECLINED→ACTIVE_NEGOTIATION': {
    name: 'Re-Engagement — Active Negotiation Resumed',
    owner: 'Montelli',
    description: 'Seller re-engaged from nurture. Counter received. Re-run offer calc.',
    prompt: {
      title: 'Stage 6: SELLER_DECLINED → ACTIVE_NEGOTIATION',
      description: 'Seller re-engaged from the nurture pipeline. Counter received. Re-run offer calc with new price.',
      steps: [
        {
          step: 1,
          action: 'document_counter',
          instruction: "DOCUMENT COUNTER: Record seller's new counter terms in CRM.",
          fields: ['seller_counter', 'counter_price', 'counter_terms'],
        },
        {
          step: 2,
          action: 'run_underwriting',
          instruction: 'RE-RUN OFFER CALC with new price. Test all 4 strategies (Cash, Stack, 10% Down, Sub2 — per Master Playbook Part 5).',
        },
        {
          step: 3,
          action: 'notify',
          role: 'closer',
          instruction: 'NOTIFY KAYLA: "Counter received on [address]. New price [X]. Numbers attached."',
          contacts: ['homewithkaylamauser@gmail.com'],
        },
        {
          step: 4,
          action: 'await_kayla',
          instruction: 'AWAIT KAYLA RESPONSE: Kayla generates counter-response. Student delivers to seller.',
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'run_comps' },
      { type: 'run_underwriting' },
      { type: 'notify' },
      { type: 'log', message: 'Seller re-engaged from nurture. Comps + offer calc re-run. Kayla notified.' },
    ],
  },
  // * → DEAD
  // Owner: Montelli
  // Source: Master Playbook Part 2 Step 11
  // ============================================
  '*→DEAD': {
    name: 'Deal Dead — DOM-181 Nurture',
    owner: 'Montelli',
    description: 'Deal marked dead. SD text + DOM-181 callback.',
    prompt: {
      title: 'Deal Dead — DOM-181 Circle Back',
      description: 'Deal is dead for now. SD text sent, DOM-181 reminder scheduled. Wait for listing to expire, then circle back.',
      steps: [
        {
          step: 1,
          action: 'send_text',
          template: 'SD',
          prefill: true,
          to: 'seller',
          instruction: 'SEND SD TEXT: keeps door open for the future.',
          templateKey: 'SD',
        },
        {
          step: 2,
          action: 'calendar',
          instruction: 'Note Days on Market (DOM). Subtract 181 days. Set calendar reminder.',
          fields: ['dom', 'dom_181_reminder_date'],
        },
        {
          step: 3,
          action: 'record_reason',
          instruction: 'Record why the deal died in CRM notes for future reference.',
          fields: ['dead_reason'],
        },
      ],
      reminders: [
        { type: 'dom_181', description: 'DOM-181: Circle back when listing expires' },
      ],
    },
    automations: [
      { type: 'set_reminder', reminder_type: 'dom_181' },
      { type: 'log', message: 'Deal marked dead. SD template + DOM-181 reminder set.' },
    ],
  },

  // ============================================
  // * → ARCHIVED
  // ============================================
  '*→ARCHIVED': {
    name: 'Archived',
    owner: 'System',
    description: 'Lead archived.',
    prompt: {
      title: 'Lead Archived',
      description: 'This lead has been archived.',
      steps: [
        {
          step: 1,
          action: 'log',
          instruction: 'Lead archived. All data preserved.',
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'log', message: 'Archived.' },
    ],
  },
};

// =============================================================
// EXECUTION ENGINE
// =============================================================

async function executeStageAutomations(leadId, userId, fromStage, toStage, leadData) {
  const key = `${fromStage}→${toStage}`;
  const config = STAGE_TRANSITIONS[key] || STAGE_TRANSITIONS[`*→${toStage}`];
  const results = [];
  const now = new Date();

  if (config && config.automations) {
    for (const action of config.automations) {
      try {
        switch (action.type) {
          case 'set_field': {
            let value = action.value;
            if (value === 'now') value = now.toISOString();
            else if (value === 'now+48h') { const d = new Date(now); d.setHours(d.getHours() + 48); value = d.toISOString(); }
            else if (value === 'now+30d') { const d = new Date(now); d.setDate(d.getDate() + 30); value = d.toISOString().split('T')[0]; }
            else if (value === 'now+14d') { const d = new Date(now); d.setDate(d.getDate() + 14); value = d.toISOString().split('T')[0]; }
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
            const { price, monthly_rent: rent, sqft, arv, condition, existing_loan_balance, existing_loan_rate } = leadData;
            const onePercentValue = price > 0 ? rent / price : 0;
            const onePercentRule = onePercentValue >= 0.01;
            let rate = 30; if (condition === 'reno') rate = 60; else if (condition === 'livable') rate = 45;
            const repairs = (sqft || 0) * rate;
            const fee = leadData.wholesale_fee || 20000;
            const inv = (arv || 0) * 0.70;
            const cash = inv - repairs - fee;
            const f50 = cash > 0 ? Math.round(cash * 1.27) : 0;
            const subto = arv > 0 ? arv - repairs - (existing_loan_balance || 0) : 0;
            let rec = 'cash';
            if ((existing_loan_balance || 0) > 0 && existing_loan_rate > 0 && existing_loan_rate < 0.05) rec = 'subto';
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
                [userId, leadId, 'notification_fired', JSON.stringify({ stage: toStage, count: notifResult.fired })]
              );
              results.push({ type: 'notify', ok: true, fired: notifResult.fired });
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

              results.push({ type: 'loi_request', ok: true, subject, onePercentTest, sethNotified: !!sethId });
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

              // Notify Kayla (primary closer)
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
// 16 transitions total (down from 21 — collapsed fabricated granular stages)
function getAvailableTransitions(currentStage) {
  const fwd = {
    // Montelli stages
    LEAD_ENTERED: ['CONTACT_MADE', 'DEAD'],
    CONTACT_MADE: ['OFFER_READY', 'DEAD'],
    OFFER_READY: ['OFFER_SENT', 'DEAD'],
    OFFER_SENT: ['GAIN_FEEDBACK', 'SELLER_DECLINED', 'TERMS_AGREED', 'DEAD'],
    GAIN_FEEDBACK: ['SELLER_DECLINED', 'ACTIVE_NEGOTIATION', 'TERMS_AGREED', 'DEAD'],
    SELLER_DECLINED: ['ACTIVE_NEGOTIATION', 'GAIN_FEEDBACK', 'DEAD'],
    ACTIVE_NEGOTIATION: ['TERMS_AGREED', 'SELLER_DECLINED', 'DEAD'],

    // Kayla stages
    TERMS_AGREED: ['PSA_SENT', 'DEAD'],

    // TC stages
    PSA_SENT: ['UNDER_CONTRACT', 'DEAD'],
    UNDER_CONTRACT: ['INSPECTION_COMPLETE', 'DEAD'],
    INSPECTION_COMPLETE: ['APPRAISAL_DONE', 'DEAD'],

    // Closing stages
    APPRAISAL_DONE: ['WIRE_SETUP', 'ACTIVE_NEGOTIATION', 'DEAD'],
    WIRE_SETUP: ['CLOSING_DATE', 'DEAD'],
    CLOSING_DATE: ['ARCHIVED'],

    // Wrap
    DEAD: ['LEAD_ENTERED', 'CONTACT_MADE', 'OFFER_READY'],
    ARCHIVED: ['LEAD_ENTERED'],
  };
  return fwd[currentStage] || [];
}

/**
 * Get the prompt for a specific stage (for "View Prompts" button).
 */
function getStagePrompt(stage, leadData) {
  const transitionMap = {
    'CONTACT_MADE': 'LEAD_ENTERED→CONTACT_MADE',
    'OFFER_READY': 'CONTACT_MADE→OFFER_READY',
    'OFFER_SENT': 'OFFER_READY→OFFER_SENT',
    'GAIN_FEEDBACK': 'OFFER_SENT→GAIN_FEEDBACK',
    'SELLER_DECLINED': 'GAIN_FEEDBACK→SELLER_DECLINED',
    'ACTIVE_NEGOTIATION': 'GAIN_FEEDBACK→ACTIVE_NEGOTIATION',
    'TERMS_AGREED': 'ACTIVE_NEGOTIATION→TERMS_AGREED',
    'PSA_SENT': 'TERMS_AGREED→PSA_SENT',
    'UNDER_CONTRACT': 'PSA_SENT→UNDER_CONTRACT',
    'INSPECTION_COMPLETE': 'UNDER_CONTRACT→INSPECTION_COMPLETE',
    'APPRAISAL_DONE': 'INSPECTION_COMPLETE→APPRAISAL_DONE',
    'WIRE_SETUP': 'APPRAISAL_DONE→WIRE_SETUP',
    'CLOSING_DATE': 'WIRE_SETUP→CLOSING_DATE',
    'DEAD': '*→DEAD',
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
