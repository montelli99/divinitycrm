// Upload all remaining templates to RabbitSign via browser automation
// Strategy: For each PDF, navigate to /createTemplate, upload, fill, submit, capture ID
// The openclaw browser upload works on first call per session — so we'll
// use a single session and hope it works for sequential uploads if we
// reload the page between each one.

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RS_KEY_ID = 'FdoxIa1tIsnUNmCjfGt4Ns';
const RS_KEY_SECRET = 'dHwqVS4Gr9liQ9WJWIJ0DvD5fT7S51rXOUE7fFT8WFx7';
const RS_BASE = 'www.rabbitsign.com';

function sha512(input) {
  return crypto.createHash('sha512').update(input, 'utf8').digest('hex').toUpperCase();
}

function utcNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function rsRequest(method, pathStr, body = null) {
  return new Promise((resolve, reject) => {
    const utcTime = utcNow();
    const signature = sha512(`${method} ${pathStr} ${utcTime} ${RS_KEY_SECRET}`);
    const data = body ? JSON.stringify(body) : null;

    const opts = {
      hostname: RS_BASE,
      path: pathStr,
      method,
      headers: {
        'x-rabbitsign-api-key-id': RS_KEY_ID,
        'x-rabbitsign-api-time-utc': utcTime,
        'x-rabbitsign-api-signature': signature,
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'Cache-Control': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (compatible; DivinityCRM/1.0; +https://divinitycrm.com)',
      },
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: d ? JSON.parse(d) : {}, raw: d });
        } catch(e) {
          resolve({ status: res.statusCode, body: null, raw: d });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function uploadToS3(uploadUrl, pdfBuffer) {
  return new Promise((resolve, reject) => {
    const url = new URL(uploadUrl);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'PUT',
      headers: {
        'Content-Type': 'binary/octet-stream',
        'Content-Length': pdfBuffer.length,
      },
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 204) resolve();
        else reject(new Error(`S3 upload failed: ${res.statusCode}`));
      });
    });
    req.on('error', reject);
    req.write(pdfBuffer);
    req.end();
  });
}

// Templates to create: mapping of PDF file → title + roles
const TEMPLATES_TO_CREATE = [
  { file: 'cash-offer.pdf', title: 'Cash Offer', roles: ['Seller', 'Buyer'] },
  { file: 'subto-addendum.pdf', title: 'Subject To Addendum', roles: ['Seller', 'Buyer'] },
  { file: 'subto-loi.pdf', title: 'SubTo LOI', roles: ['Seller', 'Buyer'] },
  { file: 'stack-loi.pdf', title: 'Stack LOI', roles: ['Seller', 'Buyer'] },
  { file: 'stack50.pdf', title: 'Stack 50% Hybrid', roles: ['Seller', 'Buyer'] },
  { file: 'stack10.pdf', title: 'Stack 10% DP 2yr Balloon', roles: ['Seller', 'Buyer'] },
  { file: 'stack10-bal.pdf', title: 'Stack 10% Balance', roles: ['Seller', 'Buyer'] },
  { file: 'stack-io.pdf', title: 'Stack Interest Only', roles: ['Seller', 'Buyer'] },
  { file: 'stack-mfh.pdf', title: 'Stack Multi-Family', roles: ['Seller', 'Buyer'] },
  { file: 'commercial-psa.pdf', title: 'Commercial PSA', roles: ['Seller', 'Buyer'] },
  { file: 'portfolio-loi.pdf', title: 'Portfolio LOI', roles: ['Seller', 'Buyer'] },
  { file: 'jv-4party.pdf', title: 'JV 4-Party', roles: ['Party 1', 'Party 2', 'Party 3', 'Party 4'] },
  { file: 'jv-5party.pdf', title: 'JV 5-Party', roles: ['Party 1', 'Party 2', 'Party 3', 'Party 4', 'Party 5'] },
];

async function createFolderForTemplate(pdfPath, title) {
  const pdfBuffer = fs.readFileSync(pdfPath);
  console.log(`  PDF: ${pdfPath} (${pdfBuffer.length} bytes)`);

  // Step 1: Get upload URL
  const uploadRes = await rsRequest('POST', '/api/v1/upload-url');
  if (!uploadRes.body || !uploadRes.body.uploadUrl) {
    throw new Error('No upload URL returned');
  }

  // Step 2: Upload to S3
  await uploadToS3(uploadRes.body.uploadUrl, pdfBuffer);

  // Step 3: Create folder
  const folderBody = {
    folder: {
      title,
      summary: `Contract document: ${title}`,
      docInfo: [
        {
          url: uploadRes.body.uploadUrl,
          docTitle: title,
        },
      ],
      signerInfo: {
        'montelliscottrei@gmail.com': {
          name: 'Montelli Scott',
          fields: [],
        },
      },
    },
    date: new Date().toISOString().slice(0, 10),
  };

  const folderRes = await rsRequest('POST', '/api/v1/folder', folderBody);
  if (folderRes.body && folderRes.body.folderId) {
    return folderRes.body.folderId;
  }
  throw new Error(`Folder creation failed: ${folderRes.raw}`);
}

async function main() {
  const pdfsDir = path.resolve(__dirname, 'src/assets/contracts/pdfs');
  const results = [];

  console.log('=== Creating RabbitSign folders for all contract PDFs ===\n');

  for (const tmpl of TEMPLATES_TO_CREATE) {
    const pdfPath = path.join(pdfsDir, tmpl.file);
    if (!fs.existsSync(pdfPath)) {
      console.log(`❌ ${tmpl.file} — NOT FOUND`);
      results.push({ ...tmpl, status: 'missing', folderId: null });
      continue;
    }

    try {
      console.log(`📤 ${tmpl.title} (${tmpl.file})...`);
      const folderId = await createFolderForTemplate(pdfPath, tmpl.title);
      console.log(`✅ ${tmpl.title} → folderId: ${folderId}`);
      results.push({ ...tmpl, status: 'created', folderId });
    } catch (err) {
      console.log(`❌ ${tmpl.title} — ${err.message}`);
      results.push({ ...tmpl, status: 'error', error: err.message, folderId: null });
    }
  }

  console.log('\n=== Summary ===');
  results.forEach(r => {
    const icon = r.status === 'created' ? '✅' : '❌';
    console.log(`${icon} ${r.title}: ${r.folderId || r.error || r.status}`);
  });

  // Save results
  const resultsPath = path.resolve(__dirname, '_rs_folder_ids.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to: ${resultsPath}`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});