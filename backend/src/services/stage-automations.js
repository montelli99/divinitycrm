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
const { fireStageNotifications } = require('./notifications');
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
const { registerPostClose, sendTestimonialRequest, sendReferralRequest, runPokemonSpawn } = require('./post-close-engine');
const { allocateClosingCosts, saveAllocationToLead } = require('./closing-cost-allocator');
const { evaluateMidTerm, generateMidTermPitch } = require('./mid-term-pivot');
const { runDocAnalysis, quickBuyBoxCheck } = require('./doc-analyzer');
const { tagLeadSource, scoreLead } = require('./lead-source-tracker');

// =============================================================
// OWNER SECTIONS
// =============================================================

const OWNERS = {
  MONTELLI: { name: 'Montelli', stages: ['LEAD_ENTERED', 'CONTACT_MADE', 'OFFER_READY'], color: '#0066cc' },
  KAYLA: { name: 'Kayla', stages: ['OFFER_SENT', 'OFFER_RECEIVED', 'GAIN_FEEDBACK', 'NO_ANSWER', 'SELLER_DECLINED', 'ACTIVE_NEGOTIATION', 'TERMS_AGREED'], color: '#cc6600' },
  CONTRACTS: { name: 'Contracts', stages: ['AWAITING_TITLE', 'CONTRACT_OUT'], color: '#cc0000' },
  TC: { name: 'TC', stages: ['UNDER_CONTRACT', 'INSPECTION_PERIOD', 'INSPECTION_COMPLETE', 'APPRAISAL_ORDERED', 'APPRAISAL_DONE'], color: '#00cc00' },
  JV: { name: 'JV', stages: ['JV_SENT', 'JV_SIGNED'], color: '#6600cc' },
  CLOSING: { name: 'Closing', stages: ['WIRE_SETUP', 'CLOSING_DATE'], color: '#cc0066' },
};

function getOwnerForStage(stage) {
  for (const [key, owner] of Object.entries(OWNERS)) {
    if (owner.stages.includes(stage)) return owner;
  }
  return { name: 'Unknown', stages: [], color: '#999' };
}

// =============================================================
// COMPREHENSIVE 21-STAGE TRANSITION PROMPTS
// =============================================================

