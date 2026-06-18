// =============================================================
// Closing Cost Allocator Service — Divinity CRM
// =============================================================
// Built: 2026-06-18 by Atlas (Phase 7)
// Source: ghl-automations/modules/closing-cost-allocator.js
//
// Purpose: Allocate closing costs (transfer tax, title policy, EMD,
//          escrow fees) between buyer and seller per Kay Exclusive
//          transcript defaults.
//
// Rules (from transcript 04):
//   - Transfer tax: 50/50 (typically seller's historical)
//   - Standard title policy: buyer pays
//   - EMD: $100 minimum, max 1% of purchase price
//   - Inspection: 14 days default, 21 if squeezed
//   - COE: 30 days AFTER EFFECTIVE DATE
//   - CLOSE Title (singular)
//   - 3rd-party processor required for SubTo, within 48hrs of COE
//   - Wrap-around disclosure required for SubTo
// =============================================================

const { query } = require('../db/connection');

// =============================================================
// STATE FEE ESTIMATES
// =============================================================

const STATE_FEE_ESTIMATES = {
  default: {
    transferTaxPerThousand: 1.00,
    titlePolicyBase: 800,
    titlePolicyPerThousand: 0.005,
    escrowFeeFlat: 600,
  },
  CA: { transferTaxPerThousand: 1.10, titlePolicyBase: 900, titlePolicyPerThousand: 0.005, escrowFeeFlat: 800 },
  FL: { transferTaxPerThousand: 0.70, titlePolicyBase: 750, titlePolicyPerThousand: 0.005, escrowFeeFlat: 650 },
  TX: { transferTaxPerThousand: 0.00, titlePolicyBase: 850, titlePolicyPerThousand: 0.005, escrowFeeFlat: 700 },
  NY: { transferTaxPerThousand: 4.00, titlePolicyBase: 1200, titlePolicyPerThousand: 0.0075, escrowFeeFlat: 1000 },
  PA: { transferTaxPerThousand: 2.00, titlePolicyBase: 900, titlePolicyPerThousand: 0.005, escrowFeeFlat: 750 },
  AK: { transferTaxPerThousand: 0.00, titlePolicyBase: 800, titlePolicyPerThousand: 0.005, escrowFeeFlat: 600 },
  AZ: { transferTaxPerThousand: 0.00, titlePolicyBase: 800, titlePolicyPerThousand: 0.005, escrowFeeFlat: 650 },
  CO: { transferTaxPerThousand: 0.01, titlePolicyBase: 800, titlePolicyPerThousand: 0.005, escrowFeeFlat: 700 },
  GA: { transferTaxPerThousand: 1.00, titlePolicyBase: 800, titlePolicyPerThousand: 0.005, escrowFeeFlat: 650 },
  MD: { transferTaxPerThousand: 1.50, titlePolicyBase: 900, titlePolicyPerThousand: 0.005, escrowFeeFlat: 750 },
  NC: { transferTaxPerThousand: 1.00, titlePolicyBase: 800, titlePolicyPerThousand: 0.005, escrowFeeFlat: 650 },
  SC: { transferTaxPerThousand: 0.50, titlePolicyBase: 800, titlePolicyPerThousand: 0.005, escrowFeeFlat: 650 },
  TN: { transferTaxPerThousand: 0.00, titlePolicyBase: 800, titlePolicyPerThousand: 0.005, escrowFeeFlat: 700 },
  VA: { transferTaxPerThousand: 0.50, titlePolicyBase: 850, titlePolicyPerThousand: 0.005, escrowFeeFlat: 700 },
};

function getStateFees(state) {
  if (!state) return STATE_FEE_ESTIMATES.default;
  return STATE_FEE_ESTIMATES[state.toUpperCase()] || STATE_FEE_ESTIMATES.default;
}

// =============================================================
// CLOSING COST RULES BY CONTRACT TYPE
// =============================================================

