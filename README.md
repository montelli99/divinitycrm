# Divinity CRM Platform

Standalone hosted CRM for AI REI students. No Telegram, no GHL, no JustCall.

## Stack
- **Database:** Neon (serverless Postgres)
- **Backend:** Express.js on Render
- **Frontend:** React + Vite on Render
- **Auth:** Clerk
- **E-signing:** RabbitSign API
- **All hosting:** Render (backend + frontend, same provider)

## Quick Start

### 1. Database (Neon)
1. Create a Neon project at [neon.tech](https://neon.tech)
2. Copy the connection string
3. Run the schema: `psql [connection_string] -f backend/src/db/schema.sql`
   Or paste `schema.sql` into the Neon SQL Editor

### 2. Auth (Clerk)
1. Create a Clerk app at [clerk.com](https://clerk.com)
2. Get your Secret Key and Publishable Key
3. Set up a webhook endpoint pointing to `[YOUR_URL]/api/webhooks/clerk`
4. Subscribe to events: `user.created`, `user.updated`, `user.deleted`

### 3. RabbitSign (optional, for e-signing)
1. Create a RabbitSign account at [rabbitsign.com](https://rabbitsign.com)
2. Go to My Account → Developer API → Generate API Key
3. Set webhook URL to `[YOUR_URL]/api/webhooks/rabbitsign`

## Deploy (All on Render — no Vercel)

### Step 1: Backend (Web Service)
1. Go to [dashboard.render.com](https://dashboard.render.com) → New → Web Service
2. Connect `montelli99/divinitycrm` repo
3. Configure:
   | Field | Value |
   |-------|-------|
   | Name | `divinitycrm-api` |
   | Root Directory | `backend` |
   | Build Command | `npm install` |
   | Start Command | `node src/index.js` |
   | Instance Type | Free |
4. Add environment variables from `SECRETS.env`:
   - `DATABASE_URL`
   - `CLERK_SECRET_KEY`
   - `CLERK_PUBLISHABLE_KEY`
   - `CLERK_WEBHOOK_SECRET`
   - `RABBITSIGN_API_KEY` (when you have it)
   - `PORT=3001`
   - `NODE_ENV=production`
   - `FRONTEND_URL=https://divinitycrm-ggi5.onrender.com`
5. Click **Deploy Web Service**
6. Copy the deployed URL (e.g. `https://divinitycrm-ggi5.onrender.com/api`)
7. Go to [Clerk Dashboard → Webhooks](https://dashboard.clerk.com) → update the webhook URL to `https://divinitycrm-ggi5.onrender.com/api/api/webhooks/clerk`

### Step 2: Frontend (Static Site)
1. Go to [dashboard.render.com](https://dashboard.render.com) → New → Static Site
2. Connect `montelli99/divinitycrm` repo
3. Configure:
   | Field | Value |
   |-------|-------|
   | Name | `divinitycrm` |
   | Root Directory | `frontend` |
   | Build Command | `npm install && npm run build` |
   | Publish Directory | `dist` |
   | Instance Type | Free |
4. Add environment variable:
   - `VITE_CLERK_PUBLISHABLE_KEY` (same as backend)
5. Click **Deploy Static Site**
6. The frontend will be live at `https://divinitycrm-ggi5.onrender.com`

### Step 3: Update Frontend .env
1. In the backend Render dashboard → Settings → Environment Variables
2. Update `FRONTEND_URL` to the actual frontend URL from Step 2
3. Redeploy backend (Render auto-redeploys on env var changes)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check |
| GET | /api/leads | List leads |
| GET | /api/leads/:id | Get lead + history + reminders |
| POST | /api/leads | Create lead |
| PATCH | /api/leads/:id | Update lead |
| DELETE | /api/leads/:id | Delete lead |
| POST | /api/leads/:id/advance | Advance stage with automations |
| GET | /api/leads/:id/transitions | Get available next stages |
| POST | /api/leads/:id/reminders | Add reminder |
| GET | /api/pipeline | Full pipeline view + health scan |
| GET | /api/pipeline/today | Today's tasks + follow-ups |
| GET | /api/pipeline/stats | Pipeline statistics |
| GET | /api/contracts/clauses | All 31 clauses |
| POST | /api/contracts/generate | Generate contract package |
| POST | /api/contracts/send-rabbitsign | Send to RabbitSign |
| GET | /api/scripts | Script templates |
| POST | /api/scripts/fill | Fill script with lead data |
| GET | /api/users/me | Current user profile |
| POST | /api/webhooks/clerk | Clerk user sync |
| POST | /api/webhooks/rabbitsign | RabbitSign completion |

## Cost
- Neon: $0 (free tier, 0.5GB)
- Render: $0 (free tier, both backend + frontend)
- Clerk: $0 (free tier, 10K MAUs)
- RabbitSign: $0.10/envelope (free for manual use)
- **Total: $0/month + $0.10/signing**
