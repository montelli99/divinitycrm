/**
 * pdf-generator.js — Professional Legal Document Packet Engine v2
 *
 * Packet structure (compact, no blank pages):
 * Page 1: Cover page (compact two-column transaction summary)
 * Page 2: Executive summary (transaction details)
 * Page 3+: Contract documents (master + addendums, flowing continuously)
 *
 * No blank pages. No title-casing. No whitespace collapsing.
 * Source text is preserved exactly — only HTML entities and checkboxes are normalized.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const contractLibrary = require('./contract-library');

const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];

function findEdge() {
  for (const p of EDGE_PATHS) if (fs.existsSync(p)) return p;
  return null;
}

// ============================================================
// MERGE TOKENS
// ============================================================

const REQUIRED_TOKENS = ['[PROPERTY_ADDRESS]', '[PURCHASE_PRICE]', '[SELLER_NAME]', '[BUYER_NAME]', '[EFFECTIVE_DATE]'];

const OPTIONAL_TOKENS = [
  '[APN]', '[CITY_STATE_ZIP]', '[PROPERTY_CITY]', '[PROPERTY_STATE]', '[PROPERTY_ZIP]',
  '[SELLER_EMAIL]', '[SELLER_PHONE]', '[SELLER_ADDRESS]', '[SELLER_COMPANY]',
  '[BUYER_EMAIL]', '[BUYER_PHONE]', '[BUYER_ADDRESS]', '[BUYER_COMPANY]',
  '[EMD_AMOUNT]', '[INSPECTION_DAYS]', '[COE_DAYS]', '[COE_DATE]',
  '[EXISTING_LOAN_BALANCE]', '[EXISTING_LOAN_LENDER]', '[EXISTING_LOAN_PAYMENT]',
  '[SELLER_CARRYBACK]', '[SELLER_CARRYBACK_RATE]', '[MONTHLY_PAYMENT]',
  '[MATURITY_DATE]', '[MATURITY_MONTHS]', '[PAYMENT_START_DATE]',
  '[CASH_AT_COE]', '[DOWN_PAYMENT]', '[INTEREST_ANNUAL]', '[INTEREST_TOTAL]',
  '[TITLE_COMPANY]', '[TITLE_EMAIL]', '[TITLE_PHONE]', '[TITLE_WEBSITE]',
  '[NON_CIRCUMVENTION_PENALTY]', '[PORTFOLIO_PROPERTY_COUNT]', '[PORTFOLIO_TOTAL_PRICE]',
  '[PARTY_D_NAME]', '[PARTY_D_EMAIL]', '[PARTY_A_PAYOUT]', '[PARTY_B_PAYOUT]',
  '[PARTY_C_PAYOUT]', '[PARTY_D_PAYOUT]', '[PARTY_A_SELLER_PAYMENT]', '[PARTY_A_ASSIGNMENT_FEE]',
  '[PARTY_A_NAME]', '[PARTY_A_EMAIL]', '[PARTY_B_NAME]', '[PARTY_B_EMAIL]',
  '[PARTY_C_NAME]', '[PARTY_C_EMAIL]',
  '[PARTY_A_PERCENT]', '[PARTY_B_PERCENT]', '[PARTY_C_PERCENT]', '[PARTY_D_PERCENT]',
  '[MANAGING_PARTY]', '[CONTACT_PHONE]', '[CONTACT_NAME]',
  '[COMPANY_NAME]', '[COMPANY_WEBSITE]',
  '[INITIAL_CAPITAL]', '[MANAGER_AUTHORITY_THRESHOLD]',
  '[TITLE_WEBSITE]', '[PERSONAL_PROPERTY_INCLUDED]', '[OCCUPANCY_STATUS]',
  '[TITLE_HOLDING_INSTRUCTIONS]', '[DEFAULT_INTEREST_RATE]',
  '[PARTY_B_DEFAULT_PERCENT]', '[PARTY_C_DEFAULT_PERCENT]', '[PARTY_D_DEFAULT_PERCENT]',
  '[TITLE_HOLDING_NAME]', '[PARTY_A_EXPENSE]', '[PARTY_B_EXPENSE]', '[PARTY_C_EXPENSE]', '[PARTY_D_EXPENSE]',
  '[ADDITIONAL_TERMS]', '[JV_PURPOSE]', '[DATE]',
];

function formatCurrency(n) {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildMergeMap(lead) {
  const today = new Date();
  const effectiveDate = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const coeDate = lead.coe_date
    ? new Date(lead.coe_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date(Date.now() + (lead.coe_days || 30) * 86400000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const maturityMonths = lead.maturity_months || 72;
  const maturityDate = lead.maturity_date || new Date(Date.now() + ((lead.coe_days || 30) + Number(maturityMonths) * 30) * 86400000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const cityStateZip = [lead.city, lead.state, lead.zip].filter(Boolean).join(', ');

  return {
    '[PROPERTY_ADDRESS]': lead.address || '', '[CITY_STATE_ZIP]': cityStateZip,
    '[PROPERTY_CITY]': lead.city || '', '[PROPERTY_STATE]': lead.state || '', '[PROPERTY_ZIP]': lead.zip || '',
    '[APN]': lead.apn || 'To be provided by Escrow Agent',
    '[PURCHASE_PRICE]': lead.price ? formatCurrency(lead.price) : '',
    '[EMD_AMOUNT]': formatCurrency(lead.emd_amount || 500),
    '[EXISTING_LOAN_BALANCE]': lead.existing_loan_balance ? formatCurrency(lead.existing_loan_balance) : '$0.00',
    '[EXISTING_LOAN_LENDER]': lead.existing_loan_type || '',
    '[EXISTING_LOAN_PAYMENT]': lead.existing_loan_payment ? formatCurrency(lead.existing_loan_payment) : 'TBD',
    '[SELLER_NAME]': lead.seller_name || '', '[SELLER_EMAIL]': lead.seller_email || '',
    '[SELLER_PHONE]': lead.seller_phone || '', '[SELLER_ADDRESS]': lead.seller_address || '',
    '[SELLER_COMPANY]': lead.seller_company || '',
    '[BUYER_NAME]': lead.buyer_name || 'Divinity Aligned LLC',
    '[BUYER_EMAIL]': lead.buyer_email || 'montelliscottrei@gmail.com',
    '[BUYER_PHONE]': lead.buyer_phone || '', '[BUYER_ADDRESS]': lead.buyer_address || '',
    '[BUYER_COMPANY]': lead.buyer_company || 'Divinity Aligned LLC',
    '[INSPECTION_DAYS]': String(lead.inspection_period_days || 14),
    '[COE_DAYS]': String(lead.coe_days || 30), '[COE_DATE]': coeDate, '[EFFECTIVE_DATE]': effectiveDate,
    '[TITLE_COMPANY]': lead.title_company || 'CLOSE Title',
    '[TITLE_EMAIL]': lead.title_email || 'Orders@closedtitle.com',
    '[TITLE_PHONE]': lead.title_phone || '800-405-7150', '[TITLE_WEBSITE]': lead.title_website || '',
    '[SELLER_CARRYBACK]': lead.seller_carryback ? formatCurrency(lead.seller_carryback) : '$0.00',
    '[SELLER_CARRYBACK_RATE]': lead.seller_carryback_rate ? `${(lead.seller_carryback_rate * 100).toFixed(2)}%` : '0%',
    '[MONTHLY_PAYMENT]': lead.monthly_payment ? formatCurrency(lead.monthly_payment) : '$0.00',
    '[MATURITY_DATE]': maturityDate, '[MATURITY_MONTHS]': String(lead.maturity_months || 72),
    '[PAYMENT_START_DATE]': lead.payment_start_date || effectiveDate,
    '[CASH_AT_COE]': lead.cash_at_coe ? formatCurrency(lead.cash_at_coe) : '$0.00',
    '[DOWN_PAYMENT]': lead.down_payment ? formatCurrency(lead.down_payment) : '$0.00',
    '[INTEREST_ANNUAL]': lead.interest_annual ? formatCurrency(lead.interest_annual) : '$0.00',
    '[INTEREST_TOTAL]': lead.interest_total ? formatCurrency(lead.interest_total) : '$0.00',
    '[NON_CIRCUMVENTION_PENALTY]': lead.non_circumvention_penalty ? formatCurrency(lead.non_circumvention_penalty) : '$10,000.00',
    '[PORTFOLIO_PROPERTY_COUNT]': String(lead.portfolio_property_count || 1),
    '[PORTFOLIO_TOTAL_PRICE]': lead.portfolio_total_price ? formatCurrency(lead.portfolio_total_price) : '',
    '[PARTY_D_NAME]': lead.party_d_name || '', '[PARTY_D_EMAIL]': lead.party_d_email || '',
    '[PARTY_A_PAYOUT]': lead.party_a_payout ? formatCurrency(lead.party_a_payout) : '',
    '[PARTY_B_PAYOUT]': lead.party_b_payout ? formatCurrency(lead.party_b_payout) : '',
    '[PARTY_C_PAYOUT]': lead.party_c_payout ? formatCurrency(lead.party_c_payout) : '',
    '[PARTY_D_PAYOUT]': lead.party_d_payout ? formatCurrency(lead.party_d_payout) : '',
    '[PARTY_A_SELLER_PAYMENT]': lead.party_a_seller_payment ? formatCurrency(lead.party_a_seller_payment) : '',
    '[PARTY_A_ASSIGNMENT_FEE]': lead.party_a_assignment_fee ? formatCurrency(lead.party_a_assignment_fee) : '',
    '[PARTY_A_NAME]': lead.party_a_name || '', '[PARTY_A_EMAIL]': lead.party_a_email || '',
    '[PARTY_B_NAME]': lead.party_b_name || '', '[PARTY_B_EMAIL]': lead.party_b_email || '',
    '[PARTY_C_NAME]': lead.party_c_name || '', '[PARTY_C_EMAIL]': lead.party_c_email || '',
    '[PARTY_A_PERCENT]': String(lead.party_a_percent || 25), '[PARTY_B_PERCENT]': String(lead.party_b_percent || 25),
    '[PARTY_C_PERCENT]': String(lead.party_c_percent || 25), '[PARTY_D_PERCENT]': String(lead.party_d_percent || 25),
    '[MANAGING_PARTY]': lead.managing_party || 'Party A',
    '[CONTACT_PHONE]': lead.contact_phone || '', '[CONTACT_NAME]': lead.contact_name || '',
    '[COMPANY_NAME]': lead.company_name || 'Divinity Aligned LLC', '[COMPANY_WEBSITE]': lead.company_website || '',
    '[INITIAL_CAPITAL]': lead.initial_capital ? formatCurrency(lead.initial_capital) : '$5,000.00',
    '[MANAGER_AUTHORITY_THRESHOLD]': lead.manager_authority_threshold ? formatCurrency(lead.manager_authority_threshold) : '$2,500.00',
    '[PERSONAL_PROPERTY_INCLUDED]': lead.personal_property || 'All appliances to stay',
    '[OCCUPANCY_STATUS]': lead.occupancy_status || 'Property is leased and the tenant may continue in possession of the Property after COE unless otherwise agreed in writing.',
    '[TITLE_HOLDING_INSTRUCTIONS]': lead.title_holding_instructions || 'TBD',
    '[DEFAULT_INTEREST_RATE]': String(lead.default_interest_rate || 25),
    '[PARTY_B_DEFAULT_PERCENT]': String(lead.party_b_default_percent || 30),
    '[PARTY_C_DEFAULT_PERCENT]': String(lead.party_c_default_percent || 30),
    '[PARTY_D_DEFAULT_PERCENT]': String(lead.party_d_default_percent || 40),
    '[TITLE_HOLDING_NAME]': lead.title_holding_name || '',
    '[PARTY_A_EXPENSE]': lead.party_a_expense ? formatCurrency(lead.party_a_expense) : '$0.00',
    '[PARTY_B_EXPENSE]': lead.party_b_expense ? formatCurrency(lead.party_b_expense) : '$0.00',
    '[PARTY_C_EXPENSE]': lead.party_c_expense ? formatCurrency(lead.party_c_expense) : '$0.00',
    '[PARTY_D_EXPENSE]': lead.party_d_expense ? formatCurrency(lead.party_d_expense) : '$0.00',
    '[ADDITIONAL_TERMS]': lead.additional_terms || 'None',
    '[JV_PURPOSE]': lead.jv_purpose || 'To acquire, rehabilitate, and sell or hold for investment the Property',
    '[DATE]': effectiveDate,
  };
}

// ============================================================
// TOKEN FILLING
// ============================================================

function fillTemplate(text, mergeMap) {
  let filled = text;
  for (const [token, value] of Object.entries(mergeMap)) {
    filled = filled.split(token).join(value);
  }
  const unresolved = filled.match(/\[[A-Z_]{3,}\]/g);
  if (unresolved) {
    const real = unresolved.filter(t => t.length > 4 && !t.includes(' '));
    if (real.length > 0) {
      const missingReq = real.filter(t => REQUIRED_TOKENS.includes(t));
      const missingOpt = real.filter(t => OPTIONAL_TOKENS.includes(t));
      if (missingReq.length > 0) throw new Error(`Required merge tokens unresolved: ${[...new Set(missingReq)].join(', ')}.`);
      for (const token of [...new Set(missingOpt)]) filled = filled.split(token).join('________________');
    }
  }
  for (const req of REQUIRED_TOKENS) {
    if (!mergeMap[req] || !mergeMap[req].trim()) throw new Error(`Required merge field ${req} is empty.`);
  }
  return filled;
}

// ============================================================
// TEXT CLEANING — normalize only, never change case
// ============================================================

function cleanSourceText(text) {
  let c = text
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&#34;/g, '"');
  c = c.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/\uFFFD/g, "'").replace(/\u2013/g, '-').replace(/\u2014/g, '--').replace(/\u2026/g, '...');
  // Standardize checkboxes
  c = c.replace(/\[X\]/gi, '☑').replace(/\[ \]/g, '☐').replace(/\[\]/g, '☐').replace(/\[\s*\]/g, '☐');
  c = c.replace(/\? (?=[A-Z])/g, '☐ ').replace(/\? (?=[a-z])/g, '☐ ');
  // Normalize merge tokens: convert mixed-case [Token_Name] to [TOKEN_NAME]
  c = c.replace(/\[([A-Za-z][A-Za-z0-9_]{3,})\]/g, (match, token) => {
    const upper = token.toUpperCase();
    // Only convert if it looks like a merge token (has underscore or is known)
    if (token.includes('_') || token.includes('LOAN') || token.includes('SELLER') || token.includes('BUYER') || token.includes('PROPERTY')) {
      return '[' + upper + ']';
    }
    return match;
  });
  return c;
}

// ============================================================
// HTML ESCAPING
// ============================================================

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================================
// COVER PAGE — compact, two-column, no wasted space
// ============================================================

function buildCoverPage(lead, contractType, addenda) {
  const now = new Date().toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const txnId = 'TXN-' + Date.now().toString(36).toUpperCase();

  const strategyLabel = {
    subto: 'Subject To Acquisition', cash: 'Cash Purchase', stack50: 'Stack 50% Hybrid',
    stack10: 'Stack 10% Down', stack_interest_only: 'Stack Interest Only', stack_mfh: 'Stack Multi-Family',
    seller_finance: 'Seller Financing', commercial: 'Commercial Purchase',
    portfolio: 'Portfolio Acquisition', jv_4party: 'Joint Venture (4-Party)', jv_5party: 'Joint Venture (5-Party)',
  }[contractType] || contractType;

  const rows = [
    ['Transaction Type', strategyLabel], ['Property', lead.address || ''],
    ['Seller', lead.seller_name || ''], ['Buyer', lead.buyer_name || 'Divinity Aligned LLC'],
    ['Purchase Price', formatCurrency(lead.price || 0)], ['Earnest Money', formatCurrency(lead.emd_amount || 0)],
    ['Existing Loan Balance', lead.existing_loan_balance ? formatCurrency(lead.existing_loan_balance) : 'None'],
    ['Existing Loan Type', lead.existing_loan_type || 'N/A'],
    ['Seller Carryback', lead.seller_carryback ? formatCurrency(lead.seller_carryback) : 'None'],
    ['Monthly Payment', lead.monthly_payment ? formatCurrency(lead.monthly_payment) : 'N/A'],
    ['Maturity Date', lead.maturity_date || 'TBD'],
    ['Closing Date', lead.coe_days ? `${lead.coe_days} Days After Effective Date` : 'TBD'],
    ['Inspection Period', `${lead.inspection_period_days || 14} Days`],
    ['Escrow Company', lead.title_company || 'CLOSE Title'],
  ];

  const leftCol = rows.slice(0, 7);
  const rightCol = rows.slice(7);
  const buildCol = (col) => col.map(([k, v]) => `<tr><td class="ck">${k}</td><td class="cv">${escapeHtml(v)}</td></tr>`).join('');

  const docList = addenda.length > 0
    ? addenda.map(a => `<li>${escapeHtml(a.name)}${a.conditional ? ' <span class="cond">(conditional)</span>' : ''}</li>`).join('')
    : '';

  return `<div class="cover">
<div class="cover-header">
  <div class="cover-title">Purchase Contract Package</div>
  <div class="cover-strategy">${escapeHtml(strategyLabel)}</div>
</div>
<table class="cover-grid"><tr>
  <td style="vertical-align:top"><table class="cover-col">${buildCol(leftCol)}</table></td>
  <td style="vertical-align:top"><table class="cover-col">${buildCol(rightCol)}</table></td>
</tr></table>
<div class="cover-docs">
  <div class="cover-docs-title">Documents in This Package</div>
  <ol class="cover-docs-list">
    <li>${escapeHtml(strategyLabel)} — Purchase Agreement</li>
    ${docList}
  </ol>
</div>
<div class="cover-footer">
  <span>Generated: ${now}</span> &nbsp;|&nbsp;
  <span>Transaction ID: ${txnId}</span> &nbsp;|&nbsp;
  <span>Prepared By: Divinity CRM</span>
</div>
</div>`;
}

// ============================================================
// DOCUMENT RENDERER — preserve source text exactly
// ============================================================

function renderDocument(text, docTitle) {
  const cleaned = cleanSourceText(text);
  const escaped = escapeHtml(cleaned);

  // Split into sections: insert newlines before section numbers
  let sectioned = escaped;
  sectioned = sectioned.replace(/(\d+)\.(\d+)\s+([A-Z][A-Za-z])/g, (match, num, sub, letter) => {
    if (parseInt(num) <= 30 && parseInt(sub) <= 30) {
      return '\n' + num + '.' + sub + ' ' + letter;
    }
    return match;
  });
  sectioned = sectioned.replace(/APPROVED AND ACCEPTED/g, '\nAPPROVED AND ACCEPTED');

  const lines = sectioned.split('\n');
  const parts = [];
  let para = [];

  function flush() {
    if (para.length > 0) {
      // Wrap currency values in nowrap spans
      let ptext = para.join(' ').trim();
      ptext = ptext.replace(/\$[\d,]+\.?\d*/g, '<span class="nowrap">$&</span>');
      parts.push(`<p class="body">${ptext}</p>`);
      para = [];
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flush(); continue; }

    const isNumberedSection = /^\d+(\.\d+)*\s+/.test(trimmed);
    const isShortAllCaps = /^[A-Z][A-Z\s,.&]+$/.test(trimmed) && trimmed.length < 60 && trimmed.split(' ').length < 10;

    if (isNumberedSection || isShortAllCaps) {
      flush();
      parts.push(`<h3 class="sh">${trimmed}</h3>`);
    } else if (/Signature:|Date:|Name of Signer|Its:|Printed Name|Initials/i.test(trimmed)) {
      flush();
      parts.push(`<p class="sig">${trimmed}</p>`);
    } else if (/APPROVED AND ACCEPTED/i.test(trimmed)) {
      flush();
      parts.push(`<div class="appr"><p class="appr-h">${trimmed}</p></div>`);
    } else {
      para.push(trimmed);
    }
  }
  flush();

  return `<div class="doc"><h2 class="dt">${escapeHtml(docTitle)}</h2>${parts.join('\n')}</div>`;
}

