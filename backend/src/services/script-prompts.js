/**
 * script-prompts.js — Script Prompt Engine for Divinity CRM
 * Generates the EXACT message a student must send at each stage transition.
 * Copies templates from ghl-automations/modules/sms-templates.js verbatim.
 * Uses template-merge.js logic for merge fields.
 *
 * @param {string} templateName — SELLER_UPDATE_TEMPLATES or PPC_TEXT_SHORTCUTS key
 * @param {Object} lead — Full lead row from DB
 * @returns {Object} { name, recipient, filled, unfilled[], recipientType }
 */

// =============================================================
// TEMPLATE LIBRARY — All scripts sourced from GHL source files
// =============================================================

const SELLER_UPDATE_TEMPLATES = {
  CONTRACT_OUT: {
    name: 'Contract Signed',
    recipientType: 'seller',
    description: 'Sent to seller when their PSA is signed at Stage 12.',
    body: `Hi {{Seller Name}}, your purchase agreement for {{Property Address}} has been fully signed! 🎉

Here's your timeline:
• Contract Effective Date: {{PSA Signed Date}}
• Inspection Period: {{Inspection Period Days}} days (ends {{Inspection End Date}})
• Close of Escrow: {{COE Date}}
• Title Company: {{Title Company}} ({{Title Company Phone}})

Next: Our transaction coordinator {{TC Name}} ({{TC Email}}, {{TC Phone}}) will reach out about lockbox/utility access for inspection. They guarantee responses within 24 hours.

Reply with any questions!
— {{Sender Name}}`,
    required: ['seller_name', 'address', 'psa_signed_date', 'inspection_period_days', 'inspection_end_date', 'coe_date', 'title_company', 'title_company_phone', 'tc_name', 'tc_email', 'tc_phone'],
    stage: 'UNDER_CONTRACT'
  },

  INSPECTION_SCHEDULED: {
    name: 'Inspection Scheduled',
    recipientType: 'seller',
    description: 'Sent when inspection is scheduled.',
    body: `Hi {{Seller Name}}, your inspection for {{Property Address}} is confirmed for {{Inspection Date}}. 🔍

Important reminders:
• A lockbox or remote lockbox code must be provided for inspector access
• All utilities (gas, water, electricity) MUST be turned on prior to inspection
• The inspection period runs {{Inspection Period Days}} days from the Effective Date

Your TC {{TC Name}} is managing the inspection coordination. Questions? Reply here or call {{TC Phone}}.
— {{Sender Name}}`,
    required: ['seller_name', 'address', 'inspection_date', 'inspection_period_days', 'tc_name', 'tc_phone'],
    stage: 'UNDER_CONTRACT'
  },

  APPRAISAL_DONE: {
    name: 'Appraisal Done',
    recipientType: 'seller',
    description: 'Sent when appraisal result is uploaded.',
    body: `Hi {{Seller Name}}, the appraisal for {{Property Address}} is complete. Here's the update: 📊

• Appraised Value: {{ARV}}
• Contract Purchase Price: {{Purchase Price}}
{{#if appraisalAbovePP}}✅ Appraisal came in at or above purchase price — we're moving forward.{{else}}⚠️ Appraisal came in below contract price. Let's schedule a call to discuss adjusted terms.{{/if}}

Key numbers:
• Cash Flow: {{Cash Flow}}/mo
• DSCR: {{DSCR}} (threshold: 1.25)
• Close of Escrow target: {{COE Date}}

Next step: Once we align on the appraisal, a closing date will be arranged and wire instructions will follow.
— {{Sender Name}}`,
    required: ['seller_name', 'address', 'arv', 'price', 'cash_flow', 'dscr', 'coe_date'],
    stage: 'UNDER_CONTRACT'
  },

  JV_SIGNED: {
    name: 'JV Signed',
    recipientType: 'jv_party',
    description: 'Sent when all JV parties have signed.',
    body: `Hi {{Seller Name}}, the Joint Venture Agreement for {{Property Address}} is fully signed by all parties. 🤝

Your confirmed position:
• Your ownership share: {{Your Percentage}}%
• Managing Party: {{Managing Party}}

What happens next:
• Monthly Cash Flow Report sent by the {{Managing Party}} on or before the last day of each month
• Initial reserve: $5,000 held for property expenses
• Title to the Property is held in the name of: {{Title Holder}}

Welcome to the JV. Let's make this property perform.
— {{Sender Name}}`,
    required: ['seller_name', 'address', 'llc_name'],
    stage: 'CLOSED'
  },

  CLOSING_CONFIRMED: {
    name: 'Closing Confirmed',
    recipientType: 'seller',
    description: 'Sent 7 days before COE.',
    body: `Hi {{Seller Name}}, we're ONE WEEK from closing on {{Property Address}}! 🏁

Closing Details:
• Close of Escrow Date: {{COE Date}}
• Title Company: {{Title Company}} ({{Title Company Phone}})
• Your net proceeds: {{Net to Seller}}

Post-close support: Monique Pasciak (monique@sellsmartre.com, 262-304-0602) will be your primary point of contact after closing.

Excited to get this across the finish line! 🎉
— {{Sender Name}}`,
    required: ['seller_name', 'address', 'coe_date', 'title_company', 'title_company_phone', 'net_to_seller'],
    stage: 'CLOSED'
  },

  EVERYBODY_WINS_PITCH: {
    name: '"Everybody Wins" Pitch',
    recipientType: 'seller',
    description: 'Sent during active negotiation when seller is hesitating.',
    body: 'Hi {{Seller Name}} — quick check-in on {{Property Address}}.\n\nThe numbers work for everyone involved:\n• Cash flow on this deal: ${{Cash Flow}}/mo (well above the $200/mo minimum)\n• DSCR: {{DSCR}} (above the 1.25 lender threshold)\n• 1% rule: {{1% Rule Status}}\n• Lender value: ${{Lender Value}} (70% of purchase)\n\nWhat this means for you, the buyer, and the listing agent:\n• You walk away with ${{Net to Seller}} — no repairs, no showings, no waiting\n• The buyer gets a cash-flowing property from day one\n• The listing agent finally gets paid after being on market {{Days on Market}} days\n\nEverybody wins in real estate. Let me know if you have any questions.\n— {{Sender Name}}',
    required: ['seller_name', 'address', 'cash_flow', 'dscr', 'one_percent_rule', 'arv', 'net_to_seller'],
    stage: 'NEGOTIATING'
  },

  PSA_CALL_OPENER_SMS: {
    name: 'PSA Call Opener',
    recipientType: 'seller',
    description: 'Pre-call text for the PSA signing call.',
    body: `Hi {{Seller Name}}! It's {{Sender Name}} from earlier. Got everything pulled up on my end for the contract on {{Property Address}} — should take us 10-15 min together. Mind if I give you a call now?

(Quick tip: have the property address handy + your LLC name if you have one. We'll be using RabbitSign for e-signature — totally painless, just needs your email.)`,
    required: ['seller_name', 'address'],
    stage: 'NEGOTIATING'
  },

  SUBTO_PROCESSOR_CONFIRMED: {
    name: 'SubTo Processor Confirmed',
    recipientType: 'seller',
    description: 'Sent within 48hrs of COE for SubTo deals.',
    body: `Hi {{Seller Name}}, quick update on {{Property Address}} — we're officially past closing! 🎉

Per the SubTo Addendum:
• A 3rd-party processing company is now set up to automatically pay your existing mortgage
• Your name stays on the loan — but you never have to think about the payment again
• The Deed in Lieu of Foreclosure is held in escrow with {{Title Company}} — your ultimate safety net

If anything ever feels off, you can reach me directly at {{Sender Phone}}. Otherwise, you're all set.
— {{Sender Name}}`,
    required: ['seller_name', 'address', 'title_company', 'seller_phone'],
    stage: 'CLOSED'
  }
};

