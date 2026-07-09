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
 * Webhook URL: https://divinitycrm-ggi5.onrender.com/api/webhooks/rabbitsign
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { query } = require('../db/connection');

const RS_KEY_ID = process.env.RABBITSIGN_KEY_ID || '';
const RS_KEY_SECRET = process.env.RABBITSIGN_API_KEY || '';
const RS_BASE = 'www.rabbitsign.com';

function isSendEnabled() {
  return process.env.RABBITSIGN_SEND_ENABLED === '1';
}

function assertSendEnabled() {
  if (!isSendEnabled()) {
    throw new Error('RabbitSign sending is disabled. Set RABBITSIGN_SEND_ENABLED=1 only when you intentionally want RabbitSign to email signers.');
  }
}

function isUnsafeSignerEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!value) return true;
  if (value.endsWith('@example.com') || value.endsWith('@test.com')) return true;
  if (value.includes('example') || value.includes('test')) return true;
  return false;
}

function assertValidSigners(signers) {
  if (!Array.isArray(signers) || signers.length === 0) {
    throw new Error('At least one signer is required before sending to RabbitSign.');
  }
  const missingSigner = signers.find(s => !s.name || !s.email);
  if (missingSigner) {
    throw new Error('Every RabbitSign signer must have both name and email. No fallback emails are allowed.');
  }
  const unsafeSigner = signers.find(s => isUnsafeSignerEmail(s.email));
  if (unsafeSigner) {
    throw new Error(`Refusing to send RabbitSign envelope to unsafe/fabricated signer email: ${unsafeSigner.email}`);
  }
}

function assertValidRoleMap(roles) {
  const signers = Object.values(roles || {}).map(role => ({ name: role.name, email: role.email }));
  assertValidSigners(signers);
}

function sha512(input) {
  return crypto.createHash('sha512').update(input, 'utf8').digest('hex').toUpperCase();
}

function utcNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// RabbitSign docs (2026-06-26):
//   "The date's value must be today in the sender's local timezone (not UTC)
//    in the yyyy-MM-dd format. For an arbitrary date, use a TEXTBOX field."
//
// Render runs in UTC. If a sender in EST/EDT signs a contract at 11pm local,
// UTC date is already tomorrow → RabbitSign rejects with "Invalid RabbitSign message".
// Use SENDER_TZ env var (defaults to America/New_York = Montelli's TZ).
function localDateYmd(tz = process.env.SENDER_TZ || 'America/New_York') {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
    });
    return fmt.format(new Date()); // en-CA → YYYY-MM-DD
  } catch (err) {
    // Fallback: UTC date if tz is invalid
    console.warn(`[rabbitsign] Invalid SENDER_TZ=${tz}, falling back to UTC`);
    return new Date().toISOString().slice(0, 10);
  }
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
        // CloudFront WAF blocks non-browser User-Agents. Use a browser-like UA.
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
  assertSendEnabled();
  assertValidRoleMap(roles);
  // Per RabbitSign API docs (vendor-supplied 2026-06-26), the schema is:
  //   { title, summary, date, senderFieldValues, roles }
  // Including extra fields like ccList returns 'Invalid RabbitSign message'.
  // ccList is silently dropped here even if caller passes it.
  const body = {
    title,
    summary: summary || '',
    date,
    senderFieldValues: senderFieldValues || [],
    roles: roles || {},
  };
  const result = await rsRequest('POST', `/api/v1/folderFromTemplate/${templateId}`, body);
  return result; // { folderId: "..." }
}

/**
 * Create a folder with local files (3-step process).
 * Step 1: Get upload URL → Step 2: Upload file → Step 3: Create folder
 */
async function createFolder({ title, summary, date, files, signers, ccList = [] }) {
  assertSendEnabled();
  assertValidSigners(signers);
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
 * Create a folder directly from a PDF buffer via API (no template needed).
 * 3-step: upload-url → S3 upload → create folder.
 * Used for filled PDFs generated on-the-fly by pdf-generator.js.
 */
async function createFolderFromPdfBuffer(pdfBuffer, { title, summary, date, signers }) {
  assertSendEnabled();
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 1000) {
    throw new Error('Refusing to upload invalid or empty PDF buffer to RabbitSign.');
  }
  if (pdfBuffer.subarray(0, 4).toString('utf8') !== '%PDF') {
    throw new Error('Refusing to upload non-PDF content to RabbitSign.');
  }
  assertValidSigners(signers);

  // Step 1: Get upload URL
  const { uploadUrl } = await rsRequest('POST', '/api/v1/upload-url');

  // Step 2: Upload PDF to S3
  await uploadToS3(uploadUrl, { buffer: pdfBuffer });

  // Step 3: Create folder
  const signerInfo = {};
  for (const signer of signers) {
    signerInfo[signer.email] = {
      name: signer.name,
      fields: [],
    };
  }

  const body = {
    folder: {
      title,
      summary: summary || `Contract document: ${title}`,
      docInfo: [{
        url: uploadUrl,
        docTitle: title.endsWith('.pdf') ? title : `${title}.pdf`,
      }],
      signerInfo,
    },
    date: date || localDateYmd(),
  };

  return rsRequest('POST', '/api/v1/folder', body);
}

/**
 * Create a folder directly from a PDF file via API (no template needed).
 * 3-step: upload-url → S3 upload → create folder.
 * Used as fallback when no RabbitSign template ID is configured.
 */
