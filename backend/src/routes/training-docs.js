// =============================================================
// Divinity CRM — Underwriting Documentation API
// =============================================================
// SOURCE: prolificcapital/airei-course-notes/AIREI_MASTER_PLAYBOOK.md
//         prolificcapital/airei-course-notes/17A-OH-3.12-Cash-Deal-Underwriting-Training.txt
//         prolificcapital/airei-course-notes/17C-OH-3.12-Cash-Deal-Underwriting-Full-Transcript.txt
//         prolificcapital/memory/KAYLA_CLOSING_PROCESS.md
//
// No synthesis, no "plausible-sounding" content. All claims cited.

const { Router } = require('express');
const router = Router();

const SOURCES = {
  masterPlaybook: 'airei-course-notes/AIREI_MASTER_PLAYBOOK.md',
  cashUnderwriting: 'airei-course-notes/17A-OH-3.12-Cash-Deal-Underwriting-Training.txt',
  cashUnderwritingFull: 'airei-course-notes/17C-OH-3.12-Cash-Deal-Underwriting-Full-Transcript.txt',
  kaylaProcess: 'memory/KAYLA_CLOSING_PROCESS.md',
};

// GET /api/training-docs/underwriting — Underwriting process (verbatim from course)
router.get('/underwriting', (req, res) => {
  res.json({
    title: 'AI REI Underwriting — Source of Truth',
    source: `${SOURCES.masterPlaybook} (Parts 5, 6) + ${SOURCES.cashUnderwritingFull}`,
    keyPrinciple: 'Seth is going to be underwriting all LOI potential requests so that if it doesn\'t cash flow at the 1% rule, after looking at... — Seth handles all deal underwriting.',
    citation: '17C-OH-3.12 transcript',
    sections: [
      {
        title: 'The 1% Rule (Verbatim from Master Playbook)',
        source: 'AIREI_MASTER_PLAYBOOK.md Part 5 + Part 2 Step 6',
        content: 'Rent must be ~1% of purchase price. Example: $250K purchase → $2,500/mo rent minimum.',
        formula: 'monthly_rent >= purchase_price * 0.01',
        who_decides: 'Seth (claytoninvestmentsolutions@gmail.com) — issues approved LOI or rejects if it does not pass 1% rule',
      },
      {
        title: 'The Quick ChatGPT Underwriting Formula (Verbatim)',
        source: 'AIREI_MASTER_PLAYBOOK.md Part 5',
        steps: [
          '1. Find ARV (similar sold properties on Redfin/Zillow in same neighborhood)',
          '2. Multiply ARV × 0.70',
          '3. Subtract repair estimate → that\'s what an investor would pay',
          '4. Subtract wholesale fee → that\'s your max offer',
        ],
        example: '$190K ARV, $35K rehab → max offer ~$30K (investor pays ~$90K, split $5K each)',
      },
      {
        title: 'Cash Deal Math (Verbatim from Cash Underwriting OH-3.12)',
        source: '17A-OH-3.12 transcript',
        content: 'Cash deals: must get at deep discount — wholesale price minus $10K minimum. Cash deals only work if you can get them at significant discount.',
        formula: 'ARV × 0.70 − Repairs − Wholesale Fee = Max Offer',
      },
      {
        title: '50% Stack Method (Seller Finance)',
        source: 'AIREI_MASTER_PLAYBOOK.md Part 5',
        content: 'Put 50% down at closing, seller holds remaining 50%. Minimum equity required: 65% (so seller nets after your down payment). Must have no mortgage on property (free and clear). Check equity at propwire.com.',
        structure: '50% down + seller carries 50% → seller needs 65%+ equity',
      },
      {
        title: '10% Down Seller Finance',
        source: 'AIREI_MASTER_PLAYBOOK.md Part 5',
        content: 'Put 10% (or 0-15%) down, seller carries balance. Down payment must cover seller\'s remaining equity. Need: free and clear property + seller open to terms.',
        talkingPoint: 'Our goal is to ensure it gets paid off quickly, it simply just depends on the rental income.',
      },
      {
        title: 'Subject-To (Sub2)',
        source: 'AIREI_MASTER_PLAYBOOK.md Part 5 + KAYLA_CLOSING_PROCESS.md',
        content: 'Take over existing debt. Typically 72+ months to pay off. Need: low equity property (they owe close to what it\'s worth and can\'t sell traditionally). Best for: people missing payments, facing foreclosure, need to get out.',
        warning: 'Do NOT say "subject to" over the phone — people get scared. Be transparent in person/documentation.',
        deedInLieu: 'Signed at closing — if we default, property is deeded back to seller without foreclosure. Seller keeps all money paid and gets the property back.',
      },
      {
        title: 'Buy-Box (Verbatim from SD text shortcut)',
        source: 'AIREI_MASTER_PLAYBOOK.md Part 1 (SD text)',
        content: 'Red States (Landlord Friendly) | Turnkey Properties | Single Family & Multi Family | $150,000 - $550,000 | 3 bed + | 10k+ Population | No HOA\'s | No pools | No flood zones',
        populationCheck: 'Must be ≥ 10,000 people (ask Google or ChatGPT). If not, discard lead. — Step 1 in Master Playbook',
      },
      {
        title: 'Who Does the Underwriting — The Handoff',
        source: '17C-OH-3.12-Cash-Deal-Underwriting-Full-Transcript.txt + Part 2 Step 6',
        flow: [
          { step: 1, who: 'Student', action: 'Evaluate deal: turnkey or renovation' },
          { step: 2, who: 'Student', action: 'If turnkey + 1% rule pass → email Seth subject "FB LOI Request". If reno → email Seth subject "Renovation – LOI Request [address]"' },
          { step: 3, who: 'Seth', action: 'Reviews 1% rule, ARV math, deal structure' },
          { step: 4, who: 'Seth', action: 'If passes, sends approved LOI back to student' },
          { step: 5, who: 'Student', action: 'Imports LOI link into CRM, moves lead to Offer Sent' },
          { step: 6, who: 'AI', action: 'Sends the offer email to seller (from Step 2 Pt 2 transcript)' },
          { step: 7, who: 'Student', action: 'Calls seller 48hrs later to gain feedback (Post-Offer 48hr script)' },
          { step: 8, who: 'Student', action: 'Relays any questions to Kayla ("Noted — I\'ll relay this to my business partner")' },
        ],
        seth_email: 'claytoninvestmentsolutions@gmail.com',
      },
    ],
  });
});

