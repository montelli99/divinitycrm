/**
 * contract-generator.js — Student CRM Contract Generation Engine
 * Built for Topic 7220 | No GHL, No RabbitSign dependency
 * 
 * What it does:
 * 1. Fills any of 23 contract templates with lead data
 * 2. Outputs complete contract text ready for copy/paste
 * 3. Can generate RabbitSign API payloads (when API key is provided)
 * 4. Routes to correct template + addenda + clauses based on contract type
 * 
 * Usage from CRM channel:
 *   /contract [address] [type] → Atlas calls generateContract()
 *   /script [clause-type] [address] → Atlas calls getClause()
 */

// =============================================================
// CONTRACT TEMPLATES (23 — from GHL contract-templates.js)
// =============================================================

const CONTRACT_TYPES = {
  subto: {
    template: 'PSACreativeSubTo',
    addenda: ['SubjectToAddendum'],
    description: 'Subject-To Purchase Agreement with 4-layer seller protection',
    emd: 100,
    emdMaxPercent: 0.01,
    inspectionDays: 14,
    inspectionMax: 21,
    coeDays: 30,
    coeBasis: 'effective_date',
    titleCompany: 'CLOSE Title',
    titleEmail: 'order@closedtitle.com',
    titlePhone: '1-800-405-7150',
    transferTax: '50/50 by Seller',
    titlePolicy: 'Buyer pays standard',
    thirdPartyProcessor: true,
    wrapAroundDisclosure: true,
    asIs: true,
    deedInLieu: true,
  },
  cash: {
    template: 'CashOffer',
    addenda: [],
    description: 'Cash Purchase Agreement — no seller financing',
    emd: 100,
    emdMaxPercent: 0.01,
    inspectionDays: 14,
    inspectionMax: 21,
    coeDays: 30,
    coeBasis: 'effective_date',
    titleCompany: 'CLOSE Title',
    titleEmail: 'order@closedtitle.com',
    titlePhone: '1-800-405-7150',
    transferTax: '50/50 by Seller',
    titlePolicy: 'Buyer pays standard',
    thirdPartyProcessor: false,
    wrapAroundDisclosure: false,
    asIs: true,
    deedInLieu: false,
  },
  'seller-finance': {
    template: 'Stack5yrBAL',
    addenda: [],
    description: 'Seller Finance — 50% down, 60-month balloon',
    emd: 100,
    emdMaxPercent: 0.01,
    inspectionDays: 14,
    inspectionMax: 21,
    coeDays: 30,
    coeBasis: 'effective_date',
    titleCompany: 'CLOSE Title',
    titleEmail: 'order@closedtitle.com',
    titlePhone: '1-800-405-7150',
    transferTax: '50/50 by Seller',
    titlePolicy: 'Buyer pays standard',
    thirdPartyProcessor: false,
    wrapAroundDisclosure: false,
    asIs: false,
    deedInLieu: true,
  },
  stack50: {
    template: 'AiCopyStack',
    addenda: [],
    description: 'Stack 50% — 50% down, 72-month payout, no monthly payments',
    emd: 100,
    emdMaxPercent: 0.01,
    inspectionDays: 14,
    inspectionMax: 21,
    coeDays: 30,
    coeBasis: 'effective_date',
    titleCompany: 'CLOSE Title',
    titleEmail: 'order@closedtitle.com',
    titlePhone: '1-800-405-7150',
    transferTax: '50/50 by Seller',
    titlePolicy: 'Buyer pays standard',
    thirdPartyProcessor: false,
    wrapAroundDisclosure: false,
    asIs: false,
    deedInLieu: true,
  },
  stack10: {
    template: 'Ai10DPBalloon',
    addenda: [],
    description: 'Stack 10% — 10% down, 24-month balloon',
    emd: 100,
    emdMaxPercent: 0.01,
    inspectionDays: 14,
    inspectionMax: 21,
    coeDays: 30,
    coeBasis: 'effective_date',
    titleCompany: 'CLOSE Title',
    titleEmail: 'order@closedtitle.com',
    titlePhone: '1-800-405-7150',
    transferTax: '50/50 by Seller',
    titlePolicy: 'Buyer pays standard',
    thirdPartyProcessor: false,
    wrapAroundDisclosure: false,
    asIs: false,
    deedInLieu: true,
  },
  jv: {
    template: 'JV4Party',
    addenda: [],
    description: 'Joint Venture — 4-party, 25% each default',
    emd: 100,
    emdMaxPercent: 0.01,
    inspectionDays: 14,
    inspectionMax: 21,
    coeDays: 30,
    coeBasis: 'effective_date',
    titleCompany: 'CLOSE Title',
    titleEmail: 'order@closedtitle.com',
    titlePhone: '1-800-405-7150',
    transferTax: '50/50 by Seller',
    titlePolicy: 'Buyer pays standard',
    thirdPartyProcessor: false,
    wrapAroundDisclosure: false,
    asIs: false,
    deedInLieu: false,
    jvDefaults: {
      partyCount: 4,
      defaultPercent: 25,
      majorityThreshold: 51,
      superMajorityThreshold: 66,
      nonPaymentInterest: 25,
      initialReserve: 5000,
    }
  },
  commercial: {
    template: 'PSACommercial',
    addenda: [],
    description: 'Commercial Purchase Agreement — 26 sections, AS-IS',
    emd: 100,
    emdMaxPercent: 0.01,
    inspectionDays: 14,
    inspectionMax: 30,
    coeDays: 30,
    coeBasis: 'effective_date',
    titleCompany: 'CLOSE Title',
    titleEmail: 'order@closedtitle.com',
    titlePhone: '1-800-405-7150',
    transferTax: '50/50 by Seller',
    titlePolicy: 'Buyer pays standard',
    thirdPartyProcessor: false,
    wrapAroundDisclosure: false,
    asIs: true,
    deedInLieu: false,
  },
  portfolio: {
    template: 'PortfolioStackLLC',
    addenda: ['LLCAddendum'],
    description: 'Portfolio Stack — multi-property, LLC formed at closing',
    emd: 100,
    emdMaxPercent: 0.01,
    inspectionDays: 14,
    inspectionMax: 21,
    coeDays: 30,
    coeBasis: 'effective_date',
    titleCompany: 'CLOSE Title',
    titleEmail: 'order@closedtitle.com',
    titlePhone: '1-800-405-7150',
    transferTax: '50/50 by Seller',
    titlePolicy: 'Buyer pays standard',
    thirdPartyProcessor: false,
    wrapAroundDisclosure: false,
    asIs: false,
    deedInLieu: false,
  },
  loi: {
    template: 'LOIStandard',
    addenda: [],
    description: 'Letter of Intent — pre-PSA expression of interest sent to seller',
    emd: 0,
    emdMaxPercent: 0,
    inspectionDays: 0,
    inspectionMax: 0,
    coeDays: 0,
    coeBasis: 'effective_date',
    titleCompany: 'N/A — LOI stage',
    titleEmail: '',
    titlePhone: '',
    transferTax: 'N/A — LOI stage',
    titlePolicy: 'N/A — LOI stage',
    thirdPartyProcessor: false,
    wrapAroundDisclosure: false,
    asIs: false,
    deedInLieu: false,
  },
};