// =============================================================
// Outreach scripts (not sent automatically — triggered by user)
// =============================================================

const OUTREACH_SCRIPTS = {
  INT: {
    name: 'INT — Intro Text',
    recipientType: 'agent_or_seller',
    description: 'First text before any call.',
    body: `{{Seller Name}}, are you still accepting offers for {{Property Address}}? My name is Montelli, I'm looking to purchase a rental for my portfolio.`,
    required: ['agent_name', 'seller_name', 'address'],
    stage: 'NEW_LEAD'
  },

  CCC: {
    name: 'CCC — Contact Card',
    recipientType: 'agent_or_seller',
    description: 'Sent after every call.',
    body: `It is great aligning with you {{Seller Name}}, I look forward to connecting the dots with you shortly at {{Property Address}}. Feel free to browse through our closings with similar clients on our website — Divinity Aligned LLC: Expert Solutions for Life's Major Transitions`,
    required: ['seller_name', 'address'],
    stage: 'QUALIFIED'
  },

  GCJ: {
    name: 'GCJ — Group Chat Join',
    recipientType: 'seller',
    description: 'Sent when offer is ready, introducing Kayla.',
    body: `{{Seller Name}} - happy {{Day}}! Creating a group chat for the purchase on {{Property Address}} with my business partner Kayla. She is currently in a meeting with our lender; The LOI will be coming from our partner at homewithkaylamauser@gmail.com ; simply inform us it has been received for presentation, and also ensure to check other folders as well. Have a blessed rest of your week!`,
    required: ['seller_name', 'day', 'address'],
    stage: 'OFFER_SENT'
  },

  NOA: {
    name: 'NOA — No Answer Follow-up',
    recipientType: 'seller',
    description: 'Second follow-up text when no response.',
    body: `Hey {{Seller Name}}, Montelli here. I stopped by {{Property Address}} earlier — beautiful property. I sent an offer over a few days ago but haven't heard back. Wanted to follow up and see if you had any questions or concerns I could clarify.`,
    required: ['seller_name', 'address'],
    stage: 'OFFER_SENT'
  },

  SD: {
    name: 'SD — Seller Declined',
    recipientType: 'seller',
    description: 'Sent when deal is marked dead.',
    body: `Happy {{Day}}! Thank you for the update – feel free to revisit this right before the listing expires if your seller has not been able to find their number with owner occupants. Wishing you a smooth closing – feel free to keep us in mind for the future if you have listings that can't sell out right and are owned outright.`,
    required: ['day'],
    stage: 'DEAD'
  },

  LOI_FOLLOWUP: {
    name: 'LOI Follow-up',
    recipientType: 'agent',
    description: '2-day follow-up after LOI sent.',
    body: `Hey {{Agent Name}}, just circling back on the LOI for {{Property Address}} — wanted to make sure you received it and see if the seller had any initial thoughts.`,
    required: ['agent_name', 'address'],
    stage: 'LOI_REQUESTED'
  },

  LOI_RECIEVED_YES: {
    name: 'LOI Received — YES',
    recipientType: 'seller',
    description: 'Seller says YES to LOI terms.',
    body: `That's great to hear! I'm going to get with my closer and we will reach out to you in the coming business days.`,
    required: ['seller_name'],
    stage: 'LOI_APPROVED'
  },

  LOI_RECEIVED_NO: {
    name: 'LOI Received — NO',
    recipientType: 'seller',
    description: 'Seller declines LOI terms.',
    body: `Understood. If you change your mind or would like to revisit terms, feel free to reach out. Good luck with the sale!`,
    required: ['seller_name'],
    stage: 'DEAD'
  },

  PEND: {
    name: 'PEND — Pending Status',
    recipientType: 'seller',
    description: 'Status update that offer is pending review.',
    body: `Quick update on {{Property Address}} — your offer is currently pending review with our investment committee. We expect to have a decision within 24-48 hours. I'll circle back as soon as I hear something. Thanks for your patience!`,
    required: ['seller_name', 'address'],
    stage: 'NEGOTIATING'
  }
};

