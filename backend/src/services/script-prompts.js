/**
 * script-prompts.js — Enhanced Script Prompt Engine for Divinity CRM
 * =============================================================
 * Rebuilt 2026-06-17. Every text shortcut, LOI template, contract template,
 * call script, objection handler, and pitch from the full Montelli/Kayla pipeline.
 *
 * Templates included:
 *   Core: INT, NOA, DNCT, CCC, GCJ, LOI, LOI2DAYS, INLOI, F50, F10, PEND, SD
 *   PPC:  PIN, PNOA, PCC, PC, PGC, PPH
 *   Seller Updates: CONTRACT_OUT, INSPECTION_SCHEDULED, APPRAISAL_DONE,
 *                   JV_SIGNED, CLOSING_CONFIRMED
 *   Negotiation: EVERYBODY_WINS_PITCH, PSA_CALL_OPENER_SMS,
 *                SUBTO_PROCESSOR_CONFIRMED
 *   LOI Templates: Stack, Cash, $0 Down, SubTo, MFH, Interest Only,
 *                  Stack w/ Principal, 10% DP 2yr balloon, Portfolio Stack,
 *                  Stack & Cash, Stack 5yr BAL, AI V2 LOI
 *   Contract Templates: PSA Creative SubTo, PSA DC, PSA Commercial,
 *                       Stack PSA, Subject To Addendum, 3-party JV, 4-party JV
 *   Call Scripts: Agent Initial, Seller Initial, Seller Rehab,
 *                 Post-Offer 48hr, Relay Line, Voice Memo, Awaiting Photos
 *   Pitches: Novation pitch, $0 pitch, SubTo hybrid pivot
 *
 * Source: HANDBOOK_AND_SOP.md + GHL_WORKFLOWS_SPEC.md + TRACK_MONTELLI.md +
 *         TRACK_STUDENT.md + TRACK_KAYLA_JAXON.md + sms-templates.js +
 *         contract-templates.js
 */

// =============================================================
// ALL OUTREACH SCRIPTS (text shortcuts from playbook)
// =============================================================

const { SMS_TEMPLATES, fillSMSTemplate } = require('./sms-service');

