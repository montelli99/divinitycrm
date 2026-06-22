// =============================================================
// Calculator Route — Deal Analysis & Underwriting
// =============================================================

const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');
const { calculate, checkBuyBox, recommendStrategy } = require('../services/calculator');
const { isTeamViewer } = require('../services/access');

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

// POST /api/calculator/analyze — Run full deal analysis
router.post('/analyze', async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      arv, askingPrice, monthlyRent, repairEstimate, desiredProfit,
      propertyType, loanAmount, interestRate, insuranceMonthly,
      existingLoanBalance, existingLoanRate,
      sqft, beds, baths, condition,
      state, population, hasHOA, hasPool, inFloodZone,
      motivation, equityPercent, isRental, isOwnedFree,
      needsRenovation, moveInReady,
      leadId
    } = req.body;

    // Validate required fields
    if (!arv || !askingPrice || !monthlyRent) {
      return res.status(400).json({ error: 'ARV, asking price, and monthly rent are required' });
    }

    // Run calculations
    const calcResult = calculate({
      arv: Number(arv),
      askingPrice: Number(askingPrice),
      monthlyRent: Number(monthlyRent),
      repairEstimate: Number(repairEstimate || 0),
      desiredProfit: Number(desiredProfit || 15000),
      propertyType: propertyType || 'turnkey',
      loanAmount: loanAmount ? Number(loanAmount) : undefined,
      interestRate: interestRate ? Number(interestRate) : undefined,
      insuranceMonthly: Number(insuranceMonthly || 120),
      existingLoanBalance: Number(existingLoanBalance || 0),
      existingLoanRate: Number(existingLoanRate || 0),
      sqft: sqft ? Number(sqft) : undefined,
      beds: beds ? Number(beds) : undefined,
      baths: baths ? Number(baths) : undefined,
      condition: condition || 'unknown',
    });

    // Buy box check
    const buyBox = checkBuyBox({
      state: state || '',
      population: population ? Number(population) : 0,
      hasHOA: Boolean(hasHOA),
      hasPool: Boolean(hasPool),
      inFloodZone: Boolean(inFloodZone),
    });

    // Strategy recommendation
    const strategy = recommendStrategy({
      motivation: motivation || 'medium',
      equityPercent: equityPercent ? Number(equityPercent) : 50,
      interestRate: interestRate ? Number(interestRate) : undefined,
      isRental: Boolean(isRental),
      isOwnedFree: Boolean(isOwnedFree),
      needsRenovation: Boolean(needsRenovation),
      moveInReady: moveInReady !== undefined ? Boolean(moveInReady) : (propertyType === 'turnkey'),
    });

    const underwritingSummary = {
      recommended: strategy.strategy,
      percRule: calcResult.metadata.percRule,
      dscr: calcResult.metadata.dscr,
      cashFlow: calcResult.metadata.cashFlow,
      buyBoxPass: buyBox.allPass,
      standalone: !leadId,
    };

    // If leadId provided, save results to lead record
    if (leadId) {
      const access = await loadLeadForCurrentUser(leadId, userId);
      if (access.error) {
        return res.status(access.status).json({ error: access.error });
      }

      await query(
        `UPDATE leads
        SET
          arv = $1,
          cash_offer = $2,
          f50_offer = $3,
          subto_offer = $4,
          recommended_strategy = $5,
          one_percent_rule = $6,
          dscr = $7,
          cash_flow = $8,
          repairs_estimate = $9,
          condition = $10,
          updated_at = NOW()
        WHERE id = $11`,
        [
          Number(arv),
          calcResult.structures[0].offer,
          calcResult.structures[1].offer,
          calcResult.structures[4].offer,
          strategy.strategy,
          calcResult.metadata.percRule,
          calcResult.metadata.dscr,
          calcResult.metadata.cashFlow,
          Number(repairEstimate || 0),
          condition || 'unknown',
          leadId,
        ]
      );

      // Log activity
      await query(
        'INSERT INTO activity_log (id, user_id, lead_id, action, details) VALUES (gen_random_uuid(), $1, $2, $3, $4)',
        [userId, leadId, 'underwriting_run', JSON.stringify(underwritingSummary)]
      );
    }
    else {
      await query(
        'INSERT INTO activity_log (id, user_id, lead_id, action, details) VALUES (gen_random_uuid(), $1, $2, $3, $4)',
        [userId, null, 'underwriting_run', JSON.stringify(underwritingSummary)]
      );
    }

    res.json({
      success: true,
      calculation: calcResult,
      buyBox,
      strategy,
      leadUpdated: !!leadId,
      savedToHistory: true,
    });
  } catch (err) {
    console.error('Calculator analyze error:', err);
    res.status(500).json({ error: err.message || 'Calculation failed' });
  }
});

