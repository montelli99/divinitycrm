// =============================================================
// Doc Analyzer Service — Divinity CRM
// =============================================================
// Built: 2026-06-18 by Atlas (Phase 9)
// Source: ghl-automations/modules/doc-analyzer.js
//
// Purpose: Analyze uploaded documents (rent rolls, P&L statements,
//          tax records) and extract structured data for underwriting.
//          Score properties against the buy box criteria.
//
// Analysis types:
//   1. Rent Roll — unit-by-unit breakdown, vacancy loss, MTM risk
//   2. P&L / Income Statement — NOI, expense ratio, flags
//   3. Tax Records — assessed value, tax rate, liens, flood zone
//   4. Buy Box Scorer — 7-point scoring system
// =============================================================

const { query } = require('../db/connection');

// =============================================================
// BUY BOX CRITERIA
// =============================================================

const BUY_BOX_CRITERIA = {
  redStates: ['AL', 'AK', 'AR', 'FL', 'GA', 'ID', 'IN', 'KS', 'KY', 'LA', 'MS', 'MO', 'MT', 'NE', 'NC', 'ND', 'OH', 'OK', 'SC', 'SD', 'TN', 'TX', 'UT', 'WV', 'WY'],
  priceRange: { min: 150000, max: 550000 },
  minBeds: 3,
  minPopulation: 10000,
  noHOA: true,
  noPool: true,
  noFloodZone: true,
};

// =============================================================
// ANALYZE RENT ROLL
// =============================================================

function analyzeRentRoll(address, data) {
  const units = data.units || [];
  const totalRent = units.reduce((sum, u) => sum + (parseFloat(u.rent) || 0), 0);
  const occupied = units.filter(u => u.status === 'Occupied');
  const vacant = units.filter(u => u.status === 'Vacant');
  const mtm = units.filter(u => u.leaseEnd === 'MTM' || u.leaseEnd === 'Month-to-Month');
  const vacancyLoss = vacant.reduce((sum, u) => sum + (parseFloat(u.rent) || 0), 0);
  const effectiveGross = totalRent - vacancyLoss;

  const flags = [];
  if (vacant.length > 0) flags.push({ severity: 'yellow', text: `${vacant.length} vacant unit(s) — $${vacancyLoss}/mo lost` });
  if (mtm.length > 0) flags.push({ severity: 'yellow', text: `${mtm.length} unit(s) month-to-month — lease-up risk` });
  if (units.length === 0) flags.push({ severity: 'red', text: 'No unit data extracted — manual review needed' });

  const lines = [
    `═══ RENT ROLL ANALYSIS — ${address} ═══`,
    '',
    `Units: ${units.length} | Occupied: ${occupied.length} | Vacant: ${vacant.length}`,
    `Gross Scheduled Rent: $${totalRent.toLocaleString()}/mo`,
    `Vacancy Loss: $${vacancyLoss.toLocaleString()}/mo`,
    `Effective Gross: $${effectiveGross.toLocaleString()}/mo`,
    `Avg Rent/Unit: $${units.length > 0 ? Math.round(totalRent / units.length).toLocaleString() : 'N/A'}`,
    `MTM Risk: ${mtm.length}/${units.length} units (${units.length > 0 ? Math.round(mtm.length / units.length * 100) : 0}%)`,
    '',
  ];

  if (units.length > 0) {
    lines.push('PER UNIT:');
    lines.push('  Unit  │ Rent   │ Status    │ Lease End');
    lines.push('  ──────┼────────┼───────────┼───────────');
    units.forEach(u => {
      lines.push(`  ${String(u.name || '?').padEnd(6)}│ $${String(u.rent || 0).padEnd(6)}│ ${String(u.status || '?').padEnd(9)}│ ${String(u.leaseEnd || '?')}`);
    });
    lines.push('');
  }

  flags.forEach(f => lines.push(`${f.severity === 'red' ? '🔴' : '🟡'} ${f.text}`));

  return {
    report: lines.join('\n'),
    summary: { totalRent, effectiveGross, vacancyLoss, unitCount: units.length, occupiedCount: occupied.length, vacantCount: vacant.length, mtmCount: mtm.length },
    flags,
  };
}

// =============================================================
// ANALYZE P&L / INCOME STATEMENT
// =============================================================

