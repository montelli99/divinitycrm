/**
 * contract-validation.js — Pre-flight validation + conditional addendum selection
 *
 * Before a contract PDF is generated and sent to RabbitSign, this module:
 * 1. Validates all required lead fields are present and non-empty
 * 2. Checks financial math (EMD %, carryback + loan + cash = purchase price)
 * 3. Selects conditional addendums based on deal data (VA loan, personal guarantee, etc.)
 * 4. Returns a structured report with issues + proposed fixes
 *
 * The human-in-the-loop flow:
 *   Click "Send Contract" → validateContract() → if issues: show issues + fixes
 *   → user applies fix or manual corrects → regenerate → if clean: show PDF →
 *   user approves → send to RabbitSign
 *
 * No contract goes to RabbitSign without explicit human approval after validation.
 */

const path = require('path');
const fs = require('fs');
const contractLibrary = require('./contract-library');

/**
 * Conditional addendum rules.
 * Each rule evaluates lead data and returns addendum file(s) to include.
 */
const CONDITIONAL_ADDENDA_RULES = [
  {
    id: 'va_loan',
    name: 'VA Loan Addendum',
    file: 'va-loan-addendum.txt',
    test: (lead) => {
      const loanType = (lead.existing_loan_type || '').toUpperCase();
      return loanType.includes('VA') || loanType.includes('VETERANS');
    },
    reason: (lead) => `Existing loan type is "${lead.existing_loan_type}" — VA loan requires VA-specific disclosures.`,
  },
  {
    id: 'personal_guarantee',
    name: 'Personal Guarantee Addendum',
    file: 'personal-guarantee-addendum.txt',
    test: (lead) => {
      return lead.personal_guarantee === true || lead.personal_guarantee === 'true';
    },
    reason: () => `Personal guarantee requested — adds individual guarantor to seller financing.`,
  },
  {
    id: 'seller_protection',
    name: 'Seller Protection Addendum',
    file: 'seller-protection-addendum.txt',
    test: (lead) => {
      // Include seller protection addendum for subto and seller_finance deals
      // that have seller carryback > 0
      const type = lead._contract_type || '';
      return (type === 'subto' || type === 'seller_finance') &&
             Number(lead.seller_carryback || 0) > 0 &&
             lead._has_seller_protection_addendum !== false;
    },
    reason: (lead) => `SubTo deal with $${Number(lead.seller_carryback).toLocaleString()} seller carryback — 4-layer protection terms required.`,
  },
  {
    id: 'deed_in_lieu',
    name: 'Deed in Lieu of Foreclosure Addendum',
    file: 'deed-in-lieu-addendum.txt',
    test: (lead) => {
      // Include if not already covered by seller protection addendum
      const type = lead._contract_type || '';
      return (type === 'subto' || type === 'seller_finance') &&
             Number(lead.seller_carryback || 0) > 0 &&
             lead._standalone_dil === true; // only when explicitly requested
    },
    reason: () => `Deed in Lieu requested as standalone addendum.`,
  },
];

/**
 * Validate a lead record for contract generation.
 *
 * @param {string} contractType - e.g. 'subto', 'cash', 'stack50'
 * @param {Object} lead - Lead record from DB
 * @returns {Object} { valid, issues, addenda, summary }
 *   valid: boolean — true if no blocking issues
 *   issues: array of { severity, field, message, proposedFix }
 *   addenda: array of { file, name, reason } — conditional addendums to include
 *   summary: human-readable summary
 */
