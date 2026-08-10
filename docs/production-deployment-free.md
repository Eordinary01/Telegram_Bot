# 100% Free Production Deployment Guide — JECRC Mail Priority Sync

Since Render account limits have been exceeded, this guide outlines the **100% Free Tier Production Deployment Architecture** for the JECRC Mail Priority Sync System using top-tier free services.

---

## 🏗️ 100% Free Architecture Overview

```
+-----------------------------------------------------------------------------------+
|                                  USER / BROWSER                                   |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
                      +-------------------------------------+
                      |      Vercel / Cloudflare Pages      |  (Free Static CDN)
                      |          (@jecrc/web UI)            |
                      +-------------------------------------+
                                         |
                                         | API Calls & SSE Feed
                                         v
                      +-------------------------------------+
                      |             Koyeb / Fly.io          |  (Free Container Hosting)
                      |     @jecrc/api   |  @jecrc/worker   |
                      +-------------------------------------+
                                 /                \
                                /                  \
                               v                    v
          +-------------------------+          +-------------------------+
          |       Neon.tech         |          |      Upstash Redis      |
          |  (Free Managed Postgres)|          |   (Free Managed Redis)  |
          +-------------------------+          +-------------------------+
```

---

## Step 1: Managed Database — Neon.tech (PostgreSQL)

1. Sign up at [neon.tech](https://neon.tech) (Free Tier, 0.5 GB storage, no credit card required).
2. Create a new project: `jecrc-mail-priority`.
3. Copy your Pooled & Direct PostgreSQL Connection String:
   ```
   DATABASE_URL="postgresql://<user>:<password>@<ep-id>.neon.tech/neondb?sslmode=require"
   ```
4. Run schema migrations locally against your Neon DB:
   ```bash
   DATABASE_URL="postgresql://<user>:<password>@<ep-id>.neon.tech/neondb?sslmode=require" pnpm prisma db push
   ```

---

## Step 2: Managed Redis — Upstash Redis

1. Sign up at [upstash.com](https://upstash.com) (Free Tier, 10,000 commands/day).
2. Create a Redis Database: `jecrc-redis`.
3. Copy the **Redis Connection String (TLS URL)**:
   ```
   REDIS_URL="rediss://default:<password>@<your-upstash-host>.upstash.io:6379"
   ```

---

## Step 3: Web Dashboard — Vercel / Cloudflare Pages

1. Import your GitHub repository to [Vercel](https://vercel.com).
2. Set Framework Preset: **Vite**.
3. Set Root Directory: `apps/web` (or root with build command).
4. Build Command: `pnpm --filter @jecrc/web build`
5. Output Directory: `dist`
6. Add Environment Variable:
   ```env
   VITE_API_URL=https://<your-koyeb-api-url>.koyeb.app
   ```

---

## Step 4: Backend API & Worker — Koyeb / Fly.io

### Option A: Koyeb (Recommended Free PaaS)
1. Sign up at [koyeb.com](https://www.koyeb.com).
2. Create a **Web Service** from GitHub repo:
   - **Docker context**: Root `.`
   - **Dockerfile**: `apps/api/Dockerfile`
   - **Port**: `3000`
   - **Service 1 (API)**: Set `SERVICE=api`
   - **Service 2 (Worker)**: Create a 2nd service with `SERVICE=worker` (Port non-exposed).
3. Set Environment Variables for both services:
   ```env
   NODE_ENV=production
   ALLOWED_SENDER_DOMAIN=jecrcu.edu.in
   DATABASE_URL=postgresql://... (from Neon)
   REDIS_URL=rediss://... (from Upstash)
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=https://<your-koyeb-api-url>.koyeb.app/auth/google/callback
   ENCRYPTION_KEY=<64 hex chars>
   JWT_SECRET=<secure random string>
   JWT_EXPIRES_IN=24h
   TELEGRAM_BOT_TOKEN=...
   WEB_ORIGIN=https://<your-vercel-app>.vercel.app
   ```

### Option B: Oracle Cloud Infrastructure (OCI) Always Free VM
1. Provision a free `VM.Standard.A1.Flex` (4 ARM vCPUs, 24 GB RAM) on Oracle Cloud.
2. Install Docker & Docker Compose.
3. Clone repository and set `.env`.
4. Run `docker compose up -d` to run the entire stack (Postgres, Redis, API, Worker, Web) 100% free on a single dedicated VM forever!

---

## Step 5: Update OAuth & Telegram Webhook Settings

1. **Google Cloud Console**:
   - Authorized Javascript Origin: `https://<your-vercel-app>.vercel.app`
   - Authorized Redirect URI: `https://<your-koyeb-api-url>.koyeb.app/auth/google/callback`
2. **Telegram Bot**:
   - Set bot domain / auth callback domain in `@BotFather` if using login widget.

---

## ⚡ Quick Checklist Before Launching

- [x] Prisma database schema pushed to Neon (`pnpm prisma db push`)
- [x] Upstash Redis URL uses `rediss://` (TLS enabled)
- [x] `ENCRYPTION_KEY` is a valid 64-character hexadecimal string
- [x] `WEB_ORIGIN` matches the exact deployed frontend URL (for CORS and SSE)
- [x] `VITE_API_URL` set in Vercel before triggering frontend build