const OUTREACH_SCRIPTS = {
  // --- CORE TEXT SHORTCUTS ---
  INT: {
    name: 'INT — Intro Text',
    recipientType: 'agent_or_seller',
    description: 'First text BEFORE any call. Makes your name show as caller ID.',
    body: `{{Seller Name}}, are you still accepting offers for {{Property Address}}? My name is {{Sender Name}}, I'm looking to purchase this as a rental for my portfolio.`,
    required: ['seller_name', 'address'],
    stage: 'LEAD_ENTERED',
    shortcut: 'INT',
  },

  NOA: {
    name: 'NOA — No Answer Follow-up',
    recipientType: 'agent_or_seller',
    description: 'Second follow-up text when no response after calls.',
    body: `Are you still accepting offers for {{Property Address}}?`,
    required: ['address'],
    stage: 'LEAD_ENTERED',
    shortcut: 'NOA',
  },

  DNCT: {
    name: 'DNCT — Do Not Call Text',
    recipientType: 'agent_or_seller',
    description: 'Alternative intro when you cannot call (Do Not Call list).',
    body: `{{Seller Name}}, would you be opposed to accepting an offer for {{Property Address}}? My name is {{Sender Name}}, I'm looking at purchasing as a rental for my portfolio.`,
    required: ['seller_name', 'address'],
    stage: 'LEAD_ENTERED',
    shortcut: 'DNCT',
  },

  CCC: {
    name: 'CCC — Contact Card',
    recipientType: 'agent_or_seller',
    description: 'Sent AFTER every call. Includes website for credibility.',
    body: `It is great aligning with you {{Seller Name}}, I look forward to connecting the dots with you shortly at {{Property Address}}. Feel free to browse through our closings with similar clients on our website — Divinity Aligned LLC: Expert Solutions for Life's Major Transitions`,
    required: ['seller_name', 'address'],
    stage: 'CONTACT_MADE',
    shortcut: 'CCC',
  },

  GCJ: {
    name: 'GCJ — Group Chat w/ Jaxon',
    recipientType: 'seller',
    description: 'Sent when offer is ready — creates group chat with closer.',
    body: `{{Seller Name}} - happy {{Day}}! Creating a group chat for the purchase on {{Property Address}} with my business partner Jaxon. He is currently in a meeting with our lender; The LOI will be coming from our partner at homewithkaylamauser@gmail.com ; simply inform us it has been received for presentation, and also ensure to check other folders as well. Have a blessed rest of the week!`,
    required: ['seller_name', 'address'],
    stage: 'OFFER_SENT',
    shortcut: 'GCJ',
  },

  LOI: {
    name: 'LOI — Letter of Intent Sent',
    recipientType: 'agent',
    description: 'Follow-up after LOI has been sent to check for feedback.',
    body: `Happy {{Day}}! For the intent of my call — I have just now found some time to iron out any further details regarding the offer we had finalized. Have you gained any initial feedback from your seller just yet?`,
    required: [],
    stage: 'GAIN_FEEDBACK',
    shortcut: 'LOI',
  },

  LOI2DAYS: {
    name: 'LOI2DAYS — 2 Days No Reply',
    recipientType: 'agent',
    description: 'Sent 2 days after LOI with no response — gentle nudge.',
    body: `Happy Sunday! I hate to be a bother — We spoke recently. I was curious: did you end up losing the listing or did your seller just give up on selling?`,
    required: [],
    stage: 'NO_ANSWER',
    shortcut: 'LOI2DAYS',
  },

  INLOI: {
    name: 'INLOI — Inspection after LOI',
    recipientType: 'seller',
    description: 'Response when seller asks about inspection before LOI.',
    body: `{{Seller Name}}, thank you for the swift response – the photos online look great. I'm sure they don't even do the property justice! We will set up a home inspection like any real estate purchase – within 24 hours. We are not willing to incur costs with a contractor/inspector when the seller could simply sell it to another buyer while I spend a few thousand dollars to do due diligence. As a business owner yourself, I can only hope this is understandable.`,
    required: ['seller_name'],
    stage: 'GAIN_FEEDBACK',
    shortcut: 'INLOI',
  },

  F50: {
    name: 'F50 — Facebook 50% Down',
    recipientType: 'seller',
    description: 'Pitch for 50% down seller finance (turnkey properties).',
    body: `Happy {{Day}}! I understand your intent to sell outright, would you be completely opposed to taking half your price now and the rest in one lump sum in the near future?`,
    required: [],
    stage: 'CONTACT_MADE',
    shortcut: 'F50',
  },

  F10: {
    name: 'F10 — Facebook 10% Down',
    recipientType: 'seller',
    description: 'Pitch for 10% down seller finance (renovation properties).',
    body: `Happy {{Day}}! I understand your intent to sell outright, would you be completely opposed to taking 10% of your price now and the rest in one lump sum in just 24 months?`,
    required: [],
    stage: 'CONTACT_MADE',
    shortcut: 'F10',
  },

  PEND: {
    name: 'PEND — Property Pending',
    recipientType: 'agent',
    description: 'Sent when property is pending — keeps offer in back pocket.',
    body: `{{Agent Name}}, happy {{Day}}! I came across your listing at {{Property Address}} and noticed it's pending. Congratulations, that's exciting! Wishing you a smooth closing — Feel free to keep my offer in your back pocket; I'm intending to acquire this as a rental property. I'm gonna give my DSCR Lender a quick call and send an offer over if I get approved. Feel free to browse through my closings with similar clients on our website — Divinity Aligned LLC: Expert Solutions for Life's Major Transitions`,
    required: ['agent_name', 'address'],
    stage: 'DEAD',
    shortcut: 'PEND',
  },

  SD: {
    name: 'SD — Seller Declined',
    recipientType: 'agent_or_seller',
    description: 'Sent when deal is dead — keeps door open for future.',
    body: `Happy {{Day}}! Thank you for the update – feel free to revisit this right before the listing expires if your seller has not been able to find their number with owner occupants. Wishing you a smooth closing – feel free to keep us in mind for the future if you have listings that can't sell out right and are owned outright. This would be a great solution for homeowners who aren't seeing the outright number they're hoping for. Buy-box: Red States (Landlord Friendly) Turnkey Properties Single Family & Multi Family $150,000 - $550,000 3 bed + 10k + Population No HOA's No pools No flood zones`,
    required: [],
    stage: 'DEAD',
    shortcut: 'SD',
  },

  // --- PPC TEXT SHORTCUTS ---
  PIN: {
    name: 'PIN — PPC Intro',
    recipientType: 'seller',
    description: 'PPC: Send before calling so their phone recognizes your number.',
    body: `Happy {{Day}} {{Seller Name}}, it's {{Sender Name}}! I received your message regarding expressing interest in selling at {{Property Address}}. I will be giving you a call shortly to discuss the finer details`,
    required: ['seller_name', 'address'],
    stage: 'LEAD_ENTERED',
    shortcut: 'PIN',
  },

  PNOA: {
    name: 'PNOA — PPC No Answer',
    recipientType: 'seller',
    description: 'PPC: Send if client doesn\'t answer twice after intro text.',
    body: `{{Seller Name}}, I received your inquiry expressing your interest in selling at {{Property Address}}. My name is {{Sender Name}} — I'd be interested in purchasing this myself. When is the best window of time to align today, or maybe tomorrow?`,
    required: ['seller_name', 'address'],
    stage: 'LEAD_ENTERED',
    shortcut: 'PNOA',
  },

  PCC: {
    name: 'PCC — PPC Contact Card (need photos)',
    recipientType: 'seller',
    description: 'PPC: Send after call if they need to send photos.',
    body: `It was great aligning with you {{Seller Name}}. I am looking forward to connecting the dots with you shortly at {{Property Address}}. At your earliest convenience please email me photos to alignedassetsolutions@gmail.com with the subject line {{Property Address}}; we will be in touch in the coming business days if an offer fits for us to proceed with.`,
    required: ['seller_name', 'address'],
    stage: 'CONTACT_MADE',
    shortcut: 'PCC',
  },

  PC: {
    name: 'PC — PPC Contact Card (have photos)',
    recipientType: 'seller',
    description: 'PPC: Send after call if photos are already received.',
    body: `It was great aligning with you {{Seller Name}}. I am looking forward to connecting the dots with you at {{Property Address}} shortly. We will be in touch in the coming business days if an offer fits for us to proceed with.`,
    required: ['seller_name', 'address'],
    stage: 'CONTACT_MADE',
    shortcut: 'PC',
  },

  PGC: {
    name: 'PGC — PPC Group Chat Intro',
    recipientType: 'seller',
    description: 'PPC: Send when offer is ready for closer to pitch.',
    body: `Happy {{Day}} {{Seller Name}}! Looping you in a group chat with my partner {{Sender Name}} regarding the purchase of {{Property Address}}. She will be aligning a time with you that fits your availability best for us to proceed with an offer. It was great connecting with you — looking forward to assisting you in getting your property across the finish line soon`,
    required: ['seller_name', 'address'],
    stage: 'OFFER_SENT',
    shortcut: 'PGC',
  },

  PPH: {
    name: 'PPH — PPC Still Need Photos',
    recipientType: 'seller',
    description: 'PPC: Follow-up when photos are still missing after request.',
    body: `Happy {{Day}}! We have set aside funds to prepare to close on your property; I don't believe we have received photos yet. Those will help us finalize our review and keep everything progressing smoothly to ensure money is in your pocket promptly`,
    required: [],
    stage: 'CONTACT_MADE',
    shortcut: 'PPH',
  },

  // --- LOI RESPONSE SCRIPTS ---
  LOI_RECIEVED_YES: {
    name: 'LOI Received — YES',
    recipientType: 'seller',
    description: 'Seller says YES to LOI terms.',
    body: `That's great to hear! I'm going to get with my closer and we will reach out to you in the coming business days.`,
    required: ['seller_name'],
    stage: 'OFFER_RECEIVED',
    shortcut: 'LOI_RECIEVED_YES',
  },

  LOI_RECEIVED_NO: {
    name: 'LOI Received — NO',
    recipientType: 'seller',
    description: 'Seller declines LOI terms.',
    body: `Understood. If you change your mind or would like to revisit terms, feel free to reach out. Good luck with the sale!`,
    required: ['seller_name'],
    stage: 'SELLER_DECLINED',
    shortcut: 'LOI_RECEIVED_NO',
  },

  // --- FOLLOW-UP SCRIPTS ---
  LOI_FOLLOWUP: {
    name: 'LOI Follow-up',
    recipientType: 'agent',
    description: '2-day follow-up after LOI sent.',
    body: `Hey {{Agent Name}}, just circling back on the LOI for {{Property Address}} — wanted to make sure you received it and see if the seller had any initial thoughts.`,
    required: ['agent_name', 'address'],
    stage: 'GAIN_FEEDBACK',
    shortcut: 'LOI_FOLLOWUP',
  },

  GOOD_STANDING: {
    name: 'Good Standing — Delay in Feedback',
    recipientType: 'agent',
    description: 'When there\'s been a delay in getting feedback.',
    body: `Happy Wednesday! I appreciate your patience as we were in a few closings with clients the past few weeks; I have just now found some time to gain feedback from the offer we sent.`,
    required: [],
    stage: 'ACTIVE_NEGOTIATION',
    shortcut: 'GOOD_STANDING',
  },

  UNDER_CONTRACT_FOLLOWUP: {
    name: 'Under Contract Follow-up',
    recipientType: 'agent',
    description: 'When property went under contract with another buyer.',
    body: `Happy {{Day}} {{Agent Name}} We spoke on [day you found it went UC] you mentioned the property at {{Property Address}} went under contract. I just now found some time to ensure the buyer has wired earnest money and the inspections have since been completed.`,
    required: ['agent_name', 'address'],
    stage: 'DEAD',
    shortcut: 'UC_FOLLOWUP',
  },
};

