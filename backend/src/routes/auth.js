// =============================================================
// Divinity CRM — Auth Routes (local login + Google OAuth)
// =============================================================

const { Router } = require('express');
const { login, authMiddleware } = require('../auth/auth');
const { getAuthUrl, handleCallback, saveGoogleTokens, getGoogleStatus, disconnectGoogle } = require('../services/google-oauth');

const router = Router();

// POST /api/auth/login — Local email/password login
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

// =============================================================
// GOOGLE OAUTH ROUTES
// =============================================================

// GET /api/auth/google/url — Get Google OAuth consent URL
router.get('/google/url', authMiddleware, async (req, res, next) => {
  try {
    const redirectUri = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/api/auth/google/callback`;
    const state = Buffer.from(JSON.stringify({ userId: req.user.userId })).toString('base64');
    const url = getAuthUrl(redirectUri, state);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/google/callback — Google redirects here after consent
router.get('/google/callback', async (req, res, next) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).json({ error: 'No authorization code provided' });

    // Decode state to get userId
    let userId;
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
      userId = decoded.userId;
    } catch {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }

    const redirectUri = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/api/auth/google/callback`;
    const { tokens, profile } = await handleCallback(redirectUri, code);
    await saveGoogleTokens(userId, tokens, profile);

    // Redirect back to frontend with success
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    res.redirect(`${frontendUrl}/profile?google=connected`);
  } catch (err) {
    console.error('Google callback error:', err);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    res.redirect(`${frontendUrl}/profile?google=error&message=${encodeURIComponent(err.message)}`);
  }
});

// GET /api/auth/google/status — Check if Google is connected
router.get('/google/status', authMiddleware, async (req, res, next) => {
  try {
    const status = await getGoogleStatus(req.user.userId);
    res.json(status || { connected: false });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/google/disconnect — Disconnect Google account
router.post('/google/disconnect', authMiddleware, async (req, res, next) => {
  try {
    await disconnectGoogle(req.user.userId);
    res.json({ success: true, message: 'Google account disconnected' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
