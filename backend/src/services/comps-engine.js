/**
 * Comps Engine — Divinity CRM
 * =============================================================
 * Kayla's specific comp methodology (from Calc+Dispo + Underwriting videos).
 *
 * LONG-TERM (cash/rental) flow:
 *   1. Property lookup (beds, baths, sqft, year built)
 *   2. Find closest rented property with same bed/bath
 *   3. ChatGPT: property tax estimate (take HIGHEST)
 *   4. ChatGPT: landlord insurance estimate
 *   5. Loan = purchase × 0.7 (Jax 70% LTV)
 *   6. Cash flow ≥ $200/mo (Kayla bar)
 *
 * MID-TERM (furnished) flow:
 *   1. Property basics lookup
 *   2. Furnished Finder: search by zip, 1-mile radius
 *   3. Get LOWEST rate × bedrooms
 *   4. ChatGPT: taxes (HIGHEST estimate)
 *   5. Insurance = $120/mo (fixed for furnished)
 *   6. Loan = purchase × 0.7
 *   7. DSCR ≥ 1.25
 *   8. Cash flow ≥ $200/mo
 *
 * CREATIVE DEAL FRAMEWORK:
 *   SubTo, Seller Finance, DSCR Loan, Stack 50%, Stack 10%
 *
 * JAX 50% DOWN / 1% RULE: loan = purchase × 0.7; rent ≥ 1% of loan
 *
 * INPUT MODES:
 *   - Auto-fetch: web_search + web_fetch for property data
 *   - Manual: user provides data from call
 *   - Call transcription: parse dictated data
 */

const { query } = require('../db/connection');

// =============================================================
// BUY BOX RULES
// =============================================================

const BUY_BOX = {
  minPopulation: 10000,
  priceRange: { min: 150000, max: 550000 },
  minBeds: 3,
  noHOA: true,
  noPool: true,
  noFloodZone: true,
  redStates: ['CA', 'CO', 'CT', 'DE', 'HI', 'IL', 'MA', 'MD', 'ME', 'MI', 'MN', 'NH', 'NJ', 'NM', 'NY', 'OH', 'OR', 'PA', 'RI', 'VA', 'VT', 'WA', 'WI', 'DC'],
};

/**
 * Check if a property passes the buy box.
 * @param {Object} data — { state, population, hasHOA, hasPool, inFloodZone, beds, price }
 * @returns {Object} { allPass, failures[], checks{} }
 */
function checkBuyBox(data = {}) {
  const checks = {};
  const failures = [];

  // Red state check
  const isRed = BUY_BOX.redStates.includes((data.state || '').toUpperCase());
  checks.redState = { pass: !isRed, label: 'Red State (Landlord Friendly)', detail: isRed ? `${data.state} is tenant-friendly` : 'Not a red state' };
  if (isRed) failures.push('Red State (Landlord Friendly)');

  // Population
  const pop = Number(data.population || 0);
  checks.population = { pass: pop >= BUY_BOX.minPopulation, label: `Population ≥ ${BUY_BOX.minPopulation.toLocaleString()}`, detail: `${pop.toLocaleString()}` };
  if (pop < BUY_BOX.minPopulation) failures.push(`Population ≥ ${BUY_BOX.minPopulation.toLocaleString()}`);

  // HOA
  checks.noHOA = { pass: !data.hasHOA, label: 'No HOA', detail: data.hasHOA ? 'Has HOA' : 'No HOA' };
  if (data.hasHOA) failures.push('No HOA');

  // Pool
  checks.noPool = { pass: !data.hasPool, label: 'No Pool', detail: data.hasPool ? 'Has Pool' : 'No Pool' };
  if (data.hasPool) failures.push('No Pool');

  // Flood zone
  checks.noFloodZone = { pass: !data.inFloodZone, label: 'No Flood Zone', detail: data.inFloodZone ? 'In Flood Zone' : 'Not in Flood Zone' };
  if (data.inFloodZone) failures.push('No Flood Zone');

  // Beds
  if (data.beds !== undefined) {
    const b = Number(data.beds);
    checks.minBeds = { pass: b >= BUY_BOX.minBeds, label: `${BUY_BOX.minBeds}+ Beds`, detail: `${b} beds` };
    if (b < BUY_BOX.minBeds) failures.push(`${BUY_BOX.minBeds}+ Beds`);
  }

  // Price range
  if (data.price !== undefined) {
    const p = Number(data.price);
    checks.priceRange = { pass: p >= BUY_BOX.priceRange.min && p <= BUY_BOX.priceRange.max, label: `$${BUY_BOX.priceRange.min / 1000}K-$${BUY_BOX.priceRange.max / 1000}K`, detail: `$${p.toLocaleString()}` };
    if (p < BUY_BOX.priceRange.min || p > BUY_BOX.priceRange.max) failures.push(`$${BUY_BOX.priceRange.min / 1000}K-$${BUY_BOX.priceRange.max / 1000}K`);
  }

  return {
    allPass: failures.length === 0,
    failures,
    checks,
  };
}

