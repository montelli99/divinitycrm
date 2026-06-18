// =============================================================
// Student Roster Service — Divinity CRM
// =============================================================
// Built: 2026-06-18 by Atlas (Phase 2)
// Source: ghl-automations/modules/student-roster.js
//
// Purpose: Track student mentees, payment tiers, permissions,
//          vacation coverage, and substitute reassignment.
//
// Students: 30+ mentees in the active program.
// Payment Tiers:
//   - Student_NCNDA: $397/mo Square (most students)
//   - Student_NDA: $399/mo Square (some earlier students)
//   - Biweekly: $199/biweekly (Sarah, Noel, Cristina)
//   - Closer_NDA: $399/mo Square (Todd, Aidan, Seth, Sarah, Jaxon)
//
// Closer Payment Structure:
//   - 50% assignment fee (30% post-grad PPC)
// =============================================================

const { query } = require('../db/connection');

// =============================================================
// PAYMENT TIERS
// =============================================================

const PAYMENT_TIERS = {
  Student_NCNDA: {
    name: 'Student (NCNDA)',
    rate: '$397/mo',
    billing: 'Square monthly recurring',
    appliesTo: 'Most students',
    splits: {
      txns_1_2: '30% to mentor',
      txn_3: '40% to mentor',
      txns_4_plus: '50% to mentor + Founder Status, fee waived after consistent 1/mo',
    },
  },
  Student_NDA: {
    name: 'Student (NDA)',
    rate: '$399/mo',
    billing: 'Square monthly recurring',
    appliesTo: 'Some earlier students',
    note: 'Same as NCNDA tier but with NDA signed',
  },
  Biweekly: {
    name: 'Biweekly',
    rate: '$199/biweekly',
    billing: 'Square biweekly',
    appliesTo: 'Sarah, Noel, Cristina',
  },
  Closer_NDA: {
    name: 'Closer (NDA)',
    rate: '$399/mo',
    billing: 'Square monthly recurring',
    appliesTo: 'Todd, Aidan, Seth, Sarah, Jaxon',
    splits: {
      allTransactions: '50% assignment fee',
      postGraduationPPC: '30% assignment fee across the board on PPC transactions',
    },
  },
};

// =============================================================
// STUDENT PERMISSIONS
// =============================================================

const STUDENT_PERMISSIONS = {
  pipelineAccess: 'assigned_only',
  stageControl: {
    canMove: [1, 2, 3],
    viewOnly: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
  },
  integrations: 'none',
  justCallAccess: false,
  telegramAccess: false,
  atlasAccess: false,
};

const CLOSER_PERMISSIONS = {
  pipelineAccess: 'assigned_only',
  stageControl: {
    canMove: [],
    viewOnly: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
  },
  integrations: 'none',
  justCallAccess: false,
  telegramAccess: false,
  atlasAccess: false,
};

// =============================================================
// NON-CIRCUMVENTION CLAUSE
// =============================================================

const NON_CIRCUMVENTION_CLAUSE = {
  title: 'Non-Circumvention Clause',
  appliesTo: ['Student_NCNDA', 'Student_NDA', 'Closer_NDA'],
  text: 'The Receiving Party agrees that during the term of this Agreement they shall not directly or indirectly circumvent, avoid, bypass, or attempt to circumvent the Disclosing Party in order to avoid payment of fees, commissions, or other benefits that would otherwise be due in connection with any transaction, opportunity, or relationship introduced or disclosed by the Disclosing Party.',
  cancellation: {
    noticeRequired: '2 billing cycles (current + immediately following)',
    refundPolicy: 'no prorated refunds for active billing period',
  },
  remedies: ['Immediate termination', 'Legal action', 'Injunctive relief', 'Financial damages'],
};

// =============================================================
// STAGE MAPPING (stage name → stage number for permissions)
// =============================================================

