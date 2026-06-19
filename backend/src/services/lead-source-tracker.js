// =============================================================
// Lead Source Tracker Service — Divinity CRM
// =============================================================
// Source: AIREI_MASTER_PLAYBOOK.md (Part 2, Part 6)
//
// Purpose: Track lead sources, score leads by source quality,
//          calculate ROI per source, attribute deals to channels.
//
// Lead Sources (per source docs):
//   - FB_MARKETPLACE (Part 6 — primary, extensively documented)
//   - AGENT_REFERRED (called listing agent — per call scripts)
//   - SELLER_REFERRED (referrals from past clients, partners — Part 7)
//   - OTHER (anything not fitting above)
//
// No mention in source of: PPC, Bandit Signs, Cold Call, SMS Blast, RVM,
// Zillow, Redfin, "kayla_sheet", "list_pull". REMOVED.
// =============================================================

const { query } = require('../db/connection');

// =============================================================
// LEAD SOURCES — only what's in the source docs
// =============================================================
// Source values match the DB enum: facebook, referral, agent_referred, other
// (Per Master Playbook Part 6 + Part 7)

const LEAD_SOURCES = {
  facebook: {
    name: 'Facebook Marketplace',
    description: 'Organic Facebook Marketplace listings (per Master Playbook Part 6)',
    typicalCAC: '$0 - $25',
    qualityTier: 'B',
    closeRate: '3-10%',
    sourceRef: 'Part 6 — FB Marketplace Prospecting',
  },
  agent_referred: {
    name: 'Agent Referred',
    description: 'Lead from listing agent (called via Agent Initial Script)',
    typicalCAC: '$0',
    qualityTier: 'B+',
    closeRate: '4-12%',
    sourceRef: 'Part 3 — Agent Initial Script (3rd Step/Pt 5 - Scripts)',
  },
  referral: {
    name: 'Seller Referred',
    description: 'Referral from past client, partner, or "double/triple/quadruple dip" (Part 7 closing)',
    typicalCAC: '$0',
    qualityTier: 'A',
    closeRate: '10-20%',
    sourceRef: 'Part 7 — "Always ask for referrals at closing"',
  },
  other: {
    name: 'Other / Unknown',
    description: 'Uncategorized lead source',
    typicalCAC: 'Unknown',
    qualityTier: 'D',
    closeRate: 'Unknown',
    sourceRef: 'Default — none of the above',
  },
};

// =============================================================
// TIER SCORES
// =============================================================

const TIER_SCORES = {
  'A': 40,
  'B+': 30,
  'B': 20,
  'C': 10,
  'D': 0,
};

// =============================================================
// SCORE A LEAD
// =============================================================

function scoreLead({ source, market, daysOnMarket, menteeMarkets }) {
  const sourceData = LEAD_SOURCES[source] || LEAD_SOURCES.other;
  let score = 0;

  // Source quality tier
  score += TIER_SCORES[sourceData.qualityTier] || 0;

  // Market match (mentee has assigned market expertise)
  if (menteeMarkets && market) {
    const matches = menteeMarkets.some(m => {
      const mLower = m.toLowerCase();
      const marketLower = market.toLowerCase();
      return marketLower.includes(mLower) || mLower.includes(marketLower);
    });
    if (matches) score += 30;
  }

  // DOM factor (stale listing = motivated seller)
  // Per Master Playbook Part 2 Step 11: "Circle back when listing is about to expire (DOM-181)"
  if (daysOnMarket) {
    if (daysOnMarket > 180) score += 20;
    else if (daysOnMarket > 90) score += 10;
  }

  let priority;
  if (score >= 70) priority = 'A';
  else if (score >= 50) priority = 'B';
  else if (score >= 30) priority = 'C';
  else priority = 'D';

  return {
    score,
    priority,
    source: sourceData,
    breakdown: {
      sourceTier: TIER_SCORES[sourceData.qualityTier] || 0,
      marketMatch: menteeMarkets && market ? 30 : 0,
      domBonus: daysOnMarket > 180 ? 20 : daysOnMarket > 90 ? 10 : 0,
    },
  };
}

// =============================================================
// GET SOURCE ATTRIBUTION (ROI by source)
// =============================================================

async function getSourceAttribution() {
  const attribution = await query(
    `SELECT
      source,
      COUNT(*) AS total_leads,
      COUNT(*) FILTER (WHERE stage = 'CLOSED') AS closed,
      COUNT(*) FILTER (WHERE stage = 'DEAD') AS dead,
      COUNT(*) FILTER (WHERE stage NOT IN ('ARCHIVED', 'CLOSED', 'DEAD')) AS active,
      SUM(price) FILTER (WHERE stage = 'CLOSED') AS total_closed_value,
      SUM(estimated_profit) FILTER (WHERE stage = 'CLOSED') AS total_profit,
      AVG(EXTRACT(DAY FROM (closed_date - created_at))) FILTER (WHERE stage = 'CLOSED') AS avg_days_to_close
    FROM leads
    GROUP BY source
    ORDER BY closed DESC, total_leads DESC`
  );

  return attribution.map(a => {
    const sourceData = LEAD_SOURCES[a.source] || LEAD_SOURCES.other;
    const total = parseInt(a.total_leads) || 0;
    const closed = parseInt(a.closed) || 0;
    const dead = parseInt(a.dead) || 0;
    const resolved = closed + dead;

    return {
      source: a.source,
      sourceName: sourceData.name,
      qualityTier: sourceData.qualityTier,
      typicalCloseRate: sourceData.closeRate,
      totalLeads: total,
      active: parseInt(a.active) || 0,
      closed,
      dead,
      conversionRate: resolved > 0 ? Math.round((closed / resolved) * 100) : 0,
      totalClosedValue: parseFloat(a.total_closed_value) || 0,
      totalProfit: parseFloat(a.total_profit) || 0,
      avgDaysToClose: a.avg_days_to_close ? Math.round(parseFloat(a.avg_days_to_close)) : null,
      roi: total > 0 ? (closed / total * 100).toFixed(1) + '%' : 'N/A',
    };
  });
}