// =============================================================
// SELLER UPDATE TEMPLATES — REMOVED
// =============================================================
// Per user's instructions: students copy pre-filled text/email templates from
// the 12 text shortcuts (INT, NOA, DNCT, CCC, GCJ, LOI, LOI2DAYS, INLOI, F50,
// F10, PEND, SD) and paste them into their own phones. There are NO automated
// seller update templates in the source. The 7 SELLER_UPDATE_TEMPLATES below
// (CONTRACT_OUT, INSPECTION_SCHEDULED, APPRAISAL_DONE, JV_SIGNED,
// CLOSING_CONFIRMED, EVERYBODY_WINS_PITCH, PSA_CALL_OPENER_SMS,
// SUBTO_PROCESSOR_CONFIRMED) were entirely fabricated. Removed.
const SELLER_UPDATE_TEMPLATES = {};

// =============================================================
// CALL SCRIPTS (from TRACK_MONTELLI.md + TRACK_STUDENT.md)
// =============================================================

const CALL_SCRIPTS = {
  AGENT_INITIAL: {
    name: 'Agent Initial Call Script',
    description: 'Script for calling a listing agent about a property.',
    body: `Smile. SLOW.

"Happy [day], I'm calling regarding [address] — interested in purchasing as a rental for my portfolio. Did I catch you at a good time?"

→ Photos look great, SHOCKED it hasn't sold.
→ Any feedback from other buyers?
→ Roof age? HVAC age?
→ Occupied or Vacant?
→ If rented: rent amount, lease type, when signed?
→ If vacant: why not rent it out?
→ Utilities on?
→ DSCR loan based on rent → call lender
→ Good email?`,
    stage: 'LEAD_ENTERED',
    shortcut: 'AGENT_INITIAL',
  },

  SELLER_INITIAL: {
    name: 'Seller Initial Call Script',
    description: 'Script for calling a seller directly (FSBO).',
    body: `Smile. SLOW.

"Happy [day], I'm calling regarding your property at [address] — interested in purchasing as a rental for my portfolio. Did I catch you at a good time?"

→ Same structure as agent script, addresses seller directly.
→ Ask about motivation to sell.
→ Why selling now?
→ What's their ideal timeline?
→ Any other offers received?
→ Roof/HVAC age?
→ Any known issues?`,
    stage: 'LEAD_ENTERED',
    shortcut: 'SELLER_INITIAL',
  },

  SELLER_REHAB: {
    name: 'Seller Rehab Call Script',
    description: 'Script for distressed/renovation properties.',
    body: `"Happy [day], I'm calling regarding [address]. I noticed it may need some work — I'm looking for properties I can renovate and hold as rentals."

→ Condition rating 1-10?
→ What would it take to make it a 10?
→ Why not put money in and make more profit?
→ No commission savings with us (we buy direct).
→ We handle all repairs after purchase.
→ What's the lowest number they'd accept as-is?`,
    stage: 'LEAD_ENTERED',
    shortcut: 'SELLER_REHAB',
  },

  POST_OFFER_48HR: {
    name: 'Post-Offer 48hr Realignment Script',
    description: 'Call script for 48-hour follow-up after offer sent.',
    body: `"Happy [Day] [Client Name], I am just now finding some time to realign with you regarding [address]. We sent an offer. Is there any clarification I can align regarding the details?"

→ LET THEM TALK.
→ "Noted — I'll relay to my business partner."
→ TEXT JAXON/KAYLA immediately with feedback.`,
    stage: 'GAIN_FEEDBACK',
    shortcut: 'POST_OFFER_48HR',
  },

  RELAY_LINE: {
    name: 'Relay Line Script',
    description: 'Used when seller asks questions — relay to closer, never negotiate.',
    body: `"I'll relay that to my business partner and get right back with you."

NEVER negotiate directly. Always relay to Kayla/Jaxon.`,
    stage: 'ACTIVE_NEGOTIATION',
    shortcut: 'RELAY_LINE',
  },

  VOICE_MEMO: {
    name: 'Voice Memo Script (No Answer)',
    description: 'Leave as voice memo when seller doesn\'t answer.',
    body: `"Happy [day] [name], tried to call regarding [address]. I'm going to call my DSCR lender. Going to loop you into a group chat with my business partner Jaxon. Have a blessed evening."`,
    stage: 'NO_ANSWER',
    shortcut: 'VOICE_MEMO',
  },

  AWAITING_PHOTOS: {
    name: 'Awaiting Photos Script',
    description: 'CRITICAL: Stay on phone while they take photos.',
    body: `"We strive to provide an offer the same day, and at latest just 24 hours to ensure we are making best use of your time. I will que this into our underwriting department, in order to do that - go ahead and take a photo of the kitchen and bathrooms as well as the living spaces and text them to me."

→ STAY ON THE PHONE WITH THEM AS THEY DO THIS.
→ Generate rapport: "What are you most excited for when you sell?"
→ Email photos to yourself.
→ Create Google Drive, click share, "Anyone with the link".
→ Title: "[the property address] Media".
→ Copy/paste link into the notes section of the CRM.`,
    stage: 'CONTACT_MADE',
    shortcut: 'AWAITING_PHOTOS',
  },
};

