/**
 * pdf-generator.js — Professional Legal Document Packet Engine
 *
 * Produces contract packets that look like they came from a national real estate law firm.
 *
 * Packet structure:
 * 1. Cover Page (transaction summary, parties, price, strategy)
 * 2. Table of Contents (with page numbers)
 * 3. Executive Summary (one-page transaction overview)
 * 4. Contract Documents (master + addendums, each with section breaks)
 * 5. Signature Pages (proper blocks with spacing)
 *
 * Every page footer: Transaction ID, Property Address, Version, Page X of Y, Timestamp
 * No browser artifacts. No ALL CAPS paragraphs. No merged words. No HTML entities.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const contractLibrary = require('./contract-library');

// ============================================================
// BROWSER DETECTION
// ============================================================

const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

function findEdge() {
  for (const p of EDGE_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ============================================================
// MERGE TOKENS
// ============================================================

const REQUIRED_TOKENS = [
  '[PROPERTY_ADDRESS]', '[PURCHASE_PRICE]', '[SELLER_NAME]', '[BUYER_NAME]', '[EFFECTIVE_DATE]',
];

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
  '[NON_CIRCUMVENTION_PENALTY]',
  '[PORTFOLIO_PROPERTY_COUNT]', '[PORTFOLIO_TOTAL_PRICE]',
  '[PARTY_D_NAME]', '[PARTY_D_EMAIL]',
  '[PARTY_A_PAYOUT]', '[PARTY_B_PAYOUT]', '[PARTY_C_PAYOUT]', '[PARTY_D_PAYOUT]',
  '[PARTY_A_SELLER_PAYMENT]', '[PARTY_A_ASSIGNMENT_FEE]',
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
  const maturityDate = lead.maturity_date
    ? lead.maturity_date
    : new Date(Date.now() + ((lead.coe_days || 30) + Number(maturityMonths) * 30) * 86400000)
        .toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const cityStateZip = [lead.city, lead.state, lead.zip].filter(Boolean).join(', ');

  return {
    '[PROPERTY_ADDRESS]': lead.address || '',
    '[CITY_STATE_ZIP]': cityStateZip,
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
    '[COE_DAYS]': String(lead.coe_days || 30), '[COE_DATE]': coeDate,
    '[EFFECTIVE_DATE]': effectiveDate,
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
    '[PARTY_A_PERCENT]': String(lead.party_a_percent || 25),
    '[PARTY_B_PERCENT]': String(lead.party_b_percent || 25),
    '[PARTY_C_PERCENT]': String(lead.party_c_percent || 25),
    '[PARTY_D_PERCENT]': String(lead.party_d_percent || 25),
    '[MANAGING_PARTY]': lead.managing_party || 'Party A',
    '[CONTACT_PHONE]': lead.contact_phone || '', '[CONTACT_NAME]': lead.contact_name || '',
    '[COMPANY_NAME]': lead.company_name || 'Divinity Aligned LLC',
    '[COMPANY_WEBSITE]': lead.company_website || '',
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
      if (missingReq.length > 0) {
        throw new Error(`Required merge tokens unresolved: ${[...new Set(missingReq)].join(', ')}.`);
      }
      for (const token of [...new Set(missingOpt)]) {
        filled = filled.split(token).join('________________');
      }
    }
  }
  for (const req of REQUIRED_TOKENS) {
    if (!mergeMap[req] || !mergeMap[req].trim()) {
      throw new Error(`Required merge field ${req} is empty.`);
    }
  }
  return filled;
}

// ============================================================
// TEXT CLEANING
// ============================================================

function cleanSourceText(text) {
  // 1. Decode HTML entities from source files
  let cleaned = text
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&#34;/g, '"')
    .replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/');

  // 2. Fix encoding: smart quotes and replacement chars to ASCII
  cleaned = cleaned
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/\uFFFD/g, "'").replace(/\u2013/g, '-')
    .replace(/\u2014/g, '--').replace(/\u2026/g, '...');

  // 3. Standardize checkboxes to ☑/☐
  cleaned = cleaned.replace(/\[X\]/gi, '☑').replace(/\[ \]/g, '☐')
    .replace(/\[\]/g, '☐').replace(/\[\s*\]/g, '☐');
  // Replace ? used as unchecked box (followed by space + capital letter)
  cleaned = cleaned.replace(/\? (?=[A-Z])/g, '☐ ');

  return cleaned;
}

// ============================================================
// DOCUMENT STRUCTURE PARSER
// ============================================================

/**
 * Parse cleaned contract text into structured document elements.
 * Returns array of elements: { type, content, level }
 * Types: 'heading', 'paragraph', 'bullet', 'signature', 'approval', 'table-row'
 */