const STAGE_NUMBERS = {
  LEAD_ENTERED: 1,
  CONTACT_MADE: 2,
  OFFER_READY: 3,
  OFFER_SENT: 4,
  OFFER_RECEIVED: 5,
  GAIN_FEEDBACK: 6,
  NO_ANSWER: 7,
  SELLER_DECLINED: 8,
  ACTIVE_NEGOTIATION: 9,
  TERMS_AGREED: 10,
  AWAITING_TITLE: 11,
  CONTRACT_OUT: 12,
  UNDER_CONTRACT: 13,
  INSPECTION_PERIOD: 14,
  INSPECTION_COMPLETE: 15,
  APPRAISAL_ORDERED: 16,
  APPRAISAL_DONE: 17,
  JV_SENT: 18,
  JV_SIGNED: 19,
  WIRE_SETUP: 20,
  CLOSING_DATE: 21,
};

// =============================================================
// CREATE MENTEE RECORD
// =============================================================

async function createMenteeRecord({
  userId,
  paymentTier,
  squareCustomerId,
  startDate,
  assignedMarkets,
  offerType,
  closerPayoutPercent,
  status,
}) {
  const tier = PAYMENT_TIERS[paymentTier];
  if (!tier) {
    throw new Error(`Unknown paymentTier: ${paymentTier}. Valid: ${Object.keys(PAYMENT_TIERS).join(', ')}`);
  }

  // Update user with student metadata
  const result = await query(
    `UPDATE users SET
      payment_tier = $1,
      square_customer_id = $2,
      start_date = $3,
      assigned_markets = $4,
      offer_type = $5,
      closer_payout_percent = $6,
      student_status = $7,
      updated_at = now()
    WHERE id = $8
    RETURNING *`,
    [paymentTier, squareCustomerId, startDate, assignedMarkets, offerType, closerPayoutPercent, status || 'active', userId]
  );

  if (result.length === 0) {
    throw new Error(`User ${userId} not found`);
  }

  return {
    ...result[0],
    paymentTierDetails: tier,
    permissions: paymentTier === 'Closer_NDA' ? CLOSER_PERMISSIONS : STUDENT_PERMISSIONS,
    nonCircumventionClause: NON_CIRCUMVENTION_CLAUSE,
  };
}

// =============================================================
// GET STUDENT ROSTER (full list with stats)
// =============================================================

async function getStudentRoster() {
  const students = await query(
    `SELECT 
      u.id, u.email, u.first_name, u.last_name, u.role, u.payment_tier,
      u.square_customer_id, u.start_date, u.assigned_markets, u.offer_type,
      u.closer_payout_percent, u.student_status, u.vacation_mode,
      u.substitute_id, u.coverage_start, u.coverage_end, u.created_at,
      COUNT(l.id) AS total_leads,
      COUNT(l.id) FILTER (WHERE l.stage NOT IN ('ARCHIVED', 'CLOSED', 'DEAD')) AS active_leads,
      COUNT(l.id) FILTER (WHERE l.stage IN ('OFFER_SENT', 'NEGOTIATING', 'UNDER_CONTRACT')) AS offers_sent,
      COUNT(l.id) FILTER (WHERE l.stage = 'CLOSED') AS deals_closed,
      COUNT(l.id) FILTER (WHERE l.stage = 'DEAD') AS deals_lost,
      COUNT(l.id) FILTER (WHERE l.stage = 'LEAD_ENTERED') AS new_leads,
      COUNT(l.id) FILTER (WHERE l.stage = 'CONTACT_MADE') AS contacted_leads,
      COUNT(l.id) FILTER (WHERE l.stage = 'OFFER_READY') AS offer_ready_leads,
      COUNT(l.id) FILTER (WHERE l.stage = 'UNDER_CONTRACT') AS under_contract,
      MAX(l.updated_at) AS last_activity
    FROM users u
    LEFT JOIN leads l ON u.id = l.user_id
    WHERE u.role IN ('student', 'closer')
    GROUP BY u.id
    ORDER BY deals_closed DESC, total_leads DESC`
  );

  return students.map(s => ({
    ...s,
    payment_tier_details: PAYMENT_TIERS[s.payment_tier] || null,
    permissions: s.role === 'closer' ? CLOSER_PERMISSIONS : STUDENT_PERMISSIONS,
    conversion_rate: (s.deals_closed + s.deals_lost) > 0
      ? Math.round((s.deals_closed / (s.deals_closed + s.deals_lost)) * 100)
      : 0,
    contact_rate: s.total_leads > 0
      ? Math.round(((s.total_leads - s.new_leads) / s.total_leads) * 100)
      : 0,
  }));
}

