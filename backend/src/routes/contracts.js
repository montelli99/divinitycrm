// =============================================================
// Divinity CRM Platform — Contracts API Routes
// =============================================================

const { Router } = require('express');
const { query } = require('../db/connection');
const { v4: uuid } = require('uuid');
const { generateContract, formatForTelegram } = require('../services/contract-generator');
const { executeStageAutomations, getAvailableTransitions } = require('../services/stage-automations');
const { isTeamViewer } = require('../services/access');

const router = Router();

async function loadLeadForCurrentUser(leadId, userId) {
  const currentUser = await query('SELECT role, email FROM users WHERE id = $1', [userId]);
  if (currentUser.length === 0) return { error: 'User not found', status: 404 };

  const lead = await query('SELECT * FROM leads WHERE id = $1', [leadId]);
  if (lead.length === 0) return { error: 'Lead not found', status: 404 };

  if (lead[0].user_id !== userId && !isTeamViewer(currentUser[0])) {
    return { error: 'Lead access required', status: 403 };
  }

  return { lead: lead[0] };
}

// Full contract template definitions (from contract-templates.js)
const CONTRACT_TEMPLATES = {
  'PSA_CREATIVE_SUBTO': {
    name: 'PSA - Creative Subject To',
    type: 'subto',
    description: 'Full PSA with Subject To terms + Addendum required. 4-layer seller protection.',
    addenda: ['SubjectToAddendum'],
    keyFields: ['propertyAddress', 'apn', 'purchasePrice', 'emdAmount', 'inspectionPeriodDays',
      'firstMortgageBalance', 'loanNumber', 'lenderName', 'sellerCarrybackAmount',
      'sellerCarrybackRate', 'cashAtCOE', 'coeDays', 'titleCompany', 'closingDate', 'thirdPartyProcessor'],
    defaults: {
      emdAmount: 100, emdDays: 14, inspectionPeriodDays: 14, coeDays: 30,
      titleCompany: 'CLOSE Title', closingCostsResponsibility: 'Buyer pays customary closing',
      requireThirdPartyProcessor: true, requireWrapAroundDisclosure: true,
    },
    clauses: [
      'WRAP_AROUND_FINANCING_TRANSACTION', 'WRAP_AROUND_FINANCING_IS_NON_RECOURSE',
      'WRAP_AROUND_FINANCING_IS_NOT_DUE_ON_SALE', 'NO_LONGER_DEDUCT_MORTGAGE_INTEREST',
      'EVENT_OF_FORECLOSURE', 'EXISTING_LOAN_ON_CREDIT_REPORT',
      'VA_LOAN_ELIGIBILITY_MAY_BE_IMPACTED', 'PROPERTY_INSURANCE_PROCEEDS',
      'DUE_ON_SALE_CLAUSE', 'CONTINUING_LIABILITY_ON_EXISTING_LOAN',
      'EXISTING_LOAN_NOT_PAID_IN_FULL', 'NO_FURTHER_OWNERSHIP_OR_CONTROL'
    ],
  },
  'PSA_COMMERCIAL': {
    name: 'PSA - Commercial (Novation)',
    type: 'commercial',
    description: 'Generic commercial PSA, 26 sections, AS-IS, buyer pays customary closing. Used for novation deals.',
    keyFields: ['propertyAddress', 'apn', 'purchasePrice', 'emdAmount', 'inspectionPeriodDays', 'cashAtCOE', 'coeDays', 'titleCompany'],
    defaults: { emdAmount: 1000, emdDays: 14, inspectionPeriodDays: 14, coeDays: 30, asIs: true },
  },
  'JV_3PARTY': {
    name: 'JV - 3 Party Agreement',
    type: 'jv',
    description: '3-party joint venture for real estate profit or cash flow. Outlines profit split, management, reserves.',
    keyFields: ['propertyAddress', 'party1Name', 'party1Email', 'party1Percent',
      'party2Name', 'party2Email', 'party2Percent', 'party3Name', 'party3Email', 'party3Percent',
      'managingParty', 'initialReserve'],
    defaults: { initialReserve: 5000, majorityThreshold: 51, superMajorityThreshold: 66, nonPaymentInterestRate: 25 },
  },
  'JV_4PARTY': {
    name: 'JV - 4 Party Agreement',
    type: 'jv',
    description: '4-party joint venture, 25% per party default. Super-majority 66%.',
    keyFields: ['propertyAddress', 'party1Name', 'party1Email', 'party1Percent',
      'party2Name', 'party2Email', 'party2Percent', 'party3Name', 'party3Email', 'party3Percent',
      'party4Name', 'party4Email', 'party4Percent', 'managingParty', 'initialReserve'],
    defaults: { party1Percent: 25, party2Percent: 25, party3Percent: 25, party4Percent: 25, initialReserve: 5000 },
  },
  'SUBTO_ADDENDUM': {
    name: 'Subject To Addendum',
    type: 'addendum',
    description: 'Required companion to any SubTo PSA. Discloses wrap-around financing, due-on-sale, 4-layer seller protection.',
    requiredFor: ['PSA_CREATIVE_SUBTO'],
    keyFields: ['propertyAddress', 'sellerName', 'buyerName', 'existingLoanLender', 'existingLoanBalance', 'thirdPartyProcessorName'],
  },
  'NOVATION_AGREEMENT': {
    name: 'Novation Agreement',
    type: 'commercial',
    description: 'Assignment of purchase contract to another buyer. Used when move-in ready house with no motivation.',
    keyFields: ['propertyAddress', 'originalBuyer', 'newBuyer', 'assignmentFee', 'purchasePrice', 'coeDays'],
    defaults: { assignmentFee: 10000, coeDays: 30 },
  },
  'CASH_OFFER_LOI': {
    name: 'LOI - Cash Offer',
    type: 'cash',
    description: 'Cash offer, no seller financing, buyer pays all closing.',
    keyFields: ['propertyAddress', 'purchasePrice', 'emdAmount', 'emdDays', 'coeDays', 'closingCostsResponsibility'],
    defaults: { emdAmount: 1000, emdDays: 14, coeDays: 21, closingCostsResponsibility: 'Buyer pays all closing costs' },
  },
  'STACK_50_LOI': {
    name: 'LOI - Stack 50% Down (F50)',
    type: 'stack50',
    description: '50% down, 60-month balloon payout. For turnkey/move-in ready properties.',
    keyFields: ['propertyAddress', 'purchasePrice', 'downPayment', 'downPaymentPercent', 'payoutMonths', 'coeDays'],
    defaults: { emdAmount: 1000, emdDays: 14, coeDays: 28, payoutMonths: 60, downPaymentPercent: 50 },
  },
  'STACK_10_LOI': {
    name: 'LOI - Stack 10% Down (F10)',
    type: 'stack10',
    description: '10% down payment, 24-month balloon, seller carryback. For renovation/flip properties.',
    keyFields: ['propertyAddress', 'purchasePrice', 'downPayment', 'downPaymentPercent', 'monthlyPayment', 'balloonMonths', 'coeDays'],
    defaults: { emdAmount: 500, emdDays: 14, coeDays: 30, balloonMonths: 24, downPaymentPercent: 10 },
  },
};