const CLOSING_COST_RULES = {
  subto: {
    transferTax: { split: '50/50', responsible: 'Seller typically' },
    titlePolicy: { responsible: 'Buyer', type: 'Lender\'s + Owner\'s' },
    emd: { min: 100, maxPercentOfPP: 0.01 },
    inspection: { defaultDays: 14, maxDays: 21 },
    coe: { defaultDays: 30, basis: 'after effective date' },
    title: { defaultCompany: 'CLOSE Title', phone: '1-800-405-7150', email: 'order@closedtitle.com' },
    requireThirdPartyProcessor: true,
    requireWrapAroundDisclosure: true,
  },
  cash: {
    transferTax: { split: '50/50', responsible: 'Seller typically' },
    titlePolicy: { responsible: 'Buyer', type: 'Owner\'s only' },
    emd: { min: 100, maxPercentOfPP: 0.01 },
    inspection: { defaultDays: 14, maxDays: 21 },
    coe: { defaultDays: 21, basis: 'after effective date' },
    title: { defaultCompany: 'CLOSE Title', phone: '1-800-405-7150', email: 'order@closedtitle.com' },
    requireThirdPartyProcessor: false,
    requireWrapAroundDisclosure: false,
  },
  stack50: {
    transferTax: { split: '50/50', responsible: 'Seller typically' },
    titlePolicy: { responsible: 'Buyer', type: 'Lender\'s + Owner\'s' },
    emd: { min: 100, maxPercentOfPP: 0.01 },
    inspection: { defaultDays: 14, maxDays: 21 },
    coe: { defaultDays: 28, basis: 'after effective date' },
    title: { defaultCompany: 'CLOSE Title', phone: '1-800-405-7150', email: 'order@closedtitle.com' },
    requireThirdPartyProcessor: true,
    requireWrapAroundDisclosure: true,
  },
  seller_finance: {
    transferTax: { split: '50/50', responsible: 'Seller typically' },
    titlePolicy: { responsible: 'Buyer', type: 'Owner\'s only' },
    emd: { min: 100, maxPercentOfPP: 0.01 },
    inspection: { defaultDays: 14, maxDays: 21 },
    coe: { defaultDays: 30, basis: 'after effective date' },
    title: { defaultCompany: 'CLOSE Title', phone: '1-800-405-7150', email: 'order@closedtitle.com' },
    requireThirdPartyProcessor: false,
    requireWrapAroundDisclosure: false,
  },
  jv: {
    transferTax: { split: '50/50', responsible: 'Seller typically' },
    titlePolicy: { responsible: 'Buyer', type: 'Lender\'s + Owner\'s' },
    emd: { min: 500, maxPercentOfPP: 0.01 },
    inspection: { defaultDays: 14, maxDays: 21 },
    coe: { defaultDays: 30, basis: 'after effective date' },
    title: { defaultCompany: 'CLOSE Title', phone: '1-800-405-7150', email: 'order@closedtitle.com' },
    requireThirdPartyProcessor: true,
    requireWrapAroundDisclosure: false,
  },
};

function getClosingCostRules(contractType) {
  const key = (contractType || 'subto').toLowerCase().replace(/[\s-]/g, '_');
  return CLOSING_COST_RULES[key] || CLOSING_COST_RULES.subto;
}

// =============================================================
// CALCULATE EMD DEFAULT
// =============================================================

function getEMDDefault(purchasePrice, contractType = 'subto') {
  const rules = getClosingCostRules(contractType);
  const minEMD = rules.emd.min;
  const maxEMD = Math.round(purchasePrice * rules.emd.maxPercentOfPP);
  return {
    amount: minEMD,
    minAllowed: minEMD,
    maxAllowed: maxEMD,
    maxPercentOfPP: rules.emd.maxPercentOfPP,
  };
}

// =============================================================
// CALCULATE COE DATE
// =============================================================

function getCOEDefault(effectiveDate, contractType = 'subto') {
  const rules = getClosingCostRules(contractType);
  const baseDate = effectiveDate ? new Date(effectiveDate) : new Date();
  const coeDate = new Date(baseDate.getTime() + rules.coe.defaultDays * 86400000);
  return {
    coeDate: coeDate.toISOString().split('T')[0],
    daysFromEffective: rules.coe.defaultDays,
    basis: rules.coe.basis,
  };
}

// =============================================================
// FULL CLOSING COST ALLOCATION
// =============================================================

function allocateClosingCosts({ contractType = 'subto', purchasePrice, state }) {
  const rules = getClosingCostRules(contractType);
  const stateFees = getStateFees(state);
  const emd = getEMDDefault(purchasePrice, contractType);

  // Transfer tax
  const transferTaxTotal = Math.round((purchasePrice / 1000) * stateFees.transferTaxPerThousand);
  let transferTaxSplit;
  if (rules.transferTax.split === '50/50') {
    transferTaxSplit = {
      sellerPortion: Math.round(transferTaxTotal / 2),
      buyerPortion: Math.round(transferTaxTotal / 2),
    };
  } else {
    transferTaxSplit = { sellerPortion: transferTaxTotal, buyerPortion: 0 };
  }

  // Title policy
  const titlePolicyCost = Math.round(stateFees.titlePolicyBase + purchasePrice * stateFees.titlePolicyPerThousand);
  const titlePolicy = {
    responsible: rules.titlePolicy.responsible,
    type: rules.titlePolicy.type,
    estimatedCost: titlePolicyCost,
  };

  // Escrow fee (50/50 split)
  const escrowFee = Math.round(stateFees.escrowFeeFlat);
  const escrowSplit = {
    sellerPortion: Math.round(escrowFee / 2),
    buyerPortion: escrowFee - Math.round(escrowFee / 2),
  };

  // COE
  const coe = getCOEDefault(new Date(), contractType);

  // SubTo specifics
  const subToSpecifics = rules.requireThirdPartyProcessor ? {
    requireThirdPartyProcessor: rules.requireThirdPartyProcessor,
    requireWrapAroundDisclosure: rules.requireWrapAroundDisclosure,
    processorSetupDeadline: `within 48hrs of COE (target: ${coe.coeDate})`,
    existingLoanStaysInPlace: true,
    deedInLieuInEscrow: true,
  } : null;

  const allocation = {
    contractType,
    purchasePrice,
    state: state || 'unknown',
    emd,
    transferTax: {
      total: transferTaxTotal,
      split: rules.transferTax.split,
      responsible: rules.transferTax.responsible,
      ...transferTaxSplit,
    },
    titlePolicy,
    escrowFee: {
      total: escrowFee,
      ...escrowSplit,
    },
    inspection: {
      defaultDays: rules.inspection.defaultDays,
      maxDays: rules.inspection.maxDays,
    },
    coe,
    titleCompany: rules.title,
    subTo: subToSpecifics,
    totals: {
      sellerEstimatedCost: transferTaxSplit.sellerPortion + escrowSplit.sellerPortion,
      buyerEstimatedCost: transferTaxSplit.buyerPortion + escrowSplit.buyerPortion + titlePolicyCost,
      buyerOutOfPocketAtCOE: emd.amount + transferTaxSplit.buyerPortion + titlePolicyCost,
    },
  };

  return allocation;
}

