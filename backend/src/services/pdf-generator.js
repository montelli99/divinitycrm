/**
 * pdf-generator.js — Generate filled PDFs from .txt contract masters
 *
 * Architecture:
 * 1. Read .txt master from src/assets/contracts/
 * 2. Replace merge tokens with lead data
 * 3. Wrap in styled HTML (legal document formatting)
 * 4. Render to PDF via headless Edge (Chromium)
 * 5. Return PDF buffer
 *
 * No RabbitSign templates required.
 * Updating a .txt file automatically affects all future PDFs.
 *
 * Merge tokens (all [UPPERCASE_WITH_UNDERSCORES]):
 *   [PROPERTY_ADDRESS], [CITY_STATE_ZIP], [APN],
 *   [PURCHASE_PRICE], [EMD_AMOUNT], [EXISTING_LOAN_BALANCE],
 *   [SELLER_NAME], [SELLER_EMAIL], [SELLER_PHONE],
 *   [BUYER_NAME], [BUYER_EMAIL],
 *   [INSPECTION_DAYS], [COE_DATE], [EFFECTIVE_DATE],
 *   [TITLE_COMPANY], [TITLE_EMAIL], [TITLE_PHONE],
 *   [PROPERTY_CITY], [PROPERTY_STATE], [PROPERTY_ZIP],
 *   [EXISTING_LOAN_LENDER], [SELLER_CARRYBACK], [SELLER_CARRYBACK_RATE],
 *   [MONTHLY_PAYMENT], [MATURITY_DATE], [CASH_AT_COE]
 *
 * If any REQUIRED token is missing from lead data, generateFilledPdf() throws.
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
  // Try PATH lookup
  try {
    const { execSync } = require('child_process');
    const found = execSync('where msedge 2>nul || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null', { encoding: 'utf8', shell: true }).trim().split('\n')[0];
    if (found && fs.existsSync(found)) return found;
  } catch (e) { /* ignore */ }
  return null;
}

/**
 * REQUIRED merge tokens — if any of these are unresolved after filling,
 * the send is REJECTED. No blank contracts go to signers.
 */
const REQUIRED_TOKENS = [
  '[PROPERTY_ADDRESS]',
  '[PURCHASE_PRICE]',
  '[SELLER_NAME]',
  '[BUYER_NAME]',
  '[EFFECTIVE_DATE]',
];

/**
 * Tokens that are OPTIONAL — if present in template but not in merge map,
 * they'll be left as [TOKEN] and won't cause an error.
 * These are contract-type-specific and only required for certain types.
 */
const OPTIONAL_TOKENS = [
  '[APN]', '[CITY_STATE_ZIP]', '[PROPERTY_CITY]', '[PROPERTY_STATE]', '[PROPERTY_ZIP]',
  '[SELLER_EMAIL]', '[SELLER_PHONE]', '[SELLER_ADDRESS]', '[SELLER_COMPANY]',
  '[BUYER_EMAIL]', '[BUYER_PHONE]', '[BUYER_ADDRESS]', '[BUYER_COMPANY]',
  '[EMD_AMOUNT]', '[INSPECTION_DAYS]', '[COE_DAYS]', '[COE_DATE]',
  '[EXISTING_LOAN_BALANCE]', '[EXISTING_LOAN_LENDER]', '[EXISTING_LOAN_PAYMENT]',
  '[SELLER_CARRYBACK]', '[SELLER_CARRYBACK_RATE]', '[MONTHLY_PAYMENT]',
  '[MATURITY_DATE]', '[MATURITY_MONTHS]', '[PAYMENT_START_DATE]',
  '[CASH_AT_COE]', '[DOWN_PAYMENT]', '[INTEREST_ANNUAL]', '[INTEREST_TOTAL]',
  '[TITLE_COMPANY]', '[TITLE_EMAIL]', '[TITLE_PHONE]',
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
  '[DATE]',
];

/**
 * Build the merge map from a lead record.
 * Maps DB lead fields → [PLACEHOLDER] tokens in the .txt master.
 */