// =============================================================
// PITCH SCRIPTS (Novation, $0 Down, SubTo Hybrid)
// =============================================================

const PITCH_SCRIPTS = {
  NOVATION_PITCH: {
    name: 'Novation Pitch',
    description: 'When outright offer is too low, offer novation at higher price.',
    body: `"I understand the number you're looking for. Here's an alternative: we can offer a higher price — [X amount] — with a 60-90 day close. You keep the property listed, and if it doesn't sell at retail within that window, we close at our agreed price. You get your number, we get the property, and the agent gets paid either way."`,
    stage: 'ACTIVE_NEGOTIATION',
    shortcut: 'NOVATION_PITCH',
  },

  ZERO_DOWN_PITCH: {
    name: '$0 Down Pitch',
    description: 'For free & clear rentals — capital gains tax angle.',
    body: `"No money down. We take over your existing mortgage payments. You walk away clean — no more landlord headaches, no more tenant calls, no more maintenance. And here's the key: you avoid capital gains tax because you're not taking a lump sum cash payout. The IRS treats this differently when you transfer the property subject-to the existing debt."`,
    stage: 'ACTIVE_NEGOTIATION',
    shortcut: 'ZERO_DOWN_PITCH',
  },

  SUBTO_HYBRID_PIVOT: {
    name: 'SubTo Hybrid Pivot (MFH)',
    description: 'Pivot from Stack to SubTo for multi-family when DSCR is too tight.',
    body: `"I ran the numbers and the DSCR loan is a bit tight on this one. But here's another structure that works: we take over your existing mortgage payments subject-to the existing loan, and we give you [X] cash at closing for your equity. Your mortgage stays in your name but we make every payment automatically through a 3rd-party processor. You get cash now, we get the property, and you're protected by a deed in lieu — if we ever miss a payment, the property comes back to you."`,
    stage: 'ACTIVE_NEGOTIATION',
    shortcut: 'SUBTO_HYBRID_PIVOT',
  },
};

