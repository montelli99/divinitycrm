// =============================================================
// Divinity CRM Platform — Users API Routes
// =============================================================

const { Router } = require('express');
const { query } = require('../db/connection');

const router = Router();

// GET /api/users/me — Get current user profile
router.get('/me', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const user = await query('SELECT * FROM users WHERE id = $1', [userId]);
    
    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: user[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/me — Update current user profile
router.patch('/me', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { first_name, last_name } = req.body;

    const result = await query(
      `UPDATE users 
      SET first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name)
      WHERE id = $3
      RETURNING *`,
      [first_name, last_name, userId]
    );

    if (result.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result[0] });
  } catch (err) {
    next(err);
  }
});

// =============================================================
// STUDENT ROSTER (Admin Only)
// =============================================================

// GET /api/users/students — List all students with stats
router.get('/students', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    // Check admin role
    const currentUser = await query('SELECT role FROM users WHERE id = $1', [userId]);
    if (currentUser.length === 0 || currentUser[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get all students with their lead stats
    const students = await query(
      `SELECT 
        u.id, u.email, u.first_name, u.last_name, u.role, u.created_at,
        COUNT(l.id) AS total_leads,
        COUNT(l.id) FILTER (WHERE l.stage NOT IN ('ARCHIVED', 'CLOSED', 'DEAD')) AS active_leads,
        COUNT(l.id) FILTER (WHERE l.stage = 'OFFER_SENT' OR l.stage = 'ACTIVE_NEGOTIATION' OR l.stage = 'TERMS_AGREED' OR l.stage = 'AWAITING_TITLE' OR l.stage = 'CONTRACT_OUT' OR l.stage = 'UNDER_CONTRACT') AS offers_sent,
        COUNT(l.id) FILTER (WHERE l.stage = 'CLOSED') AS deals_closed,
        COUNT(l.id) FILTER (WHERE l.stage = 'DEAD') AS deals_lost,
        COUNT(l.id) FILTER (WHERE l.stage = 'LEAD_ENTERED') AS new_leads,
        COUNT(l.id) FILTER (WHERE l.stage = 'CONTACT_MADE') AS qualified_leads,
        COUNT(l.id) FILTER (WHERE l.stage IN ('OFFER_READY', 'OFFER_SENT', 'OFFER_RECEIVED', 'GAIN_FEEDBACK')) AS loi_leads,
        COUNT(l.id) FILTER (WHERE l.stage = 'UNDER_CONTRACT') AS under_contract,
        MAX(l.updated_at) AS last_activity
      FROM users u
      LEFT JOIN leads l ON u.id = l.user_id
      WHERE u.role = 'student'
      GROUP BY u.id
      ORDER BY deals_closed DESC, total_leads DESC`
    );

    // Calculate conversion rates
    const enriched = students.map(s => ({
      ...s,
      conversion_rate: (s.deals_closed + s.deals_lost) > 0
        ? Math.round((s.deals_closed / (s.deals_closed + s.deals_lost)) * 100)
        : 0,
      contact_rate: s.total_leads > 0
        ? Math.round(((s.total_leads - s.new_leads) / s.total_leads) * 100)
        : 0,
    }));

    res.json({ success: true, students: enriched, total: enriched.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/students/:id/stats — Detailed stats for one student
router.get('/students/:id/stats', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const currentUser = await query('SELECT role FROM users WHERE id = $1', [userId]);
    if (currentUser.length === 0 || currentUser[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const studentId = req.params.id;

    // Student info
    const student = await query('SELECT id, email, first_name, last_name, role, created_at FROM users WHERE id = $1', [studentId]);
    if (student.length === 0) return res.status(404).json({ error: 'Student not found' });

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

    // 12-step progress: count leads at each pipeline stage
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
      step11_followup: stageStats.find(s => s.stage === 'GAIN_FEEDBACK')?.count || 0,
      step12_closed: stageStats.find(s => s.stage === 'CLOSED')?.count || 0,
    };

    res.json({
      success: true,
      student: student[0],
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
    });
  } catch (err) {
    next(err);
  }
});

// =============================================================
// VACATION COVERAGE (Admin Only)
// =============================================================

const {
  setVacationMode,
  endVacationMode,
  reassignLead,
  bulkReassign,
  getStudentRoster,
  getStudentDetails,
} = require('../services/student-roster');

// POST /api/users/:id/vacation — Set vacation mode
router.post('/:id/vacation', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const currentUser = await query('SELECT role FROM users WHERE id = $1', [userId]);
    if (currentUser.length === 0 || currentUser[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const targetId = req.params.id;
    const { substituteId, coverageStart, coverageEnd, reason } = req.body;

    if (!coverageStart || !coverageEnd) {
      return res.status(400).json({ error: 'coverageStart and coverageEnd are required' });
    }

    const result = await setVacationMode(targetId, {
      substituteId,
      coverageStart,
      coverageEnd,
      reason,
    });

    res.json({ success: true, user: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/:id/vacation/end — End vacation mode
router.post('/:id/vacation/end', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const currentUser = await query('SELECT role FROM users WHERE id = $1', [userId]);
    if (currentUser.length === 0 || currentUser[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const targetId = req.params.id;
    const result = await endVacationMode(targetId);

    res.json({ success: true, user: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/reassign — Reassign a single lead
router.post('/reassign', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const currentUser = await query('SELECT role FROM users WHERE id = $1', [userId]);
    if (currentUser.length === 0 || currentUser[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { leadId, newUserId, reason } = req.body;
    if (!leadId || !newUserId) {
      return res.status(400).json({ error: 'leadId and newUserId are required' });
    }

    const result = await reassignLead(leadId, newUserId, reason);
    res.json({ success: true, reassignment: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/reassign/bulk — Bulk reassign all active leads
router.post('/reassign/bulk', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const currentUser = await query('SELECT role FROM users WHERE id = $1', [userId]);
    if (currentUser.length === 0 || currentUser[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { fromUserId, toUserId, reason } = req.body;
    if (!fromUserId || !toUserId) {
      return res.status(400).json({ error: 'fromUserId and toUserId are required' });
    }

    const result = await bulkReassign(fromUserId, toUserId, reason);
    res.json({ success: true, reassignment: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/roster — Full student roster with stats (uses service)
router.get('/roster', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const currentUser = await query('SELECT role FROM users WHERE id = $1', [userId]);
    if (currentUser.length === 0 || currentUser[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const roster = await getStudentRoster();
    res.json({ success: true, students: roster, total: roster.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/roster/:id — Single student detail (uses service)
router.get('/roster/:id', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const currentUser = await query('SELECT role FROM users WHERE id = $1', [userId]);
    if (currentUser.length === 0 || currentUser[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const details = await getStudentDetails(req.params.id);
    if (!details) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json({ success: true, ...details });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
