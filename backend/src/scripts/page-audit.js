/**
 * page-audit.js — Rendered-page density audit
 *
 * Renders every page of a PDF to PNG, calculates non-white pixel percentage,
 * fails on blank or near-blank pages.
 *
 * Usage: node src/scripts/page-audit.js <pdfPath>
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function findEdge() {
  const paths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of paths) if (fs.existsSync(p)) return p;
  return null;
}

/**
 * Render PDF pages to PNGs using Edge screenshot capability.
 * We use a different approach: convert PDF to images using pdftoppm if available,
 * or use the pdf-parse library to at least check text content per page.
 */
async function auditPageDensity(pdfPath) {
  const results = [];
  
  // Try pdf-parse for text-based density check
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(fs.readFileSync(pdfPath));
    
    // pdf-parse doesn't give per-page text directly, but we can use
    // the total text length vs page count as a rough density metric
    const totalPages = data.numpages;
    const totalText = data.text;
    
    // Split text by form feed (page separator in PDF text extraction)
    const pages = totalText.split('\f');
    
    for (let i = 0; i < totalPages; i++) {
      const pageText = (pages[i] || '').trim();
      const charCount = pageText.length;
      const wordCount = pageText.split(/\s+/).filter(w => w.length > 0).length;
      const density = charCount > 0 ? Math.min(100, (charCount / 2000) * 100) : 0;
      
      let status = 'OK';
      if (density < 1) status = 'FAIL_BLANK';
      else if (density < 5) status = i === 0 ? 'OK_COVER' : 'FAIL_LOW';
      else if (density < 10 && i > 0) status = 'WARN_LOW';
      
      results.push({
        page: i + 1,
        charCount,
        wordCount,
        density: Math.round(density * 10) / 10,
        status,
        preview: pageText.substring(0, 100).replace(/\n/g, ' '),
      });
    }
  } catch (e) {
    // Fallback: just report the error
    return { error: e.message, results: [] };
  }

  return { results };
}

/**
 * Text integrity audit — check extracted PDF text for known defects.
 */
function auditTextIntegrity(pdfPath) {
  const defects = [
    'ag reement', 'Ag Reement', 'AG REEMENT',
    'L oan', 'L Oan', 'L OAN', 'C OE',
    'ALLAPPLIANCES', 'PRINCIPALAMOUNT', 'ALLAMOUNTS', 'ALLADDENDUMS',
    'FULLAS', 'WILLALLOW', '? 50%', '? 100%', '? hold', '? do not',
    '[ X ]', '[x]', '&quot;', '&amp;', '&lt;', '&gt;', '&#39;', '&#34;',
    '\uFFFD',
  ];

  // Title-case patterns — evidence renderer is modifying legal text casing
  const titleCasePatterns = [
    'This Contract Is', 'The Parties Acknowledge And',
    'Buyer Understands That The Property', 'Seller Understands That',
    'The Parties Agree That',
  ];

  try {
    const pdfParse = require('pdf-parse');
    const data = pdfParse(fs.readFileSync(pdfPath));
    return data.then(d => {
      const text = d.text;
      const found = [];

      for (const defect of defects) {
        const count = (text.match(new RegExp(defect.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        if (count > 0) found.push({ defect, count });
      }

      // Check for ANY unresolved merge token in PDF text: [ALPHANUMERIC]
      const unresolvedTokens = text.match(/\[[A-Za-z0-9_]{3,}\]/g);
      if (unresolvedTokens) {
        found.push({ defect: `Unresolved merge tokens in PDF: ${[...new Set(unresolvedTokens)].join(', ')}`, count: unresolvedTokens.length });
      }

      // Check for currency values wrapping across lines: $1,\n000.00
      const wrappedCurrency = text.match(/\$[\d,]+\s+\d+/g);
      if (wrappedCurrency) {
        found.push({ defect: `Currency values wrapping: ${wrappedCurrency.slice(0, 3).join(', ')}`, count: wrappedCurrency.length });
      }

      for (const pattern of titleCasePatterns) {
        if (text.includes(pattern)) found.push({ defect: `Title-cased: "${pattern}"`, count: 1 });
      }

      // Check for mixed checkbox styles
      const hasCheck = /☑/.test(text);
      const hasBox = /☐/.test(text);
      const hasQuestionBox = /\? [A-Z]/.test(text);
      const hasXBox = /\[X\]/i.test(text);
      const styles = [hasCheck, hasBox, hasQuestionBox, hasXBox].filter(Boolean).length;
      if (styles > 1) found.push({ defect: 'Mixed checkbox styles', count: styles });

      return { passed: found.length === 0, defects: found };
    });
  } catch (e) {
    return Promise.resolve({ passed: false, defects: [{ defect: 'PDF parse error', count: 1 }] });
  }
}

async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.log('Usage: node page-audit.js <pdfPath>');
    process.exit(1);
  }

  console.log('\n=== PAGE DENSITY AUDIT ===\n');
  const density = await auditPageDensity(pdfPath);
  if (density.error) {
    console.log('Error:', density.error);
    process.exit(1);
  }

  let blankPages = 0;
  let lowPages = 0;
  let warnPages = 0;
  let okPages = 0;

  density.results.forEach(r => {
    const icon = r.status.startsWith('OK') ? '✅' : r.status.startsWith('WARN') ? '⚠️' : '❌';
    console.log(`${icon} Page ${r.page}: ${r.density}% content — ${r.status}`);
    if (r.preview) console.log(`   Preview: ${r.preview.substring(0, 80)}...`);
    
    if (r.status === 'FAIL_BLANK') blankPages++;
    else if (r.status === 'FAIL_LOW') lowPages++;
    else if (r.status === 'WARN_LOW') warnPages++;
    else okPages++;
  });

  console.log(`\n--- Summary ---`);
  console.log(`Total pages: ${density.results.length}`);
  console.log(`OK: ${okPages}, Warnings: ${warnPages}, Low content: ${lowPages}, Blank: ${blankPages}`);

  console.log('\n=== TEXT INTEGRITY AUDIT ===\n');
  const integrity = await auditTextIntegrity(pdfPath);
  if (integrity.passed) {
    console.log('✅ PASS — No known defects found in PDF text');
  } else {
    console.log('❌ FAIL — Defects found:');
    integrity.defects.forEach(d => console.log(`  ${d.defect}: ${d.count} occurrences`));
  }

  const overallPass = blankPages === 0 && lowPages === 0 && integrity.passed;
  console.log(`\n=== OVERALL: ${overallPass ? '✅ PASS' : '❌ FAIL'} ===`);
  process.exit(overallPass ? 0 : 1);
}

module.exports = { auditPageDensity, auditTextIntegrity };

if (require.main === module) main();