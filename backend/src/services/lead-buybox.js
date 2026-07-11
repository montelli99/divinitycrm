const { query } = require('../db/connection');
const { checkBuyBox, estimateRepairs } = require('./comps-engine');

/**
 * Auto-run buy-box check on lead creation.
 * Uses data already provided (state, beds, price) and best-effort signals.
 * Returns { passed, failures, checks } without throwing.
 */
async function autoBuyBoxCheck(leadId) {
  const leadRes = await query('SELECT * FROM leads WHERE id = $1', [leadId]);
  if (leadRes.length === 0) return { error: 'Lead not found' };
  const lead = leadRes[0];

  const data = {
    state: lead.state || '',
    population: lead.population || 0,
    hasHOA: lead.has_hoa === true,
    hasPool: lead.has_pool === true,
    inFloodZone: lead.in_flood_zone === true,
    beds: lead.beds,
    price: lead.price,
  };

  const result = checkBuyBox(data);

  await query(
    'UPDATE leads SET buy_box_passed = $1, buy_box_match = $2 WHERE id = $3',
    [result.allPass, JSON.stringify(result), leadId]
  );

  return { leadId, ...result };
}

/**
 * Auto-run a quick underwriting pass when enough data exists.
 * Uses comps-engine repair estimate and simple 1% / DSCR / cash flow.
 */
async function autoPreScreen(leadId) {
  const leadRes = await query('SELECT * FROM leads WHERE id = $1', [leadId]);
  if (leadRes.length === 0) return { error: 'Lead not found' };
  const lead = leadRes[0];

  if (!lead.price || !lead.monthly_rent) {
    return { skipped: true, reason: 'price or monthly_rent missing' };
  }

  const price = Number(lead.price);
  const rent = Number(lead.monthly_rent);
  const onePercentValue = price > 0 ? rent / price : 0;
  const onePercentRule = onePercentValue >= 0.01;

  // Simple Stack Method calc (70% LTV, 8%, 30yr)
  const loan = price * 0.70;
  const rate = 0.08;
  const n = 360;
  const monthlyPI = loan > 0 ? (loan * (rate / 12)) / (1 - Math.pow(1 + rate / 12, -n)) : 0;

  const tax = Number(lead.tax_monthly || 0) || 350;
  const insurance = Number(lead.insurance_monthly || 0) || 120;
  const repairsMonthly = Number(lead.repairs_estimate || 0) / 12;

  const operatingExpenses = tax + insurance + repairsMonthly;
  const noi = rent - operatingExpenses;
  const cashFlow = noi - monthlyPI;
  const dscr = monthlyPI > 0 ? noi / monthlyPI : 0;

  const repairs = estimateRepairs(lead.condition || 'unknown', lead.sqft || 0);

  const strategy = cashFlow >= 250 ? 'cash' : (onePercentRule ? 'f50' : 'subto');

  await query(
    `UPDATE leads SET
      one_percent_rule = $1,
      one_percent_value = $2,
      dscr = $3,
      cash_flow = $4,
      repair_tier_rate = $5,
      repairs_estimate = $6,
      recommended_strategy = $7,
      population_ok = $8
    WHERE id = $9`,
    [
      onePercentRule,
      onePercentValue,
      dscr,
      cashFlow,
      repairs.rate,
      repairs.estimate,
      strategy,
      lead.population >= 10000,
      leadId,
    ]
  );

  return {
    leadId,
    onePercentRule,
    onePercentValue,
    dscr,
    cashFlow,
    repairs,
    strategy,
    qualifiesForOffer: onePercentRule && dscr >= 1.25 && cashFlow >= 250,
  };
}

module.exports = { autoBuyBoxCheck, autoPreScreen };