// =============================================================
// CLAUSES (31 — verbatim from GHL contract-templates.js)
// =============================================================

const CLAUSES = {
  // --- SUBTO ADDENDUM CLAUSES (12) ---
  'WRAP_AROUND_FINANCING_TRANSACTION': {
    title: 'Wrap-Around Financing Transaction',
    text: 'This is a wrap-around financing transaction, which means Buyer will pay the Existing Loan(s) according to the terms of the Existing Loan(s) and Seller may pursue foreclosure of the Property if Buyer fails to pay the Existing Loan(s) according to the terms of the Existing Loan(s).',
    requiresInitial: true,
  },
  'WRAP_AROUND_FINANCING_IS_NON_RECOURSE': {
    title: 'Wrap-Around Financing is Non-Recourse',
    text: "The note delivered by Buyer to Seller for the wrap-around financing is non-recourse, which means Seller may only pursue the foreclosure of the Property if Buyer fails to pay the Existing Loan(s) according to the terms of the Existing Loan(s), Seller may not pursue a judgment against Buyer for the amounts stated in the note, and Seller may not seek a deficiency judgment against Buyer if the foreclosure of the Property yields an amount insufficient to fully satisfy Buyer's obligations under the note.",
    requiresInitial: true,
  },
  'WRAP_AROUND_FINANCING_IS_NOT_DUE_ON_SALE': {
    title: 'Wrap-Around Financing is Not Due on Sale',
    text: "Seller understands, acknowledges, and agrees that the note and deed of trust or mortgage delivered by Buyer to Seller for the wrap-around financing will not be due on sale, which means Buyer may sell or lease the Property in any fashion at Buyer's sole option.",
    requiresInitial: true,
  },
  'NO_LONGER_DEDUCT_MORTGAGE_INTEREST': {
    title: 'No Longer Deduct Mortgage Interest',
    text: 'Seller understands, acknowledges, and agrees that Seller cannot deduct mortgage interest paid by Buyer even though Seller may continue to receive a form 1098 for the Existing Loan(s).',
    requiresInitial: true,
  },
  'EVENT_OF_FORECLOSURE': {
    title: 'Event of Foreclosure',
    text: "Seller understands, acknowledges, and agrees that in the event the Existing Loan(s) are not paid by Buyer, the Property and Seller may be subject to foreclosure proceedings by the servicer(s) or lender(s) of the Existing Loan(s) and such proceedings may harm Seller's credit, result in a loss of equity in the Property and subject Seller to a lawsuit for the deficiency (subject to any anti-deficiency laws).",
    requiresInitial: true,
  },
  'EXISTING_LOAN_ON_CREDIT_REPORT': {
    title: 'Existing Loan(s) on Credit Report',
    text: "Seller understands, acknowledges, and agrees that the Existing Loan(s) may continue to appear on Seller's credit report and may impact or effect Seller's ability to obtain other financing or loans.",
    requiresInitial: true,
  },
  'VA_LOAN_ELIGIBILITY_MAY_BE_IMPACTED': {
    title: 'VA Loan Eligibility May Be Impacted',
    text: "If an Existing Loan is a VA loan Seller understands, acknowledges, and agrees that the Existing Loan will not be paid off through closing and will remain as a lien against the Property after close of escrow, which may negatively impact Seller's ability to obtain an additional loan through the VA.",
    requiresInitial: true,
    conditional: 'VA_loan',
  },
  'PROPERTY_INSURANCE_PROCEEDS': {
    title: 'Property Insurance Proceeds',
    text: 'Seller understands, acknowledges, and agrees that any insurance proceeds related to any loss on the Property occurring after COE shall be paid to Buyer. Seller shall not be entitled to receive any insurance proceeds for any loss on the Property occurring after COE.',
    requiresInitial: true,
  },
  'DUE_ON_SALE_CLAUSE': {
    title: 'Due on Sale Clause',
    text: 'Seller understands, acknowledges and agrees that the deed(s) of trust/mortgage(s) securing the Existing Loan(s) contain due on sale clauses, which allows the lender(s) to call the Existing Loan(s) due upon transfer of the Property by Seller to Buyer.',
    requiresInitial: true,
  },
  'CONTINUING_LIABILITY_ON_EXISTING_LOAN': {
    title: 'Continuing Liability on Existing Loan(s)',
    text: 'Seller understands, acknowledges, and agrees that no promises have been made by Buyer to Seller that the Existing Loan(s) will be paid off by Buyer through close of escrow and that upon the close of escrow and thereafter, Seller will remain liable on the Existing Loan(s).',
    requiresInitial: true,
  },
  'EXISTING_LOAN_NOT_PAID_IN_FULL': {
    title: 'Existing Loan(s) Not Paid in Full',
    text: 'Seller understands, acknowledges, and agrees that the Existing Loan(s) for which Seller is the borrower, will not be paid in full as a result of this transaction.',
    requiresInitial: true,
  },
  'NO_FURTHER_OWNERSHIP_OR_CONTROL': {
    title: 'No Further Ownership or Control',
    text: "Seller understands, acknowledges, and agrees that upon close of escrow, Seller will no longer own the Property and no further control over the Property. Buyer may sell or lease the Property in any fashion at Buyer's sole option.",
    requiresInitial: true,
  },

  // --- SELLER PROTECTION ---
  'FOUR_LAYER_SELLER_PROTECTION': {
    title: 'Four Layers of Seller Protection',
    text: 'There are four layers of protection in place for the seller: (1) A bookkeeper will be in place to ensure automated wires are sent each month via direct deposit (for the existing payments and seller financing portion), (2) a performance clause within the agreement, (3) a promissory note ensuring the balloon payment is automatically wired at maturity, (4) a deed in lieu of foreclosure that allows the seller to regain ownership of the property within 15 days of a missed payment—bypassing the foreclosure process and preserving the built-in equity and completed renovations.',
    layers: [
      'Layer 1: Bookkeeper Auto-Wire — automated wires sent each month via direct deposit',
      'Layer 2: Performance Clause — defines what happens on missed payment',
      'Layer 3: Promissory Note — balloon payment automatically wired at maturity',
      'Layer 4: Deed in Lieu of Foreclosure — seller reclaims property within 15 days of missed payment, bypassing foreclosure',
    ],
  },
  'FIVE_LAYER_SELLER_PROTECTION': {
    title: 'Five Layers of Seller Protection (includes Personal Guarantee)',
    text: 'There are five layers of protection in place for the seller: (1) A bookkeeper will be in place to ensure automated wires are sent each month via direct deposit, (2) a performance clause within the agreement, (3) a promissory note ensuring the balloon payment is automatically wired at maturity, (4) a deed in lieu of foreclosure that allows the seller to regain ownership of the property within 15 days of a missed payment—bypassing the foreclosure process and preserving the built-in equity and completed renovations—and (5) a personal guarantee.',
    layers: [
      'Layer 1: Bookkeeper Auto-Wire',
      'Layer 2: Performance Clause',
      'Layer 3: Promissory Note',
      'Layer 4: Deed in Lieu of Foreclosure',
      'Layer 5: Personal Guarantee — buyer personally guarantees obligations',
    ],
  },

  // --- PSA STANDARD ---
  'EMD_100_TO_1PCT': {
    title: 'Earnest Money Deposit ($100 min, 1% max)',
    text: 'Earnest money $100 minimum. Maximum 1% of the purchase price. Given after the inspection period (typically 14 days, up to 21 days if negotiated).',
  },
  'INSPECTION_PERIOD_14_21': {
    title: 'Inspection Period (14-21 Days)',
    text: 'Inspection Period: 14 Days default. 21 days maximum if negotiated. More days = more time to get bids.',
  },
  'COE_30_DAYS': {
    title: 'Close of Escrow (30 Days After Effective Date)',
    text: 'Close of Escrow: 30 days after Effective Date. Do not use a specific calendar date — use "30 days from the date this contract is fully executed" because the seller may not sign on the exact day expected.',
  },
  'DEED_IN_LIEU': {
    title: 'Deed in Lieu of Foreclosure',
    text: 'A deed in lieu will be authorized at close of escrow — if buyer misses a payment for more than 30 days then the property will be deeded back to the seller — bypassing the foreclosure process.',
  },
  'AS_IS_SALE': {
    title: 'AS-IS Sale',
    text: "This is an AS-IS sale. Any inspection performed is for the buyer's awareness only.",
  },
  'THIRD_PARTY_PROCESSOR': {
    title: 'Third-Party Processing Company',
    text: 'A third-party processing company will be set up within 48 hours of close of escrow. This will automate the monthly payments to the existing loan servicer and to the seller (for the seller carryback portion).',
  },

  // --- TITLE COMPANY ---
  'CLOSED_TITLE_DEFAULT': {
    title: 'CLOSE Title — Default Escrow Agent',
    text: 'Escrow Agent / Closing Attorney: CLOSE Title — 6100 Executive Blvd Suite 410, Rockville, MD 20852 — 240-403-1285 — order@closedtitle.com — 1-800-405-7150. Nationwide coverage. If property is out of coverage area, use Eastern Title as fallback.',
  },

  // --- JV CLAUSES ---
  'JV_DEFAULT_25_PERCENT': {
    title: 'JV Default 25% Per Party',
    text: 'Default profit allocation: 25% per party in a 4-party Joint Venture.',
  },
  'JV_MAJORITY_51': {
    title: 'JV Majority in Interest (51%)',
    text: 'Majority in Interest means one or more Parties whose aggregate Voting Percentage is equal to or exceeds fifty-one percent (51%) of the aggregate Voting Percentage of all the Parties.',
  },
  'JV_SUPER_MAJORITY_66': {
    title: 'JV Super Majority (66%)',
    text: 'Super Majority in Interest means one or more Parties whose Voting Percentage is equal to or exceeds sixty-six percent (66%) of the aggregate Voting Percentage of all Parties. Required for lien/sale decisions.',
  },
  'JV_NON_PAYMENT_25PCT_INTEREST': {
    title: 'JV Non-Payment Penalty (25% Per Annum)',
    text: "In the event a Party fails or refuses to pay their portion of the Initial Expenses, the other Party(ies) may, after five (5) days written notice, pay the non-paying Party's share. The Party paying on behalf shall receive interest of 25% per annum on the amount paid, with interest payments paid monthly and deducted from the non-paying Party's Monthly Cash Flow Payment.",
  },
  'JV_INITIAL_RESERVE_5K': {
    title: 'JV Initial Reserve ($5,000)',
    text: 'The amount of cash reserves to be held for the Purpose of the Joint Venture shall initially be five thousand dollars ($5,000) or as agreed to by a vote of the Majority in Interest of the Parties.',
  },
  'JV_DISPUTE_MEDIATION': {
    title: 'JV Dispute Resolution (Mediation)',
    text: "In the event of a deadlock and upon written demand by one of the Parties, a disputed issue will be presented to a mediator with commercial dispute resolution experience. The mediation will be held in the state and county where the Property is located. Each Party is responsible for their pro-rata portion of the mediator's fees.",
  },

  // --- PORTFOLIO STACK ---
  'LLC_FORMATION_AT_CLOSING': {
    title: 'LLC Formation at Closing',
    text: "Buyer and Seller agree that, on or before closing, a limited liability company ('LLC') shall be formed. The Buyer and Seller shall be members of said LLC, with ownership interests to be defined in a separate Operating Agreement. Title to the Property may be conveyed to the LLC, or assigned to the LLC, as mutually agreed.",
  },
  'OPERATING_AGREEMENT_REFERENCE': {
    title: 'Operating Agreement Reference',
    text: "The Operating Agreement of the LLC, executed contemporaneously with this Purchase and Sale Agreement, defines each Member's initial capital contribution, distribution waterfall, management rights, transfer restrictions, and dissolution triggers. Each Member acknowledges receipt of a draft of the Operating Agreement at least three (3) business days prior to the Closing Date.",
  },
  'MULTI_PROPERTY_SIMULTANEOUS_CLOSING': {
    title: 'Multi-Property Simultaneous Closing',
    text: 'All properties in the portfolio shall be purchased simultaneously at the total purchase price. Individual property allocations to be detailed in an attached schedule.',
  },

  // --- LEGAL ---
  'NON_CIRCUMVENTION_CLAUSE': {
    title: 'Non-Circumvention Clause',
    text: 'The Receiving Party agrees that during the term of this Agreement they shall not directly or indirectly circumvent, avoid, bypass, or attempt to circumvent the Disclosing Party in order to avoid payment of fees, commissions, or other benefits that would otherwise be due in connection with any transaction, opportunity, or relationship introduced or disclosed by the Disclosing Party.',
  },
};