// GET /api/calculator/history — Underwriting history for a lead or user
router.get('/history', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { leadId, limit = 25 } = req.query;

    const result = leadId
      ? await query(
        `SELECT a.id, a.user_id, a.lead_id, a.action, a.details, a.created_at, l.address
         FROM activity_log a
         LEFT JOIN leads l ON l.id = a.lead_id
         WHERE a.user_id = $1 AND a.lead_id = $2 AND a.action = 'underwriting_run'
         ORDER BY a.created_at DESC
         LIMIT $3`,
        [userId, leadId, Number(limit)]
      )
      : await query(
        `SELECT a.id, a.user_id, a.lead_id, a.action, a.details, a.created_at, l.address
         FROM activity_log a
         LEFT JOIN leads l ON l.id = a.lead_id
         WHERE a.user_id = $1 AND a.action = 'underwriting_run'
         ORDER BY a.created_at DESC
         LIMIT $2`,
        [userId, Number(limit)]
      );

    res.json({
      success: true,
      history: result.map(row => {
        let details = null;
        try { details = row.details ? JSON.parse(row.details) : null; } catch {
          details = row.details || null;
        }
        return {
          id: row.id,
          leadId: row.lead_id,
          address: row.address || null,
          action: row.action,
          createdAt: row.created_at,
          details,
        };
      }),
    });
  } catch (err) {
    console.error('Calculator history error:', err);
    res.status(500).json({ error: err.message || 'Failed to load underwriting history' });
  }
});