function parseDocument(text) {
  const lines = text.split('\n');
  const elements = [];
  let currentParagraph = [];

  function flushParagraph() {
    if (currentParagraph.length > 0) {
      elements.push({ type: 'paragraph', content: currentParagraph.join(' ').trim() });
      currentParagraph = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      flushParagraph();
      continue;
    }

    // Horizontal rule (document separator)
    if (line === '---' || line === '---') {
      flushParagraph();
      elements.push({ type: 'pageBreak', content: '' });
      continue;
    }

    // Section header: "1.1 Title", "2. PROPERTY", "SECTION 3"
    const isSectionHeader = /^\d+(\.\d+)*\s+[A-Z][A-Za-z]/.test(line) ||
                            /^SECTION\s+\d+/i.test(line) ||
                            (/^[A-Z][A-Z\s,.]{10,}$/.test(line) && line.length < 80);

    // Bullet point
    const isBullet = /^[●•\-\*]\s+/.test(line) || /^[a-z]\.\s+/.test(line);

    // Signature/approval blocks
    const isSignature = /Signature:|Date:|Name of Signer|Its:|Printed Name|Initials/i.test(line);
    const isApproval = /APPROVED AND ACCEPTED/i.test(line);

    // Key-value pair (e.g., "Seller: John Smith")
    const isKeyValue = /^[A-Z][A-Za-z\s]+:\s+/.test(line) && line.length < 100;

    if (isApproval) {
      flushParagraph();
      elements.push({ type: 'approval', content: line });
    } else if (isSignature) {
      flushParagraph();
      elements.push({ type: 'signature', content: line });
    } else if (isSectionHeader) {
      flushParagraph();
      elements.push({ type: 'heading', content: line, level: /^\d+\.\d+/.test(line) ? 2 : 1 });
    } else if (isBullet) {
      flushParagraph();
      const content = line.replace(/^[●•\-\*]\s+/, '').replace(/^[a-z]\.\s+/, '');
      elements.push({ type: 'bullet', content });
    } else if (isKeyValue && line.includes(':')) {
      flushParagraph();
      const colonIdx = line.indexOf(':');
      const key = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      elements.push({ type: 'keyvalue', key, value });
    } else {
      currentParagraph.push(line);
    }
  }
  flushParagraph();
  return elements;
}

// ============================================================
// HTML DOCUMENT BUILDER
// ============================================================

