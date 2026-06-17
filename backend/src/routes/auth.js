// =============================================================
// Divinity CRM — Auth Routes (local login)
// =============================================================

const { Router } = require('express');
const { login } = require('../auth/auth');

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await login(email, password);
    if (!result) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
