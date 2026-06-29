const { buildMergeMap, fillTemplate } = require('../services/pdf-generator');
const cl = require('../services/contract-library');
const lead = {
  address: '2250 Highland Ave, Birmingham, AL 35205',
  price: 175000, seller_name: 'Highland Partners', buyer_name: 'Divinity Aligned LLC',
  party_a_name: 'Montelli Scott', party_a_email: 'montelliscottrei@gmail.com',
  party_b_name: 'Seth Clayton', party_b_email: 'seth@test.com',
  party_c_name: 'Jaxon Deason', party_c_email: 'jaxon@test.com',
  party_d_name: 'Kayla Mauser', party_d_email: 'kayla@test.com',
  party_a_percent: 40, party_b_percent: 20, party_c_percent: 20, party_d_percent: 20,
  managing_party: 'Party A',
  title_holding_name: 'Divinity Aligned JV Holdings LLC',
  party_a_expense: 1250, party_b_expense: 625, party_c_expense: 625, party_d_expense: 625,
  additional_terms: 'Party A to receive assignment fee.',
  jv_purpose: 'To acquire and sell the Property',
  initial_capital: 5000, manager_authority_threshold: 2500,
};
const map = buildMergeMap(lead);
const text = cl.getTemplateText('jv_4party');
const filled = fillTemplate(text, map);

// Check for remaining blanks
const regex = /_{5,}/g;
let match;
const dealBlanks = [];
while ((match = regex.exec(filled)) !== null) {
  const start = Math.max(0, match.index - 40);
  const ctx = filled.substring(start, Math.min(120, filled.length - start));
  if (!ctx.includes('Signature') && !ctx.includes('Initials') && !ctx.includes('Name of Signer') && !ctx.includes('Its:')) {
    dealBlanks.push(ctx.trim());
  }
}
console.log('Deal-specific blanks remaining: ' + dealBlanks.length);
dealBlanks.forEach(b => console.log('  BLANK: ' + b));

// Check for unresolved tokens
const tokens = filled.match(/\[[A-Z_]{3,}\]/g);
if (tokens) {
  console.log('\nUnresolved tokens: ' + [...new Set(tokens)].join(', '));
} else {
  console.log('\nNo unresolved tokens.');
}