function validateContract(contractType, lead) {
  contractLibrary.assertSupported(contractType);
  lead = lead || {};
  lead._contract_type = contractType;

  const issues = [];
  const warnings = [];

  // --- 1. Required field validation ---
  const requiredFields = [
    { field: 'address', token: '[PROPERTY_ADDRESS]', label: 'Property Address' },
    { field: 'price', token: '[PURCHASE_PRICE]', label: 'Purchase Price', type: 'number' },
    { field: 'seller_name', token: '[SELLER_NAME]', label: 'Seller Name' },
    { field: 'buyer_name', token: '[BUYER_NAME]', label: 'Buyer Name', default: 'Divinity Aligned LLC' },
  ];

  for (const req of requiredFields) {
    const value = lead[req.field];
    if (req.default && !value) continue; // has default
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      issues.push({
        severity: 'blocking',
        field: req.field,
        token: req.token,
        message: `${req.label} is empty. Cannot generate contract without this field.`,
        proposedFix: `Update the lead record: go to Lead Detail → Property tab → ${req.label} field.`,
      });
    } else if (req.type === 'number' && (isNaN(Number(value)) || Number(value) <= 0)) {
      issues.push({
        severity: 'blocking',
        field: req.field,
        token: req.token,
        message: `${req.label} is "${value}" — must be a positive number.`,
        proposedFix: `Update the lead record: set ${req.label} to a valid dollar amount (e.g., 250000).`,
      });
    }
  }

  // Effective date is auto-generated, but check system date is valid
  issues.push({
    severity: 'info',
    field: 'effective_date',
    token: '[EFFECTIVE_DATE]',
    message: `Effective Date will be set to today: ${new Date().toLocaleDateString('en-US')}.`,
    proposedFix: null, // no fix needed, just info
  });

  // --- 2. Financial math validation ---
  const price = Number(lead.price || 0);
  const emd = Number(lead.emd_amount || 500);
  const carryback = Number(lead.seller_carryback || 0);
  const existingLoan = Number(lead.existing_loan_balance || 0);
  const cashAtCoe = Number(lead.cash_at_coe || 0);
  const downPayment = Number(lead.down_payment || 0);

  // EMD sanity check (typically 0.1% to 1% of purchase price)
  if (price > 0 && emd > 0) {
    const emdPct = (emd / price) * 100;
    if (emdPct > 5) {
      warnings.push({
        severity: 'warning',
        field: 'emd_amount',
        message: `EMD is ${emdPct.toFixed(1)}% of purchase price ($${emd.toLocaleString()} on $${price.toLocaleString()}). Typical range is 0.1-1%. Verify this is correct.`,
        proposedFix: `If this seems high, check if EMD should be $${Math.round(price * 0.005).toLocaleString()} (0.5%).`,
      });
    } else if (emdPct < 0.05) {
      warnings.push({
        severity: 'warning',
        field: 'emd_amount',
        message: `EMD is only ${emdPct.toFixed(2)}% of purchase price ($${emd.toLocaleString()} on $${price.toLocaleString()}). This is very low — seller may request higher.`,
        proposedFix: `Consider increasing EMD to $${Math.round(price * 0.005).toLocaleString()} (0.5% of purchase price).`,
      });
    }
  }

  // For subto/stack: check that components sum to purchase price
  if (contractType === 'subto' || contractType === 'seller_finance') {
    const total = existingLoan + carryback + cashAtCoe + emd;
    if (price > 0 && Math.abs(total - price) > price * 0.02) {
      // More than 2% mismatch
      warnings.push({
        severity: 'warning',
        field: 'financial_math',
        message: `Financial components don't add up: Existing Loan ($${existingLoan.toLocaleString()}) + Seller Carryback ($${carryback.toLocaleString()}) + Cash at COE ($${cashAtCoe.toLocaleString()}) + EMD ($${emd.toLocaleString()}) = $${total.toLocaleString()}, but Purchase Price is $${price.toLocaleString()}. Difference: $${(price - total).toLocaleString()}.`,
        proposedFix: `Check: existing_loan_balance, seller_carryback, cash_at_coe, and emd_amount should sum to purchase_price (${price}).`,
      });
    }
  }

  // For stack types: check down payment + carryback = price
  if (contractType.startsWith('stack')) {
    const total = downPayment + carryback;
    if (price > 0 && Math.abs(total - price) > price * 0.02) {
      warnings.push({
        severity: 'warning',
        field: 'financial_math',
        message: `Down Payment ($${downPayment.toLocaleString()}) + Seller Carryback ($${carryback.toLocaleString()}) = $${total.toLocaleString()}, but Purchase Price is $${price.toLocaleString()}. Difference: $${(price - total).toLocaleString()}.`,
        proposedFix: `Check: down_payment + seller_carryback should equal purchase_price (${price}).`,
      });
    }
  }

  // --- 3. Conditional addendum selection ---
  const selectedAddenda = [];
  for (const rule of CONDITIONAL_ADDENDA_RULES) {
    if (rule.test(lead)) {
      const filePath = path.join(contractLibrary.sourceDir(), rule.file);
      if (fs.existsSync(filePath)) {
        selectedAddenda.push({
          id: rule.id,
          name: rule.name,
          file: rule.file,
          path: filePath,
          reason: rule.reason(lead),
        });
      } else {
        warnings.push({
          severity: 'warning',
          field: 'addendum',
          message: `${rule.name} should be included (${rule.reason(lead)}) but file ${rule.file} not found in contracts directory.`,
          proposedFix: `Create ${rule.file} in the contracts directory or add it to the bundled assets.`,
        });
      }
    }
  }

  // --- 4. Build summary ---
  const blocking = issues.filter(i => i.severity === 'blocking');
  const valid = blocking.length === 0;

  let summary = '';
  if (valid) {
    summary = `✅ Contract validation passed for ${contractType.toUpperCase()}.\n`;
    summary += `   ${selectedAddenda.length} conditional addendum(s) selected.\n`;
    if (warnings.length > 0) {
      summary += `   ${warnings.length} warning(s) to review.\n`;
    }
  } else {
    summary = `❌ Contract validation FAILED for ${contractType.toUpperCase()}.\n`;
    summary += `   ${blocking.length} blocking issue(s) must be fixed before generating.\n`;
    if (warnings.length > 0) {
      summary += `   ${warnings.length} warning(s) to review.\n`;
    }
  }
  if (selectedAddenda.length > 0) {
    summary += `   Addendums: ${selectedAddenda.map(a => a.name).join(', ')}\n`;
  }

  return {
    valid,
    issues: [...issues, ...warnings],
    addenda: selectedAddenda,
    summary,
  };
}

/**
 * Get all addendum files for a contract type:
 * - Fixed addendums (from CONTRACT_LIBRARY)
 * - Conditional addendums (from validation rules)
 *
 * @param {string} contractType
 * @param {Object} lead
 * @returns {array} of { file, path, name, reason, conditional }
 */
function getAllAddenda(contractType, lead) {
  lead = lead || {};
  lead._contract_type = contractType;

  const fixed = contractLibrary.getAddendaText(contractType).map(a => ({
    file: path.basename(a.file),
    path: a.file,
    name: path.basename(a.file, '.txt'),
    text: a.text,
    conditional: false,
  }));

  const validation = validateContract(contractType, lead);
  const conditional = validation.addenda.map(a => ({
    file: a.file,
    path: a.path,
    name: a.name,
    reason: a.reason,
    text: fs.readFileSync(a.path, 'utf8'),
    conditional: true,
  }));

  return [...fixed, ...conditional];
}

module.exports = {
  validateContract,
  getAllAddenda,
  CONDITIONAL_ADDENDA_RULES,
};