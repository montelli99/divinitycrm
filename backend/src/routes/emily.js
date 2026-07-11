// =============================================================
// Emily API Route — Daily Lead Queue
// =============================================================
// GET /api/emily/queue — returns Emily's prioritized lead queue for today.

const express = require('express');
const router = express.Router();
const { getTodaysQueue, formatQueueForText } = require('../services/emily');

router.get('/queue', async (req, res) => {
  try {
    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = requestedLimit > 0 ? Math.min(requestedLimit, 100) : 50;
    const leads = await getTodaysQueue(limit);
    const formatted = formatQueueForText(leads);
    res.json({
      total: leads.length,
      limit,
      summary: formatted.summary,
      top: formatted.top,
      leads,
    });
  } catch (err) {
    console.error('Emily queue error:', err.message);
    res.status(500).json({ error: 'Failed to load Emily queue' });
  }
});

module.exports = router;