// GET /api/training-docs/handoff — Kayla/Jaxon/TC handoff (verbatim)
router.get('/handoff', (req, res) => {
  res.json({
    title: 'Acceptance to Closing SOP — Verbatim from Course',
    source: 'AIREI_MASTER_PLAYBOOK.md Part 7 (Acceptance to Closing SOP) + 17A-OH transcript closing call + 10-STEP3-Pt2-Jaxon-Closed-Student-Deal-Walkthrough.txt',
    keyPrinciple: 'Once we get that, I\'ll go ahead and loop in the transaction coordinator and make sure I\'m staying up to date whenever we get the documents out. — Jaxon, on closing call (line 2392 of ALL_TRANSCRIPTS.txt)',
    sops: [
      {
        sop: 'Acceptance',
        source: 'AIREI_MASTER_PLAYBOOK.md Part 7 + closing call transcript',
        trigger: 'Seller agrees to terms on the call',
        actions: [
          'Kayla sends agreement to transaction coordinator (TC) on staff',
          'TC gets the agreement together and gets that sent over for review and authorization',
          'Student informs Kayla if they want fee in LLC name (instead of personal)',
          'Kayla sends JV/consulting agreement outlining profit split',
        ],
        assignmentFee: '$10,000 to Kayla Mouser upon close of escrow (per Lead-to-CRM-AI-Offer-System transcript)',
        paidVia: 'Direct deposit from title/escrow officer — not from Divinity Aligned',
      },
      {
        sop: 'Inspection + Appraisal',
        source: '10-STEP3-Pt2-Jaxon-Closed-Student-Deal-Walkthrough.txt (lines 2355-2395)',
        trigger: 'After seller authorization',
        actions: [
          'Kay arranges home inspector + sewer scope',
          'After completed, appraisal ordered',
          'Montelli contacts title for wiring instructions',
          'Standard 30 day closing',
        ],
        dealStructure: '50% down at close, 50% seller carry back, no monthly payments, paid in full on or before month 72',
        deedInLieu: 'Pre-signed at closing — if we default, property is deeded back to seller without foreclosure. Seller keeps all money paid and gets the property back.',
      },
      {
        sop: 'Consulting Agreement',
        source: 'AIREI_MASTER_PLAYBOOK.md Part 7',
        trigger: 'After property passes inspection + appraisal',
        actions: [
          'Signed by Kayla + Mentee',
          'Sent to title by TC',
        ],
      },
      {
        sop: 'Close of Escrow',
        source: 'AIREI_MASTER_PLAYBOOK.md Part 7',
        trigger: 'All signatures, title transfers',
        actions: [
          'All funds distributed at title company',
          'Student gets $10K assignment fee via direct deposit',
          'Always ask: "Do you have any other properties you\'re looking to offload?" — double/triple/quadruple dip',
        ],
      },
    ],
    whoDoesWhat: {
      student: 'Call seller, send INT/CCC, import lead, AI sends offer, call 48hrs later to gain feedback, relay questions to Kayla',
      seth: 'Underwriting — issues approved LOI based on 1% rule + ARV math',
      kayla: 'JV agreement, assigns TC, runs closing, orders inspection+appraisal, takes title wire instructions',
      jaxon: 'Closer on the call for many deals — runs the closing call directly with seller (per closing transcripts)',
      tc: 'On staff, takes agreement from Kayla, sends to client, returns to title, sends consulting agreement',
    },
  });
});

