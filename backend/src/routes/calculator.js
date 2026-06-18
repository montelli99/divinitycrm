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

module.exports = router;
