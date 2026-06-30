/**
 * pdf-generator.js — Production-grade contract PDF generation
 *
 * Architecture:
 * 1. Read .txt master from src/assets/contracts/
 * 2. Replace merge tokens with lead data (validated by contract-validation.js)
 * 3. Convert to professional-styled HTML (legal document formatting)
 * 4. Render to PDF via headless Edge (Chromium)
 * 5. Return PDF buffer
 *
 * PDF styling follows legal document conventions:
 * - Times New Roman 12pt body, 14pt headings
 * - 1-inch margins, 1.5 line height
 * - Justified body text, centered title
 * - Bold section headers, proper indentation
 * - Signature blocks with spacing and lines
 * - Page breaks before signature pages
 * - No headers/footers (clean document)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const contractLibrary = require('./contract-library');

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
  try {
    const { execSync } = require('child_process');
    const found = execSync('where msedge 2>nul || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null', { encoding: 'utf8', shell: true }).trim().split('\n')[0];
    if (found && fs.existsSync(found)) return found;
  } catch (e) { /* ignore */ }
  return null;
}

// ============================================================
// MERGE TOKENS
// ============================================================

const REQUIRED_TOKENS = [
  '[PROPERTY_ADDRESS]',
  '[PURCHASE_PRICE]',
  '[SELLER_NAME]',
  '[BUYER_NAME]',
  '[EFFECTIVE_DATE]',
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
  '[MANAGING_PARTY]',
  '[CONTACT_PHONE]', '[CONTACT_NAME]',
  '[COMPANY_NAME]', '[COMPANY_WEBSITE]',
  '[INITIAL_CAPITAL]', '[MANAGER_AUTHORITY_THRESHOLD]',
  '[TITLE_WEBSITE]', '[PERSONAL_PROPERTY_INCLUDED]', '[OCCUPANCY_STATUS]',
  '[TITLE_HOLDING_INSTRUCTIONS]', '[DEFAULT_INTEREST_RATE]',
  '[PARTY_B_DEFAULT_PERCENT]', '[PARTY_C_DEFAULT_PERCENT]', '[PARTY_D_DEFAULT_PERCENT]',
  '[TITLE_HOLDING_NAME]', '[PARTY_A_EXPENSE]', '[PARTY_B_EXPENSE]', '[PARTY_C_EXPENSE]', '[PARTY_D_EXPENSE]',
  '[ADDITIONAL_TERMS]', '[JV_PURPOSE]',
  '[DATE]',
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
    '[PROPERTY_CITY]': lead.city || '',
    '[PROPERTY_STATE]': lead.state || '',
    '[PROPERTY_ZIP]': lead.zip || '',
    '[APN]': lead.apn || 'To be provided by Escrow Agent',
    '[PURCHASE_PRICE]': lead.price ? formatCurrency(lead.price) : '',
    '[EMD_AMOUNT]': formatCurrency(lead.emd_amount || 500),
    '[EXISTING_LOAN_BALANCE]': lead.existing_loan_balance ? formatCurrency(lead.existing_loan_balance) : '$0.00',
    '[EXISTING_LOAN_LENDER]': lead.existing_loan_type || '',
    '[EXISTING_LOAN_PAYMENT]': lead.existing_loan_payment ? formatCurrency(lead.existing_loan_payment) : 'TBD',
    '[SELLER_NAME]': lead.seller_name || '',
    '[SELLER_EMAIL]': lead.seller_email || '',
    '[SELLER_PHONE]': lead.seller_phone || '',
    '[SELLER_ADDRESS]': lead.seller_address || '',
    '[SELLER_COMPANY]': lead.seller_company || '',
    '[BUYER_NAME]': lead.buyer_name || 'Divinity Aligned LLC',
    '[BUYER_EMAIL]': lead.buyer_email || 'montelliscottrei@gmail.com',
    '[BUYER_PHONE]': lead.buyer_phone || '',
    '[BUYER_ADDRESS]': lead.buyer_address || '',
    '[BUYER_COMPANY]': lead.buyer_company || 'Divinity Aligned LLC',
    '[INSPECTION_DAYS]': String(lead.inspection_period_days || 14),
    '[COE_DAYS]': String(lead.coe_days || 30),
    '[COE_DATE]': coeDate,
    '[EFFECTIVE_DATE]': effectiveDate,
    '[TITLE_COMPANY]': lead.title_company || 'CLOSE Title',
    '[TITLE_EMAIL]': lead.title_email || 'Orders@closedtitle.com',
    '[TITLE_PHONE]': lead.title_phone || '800-405-7150',
    '[TITLE_WEBSITE]': lead.title_website || '',
    '[SELLER_CARRYBACK]': lead.seller_carryback ? formatCurrency(lead.seller_carryback) : '$0.00',
    '[SELLER_CARRYBACK_RATE]': lead.seller_carryback_rate ? `${(lead.seller_carryback_rate * 100).toFixed(2)}%` : '0%',
    '[MONTHLY_PAYMENT]': lead.monthly_payment ? formatCurrency(lead.monthly_payment) : '$0.00',
    '[MATURITY_DATE]': maturityDate,
    '[MATURITY_MONTHS]': String(lead.maturity_months || 72),
    '[PAYMENT_START_DATE]': lead.payment_start_date || effectiveDate,
    '[CASH_AT_COE]': lead.cash_at_coe ? formatCurrency(lead.cash_at_coe) : '$0.00',
    '[DOWN_PAYMENT]': lead.down_payment ? formatCurrency(lead.down_payment) : '$0.00',
    '[INTEREST_ANNUAL]': lead.interest_annual ? formatCurrency(lead.interest_annual) : '$0.00',
    '[INTEREST_TOTAL]': lead.interest_total ? formatCurrency(lead.interest_total) : '$0.00',
    '[NON_CIRCUMVENTION_PENALTY]': lead.non_circumvention_penalty ? formatCurrency(lead.non_circumvention_penalty) : '$10,000.00',
    '[PORTFOLIO_PROPERTY_COUNT]': String(lead.portfolio_property_count || 1),
    '[PORTFOLIO_TOTAL_PRICE]': lead.portfolio_total_price ? formatCurrency(lead.portfolio_total_price) : '',
    '[PARTY_D_NAME]': lead.party_d_name || '',
    '[PARTY_D_EMAIL]': lead.party_d_email || '',
    '[PARTY_A_PAYOUT]': lead.party_a_payout ? formatCurrency(lead.party_a_payout) : '',
    '[PARTY_B_PAYOUT]': lead.party_b_payout ? formatCurrency(lead.party_b_payout) : '',
    '[PARTY_C_PAYOUT]': lead.party_c_payout ? formatCurrency(lead.party_c_payout) : '',
    '[PARTY_D_PAYOUT]': lead.party_d_payout ? formatCurrency(lead.party_d_payout) : '',
    '[PARTY_A_SELLER_PAYMENT]': lead.party_a_seller_payment ? formatCurrency(lead.party_a_seller_payment) : '',
    '[PARTY_A_ASSIGNMENT_FEE]': lead.party_a_assignment_fee ? formatCurrency(lead.party_a_assignment_fee) : '',
    '[PARTY_A_NAME]': lead.party_a_name || '',
    '[PARTY_A_EMAIL]': lead.party_a_email || '',
    '[PARTY_B_NAME]': lead.party_b_name || '',
    '[PARTY_B_EMAIL]': lead.party_b_email || '',
    '[PARTY_C_NAME]': lead.party_c_name || '',
    '[PARTY_C_EMAIL]': lead.party_c_email || '',
    '[PARTY_A_PERCENT]': String(lead.party_a_percent || 25),
    '[PARTY_B_PERCENT]': String(lead.party_b_percent || 25),
    '[PARTY_C_PERCENT]': String(lead.party_c_percent || 25),
    '[PARTY_D_PERCENT]': String(lead.party_d_percent || 25),
    '[MANAGING_PARTY]': lead.managing_party || 'Party A',
    '[CONTACT_PHONE]': lead.contact_phone || '',
    '[CONTACT_NAME]': lead.contact_name || '',
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
    const realUnresolved = unresolved.filter(t => t.length > 4 && !t.includes(' '));
    if (realUnresolved.length > 0) {
      const missingRequired = realUnresolved.filter(t => REQUIRED_TOKENS.includes(t));
      const missingOptional = realUnresolved.filter(t => OPTIONAL_TOKENS.includes(t));

      if (missingRequired.length > 0) {
        throw new Error(
          `Required merge tokens unresolved: ${[...new Set(missingRequired)].join(', ')}. ` +
          `Lead data missing — fix the lead record before sending.`
        );
      }

      for (const token of [...new Set(missingOptional)]) {
        filled = filled.split(token).join('________________');
      }
    }
  }

  for (const req of REQUIRED_TOKENS) {
    const value = mergeMap[req];
    if (!value || value.trim() === '') {
      throw new Error(
        `Required merge field ${req} is empty. Cannot generate contract without this field. ` +
        `Lead data missing — fix the lead record before sending.`
      );
    }
  }

  return filled;
}