const STAGE_TRANSITIONS = {
  // ============================================
  // STAGE 1→2: LEAD_ENTERED → CONTACT_MADE
  // Owner: Montelli
  // ============================================
  'LEAD_ENTERED→CONTACT_MADE': {
    name: 'Contact Made — INT + Call + CCC',
    owner: 'Montelli',
    description: 'First contact with the agent/seller — send INT text, call, send CCC, take notes.',
    prompt: {
      title: 'Stage 1→2: Make Contact',
      description: 'Before calling, send the INT text so your name shows as caller ID. Call twice. If no answer, send voice memo. After call, send CCC + contact card.',
      steps: [
        {
          step: 1,
          action: 'evaluate',
          instruction: 'BUY BOX CHECK: Population ≥ 10,000? Zip code in buy box? Price $150K-$550K? 3+ beds? No HOA? No pools? No flood zones? If fail → mark DEAD.',
          fields: ['population', 'population_ok', 'buy_box_match', 'buy_box_passed'],
          detail: 'Google the city + "population". Must be ≥ 10K. If not, discard lead immediately.',
        },
        {
          step: 2,
          action: 'send_text',
          template: 'INT',
          prefill: true,
          to: 'agent_or_seller',
          instruction: 'Send this BEFORE calling so your name shows as caller ID instead of "Unknown Caller"',
          templateKey: 'INT',
        },
        {
          step: 3,
          action: 'call',
          instruction: 'Call the client TWICE. If no answer both times, send voice memo.',
          script: 'Happy [day] [their name] I had called intending to introduce myself regarding purchasing [property address] as a rental for my portfolio. I\'m going to give my lender a quick call, they only look at servicing the debt based on the rental income with a DSCR loan. To streamline the communication I will loop you in with my business partner Jaxon who will be purchasing with me regarding the finer details of our offer.',
          scriptVariants: {
            agent: 'Smile. SLOW. "Happy [day], I\'m calling regarding [address] — interested in purchasing as a rental for my portfolio. Did I catch you at a good time?" → Photos look great, SHOCKED it hasn\'t sold → Feedback from other buyers? → Roof/HVAC age? → Occupied/Vacant? → If rented: rent amount, lease type, when signed → If vacant: why not rent it out? → Utilities on? → DSCR loan based on rent → call lender → Good email?',
            seller: 'Same structure, addresses seller directly instead of agent.',
            rehab: 'Distressed property variant — condition rating 1-10, what it needs to be a 10, why not put money in and make profit, no commission savings.',
          },
        },
        {
          step: 4,
          action: 'send_text',
          template: 'CCC',
          prefill: true,
          to: 'agent_or_seller',
          instruction: 'Send contact card AFTER every call — before hanging up',
          templateKey: 'CCC',
        },
        {
          step: 5,
          action: 'send_text',
          template: 'NOA',
          prefill: true,
          to: 'agent_or_seller',
          instruction: 'Send if no answer after 2 calls',
          templateKey: 'NOA',
          condition: 'no_answer',
        },
        {
          step: 6,
          action: 'take_notes',
          instruction: 'Record these details during/after the call',
          fields: [
            'agent_name', 'agent_phone', 'agent_email',
            'seller_name', 'seller_phone', 'seller_email',
            'roof_age', 'hvac_age',
            'occupancy', 'current_rent', 'lease_type', 'lease_term',
            'utilities_status',
            'other_buyer_feedback',
            'condition', 'condition_rating',
          ],
        },
        {
          step: 7,
          action: 'save_contact',
          instruction: 'Save client in phone: contact type (Agent/Seller) + property address in company line',
        },
      ],
      reminders: [
        { type: '48hr_followup', offset_hours: 48, description: 'Follow up in 48 hours if no response' },
      ],
    },
    automations: [
      { type: 'quick_buybox' },
      { type: 'tag_source' },
      { type: 'set_reminder', reminder_type: '48hr_followup', offset_hours: 48 },
      { type: 'log', message: 'Contact made. INT + CCC templates ready. Notes recorded.' },
    ],
  },

  // ============================================
  // STAGE 2→3: CONTACT_MADE → OFFER_READY
  // Owner: Montelli
  // ============================================
  'CONTACT_MADE→OFFER_READY': {
    name: 'Evaluate & Prepare Offer',
    owner: 'Montelli',
    description: 'Evaluate the deal, run underwriting, prepare offer for Kayla.',
    prompt: {
      title: 'Stage 2→3: Evaluate Deal + Prepare Offer',
      description: 'Check population, buy box, condition. Run underwriting. Prepare offer for Kayla.',
      steps: [
        {
          step: 1,
          action: 'evaluate',
          instruction: 'EVALUATE: Turnkey or Renovation? F50 or F10?',
          fields: ['condition', 'condition_rating'],
          detail: 'TURNKEY (good condition) → F50 pitch: "Would you be opposed to taking half your price now and the rest in one lump sum in the near future?"\nRENOVATION → F10 pitch: "Would you be opposed to taking 10% of your price now and the rest in one lump sum in just 24 months?"',
        },
        {
          step: 2,
          action: 'send_text',
          template: 'F50',
          prefill: true,
          to: 'seller',
          instruction: 'Send F50 if turnkey — 50% down seller finance pitch',
          templateKey: 'F50',
          condition: 'turnkey',
        },
        {
          step: 3,
          action: 'send_text',
          template: 'F10',
          prefill: true,
          to: 'seller',
          instruction: 'Send F10 if renovation — 10% down 24-month balloon pitch',
          templateKey: 'F10',
          condition: 'reno',
        },
        {
          step: 4,
          action: 'check_rental_comps',
          instruction: 'Check Zillow Rent Estimate / Rentometer. Rule: rent must be ~1% of purchase price (e.g., $250K → $2,500/mo min).',
          detail: '1% RULE: monthly_rent / purchase_price ≥ 0.01. If fails, flag for review.',
        },
        {
          step: 5,
          action: 'run_underwriting',
          instruction: 'Calculate: ARV × 0.70 − Repairs − Fee = Max Offer. Run all 5 strategies.',
          detail: 'Find ARV from Redfin/Zillow comps. Repair estimate: $30/sqft turnkey, $45/sqft livable, $60/sqft renovation. Wholesale fee: $20K default.',
        },
        {
          step: 6,
          action: 'notify',
          role: 'closer',
          instruction: 'Notify Kayla: "Offer ready for [address]. All details in CRM."',
          contacts: ['homewithkaylamauser@gmail.com'],
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'run_doc_analysis' },
      { type: 'run_comps' },
      { type: 'run_underwriting' },
      { type: 'notify' },
      { type: 'log', message: 'Deal evaluated. Doc analysis + comps + underwriting run. Seth emailed.' },
    ],
  },

  // ============================================
  // STAGE 3→4: OFFER_READY → OFFER_SENT
  // Owner: Montelli → Kayla handoff
  // ============================================
  'OFFER_READY→OFFER_SENT': {
    name: 'Send Offer + Group Chat',
    owner: 'Kayla',
    description: 'Run comps, calculate offer, recommend strategy, auto-fill LOI, notify Kayla.',
    prompt: {
      title: 'Stage 3→4: Run Comps + Calculate Offer + Send LOI',
      description: 'Run full comps analysis. Calculate offer across all strategies. Recommend best strategy. Auto-fill LOI template. Notify Kayla to send.',
      steps: [
        {
          step: 1,
          action: 'run_underwriting',
          instruction: 'RUN COMPS: Pull Zillow/Redfin comps within 1 mile. Get ARV, median $/sqft, YoY trend.',
          detail: 'Comps module: autoFetchExecutionPlan or manual entry. Finalize comp report with Jax 50% Down / 1% Rule + Kayla Creative Framework.',
        },
        {
          step: 2,
          action: 'run_underwriting',
          instruction: 'CALCULATE OFFER: Run all 5 strategies — Cash, F50, F10, SubTo, MidTerm.',
          detail: 'offer-calculator.runAllStrategies(). Returns side-by-side comparison with DSCR, cash flow, 1% rule for each.',
        },
        {
          step: 3,
          action: 'evaluate',
          instruction: 'RECOMMEND STRATEGY: Based on equity, condition, motivation, existing loan rate.',
          detail: 'Exit Strategy Cheatsheet routing:\n- High equity + turnkey → Stack 50%\n- Low equity + low rate → SubTo\n- Free & clear + capital gains → $0 Down\n- High motivation → Cash\n- MFH → MFH Stack or SubTo Hybrid Pivot',
        },
        {
          step: 4,
          action: 'send_offer',
          instruction: 'AUTO-FILL LOI: Select correct LOI template based on recommended strategy. Fill all merge fields.',
          detail: 'LOI Templates: Stack, Cash, $0 Down, SubTo, MFH, Interest Only, Stack w/ Principal, 10% DP 2yr balloon, Portfolio Stack, Stack & Cash, Stack 5yr BAL, AI V2 LOI.',
        },
        {
          step: 5,
          action: 'notify',
          role: 'closer',
          instruction: 'NOTIFY KAYLA: "LOI ready for [address]. Strategy: [strategy]. Offer: $[amount]."',
          contacts: ['homewithkaylamauser@gmail.com'],
        },
        {
          step: 6,
          action: 'send_text',
          template: 'GCJ',
          prefill: true,
          to: 'seller',
          instruction: 'Send GCJ text — creates group chat with Kayla/Jaxon + client',
          templateKey: 'GCJ',
        },
        {
          step: 7,
          action: 'set_reminder',
          type: '48hr_followup',
          instruction: '48-HOUR TIMER STARTS NOW. If no response by then, run realignment script.',
        },
      ],
      reminders: [
        { type: '48hr_followup', offset_hours: 48, description: '48hr timer — follow up if no response' },
      ],
    },
    automations: [
      { type: 'run_comps' },
      { type: 'run_underwriting' },
      { type: 'set_field', field: 'offer_sent_date', value: 'now' },
      { type: 'set_field', field: 'follow_up_48hr_due', value: 'now+48h' },
      { type: 'set_reminder', reminder_type: '48hr_followup', offset_hours: 48 },
      { type: 'notify' },
      { type: 'log', message: 'Offer sent. Comps run. LOI prepared. Kayla + Seth emailed. 48hr timer started.' },
    ],
  },

  // ============================================
  // STAGE 4→5: OFFER_SENT → OFFER_RECEIVED
  // Owner: Kayla
  // ============================================
  'OFFER_SENT→OFFER_RECEIVED': {
    name: 'Offer Received — Awaiting Response',
    owner: 'Kayla',
    description: 'Seller has received the offer. Three possible paths: counter, accepted, declined.',
    prompt: {
      title: 'Stage 4→5: Offer Received',
      description: 'Seller confirmed receipt of offer. Monitor for response. Three paths ahead.',
      steps: [
        {
          step: 1,
          action: 'notify',
          role: 'closer',
          instruction: 'NOTIFY KAYLA: "Offer received on [address]. Awaiting seller response."',
          contacts: ['homewithkaylamauser@gmail.com'],
        },
        {
          step: 2,
          action: 'evaluate',
          instruction: 'THREE PATHS based on seller response:\n→ Counter-offer → Stage 9 (Active Negotiation)\n→ Accepted → Stage 10 (Terms Agreed)\n→ Declined → Stage 8 (Seller Declined)',
          fields: ['seller_counter'],
        },
        {
          step: 3,
          action: 'take_notes',
          instruction: 'Record seller\'s initial reaction, any verbal feedback, concerns raised.',
          fields: ['notes'],
        },
      ],
      reminders: [
        { type: '48hr_followup', offset_hours: 48, description: '48hr timer continues — escalate if no response' },
      ],
    },
    automations: [
      { type: 'notify' },
      { type: 'log', message: 'Offer received. Kayla notified. Monitoring for response.' },
    ],
  },

  // ============================================
  // STAGE 5→6: OFFER_RECEIVED → GAIN_FEEDBACK
  // Owner: Kayla
  // ============================================
  'OFFER_RECEIVED→GAIN_FEEDBACK': {
    name: 'Gain Feedback — Realignment Call',
    owner: 'Kayla',
    description: '48hr realignment call. Get seller feedback on the offer.',
    prompt: {
      title: 'Stage 5→6: Gain Feedback — Realign',
      description: 'Call the seller. Get their feedback on the offer. Handle objections. Use realignment language.',
      steps: [
        {
          step: 1,
          action: 'call',
          instruction: 'REALIGNMENT CALL: Call seller. Use the post-offer 48hr script.',
          script: 'Happy [Day] [Client Name] I am just now finding some time to realign with you, we spoke [Day you spoke] regarding the property at [property address]. We had sent an offer over to you. Is there any clarification I can align further regarding the details of our offer?',
        },
        {
          step: 2,
          action: 'handle_objections',
          instruction: 'LET THEM TALK. "Noted — I\'ll relay to my business partner." → TEXT JAXON/KAYLA immediately.',
          objectionScripts: {
            wants_cash: 'That\'s exactly why I\'m calling — with the property still being listed for sale — your seller hasn\'t received sufficient offers from buyers who intend to live in the property; our lender has confirmed this will not be able to be a rental for anyone due to institutional interest rates — feel free to revisit this offer right before the listing agreement expires.',
            ask_viewing: 'Our assistant drove past the property a few days back and referred it to us. The photos online look great. I\'m sure they don\'t even do the property justice! We will set up a home inspection like any real estate transaction – within 24 hours.',
            general_questions: 'Noted - what I\'ll do is relay this over to my business partner and will get back with you. I look forward to aligning the finer details with you.',
          },
        },
        {
          step: 3,
          action: 'send_text',
          template: 'LOI',
          prefill: true,
          to: 'agent',
          instruction: 'Send LOI follow-up text if dealing with agent',
          templateKey: 'LOI',
        },
        {
          step: 4,
          action: 'send_text',
          template: 'EVERYBODY_WINS_PITCH',
          prefill: true,
          to: 'seller',
          instruction: 'If seller is hesitating, send the "Everybody Wins" pitch',
          templateKey: 'EVERYBODY_WINS_PITCH',
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'set_field', field: 'follow_up_48hr_done', value: true },
      { type: 'log', message: 'Feedback gained. Realignment call completed. LOI template ready.' },
    ],
  },

  // ============================================
  // STAGE 6→7: GAIN_FEEDBACK → NO_ANSWER
  // Owner: Kayla
  // ============================================
  'GAIN_FEEDBACK→NO_ANSWER': {
    name: 'No Answer — Escalation',
    owner: 'Kayla',
    description: 'Seller not responding after feedback attempt. Escalate with voice memo + LOI2DAYS + SD text.',
    prompt: {
      title: 'Stage 6→7: No Answer — Escalate',
      description: 'Seller has gone silent. Send voice memo, LOI2DAYS text, SD text. Track DOM.',
      steps: [
        {
          step: 1,
          action: 'call',
          instruction: 'VOICE MEMO: Leave voice memo if no answer.',
          script: 'Happy [day] [name], tried to call regarding [address]. I\'m going to call my DSCR lender. Going to loop you into a group chat with my business partner Jaxon. Have a blessed evening.',
        },
        {
          step: 2,
          action: 'send_text',
          template: 'LOI2DAYS',
          prefill: true,
          to: 'agent',
          instruction: 'Day 2: Send LOI2DAYS text — gentle nudge',
          templateKey: 'LOI2DAYS',
        },
        {
          step: 3,
          action: 'send_text',
          template: 'SD',
          prefill: true,
          to: 'agent_or_seller',
          instruction: 'Day 4: Send SD text — keeps door open',
          templateKey: 'SD',
        },
        {
          step: 4,
          action: 'calendar',
          instruction: 'Note Days on Market (DOM). Set DOM-181 calendar reminder for listing expiry.',
          fields: ['dom', 'dom_181_reminder_date'],
          detail: 'DOM - 181 = date to circle back. Import into calendar.',
        },
      ],
      reminders: [
        { type: 'dom_181', description: 'Circle back when listing expires (DOM - 181 days)' },
      ],
    },
    automations: [
      { type: 'set_reminder', reminder_type: 'dom_181' },
      { type: 'log', message: 'No answer. Voice memo + LOI2DAYS + SD templates ready. DOM tracked.' },
    ],
  },

  // ============================================
  // STAGE 7→8: NO_ANSWER → SELLER_DECLINED
  // OR *→8: Any stage → SELLER_DECLINED
  // Owner: Kayla
  // ============================================
  'NO_ANSWER→SELLER_DECLINED': {
    name: 'Seller Declined — Nurture Chain',
    owner: 'Kayla',
    description: 'Seller declined the offer. Start 30/60/90/181 day nurture chain.',
    prompt: {
      title: 'Stage 7→8: Seller Declined — Start Nurture',
      description: 'Send SD text. Set 30/60/90/181 day nurture reminders. Keep door open.',
      steps: [
        {
          step: 1,
          action: 'send_text',
          template: 'SD',
          prefill: true,
          to: 'agent_or_seller',
          instruction: 'Send seller declined text — keeps door open for future',
          templateKey: 'SD',
        },
        {
          step: 2,
          action: 'set_reminder',
          type: '30_day_nurture',
          instruction: '30 DAYS: Task "Circle back to [name]. Sold yet?"',
        },
        {
          step: 3,
          action: 'set_reminder',
          type: '60_day_nurture',
          instruction: '60 DAYS: Task "Still interested? Send PEND text."',
        },
        {
          step: 4,
          action: 'set_reminder',
          type: '90_day_nurture',
          instruction: '90 DAYS: Task "Offer still valid. Any reconsideration?"',
        },
        {
          step: 5,
          action: 'set_reminder',
          type: '181_day_nurture',
          instruction: '181 DAYS: Task "LISTING EXPIRING. Call NOW."',
        },
        {
          step: 6,
          action: 'record_reason',
          instruction: 'Record why the deal died in CRM notes for future reference.',
          fields: ['dead_reason'],
        },
        {
          step: 7,
          action: 'ask_referral',
          instruction: 'Ask: "Other properties to offload?" — double/triple dip.',
        },
      ],
      reminders: [
        { type: '30_day_nurture', offset_days: 30, description: '30-day nurture: Circle back' },
        { type: '60_day_nurture', offset_days: 60, description: '60-day nurture: Send PEND' },
        { type: '90_day_nurture', offset_days: 90, description: '90-day nurture: Reconsider?' },
        { type: '181_day_nurture', offset_days: 181, description: '181-day: Listing expiring — call NOW' },
      ],
    },
    automations: [
      { type: 'set_field', field: 'nurture_stage', value: '30_day' },
      { type: 'set_reminder', reminder_type: '30_day_nurture', offset_days: 30 },
      { type: 'set_reminder', reminder_type: '60_day_nurture', offset_days: 60 },
      { type: 'set_reminder', reminder_type: '90_day_nurture', offset_days: 90 },
      { type: 'set_reminder', reminder_type: '181_day_nurture', offset_days: 181 },
      { type: 'log', message: 'Seller declined. SD template ready. 30/60/90/181 nurture chain started.' },
    ],
  },

  // ============================================
  // STAGE 8→9: SELLER_DECLINED → ACTIVE_NEGOTIATION
  // Owner: Kayla
  // ============================================
  'SELLER_DECLINED→ACTIVE_NEGOTIATION': {
    name: 'Re-engage — Active Negotiation',
    owner: 'Kayla',
    description: 'Seller came back! Re-run comps + offer calc. Handle counter.',
    prompt: {
      title: 'Stage 8→9: Re-engage — Active Negotiation',
      description: 'Seller is back at the table. Re-run comps with any new numbers. Handle counter-offer.',
      steps: [
        {
          step: 1,
          action: 'run_underwriting',
          instruction: 'RE-RUN COMPS + OFFER CALC: Pull fresh comps. Re-run all 5 strategies with any new numbers.',
          detail: 'If seller countered, use seller_counter as new asking price. Re-run cash-offer-underwriter.runAllStrategies().',
        },
        {
          step: 2,
          action: 'evaluate',
          instruction: 'MID-TERM PIVOT CHECK: If long-term rent < 1% rule, run mid-term-pivot.js for Furnished Finder estimate.',
          detail: 'Mid-term rents typically 30-50% higher than long-term. Can salvage deals that fail 1% rule.',
        },
        {
          step: 3,
          action: 'handle_objections',
          instruction: 'RELAY ONLY. Never negotiate directly. "I\'ll relay that to my business partner and get right back with you."',
          objectionScripts: {
            price_too_high: 'Pivot to seller financing: "Would you be open to a structure where you get your number but over time instead of all at once?"',
            wants_list: 'Novation pitch: "We can offer a higher price with a 60-90 day close — you list it, we buy it if it doesn\'t sell retail."',
            zero_down_ask: '$0 pitch: "No money down, we take over your existing mortgage payments, you walk away clean."',
          },
        },
        {
          step: 4,
          action: 'notify',
          role: 'closer',
          instruction: 'Notify Kayla + Jaxon: "Counter received on [address]. New numbers in CRM."',
          contacts: ['homewithkaylamauser@gmail.com'],
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'run_comps' },
      { type: 'run_underwriting' },
      { type: 'notify' },
      { type: 'log', message: 'Active negotiation. Comps re-run. Counter handled. Kayla+Jaxon emailed.' },
    ],
  },

  // ============================================
  // STAGE 9→10: ACTIVE_NEGOTIATION → TERMS_AGREED
  // Owner: Kayla
  // ============================================
  'ACTIVE_NEGOTIATION→TERMS_AGREED': {
    name: 'Terms Agreed — Draft Contract',
    owner: 'Kayla',
    description: 'Terms agreed! Draft contract, set Contract Type field.',
    prompt: {
      title: 'Stage 9→10: Terms Agreed — Draft Contract',
      description: 'Both parties aligned on terms. Draft the contract. Set Contract Type.',
      steps: [
        {
          step: 1,
          action: 'evaluate',
          instruction: 'SET CONTRACT TYPE based on agreed strategy:\n- Cash → Cash Offer Template\n- SubTo → PSA Creative SubTo + Subject To Addendum\n- Stack → Stack PSA\n- Commercial → Real Estate Commercial PSA\n- JV → 4-party JV or 3-party JV',
          fields: ['contract_type', 'contract'],
        },
        {
          step: 2,
          action: 'send_offer',
          instruction: 'DRAFT CONTRACT: Generate document from template. Fill all merge fields (address, APN, purchase price, EMD, COE, inspection, title company, LLC, parties, percentages).',
          detail: 'Contract templates: PSA Creative SubTo, PSA DC, PSA Commercial, Stack PSA, Subject To Addendum, 3-party JV, 4-party JV.',
        },
        {
          step: 3,
          action: 'notify',
          role: 'closer',
          instruction: 'Notify Kayla: "Contract draft ready for [address] — [Contract Type] — review and authorize."',
          contacts: ['homewithkaylamauser@gmail.com'],
        },
        {
          step: 4,
          action: 'take_notes',
          instruction: 'Confirm close timeline with seller. Stay warm every 3-5 days.',
          fields: ['notes'],
        },
      ],
      reminders: [
        { type: '72hr_title', offset_hours: 72, description: '72hr timer — if no title info, alert' },
      ],
    },
    automations: [
      { type: 'set_reminder', reminder_type: '72hr_title', offset_hours: 72 },
      { type: 'notify' },
      { type: 'rabbitsign_envelope', contract_type: 'psa_creative_subto' },
      { type: 'log', message: 'Terms agreed. Contract drafted. RabbitSign envelope auto-created. Kayla emailed.' },
    ],
  },

  // ============================================
  // STAGE 10→11: TERMS_AGREED → AWAITING_TITLE
  // Owner: Contracts
  // ============================================
  'TERMS_AGREED→AWAITING_TITLE': {
    name: 'Awaiting Title Info',
    owner: 'Contracts',
    description: 'Request mortgage statement, set Loan Balance, APN. 72hr timer.',
    prompt: {
      title: 'Stage 10→11: Awaiting Seller Title Info',
      description: 'Request mortgage statement from seller. Set exact Loan Balance. Get APN from BackLeads. 72hr timer starts.',
      steps: [
        {
          step: 1,
          action: 'send_text',
          template: 'CCC',
          prefill: true,
          to: 'seller',
          instruction: 'REQUEST MORTGAGE STATEMENT: "Please send your most recent mortgage statement to [email]"',
          templateKey: 'CCC',
        },
        {
          step: 2,
          action: 'take_notes',
          instruction: 'SET LOAN BALANCE (EXACT, not approximate) from mortgage statement.',
          fields: ['existing_loan_balance', 'loan_number', 'lender_servicer', 'monthly_pi'],
        },
        {
          step: 3,
          action: 'take_notes',
          instruction: 'SET PROPERTY APN from BackLeads chat or county records.',
          fields: ['apn'],
        },
        {
          step: 4,
          action: 'set_reminder',
          type: '72hr_title',
          instruction: '72-HOUR TIMER: If no Loan Balance + APN within 72hrs, alert "Contract unsigned — follow up."',
        },
        {
          step: 5,
          action: 'run_underwriting',
          instruction: 'RUN CLOSING COST ALLOCATOR with exact loan balance for refreshed cost breakdown.',
          detail: 'closing-cost-allocator.js: transfer tax 50/50, title policy buyer pays, EMD $100 min, inspection 14 days, COE 30 days.',
        },
      ],
      reminders: [
        { type: '72hr_title', offset_hours: 72, description: '72hr timer — alert if no title info received' },
      ],
    },
    automations: [
      { type: 'set_reminder', reminder_type: '72hr_title', offset_hours: 72 },
      { type: 'log', message: 'Awaiting title info. 72hr timer started.' },
    ],
  },

  // ============================================
  // STAGE 11→12: AWAITING_TITLE → CONTRACT_OUT
  // Owner: Contracts
  // ============================================
  'AWAITING_TITLE→CONTRACT_OUT': {
    name: 'Contract Out — RabbitSign + PSA',
    owner: 'Contracts',
    description: 'Route to template, RabbitSign envelope, PSA + Addendum, CONTRACT_OUT SMS, TC handshake.',
    prompt: {
      title: 'Stage 11→12: Contract Out — Sign & Send',
      description: 'Generate RabbitSign envelope. Send PSA + Addendum. Set key dates. Send CONTRACT_OUT SMS. TC handshake.',
      steps: [
        {
          step: 1,
          action: 'send_text',
          template: 'PSA_CALL_OPENER_SMS',
          prefill: true,
          to: 'seller',
          instruction: 'Pre-call text for PSA signing — sets expectations for 10-15 min call',
          templateKey: 'PSA_CALL_OPENER_SMS',
        },
        {
          step: 2,
          action: 'call_and_sign',
          instruction: 'Call seller. Walk through PSA. Use RabbitSign for e-signature. Need: property address, LLC name (if applicable), email.',
          detail: 'RabbitSign envelope: PSA + (Subject To Addendum if SubTo) + (JV doc if applicable). Send to seller first, then buyer.',
        },
        {
          step: 3,
          action: 'send_text',
          template: 'CONTRACT_OUT',
          prefill: true,
          to: 'seller',
          instruction: 'Send after PSA is fully signed — confirms timeline',
          templateKey: 'CONTRACT_OUT',
        },
        {
          step: 4,
          action: 'set_dates',
          instruction: 'Record key dates in CRM',
          fields: ['psa_signed_date', 'coe_date', 'inspection_end_date', 'inspection_period_days', 'emd_amount', 'has_subto_addendum', 'title_company'],
          defaults: {
            psa_signed_date: 'today',
            inspection_period_days: 14,
            inspection_end_date: 'today + 14 days',
            coe_date: 'today + 30 days',
            emd_amount: 100,
            title_company: 'CLOSE Title',
          },
        },
        {
          step: 5,
          action: 'notify_tc',
          instruction: 'TC HANDSHAKE: Email BGonzalez@sellsmartre.com + monique@sellsmartre.com with full deal package.',
          detail: 'TC Handshake Package: Property address, seller/agent info, timeline, attachments (contract PDF, JV draft, inspection report).',
        },
        {
          step: 6,
          action: 'run_underwriting',
          instruction: 'RUN CLOSING COST ALLOCATOR for full breakdown. Set 3rd-party processor for SubTo (48hrs before COE).',
          detail: 'Wrap-Around Financing disclosure required in SubTo Addendum. Closing cost split: 50/50 transfer tax by seller, standard title policy by buyer.',
        },
      ],
      reminders: [
        { type: 'inspection', offset_days: 7, description: 'Inspection reminder — 7 days before end' },
        { type: 'coe', offset_days: 23, description: 'COE reminder — 7 days before closing' },
      ],
    },
    automations: [
      { type: 'set_field', field: 'contract_date', value: 'now' },
      { type: 'set_field', field: 'psa_signed_date', value: 'now' },
      { type: 'set_field', field: 'coe_date', value: 'now+30d' },
      { type: 'set_field', field: 'inspection_end_date', value: 'now+14d' },
      { type: 'set_field', field: 'inspection_period_days', value: 14 },
      { type: 'set_field', field: 'emd_amount', value: 100 },
      { type: 'set_reminder', reminder_type: 'inspection', offset_days: 7 },
      { type: 'set_reminder', reminder_type: 'coe', offset_days: 23 },
      { type: 'notify' },
      { type: 'log', message: 'Contract out. PSA signed. RabbitSign envelope sent. TC handshake emailed. CONTRACT_OUT template ready.' },
    ],
  },

  // ============================================
  // STAGE 12→13: CONTRACT_OUT → UNDER_CONTRACT
  // Owner: TC
  // ============================================
  'CONTRACT_OUT→UNDER_CONTRACT': {
    name: 'Under Contract — TC Handoff',
    owner: 'TC',
    description: 'TC handoff email, 14-day inspection countdown, INSPECTION_SCHEDULED SMS.',
    prompt: {
      title: 'Stage 12→13: Under Contract — TC Takes Over',
      description: 'Send TC handoff email. 14-day inspection countdown starts. Day 7: send INSPECTION_SCHEDULED SMS.',
      steps: [
        {
          step: 1,
          action: 'notify_tc',
          instruction: 'TC HANDOFF EMAIL: Send to BGonzalez@sellsmartre.com + monique@sellsmartre.com.',
          detail: 'Include: Property address, seller/agent info, purchase price, EMD, inspection dates, COE date, title company, attachments.',
        },
        {
          step: 2,
          action: 'set_reminder',
          type: 'inspection',
          instruction: '14-DAY INSPECTION COUNTDOWN STARTS. Day 7: send INSPECTION_SCHEDULED SMS to seller.',
        },
        {
          step: 3,
          action: 'send_text',
          template: 'INSPECTION_SCHEDULED',
          prefill: true,
          to: 'seller',
          instruction: 'Day 7: Send INSPECTION_SCHEDULED SMS — confirms inspection date + requirements',
          templateKey: 'INSPECTION_SCHEDULED',
        },
        {
          step: 4,
          action: 'take_notes',
          instruction: 'TC CHECKLIST: [ ] Inspection scheduled, [ ] Appraisal ordered, [ ] Title search initiated, [ ] EMD confirmed, [ ] Consulting/JV agreement signed.',
          fields: ['inspection_scheduled_date'],
        },
      ],
      reminders: [
        { type: 'inspection', offset_days: 7, description: 'Day 7: Send INSPECTION_SCHEDULED SMS' },
        { type: 'inspection', offset_days: 14, description: 'Day 14: Alert Kayla — inspection ending' },
      ],
    },
    automations: [
      { type: 'set_reminder', reminder_type: 'inspection', offset_days: 7 },
      { type: 'set_reminder', reminder_type: 'inspection', offset_days: 14 },
      { type: 'notify' },
      { type: 'log', message: 'Under contract. TC handoff emailed. INSPECTION_SCHEDULED template ready. 14-day countdown started.' },
    ],
  },

  // ============================================
  // STAGE 13→14: UNDER_CONTRACT → INSPECTION_PERIOD
  // Owner: TC
  // ============================================
  'UNDER_CONTRACT→INSPECTION_PERIOD': {
    name: 'Inspection Period — Daily Track',
    owner: 'TC',
    description: 'Daily status tracking. Day 14 alert Kayla.',
    prompt: {
      title: 'Stage 13→14: Inspection Period',
      description: 'Inspection is underway. Track daily. Day 14: alert Kayla if not complete.',
      steps: [
        {
          step: 1,
          action: 'take_notes',
          instruction: 'DAILY STATUS TRACK: Monitor inspection progress. Confirm utilities on, lockbox/access arranged.',
          fields: ['notes'],
        },
        {
          step: 2,
          action: 'set_reminder',
          type: 'inspection',
          instruction: 'DAY 14 ALERT: If inspection not complete by day 14, alert Kayla "Inspection ending — proceed or terminate?"',
        },
        {
          step: 3,
          action: 'evaluate',
          instruction: 'IF TERMINATED: Move back to Stage 8 (Seller Declined).',
        },
      ],
      reminders: [
        { type: 'inspection', offset_days: 14, description: 'Day 14: Alert Kayla — inspection ending' },
      ],
    },
    automations: [
      { type: 'set_reminder', reminder_type: 'inspection', offset_days: 14 },
      { type: 'log', message: 'Inspection period. Daily tracking active.' },
    ],
  },

  // ============================================
  // STAGE 14→15: INSPECTION_PERIOD → INSPECTION_COMPLETE
  // Owner: TC
  // ============================================
  'INSPECTION_PERIOD→INSPECTION_COMPLETE': {
    name: 'Inspection Complete — Auto-Advance',
    owner: 'TC',
    description: 'Inspection done. Auto-advance to Appraisal.',
    prompt: {
      title: 'Stage 14→15: Inspection Complete',
      description: 'Inspection is complete. Auto-advancing to Appraisal Ordered.',
      steps: [
        {
          step: 1,
          action: 'log',
          instruction: 'Inspection complete. Moving to Appraisal Ordered.',
        },
        {
          step: 2,
          action: 'take_notes',
          instruction: 'Record inspection results, any issues found, repairs requested.',
          fields: ['notes'],
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'log', message: 'Inspection complete. Auto-advancing to Appraisal.' },
    ],
  },

  // ============================================
  // STAGE 15→16: INSPECTION_COMPLETE → APPRAISAL_ORDERED
  // Owner: TC
  // ============================================
  'INSPECTION_COMPLETE→APPRAISAL_ORDERED': {
    name: 'Appraisal Ordered',
    owner: 'TC',
    description: 'Coordinate TC for appraiser access.',
    prompt: {
      title: 'Stage 15→16: Appraisal Ordered',
      description: 'Appraisal has been ordered. Coordinate with TC for appraiser access.',
      steps: [
        {
          step: 1,
          action: 'notify_tc',
          instruction: 'COORDINATE TC: Ensure appraiser has access to property. Confirm appointment with seller.',
        },
        {
          step: 2,
          action: 'take_notes',
          instruction: 'Track appraisal status. Record appraiser name, company, scheduled date.',
          fields: ['notes'],
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'log', message: 'Appraisal ordered. Coordinating TC for access.' },
    ],
  },

  // ============================================
  // STAGE 16→17: APPRAISAL_ORDERED → APPRAISAL_DONE
  // Owner: TC
  // ============================================
  'APPRAISAL_ORDERED→APPRAISAL_DONE': {
    name: 'Appraisal Done — Re-run Calc',
    owner: 'TC',
    description: 'Re-run offer calc with appraisal value. APPRAISAL_DONE SMS. Renegotiate if low.',
    prompt: {
      title: 'Stage 16→17: Appraisal Done',
      description: 'Appraisal result is in. Re-run calc with appraisal value. Send APPRAISAL_DONE SMS.',
      steps: [
        {
          step: 1,
          action: 'run_underwriting',
          instruction: 'RE-RUN OFFER CALC with appraisal value (replaces askingPrice). Compare new DSCR/cash flow to pre-appraisal.',
          fields: ['appraisal_value'],
        },
        {
          step: 2,
          action: 'evaluate',
          instruction: 'IF APPRAISAL < PURCHASE PRICE: Alert Kayla "Appraisal low — renegotiate?" Set renegotiate flag.',
          detail: 'If appraisal ≥ PP: move forward. If appraisal < PP: alert Kayla, set seller_counter to appraisal value, consider renegotiation.',
        },
        {
          step: 3,
          action: 'send_text',
          template: 'APPRAISAL_DONE',
          prefill: true,
          to: 'seller',
          instruction: 'Send APPRAISAL_DONE SMS — confirms appraisal result + next steps',
          templateKey: 'APPRAISAL_DONE',
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'run_underwriting' },
      { type: 'notify', role: 'closer', message: 'Appraisal done. Review results.' },
      { type: 'log', message: 'Appraisal done. Calc re-run. APPRAISAL_DONE SMS sent.' },
    ],
  },

  // ============================================
  // STAGE 17→18: APPRAISAL_DONE → JV_SENT
  // Owner: JV
  // ============================================
  'APPRAISAL_DONE→JV_SENT': {
    name: 'JV Sent — RabbitSign Envelope',
    owner: 'JV',
    description: 'Determine 3-party or 4-party, pre-fill parties/percentages, RabbitSign envelope.',
    prompt: {
      title: 'Stage 17→18: JV Sent',
      description: 'Determine JV type. Pre-fill parties and percentages. Send RabbitSign envelope.',
      steps: [
        {
          step: 1,
          action: 'evaluate',
          instruction: 'DETERMINE JV TYPE: 3-party or 4-party? Set jv_type field.',
          fields: ['jv_type'],
          detail: '3-party: Buyer, Seller, Closer.\n4-party: Buyer, Seller, Closer, Capital Partner (25% default each).',
        },
        {
          step: 2,
          action: 'send_offer',
          instruction: 'PRE-FILL PARTIES + PERCENTAGES: Default 25% each for 4-party. 51% majority, 66% super-majority.',
          fields: ['jv_parties', 'jv_percentages'],
        },
        {
          step: 3,
          action: 'call_and_sign',
          instruction: 'GENERATE RABBITSIGN ENVELOPE: JV agreement. Send to all parties.',
          detail: 'JV template: 3-party JV or 4-party JV. Include: party names, percentages, voting rules, initial reserve $5K, 25% non-payment interest, dispute mediation.',
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'log', message: 'JV sent. RabbitSign envelope generated.' },
    ],
  },

  // ============================================
  // STAGE 18→19: JV_SENT → JV_SIGNED
  // Owner: JV
  // ============================================
  'JV_SENT→JV_SIGNED': {
    name: 'JV Signed — Set Title Holder',
    owner: 'JV',
    description: 'JV_SIGNED SMS, set Title Holder, move to Wire.',
    prompt: {
      title: 'Stage 18→19: JV Signed',
      description: 'All parties signed the JV. Send JV_SIGNED SMS. Set Title Holder.',
      steps: [
        {
          step: 1,
          action: 'send_text',
          template: 'JV_SIGNED',
          prefill: true,
          to: 'jv_party',
          instruction: 'Send JV_SIGNED SMS to all parties — confirms ownership share + terms',
          templateKey: 'JV_SIGNED',
        },
        {
          step: 2,
          action: 'take_notes',
          instruction: 'SET TITLE HOLDER: Entity name that holds title to the property.',
          fields: ['title_holder', 'llc_name'],
        },
        {
          step: 3,
          action: 'log',
          instruction: 'JV fully executed. Moving to Wire Setup.',
        },
      ],
      reminders: [],
    },
    automations: [
      { type: 'set_field', field: 'title_holder', value: 'from_llc_name' },
      { type: 'log', message: 'JV signed. Title holder set. Moving to Wire.' },
    ],
  },

  // ============================================
  // STAGE 19→20: JV_SIGNED → WIRE_SETUP
  // Owner: Closing
  // ============================================
  'JV_SIGNED→WIRE_SETUP': {
    name: 'Wire Setup — Confirm Instructions',
    owner: 'Closing',
    description: 'Confirm wire instructions, confirm SubTo processor, move to closing.',
    prompt: {
      title: 'Stage 19→20: Wire Setup',
      description: 'Confirm wire instructions from title company. Confirm SubTo processor if applicable.',
      steps: [
        {
          step: 1,
          action: 'evaluate',
          instruction: 'CONFIRM WIRE INSTRUCTIONS: Request from CLOSE Title (order@closedtitle.com, 1-800-405-7150) or Eastern Title.',
          fields: ['wire_confirmed'],
        },
        {
          step: 2,
          action: 'evaluate',
          instruction: 'IF SUBTO: Confirm 3rd-party processing company set up within 48hrs of COE.',
          fields: ['subto_processor_confirmed'],
          condition: 'is_subto',
        },
        {
          step: 3,
          action: 'send_text',
          template: 'SUBTO_PROCESSOR_CONFIRMED',
          prefill: true,
          to: 'seller',
          instruction: 'Send SUBTO_PROCESSOR_CONFIRMED SMS within 48hrs of COE for SubTo deals',
          templateKey: 'SUBTO_PROCESSOR_CONFIRMED',
          condition: 'is_subto',
        },
        {
          step: 4,
          action: 'set_reminder',
          type: 'closing',
          instruction: 'COE Date - 7 days: Set reminder for CLOSING_CONFIRMED SMS.',
        },
      ],
      reminders: [
        { type: 'closing', offset_days: 7, description: '7 days before COE: Send CLOSING_CONFIRMED SMS' },
      ],
    },
    automations: [
      { type: 'set_reminder', reminder_type: 'closing', offset_days: 7 },
      { type: 'log', message: 'Wire setup. Instructions confirmed. Moving to closing.' },
    ],
  },

  // ============================================
  // STAGE 20→21: WIRE_SETUP → CLOSING_DATE
  // Owner: Closing
  // ============================================
  'WIRE_SETUP→CLOSING_DATE': {
    name: 'Closing Date — Final Steps',
    owner: 'Closing',
    description: 'CLOSING_CONFIRMED SMS 7 days before, final wire, post-close engine.',
    prompt: {
      title: 'Stage 20→21: Closing Date — Final Steps',
      description: 'Deal is closing! Send CLOSING_CONFIRMED SMS. Final wire. Post-close engine.',
      steps: [
        {
          step: 1,
          action: 'send_text',
          template: 'CLOSING_CONFIRMED',
          prefill: true,
          to: 'seller',
          instruction: 'Send 7 days before COE — confirms closing details and post-close support',
          templateKey: 'CLOSING_CONFIRMED',
        },
        {
          step: 2,
          action: 'evaluate',
          instruction: 'FINAL WIRE: Confirm wire instructions. Verify all documents signed.',
          fields: ['wire_confirmed'],
        },
        {
          step: 3,
          action: 'ask_referral',
          instruction: 'WE PLAY POKÉMON: Always ask "Do you have any other properties you\'re looking to offload?" — double/triple/quadruple dip.',
        },
        {
          step: 4,
          action: 'set_reminder',
          type: 'testimonial',
          instruction: '+7 DAYS: Testimonial request — send review link.',
        },
        {
          step: 5,
          action: 'set_reminder',
          type: 'referral',
          instruction: '+14 DAYS: Referral request — $500 check for any referral that closes.',
        },
        {
          step: 6,
          action: 'archive',
          instruction: 'POST-CLOSE ENGINE: Move to closed. All documents saved. +7d testimonial, +14d referral, +30d check-in.',
        },
      ],
      reminders: [
        { type: 'testimonial', offset_days: 7, description: '+7d: Request testimonial' },
        { type: 'referral', offset_days: 14, description: '+14d: Request referral ($500 bounty)' },
      ],
    },
    automations: [
      { type: 'set_field', field: 'closed_date', value: 'now' },
      { type: 'set_reminder', reminder_type: 'testimonial', offset_days: 7 },
      { type: 'set_reminder', reminder_type: 'referral', offset_days: 14 },
      { type: 'log', message: 'Closed. CLOSING_CONFIRMED sent. Post-close engine activated.' },
    ],
  },

  // ============================================
  // * → DEAD ("Marked Dead")
  // ============================================
  '*→DEAD': {
    name: 'Deal Dead — Circle Back Later',
    owner: 'Montelli',
    description: 'Deal is dead. Send seller declined text. Set calendar reminder for listing expiry.',
    prompt: {
      title: 'Deal Dead — Circle Back Later',
      description: 'Send the seller declined text. Note DOM, subtract 181 days, set calendar reminder to call when listing expires.',
      steps: [
        {
          step: 1,
          action: 'send_text',
          template: 'SD',
          prefill: true,
          to: 'seller',
          instruction: 'Send seller declined text — keeps door open for future',
          templateKey: 'SD',
        },
        {
          step: 2,
          action: 'calendar',
          instruction: 'Note Days on Market (DOM). Subtract 181 days. Set calendar reminder to call when listing expires.',
          detail: 'DOM - 181 = date to circle back. Import into calendar. Call when listing agreement expires.',
        },
        {
          step: 3,
          action: 'record_reason',
          instruction: 'Record why the deal died in CRM notes for future reference.',
          fields: ['dead_reason'],
        },
      ],
      reminders: [
        { type: 'dom_181', description: 'Circle back when listing expires (DOM - 181 days)' },
      ],
    },
    automations: [
      { type: 'set_reminder', reminder_type: 'dom_181' },
      { type: 'log', message: 'Deal marked dead. DOM-181 reminder set.' },
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
            else if (value === 'from_llc_name') { value = leadData.llc_name || 'Divinity Aligned LLC'; }
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
          case 'run_midterm': {
            const mtResult = evaluateMidTerm(leadData);
            if (mtResult.pivot) {
              const pitch = generateMidTermPitch(leadData, mtResult);
              results.push({ type: 'run_midterm', ok: true, data: { pivot: true, ...mtResult, pitch } });
            } else {
              results.push({ type: 'run_midterm', ok: true, data: { pivot: false, ...mtResult } });
            }
            break;
          }
          case 'allocate_closing': {
            const allocResult = allocateClosingCosts(leadData);
            await saveAllocationToLead(leadId, userId, allocResult);
            results.push({ type: 'allocate_closing', ok: true, data: allocResult });
            break;
          }
          case 'register_postclose': {
            const pcResult = await registerPostClose(leadId, userId, leadData);
            results.push({ type: 'register_postclose', ok: true, data: pcResult });
            break;
          }
          case 'create_dispo': {
            const dispoResult = await createDispoRecord(leadId, userId, leadData);
            results.push({ type: 'create_dispo', ok: true, data: dispoResult });
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
// TRANSITION MAP — 21 stages
// =============================================================

function getAvailableTransitions(currentStage) {
  const fwd = {
    LEAD_ENTERED: ['CONTACT_MADE', 'DEAD'],
    CONTACT_MADE: ['OFFER_READY', 'DEAD'],
    OFFER_READY: ['OFFER_SENT', 'DEAD'],
    OFFER_SENT: ['OFFER_RECEIVED', 'DEAD'],
    OFFER_RECEIVED: ['GAIN_FEEDBACK', 'ACTIVE_NEGOTIATION', 'SELLER_DECLINED', 'TERMS_AGREED', 'DEAD'],
    GAIN_FEEDBACK: ['NO_ANSWER', 'ACTIVE_NEGOTIATION', 'SELLER_DECLINED', 'DEAD'],
    NO_ANSWER: ['SELLER_DECLINED', 'GAIN_FEEDBACK', 'DEAD'],
    SELLER_DECLINED: ['ACTIVE_NEGOTIATION', 'GAIN_FEEDBACK', 'DEAD'],
    ACTIVE_NEGOTIATION: ['TERMS_AGREED', 'SELLER_DECLINED', 'DEAD'],
    TERMS_AGREED: ['AWAITING_TITLE', 'DEAD'],
    AWAITING_TITLE: ['CONTRACT_OUT', 'DEAD'],
    CONTRACT_OUT: ['UNDER_CONTRACT', 'DEAD'],
    UNDER_CONTRACT: ['INSPECTION_PERIOD', 'DEAD'],
    INSPECTION_PERIOD: ['INSPECTION_COMPLETE', 'SELLER_DECLINED', 'DEAD'],
    INSPECTION_COMPLETE: ['APPRAISAL_ORDERED', 'DEAD'],
    APPRAISAL_ORDERED: ['APPRAISAL_DONE', 'DEAD'],
    APPRAISAL_DONE: ['JV_SENT', 'WIRE_SETUP', 'ACTIVE_NEGOTIATION', 'DEAD'],
    JV_SENT: ['JV_SIGNED', 'DEAD'],
    JV_SIGNED: ['WIRE_SETUP', 'DEAD'],
    WIRE_SETUP: ['CLOSING_DATE', 'DEAD'],
    CLOSING_DATE: ['ARCHIVED'],
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
    'OFFER_RECEIVED': 'OFFER_SENT→OFFER_RECEIVED',
    'GAIN_FEEDBACK': 'OFFER_RECEIVED→GAIN_FEEDBACK',
    'NO_ANSWER': 'GAIN_FEEDBACK→NO_ANSWER',
    'SELLER_DECLINED': 'NO_ANSWER→SELLER_DECLINED',
    'ACTIVE_NEGOTIATION': 'SELLER_DECLINED→ACTIVE_NEGOTIATION',
    'TERMS_AGREED': 'ACTIVE_NEGOTIATION→TERMS_AGREED',
    'AWAITING_TITLE': 'TERMS_AGREED→AWAITING_TITLE',
    'CONTRACT_OUT': 'AWAITING_TITLE→CONTRACT_OUT',
    'UNDER_CONTRACT': 'CONTRACT_OUT→UNDER_CONTRACT',
    'INSPECTION_PERIOD': 'UNDER_CONTRACT→INSPECTION_PERIOD',
    'INSPECTION_COMPLETE': 'INSPECTION_PERIOD→INSPECTION_COMPLETE',
    'APPRAISAL_ORDERED': 'INSPECTION_COMPLETE→APPRAISAL_ORDERED',
    'APPRAISAL_DONE': 'APPRAISAL_ORDERED→APPRAISAL_DONE',
    'JV_SENT': 'APPRAISAL_DONE→JV_SENT',
    'JV_SIGNED': 'JV_SENT→JV_SIGNED',
    'WIRE_SETUP': 'JV_SIGNED→WIRE_SETUP',
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