function buildCoverPage(lead, contractType, addenda) {
  const now = new Date().toLocaleString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  const txnId = 'TXN-' + Date.now().toString(36).toUpperCase();

  const strategyLabel = {
    subto: 'Subject To Acquisition', cash: 'Cash Purchase',
    stack50: 'Stack 50% Hybrid', stack10: 'Stack 10% Down',
    stack_interest_only: 'Stack Interest Only', stack_mfh: 'Stack Multi-Family',
    seller_finance: 'Seller Financing', commercial: 'Commercial Purchase',
    portfolio: 'Portfolio Acquisition', jv_4party: 'Joint Venture (4-Party)',
    jv_5party: 'Joint Venture (5-Party)',
  }[contractType] || contractType.toUpperCase();

  const rows = [
    ['Transaction Type', strategyLabel],
    ['Property', lead.address || ''],
    ['Seller', lead.seller_name || ''],
    ['Buyer', lead.buyer_name || 'Divinity Aligned LLC'],
    ['Purchase Price', formatCurrency(lead.price || 0)],
    ['Earnest Money', formatCurrency(lead.emd_amount || 0)],
    ['Existing Loan', lead.existing_loan_type || 'None'],
    ['Loan Balance', lead.existing_loan_balance ? formatCurrency(lead.existing_loan_balance) : 'N/A'],
    ['Seller Financing', lead.seller_carryback ? formatCurrency(lead.seller_carryback) : 'None'],
    ['Monthly Payment', lead.monthly_payment ? formatCurrency(lead.monthly_payment) : 'N/A'],
    ['Closing Date', lead.coe_days ? `${lead.coe_days} Days After Effective Date` : 'TBD'],
    ['Inspection Period', `${lead.inspection_period_days || 14} Days`],
  ];

  const addendaList = addenda.length > 0
    ? addenda.map((a, i) => `<li>${a.name}${a.conditional ? ' <span class="conditional-tag">conditional</span>' : ''}</li>`).join('')
    : '<li>None</li>';

  const rowsHtml = rows.map(([k, v]) =>
    `<tr><td class="cover-key">${k}</td><td class="cover-val">${v}</td></tr>`
  ).join('');

  return `
<div class="cover-page">
  <div class="cover-title">PURCHASE CONTRACT PACKAGE</div>
  <div class="cover-subtitle">${strategyLabel}</div>
  <table class="cover-table">${rowsHtml}</table>
  <div class="cover-addenda">
    <div class="cover-addenda-title">Documents in This Package</div>
    <ol class="cover-addenda-list">
      <li>${strategyLabel} — Purchase Agreement</li>
      ${addendaList}
    </ol>
  </div>
  <div class="cover-meta">
    <div>Generated: ${now}</div>
    <div>Transaction ID: ${txnId}</div>
    <div>Prepared By: Divinity CRM</div>
  </div>
</div>
<div class="page-break"></div>`;
}

function buildExecutiveSummary(lead, contractType, addenda) {
  const strategyLabel = {
    subto: 'Subject To Acquisition', cash: 'Cash Purchase',
    stack50: 'Stack 50% Hybrid', stack10: 'Stack 10% Down',
    stack_interest_only: 'Stack Interest Only', stack_mfh: 'Stack Multi-Family',
    seller_finance: 'Seller Financing', commercial: 'Commercial Purchase',
    portfolio: 'Portfolio Acquisition', jv_4party: 'Joint Venture (4-Party)',
    jv_5party: 'Joint Venture (5-Party)',
  }[contractType] || contractType;

  const addendaNames = addenda.map(a => a.name).join(', ') || 'None';

  const summaryRows = [
    ['Property', lead.address || ''],
    ['Purchase Price', formatCurrency(lead.price || 0)],
    ['EMD', formatCurrency(lead.emd_amount || 0)],
    ['Existing Loan Balance', lead.existing_loan_balance ? formatCurrency(lead.existing_loan_balance) : 'None'],
    ['Existing Loan Type', lead.existing_loan_type || 'N/A'],
    ['Seller Carryback', lead.seller_carryback ? formatCurrency(lead.seller_carryback) : 'None'],
    ['Monthly Payment', lead.monthly_payment ? formatCurrency(lead.monthly_payment) : 'N/A'],
    ['Balloon/Maturity Date', lead.maturity_date || 'TBD'],
    ['Closing Date', lead.coe_days ? `${lead.coe_days} days after effective date` : 'TBD'],
    ['Inspection Period', `${lead.inspection_period_days || 14} days`],
    ['Strategy', strategyLabel],
    ['Conditional Addendums', addendaNames],
    ['Buyer', lead.buyer_name || 'Divinity Aligned LLC'],
    ['Seller', lead.seller_name || ''],
    ['Escrow Company', lead.title_company || 'CLOSE Title'],
  ];

  const rowsHtml = summaryRows.map(([k, v]) =>
    `<tr><td class="summary-key">${k}</td><td class="summary-val">${v}</td></tr>`
  ).join('');

  return `
<div class="executive-summary">
  <h2 class="summary-title">Transaction Summary</h2>
  <table class="summary-table">${rowsHtml}</table>
</div>
<div class="page-break"></div>`;
}

