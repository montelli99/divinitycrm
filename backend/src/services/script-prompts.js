/**
 * script-prompts.js — Enhanced Script Prompt Engine for Divinity CRM
 * =============================================================
 * Rebuilt 2026-06-17. Every text shortcut from the AIREI Master Playbook
 * is available and pre-filled with actual lead data.
 *
 * Templates included:
 *   Core: INT, NOA, DNCT, CCC, GCJ, LOI, LOI2DAYS, INLOI, F50, F10, PEND, SD
 *   PPC:  PIN, PNOA, PCC, PC, PGC, PPH
 *   Seller Updates: CONTRACT_OUT, INSPECTION_SCHEDULED, APPRAISAL_DONE,
 *                   JV_SIGNED, CLOSING_CONFIRMED
 *   Negotiation: EVERYBODY_WINS_PITCH, PSA_CALL_OPENER_SMS,
 *                SUBTO_PROCESSOR_CONFIRMED
 *
 * Source: AIREI_MASTER_PLAYBOOK.md + ghl-automations sms-templates.js
 */

// =============================================================
// ALL OUTREACH SCRIPTS (text shortcuts from playbook)
// =============================================================

const OUTREACH_SCRIPTS = {
  // --- CORE TEXT SHORTCUTS ---
  INT: {
    name: 'INT — Intro Text',
    recipientType: 'agent_or_seller',
    description: 'First text BEFORE any call. Makes your name show as caller ID.',
    body: `{{Seller Name}}, are you still accepting offers for {{Property Address}}? My name is {{Sender Name}}, I'm looking to purchase this as a rental for my portfolio.`,
    required: ['seller_name', 'address'],
    stage: 'NEW_LEAD',
    shortcut: 'INT',
  },

  NOA: {
    name: 'NOA — No Answer Follow-up',
    recipientType: 'agent_or_seller',
    description: 'Second follow-up text when no response after calls.',
    body: `Are you still accepting offers for {{Property Address}}?`,
    required: ['address'],
    stage: 'OFFER_SENT',
    shortcut: 'NOA',
  },

  DNCT: {
    name: 'DNCT — Do Not Call Text',
    recipientType: 'agent_or_seller',
    description: 'Alternative intro when you cannot call (Do Not Call list).',
    body: `{{Seller Name}}, would you be opposed to accepting an offer for {{Property Address}}? My name is {{Sender Name}}, I'm looking at purchasing as a rental for my portfolio.`,
    required: ['seller_name', 'address'],
    stage: 'NEW_LEAD',
    shortcut: 'DNCT',
  },

  CCC: {
    name: 'CCC — Contact Card',
    recipientType: 'agent_or_seller',
    description: 'Sent AFTER every call. Includes website for credibility.',
    body: `It is great aligning with you {{Seller Name}}, I look forward to connecting the dots with you shortly at {{Property Address}}. Feel free to browse through our closings with similar clients on our website — Divinity Aligned LLC: Expert Solutions for Life's Major Transitions`,
    required: ['seller_name', 'address'],
    stage: 'QUALIFIED',
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
    stage: 'LOI_REQUESTED',
    shortcut: 'LOI',
  },

  LOI2DAYS: {
    name: 'LOI2DAYS — 2 Days No Reply',
    recipientType: 'agent',
    description: 'Sent 2 days after LOI with no response — gentle nudge.',
    body: `Happy Sunday! I hate to be a bother — We spoke recently. I was curious: did you end up losing the listing or did your seller just give up on selling?`,
    required: [],
    stage: 'LOI_REQUESTED',
    shortcut: 'LOI2DAYS',
  },

  INLOI: {
    name: 'INLOI — Inspection after LOI',
    recipientType: 'seller',
    description: 'Response when seller asks about inspection before LOI.',
    body: `{{Seller Name}}, thank you for the swift response – the photos online look great. I'm sure they don't even do the property justice! We will set up a home inspection like any real estate purchase – within 24 hours. We are not willing to incur costs with a contractor/inspector when the seller could simply sell it to another buyer while I spend a few thousand dollars to do due diligence. As a business owner yourself, I can only hope this is understandable.`,
    required: ['seller_name'],
    stage: 'LOI_REQUESTED',
    shortcut: 'INLOI',
  },

  F50: {
    name: 'F50 — Facebook 50% Down',
    recipientType: 'seller',
    description: 'Pitch for 50% down seller finance (turnkey properties).',
    body: `Happy {{Day}}! I understand your intent to sell outright, would you be completely opposed to taking half your price now and the rest in one lump sum in the near future?`,
    required: [],
    stage: 'QUALIFIED',
    shortcut: 'F50',
  },

  F10: {
    name: 'F10 — Facebook 10% Down',
    recipientType: 'seller',
    description: 'Pitch for 10% down seller finance (renovation properties).',
    body: `Happy {{Day}}! I understand your intent to sell outright, would you be completely opposed to taking 10% of your price now and the rest in one lump sum in just 24 months?`,
    required: [],
    stage: 'QUALIFIED',
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
    stage: 'NEW_LEAD',
    shortcut: 'PIN',
  },

  PNOA: {
    name: 'PNOA — PPC No Answer',
    recipientType: 'seller',
    description: 'PPC: Send if client doesn\'t answer twice after intro text.',
    body: `{{Seller Name}}, I received your inquiry expressing your interest in selling at {{Property Address}}. My name is {{Sender Name}} — I'd be interested in purchasing this myself. When is the best window of time to align today, or maybe tomorrow?`,
    required: ['seller_name', 'address'],
    stage: 'NEW_LEAD',
    shortcut: 'PNOA',
  },

  PCC: {
    name: 'PCC — PPC Contact Card (need photos)',
    recipientType: 'seller',
    description: 'PPC: Send after call if they need to send photos.',
    body: `It was great aligning with you {{Seller Name}}. I am looking forward to connecting the dots with you shortly at {{Property Address}}. At your earliest convenience please email me photos to alignedassetsolutions@gmail.com with the subject line {{Property Address}}; we will be in touch in the coming business days if an offer fits for us to proceed with.`,
    required: ['seller_name', 'address'],
    stage: 'QUALIFIED',
    shortcut: 'PCC',
  },

  PC: {
    name: 'PC — PPC Contact Card (have photos)',
    recipientType: 'seller',
    description: 'PPC: Send after call if photos are already received.',
    body: `It was great aligning with you {{Seller Name}}. I am looking forward to connecting the dots with you at {{Property Address}} shortly. We will be in touch in the coming business days if an offer fits for us to proceed with.`,
    required: ['seller_name', 'address'],
    stage: 'QUALIFIED',
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
    stage: 'QUALIFIED',
    shortcut: 'PPH',
  },

  // --- LOI RESPONSE SCRIPTS ---
  LOI_RECIEVED_YES: {
    name: 'LOI Received — YES',
    recipientType: 'seller',
    description: 'Seller says YES to LOI terms.',
    body: `That's great to hear! I'm going to get with my closer and we will reach out to you in the coming business days.`,
    required: ['seller_name'],
    stage: 'LOI_APPROVED',
    shortcut: 'LOI_RECIEVED_YES',
  },

  LOI_RECEIVED_NO: {
    name: 'LOI Received — NO',
    recipientType: 'seller',
    description: 'Seller declines LOI terms.',
    body: `Understood. If you change your mind or would like to revisit terms, feel free to reach out. Good luck with the sale!`,
    required: ['seller_name'],
    stage: 'DEAD',
    shortcut: 'LOI_RECEIVED_NO',
  },

  // --- FOLLOW-UP SCRIPTS ---
  LOI_FOLLOWUP: {
    name: 'LOI Follow-up',
    recipientType: 'agent',
    description: '2-day follow-up after LOI sent.',
    body: `Hey {{Agent Name}}, just circling back on the LOI for {{Property Address}} — wanted to make sure you received it and see if the seller had any initial thoughts.`,
    required: ['agent_name', 'address'],
    stage: 'LOI_REQUESTED',
    shortcut: 'LOI_FOLLOWUP',
  },

  GOOD_STANDING: {
    name: 'Good Standing — Delay in Feedback',
    recipientType: 'agent',
    description: 'When there\'s been a delay in getting feedback.',
    body: `Happy Wednesday! I appreciate your patience as we were in a few closings with clients the past few weeks; I have just now found some time to gain feedback from the offer we sent.`,
    required: [],
    stage: 'NEGOTIATING',
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
// SELLER UPDATE TEMPLATES (post-contract)
// =============================================================

const SELLER_UPDATE_TEMPLATES = {
  CONTRACT_OUT: {
    name: 'CONTRACT_OUT — Contract Signed',
    recipientType: 'seller',
    description: 'Sent to seller when their PSA is fully signed.',
    body: `Hi {{Seller Name}}, your purchase agreement for {{Property Address}} has been fully signed! 🎉

Here's your timeline:
• Contract Effective Date: {{PSA Signed Date}}
• Inspection Period: {{Inspection Period Days}} days (ends {{Inspection End Date}})
• Close of Escrow: {{COE Date}}
• Title Company: {{Title Company}} ({{Title Company Phone}})

{{#if isSubTo}}Since this is a Subject-To transaction, the Subject To Addendum is attached. Key points:
- Your existing mortgage stays in place — we take over payments via a 3rd-party processing company set up within 48hrs of close
- A Deed in Lieu of Foreclosure will be held in escrow — if we ever miss a payment, the property returns to you without court or foreclosure proceedings
- You'll remain liable on the existing loan, but all payments are automated by our bookkeeper
{{/if}}

Next: Our transaction coordinator {{TC Name}} ({{TC Email}}, {{TC Phone}}) will reach out about lockbox/utility access for inspection. They guarantee responses within 24 hours.

Reply with any questions!
— {{Sender Name}}`,
    required: ['seller_name', 'address', 'psa_signed_date', 'inspection_period_days', 'inspection_end_date', 'coe_date', 'title_company', 'title_company_phone', 'tc_name', 'tc_email', 'tc_phone'],
    stage: 'UNDER_CONTRACT',
  },

  INSPECTION_SCHEDULED: {
    name: 'INSPECTION_SCHEDULED — Inspection Confirmed',
    recipientType: 'seller',
    description: 'Sent when inspection is scheduled.',
    body: `Hi {{Seller Name}}, your inspection for {{Property Address}} is confirmed for {{Inspection Date}}. 🔍

Important reminders from our transaction team:
• A lockbox or remote lockbox code must be provided for inspector access, OR the agent must be present at the scheduled time. Delays = additional costs.
• All utilities (gas, water, electricity) MUST be turned on prior to inspection — the inspection cannot be completed without them.
• The inspection period runs {{Inspection Period Days}} days from the Effective Date (ending {{Inspection End Date}}).
• If any issues come up, we'll address them promptly — our team guarantees same-day responses and replies within 24 hours.

{{#if isSubTo}}This is an AS-IS sale — any inspection performed is for the buyer's awareness only.{{/if}}

Your TC {{TC Name}} is managing the inspection coordination. Any questions, reply here or call {{TC Phone}}.
— {{Sender Name}}`,
    required: ['seller_name', 'address', 'inspection_date', 'inspection_period_days', 'inspection_end_date', 'tc_name', 'tc_phone'],
    stage: 'UNDER_CONTRACT',
  },

  APPRAISAL_DONE: {
    name: 'APPRAISAL_DONE — Appraisal Complete',
    recipientType: 'seller',
    description: 'Sent when appraisal result is uploaded.',
    body: `Hi {{Seller Name}}, the appraisal for {{Property Address}} is complete. Here's the update: 📊

• Appraised Value: {{ARV}}
• Contract Purchase Price: {{Purchase Price}}
{{#if appraisalAbovePP}}✅ Appraisal came in at or above purchase price — we're moving forward to closing.{{else}}⚠️ The appraisal came in below the contract price. This requires a quick conversation — let's schedule a call to discuss adjusted terms that work for both of us.{{/if}}

Key numbers reconfirmed:
• Cash Flow: {{Cash Flow}}/mo
• DSCR: {{DSCR}} (threshold: 1.25)
• Close of Escrow target: {{COE Date}}

Next step: Once we align on the appraisal, a closing date will be arranged and wire instructions will follow.
— {{Sender Name}}`,
    required: ['seller_name', 'address', 'arv', 'price', 'cash_flow', 'dscr', 'coe_date'],
    stage: 'UNDER_CONTRACT',
  },

  JV_SIGNED: {
    name: 'JV_SIGNED — JV Agreement Signed',
    recipientType: 'jv_party',
    description: 'Sent when all JV parties have signed.',
    body: `Hi {{Seller Name}}, the Joint Venture Agreement for {{Property Address}} is fully signed by all parties. 🤝

Here's your confirmed position:
• Your ownership share: {{Your Percentage}}%
• Managing Party: {{Managing Party}}
• Voting rules: Majority in Interest = 51% of voting percentage; Super Majority = 66% (required for lien/sale decisions)

What happens next:
• Monthly Cash Flow Report will be sent by the {{Managing Party}} on or before the last day of each month, showing all income, expenses, and reserves
• Initial reserve: $5,000 held for property expenses
• Any non-paying party is charged 25% annual interest on their unpaid share
• Disputes: mediation in the state/county of the property, 10-business-day window

Title to the Property is held in the name of: {{Title Holder}}

Welcome to the JV. Let's make this property perform.
— {{Sender Name}}`,
    required: ['seller_name', 'address', 'llc_name'],
    stage: 'CLOSED',
  },

  CLOSING_CONFIRMED: {
    name: 'CLOSING_CONFIRMED — One Week to Close',
    recipientType: 'seller',
    description: 'Sent 7 days before COE.',
    body: `Hi {{Seller Name}}, we're ONE WEEK from closing on {{Property Address}}! 🏁

Closing Details:
• Close of Escrow Date: {{COE Date}}
• Title Company: {{Title Company}} ({{Title Company Phone}})
• Your net proceeds: {{Net to Seller}}

{{#if isSubTo}}Subject-To Specific:
• A 3rd-party processing company will be set up within 48 hours of closing to automate your mortgage payments
• {{#if hasSellerCarryback}}Your seller carryback: {{Carryback Principal}} at {{Carryback Rate}}% — {{Carryback Monthly Payment}}/mo for {{Carryback Term}} months, starting {{Carryback Start Date}}{{/if}}
• The Deed in Lieu of Foreclosure is held in escrow — if we ever miss a payment, property returns to you without court proceedings
• Your existing loan stays in your name but payments are fully automated{{/if}}

What {{Title Company}} needs from you:
• Wire instructions for your proceeds
• Any final documents they've requested

Post-close support: Monique Pasciak (monique@sellsmartre.com, 262-304-0602) will be your primary point of contact after closing.

Excited to get this across the finish line! 🎉
— {{Sender Name}}`,
    required: ['seller_name', 'address', 'coe_date', 'title_company', 'title_company_phone', 'net_to_seller'],
    stage: 'CLOSED',
  },

  // --- NEGOTIATION TEMPLATES ---
  EVERYBODY_WINS_PITCH: {
    name: '"Everybody Wins" Pitch',
    recipientType: 'seller',
    description: 'Sent during active negotiation when seller is hesitating.',
    body: 'Hi {{Seller Name}} — quick check-in on {{Property Address}}.\n\nThe numbers work for everyone involved:\n• Cash flow on this deal: ${{Cash Flow}}/mo (well above the $200/mo minimum)\n• DSCR: {{DSCR}} (above the 1.25 lender threshold)\n• 1% rule: {{1% Rule Status}}\n• Lender value: ${{Lender Value}} (70% of purchase)\n\nWhat this means for you, the buyer, and the listing agent:\n• You walk away with ${{Net to Seller}} — no repairs, no showings, no waiting\n• The buyer gets a cash-flowing property from day one\n• The listing agent finally gets paid after being on market {{Days on Market}} days\n\nEverybody wins in real estate. Let me know if you have any questions or if there\'s anything that would help you say yes.\n— {{Sender Name}}',
    required: ['seller_name', 'address', 'cash_flow', 'dscr', 'one_percent_rule', 'arv', 'net_to_seller'],
    stage: 'NEGOTIATING',
  },

  PSA_CALL_OPENER_SMS: {
    name: 'PSA Call Opener SMS',
    recipientType: 'seller',
    description: 'Pre-call text for the PSA signing call.',
    body: `Hi {{Seller Name}}! It's {{Sender Name}} from earlier. Got everything pulled up on my end for the contract on {{Property Address}} — should take us 10-15 min together. Mind if I give you a call now?

(Quick tip: it really helps to have the property address handy + your LLC name if you have one. We'll be using a tool called RabbitSign for the e-signature — totally painless, just needs your email.)`,
    required: ['seller_name', 'address'],
    stage: 'NEGOTIATING',
  },

  SUBTO_PROCESSOR_CONFIRMED: {
    name: 'SubTo Processor Confirmed',
    recipientType: 'seller',
    description: 'Sent within 48hrs of COE for SubTo deals.',
    body: `Hi {{Seller Name}}, quick update on {{Property Address}} — we're officially past closing! 🎉

Per the SubTo Addendum, here's what happens next:
• A 3rd-party processing company ({{Processor Name}}, {{Processor Contact}}) is now set up to automatically pay your existing mortgage on time every month
• Your name stays on the loan — but you never have to think about the payment again
• You'll get a monthly statement showing the payment was made
• Deed in Lieu of Foreclosure is held in escrow with {{Title Company}} — your ultimate safety net

If anything ever feels off, you can reach me directly at {{Sender Phone}}. Otherwise, you're all set.
— {{Sender Name}}`,
    required: ['seller_name', 'address', 'title_company', 'seller_phone'],
    stage: 'CLOSED',
  },
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
  '{{Inspection Date}}': lead => lead.inspection_end_date || '[Date]',
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
  '{{Title Holder}}': lead => lead.llc_name || 'Divinity Aligned LLC',

  // SubTo
  '{{Processor Name}}': () => 'To be confirmed',
  '{{Processor Contact}}': () => 'To be confirmed',
  '{{Carryback Principal}}': () => '[Carryback Principal]',
  '{{Carryback Rate}}': () => '[Rate]',
  '{{Carryback Monthly Payment}}': () => '[Payment]',
  '{{Carryback Term}}': () => '[Term]',
  '{{Carryback Start Date}}': () => '[Start Date]',

  // Conditionals
  '{{appraisalAbovePP}}': lead => (lead.arv && lead.price) ? lead.arv >= lead.price : true,
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
  const allDefs = { ...OUTREACH_SCRIPTS, ...SELLER_UPDATE_TEMPLATES };
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
    'NEW_LEAD→QUALIFIED': ['INT', 'CCC'],
    'QUALIFIED→LOI_REQUESTED': ['LOI_FOLLOWUP'],
    'LOI_REQUESTED→LOI_APPROVED': ['LOI_RECIEVED_YES'],
    'LOI_APPROVED→OFFER_SENT': ['GCJ'],
    'OFFER_SENT→NEGOTIATING': ['NOA', 'EVERYBODY_WINS_PITCH'],
    'NEGOTIATING→UNDER_CONTRACT': ['PSA_CALL_OPENER_SMS', 'CONTRACT_OUT'],
    'UNDER_CONTRACT→CLOSED': ['CLOSING_CONFIRMED', 'JV_SIGNED', 'SUBTO_PROCESSOR_CONFIRMED'],
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
  const allDefs = { ...OUTREACH_SCRIPTS, ...SELLER_UPDATE_TEMPLATES };
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
  const allDefs = { ...OUTREACH_SCRIPTS, ...SELLER_UPDATE_TEMPLATES };
  return Object.entries(allDefs).map(([key, def]) => ({
    key,
    shortcut: def.shortcut || key,
    name: def.name,
    description: def.description,
    recipientType: def.recipientType,
    stage: def.stage,
  }));
}

module.exports = {
  fillTemplate,
  getScriptsForStage,
  getTransitionScripts,
  getTemplateByShortcut,
  listAllShortcuts,
  OUTREACH_SCRIPTS,
  SELLER_UPDATE_TEMPLATES,
  PLACEHOLDER_MAP,
};