async function createFolderFromPdf(pdfPath, { title, summary, date, signers }) {
  const pdfBuffer = fs.readFileSync(pdfPath);
  return createFolderFromPdfBuffer(pdfBuffer, { title, summary, date, signers });
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
  const contractLibrary = require('./contract-library');
  contractType = contractLibrary.normalizeContractType(contractType);
  const date = localDateYmd();
  const pdfGenerator = require('./pdf-generator');
  const context = pdfGenerator.buildContractContext(contractType, lead);
  const address = context.address;
  const price = context.price;
  const seller = context.signers.find(s => s.role === 'Seller');
  const buyer = context.signers.find(s => s.role === 'Buyer');
  const emd = context.mergeMap['[EMD_AMOUNT]'];
  const coeDate = context.mergeMap['[COE_DATE]'];
  const inspectionDays = context.mergeMap['[INSPECTION_DAYS]'];
  const titleCompany = context.mergeMap['[TITLE_COMPANY]'];

  // TXT masters are the primary source of truth. RabbitSign templates are an
  // optional compatibility path only, gated behind RABBITSIGN_USE_TEMPLATES=1.
  contractLibrary.assertSupported(contractType);
  const entry = contractLibrary.CONTRACT_LIBRARY[contractType];
  const envVarName = entry.rabbitsignTemplateEnvVar;
  const templateId = process.env[envVarName]; // undefined if not set
  const useTemplate = process.env.RABBITSIGN_USE_TEMPLATES === '1' && !!templateId;

  const roles = {
    'Seller': { name: seller.name, email: seller.email },
    'Buyer': { name: buyer.name, email: buyer.email },
  };

  let result;

  if (useTemplate) {
    // Optional compatibility path. Default production path is generated PDF.
    const senderFieldValues = [
      { name: 'property address', currentValue: address },
      { name: 'purchase price', currentValue: price },
      { name: 'emd amount', currentValue: emd },
      { name: 'close of escrow date', currentValue: coeDate },
      { name: 'inspection period days', currentValue: String(inspectionDays) },
      { name: 'title company', currentValue: titleCompany },
      { name: 'buyer entity', currentValue: buyer.name },
      { name: 'today', currentValue: date },
    ];

    if (contractType === 'subto' || contractType === 'seller_finance' || contractType === 'seller-finance') {
      senderFieldValues.push(
        { name: 'existing loan balance', currentValue: lead.existing_loan_balance ? `$${Number(lead.existing_loan_balance).toLocaleString()}` : 'TBD' },
        { name: 'subject to addendum', currentValue: 'Attached' }
      );
    }

    result = await createFolderFromTemplate(templateId, {
      title: `Purchase Agreement - ${address}`,
      summary: `${contractType.toUpperCase()} contract for ${address} at ${price}`,
      date,
      senderFieldValues,
      roles,
    });
  } else {
    // Primary path: generate a FILLED PDF from the .txt master + lead data.
    // If any required merge field is missing, generateFilledPdf throws before
    // anything reaches RabbitSign.
    console.log(`[rabbitsign] Generating filled PDF for ${contractType} from .txt master`);
    const pdfBuffer = pdfGenerator.generatePdfFromContext(context);

    result = await createFolderFromPdfBuffer(pdfBuffer, {
      title: context.title,
      summary: context.summary,
      date,
      signers: context.signers.map(s => ({ name: s.name, email: s.email })),
    });
  }

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
  const date = localDateYmd();
  const address = lead.address || 'Property Address';
  const parties = lead.jv_parties ? JSON.parse(lead.jv_parties) : [];
  const percentages = lead.jv_percentages ? JSON.parse(lead.jv_percentages) : [];

  const roles = {};
  parties.forEach((party, i) => {
    roles[`Party ${i + 1}`] = {
      name: party.name,
      email: party.email,
    };
  });

  const jvTemplateEnvVar = jvType === '5-party' ? 'RABBITSIGN_TEMPLATE_JV5' : 'RABBITSIGN_TEMPLATE_JV';
  const templateId = process.env[jvTemplateEnvVar];
  const useTemplate = process.env.RABBITSIGN_USE_TEMPLATES === '1' && !!templateId;

  let result;

  if (useTemplate) {
    const senderFieldValues = [
      { name: 'property address', currentValue: address },
      { name: 'jv type', currentValue: jvType },
      { name: 'today', currentValue: date },
    ];

    percentages.forEach((pct, i) => {
      senderFieldValues.push({ name: `party ${i + 1} percentage`, currentValue: `${pct}%` });
    });

    result = await createFolderFromTemplate(templateId, {
      title: `Joint Venture Agreement - ${address}`,
      summary: `${jvType} JV for ${address}`,
      date,
      senderFieldValues,
      roles,
    });
  } else {
    // Primary path: Generate filled PDF from .txt master
    const pdfGenerator = require('./pdf-generator');
    const jvContractType = jvType === '5-party' ? 'jv_5party' : 'jv_4party';

    console.log(`[rabbitsign] No JV template ID, generating filled PDF for ${jvContractType}`);
    const pdfBuffer = pdfGenerator.generateFilledPdf(jvContractType, lead);

    const signers = parties.map(party => ({ name: party.name, email: party.email }));
    assertValidSigners(signers);

    result = await createFolderFromPdfBuffer(pdfBuffer, {
      title: `Joint Venture Agreement - ${address}`,
      summary: `${jvType} JV for ${address}`,
      date,
      signers,
    });
  }

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
  return !!(RS_KEY_ID && RS_KEY_SECRET && isSendEnabled());
}

module.exports = {
  createFolderFromTemplate,
  createFolderFromPdf,
  createFolderFromPdfBuffer,
  createFolder,
  getFolderStatus,
  getFolders,
  sendReminder,
  cancelFolder,
  createContractEnvelope,
  createJVEnvelope,
  handleWebhook,
  isConfigured,
  isSendEnabled,
  assertValidSigners,
  assertValidRoleMap,
  sha512,
  utcNow,
};
