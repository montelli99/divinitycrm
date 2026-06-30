/**
 * format-audit.js — Automated formatting inspection for generated contracts
 *
 * Scans filled contract text for:
 * - Double spaces, bad punctuation, encoding problems
 * - Unicode replacement characters
 * - Inconsistent checkbox styles
 * - Inconsistent currency formatting
 * - Bad line wrapping, broken section numbering
 * - Double-dollar signs ($$)
 * - Unresolved [TOKEN] placeholders
 * - HTML artifacts (file://, <div>, <p>, etc.)
 *
 * Usage: node src/scripts/format-audit.js <contractType> [leadDataJson]
 */

const { generateFilledPdf, buildMergeMap, fillTemplate } = require('../services/pdf-generator');
const contractLibrary = require('../services/contract-library');

const TEST_LEAD = {
  address: '555 E2E Test Boulevard, Richmond, VA 23220',
  city: 'Richmond', state: 'VA', zip: '23220',
  price: 195000, seller_name: 'Test Seller Name', buyer_name: 'Divinity Aligned LLC',
  emd_amount: 1000, inspection_period_days: 14, coe_days: 30,
  existing_loan_balance: 145000, existing_loan_type: 'VA Loan',
  seller_carryback: 49000, monthly_payment: 196,
  maturity_date: 'August 1, 2032', maturity_months: 72,
  payment_start_date: 'August 1, 2026', existing_loan_payment: 980,
  seller_email: 's@t.com', seller_phone: '555', seller_address: '789',
  buyer_email: 'b@t.com', buyer_phone: '555', buyer_address: '100',
  personal_guarantee: true, personal_property: 'All appliances to stay',
  occupancy_status: 'tenant-occupied', title_website: 'closedtitle.com',
  title_email: 'o@c.com', title_phone: '800',
};

const AUDIT_RULES = [
  {
    id: 'double_dollar',
    name: 'Double-dollar signs ($$)',
    pattern: /\$\s*\$/g,
    severity: 'critical',
    fix: 'Remove extra $ — formatCurrency() already adds $ prefix',
  },
  {
    id: 'double_space',
    name: 'Double spaces',
    pattern: /  +/g,
    severity: 'minor',
    fix: 'Collapse to single space',
  },
  {
    id: 'replacement_char',
    name: 'Unicode replacement characters',
    pattern: /[\uFFFD\u00BF\u00A1]/g,
    severity: 'critical',
    fix: 'Fix encoding — ensure UTF-8 throughout',
  },
  {
    id: 'html_artifacts',
    name: 'HTML artifacts in text',
    pattern: /file:\/\/\/|<div|<p>|<\/div>|<\/p>|<h[1-6]|<strong|<li|<ul|<br/g,
    severity: 'critical',
    fix: 'HTML should only appear in the HTML output, not in filled text',
  },
  {
    id: 'unresolved_tokens',
    name: 'Unresolved [TOKEN] placeholders',
    pattern: /\[[A-Z_]{5,}\]/g,
    severity: 'critical',
    fix: 'All merge tokens must be resolved before PDF generation',
  },
  {
    id: 'inconsistent_currency',
    name: 'Inconsistent currency formatting',
    pattern: /\$(?!\d)/g, // $ not followed by a digit
    severity: 'warning',
    fix: 'Ensure all dollar amounts use $X,XXX.XX format',
  },
  {
    id: 'broken_section_numbering',
    name: 'Broken section numbering (e.g., 1.1.1.1)',
    pattern: /\d+\.\d+\.\d+\.\d+/g,
    severity: 'warning',
    fix: 'Section numbering should not exceed 3 levels (X.Y.Z)',
  },
  {
    id: 'orphan_section_headers',
    name: 'Orphan section headers (header at end of text)',
    test: (text) => {
      const lines = text.split('\n').filter(l => l.trim());
      const last3 = lines.slice(-3);
      const orphan = last3.some(l => /^\d+\.\d+\s+[A-Z]/.test(l.trim()));
      return orphan;
    },
    severity: 'warning',
    fix: 'Section header should not be the last line — add content after it',
  },
  {
    id: 'empty_parentheses',
    name: 'Empty parentheses ()',
    pattern: /\(\s*\)/g,
    severity: 'minor',
    fix: 'Remove empty parentheses or fill with content',
  },
  {
    id: 'inconsistent_checkbox',
    name: 'Inconsistent checkbox styles',
    test: (text) => {
      const hasMarkedBox = /☑/.test(text);
      const hasXBox = /\[X\]/.test(text);
      const hasEmptyBox = /☐/.test(text);
      const hasQuestionBox = /\? [A-Z]/.test(text);
      const styles = [hasMarkedBox, hasXBox, hasQuestionBox].filter(Boolean).length;
      return styles > 1;
    },
    severity: 'warning',
    fix: 'Use consistent checkbox style — all should be ☑/☐ Unicode',
  },
  {
    id: 'special_chars',
    name: 'Non-ASCII special characters',
    pattern: /[^\x00-\x7F\u2605\u2606\u2610\u2611\u2612\u2013\u2014\u2018\u2019\u201C\u201D\u2026]/g,
    severity: 'minor',
    fix: 'Replace non-standard characters with ASCII equivalents',
  },
];

