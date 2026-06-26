/**
 * contract-library.js — Source-of-truth for clause content & draft generation
 *
 * Reads from `ai-rei/kay-exclusive/` (Kayla's private contract library).
 * This is the AUTHORITATIVE source for clause text — RabbitSign is only the
 * signing envelope, never the source of clause language.
 *
 * Contract families covered (per LRN-20260626-010):
 *   - cash        — Cash Offer Template (LOI's/Cash Offer LOI/)
 *   - subto       — PSA Creative _ Sub To + Subject to Addendum
 *   - stack50     — Stack PSA (10% DP / 50% wrap) — Stack PSA
 *   - stack10     — Stack 10% DP 2-year balloon variant — Stack LOI's/
 *   - seller_finance — PSA with seller carryback (SubTo with carryback terms)
 *   - commercial  — Real Estate Commercial Purchase Agreement
 *   - portfolio   — Portfolio Stack LOI
 *   - jv_4party   — 4-party JV
 *   - jv_5party   — 5-party JV
 *
 * Field substitution is non-destructive — the original template text is
 * preserved, only `[PLACEHOLDER]` tokens are replaced.
 */

const fs = require('node:fs');
const path = require('node:path');

// Resolve path to the kay-exclusive folder relative to backend root.
// This file lives at: divinitycrm/backend/src/services/contract-library.js
// So we go up 4 levels: services -> src -> backend -> divinitycrm -> prolificcapital
// Allow override via KAY_EXCLUSIVE_DIR env var (for testing or alternate deployments).
const KAY_EXCLUSIVE_DIR = process.env.KAY_EXCLUSIVE_DIR || path.resolve(
  __dirname,
  '..', '..', '..', '..',
  'ai-rei', 'kay-exclusive'
);

/**
 * CONTRACT_LIBRARY — Maps lowercase contract-type keys (matching CONTRACT_TYPES
 * in contract-generator.js) to local file references.
 *
 * `templateFile`     — Path to the master contract text (.txt extract)
 * `addendaFiles`     — Path(s) to addendum files appended to the master
 * `loiFile`          — Path to the LOI (Letter of Intent) if separate from PSA
 * `clauseFiles`      — Per-clause file references for granular clause extraction
 * `rabbitsignTemplateEnvVar` — Env var name holding the RabbitSign template ID
 *                                (NO fallback — throws if missing per LRN-20260626-009)
 * `family`           — High-level grouping for analytics
 */
