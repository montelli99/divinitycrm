// =============================================================
// Divinity CRM — Local Auth (bypasses Clerk while keys are dead)
// =============================================================

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query } = require('../db/connection');
const { v4: uuid } = require('uuid');

const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === 'production' ? '' : 'divinity-crm-local-jwt-secret-2026');

if (!JWT_SECRET) {
  console.error('JWT_SECRET not set. Add it to backend/.env or the production environment.');
  process.exit(1);
}
const JWT_EXPIRY = '7d';

// Seed admin users if they don't exist
async function seedUsers() {
  const users = [
    { email: 'montelliscottrei@gmail.com', password: 'Prolific2026!', firstName: 'Montelli', lastName: 'Scott' },
    { email: 'homewithkaylamauser@gmail.com', password: 'Divinity2026!', firstName: 'Kayla', lastName: 'Mauser' },
  ];

  for (const u of users) {
    const existing = await query('SELECT id FROM users WHERE email = $1', [u.email]);
    if (existing.length === 0) {
      const hash = await bcrypt.hash(u.password, 10);
      await query(
        'INSERT INTO users (id, clerk_id, email, first_name, last_name, password_hash) VALUES ($1, $2, $3, $4, $5, $6)',
        [uuid(), 'local:' + u.email, u.email, u.firstName, u.lastName, hash]
      );
      console.log(`Seeded user: ${u.email}`);
    }
  }
}

// Login
async function login(email, password) {
  const user = await query('SELECT * FROM users WHERE email = $1', [email]);
  if (user.length === 0) return null;

  const valid = await bcrypt.compare(password, user[0].password_hash || '');
  if (!valid) return null;

  const token = jwt.sign(
    { userId: user[0].id, email: user[0].email, name: `${user[0].first_name || ''} ${user[0].last_name || ''}`.trim() },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  return { token, user: { id: user[0].id, email: user[0].email, firstName: user[0].first_name, lastName: user[0].last_name } };
}

// Auth middleware
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { seedUsers, login, authMiddleware, JWT_SECRET };
