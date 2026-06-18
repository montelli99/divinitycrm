// =============================================================
// Divinity CRM — Notifications Routes
// =============================================================

const { Router } = require('express');
const { authMiddleware } = require('../auth/auth');
const {
  getNotificationsForUser,
  markRead,
  markAllRead,
  archive,
} = require('../services/notifications');

const router = Router();

// GET /api/notifications — List notifications (with filter)
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const { filter = 'all', limit = 50 } = req.query;
    const result = await getNotificationsForUser(req.user.userId, { filter, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/notifications/unread-count — Just the unread count (for sidebar badge)
router.get('/unread-count', authMiddleware, async (req, res, next) => {
  try {
    const { query } = require('../db/connection');
    const r = await query(
      `SELECT COUNT(*) as count FROM notifications WHERE recipient_id = $1 AND read_at IS NULL AND archived_at IS NULL`,
      [req.user.userId]
    );
    res.json({ count: parseInt(r[0].count) });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/:id/read — Mark single as read
router.post('/:id/read', authMiddleware, async (req, res, next) => {
  try {
    await markRead(req.params.id, req.user.userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/read-all — Mark all as read
router.post('/read-all', authMiddleware, async (req, res, next) => {
  try {
    await markAllRead(req.user.userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/:id/archive — Archive single
router.post('/:id/archive', authMiddleware, async (req, res, next) => {
  try {
    await archive(req.params.id, req.user.userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;