// ============================================================
// PROFESSIONAL HTML GENERATION
// ============================================================

/**
 * Convert plain text contract to professional-styled HTML for PDF rendering.
 * Follows legal document formatting conventions.
 */
function textToHtml(text, title) {
  // Escape HTML special chars first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Convert checkbox markers to proper Unicode
  html = html.replace(/\[X\]/g, '☑');
  html = html.replace(/\[ \]/g, '☐');
  html = html.replace(/\[\]/g, '☐');
  html = html.replace(/\? /g, '☐ ');

  // Normalize whitespace: collapse multiple spaces (but preserve indentation)
  html = html.replace(/  +/g, ' ');

  // Split into lines for processing
  const lines = html.split('\n');
  const htmlParts = [];
  let inParagraph = false;
  let inList = false;
  let prevWasSectionHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (inParagraph) {
        htmlParts.push('</p>');
        inParagraph = false;
      }
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      continue;
    }

    // Detect section headers: "1.1 Title", "SECTION 3", "2. PROPERTY"
    const isSectionHeader = /^\d+(\.\d+)*\s+[A-Z][A-Za-z]/.test(trimmed) ||
                             /^SECTION\s+\d+/i.test(trimmed) ||
                             /^[A-Z][A-Z\s]{10,}$/.test(trimmed);

    // Detect bullet points: "●", "*", "•", "-", "1.", "a."
    const isBullet = /^[●•\-\*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed) || /^[a-z]\.\s+/.test(trimmed);

    // Detect signature blocks
    const isSignatureBlock = /Signature:|Date:|Name of Signer|Its:|Printed Name|Seller Initials|Buyer Initials|Parties' Initials/i.test(trimmed);

    // Detect "APPROVED AND ACCEPTED" blocks
    const isApprovalBlock = /APPROVED AND ACCEPTED/i.test(trimmed);

    if (isApprovalBlock) {
      if (inParagraph) { htmlParts.push('</p>'); inParagraph = false; }
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      htmlParts.push('<div class="approval-block">');
      htmlParts.push(`<p class="approval-header">${trimmed}</p>`);
      continue;
    }

    // Close approval block when we hit a signature line or another approval header
    if (htmlParts.length > 0 && htmlParts[htmlParts.length - 1] !== '</div>' &&
        (isSignatureBlock && !isApprovalBlock)) {
      // Check if we're inside an approval block
      const lastApprovalOpen = htmlParts.lastIndexOf('<div class="approval-block">');
      const lastApprovalClose = htmlParts.lastIndexOf('</div>');
      if (lastApprovalOpen > lastApprovalClose) {
        // Still inside approval block — add signature line
        htmlParts.push(`<p class="signature-line">${trimmed}</p>`);
        continue;
      }
    }

    if (isSectionHeader && !isBullet) {
      if (inParagraph) { htmlParts.push('</p>'); inParagraph = false; }
      if (inList) { htmlParts.push('</ul>'); inList = false; }

      // Add page-break-before for major sections (numbered like "2.", "3.", etc.)
      const majorSection = /^\d+\.\s+[A-Z]/.test(trimmed);
      if (majorSection && i > 0) {
        // Don't force page break — let CSS handle orphan control
      }

      htmlParts.push(`<h2>${trimmed}</h2>`);
      prevWasSectionHeader = true;
    } else if (isBullet) {
      if (inParagraph) { htmlParts.push('</p>'); inParagraph = false; }
      if (!inList) {
        htmlParts.push('<ul class="contract-list">');
        inList = true;
      }
      const bulletContent = trimmed.replace(/^[●•\-\*]\s+/, '').replace(/^\d+\.\s+/, '').replace(/^[a-z]\.\s+/, '');
      htmlParts.push(`<li>${bulletContent}</li>`);
      prevWasSectionHeader = false;
    } else if (isSignatureBlock) {
      if (inParagraph) { htmlParts.push('</p>'); inParagraph = false; }
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      htmlParts.push(`<p class="signature-line">${trimmed}</p>`);
      prevWasSectionHeader = false;
    } else {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      if (!inParagraph) {
        htmlParts.push('<p>');
        inParagraph = true;
      }
      // Bold inline section references like "1.5" at start of line
      const withBold = trimmed.replace(/^(\d+\.\d+)\s+([A-Z][A-Za-z\s]+:)/, '<strong>$1 $2</strong>');
      htmlParts.push(`${withBold} `);
      prevWasSectionHeader = false;
    }
  }

  if (inParagraph) htmlParts.push('</p>');
  if (inList) htmlParts.push('</ul>');
  // Close any open approval blocks
  const lastApprovalOpen = htmlParts.lastIndexOf('<div class="approval-block">');
  const lastDivClose = htmlParts.lastIndexOf('</div>');
  if (lastApprovalOpen > lastDivClose) htmlParts.push('</div>');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {
    margin: 1in 1in 1in 1.25in;
    @bottom-center {
      content: "Page " counter(page) " of " counter(pages);
      font-family: 'Times New Roman', Georgia, serif;
      font-size: 9pt;
      color: #666;
    }
  }
  body {
    font-family: 'Times New Roman', Georgia, serif;
    font-size: 12pt;
    line-height: 1.5;
    color: #000;
    text-align: justify;
    -webkit-print-color-adjust: exact;
  }
  h1 {
    font-size: 14pt;
    text-align: center;
    text-transform: uppercase;
    font-weight: bold;
    letter-spacing: 1.5pt;
    margin: 0 0 6pt 0;
    padding-bottom: 8pt;
    border-bottom: 2px solid #000;
  }
  h2 {
    font-size: 12pt;
    font-weight: bold;
    margin: 14pt 0 4pt 0;
    text-align: left;
    page-break-after: avoid;
    page-break-inside: avoid;
  }
  h3 {
    font-size: 12pt;
    font-weight: bold;
    margin: 10pt 0 3pt 0;
    text-align: left;
  }
  p {
    margin: 0 0 6pt 0;
    text-align: justify;
    orphans: 2;
    widows: 2;
  }
  p.signature-line {
    margin: 4pt 0;
    text-align: left;
    font-family: 'Times New Roman', Georgia, serif;
  }
  p.approval-header {
    font-weight: bold;
    text-transform: uppercase;
    margin: 16pt 0 6pt 0;
    text-align: left;
    border-top: 1px solid #000;
    padding-top: 8pt;
  }
  .approval-block {
    page-break-inside: avoid;
    margin-top: 12pt;
  }
  ul.contract-list {
    margin: 4pt 0 8pt 0;
    padding-left: 24pt;
    list-style-type: disc;
  }
  ul.contract-list li {
    margin: 2pt 0;
    text-align: left;
  }
  strong {
    font-weight: bold;
  }
  hr {
    border: none;
    border-top: 1px solid #999;
    margin: 20pt 0;
  }
  /* Prevent orphan headings at bottom of page */
  h2 + p {
    page-break-before: avoid;
  }
