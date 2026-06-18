// =============================================================
// Dispo Tracker Service — Divinity CRM
// =============================================================
// Built: 2026-06-18 by Atlas (Phase 3)
// Source: ghl-automations/modules/dispo-tracker.js
//
// Purpose: Track disposition (resale) of acquired properties.
//          Monitor 40+ live deals through buyer assignment to closing.
//          Track payouts, assignment fees, and profit estimates.
//
// Dispo strategies (from Dispo.xlsx + Calc/Dispo walkthrough):
//   - Stack50_60mo: 50% DP, 60-mo balloon
//   - ZeroDown: $0 Down SubTo hybrid
//   - InterestOnlyHybrid: IO payments on inflated DP
//   - Novation: Higher price, longer COE (60-90 day)
//   - CashResale: Simple cash flip
//   - SubToMFHPivot: SubTo for multi-family
//   - PortfolioStackLLC: Multi-property LLC formation
//
// Buyer tiers:
//   - TierA: Heavy hitters, $500K-$5M+, fast close
//   - TierB: SubTo specialists, $200K-$600K
//   - TierC: Stack buyers, $100K-$400K
//   - TierD: Rental investors, $150K-$500K
// =============================================================

const { query } = require('../db/connection');

// =============================================================
// DISPO STRATEGIES
// =============================================================

const DISPO_STRATEGIES = {
  Stack50_60mo: {
    name: 'Stack 50% Down, 60-mo Balloon',
    description: 'Most common Stack variant. 50% inflated down, seller carryback, 60-month balloon payout.',
    minDownPaymentPercent: 50,
    payoutMonths: 60,
    assignmentFeePercent: 10,
  },
  ZeroDown: {
    name: '$0 Down (Subject-To Hybrid)',
    description: 'No money down offer with subject-to existing debt. 4-layer seller protection.',
    cashToSeller: 0,
    sellerCarryback: true,
    payoutMonths: 96,
  },
  InterestOnlyHybrid: {
    name: 'Interest-Only Hybrid',
    description: 'Interest-only payments on inflated down payment, balloon at maturity.',
    monthlyPaymentIncludesPrincipal: false,
    payoutMonths: 60,
  },
  Novation: {
    name: 'Novation (Higher Price, Longer COE)',
    description: 'When outright offer is too low, offer 60-90 day novation at higher price.',
    coeDaysMin: 60,
    coeDaysMax: 90,
    premiumPercentVsOutright: 25,
  },
  CashResale: {
    name: 'Cash Resale',
    description: 'Simple cash flip — buy below market, sell for cash to retail buyer.',
    typicalMarkupPercent: 15,
    coeDays: 21,
  },
  SubToMFHPivot: {
    name: 'SubTo MFH Pivot',
    description: 'When a Stack offer is declined, pivot to SubTo for multi-family.',
  },
  PortfolioStackLLC: {
    name: 'Portfolio Stack + LLC Formation',
    description: 'Multi-property (5-25 properties) closed simultaneously with LLC formed at COE.',
    minProperties: 2,
    typicalPropertyCount: 23,
    llcFormation: true,
    payoutMonths: 72,
  },
};

// =============================================================
// BUYER TIERS
// =============================================================

const BUYER_TIERS = {
  TierA_HeavyHitters: {
    description: 'High-volume buyers, $500K+ deals, fast close',
    capacity: '$500K - $5M+',
    typicalPayoutDays: 14,
    preferences: ['Cash', 'Novation'],
  },
  TierB_SubToBuyers: {
    description: 'Subject-To specialists, $200K-$600K',
    capacity: '$200K - $600K',
    typicalPayoutDays: 30,
    preferences: ['SubTo', 'ZeroDown'],
  },
  TierC_StackBuyers: {
    description: 'Stack/IO buyers, $100K-$400K',
    capacity: '$100K - $400K',
    typicalPayoutDays: 45,
    preferences: ['Stack50_60mo', 'InterestOnlyHybrid'],
  },
  TierD_RentalBuyers: {
    description: 'Long-term rental investors, $150K-$500K',
    capacity: '$150K - $500K',
    typicalPayoutDays: 30,
    preferences: ['ZeroDown', 'Stack50_60mo'],
  },
};

// =============================================================
// DISPO STATUS FLOW
// =============================================================

