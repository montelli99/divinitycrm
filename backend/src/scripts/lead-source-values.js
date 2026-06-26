// =============================================================
// lead-source-values.js
// Single source of truth for the lead_source enum values.
//
// Reads from the live DB enum (lead_source) with a process-level cache.
// Falls back to the static list (kept in sync with schema.sql +
// migration_lead_engine.sql + migrate-source-enum.js) if the DB is
// unreachable. This prevents stale hardcoded whitelists from silently
// rejecting valid sources or accepting invalid ones (LRN-20260626-001).
// =============================================================

const { Pool } = require('@neondatabase/serverless');

let cached = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

// Static fallback — mirrors the values defined across:
//   src/db/schema.sql (base)
//   src/db/migration_lead_engine.sql (added: fsbo, foreclosure, tax_sale, tax_assessor, county_parcel)
//   src/db/migrate-source-enum.js (added: kayla_sheet, ppc, website, list_pull, cold_call, direct_mail, bandit_sign, open_house, zillow, redfin)
const FALLBACK_SOURCES = [
  'facebook', 'referral', 'agent_referred', 'other',
  'fsbo', 'foreclosure', 'tax_sale', 'tax_assessor', 'county_parcel',
  'kayla_sheet', 'ppc', 'website', 'list_pull', 'cold_call',
  'direct_mail', 'bandit_sign', 'open_house', 'zillow', 'redfin',
];

async function getLeadSourceValues() {
  const now = Date.now();
  if (cached && (now - cachedAt) < CACHE_TTL_MS) return cached;

  if (!process.env.DATABASE_URL) return FALLBACK_SOURCES;

  try {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const r = await pool.query("SELECT enum_range(NULL::lead_source) AS values");
    const values = r.rows[0]?.values;
    if (Array.isArray(values) && values.length > 0) {
      cached = values;
      cachedAt = now;
      return cached;
    }
  } catch (err) {
    console.warn('[lead-source-values] DB read failed, using fallback:', err.message);
  }
  return FALLBACK_SOURCES;
}

module.exports = { getLeadSourceValues, FALLBACK_SOURCES };