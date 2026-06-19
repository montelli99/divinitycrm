// =============================================================
// Divinity CRM — Underwriting Documentation API
// =============================================================
// Surfaces Seth's full underwriting process for students to reference.
// Sourced from: memory/REI_STAGE_BY_STAGE_GUIDE.md + memory-dscr-underwriting.md
//               + memory/closing.md + KAYLA_CLOSING_PROCESS.md

const { Router } = require('express');

const router = Router();

// GET /api/training/underwriting — Full underwriting reference
router.get('/underwriting', (req, res) => {
  res.json({
    title: 'Seth\'s Underwriting Process — Student Reference',
    version: '1.0',
    source: 'AI REI course transcripts (15_OH_Cash, 16_OH_3_17, 04_Pt_4_Student_Call)',
    purpose: 'When a student gets a renovation/needs-work lead, this is exactly what Seth reviews before issuing an LOI.',
    sections: [
      {
        title: '1. The 7-Point Buy Box',
        subtitle: 'The core filter — every deal must pass all 7',
        points: [
          { name: 'Location', check: 'Acceptable metro / sub-market per fund geography' },
          { name: 'Price / ARV', check: '70% rule or better (purchase ≤ 70% of ARV minus repairs)' },
          { name: 'Rent-to-Price (1% Rule)', check: 'Monthly rent ≥ 1% of purchase price. Example: $200K property must rent for $2,000+/mo.' },
          { name: 'Beds/Baths/Sqft', check: 'Min 3 bed / 1.5 bath, 1000+ sqft for sub-2 acquisition' },
          { name: 'Condition', check: 'Roof + HVAC age, foundation, systems. Turnkey preferred. Renovation scope priced separately.' },
          { name: 'Occupancy', check: 'Vacant preferred (no tenant issues). Occupied OK if tenant is paying market rent.' },
          { name: 'Title', check: 'Clear title, no liens, no code violations, no back taxes.' },
        ],
      },
      {
        title: '2. Cash Deal vs. DSCR',
        subtitle: 'Sub-2 acquisitions vs. financed rentals — different math',
        rules: [
          { type: 'Cash / Sub-2', structure: 'Buy without bank financing. Multiple cash closings per quarter. Use when seller won\'t accept conventional terms.' },
          { type: 'DSCR Loan', structure: 'Debt Service Coverage Ratio loan. Investor puts 20-25% down, lender covers 75-80%. Property must cash flow at 1.0+ DSCR. Use for stabilized rentals where buyer wants leverage.' },
          { type: 'Subject-To', structure: 'Take title subject to existing loan. Seller keeps their mortgage. Buyer takes over payments. Best when seller is behind on payments or wants fast close.' },
          { type: 'Seller Financing', structure: '50% down at closing, 50% seller carry back. 72-month balloon. No interest on carry. Buyer covers closing + agent commission. Standard for motivated sellers who want monthly cash.' },
        ],
      },
      {
        title: '3. Renovation Underwriting (When Property Needs Work)',
        subtitle: 'Seth reviews before issuing an LOI on renovation deals',
        process: [
          'Get contractor bid or use $20-30/sqft estimate for cosmetic, $40-60/sqft for full gut',
          'Subtract renovation cost from ARV to get max allowable offer',
          'Apply 70% rule: (ARV × 0.70) − repairs − $5K closing buffer = MAX OFFER',
          'If max offer is below seller\'s asking price, deal is dead — walk away',
          'If max offer meets seller\'s price, send LOI request to Seth with full breakdown',
        ],
      },
      {
        title: '4. Montelli\'s Hand-to-Seth Process',
        subtitle: 'How renovation deals flow to underwriting',
        steps: [
          { step: 1, action: 'Student enters lead in CRM with rehab estimate + market rent' },
          { step: 2, action: 'Student emails Seth: claytoninvestmentsolutions@gmail.com' },
          { step: 3, action: 'Subject: "Renovation — LOI Request [address]"' },
          { step: 4, action: 'Body includes: address, asking price, ARV, rehab estimate, market rent, occupancy, condition notes' },
          { step: 5, action: 'Seth reviews 7-point buy box + 70% rule + DSCR math' },
          { step: 6, action: 'If deal passes, Seth issues LOI template back to student' },
          { step: 7, action: 'Student moves lead from "Contact Made" to "Offer Ready to be Sent"' },
        ],
      },
      {
        title: '5. Hot Lead Indicators (What Triggers Fast Action)',
        signals: [
          'Seller counters with specific terms (not "too low")',
          'Seller asks about down payment, timeline, closing costs',
          'Seller mentions other buyers interested (leverage signal)',
          'Seller wants to close fast',
          'Seller asks about DSCR or seller carry structure',
          'Seller mentions deed in lieu or balloon',
        ],
        studentAction: 'Create group chat with Kayla immediately (GCJ text shortcut). Montelli relays. Kayla generates counter.',
      },
      {
        title: '6. Standard Deal Structure (Montelli Default)',
        structure: {
          downPayment: '50% at closing',
          carryBack: '50% seller carry back, no monthly payments',
          balloon: '72 months',
          interestOnCarry: 'None',
          deedInLieu: 'Signed at closing (seller protection)',
          closingCosts: 'Buyer covers both sides + agent commission',
          alternate: 'If seller wants monthly: reduce down payment to 20-30%, pay monthly at fair market rent equivalent, still no interest on carry',
        },
      },
      {
        title: '7. When to Walk Away',
        rules: [
          'Property doesn\'t meet 1% rule AND seller won\'t take less than asking',
          'Title has liens, violations, or back taxes that aren\'t cleared at closing',
          'Renovation cost is more than 40% of ARV (too much risk)',
          'Seller is unreasonable on price AND has time (motivated sellers don\'t have time)',
          'Property is in a flood zone, has foundation issues, or has structural damage',
          'You can\'t verify seller identity or authority to sell',
        ],
      },
    ],
  });
});