// ============================================================
// MAIN HTML ASSEMBLY
// ============================================================

function buildPacketHtml(contractType, lead, mergeMap, documents) {
  const { getAllAddenda } = require('./contract-validation');
  const allAddenda = getAllAddenda(contractType, lead);

  const coverHtml = buildCoverPage(lead, contractType, allAddenda);

  let docsHtml = '';
  for (const doc of documents) {
    const filledText = fillTemplate(doc.text, mergeMap);
    docsHtml += renderDocument(filledText, doc.title);
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 0.9in 1in 0.9in 1.1in; }
  body {
    font-family: 'Times New Roman', Georgia, serif;
    font-size: 11.5pt; line-height: 1.45; color: #000;
    -webkit-print-color-adjust: exact;
  }

  /* Cover Page — professional law firm style */
  .cover { page-break-after: always; padding-top: 0.2in; }
  .cover-header { text-align: center; margin-bottom: 18pt; border-bottom: 2px solid #000; padding-bottom: 10pt; }
  .cover-title { font-size: 20pt; font-weight: bold; letter-spacing: 1.5pt; margin-bottom: 2pt; }
  .cover-strategy { font-size: 14pt; color: #333; margin-top: 6pt; font-weight: bold; }
  .cover-grid { width: 100%; border-collapse: collapse; margin-bottom: 14pt; }
  .cover-col { width: 100%; border-collapse: collapse; }
  .cover-col td { padding: 4pt 8pt; border-bottom: 1px solid #e0e0e0; font-size: 11.5pt; }
  .ck { font-weight: bold; color: #444; white-space: nowrap; width: 48%; }
  .cv { color: #000; }
  .cover-price-row td { font-size: 13pt; font-weight: bold; border-bottom: 2px solid #ccc; padding: 6pt 8pt; }
  .cover-docs { margin: 6pt 0 10pt 0; border-top: 1px solid #ddd; padding-top: 8pt; }
  .cover-docs-title { font-weight: bold; margin-bottom: 4pt; font-size: 11pt; }
  .cover-docs-list { margin-left: 16pt; font-size: 11pt; }
  .cover-docs-list li { margin: 2pt 0; }
  .cond { font-style: italic; color: #888; font-size: 10pt; }
  .cover-footer { margin-top: 14pt; font-size: 9pt; color: #888; border-top: 1px solid #ddd; padding-top: 6pt; text-align: center; }

  /* Documents — flow continuously, no page-break-before */
  .doc { margin-top: 20pt; }
  .doc:first-of-type { margin-top: 0; page-break-before: always; }
  .dt {
    font-size: 13pt; font-weight: bold; text-align: center;
    margin-bottom: 12pt; padding-bottom: 4pt; border-bottom: 1px solid #999;
  }
  .sh {
    font-size: 11.5pt; font-weight: bold; margin: 10pt 0 3pt 0;
    page-break-after: avoid;
  }
  .body {
    margin: 0 0 6pt 0; text-align: justify; orphans: 2; widows: 2;
  }
  .sig { margin: 4pt 0; }
  .appr { margin-top: 14pt; border-top: 1px solid #999; padding-top: 6pt; page-break-inside: avoid; }
  .appr-h { font-weight: bold; margin-bottom: 4pt; text-transform: none; }
  .nowrap { white-space: nowrap; }
</style>
</head>
<body>
${coverHtml}
${docsHtml}
</body>
</html>`;
}

// ============================================================
// PDF RENDERING
// ============================================================

function htmlToPdf(html, edgePath) {
  const browser = edgePath || findEdge();
  if (!browser) throw new Error('No browser found for PDF rendering.');
  const tmpHtml = path.join(require('os').tmpdir(), `contract_${Date.now()}.html`);
  const tmpPdf = path.join(require('os').tmpdir(), `contract_${Date.now()}.pdf`);
  fs.writeFileSync(tmpHtml, html, 'utf8');
  try {
    execFileSync(browser, [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--print-to-pdf=' + tmpPdf, '--no-pdf-header-footer',
      'file:///' + tmpHtml.replace(/\\/g, '/'),
    ], { timeout: 30000, stdio: 'pipe' });
    if (!fs.existsSync(tmpPdf)) throw new Error('PDF output not created');
    const pdfBuffer = fs.readFileSync(tmpPdf);
    try { fs.unlinkSync(tmpHtml); } catch (e) {}
    try { fs.unlinkSync(tmpPdf); } catch (e) {}
    return pdfBuffer;
  } catch (err) {
    try { fs.unlinkSync(tmpHtml); } catch (e) {}
    try { fs.unlinkSync(tmpPdf); } catch (e) {}
    throw new Error(`PDF rendering failed: ${err.message}`);
  }
}

// ============================================================
// MAIN
// ============================================================

function generateFilledPdf(contractType, lead) {
  contractLibrary.assertSupported(contractType);
  const mergeMap = buildMergeMap(lead);
  const { getAllAddenda } = require('./contract-validation');
  const allAddenda = getAllAddenda(contractType, lead);
  const masterText = contractLibrary.getTemplateText(contractType);
  const masterTitle = contractType.toUpperCase().replace(/_/g, ' ') + ' — Purchase Agreement';
  const documents = [
    { title: masterTitle, text: masterText },
    ...allAddenda.map(a => ({ title: a.name, text: a.text })),
  ];
  const html = buildPacketHtml(contractType, lead, mergeMap, documents);
  const edgePath = process.env.BROWSER_PATH || findEdge();
  return htmlToPdf(html, edgePath);
}

function saveFilledPdf(contractType, lead, outputPath) {
  const pdfBuffer = generateFilledPdf(contractType, lead);
  fs.writeFileSync(outputPath, pdfBuffer);
  return { path: outputPath, size: pdfBuffer.length, bytes: pdfBuffer.length };
}

module.exports = {
  generateFilledPdf, saveFilledPdf, fillTemplate, buildMergeMap,
  findEdge, REQUIRED_TOKENS, OPTIONAL_TOKENS,
  cleanSourceText, escapeHtml, renderDocument, buildPacketHtml,
};