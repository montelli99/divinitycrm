// Test creating a RabbitSign folder directly with a PDF via API
// This bypasses templates entirely — uploads PDF to S3, then creates a folder
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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
          const parsed = d ? JSON.parse(d) : {};
          resolve({ status: res.statusCode, body: parsed, raw: d });
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
        console.log(`S3 upload: ${res.statusCode}`);
        if (res.statusCode === 200 || res.statusCode === 204) resolve();
        else reject(new Error(`S3 upload failed: ${res.statusCode} ${d.substring(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.write(pdfBuffer);
    req.end();
  });
}

async function main() {
  const pdfPath = path.resolve(__dirname, 'src/assets/contracts/pdfs/cash-offer.pdf');
  console.log(`Reading PDF: ${pdfPath}`);
  const pdfBuffer = fs.readFileSync(pdfPath);
  console.log(`PDF size: ${pdfBuffer.length} bytes`);

  // Step 1: Get upload URL
  console.log('\n--- Step 1: Get upload URL ---');
  const uploadRes = await rsRequest('POST', '/api/v1/upload-url');
  console.log(`Status: ${uploadRes.status}`);
  console.log(`Response: ${JSON.stringify(uploadRes.body).substring(0, 200)}`);
  
  if (!uploadRes.body || !uploadRes.body.uploadUrl) {
    console.error('No upload URL returned!');
    process.exit(1);
  }

  const uploadUrl = uploadRes.body.uploadUrl;
  console.log(`Upload URL: ${uploadUrl.substring(0, 80)}...`);

  // Step 2: Upload PDF to S3
  console.log('\n--- Step 2: Upload PDF to S3 ---');
  await uploadToS3(uploadUrl, pdfBuffer);
  console.log('S3 upload complete!');

  // Step 3: Create folder with the uploaded file
  console.log('\n--- Step 3: Create folder ---');
  const folderBody = {
    folder: {
      title: 'Cash Offer - Test API',
      summary: 'Testing API folder creation with Cash Offer PDF',
      docInfo: [
        {
          url: uploadUrl,
          docTitle: 'Cash Offer',
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
  console.log(`Status: ${folderRes.status}`);
  console.log(`Response: ${JSON.stringify(folderRes.body).substring(0, 500)}`);
  console.log(`Raw: ${folderRes.raw.substring(0, 500)}`);

  console.log('\n=== Done ===');
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});