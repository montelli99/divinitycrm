// Probe RabbitSign API for template creation endpoints
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

function rsRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const utcTime = utcNow();
    const signature = sha512(`${method} ${path} ${utcTime} ${RS_KEY_SECRET}`);
    const data = body ? JSON.stringify(body) : null;

    const opts = {
      hostname: RS_BASE,
      path,
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
        console.log(`\n${method} ${path} → ${res.statusCode}`);
        console.log(`Response: ${d.substring(0, 500)}`);
        resolve({ status: res.statusCode, body: d });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  // 1. List known endpoints
  console.log('=== Probing RabbitSign API endpoints ===\n');

  // Check if there's a template list endpoint
  await rsRequest('GET', '/api/v1/template-list');
  
  // Check if there's a template creation endpoint
  await rsRequest('POST', '/api/v1/template', { title: 'Test' });
  
  // Check template-from-pdf or template-from-upload
  await rsRequest('POST', '/api/v1/templateFromPdf', { title: 'Test' });
  
  // Check upload-url for templates
  await rsRequest('POST', '/api/v1/template-upload-url');
  
  // Check if we can list templates
  await rsRequest('GET', '/api/v1/templates');
  
  // Check the upload-url endpoint (known working)
  await rsRequest('POST', '/api/v1/upload-url');
  
  // Check if there's a template create with file
  await rsRequest('POST', '/api/v1/createTemplate', { title: 'Test' });

  // Check /api/v1/template-from-upload
  await rsRequest('POST', '/api/v1/template-from-upload', { title: 'Test' });

  console.log('\n=== Done probing ===');
}

main().catch(console.error);