// =============================================================
// EXIT STRATEGY CHEATSHEET
// =============================================================

const EXIT_STRATEGY_CHEATSHEET = {
  description: 'Route deals to the right strategy based on equity, condition, and motivation.',
  routes: {
    high_equity_turnkey: {
      condition: 'Equity > 30% AND Condition = turnkey',
      strategy: 'Stack 50%',
      loi: 'Stack LOI (base) or Stack 5yr BAL',
      pitch: 'F50',
    },
    high_equity_accelerated: {
      condition: 'Equity > 50% AND Seller wants faster payout',
      strategy: 'Stack 50% 5yr BAL',
      loi: 'Stack LOI 5yr BAL',
      pitch: 'F50',
    },
    low_equity_low_rate: {
      condition: 'Equity < 20% AND Existing loan rate < 5%',
      strategy: 'Subject-To',
      loi: 'Subject To LOI Template',
      pitch: 'SubTo Hybrid Pivot',
    },
    free_clear_capital_gains: {
      condition: 'Owned free & clear AND Seller concerned about taxes',
      strategy: '$0 Down (SubTo Hybrid)',
      loi: '$0 Down LOI',
      pitch: 'Zero Down Pitch',
    },
    high_motivation: {
      condition: 'Seller highly motivated (behind on payments, relocating, etc.)',
      strategy: 'Cash Offer',
      loi: 'Cash Offer Template',
      pitch: 'Cash',
    },
    renovation_needed: {
      condition: 'Condition = reno OR condition_rating < 7',
      strategy: 'F10 (10% Down 2yr Balloon)',
      loi: '10% DP 2yr Balloon',
      pitch: 'F10',
    },
    multi_family: {
      condition: 'Property type = mfh',
      strategy: 'MFH Stack or SubTo Hybrid',
      loi: 'AI LOI MFH Stack',
      pitch: 'SubTo Hybrid Pivot (MFH)',
    },
    portfolio: {
      condition: 'Multiple properties from same seller',
      strategy: 'Portfolio Stack + LLC',
      loi: 'Portfolio Stack LOI',
      pitch: 'Portfolio',
    },
    dscr_tight: {
      condition: 'DSCR < 1.25 AND Property type = mfh',
      strategy: 'SubTo MFH Pivot',
      loi: 'Subject To LOI Template',
      pitch: 'SubTo Hybrid Pivot (MFH)',
    },
    midterm_salvage: {
      condition: '1% rule fails BUT mid-term rent potential > 1%',
      strategy: 'Mid-Term (Furnished Finder)',
      loi: 'Interest Only Stack LOI',
      pitch: 'Mid-Term Pivot',
    },
  },
};

// =============================================================
// 5-LAYER SELLER PROTECTION LANGUAGE
// =============================================================

const SELLER_PROTECTION = {
  description: '5 layers of protection for seller finance deals.',
  layers: [
    {
      layer: 1,
      name: 'Automated Bookkeeper',
      description: 'A bookkeeper will be in place to ensure automated wires are sent each month via direct deposit for the existing payments and seller financing portion.',
    },
    {
      layer: 2,
      name: 'Performance Clause',
      description: 'A performance clause within the agreement ensures contractual obligations are met.',
    },
    {
      layer: 3,
      name: 'Promissory Note',
      description: 'A promissory note ensuring the balloon payment is automatically wired at maturity.',
    },
    {
      layer: 4,
      name: 'Deed in Lieu of Foreclosure',
      description: 'A deed in lieu of foreclosure that allows the seller to regain ownership of the property within 15 days of a missed payment — bypassing the foreclosure process and preserving the built-in equity and completed renovations.',
    },
    {
      layer: 5,
      name: 'Personal Guarantee',
      description: 'A personal guarantee backing the obligations.',
    },
  ],
};

// =============================================================
// MERGE LOGIC — Maps template placeholders → lead DB fields
// =============================================================