function buildMergeMap(lead) {
  const today = new Date();
  const effectiveDate = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const coeDate = lead.coe_date
    ? new Date(lead.coe_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date(Date.now() + (lead.coe_days || 30) * 86400000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

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
    '[BUYER_NAME]': lead.buyer_name || 'Divinity Aligned LLC',
    '[BUYER_EMAIL]': lead.buyer_email || 'montelliscottrei@gmail.com',
    '[BUYER_PHONE]': lead.buyer_phone || '',
    '[BUYER_ADDRESS]': lead.buyer_address || '',
    '[INSPECTION_DAYS]': String(lead.inspection_period_days || 14),
    '[COE_DAYS]': String(lead.coe_days || 30),
    '[COE_DATE]': coeDate,
    '[EFFECTIVE_DATE]': effectiveDate,
    '[TITLE_COMPANY]': lead.title_company || 'CLOSE Title',
    '[TITLE_EMAIL]': 'Orders@closedtitle.com',
    '[TITLE_PHONE]': '800-405-7150',
    '[SELLER_CARRYBACK]': lead.seller_carryback ? formatCurrency(lead.seller_carryback) : '$0.00',
    '[SELLER_CARRYBACK_RATE]': lead.seller_carryback_rate ? `${(lead.seller_carryback_rate * 100).toFixed(2)}%` : '0%',
    '[MONTHLY_PAYMENT]': lead.monthly_payment ? formatCurrency(lead.monthly_payment) : '$0.00',
    '[MATURITY_DATE]': lead.maturity_date || '',
    '[MATURITY_MONTHS]': lead.maturity_months ? String(lead.maturity_months) : '72',
    '[PAYMENT_START_DATE]': lead.payment_start_date || effectiveDate,
    '[CASH_AT_COE]': lead.cash_at_coe ? formatCurrency(lead.cash_at_coe) : '$0.00',
    '[DOWN_PAYMENT]': lead.down_payment ? formatCurrency(lead.down_payment) : '$0.00',
    '[INTEREST_ANNUAL]': lead.interest_annual ? formatCurrency(lead.interest_annual) : '$0.00',
    '[INTEREST_TOTAL]': lead.interest_total ? formatCurrency(lead.interest_total) : '$0.00',
    '[NON_CIRCUMVENTION_PENALTY]': lead.non_circumvention_penalty ? formatCurrency(lead.non_circumvention_penalty) : '$10,000.00',
    '[PORTFOLIO_PROPERTY_COUNT]': String(lead.portfolio_property_count || 1),
    '[PORTFOLIO_TOTAL_PRICE]': lead.portfolio_total_price ? formatCurrency(lead.portfolio_total_price) : '',
    '[SELLER_COMPANY]': lead.seller_company || '',
    '[BUYER_COMPANY]': lead.buyer_company || 'Divinity Aligned LLC',
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
    '[PARTY_D_NAME]': lead.party_d_name || '',
    '[PARTY_D_EMAIL]': lead.party_d_email || '',
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
    '[TITLE_WEBSITE]': lead.title_website || '',
    '[PERSONAL_PROPERTY_INCLUDED]': lead.personal_property || 'All appliances to stay',
    '[OCCUPANCY_STATUS]': lead.occupancy_status || 'Property is leased and the tenant may continue in possession of the Property after COE unless otherwise agreed in writing.',
    '[TITLE_HOLDING_INSTRUCTIONS]': lead.title_holding_instructions || 'TBD',
    '[DEFAULT_INTEREST_RATE]': String(lead.default_interest_rate || 25),
    '[PARTY_B_DEFAULT_PERCENT]': String(lead.party_b_default_percent || 30),
    '[PARTY_C_DEFAULT_PERCENT]': String(lead.party_c_default_percent || 30),
    '[PARTY_D_DEFAULT_PERCENT]': String(lead.party_d_default_percent || 40),
    '[DATE]': effectiveDate,
  };
}

function formatCurrency(n) {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Fill merge tokens in template text.
 * Throws if any REQUIRED token remains unresolved (value is empty string).
 */
function fillTemplate(text, mergeMap) {
  let filled = text;

  // Apply our extended token set (single source of truth — no contract-library.fillTemplate)
  for (const [token, value] of Object.entries(mergeMap)) {
    filled = filled.split(token).join(value);
  }

  // Validate: check for unresolved [UPPERCASE] tokens
  const unresolved = filled.match(/\[[A-Z_]{3,}\]/g);
  if (unresolved) {
    // Filter out non-merge tokens (like [X] or [ ] checkboxes)
    const realUnresolved = unresolved.filter(t => t.length > 4 && !t.includes(' '));
    if (realUnresolved.length > 0) {
      // Check which are required vs optional
      const missingRequired = realUnresolved.filter(t => REQUIRED_TOKENS.includes(t));
      const missingOptional = realUnresolved.filter(t => OPTIONAL_TOKENS.includes(t));
      
      if (missingRequired.length > 0) {
        throw new Error(
          `Required merge tokens unresolved: ${[...new Set(missingRequired)].join(', ')}. ` +
          `Lead data missing — fix the lead record before sending.`
        );
      }
      
      // Replace optional unresolved tokens with blanks
      for (const token of [...new Set(missingOptional)]) {
        filled = filled.split(token).join('________________');
      }
    }
  }

  // Validate required fields are non-empty
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

/**
 * Convert plain text contract to styled HTML for PDF rendering.
 */
function textToHtml(text, title) {
  // Escape HTML special chars
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Convert checkbox markers to HTML checkboxes
  html = html.replace(/⛾/g, '☑').replace(/☐/g, '☐');

  // Split into paragraphs on double-newlines or section headers
  // The .txt files are essentially run-on text with section numbers
  // We'll wrap each "section" (detected by numbered headers) in a styled div
  const lines = html.split('\n');
  const htmlParts = [];
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inParagraph) {
        htmlParts.push('</p>');
        inParagraph = false;
      }
      continue;
    }

    // Check if this looks like a section header (e.g., "1.1", "SECTION 3", etc.)
    const isHeader = /^\d+(\.\d+)*\s+[A-Z]/.test(trimmed) || /^[A-Z][A-Z\s]{10,}$/.test(trimmed);

    if (!inParagraph) {
      htmlParts.push('<p>');
      inParagraph = true;
    }

    if (isHeader) {
      htmlParts.push(`<strong>${trimmed}</strong> `);
    } else {
      htmlParts.push(`${trimmed} `);
    }
  }

  if (inParagraph) htmlParts.push('</p>');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 1in; }
  body {
    font-family: 'Times New Roman', Georgia, serif;
    font-size: 12pt;
    line-height: 1.5;
    color: #000;
  }
  h1 {
    font-size: 14pt;
    text-align: center;
    text-transform: uppercase;
    margin-bottom: 24pt;
    border-bottom: 2px solid #000;
    padding-bottom: 8pt;
  }
  p { margin: 0 0 8pt 0; text-align: justify; }
  strong { font-weight: bold; }
  .signature-block {
    margin-top: 24pt;
    page-break-inside: avoid;
  }