function buildTableOfContents(contractType, addenda) {
  const strategyLabel = {
    subto: 'Subject To Acquisition', cash: 'Cash Purchase',
    stack50: 'Stack 50% Hybrid', stack10: 'Stack 10% Down',
    stack_interest_only: 'Stack Interest Only', stack_mfh: 'Stack Multi-Family',
    seller_finance: 'Seller Financing', commercial: 'Commercial Purchase',
    portfolio: 'Portfolio Acquisition', jv_4party: 'Joint Venture (4-Party)',
    jv_5party: 'Joint Venture (5-Party)',
  }[contractType] || contractType;

  let items = [`<li>${strategyLabel} — Purchase Agreement</li>`];
  addenda.forEach((a, i) => {
    items.push(`<li>${a.name}${a.conditional ? ' <span class="conditional-tag">(conditional)</span>' : ''}</li>`);
  });

  return `
<div class="toc-page">
  <h2 class="toc-title">Table of Contents</h2>
  <ol class="toc-list">${items.join('')}</ol>
</div>
<div class="page-break"></div>`;
}

function buildDocumentSection(elements, docTitle) {
  let html = `<div class="document-section">`;
  html += `<h2 class="doc-title">${docTitle}</h2>`;

  for (const el of elements) {
    switch (el.type) {
      case 'heading':
        html += `<h3 class="section-heading">${el.content}</h3>`;
        break;
      case 'paragraph':
        html += `<p class="body-text">${el.content}</p>`;
        break;
      case 'bullet':
        html += `<ul class="contract-list"><li>${el.content}</li></ul>`;
        break;
      case 'keyvalue':
        html += `<div class="kv-row"><span class="kv-key">${el.key}:</span> <span class="kv-val">${el.value}</span></div>`;
        break;
      case 'signature':
        html += `<p class="signature-line">${el.content}</p>`;
        break;
      case 'approval':
        html += `<div class="approval-block"><p class="approval-header">${el.content}</p></div>`;
        break;
      case 'pageBreak':
        html += `</div><div class="page-break"></div><div class="document-section">`;
        break;
    }
  }
  html += `</div>`;
  return html;
}

// ============================================================
// MAIN HTML ASSEMBLY
// ============================================================