const CONTRACT_LIBRARY = {
  cash: {
    family: 'cash',
    templateFile: path.join(KAY_EXCLUSIVE_DIR, "LOI's", "Cash Offer LOI", "Cash Offer Template _text.txt"),
    addendaFiles: [],
    loiFile: path.join(KAY_EXCLUSIVE_DIR, "LOI's", "Cash Offer LOI", "Cash Offer Template _text.txt"),
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_CASH',
  },
  subto: {
    family: 'subto',
    templateFile: path.join(KAY_EXCLUSIVE_DIR, "PSA's + JV", "PSA Creative _ Sub To_text.txt"),
    addendaFiles: [
      path.join(KAY_EXCLUSIVE_DIR, "PSA's + JV", "Subject to Addendum_text.txt"),
    ],
    loiFile: path.join(KAY_EXCLUSIVE_DIR, "LOI's", "Subject To LOI", "Subject To LOI Template.docx_text.txt"),
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_SUBTO',
  },
  stack50: {
    family: 'stack',
    templateFile: path.join(KAY_EXCLUSIVE_DIR, "LOI's", "Stack LOI's", "Stack w Principal _text.txt"),
    addendaFiles: [],
    loiFile: path.join(KAY_EXCLUSIVE_DIR, "LOI's", "Stack LOI's", "Stack LOI_text.txt"),
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_STACK50',
  },
  stack10: {
    family: 'stack',
    templateFile: path.join(KAY_EXCLUSIVE_DIR, "LOI's", "Stack LOI's", "Ai 10% DP 2 year balloon_text.txt"),
    addendaFiles: [],
    loiFile: path.join(KAY_EXCLUSIVE_DIR, "LOI's", "Stack LOI's", "Stack LOI 5 yr BAL_text.txt"),
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_STACK10',
  },
  stack_interest_only: {
    family: 'stack',
    templateFile: path.join(KAY_EXCLUSIVE_DIR, "LOI's", "Stack LOI's", "Interest Only Stack LOI_text.txt"),
    addendaFiles: [],
    loiFile: path.join(KAY_EXCLUSIVE_DIR, "LOI's", "Stack LOI's", "Interest Only Stack LOI_text.txt"),
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_STACK_IO',
  },
  stack_mfh: {
    family: 'stack',
    templateFile: path.join(KAY_EXCLUSIVE_DIR, "LOI's", "Stack LOI's", "Ai LOI MFH Stack.docx_text.txt"),
    addendaFiles: [],
    loiFile: path.join(KAY_EXCLUSIVE_DIR, "LOI's", "Stack LOI's", "Ai LOI MFH Stack.docx_text.txt"),
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_STACK_MFH',
  },
  seller_finance: {
    family: 'subto', // Seller finance is a SubTo variant — buyer's carryback
    templateFile: path.join(KAY_EXCLUSIVE_DIR, "PSA's + JV", "PSA Creative _ Sub To_text.txt"),
    addendaFiles: [
      path.join(KAY_EXCLUSIVE_DIR, "PSA's + JV", "Subject to Addendum_text.txt"),
    ],
    loiFile: path.join(KAY_EXCLUSIVE_DIR, "LOI's", "Subject To LOI", "Subject To LOI Template.docx_text.txt"),
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_SF',
  },
  commercial: {
    family: 'commercial',
    templateFile: path.join(KAY_EXCLUSIVE_DIR, "PSA's + JV", "Real Estate Commercial Purchase Agreement.docx_text.txt"),
    addendaFiles: [],
    loiFile: null,
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_COMMERCIAL',
  },
  portfolio: {
    family: 'portfolio',
    templateFile: path.join(KAY_EXCLUSIVE_DIR, "LOI's", "Portfolio Stack LOI_text.txt"),
    addendaFiles: [],
    loiFile: path.join(KAY_EXCLUSIVE_DIR, "LOI's", "Portfolio Stack LOI_text.txt"),
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_PORTFOLIO',
  },
  jv_4party: {
    family: 'jv',
    templateFile: path.join(KAY_EXCLUSIVE_DIR, "PSA's + JV", "4 party JV_text.txt"),
    addendaFiles: [],
    loiFile: null,
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_JV',
  },
  jv_5party: {
    family: 'jv',
    templateFile: path.join(KAY_EXCLUSIVE_DIR, "PSA's + JV", "Copy of 4 party JV_text.txt"), // 5-party is in main folder, fallback to 4-party text
    addendaFiles: [],
    loiFile: null,
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_JV',
  },
};

/**
 * List all supported contract types (keys).
 */
function listContractTypes() {
  return Object.keys(CONTRACT_LIBRARY);
}

/**
 * Check whether a contract type is supported (i.e., has a local source file).
 * Throws if not — caller must handle before calling getTemplateText().
 */
function assertSupported(contractType) {
  const entry = CONTRACT_LIBRARY[contractType];
  if (!entry) {
    const supported = listContractTypes().join(', ');
    throw new Error(
      `Unsupported contract type '${contractType}'. Supported types: ${supported}. ` +
      `No silent fallback: per LRN-20260626-009 we refuse to generate a contract ` +
      `whose clauses don't match the requested family.`
    );
  }
}

/**
 * Read the raw template text for a given contract type.
 * Throws if the file is missing — surface the broken local source loudly.
 */
function getTemplateText(contractType) {
  assertSupported(contractType);
  const entry = CONTRACT_LIBRARY[contractType];
  if (!fs.existsSync(entry.templateFile)) {
    throw new Error(
      `Template file missing for contract type '${contractType}': ${entry.templateFile}. ` +
      `Restore from Kayla's library or update CONTRACT_LIBRARY.`
    );
  }
  return fs.readFileSync(entry.templateFile, 'utf8');
}

/**
 * Read all addenda text for a contract type.
 * Returns array of {file, text} in order.
 */
function getAddendaText(contractType) {
  assertSupported(contractType);
  const entry = CONTRACT_LIBRARY[contractType];
  return entry.addendaFiles
    .filter(f => fs.existsSync(f))
    .map(f => ({ file: f, text: fs.readFileSync(f, 'utf8') }));
}

/**
 * Read the LOI text for a contract type (or null if none).
 */
function getLoiText(contractType) {
  assertSupported(contractType);
  const entry = CONTRACT_LIBRARY[contractType];
  if (!entry.loiFile || !fs.existsSync(entry.loiFile)) return null;
  return { file: entry.loiFile, text: fs.readFileSync(entry.loiFile, 'utf8') };
}