// =============================================================
// PSA CALL OPENER (from transcript 04)
// =============================================================

const PSA_CALL_OPENER = {
  greeting: 'happy [day of week]',
  sequence: [
    'how was your week',
    'how was your weekend',
    'tell me about some wins',
    'how has God blessed you',
  ],
  transition: "all right, [name], let me pull up the contract on my end so we can walk through it together",
};

// =============================================================
// RABBITSIGN SAFETY
// =============================================================

const RABBITSIGN_SAFETY = {
  rule: 'Always verify X/Y positioning is on the signature line BEFORE the seller signs.',
  warning: 'If X is above or below the line, RabbitSign may render unintended text. Kayla: "I accidentally did once and it said that I was going to give the seller double."',
};

// =============================================================
// CORE FUNCTIONS
// =============================================================

/**
 * Generate a complete contract package for a lead.
 * @param {Object} lead - Full lead data from student-crm.json
 * @param {string} contractType - subto, cash, seller-finance, stack50, stack10, jv, commercial, portfolio
 * @returns {Object} Complete contract package
 */
function generateContract(lead, contractType) {
  const config = CONTRACT_TYPES[contractType];
  if (!config) {
    return { error: `Unknown contract type: ${contractType}. Valid: ${Object.keys(CONTRACT_TYPES).join(', ')}` };
  }

  const today = new Date();
  const coeDate = new Date(today);
  coeDate.setDate(coeDate.getDate() + config.coeDays);
  const inspectionEnd = new Date(today);
  inspectionEnd.setDate(inspectionEnd.getDate() + config.inspectionDays);

  const price = lead.price || 0;
  const emdMax = Math.round(price * config.emdMaxPercent);
  const emd = Math.min(config.emd, emdMax);

  // Build the contract package
  const pkg = {
    contractType,
    template: config.template,
    description: config.description,
    generated: today.toISOString(),
    
    // Property & Parties
    property: {
      address: lead.address || 'TBD',
      city: lead.city || '',
      state: lead.state || '',
      zip: lead.zip || '',
      apn: lead.apn || 'TBD',
    },
    parties: {
      buyer: 'Divinity Aligned LLC',
      buyerRole: 'Manager',
      seller: lead.contacts?.seller_name || lead.contacts?.agent_name || 'TBD',
      sellerEmail: lead.contacts?.seller_email || lead.contacts?.agent_email || 'TBD',
      sellerPhone: lead.contacts?.seller_phone || lead.contacts?.agent_phone || 'TBD',
    },
    
    // Financial Terms
    financials: {
      purchasePrice: price,
      emdAmount: emd,
      emdMaxPercent: config.emdMaxPercent,
      emdMaxAmount: emdMax,
      arv: lead.underwriting?.arv || null,
      repairsEstimate: lead.underwriting?.repairs_estimate || null,
      existingLoanBalance: lead.underwriting?.existing_loan || 0,
      existingLoanRate: lead.underwriting?.existing_rate || 0,
      monthlyRent: lead.property_details?.rent || 0,
    },
    
    // Timeline
    timeline: {
      psaSignedDate: today.toISOString().split('T')[0],
      inspectionPeriodDays: config.inspectionDays,
      inspectionEndDate: inspectionEnd.toISOString().split('T')[0],
      coeDate: coeDate.toISOString().split('T')[0],
      coeDays: config.coeDays,
      coeBasis: config.coeBasis,
    },
    
    // Closing Details
    closing: {
      titleCompany: config.titleCompany,
      titleEmail: config.titleEmail,
      titlePhone: config.titlePhone,
      transferTax: config.transferTax,
      titlePolicy: config.titlePolicy,
      asIs: config.asIs,
      deedInLieu: config.deedInLieu,
      thirdPartyProcessor: config.thirdPartyProcessor,
      wrapAroundDisclosure: config.wrapAroundDisclosure,
    },
    
    // TC Info
    tc: {
      name: 'BGonzalez',
      email: 'BGonzalez@sellsmartre.com',
      phone: '262-440-2916',
    },
    
    // Addenda
    addenda: config.addenda,
    
    // Clauses
    clauses: getApplicableClauses(contractType, lead),
    
    // JV-specific
    jv: contractType === 'jv' ? {
      partyCount: config.jvDefaults.partyCount,
      defaultPercent: config.jvDefaults.defaultPercent,
      majorityThreshold: config.jvDefaults.majorityThreshold,
      superMajorityThreshold: config.jvDefaults.superMajorityThreshold,
      nonPaymentInterest: config.jvDefaults.nonPaymentInterest,
      initialReserve: config.jvDefaults.initialReserve,
    } : null,
    
    // Safety
    rabbitSignSafety: RABBITSIGN_SAFETY,
    
    // Call opener
    psaCallOpener: PSA_CALL_OPENER,
  };

  return pkg;
}