</style>
</head>
<body>
<h1>${title}</h1>
${htmlParts.join('\n')}
</body>
</html>`;
}

/**
 * Render HTML to PDF using headless Edge/Chromium.
 * Returns a PDF buffer.
 */
function htmlToPdf(html, edgePath) {
  const browser = edgePath || findEdge();
  if (!browser) {
    throw new Error('No browser found for PDF rendering. Install Edge or Chrome, or set BROWSER_PATH env var.');
  }

  // Write HTML to temp file
  const tmpHtml = path.join(require('os').tmpdir(), `contract_${Date.now()}.html`);
  const tmpPdf = path.join(require('os').tmpdir(), `contract_${Date.now()}.pdf`);
  fs.writeFileSync(tmpHtml, html, 'utf8');

  try {
    // Headless Edge: print to PDF
    const args = [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--print-to-pdf=' + tmpPdf,
      '--print-to-pdf-no-header',
      'file:///' + tmpHtml.replace(/\\/g, '/'),
    ];

    execFileSync(browser, args, { timeout: 30000, stdio: 'pipe' });

    if (!fs.existsSync(tmpPdf)) {
      throw new Error('PDF generation failed: output file not created');
    }

    const pdfBuffer = fs.readFileSync(tmpPdf);

    // Cleanup
    try { fs.unlinkSync(tmpHtml); } catch (e) {}
    try { fs.unlinkSync(tmpPdf); } catch (e) {}

    return pdfBuffer;
  } catch (err) {
    // Cleanup on error
    try { fs.unlinkSync(tmpHtml); } catch (e) {}
    try { fs.unlinkSync(tmpPdf); } catch (e) {}
    throw new Error(`PDF rendering failed: ${err.message}`);
  }
}

/**
 * Generate a filled PDF for a contract type + lead data.
 *
 * @param {string} contractType - e.g. 'subto', 'cash', 'stack50'
 * @param {Object} lead - Lead record from DB
 * @returns {Buffer} PDF buffer with filled contract
 */
function generateFilledPdf(contractType, lead) {
  // 1. Get the master .txt
  contractLibrary.assertSupported(contractType);
  const masterText = contractLibrary.getTemplateText(contractType);

  // 2. Build merge map from lead
  const mergeMap = buildMergeMap(lead);

  // 3. Fill tokens in master (throws if required fields missing)
  const filledMaster = fillTemplate(masterText, mergeMap);

  // 4. Get ALL addenda: fixed (from CONTRACT_LIBRARY) + conditional (from validation rules)
  const { getAllAddenda } = require('./contract-validation');
  const allAddenda = getAllAddenda(contractType, lead);

  // 5. Fill tokens in each addendum
  const filledAddenda = allAddenda.map(a => fillTemplate(a.text, mergeMap));

  // 6. Join master + addenda into one document
  const allText = [filledMaster, ...filledAddenda].join('\n\n---\n\n');

  // 7. Convert to HTML
  const title = `${contractType.toUpperCase().replace(/_/g, ' ')} Contract`;
  const html = textToHtml(allText, title);

  // 8. Render to PDF
  const edgePath = process.env.BROWSER_PATH || findEdge();
  const pdfBuffer = htmlToPdf(html, edgePath);

  return pdfBuffer;
}

/**
 * Save a filled PDF to a file (for testing/inspection).
 */
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
};