// =============================================================
// REPAIR TIER CALCULATOR
// =============================================================

/**
 * Calculate repair estimate based on condition and sqft.
 * Turnkey: $30/sqft, Livable: $45/sqft, Renovation: $60/sqft
 */
function estimateRepairs(condition, sqft) {
  const rates = { turnkey: 30, livable: 45, reno: 60, unknown: 45 };
  const rate = rates[condition] || rates.unknown;
  const s = Number(sqft || 0);
  return { rate, estimate: s * rate, tier: rate >= 45 ? 'Renovation' : 'FB' };
}

// =============================================================
// 1% RULE CHECK
// =============================================================

/**
 * Jax's 1% Rule: monthly rent must be ≥ 1% of purchase price.
 * For SubTo: rent must be ≥ 1% of loan amount (purchase × 0.7).
 */
function checkOnePercentRule(monthlyRent, purchasePrice) {
  const rent = Number(monthlyRent || 0);
  const price = Number(purchasePrice || 0);
  if (price === 0) return { pass: false, value: 0, threshold: 0, detail: 'No purchase price' };

  const value = rent / price;
  const threshold = 0.01;
  const loanAmount = price * 0.7;
  const loanThreshold = loanAmount * 0.01;

  return {
    pass: value >= threshold,
    value: (value * 100).toFixed(2) + '%',
    threshold: '1.00%',
    monthlyRent: rent,
    purchasePrice: price,
    loanAmount,
    loanThreshold,
    detail: value >= threshold
      ? `PASS: $${rent}/mo is ${(value * 100).toFixed(2)}% of $${price.toLocaleString()}`
      : `FAIL: $${rent}/mo is only ${(value * 100).toFixed(2)}% of $${price.toLocaleString()} (need ≥1%)`,
  };
}

// =============================================================
// DSCR CALCULATOR
// =============================================================

/**
 * DSCR = Annual Net Operating Income / Annual Debt Service
 * NOI = (MonthlyRent × 12) − Insurance − PropertyTaxes − Maintenance(5%) − Vacancy(5%) − PM(8%)
 * Debt Service = LoanAmount × InterestRate (interest-only for DSCR loans)
 */
function calculateDSCR(monthlyRent, loanAmount, interestRate, insuranceMonthly = 120, propertyTaxAnnual = 0) {
  const rent = Number(monthlyRent || 0);
  const loan = Number(loanAmount || 0);
  const rate = Number(interestRate || 0.07);

  if (loan === 0) return { dscr: 0, pass: false, detail: 'No loan amount' };

  const annualRent = rent * 12;
  const insurance = insuranceMonthly * 12;
  const taxes = propertyTaxAnnual || (loan * 0.012); // ~1.2% of loan default
  const maintenance = annualRent * 0.05;
  const vacancy = annualRent * 0.05;
  const pm = annualRent * 0.08;
  const noi = annualRent - insurance - taxes - maintenance - vacancy - pm;
  const debtService = loan * rate;
  const dscr = debtService > 0 ? noi / debtService : 0;

  return {
    dscr: dscr.toFixed(2),
    pass: dscr >= 1.25,
    threshold: '1.25',
    noi: noi.toFixed(2),
    debtService: debtService.toFixed(2),
    breakdown: { annualRent, insurance, taxes, maintenance, vacancy, pm },
    detail: dscr >= 1.25
      ? `PASS: DSCR ${dscr.toFixed(2)}x (NOI $${noi.toFixed(0)} / Debt $${debtService.toFixed(0)})`
      : `FAIL: DSCR ${dscr.toFixed(2)}x (need ≥1.25)`,
  };
}

// =============================================================
// CASH FLOW CALCULATOR
// =============================================================

function calculateCashFlow(monthlyRent, monthlyPI, insuranceMonthly = 120, propertyTaxMonthly = 0, pmRate = 0.08) {
  const rent = Number(monthlyRent || 0);
  const pi = Number(monthlyPI || 0);
  const insurance = Number(insuranceMonthly || 120);
  const taxes = Number(propertyTaxMonthly || 0);
  const maintenance = rent * 0.05;
  const vacancy = rent * 0.05;
  const pm = rent * pmRate;
  const cashFlow = rent - pi - insurance - taxes - maintenance - vacancy - pm;

  return {
    cashFlow: cashFlow.toFixed(2),
    pass: cashFlow >= 200,
    threshold: 200,
    breakdown: { rent, pi, insurance, taxes, maintenance: maintenance.toFixed(2), vacancy: vacancy.toFixed(2), pm: pm.toFixed(2) },
    detail: cashFlow >= 200
      ? `PASS: $${cashFlow.toFixed(2)}/mo cash flow`
      : `FAIL: $${cashFlow.toFixed(2)}/mo (need ≥$200)`,
  };
}

// =============================================================
// STRATEGY RECOMMENDER
// =============================================================

/**
 * Recommend best deal strategy based on property characteristics.
 * Kayla's Exit Strategy Cheatsheet routing.
 */