</style>
</head>
<body>
<h1>${title}</h1>
${htmlParts.join('\n')}
</body>
</html>`;
}

// ============================================================
// PDF RENDERING
// ============================================================

function htmlToPdf(html, edgePath) {
  const browser = edgePath || findEdge();
  if (!browser) {
    throw new Error('No browser found for PDF rendering. Install Edge or Chrome, or set BROWSER_PATH env var.');
  }

  const tmpHtml = path.join(require('os').tmpdir(), `contract_${Date.now()}.html`);
  const tmpPdf = path.join(require('os').tmpdir(), `contract_${Date.now()}.pdf`);
  fs.writeFileSync(tmpHtml, html, 'utf8');

  try {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--print-to-pdf=' + tmpPdf,
      '--no-pdf-header-footer',
      '--print-to-pdf-no-header',
      'file:///' + tmpHtml.replace(/\\/g, '/'),
    ];

    execFileSync(browser, args, { timeout: 30000, stdio: 'pipe' });

    if (!fs.existsSync(tmpPdf)) {
      throw new Error('PDF generation failed: output file not created');
    }

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
// MAIN GENERATION FUNCTION
// ============================================================

function generateFilledPdf(contractType, lead) {
  // 1. Get the master .txt
  contractLibrary.assertSupported(contractType);
  const masterText = contractLibrary.getTemplateText(contractType);

  // 2. Build merge map from lead
  const mergeMap = buildMergeMap(lead);

  // 3. Fill tokens in master (throws if required fields missing)
  const filledMaster = fillTemplate(masterText, mergeMap);

  // 4. Get ALL addenda: fixed + conditional
  const { getAllAddenda } = require('./contract-validation');
  const allAddenda = getAllAddenda(contractType, lead);

  // 5. Fill tokens in each addendum
  const filledAddenda = allAddenda.map(a => fillTemplate(a.text, mergeMap));

  // 6. Join master + addenda with horizontal rule
  const allText = [filledMaster, ...filledAddenda].join('\n\n---\n\n');

  // 7. Convert to professional HTML
  const title = `${contractType.toUpperCase().replace(/_/g, ' ')} Contract`;
  const html = textToHtml(allText, title);

  // 8. Render to PDF
  const edgePath = process.env.BROWSER_PATH || findEdge();
  const pdfBuffer = htmlToPdf(html, edgePath);

  return pdfBuffer;
}

function saveFilledPdf(contractType, lead, outputPath) {
  const pdfBuffer = generateFilledPdf(contractType, lead);
  fs.writeFileSync(outputPath, pdfBuffer);
  return { path: outputPath, size: pdfBuffer.length, bytes: pdfBuffer.length };
}

module.exports = {
  generateFilledPdf,
  saveFilledPdf,
  fillTemplate,
  buildMergeMap,
  textToHtml,
  htmlToPdf,
  findEdge,
  REQUIRED_TOKENS,
  OPTIONAL_TOKENS,
};