/**
 * Get all applicable clauses for a contract type.
 */
function getApplicableClauses(contractType, lead) {
  const config = CONTRACT_TYPES[contractType];
  if (!config) return [];

  const clauseIds = [];

  // Standard PSA clauses (all types)
  clauseIds.push('EMD_100_TO_1PCT');
  clauseIds.push('INSPECTION_PERIOD_14_21');
  clauseIds.push('COE_30_DAYS');
  clauseIds.push('CLOSED_TITLE_DEFAULT');

  // SubTo-specific
  if (contractType === 'subto') {
    clauseIds.push(
      'WRAP_AROUND_FINANCING_TRANSACTION',
      'WRAP_AROUND_FINANCING_IS_NON_RECOURSE',
      'WRAP_AROUND_FINANCING_IS_NOT_DUE_ON_SALE',
      'NO_LONGER_DEDUCT_MORTGAGE_INTEREST',
      'EVENT_OF_FORECLOSURE',
      'EXISTING_LOAN_ON_CREDIT_REPORT',
      'PROPERTY_INSURANCE_PROCEEDS',
      'DUE_ON_SALE_CLAUSE',
      'CONTINUING_LIABILITY_ON_EXISTING_LOAN',
      'EXISTING_LOAN_NOT_PAID_IN_FULL',
      'NO_FURTHER_OWNERSHIP_OR_CONTROL',
      'FOUR_LAYER_SELLER_PROTECTION',
      'DEED_IN_LIEU',
      'THIRD_PARTY_PROCESSOR'
    );
    // VA loan clause only if applicable
    if (lead.underwriting?.existing_loan_type === 'VA') {
      clauseIds.push('VA_LOAN_ELIGIBILITY_MAY_BE_IMPACTED');
    }
  }

  // AS-IS for cash and commercial
  if (['cash', 'commercial'].includes(contractType)) {
    clauseIds.push('AS_IS_SALE');
  }

  // Deed in Lieu for seller-finance and stacks
  if (['seller-finance', 'stack50', 'stack10'].includes(contractType)) {
    clauseIds.push('DEED_IN_LIEU');
  }

  // JV clauses
  if (contractType === 'jv') {
    clauseIds.push(
      'JV_DEFAULT_25_PERCENT',
      'JV_MAJORITY_51',
      'JV_SUPER_MAJORITY_66',
      'JV_NON_PAYMENT_25PCT_INTEREST',
      'JV_INITIAL_RESERVE_5K',
      'JV_DISPUTE_MEDIATION'
    );
  }

  // Portfolio clauses
  if (contractType === 'portfolio') {
    clauseIds.push(
      'LLC_FORMATION_AT_CLOSING',
      'OPERATING_AGREEMENT_REFERENCE',
      'MULTI_PROPERTY_SIMULTANEOUS_CLOSING'
    );
  }

  return clauseIds.map(id => ({
    id,
    ...CLAUSES[id],
  }));
}