// GET /api/training/handoff — Kayla handoff reference (when to hand to Kayla)
router.get('/handoff', (req, res) => {
  res.json({
    title: 'When to Hand Off to Kayla — Stage Reference',
    source: 'KAYLA_CLOSING_PROCESS.md (course transcripts 17A, 17B, 17C, 17B-OH, 18-OH)',
    keyPrinciple: 'MONTELLI IS RELAY, KAYLA IS CLOSER. Montelli never negotiates terms, never signs, never sends contracts. Only relays.',
    stages: [
      { stage: 'OFFER_SENT', owner: 'Montelli', action: 'Wait 48hrs, call seller with post-offer script. If questions → "Noted, I\'ll relay to my business partner." Email Kayla immediately with question.' },
      { stage: 'OFFER_RECEIVED', owner: 'Montelli', action: 'Document counter. Email Kayla: "Counter — [address] — [terms]". Kayla generates counter. Montelli delivers.' },
      { stage: 'ACTIVE_NEGOTIATION', owner: 'Kayla', action: 'Kayla negotiates. Montelli relays counters back to seller.' },
      { stage: 'TERMS_AGREED', owner: 'Kayla takes over', action: 'Montelli emails Kayla with seller info + agreed price + structure. Kayla drafts contract. Kayla sends to seller via RabbitSign.' },
      { stage: 'CONTRACT_OUT', owner: 'Kayla', action: 'Monitor for signature. 72hr timer. If no Loan Balance + APN within 72hrs, alert.' },
      { stage: 'UNDER_CONTRACT', owner: 'TC takes over (Kayla assigns)', action: 'Order inspection → appraisal → title. Montelli monitors seller every 3-5 days.' },
      { stage: 'INSPECTION + APPRAISAL', owner: 'TC', action: 'If issues → negotiate credit or repair. If appraisal low → renegotiate price or pull deal.' },
      { stage: 'TITLE + JV', owner: 'TC + Kayla', action: 'Title company (seller chooses). JV drafted by Kayla. All parties sign. Earnest money wired.' },
      { stage: 'WIRE + CLOSING', owner: 'Montelli', action: 'Confirm wire. Wire funds. Close. Ask for referrals: "Do you have other properties? Anyone else looking to sell?"' },
    ],
    sellerMonitoringScript: {
      frequency: 'Every 3-5 days after Terms Agreed',
      firstMessage: 'Hey [name] — just checking in — everything smooth on your end?',
      weekTwo: 'Hey [name] — inspection/appraisal update: [status]. Anything you need from me?',
      preClose: 'Hey [name] — closing is [date]. Excited to close! Any last questions before we sign?',
    },
  });
});

// GET /api/training/stages — Full per-stage action guide (Montelli-only stages)
router.get('/stages', (req, res) => {
  res.json({
    title: 'AI REI — Per Stage Action Guide (Montelli Stages Only)',
    source: 'REI_STAGE_BY_STAGE_GUIDE.md',
    note: 'Montelli only moves 2 stages: CONTACT_MADE and OFFER_READY. All other stages are Kayla/Jaxon/TC.',
    whoMovesWhat: [
      { who: 'Montelli', stages: '2 stages: Contact Made, Offer Ready to be Sent to Seller' },
      { who: 'Emily (AI)', stages: 'Does the WORK — calls, texts, intel, emails, notes — but does NOT move stages' },
      { who: 'Kayla/Jaxon', stages: 'All other stages (closing work, 11-19)' },
      { who: 'Pipeline automation', stages: 'Everything else — auto-advances as the deal moves' },
    ],
    montelliStages: [
      {
        stage: 'LEAD_ENTERED',
        action: 'Send "INT" text shortcut to seller, then call. Use Agent Script on listing agent first. Ask: agent name, phone, email, seller name, seller phone, roof/HVAC age, occupancy, utilities, rent if occupied. Send "CCC" after every call. Move to CONTACT_MADE.',
      },
      {
        stage: 'CONTACT_MADE',
        action: 'Confirm seller info. Evaluate turnkey vs renovation. Turnkey: propose F50 (50% down) or F10 (10% down, 24mo). Renovation: email Kayla/Jaxon with rehab estimate. Email Seth at claytoninvestmentsolutions@gmail.com — subject "Renovation — LOI Request [address]". Move to OFFER_READY.',
      },
    ],
    reminders: {
      montelliCadence: '3-5 days post-OFFER_SENT (post-offer call), then 3-5 days after TERMS_AGREED until close',
      scriptLibrary: 'INT, NOA, CCC, GCJ, F50, F10, LOI, SD — 41+ shortcuts available in CRM (copy/paste into your phone)',
    },
  });
});

module.exports = router;