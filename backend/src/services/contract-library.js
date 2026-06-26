/**
 * contract-library.js — Source-of-truth for clause content & draft generation
 *
 * Reads from `backend/src/assets/contracts/` (bundled copies). The canonical
 * source lives outside the deploy boundary (in the workspace at
 * ai-rei/kay-exclusive/), but Render only ships the backend directory, so we
 * bundle the contract text files alongside the code.
 *
 * Set KAY_EXCLUSIVE_DIR env var to read from the upstream workspace folder
 * instead (for local dev or when you want live source).
 *
 * RabbitSign is only the signing envelope — never the source of clause language.
 *
 * Contract families covered (per LRN-20260626-010):
 *   - cash        — Cash Offer Template
 *   - subto       — PSA Creative Sub To + Subject to Addendum
 *   - stack50     — Stack w Principal (50% wrap variant)
 *   - stack10     — Stack 10% DP 2-year balloon
 *   - stack_interest_only — Interest Only Stack
 *   - stack_mfh   — MFH Stack variant
 *   - seller_finance — PSA with seller carryback (SubTo with carryback)
 *   - commercial  — Commercial Purchase Agreement
 *   - portfolio   — Portfolio Stack LOI
 *   - jv_4party   — 4-party JV
 *   - jv_5party   — 5-party JV
 *
 * Field substitution is non-destructive — only `[PLACEHOLDER]` tokens are replaced.
 */

const fs = require('node:fs');
const path = require('node:path');

// Production default: bundled source files ship with the backend deploy.
// Override with KAY_EXCLUSIVE_DIR for live local-dev sync from the upstream folder.
const BUNDLED_CONTRACTS_DIR = path.resolve(__dirname, '..', 'assets', 'contracts');
const KAY_EXCLUSIVE_DIR = process.env.KAY_EXCLUSIVE_DIR;

function resolveSourceDir() {
  if (KAY_EXCLUSIVE_DIR && fs.existsSync(KAY_EXCLUSIVE_DIR)) return KAY_EXCLUSIVE_DIR;
  return BUNDLED_CONTRACTS_DIR;
}

function sourceDir() {
  return resolveSourceDir();
}

/**
 * CONTRACT_LIBRARY — Maps lowercase contract-type keys to:
 *   - template file (the master contract text)
 *   - addenda files (appended to the master)
 *   - LOI file (separate Letter of Intent, if any)
 *   - rabbitsign template env var (NO fallback — throws if missing)
 *
 * Files are looked up via `resolveSourceDir()`, which prefers KAY_EXCLUSIVE_DIR
 * (live upstream sync) when set + exists, otherwise falls back to the bundled
 * directory at backend/src/assets/contracts/ (shipped with deploy).
 */
function f(name) { return name; }  // local helper for readability

