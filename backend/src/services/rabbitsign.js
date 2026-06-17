/**
 * RabbitSign Integration Service
 * =============================================================
 * Built: 2026-06-17
 * Purpose: E-signature envelope creation, status checking, webhook handling
 * 
 * RabbitSign API: https://www.rabbitsign.com
 * Account: montelliscottrei@gmail.com
 * Webhook URL: https://divinitycrm-api.onrender.com/api/webhooks/rabbitsign
 *
 * Usage:
 *   const rs = require('./rabbitsign');
 *   const folder = await rs.createFolder({ template, signers, documents });
 *   const status = await rs.getFolderStatus(folderId);
 */

const https = require('https');
const { query } = require('../db/connection');

const RABBITSIGN_API_KEY = process.env.RABBITSIGN_API_KEY || '';
const RABBITSIGN_BASE = 'api.rabbitsign.com';
const WEBHOOK_URL = process.env.RABBITSIGN_WEBHOOK_URL || 'https://divinitycrm-api.onrender.com/api/webhooks/rabbitsign';

/**
 * Make an authenticated request to RabbitSign API.
 */
function rsRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: RABBITSIGN_BASE,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${RABBITSIGN_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };
    if (data) {
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`RabbitSign API error ${res.statusCode}: ${parsed.message || d}`));
          }
        } catch (e) {
          resolve({ _raw: d, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/**
 * Create a signing folder (envelope) with template, signers, and documents.
 * 
 * @param {object} params
 * @param {string} params.template - Template name or ID
 * @param {Array<{name, email, role}>} params.signers - Signers list
 * @param {Array<{name, content}>} params.documents - Documents to sign
 * @param {string} [params.folderName] - Custom folder name
 * @param {string} [params.message] - Email message to signers
 * @returns {Promise<{folderId, status, signers}>}
 */
async function createFolder({ template, signers, documents, folderName, message }) {
  if (!RABBITSIGN_API_KEY) {
    throw new Error('RABBITSIGN_API_KEY not configured');
  }

  const body = {
    template: template || 'default',
    name: folderName || `Contract Package - ${new Date().toISOString().split('T')[0]}`,
    message: message || 'Please review and sign the attached documents.',
    signers: signers.map(s => ({
      name: s.name,
      email: s.email,
      role: s.role || 'signer',
      order: s.order || 1,
    })),
    documents: documents.map(d => ({
      name: d.name,
      content: d.content, // base64 or URL
    })),
    webhook_url: WEBHOOK_URL,
  };

  const result = await rsRequest('POST', '/v1/folders', body);
  
  return {
    folderId: result.id || result.folderId,
    status: result.status || 'created',
    signers: result.signers || signers,
    raw: result,
  };
}

/**
 * Get the status of a signing folder.
 * 
 * @param {string} folderId - RabbitSign folder/envelope ID
 * @returns {Promise<{status, signers, completedAt}>}
 */
async function getFolderStatus(folderId) {
  if (!RABBITSIGN_API_KEY) {
    throw new Error('RABBITSIGN_API_KEY not configured');
  }

  const result = await rsRequest('GET', `/v1/folders/${folderId}`);
  
  return {
    folderId,
    status: result.status || 'unknown',
    signers: (result.signers || []).map(s => ({
      name: s.name,
      email: s.email,
      status: s.status, // pending, viewed, signed, declined
      signedAt: s.signed_at || s.signedAt,
    })),
    completedAt: result.completed_at || result.completedAt,
    raw: result,
  };
}

/**
 * Send a signing reminder to pending signers.
 * 
 * @param {string} folderId - RabbitSign folder ID
 * @returns {Promise<{success: boolean}>}
 */
async function sendReminder(folderId) {
  if (!RABBITSIGN_API_KEY) {
    throw new Error('RABBITSIGN_API_KEY not configured');
  }

  const result = await rsRequest('POST', `/v1/folders/${folderId}/remind`);
  return { success: true, raw: result };
}

/**
 * Void/cancel a signing folder.
 * 
 * @param {string} folderId - RabbitSign folder ID
 * @param {string} [reason] - Reason for voiding
 * @returns {Promise<{success: boolean}>}
 */
async function voidFolder(folderId, reason = 'Deal cancelled') {
  if (!RABBITSIGN_API_KEY) {
    throw new Error('RABBITSIGN_API_KEY not configured');
  }

  const result = await rsRequest('POST', `/v1/folders/${folderId}/void`, { reason });
  return { success: true, raw: result };
}

/**
 * Create a contract signing envelope for Stage 12 (Contract Out).
 * Routes to the correct template based on contract type.
 * 
 * @param {object} params
 * @param {object} params.lead - Lead data from DB
 * @param {string} params.contractType - 'SubTo', 'Cash', 'Stack', 'Commercial', 'JV'
 * @param {string} [params.psaTemplate] - PSA template name
 * @param {string} [params.addendumTemplate] - Addendum template (for SubTo)
 * @param {string} [params.jvTemplate] - JV template (for JV deals)
 * @returns {Promise<{folderId, status}>}
 */
async function createContractEnvelope({ lead, contractType, psaTemplate, addendumTemplate, jvTemplate }) {
  const signers = [
    {
      name: lead.seller_name || 'Seller',
      email: lead.seller_email || 'seller@example.com',
      role: 'signer',
      order: 1,
    },
    {
      name: 'Divinity Aligned LLC',
      email: 'info@divinityaligned.net',
      role: 'signer',
      order: 2,
    },
  ];

  // Add agent if present
  if (lead.agent_name && lead.agent_email) {
    signers.push({
      name: lead.agent_name,
      email: lead.agent_email,
      role: 'cc',
      order: 3,
    });
  }

  const documents = [];

  // PSA document
  const psaName = psaTemplate || getPSATemplateName(contractType);
  documents.push({
    name: `${psaName} - ${lead.address}`,
    content: lead.contract_draft_url || `https://divinitycrm-api.onrender.com/api/contracts/${lead.id}/psa`,
  });

  // SubTo Addendum
  if (contractType === 'SubTo' || lead.has_subto_addendum) {
    documents.push({
      name: `Subject To Addendum - ${lead.address}`,
      content: addendumTemplate || `https://divinitycrm-api.onrender.com/api/contracts/${lead.id}/addendum`,
    });
  }

  // JV document
  if (contractType === 'JV' || lead.jv_type === '3_party' || lead.jv_type === '4_party') {
    documents.push({
      name: `${jvTemplate || 'JV Agreement'} - ${lead.address}`,
      content: `https://divinitycrm-api.onrender.com/api/contracts/${lead.id}/jv`,
    });
  }

  const folderName = `Contract - ${lead.address} - ${contractType}`;
  const message = `Hi ${lead.seller_name || 'there'},\n\nPlease review and sign the purchase agreement for ${lead.address}.\n\nThis should take about 10-15 minutes. You'll need:\n- The property address handy\n- Your LLC name (if you have one)\n- Your email for e-signature\n\nThank you!\n- Montelli Scott, Divinity Aligned LLC`;

  const result = await createFolder({
    template: 'real-estate-psa',
    signers,
    documents,
    folderName,
    message,
  });

  // Store in DB
  if (result.folderId) {
    await query(
      `UPDATE leads SET rabbitsign_envelope_id = $1, rabbitsign_status = $2 WHERE id = $3`,
      [result.folderId, 'sent', lead.id]
    );

    await query(
      `INSERT INTO contracts (id, lead_id, user_id, contract_type, template_name, rabbitsign_envelope_id, rabbitsign_status, payload)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      [lead.id, lead.user_id, contractType.toLowerCase(), psaName, result.folderId, 'sent', JSON.stringify(result)]
    );
  }

  return result;
}

/**
 * Create a JV signing envelope for Stage 18 (JV Sent).
 * 
 * @param {object} params
 * @param {object} params.lead - Lead data
 * @param {string} params.jvType - '3_party' or '4_party'
 * @param {string[]} params.parties - Party names
 * @param {number[]} params.percentages - Party percentages
 * @returns {Promise<{folderId, status}>}
 */
async function createJVEnvelope({ lead, jvType, parties, percentages }) {
  const signers = (parties || ['Divinity Aligned LLC', lead.seller_name || 'Seller', 'Capital Partner']).map((name, i) => ({
    name,
    email: i === 0 ? 'info@divinityaligned.net' : i === 1 ? (lead.seller_email || 'seller@example.com') : `partner${i}@example.com`,
    role: 'signer',
    order: i + 1,
  }));

  const documents = [{
    name: `JV Agreement - ${lead.address} - ${jvType === '4_party' ? '4-Party' : '3-Party'}`,
    content: `https://divinitycrm-api.onrender.com/api/contracts/${lead.id}/jv`,
  }];

  const folderName = `JV - ${lead.address}`;
  const message = `Please review and sign the Joint Venture Agreement for ${lead.address}.\n\nDefault allocation: ${percentages ? percentages.join('/') : '25% each'}.\n\nThank you!`;

  const result = await createFolder({
    template: 'jv-agreement',
    signers,
    documents,
    folderName,
    message,
  });

  if (result.folderId) {
    await query(
      `UPDATE leads SET rabbitsign_envelope_id = $1, rabbitsign_status = $2 WHERE id = $3`,
      [result.folderId, 'sent', lead.id]
    );
  }

  return result;
}

/**
 * Handle RabbitSign webhook events.
 * Called when a signing event occurs (signer viewed, signed, completed, declined).
 * 
 * @param {object} event - Webhook event body
 * @param {string} event.folderId - Folder/envelope ID
 * @param {string} event.event - Event type: 'signer_viewed', 'signer_signed', 'folder_completed', 'folder_declined'
 * @param {object} event.signer - Signer info
 */
async function handleWebhook(event) {
  const { folderId, event: eventType, signer } = event;

  console.log(`RabbitSign webhook: ${eventType} for folder ${folderId}`);

  // Find the lead with this envelope
  const leads = await query(
    'SELECT id, stage, address FROM leads WHERE rabbitsign_envelope_id = $1',
    [folderId]
  );

  if (leads.length === 0) {
    console.log(`No lead found for RabbitSign folder ${folderId}`);
    return { handled: false, reason: 'No matching lead' };
  }

  const lead = leads[0];

  switch (eventType) {
    case 'signer_viewed':
      await query(
        `UPDATE leads SET rabbitsign_status = 'viewed' WHERE id = $1`,
        [lead.id]
      );
      break;

    case 'signer_signed':
      // Check if all signers have signed
      const status = await getFolderStatus(folderId);
      const allSigned = status.signers.every(s => s.status === 'signed');
      
      if (allSigned) {
        await query(
          `UPDATE leads SET rabbitsign_status = 'completed' WHERE id = $1`,
          [lead.id]
        );

        // If at Stage 12 (Contract Out), auto-advance to Stage 13 (Under Contract)
        if (lead.stage === 'CONTRACT_OUT') {
          await query(
            `UPDATE leads SET stage = 'UNDER_CONTRACT', psa_signed_date = CURRENT_DATE WHERE id = $1`,
            [lead.id]
          );
          console.log(`Auto-advanced lead ${lead.id} to UNDER_CONTRACT`);
        }

        // If at Stage 18 (JV Sent), auto-advance to Stage 19 (JV Signed)
        if (lead.stage === 'JV_SENT') {
          await query(
            `UPDATE leads SET stage = 'JV_SIGNED' WHERE id = $1`,
            [lead.id]
          );
          console.log(`Auto-advanced lead ${lead.id} to JV_SIGNED`);
        }
      } else {
        await query(
          `UPDATE leads SET rabbitsign_status = 'signed' WHERE id = $1`,
          [lead.id]
        );
      }
      break;

    case 'folder_completed':
      await query(
        `UPDATE leads SET rabbitsign_status = 'completed' WHERE id = $1`,
        [lead.id]
      );
      break;

    case 'folder_declined':
      await query(
        `UPDATE leads SET rabbitsign_status = 'declined' WHERE id = $1`,
        [lead.id]
      );
      break;

    default:
      console.log(`Unhandled RabbitSign event: ${eventType}`);
  }

  // Log activity
  await query(
    `INSERT INTO activity_log (user_id, lead_id, action, details) VALUES ($1, $2, $3, $4)`,
    [lead.user_id || null, lead.id, 'rabbitsign_event', JSON.stringify({ folderId, eventType, signer })]
  );

  return { handled: true, leadId: lead.id, eventType };
}

/**
 * Get the PSA template name based on contract type.
 */
function getPSATemplateName(contractType) {
  const map = {
    'SubTo': 'PSA Creative Subject To',
    'Cash': 'Cash Offer Template',
    'Stack': 'Stack PSA',
    'Commercial': 'Real Estate Commercial PSA',
    'JV': 'Joint Venture Agreement',
  };
  return map[contractType] || 'Purchase and Sale Agreement';
}

/**
 * Check if RabbitSign is configured.
 */
function isConfigured() {
  return !!RABBITSIGN_API_KEY && RABBITSIGN_API_KEY.length > 10;
}

module.exports = {
  createFolder,
  getFolderStatus,
  sendReminder,
  voidFolder,
  createContractEnvelope,
  createJVEnvelope,
  handleWebhook,
  isConfigured,
};
