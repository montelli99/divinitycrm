// =============================================================
// Deal Calculator Service — Ported from GHL offer-calculator.js
// =============================================================
// Integrates: Cash, F50, F10, SubTo, DSCR, MidTerm calculations
// Buy box checker, 1% rule, DSCR, strategy recommendation

const RED_STATES = new Set([
  'AL','AK','AR','AZ','FL','GA','ID','IN','IA','KS','KY','LA',
  'MS','MO','MT','NE','NV','NC','ND','OK','SC','SD','TN','TX',
  'UT','WV','WY'
]);

const MIN_POPULATION = 10000;

// =============================================================
// STACK METHOD CONSTANTS (Kay's spec, locked)
// =============================================================
const STACK_LTV = 0.70;
const STACK_RATE = 0.08;          // 8% fixed
const STACK_AMORT_MONTHS = 360;    // 30-year amortization
const STACK_DSCR_TARGET = 1.25;
const STACK_CASH_FLOW_MIN = 200;
const STACK_DEFAULT_TAX_MONTHLY = 350;
const STACK_4PCT_NOTE_PER_100K = 125;  // $125/mo per $100K financed @ 4%

// Repairs per sqft by tier (course-locked)
const REPAIR_TIER_PSF = {
  light: 30,
  mid: 45,
  full: 60,
};

// 8 deal structures (Kay's locked set)
const DEAL_STRUCTURES = {
  CASH: 'Cash',
  F50: 'F50',
  F10: 'F10',
  STACK_PRINCIPAL: 'StackPrincipal',
  INTEREST_ONLY: 'InterestOnly',
  ZERO_DOWN: 'ZeroDown',
  SUBTO: 'SubTo',
  NOVATION: 'Novation',
};

/**
 * Monthly mortgage payment for a fully-amortizing loan
 * Formula: P × (r(1+r)^n) / ((1+r)^n - 1)
 */
function monthlyPI(loanAmount, annualRate, amortMonths) {
  if (!loanAmount || loanAmount <= 0) return 0;
  const r = (annualRate || 0) / 12;
  const n = amortMonths || STACK_AMORT_MONTHS;
  if (r === 0) return loanAmount / n;
  const factor = Math.pow(1 + r, n);
  return (loanAmount * r * factor) / (factor - 1);
}

/**
 * Walk-away decision matrix
 * Returns booleans for each gate plus a kill-switch list
 */
function buildDecisionMatrix(meta) {
  const onePercent = meta.percPass;
  const dscr = (meta.dscr || 0) >= STACK_DSCR_TARGET;
  const cashFlow = (meta.cashFlow || 0) >= STACK_CASH_FLOW_MIN;
  const buyBox = meta.buyBoxPass;
  const kill = [];
  if (!onePercent) kill.push('1% rule fails — property under-rents for price');
  if (!dscr) kill.push(`DSCR ${meta.dscr} < ${STACK_DSCR_TARGET} — lender won't finance`);
  if (!cashFlow) kill.push(`Cash flow $${Math.round(meta.cashFlow)} < $${STACK_CASH_FLOW_MIN}/mo — negative carry`);
  if (!buyBox) kill.push('Buy box fails (red state / HOA / flood / pool / population)');
  return {
    onePercent,
    dscr,
    cashFlow,
    buyBox,
    pass: onePercent && dscr && cashFlow && buyBox,
    kill,
  };
}

/**
 * Calculate all offer structures for a property
 */