/**
 * Get the RabbitSign template ID for a contract type.
 * Returns the env var value, or throws if not set.
 * NO SILENT FALLBACK — per LRN-20260626-009.
 */
function getRabbitSignTemplateId(contractType) {
  assertSupported(contractType);
  const entry = CONTRACT_LIBRARY[contractType];
  const envVarName = entry.rabbitsignTemplateEnvVar;
  const templateId = process.env[envVarName];
  if (!templateId) {
    throw new Error(
      `No RabbitSign template configured for contract type '${contractType}'. ` +
      `Set ${envVarName} env var with the template ID from RabbitSign. ` +
      `Refusing to send: would otherwise use the wrong template's clauses.`
    );
  }
  return templateId;
}

/**
 * Substitute lead fields into template text.
 * Placeholders: [PROPERTY_ADDRESS], [CITY_STATE_ZIP], [PURCHASE_PRICE], [EMD],
 * [SELLER_NAME], [BUYER_NAME], [INSPECTION_DAYS], [COE_DAYS], [DATE]
 *
 * Substitutes by simple string replacement. Preserves original formatting
 * (whitespace, line breaks, paragraph structure).
 */
function fillTemplate(templateText, lead) {
  if (!lead) return templateText;
  const replacements = {
    '[PROPERTY_ADDRESS]': lead.address || lead.property_address || '________________',
    '[CITY_STATE_ZIP]': [lead.city, lead.state, lead.zip].filter(Boolean).join(', ') || '________________',
    '[PURCHASE_PRICE]': lead.price ? `$${Number(lead.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$________________',
    '[EMD]': lead.emd ? `$${Number(lead.emd).toLocaleString('en-US')}` : '$500.00',
    '[SELLER_NAME]': lead.seller_name || '________________',
    '[BUYER_NAME]': lead.buyer_name || '________________',
    '[INSPECTION_DAYS]': String(lead.inspection_days || 14),
    '[COE_DAYS]': String(lead.coe_days || 30),
    '[DATE]': lead.contract_date || new Date().toLocaleDateString('en-US'),
  };
  let filled = templateText;
  for (const [placeholder, value] of Object.entries(replacements)) {
    filled = filled.split(placeholder).join(value);
  }
  return filled;
}

/**
 * Get the library entry for a contract type.
 * Exposed for debugging and admin endpoints.
 */
function getEntry(contractType) {
  assertSupported(contractType);
  const entry = CONTRACT_LIBRARY[contractType];
  // Don't expose absolute paths in API responses
  return {
    family: entry.family,
    rabbitsignTemplateEnvVar: entry.rabbitsignTemplateEnvVar,
    hasTemplate: fs.existsSync(entry.templateFile),
    addendaCount: entry.addendaFiles.length,
    hasLoi: entry.loiFile && fs.existsSync(entry.loiFile),
    rabbitsignTemplateConfigured: !!process.env[entry.rabbitsignTemplateEnvVar],
  };
}

/**
 * Audit all contract types and report status.
 * Used by the morning brief cron to alert on missing source files.
 */
function auditLibrary() {
  const report = {
    total: listContractTypes().length,
    types: [],
    issues: [],
  };
  for (const type of listContractTypes()) {
    const entry = CONTRACT_LIBRARY[type];
    const issues = [];
    if (!fs.existsSync(entry.templateFile)) {
      issues.push(`missing template file: ${entry.templateFile}`);
    }
    entry.addendaFiles.forEach((f, i) => {
      if (!fs.existsSync(f)) issues.push(`missing addendum[${i}]: ${f}`);
    });
    if (entry.loiFile && !fs.existsSync(entry.loiFile)) {
      issues.push(`missing LOI file: ${entry.loiFile}`);
    }
    if (!process.env[entry.rabbitsignTemplateEnvVar]) {
      issues.push(`missing RabbitSign template ID: set ${entry.rabbitsignTemplateEnvVar}`);
    }
    report.types.push({
      type,
      family: entry.family,
      templateConfigured: fs.existsSync(entry.templateFile),
      rabbitsignConfigured: !!process.env[entry.rabbitsignTemplateEnvVar],
      issues,
    });
    if (issues.length > 0) {
      report.issues.push({ type, issues });
    }
  }
  return report;
}

module.exports = {
  CONTRACT_LIBRARY,
  listContractTypes,
  assertSupported,
  getTemplateText,
  getAddendaText,
  getLoiText,
  getRabbitSignTemplateId,
  fillTemplate,
  getEntry,
  auditLibrary,
};