/**
 * RabbitSign Integration Service
 * =============================================================
 * Built: 2026-06-17 | Auth: SHA-512 HMAC signature (per API docs)
 * 
 * API Base: www.rabbitsign.com
 * Auth headers: x-rabbitsign-api-key-id, x-rabbitsign-api-time-utc, x-rabbitsign-api-signature
 * Signature: SHA512("{METHOD} {path} {utcTime} {keySecret}")
 *
 * Key ID: FdoxIa1tIsnUNmCjfGt4Ns
 * Key Secret: dHwqVS4Gr9liQ9WJWIJ0DvD5fT7S51rXOUE7fFT8WFx7
 * Webhook URL: https://divinitycrm-api.onrender.com/api/webhooks/rabbitsign
 */

const https = require('https');
const crypto = require('crypto');
const { query } = require('../db/connection');

const RS_KEY_ID = process.env.RABBITSIGN_KEY_ID || 'FdoxIa1tIsnUNmCjfGt4Ns';
const RS_KEY_SECRET = process.env.RABBITSIGN_API_KEY || 'dHwqVS4Gr9liQ9WJWIJ0DvD5fT7S51rXOUE7fFT8WFx7';
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
        'User-Agent': 'DivinityCRM/1.0',
      },
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = d ? JSON.parse(d) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error || parsed.message || `RabbitSign API error ${res.statusCode}: ${d.substring(0, 200)}`));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve({ _raw: d });
          else reject(new Error(`RabbitSign API error ${res.statusCode}: ${d.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/**
 * Create a folder from a template.
 * POST /api/v1/folderFromTemplate/{templateId}
 */
async function createFolderFromTemplate(templateId, { title, summary, date, senderFieldValues, roles, ccList = [] }) {
  const body = { title, summary: summary || '', date, senderFieldValues: senderFieldValues || [], roles, ccList };
  const result = await rsRequest('POST', `/api/v1/folderFromTemplate/${templateId}`, body);
  return result; // { folderId: "..." }
}

/**
 * Create a folder with local files (3-step process).
 * Step 1: Get upload URL → Step 2: Upload file → Step 3: Create folder
 */
async function createFolder({ title, summary, date, files, signers, ccList = [] }) {
  // Step 1: Get upload URLs for each file
  const uploadUrls = [];
  for (const file of files) {
    const { uploadUrl } = await rsRequest('POST', '/api/v1/upload-url');
    uploadUrls.push(uploadUrl);
  }

  // Step 2: Upload each file to S3
  for (let i = 0; i < files.length; i++) {
    await uploadToS3(uploadUrls[i], files[i]);
  }

  // Step 3: Create the folder (correct format from API docs)
  const body = {
    folder: {
      title,
      summary: summary || '',
      docInfo: uploadUrls.map((url, i) => ({
        url,
        docTitle: files[i]?.name || `document-${i}.pdf`,
      })),
      signerInfo: {},
    },
    date: date || new Date().toISOString().split('T')[0],
  };

  // Build signerInfo map keyed by email
  for (const signer of signers) {
    body.folder.signerInfo[signer.email] = {
      name: signer.name,
      fields: (signer.fields || []).map((f, idx) => ({
        id: idx + 1,
        type: f.type || 'SIGNATURE',
        currentValue: f.currentValue || '',
        position: {
          docNumber: f.docNumber || 0,
          pageIndex: f.pageIndex || 0,
          x: f.x || 100,
          y: f.y || 600,
          width: f.width || 200,
          height: f.height || 50,
        },
      })),
    };
  }

  const result = await rsRequest('POST', '/api/v1/folder', body);
  return result;
}

function uploadToS3(uploadUrl, file) {
  return new Promise((resolve, reject) => {
    const url = new URL(uploadUrl);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'PUT',
      headers: {
        'Content-Type': 'binary/octet-stream',
        'Content-Length': Buffer.byteLength(file.content || file.buffer || ''),
      },
    };
    const req = https.request(opts, (res) => {
      if (res.statusCode === 200) resolve();
      else reject(new Error(`S3 upload failed: ${res.statusCode}`));
    });
    req.on('error', reject);
    req.write(file.content || file.buffer || '');
    req.end();
  });
}

/**
 * Get folder signing status.
 * GET /api/v1/folder/{folderId}
 */
async function getFolderStatus(folderId) {
  return rsRequest('GET', `/api/v1/folder/${folderId}`);
}

/**
 * Get folders with pagination.
 * GET /api/v1/folder-list/{utcTimestamp}/{pageSize}
 */
async function getFolders(pageSize = 20, newerThan = null) {
  const ts = newerThan || '2050-12-31T11:22:33.123456Z';
  return rsRequest('GET', `/api/v1/folder-list/${ts}/${pageSize}`);
}

/**
 * Send reminder to sign.
 * POST /api/v1/folder-notify/{folderId}
 */
async function sendReminder(folderId) {
  return rsRequest('POST', `/api/v1/folder-notify/${folderId}`);
}

/**
 * Cancel a folder.
 * PUT /api/v1/folder-cancel/{folderId}
 */
async function cancelFolder(folderId) {
  return rsRequest('PUT', `/api/v1/folder-cancel/${folderId}`);
}

/**
 * Create a contract signing envelope for Stage 12.
 * Routes to the correct PSA template based on contract type.
 */
async function createContractEnvelope(lead, contractType) {
  const date = new Date().toISOString().split('T')[0];
  const address = lead.address || 'Property Address';
  const price = lead.price ? `$${Number(lead.price).toLocaleString()}` : 'TBD';
  const sellerName = lead.seller_name || lead.agent_name || 'Seller';
  const sellerEmail = lead.seller_email || lead.agent_email || 'seller@example.com';
  const buyerName = 'Divinity Aligned LLC';
  const buyerEmail = 'homewithkaylamauser@gmail.com';
  const emd = lead.emd_amount || 500;
  const coeDate = lead.coe_date || date;
  const inspectionDays = lead.inspection_period_days || 14;
  const titleCompany = lead.title_company || 'CLOSE Title';

  // Template selection based on contract type
  const templateMap = {
    cash: process.env.RABBITSIGN_TEMPLATE_STACK || 'Vf0ahJ1AXi3QWVhXNCBN0C',
    subto: process.env.RABBITSIGN_TEMPLATE_PSA || 'w5EC5hnVWRoGVYUTbxuHwz',
    stack50: process.env.RABBITSIGN_TEMPLATE_STACK || 'Vf0ahJ1AXi3QWVhXNCBN0C',
    stack10: process.env.RABBITSIGN_TEMPLATE_STACK || 'Vf0ahJ1AXi3QWVhXNCBN0C',
    seller_finance: process.env.RABBITSIGN_TEMPLATE_STACK || 'Vf0ahJ1AXi3QWVhXNCBN0C',
    jv: process.env.RABBITSIGN_TEMPLATE_JV || 'rPx7lrG27B1u2pxVzwl21e',
    commercial: process.env.RABBITSIGN_TEMPLATE_STACK || 'Vf0ahJ1AXi3QWVhXNCBN0C',
    portfolio: process.env.RABBITSIGN_TEMPLATE_STACK || 'Vf0ahJ1AXi3QWVhXNCBN0C',
  };

  const templateId = templateMap[contractType] || 'StackPSA';

  const senderFieldValues = [
    { name: 'property address', currentValue: address },
    { name: 'purchase price', currentValue: price },
    { name: 'emd amount', currentValue: `$${emd}` },
    { name: 'close of escrow date', currentValue: coeDate },
    { name: 'inspection period days', currentValue: String(inspectionDays) },
    { name: 'title company', currentValue: titleCompany },
    { name: 'buyer entity', currentValue: buyerName },
    { name: 'today', currentValue: date },
  ];

  if (contractType === 'subto') {
    senderFieldValues.push(
      { name: 'existing loan balance', currentValue: lead.existing_loan_balance ? `$${Number(lead.existing_loan_balance).toLocaleString()}` : 'TBD' },
      { name: 'subject to addendum', currentValue: 'Attached' }
    );
  }

  const roles = {
    'Seller': { name: sellerName, email: sellerEmail },
    'Buyer': { name: buyerName, email: buyerEmail },
  };

  const result = await createFolderFromTemplate(templateId, {
    title: `Purchase Agreement - ${address}`,
    summary: `${contractType.toUpperCase()} contract for ${address} at ${price}`,
    date,
    senderFieldValues,
    roles,
  });

  // Save to DB
  if (result.folderId) {
    await query(
      'UPDATE leads SET rabbitsign_envelope_id = $1, rabbitsign_status = $2 WHERE id = $3',
      [result.folderId, 'sent', lead.id]
    );
  }

  return result;
}

/**
 * Create a JV signing envelope for Stage 18.
 */
async function createJVEnvelope(lead, jvType = '4-party') {
  const date = new Date().toISOString().split('T')[0];
  const address = lead.address || 'Property Address';
  const parties = lead.jv_parties ? JSON.parse(lead.jv_parties) : [];
  const percentages = lead.jv_percentages ? JSON.parse(lead.jv_percentages) : [];

  const roles = {};
  parties.forEach((party, i) => {
    roles[`Party ${i + 1}`] = {
      name: party.name || `Party ${i + 1}`,
      email: party.email || `party${i + 1}@example.com`,
    };
  });

  const senderFieldValues = [
    { name: 'property address', currentValue: address },
    { name: 'jv type', currentValue: jvType },
    { name: 'today', currentValue: date },
  ];

  percentages.forEach((pct, i) => {
    senderFieldValues.push({ name: `party ${i + 1} percentage`, currentValue: `${pct}%` });
  });

  const templateId = jvType === '3-party' ? 'JV3Party' : 'JV4Party';

  const result = await createFolderFromTemplate(templateId, {
    title: `Joint Venture Agreement - ${address}`,
    summary: `${jvType} JV for ${address}`,
    date,
    senderFieldValues,
    roles,
  });

  if (result.folderId) {
    await query(
      'UPDATE leads SET rabbitsign_envelope_id = $1, rabbitsign_status = $2 WHERE id = $3',
      [result.folderId, 'sent', lead.id]
    );
  }

  return result;
}

/**
 * Handle webhook from RabbitSign (signer signed event).
 * Verifies signature, updates lead status.
 */
async function handleWebhook(headers, body) {
  // Verify webhook signature
  const sigHeader = headers['x-rabbitsign-api-signature'];
  if (!sigHeader) {
    console.warn('RabbitSign webhook: missing signature header');
    return { received: true, verified: false };
  }

  // Reconstruct and verify (webhook uses same auth scheme)
  // For webhooks, RabbitSign sends the signature we should validate
  const method = 'POST';
  const path = '/api/webhooks/rabbitsign';
  const utcTime = headers['x-rabbitsign-api-time-utc'] || utcNow();
  const expectedSig = sha512(`${method} ${path} ${utcTime} ${RS_KEY_SECRET}`);

  if (sigHeader !== expectedSig) {
    console.warn('RabbitSign webhook: signature mismatch');
    return { received: true, verified: false };
  }

  const { folderId, status, signers } = body;

  if (folderId) {
    // Update lead status
    const leads = await query(
      'SELECT id, stage FROM leads WHERE rabbitsign_envelope_id = $1',
      [folderId]
    );

    if (leads.length > 0) {
      const lead = leads[0];
      await query(
        'UPDATE leads SET rabbitsign_status = $1 WHERE id = $2',
        [status || 'signed', lead.id]
      );

      // Auto-advance if all signed
      if (status === 'completed' || status === 'signed') {
        if (lead.stage === 'CONTRACT_OUT') {
          await query(
            "UPDATE leads SET stage = 'UNDER_CONTRACT', psa_signed_date = NOW() WHERE id = $1",
            [lead.id]
          );
        } else if (lead.stage === 'JV_SENT') {
          await query(
            "UPDATE leads SET stage = 'JV_SIGNED' WHERE id = $1",
            [lead.id]
          );
        }
      }

      console.log(`RabbitSign webhook: folder ${folderId} → ${status}, lead ${lead.id} updated`);
    }
  }

  return { received: true, verified: true };
}

/**
 * Check if RabbitSign is configured.
 */
function isConfigured() {
  return !!(RS_KEY_ID && RS_KEY_SECRET);
}

module.exports = {
  createFolderFromTemplate,
  createFolder,
  getFolderStatus,
  getFolders,
  sendReminder,
  cancelFolder,
  createContractEnvelope,
  createJVEnvelope,
  handleWebhook,
  isConfigured,
  sha512,
  utcNow,
};
