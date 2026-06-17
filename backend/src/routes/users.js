// =============================================================
// Divinity CRM Platform — Users API Routes
// =============================================================

const { Router } = require('express');
const { sql } = require('../db/connection');

const router = Router();

// GET /api/users/me — Get current user profile
router.get('/me', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const user = await sql`SELECT * FROM users WHERE id = ${userId}`;
    
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

    const result = await sql`
      UPDATE users 
      SET first_name = COALESCE(${first_name}, first_name),
          last_name = COALESCE(${last_name}, last_name)
      WHERE id = ${userId}
      RETURNING *
    `;

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
    const currentUser = await sql`SELECT role FROM users WHERE id = ${userId}`;
    if (currentUser.length === 0 || currentUser[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get all students with their lead stats
    const students = await sql`
      SELECT 
        u.id, u.email, u.first_name, u.last_name, u.role, u.created_at,
        COUNT(l.id) AS total_leads,
        COUNT(l.id) FILTER (WHERE l.stage NOT IN ('ARCHIVED', 'CLOSED', 'DEAD')) AS active_leads,
        COUNT(l.id) FILTER (WHERE l.stage = 'OFFER_SENT' OR l.stage = 'NEGOTIATING' OR l.stage = 'UNDER_CONTRACT') AS offers_sent,
        COUNT(l.id) FILTER (WHERE l.stage = 'CLOSED') AS deals_closed,
        COUNT(l.id) FILTER (WHERE l.stage = 'DEAD') AS deals_lost,
        COUNT(l.id) FILTER (WHERE l.stage = 'NEW_LEAD') AS new_leads,
        COUNT(l.id) FILTER (WHERE l.stage = 'QUALIFIED') AS qualified_leads,
        COUNT(l.id) FILTER (WHERE l.stage = 'LOI_REQUESTED' OR l.stage = 'LOI_APPROVED') AS loi_leads,
        COUNT(l.id) FILTER (WHERE l.stage = 'UNDER_CONTRACT') AS under_contract,
        MAX(l.updated_at) AS last_activity
      FROM users u
      LEFT JOIN leads l ON u.id = l.user_id
      WHERE u.role = 'student'
      GROUP BY u.id
      ORDER BY deals_closed DESC, total_leads DESC
    `;

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
    const currentUser = await sql`SELECT role FROM users WHERE id = ${userId}`;
    if (currentUser.length === 0 || currentUser[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const studentId = req.params.id;

    // Student info
    const student = await sql`SELECT id, email, first_name, last_name, role, created_at FROM users WHERE id = ${studentId}`;
    if (student.length === 0) return res.status(404).json({ error: 'Student not found' });

    // Lead stats by stage
    const stageStats = await sql`
      SELECT stage, COUNT(*) as count
      FROM leads WHERE user_id = ${studentId}
      GROUP BY stage ORDER BY count DESC
    `;

    // Source breakdown
    const sourceStats = await sql`
      SELECT source, COUNT(*) as count
      FROM leads WHERE user_id = ${studentId}
      GROUP BY source ORDER BY count DESC
    `;

    // Recent activity
    const recentActivity = await sql`
      SELECT a.*, l.address
      FROM activity_log a
      LEFT JOIN leads l ON a.lead_id = l.id
      WHERE a.user_id = ${studentId}
      ORDER BY a.created_at DESC
      LIMIT 20
    `;

    // Overall stats
    const stats = await sql`
      SELECT 
        COUNT(*) AS total_leads,
        COUNT(*) FILTER (WHERE stage NOT IN ('ARCHIVED', 'CLOSED', 'DEAD')) AS active,
        COUNT(*) FILTER (WHERE stage = 'CLOSED') AS closed,
        COUNT(*) FILTER (WHERE stage = 'DEAD') AS dead,
        AVG(EXTRACT(DAY FROM (closed_date - created_at))) FILTER (WHERE stage = 'CLOSED') AS avg_days_to_close
      FROM leads WHERE user_id = ${studentId}
    `;

    // 12-step progress: count leads at each pipeline stage
    const pipelineProgress = {
      step1_evaluate: stageStats.find(s => s.stage === 'NEW_LEAD')?.count || 0,
      step2_enter_crm: stageStats.find(s => s.stage === 'NEW_LEAD')?.count || 0,
      step3_contact: stageStats.find(s => s.stage === 'QUALIFIED')?.count || 0,
      step4_notes: stageStats.find(s => s.stage === 'QUALIFIED')?.count || 0,
      step5_ccc: stageStats.find(s => s.stage === 'QUALIFIED')?.count || 0,
      step6_evaluate_deal: stageStats.find(s => s.stage === 'LOI_REQUESTED')?.count || 0,
      step7_import_crm: stageStats.find(s => s.stage === 'LOI_REQUESTED')?.count || 0,
      step8_group_chat: stageStats.find(s => s.stage === 'LOI_APPROVED')?.count || 0,
      step9_eod_spreadsheet: stageStats.find(s => s.stage === 'LOI_APPROVED')?.count || 0,
      step10_offer_sent: stageStats.find(s => s.stage === 'OFFER_SENT')?.count || 0,
      step11_followup: stageStats.find(s => s.stage === 'NEGOTIATING')?.count || 0,
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

module.exports = router;