function analyzePL(address, data) {
  const income = data.income || {};
  const expenses = data.expenses || {};

  const totalIncome = Object.values(income).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const totalExpenses = Object.values(expenses).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const noi = totalIncome - totalExpenses;
  const expenseRatio = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;

  const flags = [];
  if (expenseRatio > 50) flags.push({ severity: 'yellow', text: `Expense ratio ${expenseRatio.toFixed(0)}% — high. Verify maintenance costs.` });
  if (expenseRatio < 30 && totalIncome > 0) flags.push({ severity: 'yellow', text: `Expense ratio ${expenseRatio.toFixed(0)}% — unusually low. Missing expenses?` });

  const lines = [
    `═══ P&L ANALYSIS — ${address} ═══`,
    '',
    'INCOME:',
  ];
  Object.entries(income).forEach(([k, v]) => lines.push(`  ${k}: $${parseFloat(v || 0).toLocaleString()}/yr`));
  lines.push(`  TOTAL: $${totalIncome.toLocaleString()}/yr`);
  lines.push('');
  lines.push('EXPENSES:');
  Object.entries(expenses).forEach(([k, v]) => lines.push(`  ${k}: $${parseFloat(v || 0).toLocaleString()}/yr`));
  lines.push(`  TOTAL: $${totalExpenses.toLocaleString()}/yr`);
  lines.push('');
  lines.push(`NOI: $${noi.toLocaleString()}/yr ($${Math.round(noi / 12).toLocaleString()}/mo)`);
  lines.push(`Expense Ratio: ${expenseRatio.toFixed(1)}%`);
  flags.forEach(f => lines.push(`${f.severity === 'red' ? '🔴' : '🟡'} ${f.text}`));

  return {
    report: lines.join('\n'),
    summary: { totalIncome, totalExpenses, noi, monthlyNOI: Math.round(noi / 12), expenseRatio },
    flags,
  };
}

// =============================================================
// ANALYZE TAX RECORDS
// =============================================================

function analyzeTax(address, data) {
  const lines = [
    `═══ TAX ANALYSIS — ${address} ═══`,
    '',
    `County: ${data.county || 'Unknown'}`,
    `Tax Year: ${data.year || 'Current'}`,
    `Annual Tax: $${parseFloat(data.annualTax || 0).toLocaleString()}`,
    `Tax Rate: ${data.taxRate || 'Unknown'}`,
    `Assessed Value: $${parseFloat(data.assessedValue || 0).toLocaleString()}`,
    `Market Value: $${parseFloat(data.marketValue || 0).toLocaleString()}`,
    `Homestead: ${data.homestead ? 'Yes' : 'No'}`,
  ];

  const flags = [];
  if (data.taxUnpaid) flags.push({ severity: 'red', text: 'Tax bill unpaid — verify liens' });
  if (data.isFloodZone) flags.push({ severity: 'red', text: 'Flood zone — excluded from buy box' });

  flags.forEach(f => lines.push(`${f.severity === 'red' ? '🔴' : '🟡'} ${f.text}`));

  return {
    report: lines.join('\n'),
    summary: {
      annualTax: parseFloat(data.annualTax || 0),
      assessedValue: parseFloat(data.assessedValue || 0),
      marketValue: parseFloat(data.marketValue || 0),
      homestead: !!data.homestead,
      taxUnpaid: !!data.taxUnpaid,
      isFloodZone: !!data.isFloodZone,
    },
    flags,
  };
}

// =============================================================
// BUY BOX SCORER
// =============================================================

function scoreBuyBox(address, params) {
  const { state, askingPrice, beds, population, hasHOA, hasPool, isFloodZone } = params;
  const checks = [];
  let score = 0;
  const total = 7;

  // 1. Red State
  if (BUY_BOX_CRITERIA.redStates.includes(state?.toUpperCase())) {
    checks.push({ pass: true, text: '✅ Red State' });
    score++;
  } else {
    checks.push({ pass: false, text: `❌ ${state || 'Unknown'} — not red state` });
  }

  // 2. Price Range
  const price = parseFloat(askingPrice) || 0;
  if (price >= BUY_BOX_CRITERIA.priceRange.min && price <= BUY_BOX_CRITERIA.priceRange.max) {
    checks.push({ pass: true, text: '✅ Price $150-550K' });
    score++;
  } else {
    checks.push({ pass: false, text: `❌ Price $${price.toLocaleString()} — out of range` });
  }

  // 3. Beds
  const bedCount = parseInt(beds) || 0;
  if (bedCount >= BUY_BOX_CRITERIA.minBeds) {
    checks.push({ pass: true, text: '✅ 3+ beds' });
    score++;
  } else {
    checks.push({ pass: false, text: '❌ Less than 3 beds' });
  }

  // 4. Population
  const pop = parseInt(population) || 0;
  if (pop >= BUY_BOX_CRITERIA.minPopulation) {
    checks.push({ pass: true, text: '✅ Pop >10K' });
    score++;
  } else {
    checks.push({ pass: false, text: '❌ Pop <10K — discard' });
  }

  // 5. No HOA
  if (!hasHOA) {
    checks.push({ pass: true, text: '✅ No HOA' });
    score++;
  } else {
    checks.push({ pass: false, text: '❌ HOA — excluded' });
  }

  // 6. No Pool
  if (!hasPool) {
    checks.push({ pass: true, text: '✅ No pool' });
    score++;
  } else {
    checks.push({ pass: false, text: '❌ Pool — excluded' });
  }

  // 7. No Flood Zone
  if (!isFloodZone) {
    checks.push({ pass: true, text: '✅ No flood zone' });
    score++;
  } else {
    checks.push({ pass: false, text: '❌ Flood zone — excluded' });
  }

  const pass = score >= 5;
  const verdict = score === total ? '✅ AUTO-GREENLIT' : pass ? '🟡 REVIEW' : '🔴 BELOW BUY BOX — KAYLA DECIDE';

  const lines = [
    `═══ BUY BOX SCORE — ${address} ═══`,
    '',
    ...checks.map(c => c.text),
    '',
    `SCORE: ${score}/${total} ${verdict}`,
  ];

  return {
    report: lines.join('\n'),
    score,
    total,
    pass,
    verdict,
    checks,
  };
}