// =============================================================
// FORMAT FOR NOTES
// =============================================================

function formatForNotes(allocation) {
  const lines = [
    `=== CLOSING COST ALLOCATION ===`,
    `Contract Type: ${allocation.contractType}`,
    `Purchase Price: $${allocation.purchasePrice.toLocaleString()}`,
    `State: ${allocation.state}`,
    ``,
    `EMD: $${allocation.emd.amount} (max $${allocation.emd.maxAllowed.toLocaleString()} = ${(allocation.emd.maxPercentOfPP * 100).toFixed(0)}% of PP)`,
    `Inspection Period: ${allocation.inspection.defaultDays} days (max ${allocation.inspection.maxDays})`,
    `COE: ${allocation.coe.coeDate} (${allocation.coe.daysFromEffective} days from effective date)`,
    `Title Company: ${allocation.titleCompany.defaultCompany || 'CLOSE Title'}`,
    ``,
    `Transfer Tax (${allocation.transferTax.split}):`,
    `  Seller: $${allocation.transferTax.sellerPortion.toLocaleString()}`,
    `  Buyer:  $${allocation.transferTax.buyerPortion.toLocaleString()}`,
    `  Total:  $${allocation.transferTax.total.toLocaleString()}`,
    ``,
    `Title Policy: ${allocation.titlePolicy.responsible} pays ($${allocation.titlePolicy.estimatedCost.toLocaleString()})`,
    ``,
    `Escrow Fee:`,
    `  Seller: $${allocation.escrowFee.sellerPortion.toLocaleString()}`,
    `  Buyer:  $${allocation.escrowFee.buyerPortion.toLocaleString()}`,
    `  Total:  $${allocation.escrowFee.total.toLocaleString()}`,
    ``,
  ];

  if (allocation.subTo) {
    lines.push(
      `=== SUBTO SPECIFIC ===`,
      `3rd-party processor required: ${allocation.subTo.processorSetupDeadline}`,
      `Wrap-around disclosure required`,
      `Existing loan stays in seller's name`,
      `Deed in Lieu held in escrow at title`,
      ``
    );
  }

  lines.push(
    `=== TOTALS ===`,
    `Seller estimated cost: $${allocation.totals.sellerEstimatedCost.toLocaleString()}`,
    `Buyer estimated cost: $${allocation.totals.buyerEstimatedCost.toLocaleString()}`,
    `Buyer out-of-pocket at COE: $${allocation.totals.buyerOutOfPocketAtCOE.toLocaleString()}`
  );

  return lines.join('\n');
}

// =============================================================
// SAVE ALLOCATION TO LEAD
// =============================================================

async function saveAllocationToLead(leadId, allocation) {
  const result = await query(
    `UPDATE leads SET closing_cost_breakdown = $1, updated_at = now() WHERE id = $2 RETURNING id, address`,
    [JSON.stringify(allocation), leadId]
  );

  if (result.length === 0) throw new Error('Lead not found');

  await query(
    `INSERT INTO activity_log (lead_id, action, details, created_at)
    VALUES ($1, 'closing_cost_allocated', $2, now())`,
    [leadId, JSON.stringify({
      contractType: allocation.contractType,
      purchasePrice: allocation.purchasePrice,
      sellerCost: allocation.totals.sellerEstimatedCost,
      buyerCost: allocation.totals.buyerEstimatedCost,
      buyerOutOfPocket: allocation.totals.buyerOutOfPocketAtCOE,
    })]
  );

  return result[0];
}

// =============================================================
// EXPORT
// =============================================================

module.exports = {
  allocateClosingCosts,
  getEMDDefault,
  getCOEDefault,
  getStateFees,
  getClosingCostRules,
  formatForNotes,
  saveAllocationToLead,
  STATE_FEE_ESTIMATES,
  CLOSING_COST_RULES,
};