// =============================================================
// GET SINGLE STUDENT DETAILS
// =============================================================

async function getStudentDetails(studentId) {
  const student = await query(
    `SELECT id, email, first_name, last_name, role, payment_tier,
      square_customer_id, start_date, assigned_markets, offer_type,
      closer_payout_percent, student_status, vacation_mode,
      substitute_id, coverage_start, coverage_end, created_at
    FROM users WHERE id = $1 AND role IN ('student', 'closer')`,
    [studentId]
  );

  if (student.length === 0) return null;

  // Lead stats by stage
  const stageStats = await query(
    'SELECT stage, COUNT(*) as count FROM leads WHERE user_id = $1 GROUP BY stage ORDER BY count DESC',
    [studentId]
  );

  // Source breakdown
  const sourceStats = await query(
    'SELECT source, COUNT(*) as count FROM leads WHERE user_id = $1 GROUP BY source ORDER BY count DESC',
    [studentId]
  );

  // Recent activity
  const recentActivity = await query(
    `SELECT a.*, l.address
    FROM activity_log a
    LEFT JOIN leads l ON a.lead_id = l.id
    WHERE a.user_id = $1
    ORDER BY a.created_at DESC
    LIMIT 20`,
    [studentId]
  );

  // Overall stats
  const stats = await query(
    `SELECT 
      COUNT(*) AS total_leads,
      COUNT(*) FILTER (WHERE stage NOT IN ('ARCHIVED', 'CLOSED', 'DEAD')) AS active,
      COUNT(*) FILTER (WHERE stage = 'CLOSED') AS closed,
      COUNT(*) FILTER (WHERE stage = 'DEAD') AS dead,
      AVG(EXTRACT(DAY FROM (closed_date - created_at))) FILTER (WHERE stage = 'CLOSED') AS avg_days_to_close
    FROM leads WHERE user_id = $1`,
    [studentId]
  );

  // Pipeline progress (12-step)
  const pipelineProgress = {
    step1_evaluate: stageStats.find(s => s.stage === 'LEAD_ENTERED')?.count || 0,
    step2_enter_crm: stageStats.find(s => s.stage === 'LEAD_ENTERED')?.count || 0,
    step3_contact: stageStats.find(s => s.stage === 'CONTACT_MADE')?.count || 0,
    step4_notes: stageStats.find(s => s.stage === 'CONTACT_MADE')?.count || 0,
    step5_ccc: stageStats.find(s => s.stage === 'CONTACT_MADE')?.count || 0,
    step6_evaluate_deal: stageStats.find(s => s.stage === 'OFFER_READY')?.count || 0,
    step7_import_crm: stageStats.find(s => s.stage === 'OFFER_READY')?.count || 0,
    step8_group_chat: stageStats.find(s => s.stage === 'OFFER_SENT')?.count || 0,
    step9_eod_spreadsheet: stageStats.find(s => s.stage === 'OFFER_SENT')?.count || 0,
    step10_offer_sent: stageStats.find(s => s.stage === 'OFFER_SENT')?.count || 0,
    step11_followup: stageStats.find(s => s.stage === 'NEGOTIATING')?.count || 0,
    step12_closed: stageStats.find(s => s.stage === 'CLOSED')?.count || 0,
  };

  return {
    student: {
      ...student[0],
      payment_tier_details: PAYMENT_TIERS[student[0].payment_tier] || null,
      permissions: student[0].role === 'closer' ? CLOSER_PERMISSIONS : STUDENT_PERMISSIONS,
    },
    stats: {
      ...stats[0],
      conversion_rate: (stats[0].closed + stats[0].dead) > 0
        ? Math.round((stats[0].closed / (stats[0].closed + stats[0].dead)) * 100)
        : 0,
    },
    stageStats,
    sourceStats,
    pipelineProgress,
    recentActivity,
  };
}

