// =============================================================
// Divinity CRM Platform — Express Server Entry Point
// =============================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { testConnection, query } = require('./db/connection');
const { seedUsers, authMiddleware } = require('./auth/auth');
const { v4: uuid } = require('uuid');

// Lazy-load routes
let leadsRouter, contractsRouter, pipelineRouter, scriptsRouter, scriptPromptsRouter, usersRouter, webhooksRouter, authRouter, calculatorRouter, trainingRouter;

try { authRouter = require('./routes/auth'); console.log('auth route OK'); } catch(e) { console.error('auth route FAIL:', e.message); }
try { leadsRouter = require('./routes/leads'); console.log('leads route OK'); } catch(e) { console.error('leads route FAIL:', e.message); }
try { contractsRouter = require('./routes/contracts'); console.log('contracts route OK'); } catch(e) { console.error('contracts route FAIL:', e.message); }
try { pipelineRouter = require('./routes/pipeline'); console.log('pipeline route OK'); } catch(e) { console.error('pipeline route FAIL:', e.message); }
try { scriptsRouter = require('./routes/scripts'); console.log('scripts route OK'); } catch(e) { console.error('scripts route FAIL:', e.message); }
try { scriptPromptsRouter = require('./routes/script-prompts'); console.log('script-prompts route OK'); } catch(e) { console.error('script-prompts route FAIL:', e.message); }
try { usersRouter = require('./routes/users'); console.log('users route OK'); } catch(e) { console.error('users route FAIL:', e.message); }
try { webhooksRouter = require('./routes/webhooks'); console.log('webhooks route OK'); } catch(e) { console.error('webhooks route FAIL:', e.message); }
try { calculatorRouter = require('./routes/calculator'); console.log('calculator route OK'); } catch(e) { console.error('calculator route FAIL:', e.message); }
try { trainingRouter = require('./routes/training'); console.log('training route OK'); } catch(e) { console.error('training route FAIL:', e.message); }

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(morgan('dev'));
app.use(express.json());

// Health check (no auth)
app.get('/api/health', async (req, res) => {
  const dbOk = await testConnection();
  res.json({ status: 'ok', database: dbOk ? 'connected' : 'disconnected', timestamp: new Date().toISOString() });
});

// Auth routes (no auth required)
if (authRouter) app.use('/api/auth', authRouter);

// Auto-create user middleware (for Clerk fallback — keeps existing Clerk users working)
app.use('/api', async (req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/auth') || req.path.startsWith('/webhooks')) return next();
  
  try {
    const clerkId = req.auth?.userId;
    if (clerkId) {
      const existing = await query('SELECT id FROM users WHERE clerk_id = $1', [clerkId]);
      if (existing.length === 0) {
        await query(
          'INSERT INTO users (id, clerk_id, email, first_name, last_name, avatar_url) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (clerk_id) DO NOTHING',
          [uuid(), clerkId, clerkId + '@clerk.user', null, null, null]
        );
        console.log(`Auto-created user record for Clerk ID: ${clerkId}`);
      }
    }
  } catch (err) {
    console.error('Auto-create user error:', err.message);
  }
  next();
});

// Protected routes (local JWT auth)
if (leadsRouter) app.use('/api/leads', authMiddleware, leadsRouter);
if (contractsRouter) app.use('/api/contracts', authMiddleware, contractsRouter);
if (pipelineRouter) app.use('/api/pipeline', authMiddleware, pipelineRouter);
if (scriptsRouter) app.use('/api/scripts', authMiddleware, scriptsRouter);
if (scriptPromptsRouter) app.use('/api/scripts/prompts', authMiddleware, scriptPromptsRouter);
if (usersRouter) app.use('/api/users', authMiddleware, usersRouter);
if (webhooksRouter) app.use('/api/webhooks', webhooksRouter);
if (calculatorRouter) app.use('/api/calculator', authMiddleware, calculatorRouter);
if (trainingRouter) app.use('/api/training', authMiddleware, trainingRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

async function start() {
  try {
    const dbOk = await testConnection();
    if (!dbOk) console.warn('WARNING: Starting without database connection.');
    
    // Seed admin users
    await seedUsers();
    
    app.listen(PORT, '0.0.0.0', () => console.log(`Divinity CRM API running on port ${PORT}`));
  } catch (err) {
    console.error('FATAL STARTUP ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

start().catch(err => {
  console.error('UNHANDLED STARTUP ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
