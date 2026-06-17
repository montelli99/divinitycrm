// =============================================================
// Divinity CRM Platform — Express Server Entry Point
// =============================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Clerk auth
let requireAuth = null;
try {
  const clerk = require('@clerk/express');
  requireAuth = clerk.requireAuth;
  console.log('Clerk SDK loaded OK');
} catch (err) {
  console.error('Clerk SDK load failed:', err.message);
}

const { testConnection } = require('./db/connection');

// Lazy-load routes to isolate failures
let leadsRouter, contractsRouter, pipelineRouter, scriptsRouter, scriptPromptsRouter, usersRouter, webhooksRouter;

try { leadsRouter = require('./routes/leads'); console.log('leads route OK'); } catch(e) { console.error('leads route FAIL:', e.message); }
try { contractsRouter = require('./routes/contracts'); console.log('contracts route OK'); } catch(e) { console.error('contracts route FAIL:', e.message); }
try { pipelineRouter = require('./routes/pipeline'); console.log('pipeline route OK'); } catch(e) { console.error('pipeline route FAIL:', e.message); }
try { scriptsRouter = require('./routes/scripts'); console.log('scripts route OK'); } catch(e) { console.error('scripts route FAIL:', e.message); }
try { scriptPromptsRouter = require('./routes/script-prompts'); console.log('script-prompts route OK'); } catch(e) { console.error('script-prompts route FAIL:', e.message); }
try { usersRouter = require('./routes/users'); console.log('users route OK'); } catch(e) { console.error('users route FAIL:', e.message); }
try { webhooksRouter = require('./routes/webhooks'); console.log('webhooks route OK'); } catch(e) { console.error('webhooks route FAIL:', e.message); }

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(morgan('dev'));
app.use(express.json());

app.get('/api/health', async (req, res) => {
  const dbOk = await testConnection();
  res.json({ status: 'ok', database: dbOk ? 'connected' : 'disconnected', timestamp: new Date().toISOString() });
});

const authMiddleware = requireAuth ? requireAuth() : (req, res, next) => next();

if (leadsRouter) app.use('/api/leads', authMiddleware, leadsRouter);
if (contractsRouter) app.use('/api/contracts', authMiddleware, contractsRouter);
if (pipelineRouter) app.use('/api/pipeline', authMiddleware, pipelineRouter);
if (scriptsRouter) app.use('/api/scripts', authMiddleware, scriptsRouter);
if (scriptPromptsRouter) app.use('/api/scripts/prompts', authMiddleware, scriptPromptsRouter);
if (usersRouter) app.use('/api/users', authMiddleware, usersRouter);
if (webhooksRouter) app.use('/api/webhooks', webhooksRouter);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

async function start() {
  try {
    const dbOk = await testConnection();
    if (!dbOk) console.warn('WARNING: Starting without database connection.');
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