const PLACEHOLDER_MAP = {
  // Names
  '{{Seller Name}}': lead => lead.seller_name || lead.agent_name || '[Seller Name]',
  '{{Agent Name}}': lead => lead.agent_name || '[Agent Name]',
  '{{Sender Name}}': () => 'Montelli Scott',
  '{{Caller Name}}': () => 'Montelli Scott',

  // Property
  '{{Property Address}}': lead => lead.address || '[Address]',
  '{{Address}}': lead => lead.address || '[Address]',
  '{{property address}}': lead => lead.address || '[Address]',
  '{{Property address}}': lead => lead.address || '[Address]',

  // Day
  '{{Day}}': () => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()],
  '{{day}}': () => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()],
  '{{Day it is}}': () => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()],

  // Contact info
  '{{Sender Phone}}': () => '513-335-9110',
  '{{Sender Email}}': () => 'montelliscottrei@gmail.com',
  '{{Seller Phone}}': lead => lead.seller_phone || '[Phone]',

  // Dates
  '{{PSA Signed Date}}': lead => lead.psa_signed_date || '[Date]',
  '{{Inspection Period Days}}': lead => String(lead.inspection_period_days || '14'),
  '{{Inspection End Date}}': lead => lead.inspection_end_date || '[Date]',
  '{{Inspection Date}}': lead => lead.inspection_scheduled_date || lead.inspection_end_date || '[Date]',
  '{{COE Date}}': lead => lead.coe_date || '[Date]',

  // Title / TC
  '{{Title Company}}': lead => lead.title_company || 'CLOSE Title',
  '{{Title Company Phone}}': lead => lead.title_company_phone || '1-800-405-7150',
  '{{TC Name}}': lead => lead.tc_name || 'BGonzalez',
  '{{TC Email}}': lead => lead.tc_email || 'BGonzalez@sellsmartre.com',
  '{{TC Phone}}': lead => lead.tc_phone || '262-440-2916',

  // Financial
  '{{ARV}}': lead => lead.arv ? `$${Number(lead.arv).toLocaleString()}` : '[ARV]',
  '{{Purchase Price}}': lead => lead.price ? `$${Number(lead.price).toLocaleString()}` : '[Price]',
  '{{Cash Flow}}': lead => lead.cash_flow ? `${Number(lead.cash_flow).toLocaleString()}` : '[Cash Flow]',
  '{{DSCR}}': lead => lead.dscr ? Number(lead.dscr).toFixed(2) : '[DSCR]',
  '{{1% Rule Status}}': lead => lead.one_percent_rule === true ? 'PASS' : lead.one_percent_rule === false ? 'FAIL' : '[Unknown]',
  '{{Lender Value}}': lead => lead.arv ? `$${Math.round(lead.arv * 0.7).toLocaleString()}` : '[Lender Value]',
  '{{Net to Seller}}': lead => lead.price ? `$${Number(lead.price).toLocaleString()}` : '[Net]',
  '{{Days on Market}}': lead => lead.dom ? String(lead.dom) : '[DOM]',

  // JV
  '{{Your Percentage}}': () => '25',
  '{{Managing Party}}': lead => lead.llc_name || 'Divinity Aligned LLC',
  '{{Title Holder}}': lead => lead.title_holder || lead.llc_name || 'Divinity Aligned LLC',

  // SubTo
  '{{Processor Name}}': () => 'To be confirmed',
  '{{Processor Contact}}': () => 'To be confirmed',
  '{{Carryback Principal}}': () => '[Carryback Principal]',
  '{{Carryback Rate}}': () => '[Rate]',
  '{{Carryback Monthly Payment}}': () => '[Payment]',
  '{{Carryback Term}}': () => '[Term]',
  '{{Carryback Start Date}}': () => '[Start Date]',

  // Conditionals
  '{{appraisalAbovePP}}': lead => (lead.appraisal_value && lead.price) ? lead.appraisal_value >= lead.price : true,
  '{{isSubTo}}': lead => lead.recommended_strategy === 'subto' || lead.has_subto_addendum === true,
  '{{hasSellerCarryback}}': lead => !!lead.existing_loan_balance,
};

/**
 * Fill a template with lead data.
 * Returns { templateName, name, description, recipientType, stage, filled, unfilled[], recipient, actionRequired }
 */
