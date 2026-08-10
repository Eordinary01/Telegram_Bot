# Production Deployment Guide — Render Free Web Service (No Credit Card)

This guide details how to deploy the entire backend (API + BullMQ Worker + Telegram Bot + Health Metrics) to **Render for FREE without entering any payment method or credit card**.

---

## 🏗️ 100% Free Production Architecture (No Card Required)

```
+-----------------------------------------------------------------------------------+
|                                  USER / BROWSER                                   |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
                      +-------------------------------------+
                      |               Vercel                |  (100% Free CDN)
                      |          (@jecrc/web UI)            |
                      +-------------------------------------+
                                         |
                                         | API & SSE Stream
                                         v
                      +-------------------------------------+
                      |          Render Web Service         |  (100% Free Web Service,
                      |     jecrc-mail-backend (API+Worker) |   NO Payment Method)
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

## Step 1: Database Setup — Neon.tech (PostgreSQL)

1. Database is hosted on [neon.tech](https://neon.tech).
2. Connection string format:
   ```env
   DATABASE_URL="postgresql://<user>:<password>@<ep-id>.neon.tech/neondb?sslmode=require"
   ```
3. Schema status: **Already synchronized** (`npx prisma@6.12.0 db push`).

---

## Step 2: Queue Broker Setup — Upstash Redis

1. Redis is hosted on [upstash.com](https://upstash.com).
2. Connection string format:
   ```env
   REDIS_URL="rediss://default:<password>@<your-upstash-host>.upstash.io:6379"
   ```

---

## Step 3: Backend Deployment — Render (1 Free Web Service, No Credit Card Required)

Because creating a "Blueprint" or "Background Worker" service on Render prompts for a credit card, we deploy the complete backend (API + BullMQ Worker + Telegram Bot) inside a **single Free Web Service**. Render Web Services are **100% Free and require NO payment method**.

### Manual Setup on Render (Step-by-Step)

1. Log into **[dashboard.render.com](https://dashboard.render.com)**.
2. Click **New +** ➔ **Web Service**.
3. Select **Build and deploy from a Git repository** and connect your GitHub repo: `Eordinary01/Telegram_Bot`.
4. Configure the Web Service settings:
   * **Name**: `jecrc-mail-backend`
   * **Language**: `Docker`
   * **Branch**: `main`
   * **Dockerfile Path**: `apps/api/Dockerfile`
   * **Docker Context**: `.`
   * **Instance Type**: **Free** ($0 / mo)
5. Add the following **Environment Variables**:

| Variable | Value / Description |
|---|---|
| `SERVICE` | `api` |
| `NODE_ENV` | `production` |
| `API_HOST` | `0.0.0.0` |
| `API_PORT` | `3000` |
| `ALLOWED_SENDER_DOMAIN` | `jecrcu.edu.in` |
| `DATABASE_URL` | Your Neon Postgres URL (`postgresql://...`) |
| `REDIS_URL` | Your Upstash Redis URL (`rediss://...`) |
| `GOOGLE_CLIENT_ID` | Your Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Your Google OAuth Client Secret |
| `GOOGLE_REDIRECT_URI` | `https://jecrc-mail-backend.onrender.com/auth/google/callback` |
| `ENCRYPTION_KEY` | Your 64-character hex key |
| `JWT_SECRET` | Your secure random JWT secret |
| `JWT_EXPIRES_IN` | `24h` |
| `TELEGRAM_BOT_TOKEN` | Token from `@BotFather` |
| `WEB_ORIGIN` | `https://<your-vercel-app>.vercel.app` |

6. Click **Create Web Service**.
Render will build the Docker container and start your complete backend (Express API, BullMQ Worker, and Telegram Bot) in 1 Free Web Service!

---

## Step 4: Web Dashboard Deployment — Vercel

1. Import your GitHub repository to [Vercel](https://vercel.com).
2. Set Root Directory: `apps/web` (or root with workspace build).
3. Build Command: `pnpm --filter @jecrc/web build`
4. Output Directory: `dist`
5. Add Environment Variable:
   ```env
   VITE_API_URL=https://jecrc-mail-backend.onrender.com
   ```

---

## Step 5: Update OAuth Redirect URI

1. In **Google Cloud Console**:
   * Authorized Redirect URI: `https://jecrc-mail-backend.onrender.com/auth/google/callback`
   * Authorized JavaScript Origin: `https://<your-vercel-app>.vercel.app`
