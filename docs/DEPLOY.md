# SmartRec — Deployment & Handoff Guide

This guide takes you from zero to a live Shopify app in about 30 minutes.

---

## Prerequisites

- Node.js 20+
- A [Shopify Partners account](https://partners.shopify.com) (free)
- A [Railway account](https://railway.app) (free tier works for development)
- A PostgreSQL database (Railway provides one for free)
- Git + GitHub account

---

## Step 1 — Create the app on Shopify Partners

1. Log in to **partners.shopify.com**
2. Go to **Apps → Create app → Create app manually**
3. Name it "SmartRec"
4. Note down the **API key** and **API secret key** — you'll need these shortly
5. Under **App URL**, enter your Railway URL (e.g. `https://smartrec.up.railway.app`) — you can update this after deploying
6. Under **Allowed redirection URL(s)**, add:
   ```
   https://your-railway-url.up.railway.app/auth/callback
   ```

---

## Step 2 — Register webhooks on Shopify Partners

In your app's **Webhooks** section, register these endpoints:

| Event               | URL                                             |
|---------------------|-------------------------------------------------|
| `orders/create`     | `https://your-url/webhooks/orders/create`       |
| `products/update`   | `https://your-url/webhooks/products/update`     |
| `products/delete`   | `https://your-url/webhooks/products/delete`     |
| `app/uninstalled`   | `https://your-url/webhooks/app/uninstalled`     |

---

## Step 3 — Deploy to Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
3. Select your SmartRec repo
4. Add a **PostgreSQL** plugin (click "Add Service → PostgreSQL")
5. Set these environment variables in Railway:

```
SHOPIFY_API_KEY=       (from Step 1)
SHOPIFY_API_SECRET=    (from Step 1)
APP_URL=               (your Railway URL, e.g. https://smartrec.up.railway.app)
SESSION_SECRET=        (any random 32+ char string — use: openssl rand -hex 32)
DATABASE_URL=          (auto-provided by Railway as ${{Postgres.DATABASE_URL}})
NODE_ENV=production
PORT=3000
```

6. Deploy. Railway will run:
   ```
   cd backend && npm run db:migrate && npm start
   ```

---

## Step 4 — Build & serve the frontend

The React admin frontend needs to be built and served by the Express backend.

Add this to `backend/src/index.ts` (already included in the template):
```typescript
app.use(express.static(path.join(__dirname, '../../frontend/dist')));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/auth') && !req.path.startsWith('/webhooks')) {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  }
});
```

Build step (add to `railway.json` build command):
```
npm install && cd frontend && npm install && npm run build && cd ../backend && npm install && npm run build
```

---

## Step 5 — Install in a development store

1. In Shopify Partners, go to **Stores → Create development store**
2. Go to your app → **Test your app → Select store**
3. You'll be redirected to the OAuth flow — approve it
4. The app is now installed and the initial sync will run in the background

---

## Step 6 — Add the widget to the theme

1. In the development store, go to **Online Store → Themes → Customize**
2. Open a **Product** page template
3. Click **Add section** → search for "SmartRec"
4. Add **SmartRec Recommendations** and position it below the product description
5. Save

After recommendations compute (next day, or click "Refresh" in the admin), the widget will show live.

---

## Ongoing maintenance

| Task | How |
|------|-----|
| Check logs | Railway dashboard → Deployments → View logs |
| Monitor DB | `npx prisma studio` (run locally with `DATABASE_URL` set) |
| Run rec job manually | POST `/api/sync` with a valid session, or via the Dashboard |
| Add a new plan tier | Edit `billingService.ts` + `BillingPage.tsx` + Prisma enum |
| Update recommendation algorithm | Edit `backend/src/jobs/recommendationJob.ts` |
| Change widget appearance | Edit `extensions/smartrec-widget/blocks/recommendations.liquid` |

---

## Architecture overview

```
smartrec/
├── backend/                     Node.js + Express API
│   ├── src/
│   │   ├── index.ts             Entry point
│   │   ├── routes/
│   │   │   ├── auth.ts          Shopify OAuth flow
│   │   │   ├── api.ts           Authenticated admin API
│   │   │   ├── public.ts        Unauthenticated storefront API
│   │   │   └── webhooks.ts      Shopify webhook handlers
│   │   ├── services/
│   │   │   ├── shopify.ts       Shopify API client
│   │   │   ├── sessionStorage.ts Prisma-backed session storage
│   │   │   ├── syncService.ts   Product + order sync
│   │   │   └── billingService.ts Shopify Billing API
│   │   ├── jobs/
│   │   │   ├── index.ts         Cron job scheduler
│   │   │   └── recommendationJob.ts  ⭐ The engine
│   │   ├── middleware/
│   │   │   ├── requireShop.ts   Auth middleware
│   │   │   └── errorHandler.ts
│   │   └── utils/
│   │       ├── db.ts            Prisma singleton
│   │       └── logger.ts        Winston logger
│   └── prisma/
│       └── schema.prisma        Database schema
│
├── frontend/                    React + Shopify Polaris admin
│   └── src/
│       ├── App.tsx              Router + nav
│       ├── pages/
│       │   ├── DashboardPage.tsx
│       │   ├── AnalyticsPage.tsx
│       │   ├── SettingsPage.tsx
│       │   └── BillingPage.tsx
│       └── hooks/
│           └── useApi.ts        Authenticated fetch wrapper
│
├── extensions/
│   └── smartrec-widget/
│       └── blocks/
│           └── recommendations.liquid  ⭐ Storefront widget
│
├── .env.example
├── railway.json
└── docs/
    └── DEPLOY.md               (this file)
```

---

## Environment variables reference

| Variable | Description |
|----------|-------------|
| `SHOPIFY_API_KEY` | From Shopify Partners app setup |
| `SHOPIFY_API_SECRET` | From Shopify Partners app setup |
| `APP_URL` | Full public URL of your deployment, no trailing slash |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Random 32+ char secret for signing cookies |
| `NODE_ENV` | `production` on Railway, `development` locally |
| `PORT` | Default `3000` |