function calculate(params) {
  const {
    arv, askingPrice, monthlyRent, repairEstimate = 0,
    desiredProfit = 20000, propertyType = 'turnkey',
    loanAmount, interestRate, insuranceMonthly = 120,
    taxMonthly = STACK_DEFAULT_TAX_MONTHLY,
    existingLoanBalance = 0, existingLoanRate = 0,
    sqft, beds, baths, condition
  } = params;

  // ---- 1% Rule ----
  const onePercentThreshold = askingPrice * 0.01;
  const percRule = (monthlyRent / askingPrice) * 100;
  const percPass = percRule >= 1.0;

  // ---- Cap Rate ----
  const annualRent = monthlyRent * 12;
  const noi = annualRent * 0.6;
  const capRate = (noi / askingPrice) * 100;

  // ---- Lender value (70% LTV) ----
  const lenderValue = Math.round(askingPrice * STACK_LTV);

  // ---- Stack Method: full PITI math (Kay's spec) ----
  // PMT = loan × rate / 12, amortized over 30 years at 8%
  const stackLoan = loanAmount || Math.round(askingPrice * STACK_LTV);
  const stackRate = interestRate || STACK_RATE;
  const monthlyPrincipalInterest = Math.round(monthlyPI(stackLoan, stackRate, STACK_AMORT_MONTHS) * 100) / 100;
  const monthlyPITI = Math.round((monthlyPrincipalInterest + taxMonthly + insuranceMonthly) * 100) / 100;

  // ---- DSCR (Kay's spec: rent / PITI) ----
  const dscr = monthlyPITI > 0 ? (monthlyRent / monthlyPITI) : 0;
  const dscrPass = dscr >= STACK_DSCR_TARGET;

  // ---- Cash Flow (Kay's spec: rent - PITI) ----
  const cashFlow = Math.round((monthlyRent - monthlyPITI) * 100) / 100;
  const cashFlowPass = cashFlow >= STACK_CASH_FLOW_MIN;

  // ---- DSCR Loan (bank-financed variant) ----
  // Lender uses 75% of rent as qualifying income, requires DSCR >= 1.25
  const dscrQualifyingRent = monthlyRent * 0.75;
  const maxMortgage = dscrPass
    ? stackLoan
    : Math.round((dscrQualifyingRent / STACK_DSCR_TARGET - taxMonthly - insuranceMonthly) * (Math.pow(1 + stackRate/12, STACK_AMORT_MONTHS) - 1) / (stackRate/12) / Math.pow(1 + stackRate/12, STACK_AMORT_MONTHS));

  // ---- 4% interest note (carryback math) ----
  const note4PctMonthly = Math.round((askingPrice * STACK_4PCT_NOTE_PER_100K / 100000) * 100) / 100;

  // ---- Cash max offer (course-locked formula) ----
  const cashMax = Math.round(arv * 0.7 - repairEstimate - desiredProfit);

  // ---- F50: 50% at close + 50% in 24-72 months ----
  const f50Offer = Math.round(askingPrice * 0.87);
  const f50Down = Math.round(askingPrice * 0.435);
  const f50Carryback = Math.round(askingPrice * 0.435);

  // ---- F10: 10% at close + 90% in 24 months ----
  const f10Down = Math.round(askingPrice * 0.10);
  const f10Carryback = Math.round(askingPrice * 0.90);

  // ---- Stack w/ Principal: 60% down + 60-month balloon, monthly principal ----
  const stackPrincipalDown = Math.round(askingPrice * 0.60);
  const stackPrincipalCarryback = Math.round(askingPrice * 0.40);
  const stackPrincipalMonthly = Math.round((stackPrincipalCarryback / 60) * 100) / 100;

  // ---- Interest-Only Stack: large down + 84-month IO monthly ----
  const interestOnlyDown = Math.round(askingPrice * 0.50);
  const interestOnlyCarryback = Math.round(askingPrice * 0.50);
  const interestOnlyMonthly = Math.round((interestOnlyCarryback * 0.0525 / 12) * 100) / 100; // 5.25% IO

  // ---- $0 Down: free-and-clear rental, 72mo balloon, 30yr amort ----
  const zeroDownOffer = askingPrice;
  const zeroDownMonthly = monthlyPI(askingPrice, 0.06, 360);

  // ---- SubTo: take over existing debt ----
  const subToCashToSeller = existingLoanBalance > 0
    ? Math.max(0, Math.round(askingPrice - existingLoanBalance))
    : Math.round(askingPrice * 0.10);
  const subToExistingPayment = existingLoanBalance > 0 && existingLoanRate > 0
    ? monthlyPI(existingLoanBalance, existingLoanRate, 360)
    : 0;

  // ---- Novation: assign contract to end buyer, no financing needed ----
  // Capture spread between agreed price and market value
  const novationOffer = askingPrice;
  const novationSpread = Math.max(0, Math.round((arv - askingPrice - repairEstimate) * 100) / 100);

  // ---- Mid-term pivot ----
  const midTermPerRoom = 1500;
  const midTermEstimate = beds ? midTermPerRoom * beds : null;
  const midTermOnePercent = midTermEstimate ? (midTermEstimate / (askingPrice / 100)) : null;

  // ---- 8 DEAL STRUCTURES (Kay's locked set) ----
  const structures = [
    {
      label: 'Cash Offer',
      key: DEAL_STRUCTURES.CASH,
      strategy: 'All cash, fast close',
      offer: cashMax,
      downPayment: cashMax,
      monthlyPayment: 0,
      balloonMonths: null,
      breakdown: `ARV $${arv.toLocaleString()} × 70% = $${Math.round(arv*0.7).toLocaleString()} - $${repairEstimate.toLocaleString()} repairs - $${desiredProfit.toLocaleString()} profit`,
      pros: 'Fastest close. Strongest offer. No debt service.',
      cons: 'Highest cash requirement. Needs deep discount.',
      recommend: propertyType === 'reno',
    },
    {
      label: 'F50 — Half Now, Half Later',
      key: DEAL_STRUCTURES.F50,
      strategy: '50% at close + 50% in 60-72 months',
      offer: f50Offer,
      downPayment: f50Down,
      monthlyPayment: 0,
      balloonMonths: 72,
      breakdown: `$${f50Down.toLocaleString()} now + $${f50Carryback.toLocaleString()} in 72 months. No monthly payments.`,
      pros: 'Lower upfront. Seller gets lump sum later. Strong hedge against repairs.',
      cons: '72-month balloon payment. Needs exit strategy.',
      recommend: propertyType === 'turnkey',
    },
    {
      label: 'F10 — 10% Now',
      key: DEAL_STRUCTURES.F10,
      strategy: '10% at close + 90% in 24 months',
      offer: askingPrice,
      downPayment: f10Down,
      monthlyPayment: 0,
      balloonMonths: 24,
      breakdown: `$${f10Down.toLocaleString()} now + $${f10Carryback.toLocaleString()} in 24 months.`,
      pros: 'Near asking price. Seller feels they got their number.',
      cons: 'Highest total. Tight DSCR on 90% balloon.',
    },
    {
      label: 'Stack w/ Principal — 60% Down',
      key: DEAL_STRUCTURES.STACK_PRINCIPAL,
      strategy: '60% down + 60mo balloon, principal-only monthly',
      offer: askingPrice,
      downPayment: stackPrincipalDown,
      monthlyPayment: stackPrincipalMonthly,
      balloonMonths: 60,
      breakdown: `$${stackPrincipalDown.toLocaleString()} down + $${stackPrincipalMonthly.toLocaleString()}/mo principal-only + $${stackPrincipalCarryback.toLocaleString()} balloon at 60mo.`,
      pros: 'Seller earns monthly income. Lower balloon. We amortize our position.',
      cons: 'Largest down payment. Seller wants income stream.',
    },
    {
      label: 'Interest-Only Stack — 50% Down',
      key: DEAL_STRUCTURES.INTEREST_ONLY,
      strategy: 'Large down + 84mo interest-only',
      offer: askingPrice,
      downPayment: interestOnlyDown,
      monthlyPayment: interestOnlyMonthly,
      balloonMonths: 84,
      breakdown: `$${interestOnlyDown.toLocaleString()} down + $${interestOnlyMonthly.toLocaleString()}/mo IO @ 5.25% + $${interestOnlyCarryback.toLocaleString()} balloon at 84mo.`,
      pros: 'Low monthly carry. Long runway. Easy seller pitch.',
      cons: 'High down payment. Long balloon = risk if exit fails.',
    },
    {
      label: '$0 Down — Free & Clear',
      key: DEAL_STRUCTURES.ZERO_DOWN,
      strategy: '0% down, 72mo balloon, 30yr amort',
      offer: zeroDownOffer,
      downPayment: 0,
      monthlyPayment: Math.round(zeroDownMonthly * 100) / 100,
      balloonMonths: 72,
      breakdown: `$0 down + $${Math.round(zeroDownMonthly).toLocaleString()}/mo (P&I @ 6%, 30yr amort) + full balance balloon at 72mo.`,
      pros: 'No cash needed. Seller walks with full price. Ideal for free-and-clear rentals.',
      cons: 'Monthly debt service required. Capital gains exposure for seller.',
    },
    {
      label: 'Subject-To (SubTo)',
      key: DEAL_STRUCTURES.SUBTO,
      strategy: 'Take over existing mortgage',
      offer: askingPrice,
      downPayment: subToCashToSeller,
      monthlyPayment: Math.round(subToExistingPayment * 100) / 100,
      balloonMonths: 96,
      breakdown: existingLoanBalance > 0
        ? `Take over $${existingLoanBalance.toLocaleString()} mortgage at ${(existingLoanRate*100).toFixed(1)}%. Cash to seller: $${subToCashToSeller.toLocaleString()}. Monthly: $${Math.round(subToExistingPayment).toLocaleString()}.`
        : `No existing loan data. Cash to seller: $${subToCashToSeller.toLocaleString()}.`,
      pros: 'No bank needed. Low cash outlay. Seller walks away clean.',
      cons: 'Due-on-sale risk. Needs seller protection addendum.',
    },
    {
      label: 'Novation',
      key: DEAL_STRUCTURES.NOVATION,
      strategy: 'Capture spread, no financing',
      offer: novationOffer,
      downPayment: 0,
      monthlyPayment: 0,
      balloonMonths: null,
      breakdown: `Capture $${novationSpread.toLocaleString()} spread between ARV $${arv.toLocaleString()} and agreed $${askingPrice.toLocaleString()}. Assign contract to end buyer.`,
      pros: 'No cash. No financing. Pure spread capture. Works on any timeline.',
      cons: 'No spread = no deal. End buyer must be qualified. Slowest close.',
    },
  ];

  // ---- Mid-term pivot analysis ----
  const midTermPivot = !percPass && midTermEstimate ? {
    pivot: true,
    reason: 'Long-term rental below 1% rule. Pivoting to mid-term via Furnished Finder.',
    longTerm: { rent: monthlyRent, threshold: onePercentThreshold, passes: false },
    midTerm: {
      perRoomRate: midTermPerRoom,
      bedrooms: beds,
      estimatedMonthlyRent: midTermEstimate,
      onePercentRule: midTermOnePercent ? midTermOnePercent.toFixed(2) + '%' : null,
      passes: midTermEstimate >= onePercentThreshold,
    }
  } : { pivot: false, reason: percPass ? '1% rule passes' : 'No mid-term data available' };

  // ---- Strategy recommendation ----
  const recommended = structures.find(s => s.recommend) || structures[0];

  // ---- Metadata ----
  const metadata = {
    arv, askingPrice, monthlyRent, annualRent, repairEstimate, desiredProfit, propertyType,
    lenderValue,
    loanAmount: stackLoan,
    interestRate: stackRate,
    monthlyPI: monthlyPrincipalInterest,
    taxMonthly,
    insuranceMonthly,
    monthlyPITI,
    cashFlow,
    cashFlowPass,
    percRule: percRule.toFixed(2) + '%',
    percPass,
    capRate: capRate.toFixed(1) + '%',
    noi: Math.round(noi),
    monthlyNOI: Math.round(noi / 12),
    dscr: Number(dscr.toFixed(2)),
    dscrPass,
    maxMortgage: Math.round(maxMortgage),
    note4PctMonthly,
    onePercentThreshold,
  };

  // ---- Decision matrix (walk-away gates) ----
  const decisionMatrix = buildDecisionMatrix({ ...metadata, buyBoxPass: params.buyBoxPass !== false });

  return {
    metadata,
    structures,
    recommended,
    midTermPivot,
    decisionMatrix,
  };
}