const STATUS_FLOW = {
  pending: ['buyer_assigned', 'cancelled'],
  buyer_assigned: ['under_contract', 'pending', 'cancelled'],
  under_contract: ['closed', 'cancelled'],
  closed: [],
  cancelled: [],
};

// =============================================================
// CREATE DISPO RECORD (attach to a closed lead)
// =============================================================

async function createDispoRecord({
  leadId,
  holdStrategy,
  buyerTier,
  buyerName,
  buyerEmail,
  buyerPhone,
  assignmentFeePercent,
  estimatedSalePrice,
  targetCOE,
}) {
  // Validate lead exists and is closed
  const lead = await query('SELECT id, address, price, arv, stage FROM leads WHERE id = $1', [leadId]);
  if (lead.length === 0) throw new Error('Lead not found');
  if (lead[0].stage !== 'CLOSED') throw new Error('Lead must be CLOSED to create dispo record');

  const strategy = DISPO_STRATEGIES[holdStrategy];
  if (!strategy) throw new Error(`Unknown holdStrategy: ${holdStrategy}`);

  const tier = BUYER_TIERS[buyerTier];
  if (!tier) throw new Error(`Unknown buyerTier: ${buyerTier}`);

  const acquisitionPrice = parseFloat(lead[0].price) || 0;
  const arvEstimate = parseFloat(lead[0].arv) || 0;
  const salePrice = estimatedSalePrice || arvEstimate;
  const feePercent = assignmentFeePercent || strategy.assignmentFeePercent || 10;
  const assignmentFee = (feePercent / 100) * salePrice;
  const estimatedProfit = salePrice - acquisitionPrice - assignmentFee;

  // Update lead with dispo data
  const result = await query(
    `UPDATE leads SET
      disposition_status = $1,
      disposition_payout = $2,
      estimated_profit = $3,
      updated_at = now()
    WHERE id = $4
    RETURNING id, address, disposition_status, disposition_payout, estimated_profit`,
    ['pending', assignmentFee, estimatedProfit, leadId]
  );

  // Log the dispo creation
  await query(
    `INSERT INTO activity_log (lead_id, action, details, created_at)
    VALUES ($1, 'dispo_created', $2, now())`,
    [leadId, JSON.stringify({
      holdStrategy,
      buyerTier,
      buyerName,
      buyerEmail,
      buyerPhone,
      estimatedSalePrice: salePrice,
      assignmentFee,
      estimatedProfit,
      targetCOE,
      strategyName: strategy.name,
      tierDescription: tier.description,
    })]
  );

  return {
    leadId,
    propertyAddress: lead[0].address,
    acquisitionPrice,
    strategy: { name: strategy.name, description: strategy.description },
    buyer: { name: buyerName, email: buyerEmail, phone: buyerPhone, tier: buyerTier, tierDescription: tier.description },
    financial: { arvEstimate, estimatedSalePrice: salePrice, assignmentFee, estimatedProfit },
    timeline: { targetCOE, typicalPayoutDays: tier.typicalPayoutDays },
    status: 'pending',
  };
}

// =============================================================
// TRANSITION DISPO STATUS
// =============================================================

