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

/**
 * Calculate all offer structures for a property
 */
function calculate(params) {
  const {
    arv, askingPrice, monthlyRent, repairEstimate = 0,
    desiredProfit = 15000, propertyType = 'turnkey',
    loanAmount, interestRate, insuranceMonthly = 120,
    existingLoanBalance = 0, existingLoanRate = 0,
    sqft, beds, baths, condition
  } = params;

  // 1% Rule
  const onePercentThreshold = askingPrice * 0.01;
  const percRule = (monthlyRent / askingPrice) * 100;
  const percPass = percRule >= 1.0;

  // Cap Rate
  const annualRent = monthlyRent * 12;
  const noi = annualRent * 0.6;
  const capRate = (noi / askingPrice) * 100;

  // Lender value (70% LTV)
  const lenderValue = Math.round(askingPrice * 0.7);

  // Interest-only monthly
  const interestOnlyMonthly = loanAmount && interestRate
    ? Math.round((loanAmount * interestRate / 12) * 100) / 100
    : null;

  // DSCR calculation
  const dscrMonthly = monthlyRent * 0.75;
  const maxMortgage = (dscrMonthly / 1.25) * 1000 / 5.6;
  const monthlyDebtService = interestOnlyMonthly || Math.round((maxMortgage * 0.0056 / 1000) * 100) / 100;
  const cashFlow = monthlyRent - monthlyDebtService - insuranceMonthly;
  const dscr = monthlyRent > 0 ? ((monthlyRent * 0.75) / (monthlyDebtService || 1)) : 0;
  const dscrPass = dscr >= 1.25;

  // Cash max offer
  const cashMax = Math.round(arv * 0.7 - repairEstimate - desiredProfit);

  // F50: 50% at close + 50% in 24 months
  const f50Offer = Math.round(askingPrice * 0.87);
  const f50Down = Math.round(askingPrice * 0.435);
  const f50Carryback = Math.round(askingPrice * 0.435);

  // F10: 10% at close + 90% in 24 months
  const f10Down = Math.round(askingPrice * 0.10);
  const f10Carryback = Math.round(askingPrice * 0.90);

  // SubTo: take over existing debt
  const subToCashToSeller = existingLoanBalance > 0
    ? Math.max(0, Math.round(askingPrice - existingLoanBalance))
    : Math.round(askingPrice * 0.10);

  // Mid-term pivot
  const midTermPerRoom = 1500;
  const midTermEstimate = beds ? midTermPerRoom * beds : null;
  const midTermOnePercent = midTermEstimate ? (midTermEstimate / (askingPrice / 100)) : null;

  const structures = [
    {
      label: 'Cash Offer',
      strategy: 'All cash, fast close',
      offer: cashMax,
      breakdown: `ARV $${arv.toLocaleString()} × 70% = $${Math.round(arv*0.7).toLocaleString()} - $${repairEstimate.toLocaleString()} repairs - $${desiredProfit.toLocaleString()} profit`,
      pros: 'Fastest close. Strongest offer. No debt service.',
      cons: 'Highest cash requirement. Needs deep discount.',
      recommend: propertyType === 'reno',
    },
    {
      label: 'F50 — Half Now, Half Later',
      strategy: '50% at close + 50% in 24 months',
      offer: f50Offer,
      breakdown: `$${f50Down.toLocaleString()} now + $${f50Carryback.toLocaleString()} in 24 months`,
      pros: 'Lower upfront. Seller gets lump sum later. Strong hedge against repairs.',
      cons: '24-month balloon payment. Needs exit strategy.',
      recommend: propertyType === 'turnkey',
    },
    {
      label: 'F10 — 10% Now',
      strategy: '10% at close + 90% in 24 months',
      offer: askingPrice,
      breakdown: `$${f10Down.toLocaleString()} now + $${f10Carryback.toLocaleString()} in 24 months`,
      pros: 'Near asking price. Seller feels they got their number.',
      cons: 'Highest total. Tight DSCR on 90% balloon.',
    },
    {
      label: 'DSCR Loan',
      strategy: 'Bank financing based on rental income',
      offer: askingPrice,
      breakdown: `Max mortgage ~$${Math.round(maxMortgage).toLocaleString()}. DSCR: ${dscr.toFixed(2)}x (need ≥1.25). Annual debt capacity: $${Math.round(dscrMonthly*12).toLocaleString()}`,
      pros: 'Bank financing. Leveraged return.',
      cons: 'Rate dependent. Appraisal required.',
    },
    {
      label: 'Subject-To (SubTo)',
      strategy: 'Take over existing mortgage',
      offer: askingPrice,
      breakdown: existingLoanBalance > 0
        ? `Take over $${existingLoanBalance.toLocaleString()} mortgage at ${(existingLoanRate*100).toFixed(1)}%. Cash to seller: $${subToCashToSeller.toLocaleString()}.`
        : `No existing loan data. Cash to seller: $${subToCashToSeller.toLocaleString()}.`,
      pros: 'No bank needed. Low cash outlay. Seller walks away clean.',
      cons: 'Due-on-sale risk. Needs seller protection addendum.',
    },
    {
      label: 'Seller Finance',
      strategy: 'Down payment + monthly to seller',
      offer: askingPrice,
      breakdown: `Down: 15-20%. Seller holds note at 5-7% for 15-30 years. No bank needed.`,
      pros: 'No bank. Flexible terms. Tax benefits for seller.',
      cons: 'Seller must be willing to hold paper.',
    },
  ];

  // Mid-term pivot analysis
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

  // Strategy recommendation
  const recommended = structures.find(s => s.recommend) || structures[0];

  return {
    metadata: {
      arv, askingPrice, monthlyRent, annualRent, repairEstimate, desiredProfit, propertyType,
      lenderValue, interestOnlyMonthly,
      cashFlow: Math.round(cashFlow * 100) / 100,
      cashFlowPass: cashFlow >= 200,
      insuranceDefault: insuranceMonthly,
      percRule: percRule.toFixed(2) + '%',
      percPass,
      capRate: capRate.toFixed(1) + '%',
      noi: Math.round(noi),
      monthlyNOI: Math.round(noi / 12),
      dscr: dscr.toFixed(2),
      dscrPass,
      maxMortgage: Math.round(maxMortgage),
      onePercentThreshold,
    },
    structures,
    recommended,
    midTermPivot,
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

module.exports = { calculate, checkBuyBox, recommendStrategy, RED_STATES, MIN_POPULATION };