// =============================================================
// VACATION MODE
// =============================================================

/**
 * Set a student/closer into vacation mode.
 * During vacation, their leads are auto-reassigned to substitute_id.
 * Coverage auto-expires at coverage_end.
 */
async function setVacationMode(userId, { substituteId, coverageStart, coverageEnd, reason }) {
  // Validate user exists and is student/closer
  const user = await query('SELECT id, role FROM users WHERE id = $1', [userId]);
  if (user.length === 0) throw new Error('User not found');
  if (!['student', 'closer'].includes(user[0].role)) {
    throw new Error('Vacation mode only applies to students and closers');
  }

  // Validate substitute exists
  if (substituteId) {
    const sub = await query('SELECT id FROM users WHERE id = $1', [substituteId]);
    if (sub.length === 0) throw new Error('Substitute user not found');
  }

  const result = await query(
    `UPDATE users SET
      vacation_mode = true,
      substitute_id = $1,
      coverage_start = $2,
      coverage_end = $3,
      vacation_reason = $4,
      updated_at = now()
    WHERE id = $5
    RETURNING *`,
    [substituteId || null, coverageStart, coverageEnd, reason || null, userId]
  );

  // Reassign active leads to substitute
  if (substituteId) {
    await query(
      `UPDATE leads SET user_id = $1, updated_at = now()
      WHERE user_id = $2 AND stage NOT IN ('CLOSED', 'DEAD', 'ARCHIVED')`,
      [substituteId, userId]
    );

    // Log the reassignment
    await query(
      `INSERT INTO activity_log (user_id, action, details, created_at)
      VALUES ($1, 'vacation_reassign', $2, now())`,
      [userId, JSON.stringify({
        substituteId,
        coverageStart,
        coverageEnd,
        reason,
        reassignedAt: new Date().toISOString(),
      })]
    );
  }

  return result[0];
}

/**
 * End vacation mode. Reassign leads back to original owner.
 */
async function endVacationMode(userId) {
  const user = await query(
    'SELECT id, role, substitute_id FROM users WHERE id = $1 AND vacation_mode = true',
    [userId]
  );
  if (user.length === 0) throw new Error('User not in vacation mode');

  // Return leads from substitute back to original owner
  if (user[0].substitute_id) {
    await query(
      `UPDATE leads SET user_id = $1, updated_at = now()
      WHERE user_id = $2 AND stage NOT IN ('CLOSED', 'DEAD', 'ARCHIVED')`,
      [userId, user[0].substitute_id]
    );

    await query(
      `INSERT INTO activity_log (user_id, action, details, created_at)
      VALUES ($1, 'vacation_ended', $2, now())`,
      [userId, JSON.stringify({
        returnedFrom: user[0].substitute_id,
        returnedAt: new Date().toISOString(),
      })]
    );
  }

  const result = await query(
    `UPDATE users SET
      vacation_mode = false,
      substitute_id = NULL,
      coverage_start = NULL,
      coverage_end = NULL,
      vacation_reason = NULL,
      updated_at = now()
    WHERE id = $1
    RETURNING *`,
    [userId]
  );

  return result[0];
}

// =============================================================
// MANUAL REASSIGN (single lead or bulk)
// =============================================================

/**
 * Reassign a single lead to a different user.
 */
