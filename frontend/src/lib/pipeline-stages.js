// CANONICAL 21-stage pipeline — mirror of GHL_WORKFLOWS_SPEC.md Section A
// DO NOT EDIT WITHOUT UPDATING backend/src/services/stage-automations.js
// Last synced: 2026-06-19 from ghl-automations/GHL_WORKFLOWS_SPEC.md

export const STAGES = [
  // ===== Montelli (Stages 1-10) =====
  'LEAD_ENTERED',        // Stage 1
  'CONTACT_MADE',        // Stage 2
  'OFFER_READY',         // Stage 3
  'OFFER_SENT',          // Stage 4
  'OFFER_RECEIVED',      // Stage 5
  'GAIN_FEEDBACK',       // Stage 6
  'NO_ANSWER',           // Stage 7
  'SELLER_DECLINED',     // Stage 8
  'ACTIVE_NEGOTIATION',  // Stage 9
  'TERMS_AGREED',        // Stage 10
  // ===== TC (Stages 11-19) =====
  'AWAITING_TITLE',      // Stage 11
  'CONTRACT_OUT',        // Stage 12 (THE BIG ONE)
  'UNDER_CONTRACT',      // Stage 13
  'INSPECTION_PERIOD',   // Stage 14
  'INSPECTION_COMPLETE', // Stage 15
  'APPRAISAL_ORDERED',   // Stage 16
  'APPRAISAL_DONE',      // Stage 17
  'JV_SENT',             // Stage 18
  'JV_SIGNED',           // Stage 19
  // ===== Closing (Stages 20-21) =====
  'WIRE_SETUP',          // Stage 20
  'CLOSING_DATE',        // Stage 21
];

export const STAGE_LABELS = {
  LEAD_ENTERED: '1. Lead Entered',
  CONTACT_MADE: '2. Contact Made',
  OFFER_READY: '3. Offer Ready',
  OFFER_SENT: '4. Offer Sent',
  OFFER_RECEIVED: '5. Offer Received',
  GAIN_FEEDBACK: '6. Gain Feedback',
  NO_ANSWER: '7. No Answer After GFB',
  SELLER_DECLINED: '8. Seller Declined',
  ACTIVE_NEGOTIATION: '9. Active Negotiation',
  TERMS_AGREED: '10. Terms Agreed',
  AWAITING_TITLE: '11. Awaiting Title',
  CONTRACT_OUT: '12. Contract Out (THE BIG ONE)',
  UNDER_CONTRACT: '13. Under Contract',
  INSPECTION_PERIOD: '14. Inspection Period',
  INSPECTION_COMPLETE: '15. Inspection Complete',
  APPRAISAL_ORDERED: '16. Appraisal Ordered',
  APPRAISAL_DONE: '17. Appraisal Done',
  JV_SENT: '18. JV Sent',
  JV_SIGNED: '19. JV Signed',
  WIRE_SETUP: '20. Wire Setup',
  CLOSING_DATE: '21. Closing Date',
};

export const STAGE_SHORT_LABELS = {
  LEAD_ENTERED: 'Lead Entered',
  CONTACT_MADE: 'Contact Made',
  OFFER_READY: 'Offer Ready',
  OFFER_SENT: 'Offer Sent',
  OFFER_RECEIVED: 'Offer Received',
  GAIN_FEEDBACK: 'Gain Feedback',
  NO_ANSWER: 'No Answer',
  SELLER_DECLINED: 'Declined',
  ACTIVE_NEGOTIATION: 'Negotiating',
  TERMS_AGREED: 'Terms Agreed',
  AWAITING_TITLE: 'Awaiting Title',
  CONTRACT_OUT: 'Contract Out',
  UNDER_CONTRACT: 'Under Contract',
  INSPECTION_PERIOD: 'Inspection',
  INSPECTION_COMPLETE: 'Inspection Done',
  APPRAISAL_ORDERED: 'Appraisal Ordered',
  APPRAISAL_DONE: 'Appraisal Done',
  JV_SENT: 'JV Sent',
  JV_SIGNED: 'JV Signed',
  WIRE_SETUP: 'Wire Setup',
  CLOSING_DATE: 'Closing Date',
};