// POST /api/calculator/buybox — Quick buy box check only
router.post('/buybox', async (req, res) => {
  try {
    const { state, population, hasHOA, hasPool, inFloodZone } = req.body;
    const result = checkBuyBox({
      state: state || '',
      population: population ? Number(population) : 0,
      hasHOA: Boolean(hasHOA),
      hasPool: Boolean(hasPool),
      inFloodZone: Boolean(inFloodZone),
    });
    res.json({ success: true, buyBox: result });
  } catch (err) {
    console.error('Buy box check error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/calculator/lead/:id — Get lead data pre-filled for calculator
router.get('/lead/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const access = await loadLeadForCurrentUser(id, userId);
    if (access.error) {
      return res.status(access.status).json({ error: access.error });
    }

    const l = access.lead;
    res.json({
      success: true,
      lead: {
        id: l.id,
        address: l.address,
        city: l.city,
        state: l.state,
        zip: l.zip,
        price: l.price,
        arv: l.arv,
        beds: l.beds,
        baths: l.baths,
        sqft: l.sqft,
        condition: l.condition,
        repairsEstimate: l.repairs_estimate,
        monthlyRent: l.monthly_rent,
        existingLoanBalance: l.existing_loan_balance,
        existingLoanRate: l.existing_loan_rate,
        hasHOA: l.has_hoa,
        hasPool: l.has_pool,
        inFloodZone: l.in_flood_zone,
        population: l.population,
        occupancy: l.occupancy,
        source: l.source,
        stage: l.stage,
        // Previous calc results
        cashOffer: l.cash_offer,
        f50Offer: l.f50_offer,
        subtoOffer: l.subto_offer,
        recommendedStrategy: l.recommended_strategy,
        onePercentRule: l.one_percent_rule,
        dscr: l.dscr,
        cashFlow: l.cash_flow,
      }
    });
  } catch (err) {
    console.error('Get lead for calculator error:', err);
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// CLOSING COST ALLOCATOR
// =============================================================

const {
  allocateClosingCosts,
  getEMDDefault,
  getCOEDefault,
  formatForNotes,
  saveAllocationToLead,
} = require('../services/closing-cost-allocator');

// POST /api/calculator/closing-costs — Allocate closing costs
router.post('/closing-costs', async (req, res) => {
  try {
    const { contractType, purchasePrice, state, leadId } = req.body;

    if (!purchasePrice) {
      return res.status(400).json({ error: 'purchasePrice is required' });
    }

    const allocation = allocateClosingCosts({
      contractType: contractType || 'subto',
      purchasePrice: Number(purchasePrice),
      state: state || undefined,
    });

    // Save to lead if leadId provided
    if (leadId) {
      await saveAllocationToLead(leadId, allocation);
    }

    res.json({
      success: true,
      allocation,
      formatted: formatForNotes(allocation),
    });
  } catch (err) {
    console.error('Closing cost allocation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/calculator/closing-costs/state-fees — Get state fee estimates
router.get('/closing-costs/state-fees', async (req, res) => {
  try {
    const { getStateFees } = require('../services/closing-cost-allocator');
    const { state } = req.query;
    const fees = getStateFees(state || undefined);
    res.json({ success: true, state: state || 'default', fees });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// MID-TERM PIVOT
// =============================================================

const {
  evaluateMidTerm,
  generateMidTermPitch,
  runMidTermPivot,
  getMarketData,
  MIDTERM_MARKET_DATA,
} = require('../services/mid-term-pivot');

// POST /api/calculator/midterm — Evaluate mid-term rental viability
router.post('/midterm', async (req, res) => {
  try {
    const { longTermRent, purchasePrice, city, threshold } = req.body;

    if (!longTermRent || !purchasePrice) {
      return res.status(400).json({ error: 'longTermRent and purchasePrice are required' });
    }

    const evaluation = evaluateMidTerm({
      longTermRent: Number(longTermRent),
      purchasePrice: Number(purchasePrice),
      city: city || undefined,
      threshold: threshold ? Number(threshold) : undefined,
    });

    const pitch = generateMidTermPitch({
      address: req.body.address || 'your property',
      longTermRent: Number(longTermRent),
      midTermRent: evaluation.midTermRent,
      midTermPct: evaluation.midTermPct,
      additionalMonthly: evaluation.additionalMonthly,
      additionalAnnual: evaluation.additionalAnnual,
      city: city || undefined,
    });

    res.json({ success: true, evaluation, pitch });
  } catch (err) {
    console.error('Mid-term pivot error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calculator/midterm/lead/:id — Run mid-term pivot for a lead
router.post('/midterm/lead/:id', async (req, res) => {
  try {
    const result = await runMidTermPivot(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Mid-term pivot lead error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/calculator/midterm/markets — Get mid-term market data
router.get('/midterm/markets', async (req, res) => {
  try {
    const { city } = req.query;
    if (city) {
      const market = getMarketData(city);
      res.json({ success: true, city, market });
    } else {
      res.json({ success: true, markets: MIDTERM_MARKET_DATA });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// DOC ANALYZER
// =============================================================

const {
  analyzeRentRoll,
  analyzePL,
  analyzeTax,
  scoreBuyBox,
  runDocAnalysis,
  quickBuyBoxCheck,
} = require('../services/doc-analyzer');

// POST /api/calculator/doc-analyze — Run full doc analysis for a lead
router.post('/doc-analyze', async (req, res) => {
  try {
    const { leadId, rentRoll, plStatement, taxRecords, buyBoxParams } = req.body;
    if (!leadId) return res.status(400).json({ error: 'leadId is required' });

    const result = await runDocAnalysis(leadId, {
      rentRoll,
      plStatement,
      taxRecords,
      buyBoxParams,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Doc analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calculator/buybox-check/:id — Quick buy box check for a lead
router.post('/buybox-check/:id', async (req, res) => {
  try {
    const result = await quickBuyBoxCheck(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Buy box check error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calculator/rentroll-analyze — Analyze rent roll data
router.post('/rentroll-analyze', async (req, res) => {
  try {
    const { address, data } = req.body;
    const result = analyzeRentRoll(address || 'Property', data || {});
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calculator/pl-analyze — Analyze P&L data
router.post('/pl-analyze', async (req, res) => {
  try {
    const { address, data } = req.body;
    const result = analyzePL(address || 'Property', data || {});
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calculator/tax-analyze — Analyze tax records
router.post('/tax-analyze', async (req, res) => {
  try {
    const { address, data } = req.body;
    const result = analyzeTax(address || 'Property', data || {});
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