// GET /api/training-docs/stages — 4-stage GHL pipeline + the 21-stage granular view
router.get('/stages', (req, res) => {
  res.json({
    title: 'Pipeline Stages — 4 Canonical + 21 Granular',
    source: 'AIREI_MASTER_PLAYBOOK.md Part 12 (GHL pipeline) + memory/REI_STAGE_BY_STAGE_GUIDE.md (granular view)',
    canonicalGhlPipeline: [
      { stage: 'Lead Entered', description: 'Opportunity Name = property address. Lead sheet notes populated.' },
      { stage: 'Offer Sent', description: 'AI sends offer email. Import LOI link. Move to this stage once offer is out.' },
      { stage: 'Under Contract', description: 'PSA signed, inspection/appraisal/title process running.' },
      { stage: 'Closed / Archived', description: 'Funds distributed at title. Always ask for referrals.' },
    ],
    granularViewNote: 'The CRM uses 21 granular stages for fine-grained tracking. These map onto the 4 canonical GHL stages. For example, "Terms Agreed" is inside the "Under Contract" canonical stage, "Contract Out" is the moment the PSA is sent to seller, etc.',
    montelliOnlyStages: [
      {
        stage: 'LEAD_ENTERED',
        action: 'Copy property address → Google → Zillow. Check population (≥10K). Note condition.',
      },
      {
        stage: 'CONTACT_MADE',
        action: 'Send INT text first. Call twice. If no answer, send voice memo. Take detailed notes (agent, seller, roof/HVAC, occupancy, rent, utilities).',
      },
    ],
    dontSayList: [
      '"Just checking in" — plants seeds of uncertainty',
      '"Just following up" — same',
      '"Subject to" over the phone — people get scared',
      'Anything that questions the offer already sent ("is the offer okay?", "did you get a chance to look at it?")',
    ],
    doList: [
      'Always use "realign" or "clarification" instead of "checking in"',
      'Always move the needle forward, never question what you\'ve sent',
      'Send the contact card after every call',
      'Ask about other properties they might want to offload (double/triple/quadruple dip)',
      'Always send CCC after every call before hanging up',
      'Use voice memos when there\'s no answer — keeps you in the flow',
      'When listing is about to expire (DOM - 181 days), circle back',
    ],
  });
});

module.exports = router;