// =============================================================
// MERGE LOGIC — Maps template placeholders → lead DB fields
// =============================================================

const PLACEHOLDER_MAP = {
  '{{Seller Name}}': lead => lead.seller_name || lead.agent_name || '[Seller Name]',
  '{{Property Address}}': lead => lead.address || '[Address]',
  '{{Address}}': lead => lead.address || '[Address]',
  '{{Day}}': () => ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()],
  '{{day}}': () => ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()],
  '{{Sender Name}}': () => 'Montelli Scott',
  '{{Sender Phone}}': () => '513-335-9110',
  '{{Sender Email}}': () => 'montelliscottrei@gmail.com',
  '{{PSA Signed Date}}': lead => lead.psa_signed_date || '[Date]',
  '{{Inspection Period Days}}': lead => String(lead.inspection_period_days || '14'),
  '{{Inspection End Date}}': lead => lead.inspection_end_date || '[Date]',
  '{{Inspection Date}}': lead => lead.inspection_end_date || '[Date]',
  '{{COE Date}}': lead => lead.coe_date || '[Date]',
  '{{Title Company}}': lead => lead.title_company || 'CLOSE Title',
  '{{Title Company Phone}}': lead => lead.title_company_phone || '1-800-405-7150',
  '{{TC Name}}': lead => lead.tc_name || 'BGonzalez',
  '{{TC Email}}': lead => lead.tc_email || 'BGonzalez@sellsmartre.com',
  '{{TC Phone}}': lead => lead.tc_phone || '262-440-2916',
  '{{ARV}}': lead => lead.arv ? `$${Number(lead.arv).toLocaleString()}` : '[ARV]',
  '{{Purchase Price}}': lead => lead.price ? `$${Number(lead.price).toLocaleString()}` : '[Price]',
  '{{Cash Flow}}': lead => lead.cash_flow ? `${Number(lead.cash_flow).toLocaleString()}` : '[Cash Flow]',
  '{{DSCR}}': lead => lead.dscr ? Number(lead.dscr).toFixed(2) : '[DSCR]',
  '{{1% Rule Status}}': lead => lead.one_percent_rule === true ? 'PASS' : lead.one_percent_rule === false ? 'FAIL' : '[Unknown]',
  '{{Lender Value}}': lead => lead.arv ? `$${Math.round(lead.arv * 0.7).toLocaleString()}` : '[Lender Value]',
  '{{Net to Seller}}': lead => lead.price ? `$${Number(lead.price).toLocaleString()}` : '[Net]',
  '{{Days on Market}}': lead => lead.dom ? String(lead.dom) : '[DOM]',
  '{{Your Percentage}}': () => '25',
  '{{Managing Party}}': lead => lead.llc_name || 'Divinity Aligned LLC',
  '{{Title Holder}}': lead => lead.llc_name || 'Divinity Aligned LLC',
  '{{appraisalAbovePP}}': lead => (lead.arv && lead.price) ? lead.arv >= lead.price : true,
  '{{Agent Name}}': lead => lead.agent_name || '[Agent Name]',
  '{{property address}}': lead => lead.address || '[Address]',
  '{{Property address}}': lead => lead.address || '[Address]',
  '{{Seller Phone}}': lead => lead.seller_phone || '[Phone]',
};