function recommendStrategy(data = {}) {
  const {
    equityPercent = 50,
    existingLoanRate,
    motivation = 'medium',
    isRental = true,
    isOwnedFree = false,
    needsRenovation = false,
    moveInReady = true,
    condition = 'unknown',
  } = data;

  // Free & clear → $0 Down or Cash
  if (isOwnedFree) {
    if (motivation === 'high') return { strategy: 'Cash', name: 'Cash Offer', condition: 'Free & clear + high motivation', contractType: 'Cash' };
    return { strategy: 'SubTo', name: '$0 Down / SubTo', condition: 'Free & clear, seller can carry', contractType: 'SubTo' };
  }

  // High equity + turnkey → Stack 50%
  if (equityPercent >= 40 && !needsRenovation && moveInReady) {
    return { strategy: 'Stack50', name: 'Stack 50% Down', condition: 'High equity + turnkey', contractType: 'Stack' };
  }

  // Low equity + low rate → SubTo
  if (existingLoanRate && existingLoanRate < 0.05) {
    return { strategy: 'SubTo', name: 'Subject-To', condition: `Low rate (${(existingLoanRate*100).toFixed(1)}%) — take over payments`, contractType: 'SubTo' };
  }

  // Renovation → Stack 10%
  if (needsRenovation || condition === 'reno') {
    return { strategy: 'Stack10', name: 'Stack 10% Down', condition: 'Renovation — 10% down, 24mo balloon', contractType: 'Stack' };
  }

  // High motivation → Cash
  if (motivation === 'high') {
    return { strategy: 'Cash', name: 'Cash Offer', condition: 'High motivation — fast close', contractType: 'Cash' };
  }

  // Default → Stack 50%
  return { strategy: 'Stack50', name: 'Stack 50% Down', condition: 'Default recommendation', contractType: 'Stack', fallback: true };
}

// =============================================================
// FULL COMPS REPORT GENERATOR
// =============================================================

/**
 * Generate a full comps report for a lead.
 * Combines buy box, repair estimate, 1% rule, DSCR, cash flow, and strategy.
 */
function generateCompsReport(lead) {
  const buyBox = checkBuyBox({
    state: lead.state,
    population: lead.population,
    hasHOA: lead.has_hoa,
    hasPool: lead.has_pool,
    inFloodZone: lead.in_flood_zone,
    beds: lead.beds,
    price: lead.price,
  });

  const repairs = estimateRepairs(lead.condition, lead.sqft);
  const onePercent = checkOnePercentRule(lead.monthly_rent, lead.price);
  const dscr = calculateDSCR(lead.monthly_rent, (lead.price || 0) * 0.7, lead.existing_loan_rate || 0.07, 120, 0);
  const cashFlow = calculateCashFlow(lead.monthly_rent, 0, 120, 0);

  const strategy = recommendStrategy({
    equityPercent: lead.equity_percent || 50,
    existingLoanRate: lead.existing_loan_rate,
    motivation: lead.motivation || 'medium',
    isRental: true,
    isOwnedFree: lead.is_owned_free,
    needsRenovation: lead.condition === 'reno',
    moveInReady: lead.condition === 'turnkey',
    condition: lead.condition,
  });

  return {
    leadId: lead.id,
    address: lead.address,
    generatedAt: new Date().toISOString(),
    buyBox,
    repairs,
    onePercentRule: onePercent,
    dscr,
    cashFlow,
    strategy,
    summary: {
      buyBoxPass: buyBox.allPass,
      onePercentPass: onePercent.pass,
      dscrPass: dscr.pass,
      cashFlowPass: cashFlow.pass,
      recommendedAction: buyBox.allPass ? 'Proceed to underwriting' : 'FAILS buy box — review before proceeding',
    },
  };
}

/**
 * Save comps report to lead record.
 */
async function saveCompsReport(leadId, userId, report) {
  await query(
    `UPDATE leads SET
      buy_box_match = $1,
      one_percent_rule = $2,
      one_percent_value = $3,
      dscr = $4,
      cash_flow = $5,
      repairs_estimate = $6,
      repair_tier_rate = $7,
      recommended_strategy = $8,
      updated_at = NOW()
    WHERE id = $9 AND user_id = $10`,
    [
      report.buyBox.allPass,
      report.onePercentRule.pass,
      parseFloat(report.onePercentRule.value) / 100,
      parseFloat(report.dscr.dscr),
      parseFloat(report.cashFlow.cashFlow),
      report.repairs.estimate,
      report.repairs.rate,
      report.strategy.strategy,
      leadId,
      userId,
    ]
  );

  await query(
    'INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)',
    [userId, leadId, 'comps_run', JSON.stringify(report)]
  );
}

module.exports = {
  BUY_BOX,
  checkBuyBox,
  estimateRepairs,
  checkOnePercentRule,
  calculateDSCR,
  calculateCashFlow,
  recommendStrategy,
  generateCompsReport,
  saveCompsReport,
};
