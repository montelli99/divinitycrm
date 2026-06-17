// =============================================================
// Calculator Route — Deal Analysis & Underwriting
// =============================================================

const express = require('express');
const router = express.Router();
const { sql } = require('../db/connection');
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
      await sql`
        UPDATE leads
        SET
          arv = ${Number(arv)},
          cash_offer = ${calcResult.structures[0].offer},
          f50_offer = ${calcResult.structures[1].offer},
          subto_offer = ${calcResult.structures[4].offer},
          recommended_strategy = ${strategy.strategy},
          one_percent_rule = ${calcResult.metadata.percRule},
          dscr = ${calcResult.metadata.dscr},
          cash_flow = ${calcResult.metadata.cashFlow},
          repairs_estimate = ${Number(repairEstimate || 0)},
          condition = ${condition || 'unknown'},
          updated_at = NOW()
        WHERE id = ${leadId} AND user_id = ${userId}
      `;

      // Log activity
      await sql`
        INSERT INTO activity_log (id, user_id, lead_id, action, details)
        VALUES (gen_random_uuid(), ${userId}, ${leadId}, 'underwriting_run',
          ${JSON.stringify({
            recommended: strategy.strategy,
            percRule: calcResult.metadata.percRule,
            dscr: calcResult.metadata.dscr,
            cashFlow: calcResult.metadata.cashFlow,
            buyBoxPass: buyBox.allPass,
          })}
        )
      `;
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

    const [lead] = await sql`
      SELECT id, address, city, state, zip, price, arv, beds, baths, sqft,
             condition, repairs_estimate, cash_offer, f50_offer, subto_offer,
             recommended_strategy, one_percent_rule, dscr, cash_flow,
             existing_loan_balance, existing_loan_rate, monthly_rent,
             has_hoa, has_pool, in_flood_zone, population, occupancy,
             source, stage
      FROM leads
      WHERE id = ${id} AND user_id = ${userId}
    `;

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json({
      success: true,
      lead: {
        id: lead.id,
        address: lead.address,
        city: lead.city,
        state: lead.state,
        zip: lead.zip,
        price: lead.price,
        arv: lead.arv,
        beds: lead.beds,
        baths: lead.baths,
        sqft: lead.sqft,
        condition: lead.condition,
        repairsEstimate: lead.repairs_estimate,
        monthlyRent: lead.monthly_rent,
        existingLoanBalance: lead.existing_loan_balance,
        existingLoanRate: lead.existing_loan_rate,
        hasHOA: lead.has_hoa,
        hasPool: lead.has_pool,
        inFloodZone: lead.in_flood_zone,
        population: lead.population,
        occupancy: lead.occupancy,
        source: lead.source,
        stage: lead.stage,
        // Previous calc results
        cashOffer: lead.cash_offer,
        f50Offer: lead.f50_offer,
        subtoOffer: lead.subto_offer,
        recommendedStrategy: lead.recommended_strategy,
        onePercentRule: lead.one_percent_rule,
        dscr: lead.dscr,
        cashFlow: lead.cash_flow,
      }
    });
  } catch (err) {
    console.error('Get lead for calculator error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