/**
 * Fill a template with lead data.
 */
function fillTemplate(templateName, templateDef, lead) {
  let filled = templateDef.body;
  const unfilled = [];

  // Handle conditional blocks
  filled = filled.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, inner) => {
    const key = `{{${condition}}}`;
    const resolver = PLACEHOLDER_MAP[key];
    const value = resolver ? resolver(lead) : undefined;
    if (value === true || value === 'true' || value === 'PASS') return inner.trim();
    // If the condition resolves to false, remove the whole block including surrounding whitespace
    return '';
  });

  // Simple placeholders
  const placeholders = filled.match(/\{\{[^}]+\}\}/g) || [];
  const unique = [...new Set(placeholders)];

  for (const ph of unique) {
    const resolver = PLACEHOLDER_MAP[ph];
    if (resolver) {
      const value = resolver(lead);
      if (value === undefined || value === null || value === '[Seller Name]' || value === '[Address]' || value === '[Date]' || value === '[Phone]') {
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

  return {
    templateName,
    name: templateDef.name,
    description: templateDef.description,
    recipientType: templateDef.recipientType,
    stage: templateDef.stage,
    filled,
    unfilled: [...new Set(unfilled)],
    recipient: templateDef.recipientType === 'seller'
      ? (lead.seller_name || lead.agent_name || lead.seller_phone || lead.agent_phone || '[unknown]')
      : templateDef.recipientType === 'agent'
      ? (lead.agent_name || lead.agent_email || '[unknown]')
      : templateDef.recipientType === 'jv_party'
      ? 'JV parties'
      : templateDef.recipientType,
    actionRequired: unfilled.length > 0 ? 'Fill missing info' : 'Ready to send',
  };
}

/**
 * Get all scripts applicable to a stage.
 */
function getScriptsForStage(stage, lead) {
  const allDefs = { ...SELLER_UPDATE_TEMPLATES, ...OUTREACH_SCRIPTS };
  const results = [];

  for (const [key, def] of Object.entries(allDefs)) {
    if (def.stage === stage) {
      results.push(fillTemplate(key, def, lead));
    }
  }

  // Also include PPC shortcuts for NEW_LEAD
  if (stage === 'NEW_LEAD') {
    const ppcShortcuts = require('./ppc-shortcuts'); // will create this module
    results.push(...ppcShortcuts.map(p => fillTemplate(p.code, {
      name: p.name,
      description: p.when,
      recipientType: 'seller',
      stage: 'NEW_LEAD',
      body: p.body,
      required: ['seller_name', 'address'],
    }, lead)));
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
    'OFFER_SENT→NEGOTIATING': ['NOA'],
    'NEGOTIATING→UNDER_CONTRACT': ['PSA_CALL_OPENER_SMS', 'CONTRACT_OUT'],
    'UNDER_CONTRACT→CLOSED': ['CLOSING_CONFIRMED'],
    '*→DEAD': ['SD'],
  };

  const key = `${fromStage}→${toStage}`;
  const scripts = transitionMap[key] || transitionMap['*→' + toStage];
  if (!scripts) return [];

  const allDefs = { ...SELLER_UPDATE_TEMPLATES, ...OUTREACH_SCRIPTS };
  return scripts
    .map(name => {
      const def = allDefs[name];
      if (!def) return { templateName: name, error: 'Template not found' };
      return fillTemplate(name, def, lead);
    })
    .filter(Boolean);
}

module.exports = {
  fillTemplate,
  getScriptsForStage,
  getTransitionScripts,
  SELLER_UPDATE_TEMPLATES,
  OUTREACH_SCRIPTS,
};