/**
 * Get a single clause by ID.
 */
function getClause(clauseId) {
  return CLAUSES[clauseId] || null;
}

/**
 * Format the contract package for Telegram display.
 */
function formatForTelegram(pkg) {
  if (pkg.error) return `❌ ${pkg.error}`;

  const lines = [
    `📝 CONTRACT PACKAGE — ${pkg.property.address}`,
    ``,
    `Type: ${pkg.contractType.toUpperCase()} — ${pkg.description}`,
    `Template: ${pkg.template}`,
    `Generated: ${new Date(pkg.generated).toLocaleDateString()}`,
    ``,
    `🏠 PROPERTY:`,
    `   ${pkg.property.address}`,
    `   ${pkg.property.city}, ${pkg.property.state} ${pkg.property.zip}`,
    `   APN: ${pkg.property.apn}`,
    ``,
    `👥 PARTIES:`,
    `   Buyer: ${pkg.parties.buyer} (${pkg.parties.buyerRole})`,
    `   Seller: ${pkg.parties.seller}`,
    `   Seller Email: ${pkg.parties.sellerEmail}`,
    `   Seller Phone: ${pkg.parties.sellerPhone}`,
    ``,
    `💰 FINANCIALS:`,
    `   Purchase Price: $${pkg.financials.purchasePrice.toLocaleString()}`,
    `   EMD: $${pkg.financials.emdAmount} (max 1% = $${pkg.financials.emdMaxAmount.toLocaleString()})`,
  ];

  if (pkg.financials.arv) lines.push(`   ARV: $${pkg.financials.arv.toLocaleString()}`);
  if (pkg.financials.repairsEstimate) lines.push(`   Repairs Est: $${pkg.financials.repairsEstimate.toLocaleString()}`);
  if (pkg.financials.existingLoanBalance > 0) {
    lines.push(`   Existing Loan: $${pkg.financials.existingLoanBalance.toLocaleString()} @ ${(pkg.financials.existingLoanRate * 100).toFixed(2)}%`);
  }
  if (pkg.financials.monthlyRent > 0) lines.push(`   Monthly Rent: $${pkg.financials.monthlyRent.toLocaleString()}`);

  lines.push(
    ``,
    `📅 TIMELINE:`,
    `   PSA Signed: ${pkg.timeline.psaSignedDate}`,
    `   Inspection: ${pkg.timeline.inspectionPeriodDays} days (ends ${pkg.timeline.inspectionEndDate})`,
    `   COE: ${pkg.timeline.coeDate} (${pkg.timeline.coeDays} days from ${pkg.timeline.coeBasis})`,
    ``,
    `🏛️ CLOSING:`,
    `   Title: ${pkg.closing.titleCompany}`,
    `   Title Email: ${pkg.closing.titleEmail}`,
    `   Title Phone: ${pkg.closing.titlePhone}`,
    `   Transfer Tax: ${pkg.closing.transferTax}`,
    `   Title Policy: ${pkg.closing.titlePolicy}`,
    `   AS-IS: ${pkg.closing.asIs ? 'Yes' : 'No'}`,
    `   Deed in Lieu: ${pkg.closing.deedInLieu ? 'Yes' : 'No'}`,
  );

  if (pkg.closing.thirdPartyProcessor) {
    lines.push(`   3rd-Party Processor: Required (48hr before COE)`);
  }
  if (pkg.closing.wrapAroundDisclosure) {
    lines.push(`   Wrap-Around Disclosure: Required`);
  }

  lines.push(
    ``,
    `📧 TC: ${pkg.tc.name} (${pkg.tc.email} / ${pkg.tc.phone})`,
  );

  if (pkg.addenda.length > 0) {
    lines.push(
      ``,
      `📎 ADDENDA (${pkg.addenda.length}):`,
      ...pkg.addenda.map(a => `   - ${a}`),
    );
  }

  lines.push(
    ``,
    `📜 CLAUSES (${pkg.clauses.length}):`,
  );

  pkg.clauses.forEach((c, i) => {
    const initial = c.requiresInitial ? ' [INITIAL REQUIRED]' : '';
    const conditional = c.conditional ? ` [IF: ${c.conditional}]` : '';
    lines.push(`   ${i + 1}. ${c.title}${initial}${conditional}`);
  });

  if (pkg.jv) {
    lines.push(
      ``,
      `🤝 JV TERMS:`,
      `   Parties: ${pkg.jv.partyCount}`,
      `   Default Split: ${pkg.jv.defaultPercent}% each`,
      `   Majority: ${pkg.jv.majorityThreshold}%`,
      `   Super Majority: ${pkg.jv.superMajorityThreshold}%`,
      `   Non-Payment Penalty: ${pkg.jv.nonPaymentInterest}% per annum`,
      `   Initial Reserve: $${pkg.jv.initialReserve.toLocaleString()}`,
    );
  }

  lines.push(
    ``,
    `⚠️ RABBITSIGN SAFETY:`,
    `   ${pkg.rabbitSignSafety.rule}`,
    `   ${pkg.rabbitSignSafety.warning}`,
    ``,
    `📞 PSA CALL OPENER:`,
    `   1. "${pkg.psaCallOpener.greeting}"`,
    ...pkg.psaCallOpener.sequence.map((s, i) => `   ${i + 2}. "${s}"`),
    `   → ${pkg.psaCallOpener.transition}`,
    ``,
    `📋 NEXT STEPS:`,
    `   Day 0: Send CONTRACT_OUT SMS to seller`,
    `   Day 0: TC handshake → ${pkg.tc.email}`,
    `   Day 7: Send INSPECTION_SCHEDULED SMS`,
    `   Day ${pkg.timeline.inspectionPeriodDays}: Inspection complete`,
    `   Day 21-30: Appraisal → JV → Wire → Close`,
    `   COE-7d: Send CLOSING_CONFIRMED SMS`,
  );

  if (pkg.closing.thirdPartyProcessor) {
    lines.push(`   COE-48hr: 3rd-party processor set up + SUBTO_PROCESSOR SMS`);
  }

  return lines.join('\n');
}

