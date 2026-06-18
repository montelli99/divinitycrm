// =============================================================
// Mid-Term Pivot Service — Divinity CRM
// =============================================================
// Built: 2026-06-18 by Atlas (Phase 8)
// Source: ghl-automations/modules/mid-term-pivot.js
//
// Purpose: Evaluate mid-term rental viability when long-term rent
//          fails the 1% rule. Uses industry rule-of-thumb multiplier
//          (1.7× long-term rent) to estimate Furnished Finder /
//          traveling professional rent rates.
//
// Finding: No public API exists for Furnished Finder or Airbnb.
//          Both are gated, partner-only, or third-party scrapers.
//          Per user directive: don't make up integrations that
//          have to be replaced later.
//
// Approach: Honest, deterministic multiplier-based estimate.
//           No false promise of live data.
//
// Use case: Stage 8→9 (SELLER_DECLINED → ACTIVE_NEGOTIATION)
//           When seller declines, pivot to mid-term strategy pitch.
// =============================================================

const { query } = require('../db/connection');

// =============================================================
// CONFIGURATION
// =============================================================

const DEFAULT_MULTIPLIER = parseFloat(process.env.MIDTERM_MULTIPLIER || '1.7');
const DEFAULT_THRESHOLD = parseFloat(process.env.MIDTERM_THRESHOLD_PCT || '1.2');

// =============================================================
// MID-TERM MARKET DATA (industry averages by metro)
// =============================================================

const MIDTERM_MARKET_DATA = {
  // Traveling nurse hubs (highest mid-term demand)
  'Phoenix': { multiplier: 1.8, demand: 'high', note: 'Major traveling nurse hub' },
  'Dallas': { multiplier: 1.7, demand: 'high', note: 'Corporate relocation + medical' },
  'Houston': { multiplier: 1.8, demand: 'high', note: 'Texas Medical Center — largest in world' },
  'Atlanta': { multiplier: 1.7, demand: 'high', note: 'CDC + Emory + corporate HQ' },
  'Nashville': { multiplier: 1.9, demand: 'very high', note: 'HCA Healthcare HQ + music industry' },
  'Charlotte': { multiplier: 1.7, demand: 'high', note: 'Banking + medical hub' },
  'Tampa': { multiplier: 1.8, demand: 'high', note: 'Travel nurse + snowbird destination' },
  'Orlando': { multiplier: 1.8, demand: 'high', note: 'Travel nurse + tourism industry' },
  'Miami': { multiplier: 1.6, demand: 'moderate', note: 'High competition, seasonal' },
  'Denver': { multiplier: 1.7, demand: 'high', note: 'Corporate + medical + outdoor' },
  'Seattle': { multiplier: 1.6, demand: 'moderate', note: 'Tech + medical' },
  'Portland': { multiplier: 1.6, demand: 'moderate', note: 'Medical + tech' },
  'San Antonio': { multiplier: 1.7, demand: 'high', note: 'Military + medical' },
  'Austin': { multiplier: 1.7, demand: 'high', note: 'Tech + medical + government' },
  'Raleigh': { multiplier: 1.7, demand: 'high', note: 'Research Triangle — medical + tech' },
  'Cleveland': { multiplier: 1.8, demand: 'high', note: 'Cleveland Clinic' },
  'Rochester': { multiplier: 1.8, demand: 'high', note: 'Mayo Clinic' },
  'Baltimore': { multiplier: 1.7, demand: 'high', note: 'Johns Hopkins + federal' },
  'Pittsburgh': { multiplier: 1.7, demand: 'high', note: 'UPMC + medical hub' },
  'Indianapolis': { multiplier: 1.6, demand: 'moderate', note: 'Medical + pharma' },
  'Columbus': { multiplier: 1.6, demand: 'moderate', note: 'Medical + insurance' },
  'Kansas City': { multiplier: 1.5, demand: 'moderate', note: 'Medical + federal' },
  'St Louis': { multiplier: 1.5, demand: 'moderate', note: 'Medical + corporate' },
  'Memphis': { multiplier: 1.6, demand: 'moderate', note: 'Medical + logistics' },
  'Birmingham': { multiplier: 1.6, demand: 'moderate', note: 'UAB Medical Center' },
  'Louisville': { multiplier: 1.5, demand: 'moderate', note: 'Medical + logistics' },
  'Oklahoma City': { multiplier: 1.5, demand: 'moderate', note: 'Medical + energy' },
  'Tulsa': { multiplier: 1.5, demand: 'moderate', note: 'Medical + energy' },
  'Omaha': { multiplier: 1.5, demand: 'moderate', note: 'Medical + insurance' },
  'default': { multiplier: DEFAULT_MULTIPLIER, demand: 'unknown', note: 'No metro-specific data' },
};

