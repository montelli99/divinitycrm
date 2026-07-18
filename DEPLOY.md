# DEPLOY CHECKLIST — Divinity CRM on Render

## Backend (Web Service)
1. You're already on Render → New Web Service → divinitycrm repo selected
2. Set these fields:
   - Name: **divinitycrm-api**
   - Root Directory: **backend**
   - Build Command: **npm install**
   - Start Command: **node src/index.js**
   - Instance Type: **Free**
3. Click "Add from .env" button under Environment Variables
4. Paste this block:

```
DATABASE_URL=REPLACE_WITH_NEON_CONNECTION_STRING
CLERK_SECRET_KEY=sk_test_i0i3s2Jq3F8WMCB0u11D
CLERK_PUBLISHABLE_KEY=pk_test_bHVja3ktZG9lLTY4LmNsZXJrLmFjY291bnRzLmRldiQ
CLERK_WEBHOOK_SECRET=whsec_nv8gVceMoP+2zvO9Q9J85eRQYUyGsx2a
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://divinitycrm-ggi5.onrender.com
```

5. Click **Deploy Web Service**
6. Wait for deploy (~5 min), then copy the URL (e.g. `https://divinitycrm-ggi5.onrender.com/api`)
7. Go to Clerk Dashboard → Webhooks → update endpoint to `https://divinitycrm-ggi5.onrender.com/api/api/webhooks/clerk`

## Frontend (Static Site)
1. Render → New → Static Site
2. Connect `montelli99/divinitycrm` repo
3. Set these fields:
   - Name: **divinitycrm**
   - Root Directory: **frontend**
   - Build Command: **npm install && npm run build**
   - Publish Directory: **dist**
   - Instance Type: **Free**
4. Add environment variable:
   - VITE_CLERK_PUBLISHABLE_KEY: **pk_test_bHVja3ktZG9lLTY4LmNsZXJrLmFjY291bnRzLmRldiQ**
   - VITE_API_BASE: **https://divinitycrm-ggi5.onrender.com/api/api**
5. Click **Deploy Static Site**

## After Deploy
- Frontend URL: https://divinitycrm-ggi5.onrender.com
- Sign in with: montelliscottrei@gmail.com
- Backend health check: https://divinitycrm-ggi5.onrender.com/api/api/health

## Cost
- $0/month (all free tiers)
- Only RabbitSign costs money ($0.10/envelope)