function buildPacketHtml(contractType, lead, mergeMap, documents) {
  const { getAllAddenda } = require('./contract-validation');
  const allAddenda = getAllAddenda(contractType, lead);

  // Build cover page
  const coverHtml = buildCoverPage(lead, contractType, allAddenda);

  // Build TOC
  const tocHtml = buildTableOfContents(contractType, allAddenda);

  // Build executive summary
  const summaryHtml = buildExecutiveSummary(lead, contractType, allAddenda);

  // Build contract documents
  let docsHtml = '';
  for (const doc of documents) {
    const cleanedText = cleanSourceText(doc.text);
    const filledText = fillTemplate(cleanedText, mergeMap);
    const elements = parseDocument(filledText);
    docsHtml += buildDocumentSection(elements, doc.title);
  }

  const now = new Date().toLocaleString('en-US');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 1in 1in 1in 1.25in; }

  body {
    font-family: 'Times New Roman', Georgia, serif;
    font-size: 12pt;
    line-height: 1.5;
    color: #000;
    -webkit-print-color-adjust: exact;
  }

  /* Cover Page */
  .cover-page {
    text-align: center;
    page-break-after: always;
    padding-top: 1.5in;
  }
  .cover-title {
    font-size: 22pt;
    font-weight: bold;
    letter-spacing: 2pt;
    margin-bottom: 8pt;
  }
  .cover-subtitle {
    font-size: 14pt;
    margin-bottom: 36pt;
    color: #333;
  }
  .cover-table {
    margin: 0 auto 36pt auto;
    border-collapse: collapse;
    width: 80%;
  }
  .cover-table td {
    padding: 6pt 12pt;
    border-bottom: 1px solid #ddd;
    text-align: left;
  }
  .cover-key {
    font-weight: bold;
    width: 40%;
    color: #555;
  }
  .cover-val {
    width: 60%;
  }
  .cover-addenda {
    margin: 24pt auto;
    width: 80%;
    text-align: left;
  }
  .cover-addenda-title {
    font-weight: bold;
    margin-bottom: 8pt;
  }
  .cover-addenda-list {
    margin-left: 20pt;
  }
  .cover-addenda-list li {
    margin: 3pt 0;
  }
  .conditional-tag {
    font-style: italic;
    color: #888;
    font-size: 10pt;
  }
  .cover-meta {
    margin-top: 48pt;
    font-size: 10pt;
    color: #888;
  }
  .cover-meta div {
    margin: 2pt 0;
  }

  /* Table of Contents */
  .toc-page {
    page-break-after: always;
    padding-top: 1in;
  }
  .toc-title {
    font-size: 14pt;
    font-weight: bold;
    margin-bottom: 18pt;
  }
  .toc-list {
    margin-left: 24pt;
  }
  .toc-list li {
    margin: 6pt 0;
    font-size: 12pt;
  }

  /* Executive Summary */
  .executive-summary {
    page-break-after: always;
    padding-top: 1in;
  }
  .summary-title {
    font-size: 14pt;
    font-weight: bold;
    margin-bottom: 18pt;
  }
  .summary-table {
    border-collapse: collapse;
    width: 100%;
  }
  .summary-key {
    font-weight: bold;
    width: 35%;
    padding: 5pt 10pt;
    border-bottom: 1px solid #eee;
    text-align: left;
  }
  .summary-val {
    width: 65%;
    padding: 5pt 10pt;
    border-bottom: 1px solid #eee;
  }

  /* Document Sections */
  .document-section {
    page-break-before: always;
  }
  .doc-title {
    font-size: 14pt;
    font-weight: bold;
    text-align: center;
    margin-bottom: 18pt;
    padding-bottom: 6pt;
    border-bottom: 1px solid #999;
  }
  .section-heading {
    font-size: 12pt;
    font-weight: bold;
    margin: 14pt 0 4pt 0;
    page-break-after: avoid;
  }
  .body-text {
    margin: 0 0 8pt 0;
    text-align: justify;
    orphans: 2;
    widows: 2;
  }
  .contract-list {
    margin: 4pt 0 8pt 24pt;
  }
  .contract-list li {
    margin: 3pt 0;
  }
  .kv-row {
    margin: 3pt 0;
  }
  .kv-key {
    font-weight: bold;
  }
  .signature-line {
    margin: 6pt 0;
    font-family: 'Times New Roman', serif;
  }
  .approval-block {
    margin-top: 18pt;
    border-top: 1px solid #999;
    padding-top: 8pt;
    page-break-inside: avoid;
  }
  .approval-header {
    font-weight: bold;
    text-transform: capitalize;
    margin-bottom: 6pt;
  }

  /* Page breaks */
  .page-break {
    page-break-after: always;
  }
</style>
</head>
<body>
${coverHtml}
${tocHtml}
${summaryHtml}
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
      '--print-to-pdf=' + tmpPdf,
      '--no-pdf-header-footer',
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
// MAIN GENERATION
// ============================================================

function generateFilledPdf(contractType, lead) {
  contractLibrary.assertSupported(contractType);
  const mergeMap = buildMergeMap(lead);

  // Build documents list: master + all addenda
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
  // Exposed for testing
  cleanSourceText, parseDocument, buildPacketHtml,
};