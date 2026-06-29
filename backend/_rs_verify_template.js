// Verify the Subject To PSA template works with folderFromTemplate
const https = require('https');
const crypto = require('crypto');

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
        resolve({ status: res.statusCode, raw: d });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const templateId = 'a8wb3Oiljkp2Y4QW1zzvsS';
  const body = {
    title: 'Test - Subject To PSA - API Verify',
    summary: 'Testing folderFromTemplate API with existing template',
    date: new Date().toISOString().slice(0, 10),
    senderFieldValues: [],
    roles: {
      'Seller': { name: 'Test Seller', email: 'test-seller@example.com' },
      'Buyer': { name: 'Test Buyer', email: 'test-buyer@example.com' },
    },
  };

  console.log(`Testing folderFromTemplate with templateId: ${templateId}`);
  const res = await rsRequest('POST', `/api/v1/folderFromTemplate/${templateId}`, body);
  console.log(`Status: ${res.status}`);
  console.log(`Response: ${res.raw.substring(0, 500)}`);
}

main().catch(console.error);