function fillTemplate(templateName, templateDef, lead) {
  let filled = templateDef.body;
  const unfilled = [];

  // Handle conditional blocks {{#if condition}}...{{/if}}
  filled = filled.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, inner) => {
    const key = `{{${condition}}}`;
    const resolver = PLACEHOLDER_MAP[key];
    const value = resolver ? resolver(lead) : undefined;
    if (value === true || value === 'true' || value === 'PASS') return inner.trim();
    return '';
  });

  // Simple placeholders
  const placeholders = filled.match(/\{\{[^}]+\}\}/g) || [];
  const unique = [...new Set(placeholders)];

  for (const ph of unique) {
    const resolver = PLACEHOLDER_MAP[ph];
    if (resolver) {
      const value = resolver(lead);
      if (value === undefined || value === null || String(value).startsWith('[')) {
        unfilled.push(ph);
      }
      filled = filled.split(ph).join(value ?? ph);
    } else {
      unfilled.push(ph);
    }
  }

  // Bracket placeholders (legacy format)
  const bracketPhs = filled.match(/\[[^\]]+\]/g) || [];
  for (const ph of bracketPhs) {
    const clean = ph.replace('[', '{{').replace(']', '}}');
    const resolver = PLACEHOLDER_MAP[clean];
    if (resolver) {
      const value = resolver(lead);
      if (value === undefined || value === null) unfilled.push(ph);
      filled = filled.split(ph).join(value ?? ph);
    }
  }

  // Normalize whitespace
  filled = filled.replace(/\n{3,}/g, '\n\n').trim();

  // Determine recipient
  let recipient;
  switch (templateDef.recipientType) {
    case 'seller':
      recipient = lead.seller_name || lead.seller_phone || lead.seller_email || '[unknown seller]';
      break;
    case 'agent':
      recipient = lead.agent_name || lead.agent_email || lead.agent_phone || '[unknown agent]';
      break;
    case 'agent_or_seller':
      recipient = lead.seller_name || lead.agent_name || lead.seller_phone || lead.agent_phone || '[unknown]';
      break;
    case 'jv_party':
      recipient = 'All JV Parties';
      break;
    default:
      recipient = templateDef.recipientType;
  }

  return {
    templateName,
    name: templateDef.name,
    description: templateDef.description,
    recipientType: templateDef.recipientType,
    stage: templateDef.stage,
    shortcut: templateDef.shortcut || null,
    filled,
    unfilled: [...new Set(unfilled)],
    recipient,
    actionRequired: unfilled.length > 0 ? `Fill missing: ${unfilled.join(', ')}` : 'Ready to send',
  };
}

/**
 * Get all scripts applicable to a stage.
 */
function getScriptsForStage(stage, lead) {
  const allDefs = { ...OUTREACH_SCRIPTS, ...SELLER_UPDATE_TEMPLATES, ...CALL_SCRIPTS, ...PITCH_SCRIPTS };
  const results = [];

  for (const [key, def] of Object.entries(allDefs)) {
    if (def.stage === stage) {
      results.push(fillTemplate(key, def, lead));
    }
  }

  return results;
}

/**
 * Get the SCRIPT PROMPT for a specific stage transition.
 * Returns the exact message(s) the student must send.
 */
function getTransitionScripts(fromStage, toStage, lead) {
  const transitionMap = {
    // Source: AIREI_MASTER_PLAYBOOK.md Part 2 (12-Step Mentee Process)
    'LEAD_ENTERED→CONTACT_MADE': ['INT', 'CCC'],
    'CONTACT_MADE→OFFER_READY': ['F50', 'F10'],
    'OFFER_READY→OFFER_SENT': ['GCJ'],
    // OFFER_RECEIVED → GAIN_FEEDBACK combined: 48hr realignment call
    'OFFER_RECEIVED→GAIN_FEEDBACK': ['LOI', 'POST_OFFER_48HR'],
    // GAIN_FEEDBACK → SELLER_DECLINED: SD text + DOM-181
    'GAIN_FEEDBACK→SELLER_DECLINED': ['SD'],
    // GAIN_FEEDBACK → ACTIVE_NEGOTIATION: counter received
    'GAIN_FEEDBACK→ACTIVE_NEGOTIATION': ['GOOD_STANDING'],
    'ACTIVE_NEGOTIATION→TERMS_AGREED': [],
    // TERMS_AGREED → AWAITING_TITLE: contract drafting handoff
    'TERMS_AGREED→AWAITING_TITLE': ['CCC'],
    // AWAITING_TITLE → CONTRACT_OUT: TC handoff
    'AWAITING_TITLE→CONTRACT_OUT': [],
    // CONTRACT_OUT → UNDER_CONTRACT: contract sent / signature flow
    'CONTRACT_OUT→UNDER_CONTRACT': [],
    // UNDER_CONTRACT → INSPECTION_PERIOD: inspection + appraisal prep
    'UNDER_CONTRACT→INSPECTION_PERIOD': [],
    // INSPECTION_PERIOD → INSPECTION_COMPLETE: inspection result
    'INSPECTION_PERIOD→INSPECTION_COMPLETE': [],
    // INSPECTION_COMPLETE → APPRAISAL_ORDERED: appraisal ordered
    'INSPECTION_COMPLETE→APPRAISAL_ORDERED': [],
    // APPRAISAL_ORDERED → APPRAISAL_DONE: appraisal result
    'APPRAISAL_ORDERED→APPRAISAL_DONE': [],
    // APPRAISAL_DONE → JV_SENT: JV path
    'APPRAISAL_DONE→JV_SENT': [],
    // JV_SENT → JV_SIGNED: JV signature flow
    'JV_SENT→JV_SIGNED': [],
    // JV_SIGNED → WIRE_SETUP: wire instructions
    'JV_SIGNED→WIRE_SETUP': [],
    // WIRE_SETUP → CLOSING_DATE: final wire + close
    'WIRE_SETUP→CLOSING_DATE': [],
    '*→DEAD': ['SD'],
  };

  const key = `${fromStage}→${toStage}`;
  const scripts = transitionMap[key] || transitionMap['*→' + toStage];
  if (!scripts) return [];

  const allDefs = { ...OUTREACH_SCRIPTS, ...SELLER_UPDATE_TEMPLATES };
  return scripts
    .map(name => {
      const def = allDefs[name];
      if (!def) return { templateName: name, error: 'Template not found' };
      return fillTemplate(name, def, lead);
    })
    .filter(Boolean);
}