function auditContract(contractType, lead) {
  contractLibrary.assertSupported(contractType);
  const masterText = contractLibrary.getTemplateText(contractType);
  const mergeMap = buildMergeMap(lead);
  const filledText = fillTemplate(masterText, mergeMap);

  const issues = [];
  let criticalCount = 0;
  let warningCount = 0;
  let minorCount = 0;

  for (const rule of AUDIT_RULES) {
    let matches = [];
    if (rule.pattern) {
      const m = filledText.match(rule.pattern);
      if (m) matches = m;
    } else if (rule.test) {
      if (rule.test(filledText)) matches.push(true);
    }

    if (matches.length > 0) {
      const count = matches.length;
      issues.push({
        rule: rule.id,
        name: rule.name,
        severity: rule.severity,
        count,
        fix: rule.fix,
        samples: matches.slice(0, 3).map(m => typeof m === 'string' ? m.substring(0, 50) : 'detected'),
      });
      if (rule.severity === 'critical') criticalCount += count;
      else if (rule.severity === 'warning') warningCount += count;
      else minorCount += count;
    }
  }

  const passed = criticalCount === 0;
  const score = Math.max(0, 100 - criticalCount * 10 - warningCount * 2 - minorCount);

  return {
    contractType,
    passed,
    score,
    criticalCount,
    warningCount,
    minorCount,
    issues,
    textLength: filledText.length,
  };
}

function auditAllContracts(lead) {
  const types = Object.keys(contractLibrary.CONTRACT_LIBRARY);
  const results = [];
  for (const type of types) {
    try {
      const result = auditContract(type, lead);
      results.push(result);
    } catch (e) {
      results.push({
        contractType: type,
        passed: false,
        score: 0,
        criticalCount: 1,
        warningCount: 0,
        minorCount: 0,
        issues: [{ rule: 'generation_error', name: e.message, severity: 'critical', count: 1, fix: 'Fix the error' }],
      });
    }
  }
  return results;
}

function printReport(results) {
  console.log('\n' + '='.repeat(60));
  console.log('FORMAT AUDIT REPORT');
  console.log('='.repeat(60) + '\n');

  let totalCritical = 0, totalWarning = 0, totalMinor = 0;
  let allPassed = true;

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.contractType}: score=${r.score}, critical=${r.criticalCount}, warning=${r.warningCount}, minor=${r.minorCount}`);
    if (!r.passed) allPassed = false;
    totalCritical += r.criticalCount;
    totalWarning += r.warningCount;
    totalMinor += r.minorCount;

    if (r.issues.length > 0) {
      r.issues.forEach(i => {
        const sIcon = i.severity === 'critical' ? '🚨' : i.severity === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`  ${sIcon} ${i.name}: ${i.count} occurrences — ${i.fix}`);
        if (i.samples.length > 0) console.log(`     Samples: ${i.samples.join(', ')}`);
      });
    }
  }

  console.log('\n' + '-'.repeat(40));
  console.log(`Total: critical=${totalCritical}, warning=${totalWarning}, minor=${totalMinor}`);
  console.log(`Overall: ${allPassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log('='.repeat(60));
}

module.exports = { auditContract, auditAllContracts, printReport, AUDIT_RULES };

// CLI entry point
if (require.main === module) {
  const contractType = process.argv[2];
  if (contractType) {
    const result = auditContract(contractType, TEST_LEAD);
    printReport([result]);
  } else {
    const results = auditAllContracts(TEST_LEAD);
    printReport(results);
  }
}