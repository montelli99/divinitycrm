# Student CRM Platform

Standalone hosted CRM for AI REI students. No Telegram, no GHL, no JustCall.

## Stack
- **Database:** Neon (serverless Postgres)
- **Backend:** Express.js on Render
- **Frontend:** React + Vite
- **Auth:** Clerk
- **E-signing:** RabbitSign API

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

### 3. Backend
```bash
cd backend
cp .env.example .env
# Fill in DATABASE_URL, CLERK_SECRET_KEY, RABBITSIGN_API_KEY
npm install
npm run dev
```

### 4. Frontend
```bash
cd frontend
cp .env.example .env
# Fill in VITE_CLERK_PUBLISHABLE_KEY
npm install
npm run dev
```

### 5. RabbitSign (optional)
1. Create a RabbitSign account at [rabbitsign.com](https://rabbitsign.com)
2. Go to My Account → Developer API → Generate API Key
3. Add to backend `.env` as `RABBITSIGN_API_KEY`
4. Set webhook URL to `[YOUR_URL]/api/webhooks/rabbitsign`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check |
| GET | /api/leads | List leads |
| GET | /api/leads/:id | Get lead + history + reminders |
| POST | /api/leads | Create lead |
| PATCH | /api/leads/:id | Update lead |
| DELETE | /api/leads/:id | Delete lead |
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

## Deploy

### Backend (Render)
1. Create a new Web Service on Render
2. Connect to this repo
3. Build command: `cd backend && npm install`
4. Start command: `cd backend && node src/index.js`
5. Add environment variables from `.env.example`

### Frontend (Vercel or Render Static)
1. Build: `cd frontend && npm run build`
2. Deploy the `dist/` folder
3. Set `VITE_CLERK_PUBLISHABLE_KEY` in environment

## Cost
- Neon: $0 (free tier, 0.5GB)
- Render: $0 (free tier, sleeps after inactivity)
- Clerk: $0 (free tier, 10K MAUs)
- RabbitSign: $0.10/envelope (free for manual use)
- **Total: $0/month + $0.10/signing**