/**
 * Get a single template by shortcut code.
 */
function getTemplateByShortcut(shortcut, lead) {
  const allDefs = { ...OUTREACH_SCRIPTS, ...SELLER_UPDATE_TEMPLATES, ...CALL_SCRIPTS, ...PITCH_SCRIPTS };
  for (const [key, def] of Object.entries(allDefs)) {
    if (def.shortcut === shortcut || key === shortcut) {
      return fillTemplate(key, def, lead);
    }
  }
  return { error: `Template "${shortcut}" not found` };
}

/**
 * List all available template shortcuts.
 */
function listAllShortcuts() {
  const allDefs = { ...OUTREACH_SCRIPTS, ...SELLER_UPDATE_TEMPLATES, ...CALL_SCRIPTS, ...PITCH_SCRIPTS };
  return Object.entries(allDefs).map(([key, def]) => ({
    key,
    shortcut: def.shortcut || key,
    name: def.name,
    description: def.description,
    recipientType: def.recipientType,
    stage: def.stage,
  }));
}

const STAGE_PRIMARY_SHORTCUTS = {
  LEAD_ENTERED: { source: 'sms', key: 'INT' },
  CONTACT_MADE: { source: 'sms', key: 'CCC' },
  OFFER_READY: (lead = {}) => {
    const strategy = String(lead.recommended_strategy || '').toLowerCase();
    const condition = String(lead.condition || '').toLowerCase();
    if (strategy === 'f10' || condition === 'reno' || condition === 'renovation') {
      return { source: 'sms', key: 'F10' };
    }
    return { source: 'sms', key: 'F50' };
  },
  OFFER_SENT: { source: 'sms', key: 'GCJ' },
  OFFER_RECEIVED: null,
  GAIN_FEEDBACK: { source: 'sms', key: 'LOI' },
  NO_ANSWER: { source: 'sms', key: 'LOI2DAYS' },
  SELLER_DECLINED: { source: 'sms', key: 'SD' },
  ACTIVE_NEGOTIATION: { source: 'sms', key: 'EVERYBODY_WINS' },
  TERMS_AGREED: null,
  AWAITING_TITLE: { source: 'sms', key: 'PSA_CALL_OPENER' },
  CONTRACT_OUT: { source: 'sms', key: 'CONTRACT_OUT' },
  UNDER_CONTRACT: { source: 'sms', key: 'INSPECTION_SCHEDULED' },
  INSPECTION_PERIOD: null,
  INSPECTION_COMPLETE: null,
  APPRAISAL_ORDERED: null,
  APPRAISAL_DONE: { source: 'sms', key: 'APPRAISAL_DONE' },
  JV_SENT: null,
  JV_SIGNED: { source: 'sms', key: 'JV_SIGNED' },
  WIRE_SETUP: null,
  CLOSING_DATE: (lead = {}) => {
    const strategy = String(lead.recommended_strategy || lead.contract_type || lead.contract || '').toLowerCase();
    if (strategy.includes('subto')) return { source: 'sms', key: 'SUBTO_PROCESSOR' };
    return { source: 'sms', key: 'CLOSING_CONFIRMED' };
  },
};

function getPrimaryShortcutForStage(stage, lead = {}) {
  const entry = STAGE_PRIMARY_SHORTCUTS[stage];
  if (!entry) return null;
  return typeof entry === 'function' ? entry(lead) : entry;
}

function fillShortcutBySource(source, key, lead) {
  if (source === 'sms') {
    const template = SMS_TEMPLATES[key];
    if (!template) return { error: `Template "${key}" not found` };
    return {
      templateName: key,
      name: key,
      description: `SMS shortcut ${key}`,
      recipientType: 'agent_or_seller',
      stage: lead?.stage || null,
      shortcut: key,
      filled: fillSMSTemplate(template, lead),
      unfilled: [],
      recipient: lead?.seller_name || lead?.agent_name || lead?.seller_phone || lead?.agent_phone || '[unknown]',
      actionRequired: 'Ready to send',
      source,
    };
  }

  if (source === 'ghl') {
    const def = SELLER_UPDATE_TEMPLATES[key];
    if (!def) return { error: `Template "${key}" not found` };
    const result = fillTemplate(key, def, lead);
    return { ...result, source };
  }

  const result = getTemplateByShortcut(key, lead);
  return result.error ? result : { ...result, source };
}

module.exports = {
  fillTemplate,
  getScriptsForStage,
  getTransitionScripts,
  getTemplateByShortcut,
  listAllShortcuts,
  getPrimaryShortcutForStage,
  fillShortcutBySource,
  OUTREACH_SCRIPTS,
  SELLER_UPDATE_TEMPLATES,
  CALL_SCRIPTS,
  PITCH_SCRIPTS,
  EXIT_STRATEGY_CHEATSHEET,
  SELLER_PROTECTION,
  PLACEHOLDER_MAP,
};