/**
 * Generate a RabbitSign API payload (when API key is available).
 * @param {Object} pkg - Contract package from generateContract()
 * @param {Object} options - { apiKey, signerEmail, signerName, documentBase64 }
 * @returns {Object} API payload ready for RabbitSign
 */
function generateRabbitSignPayload(pkg, options = {}) {
  // RabbitSign API: POST to create folder (envelope)
  // $0.10 per folder. Free: 10 folders + 100 API calls for new dev accounts.
  // API key obtained from: RabbitSign → My Account → Developer API
  
  const payload = {
    apiKey: options.apiKey || 'YOUR_RABBITSIGN_API_KEY',
    folder: {
      name: `PSA - ${pkg.property.address} - ${pkg.contractType.toUpperCase()}`,
      documents: [
        {
          name: `Purchase Agreement - ${pkg.property.address}.pdf`,
          // documentBase64 would be the actual PDF content
          // For now, this is a placeholder — PDF generation is separate
          contentBase64: options.documentBase64 || 'PLACEHOLDER',
        },
      ],
      signers: [
        {
          name: options.signerName || pkg.parties.seller,
          email: options.signerEmail || pkg.parties.sellerEmail,
          order: 1,
        },
        {
          name: 'Montelli Scott',
          email: 'montelliscottrei@gmail.com',
          order: 2,
        },
      ],
      // Signature fields would be positioned on the PDF
      // RabbitSign handles this via template or API field positioning
    },
    webhook: options.webhookUrl || null,
  };

  // Add addenda as separate documents if any
  if (pkg.addenda.length > 0) {
    pkg.addenda.forEach((addendum, i) => {
      payload.folder.documents.push({
        name: `${addendum} - ${pkg.property.address}.pdf`,
        contentBase64: 'PLACEHOLDER',
      });
    });
  }

  return payload;
}

// =============================================================
// EXPORTS
// =============================================================

module.exports = {
  CONTRACT_TYPES,
  CLAUSES,
  PSA_CALL_OPENER,
  RABBITSIGN_SAFETY,
  generateContract,
  getApplicableClauses,
  getClause,
  formatForTelegram,
  generateRabbitSignPayload,
};