// 4-stage simplified GHL pipeline (per Part 12 of Master Playbook)
// Maps each of the 21 stages to its high-level bucket
export const STAGE_BUCKETS = {
  LEAD_ENTERED: 'NEW_LEAD',
  CONTACT_MADE: 'QUALIFIED',
  OFFER_READY: 'OFFER_SENT',     // pre-offer LOI step
  OFFER_SENT: 'OFFER_SENT',
  OFFER_RECEIVED: 'OFFER_SENT',  // awaiting Kayla response
  GAIN_FEEDBACK: 'NEGOTIATING',
  NO_ANSWER: 'NEGOTIATING',
  SELLER_DECLINED: 'DEAD',
  ACTIVE_NEGOTIATION: 'NEGOTIATING',
  TERMS_AGREED: 'NEGOTIATING',
  AWAITING_TITLE: 'UNDER_CONTRACT',
  CONTRACT_OUT: 'UNDER_CONTRACT',
  UNDER_CONTRACT: 'UNDER_CONTRACT',
  INSPECTION_PERIOD: 'UNDER_CONTRACT',
  INSPECTION_COMPLETE: 'UNDER_CONTRACT',
  APPRAISAL_ORDERED: 'UNDER_CONTRACT',
  APPRAISAL_DONE: 'UNDER_CONTRACT',
  JV_SENT: 'UNDER_CONTRACT',
  JV_SIGNED: 'UNDER_CONTRACT',
  WIRE_SETUP: 'CLOSED',
  CLOSING_DATE: 'CLOSED',
};

export const BUCKET_ORDER = ['NEW_LEAD', 'QUALIFIED', 'OFFER_SENT', 'NEGOTIATING', 'UNDER_CONTRACT', 'CLOSED', 'DEAD'];

export const BUCKET_LABELS = {
  NEW_LEAD: 'New Lead',
  QUALIFIED: 'Qualified',
  OFFER_SENT: 'Offer Sent',
  NEGOTIATING: 'Negotiating',
  UNDER_CONTRACT: 'Under Contract',
  CLOSED: 'Closed',
  DEAD: 'Dead',
};

export const OWNERS = {
  MONTELLI: {
    name: 'Montelli',
    stages: ['LEAD_ENTERED', 'CONTACT_MADE', 'OFFER_READY', 'OFFER_SENT', 'OFFER_RECEIVED', 'GAIN_FEEDBACK', 'NO_ANSWER', 'SELLER_DECLINED', 'ACTIVE_NEGOTIATION', 'TERMS_AGREED'],
    color: '#0066cc',
    bgColor: 'rgba(0,102,204,0.08)',
  },
  TC: {
    name: 'TC',
    stages: ['AWAITING_TITLE', 'CONTRACT_OUT', 'UNDER_CONTRACT', 'INSPECTION_PERIOD', 'INSPECTION_COMPLETE', 'APPRAISAL_ORDERED', 'APPRAISAL_DONE', 'JV_SENT', 'JV_SIGNED'],
    color: '#00cc00',
    bgColor: 'rgba(0,204,0,0.08)',
  },
  CLOSING: {
    name: 'Closing',
    stages: ['WIRE_SETUP', 'CLOSING_DATE'],
    color: '#cc0066',
    bgColor: 'rgba(204,0,102,0.08)',
  },
};

export function getOwnerForStage(stage) {
  for (const [key, owner] of Object.entries(OWNERS)) {
    if (owner.stages.includes(stage)) return owner;
  }
  return { name: 'Unknown', stages: [], color: '#999', bgColor: 'rgba(153,153,153,0.08)' };
}

// Valid transitions (matches backend STAGE_TRANSITIONS keys)
export const NEXT_STAGE = {
  LEAD_ENTERED: 'CONTACT_MADE',
  CONTACT_MADE: 'OFFER_READY',
  OFFER_READY: 'OFFER_SENT',
  OFFER_SENT: 'OFFER_RECEIVED',
  OFFER_RECEIVED: 'GAIN_FEEDBACK',
  GAIN_FEEDBACK: 'ACTIVE_NEGOTIATION',
  ACTIVE_NEGOTIATION: 'TERMS_AGREED',
  TERMS_AGREED: 'AWAITING_TITLE',
  AWAITING_TITLE: 'CONTRACT_OUT',
  CONTRACT_OUT: 'UNDER_CONTRACT',
  UNDER_CONTRACT: 'INSPECTION_PERIOD',
  INSPECTION_PERIOD: 'INSPECTION_COMPLETE',
  INSPECTION_COMPLETE: 'APPRAISAL_ORDERED',
  APPRAISAL_ORDERED: 'APPRAISAL_DONE',
  APPRAISAL_DONE: 'JV_SENT',     // JV path
  JV_SENT: 'JV_SIGNED',
  JV_SIGNED: 'WIRE_SETUP',
  WIRE_SETUP: 'CLOSING_DATE',
  CLOSING_DATE: 'CLOSED',
};
