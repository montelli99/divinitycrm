/**
 * Google OAuth Service — Divinity CRM
 * =============================================================
 * Handles Google OAuth 2.0 flow for students to connect their Gmail + Calendar.
 *
 * Flow:
 *   1. Student clicks "Connect Google" → redirected to Google consent screen
 *   2. Google redirects back to /api/auth/google/callback with auth code
 *   3. Server exchanges code for tokens, stores refresh_token in DB
 *   4. Student's Gmail and Calendar are now connected
 *
 * Required Google Cloud Console setup (Montelli does once):
 *   - Enable Gmail API + Google Calendar API
 *   - Create OAuth 2.0 Web Application credentials
 *   - Add redirect URI: https://divinitycrm-ggi5.onrender.com/api/api/auth/google/callback
 *     (and https://divinitycrm-ggi5.onrender.com/api/auth/google/callback for dev)
 *   - Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env
 *
 * Scopes requested:
 *   - https://www.googleapis.com/auth/gmail.send (send emails as student)
 *   - https://www.googleapis.com/auth/calendar.events (create events with Meet)
 *   - https://www.googleapis.com/auth/calendar.readonly (read free/busy)
 *   - openid, profile, email (basic identity)
 */

const { google } = require('googleapis');
const { query } = require('../db/connection');

// OAuth2 client — created per-request with redirect URI
function createOAuthClient(redirectUri) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

// =============================================================
// STEP 1: Generate Google Auth URL
// =============================================================

const SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];

function getAuthUrl(redirectUri, state) {
  const oauth2Client = createOAuthClient(redirectUri);
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',        // Get refresh_token
    prompt: 'consent',             // Force consent screen every time (ensures refresh_token)
    scope: SCOPES,
    state: state,                  // Pass user ID to callback
  });
}

// =============================================================
// STEP 2: Handle Callback — Exchange Code for Tokens
// =============================================================

async function handleCallback(redirectUri, code) {
  const oauth2Client = createOAuthClient(redirectUri);
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Get user info
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();

  return {
    tokens,
    profile: {
      googleId: userInfo.data.id,
      email: userInfo.data.email,
      name: userInfo.data.name,
      picture: userInfo.data.picture,
    },
  };
}

// =============================================================
// STEP 3: Store Tokens in DB
// =============================================================

async function saveGoogleTokens(userId, tokens, profile) {
  await query(
    `UPDATE users SET
      google_refresh_token = $1,
      google_access_token = $2,
      google_token_expiry = $3,
      google_email = $4,
      google_name = $5,
      google_picture = $6,
      google_connected = true,
      google_connected_at = NOW()
    WHERE id = $7`,
    [
      tokens.refresh_token || null,
      tokens.access_token || null,
      tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      profile.email,
      profile.name,
      profile.picture,
      userId,
    ]
  );
}

// =============================================================
// STEP 4: Get Valid Access Token (with auto-refresh)
// =============================================================

async function getValidAccessToken(userId) {
  const user = await query(
    'SELECT google_refresh_token, google_access_token, google_token_expiry FROM users WHERE id = $1',
    [userId]
  );

  if (user.length === 0 || !user[0].google_refresh_token) {
    return null; // Not connected
  }

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    refresh_token: user[0].google_refresh_token,
    access_token: user[0].google_access_token,
    expiry_date: user[0].google_token_expiry ? new Date(user[0].google_token_expiry).getTime() : null,
  });

  // Auto-refresh if expired
  if (oauth2Client.isTokenExpiring()) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      await query(
        'UPDATE users SET google_access_token = $1, google_token_expiry = $2 WHERE id = $3',
        [credentials.access_token, credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null, userId]
      );
      oauth2Client.setCredentials(credentials);
    } catch (err) {
      console.error('Token refresh failed for user', userId, err.message);
      return null;
    }
  }

  return oauth2Client;
}

// =============================================================
// Send Email as Connected Student
// =============================================================

async function sendEmailAsStudent(userId, { to, subject, body, cc, bcc }) {
  const auth = await getValidAccessToken(userId);
  if (!auth) throw new Error('Google not connected');

  const gmail = google.gmail({ version: 'v1', auth });

  // Build RFC 2822 email
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0',
  ];
  if (cc) headers.push(`Cc: ${cc}`);
  if (bcc) headers.push(`Bcc: ${bcc}`);

  const rawEmail = headers.join('\r\n') + '\r\n\r\n' + body;
  const encoded = Buffer.from(rawEmail).toString('base64url');

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  });

  return { messageId: result.data.id, threadId: result.data.threadId };
}

// =============================================================
// Create Calendar Event with Google Meet
// =============================================================

async function createCalendarEvent(userId, { summary, description, startDateTime, endDateTime, attendees, location }) {
  const auth = await getValidAccessToken(userId);
  if (!auth) throw new Error('Google not connected');

  const calendar = google.calendar({ version: 'v3', auth });

  const event = {
    summary,
    description,
    start: { dateTime: startDateTime, timeZone: 'America/New_York' },
    end: { dateTime: endDateTime, timeZone: 'America/New_York' },
    conferenceData: {
      createRequest: {
        requestId: `divinity-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    attendees: attendees?.map(email => ({ email })) || [],
  };

  if (location) event.location = location;

  const result = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: event,
    conferenceDataVersion: 1,
  });

  return {
    eventId: result.data.id,
    htmlLink: result.data.htmlLink,
    meetLink: result.data.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri,
    start: result.data.start,
    end: result.data.end,
  };
}

// =============================================================
// Get Free/Busy (for scheduling)
// =============================================================

async function getFreeBusy(userId, timeMin, timeMax) {
  const auth = await getValidAccessToken(userId);
  if (!auth) throw new Error('Google not connected');

  const calendar = google.calendar({ version: 'v3', auth });

  const user = await query('SELECT google_email FROM users WHERE id = $1', [userId]);
  const email = user[0]?.google_email;

  const result = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin || new Date().toISOString(),
      timeMax: timeMax || new Date(Date.now() + 14 * 86400000).toISOString(),
      items: [{ id: email || 'primary' }],
    },
  });

  return result.data.calendars;
}

// =============================================================
// Disconnect Google
// =============================================================

async function disconnectGoogle(userId) {
  await query(
    `UPDATE users SET
      google_refresh_token = NULL,
      google_access_token = NULL,
      google_token_expiry = NULL,
      google_email = NULL,
      google_name = NULL,
      google_picture = NULL,
      google_connected = false
    WHERE id = $1`,
    [userId]
  );
}

// =============================================================
// Check Connection Status
// =============================================================

async function getGoogleStatus(userId) {
  const user = await query(
    'SELECT google_connected, google_email, google_name, google_picture, google_connected_at FROM users WHERE id = $1',
    [userId]
  );
  if (user.length === 0) return null;
  return {
    connected: user[0].google_connected || false,
    email: user[0].google_email,
    name: user[0].google_name,
    picture: user[0].google_picture,
    connectedAt: user[0].google_connected_at,
  };
}

module.exports = {
  getAuthUrl,
  handleCallback,
  saveGoogleTokens,
  getValidAccessToken,
  sendEmailAsStudent,
  createCalendarEvent,
  getFreeBusy,
  disconnectGoogle,
  getGoogleStatus,
  SCOPES,
};