async function reassignLead(leadId, newUserId, reason) {
  const lead = await query('SELECT id, user_id, stage FROM leads WHERE id = $1', [leadId]);
  if (lead.length === 0) throw new Error('Lead not found');

  const newUser = await query('SELECT id, role FROM users WHERE id = $1', [newUserId]);
  if (newUser.length === 0) throw new Error('Target user not found');

  const oldUserId = lead[0].user_id;

  await query('UPDATE leads SET user_id = $1, updated_at = now() WHERE id = $2', [newUserId, leadId]);

  await query(
    `INSERT INTO activity_log (user_id, lead_id, action, details, created_at)
    VALUES ($1, $2, 'lead_reassigned', $3, now())`,
    [oldUserId, leadId, JSON.stringify({
      fromUserId: oldUserId,
      toUserId: newUserId,
      reason: reason || 'manual reassignment',
      reassignedAt: new Date().toISOString(),
    })]
  );

  return { leadId, fromUserId: oldUserId, toUserId: newUserId, reason };
}

/**
 * Bulk reassign all active leads from one user to another.
 */
async function bulkReassign(fromUserId, toUserId, reason) {
  const fromUser = await query('SELECT id, role FROM users WHERE id = $1', [fromUserId]);
  if (fromUser.length === 0) throw new Error('Source user not found');

  const toUser = await query('SELECT id, role FROM users WHERE id = $1', [toUserId]);
  if (toUser.length === 0) throw new Error('Target user not found');

  const result = await query(
    `UPDATE leads SET user_id = $1, updated_at = now()
    WHERE user_id = $2 AND stage NOT IN ('CLOSED', 'DEAD', 'ARCHIVED')
    RETURNING id`,
    [toUserId, fromUserId]
  );

  await query(
    `INSERT INTO activity_log (user_id, action, details, created_at)
    VALUES ($1, 'bulk_reassign', $2, now())`,
    [fromUserId, JSON.stringify({
      toUserId,
      reason: reason || 'bulk reassignment',
      leadCount: result.length,
      reassignedAt: new Date().toISOString(),
    })]
  );

  return { fromUserId, toUserId, reassignedCount: result.length, reason };
}

// =============================================================
// CHECK STAGE PERMISSION
// =============================================================

/**
 * Check if a user can move a lead to a given stage.
 * Students: can move stages 1-3 only
 * Closers: view-only, no stage movement
 * Admins: full access
 */
function canMoveStage(userRole, targetStage) {
  if (userRole === 'admin') return true;

  const stageNum = STAGE_NUMBERS[targetStage];
  if (!stageNum) return false;

  if (userRole === 'student') {
    return STUDENT_PERMISSIONS.stageControl.canMove.includes(stageNum);
  }

  if (userRole === 'closer') {
    return CLOSER_PERMISSIONS.stageControl.canMove.includes(stageNum);
  }

  return false;
}

/**
 * Check if a user can view a lead at a given stage.
 */
function canViewStage(userRole, targetStage) {
  if (userRole === 'admin') return true;

  const stageNum = STAGE_NUMBERS[targetStage];
  if (!stageNum) return false;

  const permissions = userRole === 'closer' ? CLOSER_PERMISSIONS : STUDENT_PERMISSIONS;
  return permissions.stageControl.viewOnly.includes(stageNum) ||
         permissions.stageControl.canMove.includes(stageNum);
}

// =============================================================
// AUTO-EXPIRE VACATION COVERAGE (called by cron/pipeline-monitor)
// =============================================================

async function expireVacationCoverage() {
  const expired = await query(
    `SELECT id, substitute_id FROM users
    WHERE vacation_mode = true AND coverage_end < now()`
  );

  for (const user of expired) {
    await endVacationMode(user.id);
  }

  return { expired: expired.length, userIds: expired.map(u => u.id) };
}

// =============================================================
// EXPORT
// =============================================================

module.exports = {
  PAYMENT_TIERS,
  STUDENT_PERMISSIONS,
  CLOSER_PERMISSIONS,
  NON_CIRCUMVENTION_CLAUSE,
  STAGE_NUMBERS,
  createMenteeRecord,
  getStudentRoster,
  getStudentDetails,
  setVacationMode,
  endVacationMode,
  reassignLead,
  bulkReassign,
  canMoveStage,
  canViewStage,
  expireVacationCoverage,
};