function getMarketData(city) {
  if (!city) return MIDTERM_MARKET_DATA.default;
  // Try exact match first, then case-insensitive
  const exact = MIDTERM_MARKET_DATA[city];
  if (exact) return exact;
  const lower = city.toLowerCase();
  for (const [key, val] of Object.entries(MIDTERM_MARKET_DATA)) {
    if (key.toLowerCase() === lower) return val;
  }
  return MIDTERM_MARKET_DATA.default;
}

// =============================================================
// ESTIMATE MID-TERM RENT
// =============================================================

function estimateMidTermRent(longTermRent, city) {
  if (!longTermRent || longTermRent <= 0) return 0;
  const market = getMarketData(city);
  return Math.round(longTermRent * market.multiplier);
}

// =============================================================
// MID-TERM PERCENTAGE
// =============================================================

function midTermPct(midTermRent, purchasePrice) {
  if (!purchasePrice || purchasePrice <= 0) return 0;
  return Number(((midTermRent / purchasePrice) * 100).toFixed(3));
}

// =============================================================
// EVALUATE DEAL FOR MID-TERM VIABILITY
// =============================================================

function evaluateMidTerm({ longTermRent, purchasePrice, city, threshold }) {
  if (!longTermRent) {
    return { passes: false, midTermRent: 0, midTermPct: 0, reason: 'no long-term rent provided' };
  }
  if (!purchasePrice) {
    return { passes: false, midTermRent: 0, midTermPct: 0, reason: 'no purchase price provided' };
  }

  const midTermRent = estimateMidTermRent(longTermRent, city);
  const pct = midTermPct(midTermRent, purchasePrice);
  const thresh = threshold || DEFAULT_THRESHOLD;
  const market = getMarketData(city);

  if (pct >= thresh) {
    return {
      passes: true,
      midTermRent,
      midTermPct: pct,
      threshold: thresh,
      multiplier: market.multiplier,
      marketDemand: market.demand,
      marketNote: market.note,
      additionalMonthly: midTermRent - longTermRent,
      additionalAnnual: (midTermRent - longTermRent) * 12,
      reason: `Mid-term rent clears ${thresh}% rule (${pct}%)`,
    };
  }

  return {
    passes: false,
    midTermRent,
    midTermPct: pct,
    threshold: thresh,
    multiplier: market.multiplier,
    marketDemand: market.demand,
    marketNote: market.note,
    additionalMonthly: midTermRent - longTermRent,
    additionalAnnual: (midTermRent - longTermRent) * 12,
    reason: `Mid-term rent does NOT clear ${thresh}% rule (${pct}%)`,
  };
}

// =============================================================
// GENERATE MID-TERM PITCH (for seller)
// =============================================================