// =============================================================
// GET SOURCE SUMMARY (dashboard widget)
// =============================================================

async function getSourceSummary() {
  const summary = await query(
    `SELECT
      COUNT(*) AS total_leads,
      COUNT(*) FILTER (WHERE stage = 'CLOSED') AS total_closed,
      COUNT(*) FILTER (WHERE stage = 'DEAD') AS total_dead,
      SUM(estimated_profit) FILTER (WHERE stage = 'CLOSED') AS total_profit
    FROM leads`
  );

  const bySource = await query(
    `SELECT source, COUNT(*) as count FROM leads GROUP BY source ORDER BY count DESC`
  );

  const topSource = bySource[0] || { source: 'none', count: 0 };

  return {
    ...summary[0],
    sourceCount: bySource.length,
    topSource: {
      source: topSource.source,
      name: LEAD_SOURCES[topSource.source]?.name || 'Unknown',
      count: parseInt(topSource.count),
    },
    bySource: bySource.map(s => ({
      source: s.source,
      name: LEAD_SOURCES[s.source]?.name || 'Unknown',
      count: parseInt(s.count),
    })),
  };
}

// =============================================================
// TAG LEAD WITH SOURCE
// =============================================================

async function tagLeadSource(leadId, source, sourceDetails = {}) {
  const validSources = Object.keys(LEAD_SOURCES);
  if (!validSources.includes(source)) {
    throw new Error(`Unknown source: ${source}. Valid: ${validSources.join(', ')}`);
  }

  const result = await query(
    `UPDATE leads SET source = $1, lead_source = $2, updated_at = now() WHERE id = $3 RETURNING id, address, source`,
    [source, source, leadId]
  );

  if (result.length === 0) throw new Error('Lead not found');

  // Score the lead
  const lead = await query(
    `SELECT id, address, city, state, dom, user_id FROM leads WHERE id = $1`,
    [leadId]
  );

  const score = scoreLead({
    source,
    market: lead[0].city || lead[0].state,
    daysOnMarket: lead[0].dom,
  });

  // Log
  await query(
    `INSERT INTO activity_log (lead_id, user_id, action, details, created_at)
    VALUES ($1, $2, 'lead_source_tagged', $3, now())`,
    [leadId, lead[0].user_id, JSON.stringify({
      source,
      sourceName: LEAD_SOURCES[source].name,
      score: score.score,
      priority: score.priority,
      ...sourceDetails,
    })]
  );

  return {
    leadId,
    address: result[0].address,
    source,
    sourceName: LEAD_SOURCES[source].name,
    score,
  };
}

// =============================================================
// BULK TAG LEADS BY SOURCE
// =============================================================

async function bulkTagSource(leadIds, source) {
  const results = [];
  for (const leadId of leadIds) {
    try {
      const result = await tagLeadSource(leadId, source);
      results.push({ leadId, success: true, ...result });
    } catch (err) {
      results.push({ leadId, success: false, error: err.message });
    }
  }
  return { tagged: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length, results };
}

// =============================================================
// GET SOURCE PERFORMANCE OVER TIME
// =============================================================

async function getSourcePerformance(days = 90) {
  const since = new Date(Date.now() - days * 86400000);

  const performance = await query(
    `SELECT
      source,
      DATE_TRUNC('week', created_at) AS week,
      COUNT(*) AS leads_added,
      COUNT(*) FILTER (WHERE stage = 'CLOSED') AS closed
    FROM leads
    WHERE created_at >= $1
    GROUP BY source, DATE_TRUNC('week', created_at)
    ORDER BY week DESC, leads_added DESC`,
    [since]
  );

  // Aggregate by source
  const bySource = {};
  performance.forEach(row => {
    if (!bySource[row.source]) {
      bySource[row.source] = {
        source: row.source,
        name: LEAD_SOURCES[row.source]?.name || 'Unknown',
        totalLeads: 0,
        totalClosed: 0,
        weeks: [],
      };
    }
    bySource[row.source].totalLeads += parseInt(row.leads_added);
    bySource[row.source].totalClosed += parseInt(row.closed);
    bySource[row.source].weeks.push({
      week: row.week,
      leadsAdded: parseInt(row.leads_added),
      closed: parseInt(row.closed),
    });
  });

  return {
    days,
    since: since.toISOString(),
    bySource: Object.values(bySource).sort((a, b) => b.totalLeads - a.totalLeads),
  };
}

// =============================================================
// EXPORT
// =============================================================

module.exports = {
  LEAD_SOURCES,
  TIER_SCORES,
  scoreLead,
  getSourceAttribution,
  getSourceSummary,
  tagLeadSource,
  bulkTagSource,
  getSourcePerformance,
};
