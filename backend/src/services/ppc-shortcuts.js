/**
 * ppc-shortcuts.js — PPC Text Shortcuts for Divinity CRM
 * Quick-reply templates for NEW_LEAD stage outreach.
 */

const PPC_SHORTCUTS = [
  {
    code: 'PPC_INTRO',
    name: 'PPC Intro',
    when: 'First contact with a new lead from PPC/ads',
    body: `Hi {{Seller Name}}, I saw your property at {{Property Address}} and wanted to reach out. I'm Montelli with Divinity Aligned — we buy properties for our rental portfolio. Is this still available?`
  },
  {
    code: 'PPC_FOLLOWUP',
    name: 'PPC Follow-up',
    when: 'No response after 24hrs from initial PPC contact',
    body: `Hey {{Seller Name}}, just following up on {{Property Address}}. We're actively looking to add properties to our portfolio and yours caught our attention. Would love to chat when you have a moment.`
  },
  {
    code: 'PPC_VALUE',
    name: 'PPC Value Pitch',
    when: 'Seller asks "what can you offer?"',
    body: `Great question! For {{Property Address}}, we can typically close in 14-21 days with no repairs needed from you, no realtor commissions, and a clean cash offer. Want me to run the numbers and send you a formal LOI?`
  }
];

module.exports = PPC_SHORTCUTS;