const CONTRACT_LIBRARY = {
  cash: {
    family: 'cash',
    templateFile: f('cash-offer.txt'),
    addendaFiles: [],
    loiFile: f('cash-offer.txt'),
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_CASH',
  },
  subto: {
    family: 'subto',
    templateFile: f('subto-psa.txt'),
    addendaFiles: [
      f('subto-addendum.txt'),
    ],
    loiFile: f('subto-loi.txt'),
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_SUBTO',
  },
  stack50: {
    family: 'stack',
    templateFile: f('stack50.txt'),
    addendaFiles: [],
    loiFile: f('stack-loi.txt'),
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_STACK50',
  },
  stack10: {
    family: 'stack',
    templateFile: f('stack10.txt'),
    addendaFiles: [],
    loiFile: f('stack10-bal.txt'),
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_STACK10',
  },
  stack_interest_only: {
    family: 'stack',
    templateFile: f('stack-io.txt'),
    addendaFiles: [],
    loiFile: f('stack-io.txt'),
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_STACK_IO',
  },
  stack_mfh: {
    family: 'stack',
    templateFile: f('stack-mfh.txt'),
    addendaFiles: [],
    loiFile: f('stack-mfh.txt'),
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_STACK_MFH',
  },
  seller_finance: {
    family: 'subto',
    templateFile: f('subto-psa.txt'),
    addendaFiles: [
      f('subto-addendum.txt'),
    ],
    loiFile: f('subto-loi.txt'),
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_SF',
  },
  commercial: {
    family: 'commercial',
    templateFile: f('commercial-psa.txt'),
    addendaFiles: [],
    loiFile: null,
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_COMMERCIAL',
  },
  portfolio: {
    family: 'portfolio',
    templateFile: f('portfolio-loi.txt'),
    addendaFiles: [],
    loiFile: f('portfolio-loi.txt'),
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_PORTFOLIO',
  },
  jv_4party: {
    family: 'jv',
    templateFile: f('jv-4party.txt'),
    addendaFiles: [],
    loiFile: null,
    rabbitsignTemplateEnvVar: 'RABBITSIGN_TEMPLATE_JV',
  },
  jv_5party: {
    family: 'jv',
    templateFile: f('jv-5party.txt'),
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
 * Resolve a relative filename to an absolute path using the active source dir.
 * Always uses `sourceDir()` so deployments read from the bundled directory
 * (or KAY_EXCLUSIVE_DIR override) regardless of cwd.
 */
function resolvePath(filename) {
  return path.join(sourceDir(), filename);
}

/**
 * Read the raw template text for a given contract type.
 * Throws if the file is missing — surface the broken local source loudly.
 */
function getTemplateText(contractType) {
  assertSupported(contractType);
  const entry = CONTRACT_LIBRARY[contractType];
  const filePath = resolvePath(entry.templateFile);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Template file missing for contract type '${contractType}': ${filePath}. ` +
      `Source dir: ${sourceDir()}. Restore the file or set KAY_EXCLUSIVE_DIR.`
    );
  }
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Read all addenda text for a contract type.
 * Returns array of {file, text} in order.
 */
function getAddendaText(contractType) {
  assertSupported(contractType);
  const entry = CONTRACT_LIBRARY[contractType];
  return entry.addendaFiles
    .map(filename => resolvePath(filename))
    .filter(f => fs.existsSync(f))
    .map(f => ({ file: f, text: fs.readFileSync(f, 'utf8') }));
}

/**
 * Read the LOI text for a contract type (or null if none).
 */
function getLoiText(contractType) {
  assertSupported(contractType);
  const entry = CONTRACT_LIBRARY[contractType];
  if (!entry.loiFile) return null;
  const filePath = resolvePath(entry.loiFile);
  if (!fs.existsSync(filePath)) return null;
  return { file: filePath, text: fs.readFileSync(filePath, 'utf8') };
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
  // Don't expose absolute paths in API responses — only the source-dir name
  return {
    family: entry.family,
    rabbitsignTemplateEnvVar: entry.rabbitsignTemplateEnvVar,
    hasTemplate: fs.existsSync(resolvePath(entry.templateFile)),
    addendaCount: entry.addendaFiles.length,
    hasLoi: entry.loiFile && fs.existsSync(resolvePath(entry.loiFile)),
    rabbitsignTemplateConfigured: !!process.env[entry.rabbitsignTemplateEnvVar],
    sourceDir: path.basename(sourceDir()),
  };
}

/**
 * Audit all contract types and report status.
 * Used by the morning brief cron to alert on missing source files.
 */
function auditLibrary() {
  const report = {
    total: listContractTypes().length,
    sourceDir: sourceDir(),
    bundledDir: BUNDLED_CONTRACTS_DIR,
    liveOverride: KAY_EXCLUSIVE_DIR || null,
    types: [],
    issues: [],
  };
  for (const type of listContractTypes()) {
    const entry = CONTRACT_LIBRARY[type];
    const issues = [];
    const templatePath = resolvePath(entry.templateFile);
    if (!fs.existsSync(templatePath)) {
      issues.push(`missing template file: ${entry.templateFile}`);
    }
    entry.addendaFiles.forEach((filename, i) => {
      const p = resolvePath(filename);
      if (!fs.existsSync(p)) issues.push(`missing addendum[${i}]: ${filename}`);
    });
    if (entry.loiFile) {
      const p = resolvePath(entry.loiFile);
      if (!fs.existsSync(p)) issues.push(`missing LOI file: ${entry.loiFile}`);
    }
    if (!process.env[entry.rabbitsignTemplateEnvVar]) {
      issues.push(`missing RabbitSign template ID: set ${entry.rabbitsignTemplateEnvVar}`);
    }
    report.types.push({
      type,
      family: entry.family,
      templateConfigured: fs.existsSync(templatePath),
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
  BUNDLED_CONTRACTS_DIR,
  KAY_EXCLUSIVE_DIR,
  sourceDir,
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