/**
 * Buy box checker
 */
function checkBuyBox({ state, population, hasHOA, hasPool, inFloodZone }) {
  const checks = {
    redState: { pass: RED_STATES.has(state?.toUpperCase()), label: 'Red State (Landlord Friendly)', detail: state },
    population: { pass: population >= MIN_POPULATION, label: `Population ≥ ${MIN_POPULATION.toLocaleString()}`, detail: population },
    noHOA: { pass: !hasHOA, label: 'No HOA', detail: hasHOA ? 'Has HOA' : 'No HOA' },
    noPool: { pass: !hasPool, label: 'No Pool', detail: hasPool ? 'Has Pool' : 'No Pool' },
    noFloodZone: { pass: !inFloodZone, label: 'No Flood Zone', detail: inFloodZone ? 'In Flood Zone' : 'Not in Flood Zone' },
  };

  const allPass = Object.values(checks).every(c => c.pass);
  const failures = Object.entries(checks).filter(([_, c]) => !c.pass).map(([k, c]) => c.label);

  return { checks, allPass, failures };
}

/**
 * Recommend exit strategy based on property characteristics
 */
function recommendStrategy(property) {
  const {
    motivation, equityPercent, interestRate,
    isRental, isOwnedFree, needsRenovation, moveInReady
  } = property;

  if (motivation === 'high') {
    return { strategy: 'Cash', name: 'Cash Offer', condition: 'High motivation (seller wants out fast)', contractType: 'Cash' };
  }
  if (isRental && isOwnedFree) {
    return { strategy: 'ZeroDown', name: '$0 Down', condition: 'Rental AND owned outright / free and clear', contractType: 'SubTo' };
  }
  if (equityPercent < 50 && interestRate && interestRate < 0.06) {
    return { strategy: 'SubjectTo', name: 'Subject-To', condition: 'Low equity AND low interest rate', contractType: 'SubTo' };
  }
  if (equityPercent > 90 && needsRenovation) {
    return { strategy: 'Stack10', name: 'Stack 10% Down', condition: 'Equity over 90% AND needs renovation', contractType: 'Stack' };
  }
  if (equityPercent > 50 && moveInReady) {
    return { strategy: 'Stack50', name: 'Stack 50% Down', condition: 'Equity over 50% AND move-in ready', contractType: 'Stack' };
  }
  if (moveInReady && (motivation === 'none' || motivation === 'low')) {
    return { strategy: 'Novation', name: 'Novation', condition: 'Move-in ready with no motivation', contractType: 'Commercial' };
  }
  return { strategy: 'Stack50', name: 'Stack 50% Down', condition: 'Default recommendation', contractType: 'Stack', fallback: true };
}

module.exports = {
  calculate,
  checkBuyBox,
  recommendStrategy,
  monthlyPI,
  buildDecisionMatrix,
  RED_STATES,
  MIN_POPULATION,
  STACK_LTV,
  STACK_RATE,
  STACK_AMORT_MONTHS,
  STACK_DSCR_TARGET,
  STACK_CASH_FLOW_MIN,
  STACK_DEFAULT_TAX_MONTHLY,
  STACK_4PCT_NOTE_PER_100K,
  REPAIR_TIER_PSF,
  DEAL_STRUCTURES,
};
