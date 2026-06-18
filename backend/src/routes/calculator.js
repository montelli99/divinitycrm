// =============================================================
// Calculator Route — Deal Analysis & Underwriting
// =============================================================

const express = require('express');
const router = express.Router();
const { query } = require('../db/connection');
const { calculate, checkBuyBox, recommendStrategy } = require('../services/calculator');

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

    // If leadId provided, save results to lead record
    if (leadId) {
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
        WHERE id = $11 AND user_id = $12`,
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
          userId
        ]
      );

      // Log activity
      await query(
        'INSERT INTO activity_log (id, user_id, lead_id, action, details) VALUES (gen_random_uuid(), $1, $2, $3, $4)',
        [userId, leadId, 'underwriting_run',
          JSON.stringify({
            recommended: strategy.strategy,
            percRule: calcResult.metadata.percRule,
            dscr: calcResult.metadata.dscr,
            cashFlow: calcResult.metadata.cashFlow,
            buyBoxPass: buyBox.allPass,
          })
        ]
      );
    }

    res.json({
      success: true,
      calculation: calcResult,
      buyBox,
      strategy,
      leadUpdated: !!leadId,
    });
  } catch (err) {
    console.error('Calculator analyze error:', err);
    res.status(500).json({ error: err.message || 'Calculation failed' });
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

    const lead = await query(
      `SELECT id, address, city, state, zip, price, arv, beds, baths, sqft,
             condition, repairs_estimate, cash_offer, f50_offer, subto_offer,
             recommended_strategy, one_percent_rule, dscr, cash_flow,
             existing_loan_balance, existing_loan_rate, monthly_rent,
             has_hoa, has_pool, in_flood_zone, population, occupancy,
             source, stage
      FROM leads
      WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (lead.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const l = lead[0];
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