async function transitionDispoStatus(leadId, newStatus) {
  const lead = await query(
    'SELECT id, disposition_status FROM leads WHERE id = $1',
    [leadId]
  );
  if (lead.length === 0) throw new Error('Lead not found');

  const currentStatus = lead[0].disposition_status || 'pending';
  const allowed = STATUS_FLOW[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${allowed.join(', ')}`);
  }

  const result = await query(
    `UPDATE leads SET disposition_status = $1, updated_at = now() WHERE id = $2 RETURNING id, disposition_status`,
    [newStatus, leadId]
  );

  await query(
    `INSERT INTO activity_log (lead_id, action, details, created_at)
    VALUES ($1, 'dispo_status_changed', $2, now())`,
    [leadId, JSON.stringify({ from: currentStatus, to: newStatus })]
  );

  return result[0];
}

// =============================================================
// GET ALL DISPOSITIONS (pipeline view)
// =============================================================

async function getDispositions({ status, strategy, limit, offset } = {}) {
  let sql = `
    SELECT 
      l.id, l.address, l.city, l.state, l.price AS acquisition_price,
      l.arv, l.estimated_profit, l.disposition_status, l.disposition_payout,
      l.closed_date, l.contract_type, l.recommended_strategy,
      l.updated_at
    FROM leads l
    WHERE l.disposition_status IS NOT NULL
  `;
  const params = [];
  let paramIdx = 1;

  if (status) {
    sql += ` AND l.disposition_status = $${paramIdx++}`;
    params.push(status);
  }

  sql += ` ORDER BY l.updated_at DESC`;

  if (limit) {
    sql += ` LIMIT $${paramIdx++}`;
    params.push(limit);
  }
  if (offset) {
    sql += ` OFFSET $${paramIdx++}`;
    params.push(offset);
  }

  const dispositions = await query(sql, params);

  // Count by status
  const counts = await query(
    `SELECT disposition_status, COUNT(*) as count
    FROM leads WHERE disposition_status IS NOT NULL
    GROUP BY disposition_status`
  );

  // Total payout tracking
  const totals = await query(
    `SELECT 
      COUNT(*) AS total_dispos,
      SUM(disposition_payout) AS total_payouts,
      SUM(estimated_profit) AS total_estimated_profit,
      AVG(estimated_profit) AS avg_profit_per_deal
    FROM leads WHERE disposition_status IS NOT NULL`
  );

  return {
    dispositions: dispositions.map(d => ({
      ...d,
      strategyLabel: DISPO_STRATEGIES[d.recommended_strategy]?.name || d.recommended_strategy || '—',
    })),
    counts: Object.fromEntries(counts.map(c => [c.disposition_status, parseInt(c.count)])),
    totals: totals[0],
  };
}

// =============================================================
// GET DISPO SUMMARY (dashboard widget)
// =============================================================

async function getDispoSummary() {
  const summary = await query(
    `SELECT 
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE disposition_status = 'pending') AS pending,
      COUNT(*) FILTER (WHERE disposition_status = 'buyer_assigned') AS buyer_assigned,
      COUNT(*) FILTER (WHERE disposition_status = 'under_contract') AS under_contract,
      COUNT(*) FILTER (WHERE disposition_status = 'closed') AS closed,
      COUNT(*) FILTER (WHERE disposition_status = 'cancelled') AS cancelled,
      SUM(disposition_payout) AS total_payouts,
      SUM(estimated_profit) AS total_profit,
      SUM(estimated_profit) FILTER (WHERE disposition_status = 'closed') AS realized_profit
    FROM leads WHERE disposition_status IS NOT NULL`
  );

  // Pipeline value by status
  const pipelineValue = await query(
    `SELECT 
      disposition_status,
      COUNT(*) AS count,
      SUM(estimated_profit) AS total_profit,
      SUM(disposition_payout) AS total_payouts
    FROM leads WHERE disposition_status IS NOT NULL
    GROUP BY disposition_status
    ORDER BY total_profit DESC`
  );

  return {
    ...summary[0],
    pipelineValue,
  };
}

// =============================================================
// ASSIGN BUYER TO DISPO
// =============================================================

async function assignBuyer(leadId, { buyerName, buyerEmail, buyerPhone, buyerTier, holdStrategy, estimatedSalePrice, targetCOE }) {
  const lead = await query('SELECT id, disposition_status FROM leads WHERE id = $1', [leadId]);
  if (lead.length === 0) throw new Error('Lead not found');

  const tier = BUYER_TIERS[buyerTier];
  if (!tier) throw new Error(`Unknown buyerTier: ${buyerTier}`);

  const strategy = holdStrategy ? DISPO_STRATEGIES[holdStrategy] : null;

  await query(
    `UPDATE leads SET
      disposition_status = 'buyer_assigned',
      updated_at = now()
    WHERE id = $1`,
    [leadId]
  );

  await query(
    `INSERT INTO activity_log (lead_id, action, details, created_at)
    VALUES ($1, 'dispo_buyer_assigned', $2, now())`,
    [leadId, JSON.stringify({
      buyerName, buyerEmail, buyerPhone, buyerTier,
      tierDescription: tier.description,
      holdStrategy: holdStrategy || null,
      strategyName: strategy?.name || null,
      estimatedSalePrice: estimatedSalePrice || null,
      targetCOE: targetCOE || null,
    })]
  );

  return { leadId, status: 'buyer_assigned', buyer: { name: buyerName, tier: buyerTier } };
}

// =============================================================
// EXPORT
// =============================================================

module.exports = {
  DISPO_STRATEGIES,
  BUYER_TIERS,
  STATUS_FLOW,
  createDispoRecord,
  transitionDispoStatus,
  getDispositions,
  getDispoSummary,
  assignBuyer,
};