// =============================================================
// RUN FULL DOC ANALYSIS FOR A LEAD
// =============================================================

async function runDocAnalysis(leadId, docData = {}) {
  const lead = await query(
    `SELECT id, address, city, state, price, beds, population, 
            has_hoa, has_pool, in_flood_zone, user_id
    FROM leads WHERE id = $1`,
    [leadId]
  );
  if (lead.length === 0) throw new Error('Lead not found');

  const l = lead[0];
  const address = l.address || docData.address || 'Property';
  const results = [];

  // Rent Roll
  if (docData.rentRoll) {
    const rr = analyzeRentRoll(address, docData.rentRoll);
    results.push({ type: 'rent_roll', ...rr });
  }

  // P&L
  if (docData.plStatement) {
    const pl = analyzePL(address, docData.plStatement);
    results.push({ type: 'pl_statement', ...pl });
  }

  // Tax Records
  if (docData.taxRecords) {
    const tax = analyzeTax(address, docData.taxRecords);
    results.push({ type: 'tax_records', ...tax });
  }

  // Buy Box (always run if we have lead data)
  const buyBoxParams = docData.buyBoxParams || {
    state: l.state,
    askingPrice: l.price,
    beds: l.beds,
    population: l.population,
    hasHOA: l.has_hoa,
    hasPool: l.has_pool,
    isFloodZone: l.in_flood_zone,
  };
  const bb = scoreBuyBox(address, buyBoxParams);
  results.push({ type: 'buy_box', ...bb });

  // Build full report
  const fullReport = results.map(r => r.report).join('\n\n');

  // Save to lead
  await query(
    `UPDATE leads SET
      buy_box_passed = $1,
      buy_box_match = $2,
      notes = COALESCE(notes, '') || $3,
      updated_at = now()
    WHERE id = $4`,
    [bb.pass, bb.pass, '\n\n' + fullReport, leadId]
  );

  // Log
  await query(
    `INSERT INTO activity_log (lead_id, user_id, action, details, created_at)
    VALUES ($1, $2, 'doc_analysis_run', $3, now())`,
    [leadId, l.user_id, JSON.stringify({
      analysisTypes: results.map(r => r.type),
      buyBoxScore: bb.score,
      buyBoxPass: bb.pass,
      flags: results.flatMap(r => r.flags || []),
    })]
  );

  return {
    leadId,
    address,
    results,
    fullReport,
    buyBox: { score: bb.score, total: bb.total, pass: bb.pass, verdict: bb.verdict },
  };
}

// =============================================================
// QUICK BUY BOX CHECK (no doc upload needed)
// =============================================================

async function quickBuyBoxCheck(leadId) {
  const lead = await query(
    `SELECT id, address, state, price, beds, population,
            has_hoa, has_pool, in_flood_zone
    FROM leads WHERE id = $1`,
    [leadId]
  );
  if (lead.length === 0) throw new Error('Lead not found');

  const l = lead[0];
  const result = scoreBuyBox(l.address, {
    state: l.state,
    askingPrice: l.price,
    beds: l.beds,
    population: l.population,
    hasHOA: l.has_hoa,
    hasPool: l.has_pool,
    isFloodZone: l.in_flood_zone,
  });

  // Update lead
  await query(
    `UPDATE leads SET buy_box_passed = $1, buy_box_match = $2, updated_at = now() WHERE id = $3`,
    [result.pass, result.pass, leadId]
  );

  return { leadId, address: l.address, ...result };
}

// =============================================================
// EXPORT
// =============================================================

module.exports = {
  BUY_BOX_CRITERIA,
  analyzeRentRoll,
  analyzePL,
  analyzeTax,
  scoreBuyBox,
  runDocAnalysis,
  quickBuyBoxCheck,
};