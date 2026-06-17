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

module.exports = router;