function generateMidTermPitch({ address, longTermRent, midTermRent, midTermPct, additionalMonthly, additionalAnnual, city }) {
  const market = getMarketData(city);
  const addlMonthly = additionalMonthly || (midTermRent - longTermRent);
  const addlAnnual = additionalAnnual || (addlMonthly * 12);

  const smsBody = [
    `Hi! Quick thought on ${address || 'your property'} —`,
    `we ran the numbers and a mid-term rental`,
    `(30+ day furnished) strategy could pull`,
    `~$${midTermRent}/mo vs $${longTermRent}/mo long-term.`,
    `That's +$${addlMonthly}/mo more, or +$${addlAnnual}/yr.`,
    `Want me to send the full breakdown?`,
  ].join('\n');

  const emailSubject = `Mid-term rental path for ${address || 'your property'} — +$${addlAnnual}/yr cash flow`;

  const emailBody = [
    `Hi,`,
    ``,
    `We ran the numbers on ${address || 'your property'} using our mid-term rental analysis. Here's what we found:`,
    ``,
    `LONG-TERM RENTAL (12+ month tenants):`,
    `  Estimated rent: $${longTermRent}/mo`,
    ``,
    `MID-TERM RENTAL (30+ day furnished, traveling professionals):`,
    `  Estimated rent: $${midTermRent}/mo (${midTermPct}% of purchase price)`,
    `  Market demand: ${market.demand} — ${market.note}`,
    ``,
    `That's +$${addlMonthly}/mo MORE with mid-term, or +$${addlAnnual}/yr.`,
    ``,
    `The mid-term market is fueled by traveling nurses, corporate relocations,`,
    `and insurance housing. Properties that don't quite work as long-term`,
    `rentals often perform very well in the mid-term space.`,
    ``,
    `Want to talk through whether mid-term is a fit for your property?`,
    ``,
    `Best,`,
    `Atlas`,
    `Divinity Aligned LLC`,
  ].join('\n');

  return { smsBody, emailSubject, emailBody };
}

// =============================================================
// RUN MID-TERM PIVOT FOR A LEAD (Stage 8→9)
// =============================================================

async function runMidTermPivot(leadId) {
  const lead = await query(
    `SELECT id, address, city, state, price, monthly_rent, arv, recommended_strategy,
            stage, user_id, seller_name, seller_email, seller_phone
    FROM leads WHERE id = $1`,
    [leadId]
  );
  if (lead.length === 0) throw new Error('Lead not found');

  const l = lead[0];
  const longTermRent = parseFloat(l.monthly_rent) || 0;
  const purchasePrice = parseFloat(l.price) || parseFloat(l.arv) || 0;

  if (!longTermRent || !purchasePrice) {
    return {
      leadId,
      error: 'Missing monthly_rent or price — cannot run mid-term pivot',
    };
  }

  const evaluation = evaluateMidTerm({
    longTermRent,
    purchasePrice,
    city: l.city,
  });

  const pitch = generateMidTermPitch({
    address: l.address,
    longTermRent,
    midTermRent: evaluation.midTermRent,
    midTermPct: evaluation.midTermPct,
    additionalMonthly: evaluation.additionalMonthly,
    additionalAnnual: evaluation.additionalAnnual,
    city: l.city,
  });

  // Save mid-term data to lead
  await query(
    `UPDATE leads SET
      midterm_offer = $1,
      midterm_monthly_rent = $2,
      updated_at = now()
    WHERE id = $3`,
    [purchasePrice, evaluation.midTermRent, leadId]
  );

  // Log the pivot
  await query(
    `INSERT INTO activity_log (lead_id, user_id, action, details, created_at)
    VALUES ($1, $2, 'midterm_pivot_run', $3, now())`,
    [leadId, l.user_id, JSON.stringify({
      longTermRent,
      midTermRent: evaluation.midTermRent,
      midTermPct: evaluation.midTermPct,
      passes: evaluation.passes,
      multiplier: evaluation.multiplier,
      marketDemand: evaluation.marketDemand,
      additionalMonthly: evaluation.additionalMonthly,
      additionalAnnual: evaluation.additionalAnnual,
    })]
  );

  return {
    leadId,
    address: l.address,
    evaluation,
    pitch,
  };
}

// =============================================================
// EXPORT
// =============================================================

module.exports = {
  DEFAULT_MULTIPLIER,
  DEFAULT_THRESHOLD,
  MIDTERM_MARKET_DATA,
  getMarketData,
  estimateMidTermRent,
  midTermPct,
  evaluateMidTerm,
  generateMidTermPitch,
  runMidTermPivot,
};