// GET /api/contracts/templates — List all contract templates
router.get('/templates', async (req, res) => {
  res.json({
    success: true,
    templates: Object.entries(CONTRACT_TEMPLATES).map(([id, tpl]) => ({
      id,
      name: tpl.name,
      type: tpl.type,
      description: tpl.description,
      addenda: tpl.addenda || [],
      keyFields: tpl.keyFields,
      defaults: tpl.defaults,
    })),
  });
});

// GET /api/contracts/templates/:id — Get single template with merge fields
router.get('/templates/:id', async (req, res) => {
  const tpl = CONTRACT_TEMPLATES[req.params.id];
  if (!tpl) return res.status(404).json({ error: 'Template not found' });
  res.json({ success: true, template: { id: req.params.id, ...tpl } });
});

// POST /api/contracts/generate-from-template — Generate contract from template with lead data
router.post('/generate-from-template', async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const { lead_id, template_id, custom_fields } = req.body;
    if (!lead_id || !template_id) {
      return res.status(400).json({ error: 'lead_id and template_id are required' });
    }

    const tpl = CONTRACT_TEMPLATES[template_id];
    if (!tpl) return res.status(400).json({ error: 'Invalid template_id' });

    // Fetch lead
    const access = await loadLeadForCurrentUser(lead_id, userId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const lead = [access.lead];

    const l = lead[0];

    // Build merged fields from lead data + defaults + custom fields
    const mergedFields = {
      propertyAddress: l.address || '',
      apn: l.apn || '',
      purchasePrice: l.price || 0,
      emdAmount: custom_fields?.emdAmount || tpl.defaults?.emdAmount || 1000,
      emdDays: tpl.defaults?.emdDays || 14,
      inspectionPeriodDays: tpl.defaults?.inspectionPeriodDays || 14,
      coeDays: tpl.defaults?.coeDays || 30,
      titleCompany: tpl.defaults?.titleCompany || 'CLOSE Title',
      closingCostsResponsibility: tpl.defaults?.closingCostsResponsibility || 'Buyer pays customary closing',
      sellerName: l.seller_name || '',
      sellerEmail: l.seller_email || '',
      sellerPhone: l.seller_phone || '',
      buyerName: custom_fields?.buyerName || 'Divinity Aligned LLC',
      buyerEmail: custom_fields?.buyerEmail || '',
      firstMortgageBalance: l.existing_loan_balance || 0,
      existingLoanBalance: l.existing_loan_balance || 0,
      existingLoanLender: l.existing_loan_type || '',
      loanNumber: l.existing_loan_number || '',
      lenderName: l.existing_loan_type || '',
      sellerCarrybackAmount: custom_fields?.sellerCarrybackAmount || 0,
      sellerCarrybackRate: custom_fields?.sellerCarrybackRate || 0.01,
      cashAtCOE: custom_fields?.cashAtCOE || 0,
      downPayment: custom_fields?.downPayment || 0,
      downPaymentPercent: tpl.defaults?.downPaymentPercent || 50,
      payoutMonths: tpl.defaults?.payoutMonths || 60,
      balloonMonths: tpl.defaults?.balloonMonths || 24,
      thirdPartyProcessor: custom_fields?.thirdPartyProcessor || 'To be assigned',
      thirdPartyProcessorName: custom_fields?.thirdPartyProcessor || 'To be assigned',
      assignmentFee: tpl.defaults?.assignmentFee || 10000,
      initialReserve: tpl.defaults?.initialReserve || 5000,
      // JV party defaults
      party1Name: custom_fields?.party1Name || 'Montelli Scott',
      party1Email: custom_fields?.party1Email || '',
      party1Percent: tpl.defaults?.party1Percent || 50,
      party2Name: custom_fields?.party2Name || 'Kayla Mauser',
      party2Email: custom_fields?.party2Email || '',
      party2Percent: tpl.defaults?.party2Percent || 25,
      party3Name: custom_fields?.party3Name || '',
      party3Email: custom_fields?.party3Email || '',
      party3Percent: tpl.defaults?.party3Percent || 25,
      party4Name: custom_fields?.party4Name || '',
      party4Email: custom_fields?.party4Email || '',
      party4Percent: tpl.defaults?.party4Percent || 25,
      managingParty: custom_fields?.managingParty || 'Montelli Scott',
      ...(custom_fields || {}),
    };

    // Store contract
    const contract = await query(
      `INSERT INTO contracts (id, lead_id, user_id, contract_type, template_name, addenda, clauses, payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        uuid(), lead_id, userId, tpl.type,
        tpl.name, tpl.addenda || [], tpl.clauses || [],
        JSON.stringify({ template_id, mergedFields, generatedAt: new Date().toISOString() })
      ]
    );

    // Update lead
    await query(
      `UPDATE leads SET 
        contract = $1,
        updated_at = NOW()
      WHERE id = $2`,
      [tpl.type, lead_id]
    );

    // Log activity
    await query(
      'INSERT INTO activity_log (id, user_id, lead_id, action, details) VALUES (gen_random_uuid(), $1, $2, $3, $4)',
      [userId, lead_id, 'contract_generated',
        JSON.stringify({ template_id, template_name: tpl.name, contract_type: tpl.type })
      ]
    );

    res.json({
      success: true,
      contract: contract[0],
      template: { id: template_id, name: tpl.name, type: tpl.type },
      mergedFields,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/contracts/clauses — List all clauses
router.get('/clauses', async (req, res, next) => {
  try {
    const clauses = await query('SELECT * FROM clauses ORDER BY category, id');
    res.json({ clauses });
  } catch (err) {
    next(err);
  }
});

// GET /api/contracts/clauses/:id — Get single clause
router.get('/clauses/:id', async (req, res, next) => {
  try {
    const clause = await query('SELECT * FROM clauses WHERE id = $1', [req.params.id]);
    if (clause.length === 0) return res.status(404).json({ error: 'Clause not found' });
    res.json({ clause: clause[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/contracts/generate — Generate contract package for a lead
router.post('/generate', async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const { lead_id, contract_type } = req.body;
    if (!lead_id || !contract_type) {
      return res.status(400).json({ error: 'lead_id and contract_type are required' });
    }

    // Fetch lead
    const lead = await query('SELECT * FROM leads WHERE id = $1 AND user_id = $2', [lead_id, userId]);
    if (lead.length === 0) return res.status(404).json({ error: 'Lead not found' });

    // Map DB lead to contract-generator format
    const leadData = {
      address: lead[0].address,
      city: lead[0].city,
      state: lead[0].state,
      zip: lead[0].zip,
      apn: lead[0].apn,
      price: lead[0].price,
      contacts: {
        agent_name: lead[0].agent_name,
        agent_phone: lead[0].agent_phone,
        agent_email: lead[0].agent_email,
        seller_name: lead[0].seller_name,
        seller_phone: lead[0].seller_phone,
        seller_email: lead[0].seller_email,
      },
      property_details: {
        rent: lead[0].monthly_rent,
      },
      underwriting: {
        arv: lead[0].arv,
        repairs_estimate: lead[0].repairs_estimate,
        existing_loan: lead[0].existing_loan_balance,
        existing_rate: lead[0].existing_loan_rate,
        existing_loan_type: lead[0].existing_loan_type,
      },
    };

    // Generate contract package
    const pkg = generateContract(leadData, contract_type);
    if (pkg.error) return res.status(400).json({ error: pkg.error });

    // Store in contracts table
    const contract = await query(
      `INSERT INTO contracts (id, lead_id, user_id, contract_type, template_name, addenda, clauses, payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        uuid(), lead_id, userId, contract_type,
        pkg.template, pkg.addenda, pkg.clauses.map(c => c.id),
        JSON.stringify(pkg)
      ]
    );

    // Update lead with contract type
    await query(
      `UPDATE leads SET 
        contract = $1,
        psa_signed_date = $2,
        coe_date = $3,
        inspection_end_date = $4,
        inspection_period_days = $5,
        emd_amount = $6,
        has_subto_addendum = $7,
        stage = 'UNDER_CONTRACT'
      WHERE id = $8`,
      [
        contract_type,
        pkg.timeline.psaSignedDate,
        pkg.timeline.coeDate,
        pkg.timeline.inspectionEndDate,
        pkg.timeline.inspectionPeriodDays,
        pkg.financials.emdAmount,
        pkg.addenda.includes('SubjectToAddendum'),
        lead_id
      ]
    );

    const automation = getAvailableTransitions(lead[0].stage).includes('UNDER_CONTRACT')
      ? await executeStageAutomations(lead_id, userId, lead[0].stage, 'UNDER_CONTRACT', lead[0])
      : null;

    // Log activity
    await query(
      'INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)',
      [userId, lead_id, 'contract_generated', JSON.stringify({ contract_type, template: pkg.template })]
    );

    res.json({
      contract: contract[0],
      package: pkg,
      formatted: formatForTelegram(pkg),
      automation,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/contracts — List contracts for user
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const contracts = await query(
      `SELECT c.*, l.address, l.stage
      FROM contracts c
      JOIN leads l ON c.lead_id = l.id
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC`,
      [userId]
    );

    res.json({ contracts });
  } catch (err) {
    next(err);
  }
});

// GET /api/contracts/:id — Get single contract
router.get('/:id', async (req, res, next) => {
  try {
    const contract = await query('SELECT * FROM contracts WHERE id = $1', [req.params.id]);
    if (contract.length === 0) return res.status(404).json({ error: 'Contract not found' });
    res.json({ contract: contract[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/contracts/send-rabbitsign — Send contract via RabbitSign
router.post('/send-rabbitsign', async (req, res, next) => {
  try {
    const { leadId, contractType } = req.body;
    if (!leadId) return res.status(400).json({ error: 'leadId is required' });

    const userId = req.user.userId;

    const access = await loadLeadForCurrentUser(leadId, userId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    const lead = [access.lead];

    const rs = require('../services/rabbitsign');
    if (!rs.isConfigured()) {
      return res.status(503).json({ error: 'RabbitSign not configured. Set RABBITSIGN_API_KEY in environment.' });
    }

    const result = await rs.createContractEnvelope(
      lead[0],
      String(contractType || lead[0].contract_type || 'subto').toLowerCase(),
    );

    res.json({ success: true, folderId: result.folderId, status: result.status });
  } catch (err) {
    next(err);
  }
});

// GET /api/contracts/rabbitsign/:folderId/status — Check RabbitSign folder status
router.get('/rabbitsign/:folderId/status', async (req, res, next) => {
  try {
    const rs = require('../services/rabbitsign');
    if (!rs.isConfigured()) {
      return res.status(503).json({ error: 'RabbitSign not configured' });
    }

    const status = await rs.getFolderStatus(req.params.folderId);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
