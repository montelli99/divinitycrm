// =============================================================
// Student CRM Platform — Express Server Entry Point
// =============================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { ClerkExpressRequireAuth } = require('@clerk/express');

const { testConnection } = require('./db/connection');
const leadsRouter = require('./routes/leads');
const contractsRouter = require('./routes/contracts');
const pipelineRouter = require('./routes/pipeline');
const scriptsRouter = require('./routes/scripts');
const usersRouter = require('./routes/users');
const webhooksRouter = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(morgan('dev'));
app.use(express.json());

// Health check (no auth required)
app.get('/api/health', async (req, res) => {
  const dbOk = await testConnection();
  res.json({ status: 'ok', database: dbOk ? 'connected' : 'disconnected', timestamp: new Date().toISOString() });
});

// Protected routes (Clerk auth required)
app.use('/api/leads', ClerkExpressRequireAuth(), leadsRouter);
app.use('/api/contracts', ClerkExpressRequireAuth(), contractsRouter);
app.use('/api/pipeline', ClerkExpressRequireAuth(), pipelineRouter);
app.use('/api/scripts', ClerkExpressRequireAuth(), scriptsRouter);
app.use('/api/users', ClerkExpressRequireAuth(), usersRouter);

// Webhooks (Clerk webhook verification, no standard auth)
app.use('/api/webhooks', webhooksRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Start
async function start() {
  const dbOk = await testConnection();
  if (!dbOk) {
    console.warn('WARNING: Starting without database connection. API will return errors for DB-dependent routes.');
  }

  app.listen(PORT, () => {
    console.log(`Student CRM API running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
}

start();
