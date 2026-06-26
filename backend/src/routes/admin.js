// =============================================================
// Divinity CRM — Admin Dashboard API
// =============================================================
// Montelli & Kayla visibility: all students, all leads, all KPIs

const { Router } = require('express');
const { query } = require('../db/connection');
const { isTeamViewer } = require('../services/access');

const router = Router();

// GET /api/admin/dashboard — Full admin dashboard with all student KPIs
router.get('/dashboard', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const currentUser = await query('SELECT role, email FROM users WHERE id = $1', [userId]);
    if (currentUser.length === 0 || !isTeamViewer(currentUser[0])) {
      return res.status(403).json({ error: 'Team access required' });
    }

    // 1. Overall pipeline stats (all students combined)
    const overall = await query(
      `SELECT 
        COUNT(*) AS total_leads,
        COUNT(*) FILTER (WHERE stage NOT IN ('ARCHIVED', 'CLOSING_DATE', 'DEAD')) AS active,
        COUNT(*) FILTER (WHERE stage = 'CLOSING_DATE') AS closed,
        COUNT(*) FILTER (WHERE stage = 'DEAD') AS dead,
        COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) AS added_today,
        AVG(EXTRACT(DAY FROM (closed_date - created_at))) FILTER (WHERE stage = 'CLOSING_DATE') AS avg_days_to_close
      FROM leads`
    );

    // 2. Pipeline value
    const pipelineValue = await query(
      `SELECT 
        SUM(price) AS total_value,
        SUM(estimated_profit) AS total_profit,
        COUNT(*) FILTER (WHERE stage NOT IN ('ARCHIVED', 'CLOSING_DATE', 'DEAD')) AS active_count
      FROM leads`
    );

    // 3. Per-student stats
    const students = await query(
      `SELECT 
        u.id, u.email, u.first_name, u.last_name, u.role,
        COUNT(l.id) AS total_leads,
        COUNT(l.id) FILTER (WHERE l.stage NOT IN ('ARCHIVED', 'CLOSING_DATE', 'DEAD')) AS active_leads,
        COUNT(l.id) FILTER (WHERE l.stage = 'CLOSING_DATE') AS deals_closed,
        COUNT(l.id) FILTER (WHERE l.stage = 'DEAD') AS deals_lost,
        COUNT(l.id) FILTER (WHERE l.stage = 'OFFER_SENT') AS offers_sent,
        COUNT(l.id) FILTER (WHERE l.stage = 'ACTIVE_NEGOTIATION') AS active_negotiations,
        COUNT(l.id) FILTER (WHERE l.stage = 'TERMS_AGREED') AS contracts_to_draft,
        COUNT(l.id) FILTER (WHERE l.stage = 'CONTRACT_OUT' OR l.stage = 'UNDER_CONTRACT') AS under_contract,
        MAX(l.updated_at) AS last_activity
      FROM users u
      LEFT JOIN leads l ON u.id = l.user_id
      WHERE u.role IN ('student', 'closer')
      GROUP BY u.id
      ORDER BY deals_closed DESC, total_leads DESC`
    );

    // 4. Stage distribution (all leads)
    const stageDistribution = await query(
      `SELECT stage, COUNT(*) as count 
      FROM leads 
      WHERE stage NOT IN ('ARCHIVED', 'DEAD')
      GROUP BY stage 
      ORDER BY count DESC`
    );

    // 5. Stalled leads (>7 days in stage)
    const stalled = await query(
      `SELECT l.id, l.address, l.stage, l.price, u.email as student_email, u.first_name,
        EXTRACT(DAY FROM (NOW() - l.last_stage_change_at))::int AS days_stalled
      FROM leads l
      JOIN users u ON l.user_id = u.id
      WHERE l.stage NOT IN ('ARCHIVED', 'CLOSING_DATE', 'DEAD')
        AND l.last_stage_change_at < NOW() - INTERVAL '7 days'
      ORDER BY days_stalled DESC
      LIMIT 20`
    );

    // 6. Overdue 48hr follow-ups
    const overdue48hr = await query(
      `SELECT l.id, l.address, l.price, u.email as student_email, u.first_name,
        l.follow_up_48hr_due, l.offer_sent_date
      FROM leads l
      JOIN users u ON l.user_id = u.id
      WHERE l.stage = 'OFFER_SENT'
        AND l.follow_up_48hr_done = false
        AND l.follow_up_48hr_due < NOW()
      ORDER BY l.follow_up_48hr_due`
    );

    // 7. Recent activity (last 20 actions across all students)
    const recentActivity = await query(
      `SELECT a.*, l.address, u.email as student_email, u.first_name
      FROM activity_log a
      LEFT JOIN leads l ON a.lead_id = l.id
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT 20`
    );

    // 8. Source breakdown
    const sourceBreakdown = await query(
      `SELECT source, COUNT(*) as count 
      FROM leads 
      GROUP BY source 
      ORDER BY count DESC`
    );

    // 9. Conversion rate
    const conv = overall[0];
    const conversionRate = (conv.closed + conv.dead) > 0
      ? Math.round((conv.closed / (conv.closed + conv.dead)) * 100)
      : 0;

    // Enrich students with conversion rates
    const enrichedStudents = students.map(s => ({
      ...s,
      conversion_rate: (s.deals_closed + s.deals_lost) > 0
        ? Math.round((s.deals_closed / (s.deals_closed + s.deals_lost)) * 100)
        : 0,
    }));

    res.json({
      success: true,
      overall: {
        ...overall[0],
        conversion_rate: conversionRate,
        pipeline_value: pipelineValue[0].total_value || 0,
        estimated_profit: pipelineValue[0].total_profit || 0,
      },
      students: enrichedStudents,
      stageDistribution,
      stalled,
      overdue48hr,
      recentActivity,
      sourceBreakdown,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/contracts/library-audit — Audit contract library state
// Surfaces missing source files and missing RabbitSign env vars.
// Used by morning brief cron to alert operators.
router.get('/contracts/library-audit', async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const currentUser = await query('SELECT role, email FROM users WHERE id = $1', [userId]);
    if (currentUser.length === 0 || !isTeamViewer(currentUser[0])) {
      return res.status(403).json({ error: 'Team access required' });
    }
    const { auditLibrary } = require('../services/contract-library');
    const audit = auditLibrary();
    // Compact summary for human reading (telegram-friendly)
    const summary = {
      total: audit.total,
      sourceDir: audit.sourceDir,
      liveOverride: audit.liveOverride,
      okCount: audit.types.filter(t => t.issues.length === 0).length,
      issueCount: audit.issues.length,
      issuesByType: audit.issues.map(i => ({
        type: i.type,
        rabbitsignMissing: i.issues.some(x => x.includes('RabbitSign template ID')),
        sourceMissing: i.issues.some(x => x.includes('missing template') || x.includes('missing addendum') || x.includes('missing LOI')),
        issues: i.issues,
      })),
    };
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
