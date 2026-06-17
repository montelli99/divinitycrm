// =============================================================
// Divinity CRM Platform — Contracts API Routes
// =============================================================

const { Router } = require('express');
const { sql } = require('../db/connection');
const { v4: uuid } = require('uuid');
const { generateContract, formatForTelegram, generateRabbitSignPayload } = require('../../../../lead-tracking/contract-generator');

const router = Router();

// GET /api/contracts/clauses — List all clauses
router.get('/clauses', async (req, res, next) => {
  try {
    const clauses = await sql`SELECT * FROM clauses ORDER BY category, id`;
    res.json({ clauses });
  } catch (err) {
    next(err);
  }
});

// GET /api/contracts/clauses/:id — Get single clause
router.get('/clauses/:id', async (req, res, next) => {
  try {
    const clause = await sql`SELECT * FROM clauses WHERE id = ${req.params.id}`;
    if (clause.length === 0) return res.status(404).json({ error: 'Clause not found' });
    res.json({ clause: clause[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/contracts/generate — Generate contract package for a lead
router.post('/generate', async (req, res, next) => {
  try {
    const clerkId = req.user.userId;
    const user = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`;
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const { lead_id, contract_type } = req.body;
    if (!lead_id || !contract_type) {
      return res.status(400).json({ error: 'lead_id and contract_type are required' });
    }

    // Fetch lead
    const lead = await sql`SELECT * FROM leads WHERE id = ${lead_id} AND user_id = ${user[0].id}`;
    if (lead.length === 0) return res.status(404).json({ error: 'Lead not found' });

    // Map DB lead to contract-generator format
    const leadData = {
      address: lead[0].address,
      city: lead[0].city,
      state: lead[0].state,
      zip: lead[0].zip,
      apn: lead[0].apn,
      price: lead[0].price,
      contacts: {
        agent_name: lead[0].agent_name,
        agent_phone: lead[0].agent_phone,
        agent_email: lead[0].agent_email,
        seller_name: lead[0].seller_name,
        seller_phone: lead[0].seller_phone,
        seller_email: lead[0].seller_email,
      },
      property_details: {
        rent: lead[0].monthly_rent,
      },
      underwriting: {
        arv: lead[0].arv,
        repairs_estimate: lead[0].repairs_estimate,
        existing_loan: lead[0].existing_loan_balance,
        existing_rate: lead[0].existing_loan_rate,
        existing_loan_type: lead[0].existing_loan_type,
      },
    };

    // Generate contract package
    const pkg = generateContract(leadData, contract_type);
    if (pkg.error) return res.status(400).json({ error: pkg.error });

    // Store in contracts table
    const contract = await sql`
      INSERT INTO contracts (id, lead_id, user_id, contract_type, template_name, addenda, clauses, payload)
      VALUES (
        ${uuid()}, ${lead_id}, ${user[0].id}, ${contract_type},
        ${pkg.template}, ${pkg.addenda}, ${pkg.clauses.map(c => c.id)},
        ${JSON.stringify(pkg)}
      )
      RETURNING *
    `;

    // Update lead with contract type
    await sql`
      UPDATE leads SET 
        contract = ${contract_type},
        psa_signed_date = ${pkg.timeline.psaSignedDate},
        coe_date = ${pkg.timeline.coeDate},
        inspection_end_date = ${pkg.timeline.inspectionEndDate},
        inspection_period_days = ${pkg.timeline.inspectionPeriodDays},
        emd_amount = ${pkg.financials.emdAmount},
        has_subto_addendum = ${pkg.addenda.includes('SubjectToAddendum')},
        stage = 'UNDER_CONTRACT'
      WHERE id = ${lead_id}
    `;

    // Log activity
    await sql`
      INSERT INTO activity_log (user_id, lead_id, action, details)
      VALUES (${user[0].id}, ${lead_id}, 'contract_generated', ${JSON.stringify({ contract_type, template: pkg.template })})
    `;

    res.json({
      contract: contract[0],
      package: pkg,
      formatted: formatForTelegram(pkg),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/contracts/send-rabbitsign — Send contract to RabbitSign
router.post('/send-rabbitsign', async (req, res, next) => {
  try {
    const clerkId = req.user.userId;
    const user = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`;
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const { contract_id } = req.body;
    if (!contract_id) return res.status(400).json({ error: 'contract_id is required' });

    // Fetch contract
    const contract = await sql`SELECT * FROM contracts WHERE id = ${contract_id}`;
    if (contract.length === 0) return res.status(404).json({ error: 'Contract not found' });

    const pkg = contract[0].payload;
    const apiKey = process.env.RABBITSIGN_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'RABBITSIGN_API_KEY not configured. Add it to .env' });
    }

    // Generate RabbitSign payload
    const rsPayload = generateRabbitSignPayload(pkg, {
      apiKey,
      signerName: pkg.parties.seller,
      signerEmail: pkg.parties.sellerEmail,
    });

    // TODO: Actually POST to RabbitSign API when PDF generation is ready
    // For now, return the payload that would be sent
    res.json({
      status: 'payload_ready',
      message: 'RabbitSign payload generated. PDF generation needed before live send.',
      rabbitsign_payload: rsPayload,
      note: 'POST this to the RabbitSign API endpoint when PDF is available.',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/contracts — List contracts for user
router.get('/', async (req, res, next) => {
  try {
    const clerkId = req.user.userId;
    const user = await sql`SELECT id FROM users WHERE clerk_id = ${clerkId}`;
    if (user.length === 0) return res.status(404).json({ error: 'User not found' });

    const contracts = await sql`
      SELECT c.*, l.address, l.stage
      FROM contracts c
      JOIN leads l ON c.lead_id = l.id
      WHERE c.user_id = ${user[0].id}
      ORDER BY c.created_at DESC
    `;

    res.json({ contracts });
  } catch (err) {
    next(err);
  }
});

// GET /api/contracts/:id — Get single contract
router.get('/:id', async (req, res, next) => {
  try {
    const contract = await sql`SELECT * FROM contracts WHERE id = ${req.params.id}`;
    if (contract.length === 0) return res.status(404).json({ error: 'Contract not found' });
    res.json({ contract: contract[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

