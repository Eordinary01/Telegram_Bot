# JECRC Mail Priority Sync — Architecture & Flow Guide

> Complete system architecture, component responsibilities, and data flow documentation.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Project Structure](#2-project-structure)
3. [Data Flow: Email Arrival to Notification](#3-data-flow-email-arrival-to-notification)
4. [Packages & Responsibilities](#4-packages--responsibilities)
5. [API Endpoints](#5-api-endpoints)
6. [Worker Processors](#6-worker-processors)
7. [Telegram Bot](#7-telegram-bot)
8. [Database Schema](#8-database-schema)
9. [Authentication Flow](#9-authentication-flow)
10. [Real-Time Updates (SSE)](#10-real-time-updates-sse)
11. [Priority Scoring Engine](#11-priority-scoring-engine)
12. [External Integrations](#12-external-integrations)
13. [Deployment](#13-deployment)
14. [Key File Reference](#14-key-file-reference)

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           JECRC Mail Priority Sync                         │
│                                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────────────┐  │
│  │  Gmail   │───>│  Pub/Sub │───>│   API    │───>│  Worker (BullMQ)     │  │
│  │  Inbox   │    │  Push    │    │  Server  │    │  ┌────────────────┐  │  │
│  │          │    │          │    │ (Express)│    │  │ email-sync     │  │  │
│  │          │    │          │    │          │    │  │ email-rescan   │  │  │
│  │          │    │          │    │          │    │  │ reminder-check │  │  │
│  └──────────┘    └──────────┘    └────┬─────┘    │  └───────┬────────┘  │  │
│                                       │          └──────────┼───────────┘  │
│                                       │                     │              │
│                              ┌────────▼─────────────────────▼────────┐    │
│                              │           PostgreSQL (Neon)           │    │
│                              │         + Redis (Upstash)             │    │
│                              └───────────────────────────────────────┘    │
│                                       │                     │              │
│                              ┌────────▼─────┐    ┌─────────▼──────────┐  │
│                              │  Dashboard   │    │  Telegram Bot      │  │
│                              │  (React/Vite)│    │  (Telegraf)        │  │
│                              │  + SSE       │    │  + Push + Buttons  │  │
│                              └──────────────┘    └────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**What it does:** Syncs Gmail in real-time for university students, filters to only `@university.edu.in` emails, scores by priority using a rule engine, and pushes high-priority mail to Telegram + a live dashboard.

---

## 2. Project Structure

```
gmail_automation_bot/
├── apps/
│   ├── api/                    # Express REST API + Telegram bot + optional embedded worker
│   │   ├── src/
│   │   │   ├── index.ts        # Entry: starts API server, Telegram bot, embedded worker
│   │   │   ├── app.ts          # Express app setup, CORS, routes, middleware
│   │   │   ├── events.ts       # SSE EventBroadcaster (EventEmitter)
│   │   │   ├── middleware/
│   │   │   │   └── require-auth.ts    # JWT auth middleware (Bearer + ?token=)
│   │   │   └── routes/
│   │   │       ├── auth.ts     # Google OAuth flow + /auth/me
│   │   │       ├── sync.ts     # Manual sync trigger
│   │   │       ├── webhooks.ts # Pub/Sub push receiver
│   │   │       ├── telegram.ts # Telegram linking endpoints
│   │   │       ├── emails.ts   # Email list, stats, SSE stream, CRUD
│   │   │       ├── rules.ts    # Custom priority rules CRUD + re-scan
│   │   │       └── metrics.ts  # System health metrics
│   │   └── test/               # API test suites
│   │
│   ├── worker/                 # BullMQ queue workers
│   │   └── src/
│   │       ├── index.ts        # Worker entry: 3 workers + crons
│   │       └── processors/
│   │           ├── email-sync.ts      # Main sync processor
│   │           ├── email-rescan.ts    # Re-score after rule changes
│   │           └── reminder-check.ts  # Escalating reminder cron
│   │
│   └── web/                    # React/Vite SPA dashboard
│       └── src/
│           ├── main.tsx        # Dashboard: login, email cards, rules, SSE
│           └── lib/
│               └── api.ts      # API client with JWT + stream URL helper
│
├── packages/
│   ├── auth/                   # Authentication & encryption
│   │   └── src/
│   │       ├── google-oauth.ts # OAuth2 client, code exchange, token refresh
│   │       ├── encryption.ts   # AES-256-GCM encrypt/decrypt
│   │       ├── jwt.ts          # signAuthToken / verifyAuthToken
│   │       └── user-service.ts # createOrUpdateUserFromOAuth, getAccessTokenForUser
│   │
│   ├── config/                 # Environment config (Zod-validated)
│   │   └── src/index.ts
│   │
│   ├── database/               # Prisma ORM + PostgreSQL
│   │   ├── prisma/schema.prisma
│   │   └── src/index.ts        # getPrismaClient (with pool params)
│   │
│   ├── gmail/                  # Gmail API integration
│   │   └── src/
│   │       ├── history.ts      # fetchHistoryChanges, fetchMessage, storeMessage, extractBodyText
│   │       └── watch.ts        # registerWatch, stopWatch, getExpiringWatches
│   │
│   ├── observability/          # Pino logger with redaction
│   │   └── src/index.ts
│   │
│   ├── queue/                  # BullMQ job types + Redis connection
│   │   └── src/
│   │       ├── jobs.ts         # Job type definitions + QueueNames
│   │       └── index.ts        # Redis client factory + connection utils
│   │
│   ├── scoring/                # Priority scoring engine
│   │   └── src/
│   │       ├── scoring-engine.ts  # scoreEmail, loadSenderRules, loadKeywordRules
│   │       ├── domain-filter.ts   # extractSenderDomain, isAllowedSender
│   │       ├── deadline.ts        # extractDeadline, generateGoogleCalendarUrl
│   │       └── seed-rules.ts      # Global seed rules (22 keywords + 5 senders)
│   │
│   ├── shared/                 # Shared utilities
│   │   └── src/index.ts
│   │
│   └── telegram/               # Telegram bot + notifications
│       └── src/
│           ├── bot.ts          # Telegraf bot commands + callback handlers
│           ├── push.ts         # pushScoredEmail, pushReminder, sendTelegramMessage
│           └── linking.ts      # generateLinkingCode, validateAndLink
│
├── docker-compose.yml          # Production: postgres, redis, api, worker, web
├── ARCHITECTURE.md             # This file
└── CONTEXT.md                  # Session memory & phase tracking
```

---

## 3. Data Flow: Email Arrival to Notification

### Path A: Real-time (Pub/Sub Push) — Production Path

```
┌─────────┐     ┌───────────┐     ┌──────────┐     ┌──────────────┐
│  Gmail  │────>│ Google    │────>│ POST     │────>│ Worker       │
│  Inbox  │     │ Pub/Sub   │     │ /webhooks│     │ email-sync   │
│         │     │ Topic     │     │ /gmail   │     │ processor    │
└─────────┘     └───────────┘     └──────────┘     └──────┬───────┘
                                                           │
                    ┌──────────────────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────────────────┐
    │ 1. Look up user by email address              │
    │ 2. Decrypt refresh token → get access token   │
    │ 3. fetchHistoryChanges(lastHistoryId)          │
    │ 4. For each new message:                       │
    │    a. fetchMessage() → headers + MIME body     │
    │    b. storeMessage() → upsert in DB            │
    │    c. extractSenderDomain() → domain gate      │
    │    d. scoreEmail() → priority score            │
    │    e. extractDeadline() → calendar URL         │
    │    f. pushScoredEmail() → Telegram (async)     │
    │ 5. Update syncState with latest historyId      │
    │ 6. Broadcast SSE event → Dashboard updates     │
    └───────────────────────────────────────────────┘
```

### Path B: Manual Sync (Dashboard Button)

```
Dashboard "Sync Now" → POST /sync → validate JWT + ≥3 rules
    → Enqueue EMAIL_SYNC job (triggerSource: 'manual')
    → Same worker flow as Path A
```

### Path C: Auto-Sync (Background Cron)

```
Worker runs every 5 minutes:
    → Query users with gmailTokens + ≥1 active rule
    → Enqueue EMAIL_SYNC job for each (deduped by jobId)
    → Same worker flow as Path A
```

### Path D: Rule Change → Re-Score

```
User creates/updates/deletes rule → POST/PATCH/DELETE /rules
    → Auto-enqueue EMAIL_RESCAN job
    → email-rescan worker:
        1. Load all user emails
        2. Backfill missing body text from Gmail API
        3. Re-score all emails in batches of 10
        4. Update scores + deadlines
```

---

## 4. Packages & Responsibilities

| Package | npm Name | Purpose |
|---------|----------|---------|
| `packages/config` | `@jecrc/config` | Zod-validated env vars, typed `AppConfig` |
| `packages/database` | `@jecrc/database` | Prisma client, PostgreSQL schema, connection pooling |
| `packages/auth` | `@jecrc/auth` | Google OAuth2, AES-256-GCM encryption, JWT signing/verification |
| `packages/gmail` | `@jecrc/gmail` | Gmail API: history sync, message fetch, MIME parsing, watch registration |
| `packages/scoring` | `@jecrc/scoring` | Priority scoring engine, domain filter, deadline extractor, seed rules |
| `packages/queue` | `@jecrc/queue` | BullMQ job types, Redis connection factory, queue names |
| `packages/telegram` | `@jecrc/telegram` | Telegraf bot, push notifications, inline buttons, account linking |
| `packages/observability` | `@jecrc/observability` | Pino logger with sensitive key redaction |
| `packages/shared` | `@jecrc/shared` | Shared utilities (minimal) |

### Dependency Graph

```
config ─────────────────────────────────────────────────┐
database ───────────────────────────────────────────────┤
auth ──────────> config, database                       ├──> apps/api
gmail ─────────> config, database, auth                 ├──> apps/worker
scoring ───────> database                               ├──> apps/web
queue ─────────> config                                 │
telegram ──────> config, database, scoring              │
observability ─> (standalone)                           │
```

---

## 5. API Endpoints

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health/live` | No | Liveness probe — always 200 |
| `GET` | `/health/ready` | No | Readiness probe — checks Postgres + Redis |
| `GET` | `/health/metrics` | Yes | Queue counts, DB counts, memory, uptime |

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/auth/google` | No | Redirects to Google OAuth consent screen |
| `GET` | `/auth/google/callback` | No | Handles code exchange, creates user, signs JWT, returns HTML redirect |
| `GET` | `/auth/me` | Yes | Returns authenticated user info |

### Sync

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/sync` | Yes | Manual sync trigger (requires ≥3 custom rules) |
| `GET` | `/sync/status/:jobId` | Yes | Job state, progress, result |

### Webhooks

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/webhooks/gmail` | No | Pub/Sub push receiver — decodes notification, enqueues sync |

### Telegram

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/telegram/link` | Yes | Generate 8-char linking code (15min TTL) |
| `GET` | `/telegram/link` | Yes | Get linking status |
| `DELETE` | `/telegram/link` | Yes | Unlink Telegram |

### Emails

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/emails` | Yes | Paginated list with priority filter + text search |
| `GET` | `/emails/stats` | Yes | Dashboard stats (30s cache) |
| `GET` | `/emails/stream` | Yes | SSE real-time feed (30s heartbeat) |
| `GET` | `/emails/action-required` | Yes | Notified-but-unacknowledged emails |
| `PATCH` | `/emails/:id/read` | Yes | Mark email as read |
| `PATCH` | `/emails/:id/acknowledge` | Yes | Acknowledge — stops reminders |
| `POST` | `/emails/inject-test` | Dev | Inject test email |
| `DELETE` | `/emails/clear-test` | Dev | Clear test emails |

### Rules

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/rules` | Yes | List all rules (user + global) |
| `POST` | `/rules` | Yes | Create keyword/sender rule (auto-enqueues rescan) |
| `POST` | `/rules/re-scan` | Yes | Manual re-score trigger |
| `PATCH` | `/rules/:id` | Yes | Update rule impact/active (auto-enqueues rescan) |
| `DELETE` | `/rules/:id` | Yes | Delete rule (auto-enqueues rescan) |

---

## 6. Worker Processors

### Worker Entry (`apps/worker/src/index.ts`)

```
Starts:
├── emailSyncWorker    (concurrency: 5, blockingConnection: true)
├── reminderCheckWorker (concurrency: 1, blockingConnection: true)
├── emailRescanWorker  (concurrency: 2, blockingConnection: true)
├── reminderQueue      (cron: every 30 min, removes stale schedulers on startup)
└── autoSync           (every 5 min, only users with active rules + tokens)
```

### email-sync Processor

```
Trigger: webhook | manual | renewal | cron
Queue: email-sync
Concurrency: 5

Flow:
  1. Load user + syncState + gmailTokens from DB
  2. Skip if no active rules (count < 1)
  3. Get fresh access token (decrypt → refresh → update)
  4. fetchHistoryChanges(lastHistoryId) → new message IDs
  5. Fallback: fetchRecentMessages() if history empty
  6. Batch-fetch existing emails (single DB query, avoid N+1)
  7. Pre-load sender + keyword rules once
  8. For each message:
     ├─ Skip if already exists in DB (already scored)
     ├─ fetchMessage() → GmailMessage with headers + MIME body
     ├─ storeMessage() → upsert in Email table
     ├─ scoreEmail() → domain gate + rule scoring
     ├─ extractDeadline() → regex deadline + calendar URL
     ├─ Update email record with score + deadline
     └─ pushScoredEmail() → Telegram notification (non-blocking)
  9. Update syncState with latest historyId
```

### email-rescan Processor

```
Trigger: rule create/patch/delete (auto-enqueued) or manual POST /rules/re-scan
Queue: email-rescan
Concurrency: 2

Flow:
  1. Load all user emails from DB
  2. Pre-load latest sender + keyword rules
  3. Backfill missing bodyText (batch fetch from Gmail, 10 concurrent)
  4. Re-score all emails in batches of 10
  5. Update score + deadline for each
  6. Persist deadlines for non-domain emails (e.g. NPTEL notices)
```

### reminder-check Processor

```
Trigger: Cron every 30 minutes
Queue: reminder-check
Concurrency: 1

Escalation schedule:
  reminderCount 0 → first reminder after 5 min
  reminderCount 1 → second reminder after 10 min  (URGENT)
  reminderCount 2 → final reminder after 15 min    (FINAL)
  Max: 3 reminders per email

Flow:
  1. Find: notifiedAt IS NOT NULL
          AND acknowledgedAt IS NULL
          AND reminderCount < 3
          AND priorityLabel IN (HIGH, MEDIUM)
  2. Skip snoozed emails (snoozedUntil > now)
  3. Clear expired snooze
  4. Check time since last notification vs escalation interval
  5. pushReminder() → Telegram with escalating urgency
  6. Increment reminderCount, update notifiedAt
```

---

## 7. Telegram Bot

### Commands

| Command | Description |
|---------|-------------|
| `/start <CODE>` | Links Telegram chat to JECRC Mail account |
| `/help` | Lists all available commands |
| `/status` | Shows linked email + chat ID |
| `/recent` | Top 5 recent emails with priority emoji |
| `/deadlines` | Upcoming deadlines with "Add to Calendar" links |
| `/digest` | Summary: unread count, high priority, top urgent items |

### Smart Notification Buttons

```
Row 1: [✅ Acknowledge]  [⏰ Snooze ▾]
Row 2: [🚫 Not Interested]  [📅 Add to Calendar] (if deadline exists)
```

### Callback Handlers

| Callback | Action |
|----------|--------|
| `acknowledge:<id>` | Sets `acknowledgedAt`, marks read, stops reminders |
| `snooze_menu:<id>` | Shows snooze options (1h, 3h, Tomorrow 9AM) |
| `snooze:<id>:<dur>` | Sets `snoozedUntil` |
| `dismiss:<id>` | Same as acknowledge — marks "Not Interested" |
| `mark_read:<id>` | Legacy: marks read only |

### Reminder Escalation Tiers

| Tier | Header | Message |
|------|--------|---------|
| #1 | ⚡ Gentle Reminder | "You haven't reviewed this email yet." |
| #2 | 🚨 URGENT Reminder | "This HIGH priority email is still waiting!" |
| #3 | ⛔ FINAL Reminder | "This is the last nudge — please take action now!" |

---

## 8. Database Schema

### Entity Relationship

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│   User   │────<│  GmailToken  │     │ WatchReg.    │
│          │────<│ (1:1)        │     │ (1:1)        │
│          │────<│              │     │              │
│          │────<├──────────────┤     ├──────────────┤
│          │────<│  SyncState   │     │ TelegramLink │
│          │     │ (1:1)        │     │ (1:1)        │
│          │     └──────────────┘     └──────────────┘
│          │
│          │────<┌──────────────┐
│          │     │    Email     │
│          │     │   (1:N)     │
│          │     └──────────────┘
│          │
│          │────<┌──────────────┐
│          │     │ SenderRule   │
│          │     │  (1:N)      │
│          │     └──────────────┘
│          │
│          │────<┌──────────────┐
│          │     │ KeywordRule  │
│          │     │  (1:N)      │
│          │     └──────────────┘
└──────────┘
```

### Models

| Model | Table | Purpose |
|-------|-------|---------|
| **User** | `users` | User accounts (id, email, name) |
| **GmailToken** | `gmail_tokens` | Encrypted OAuth refresh tokens (AES-256-GCM) |
| **WatchRegistration** | `watch_registrations` | Gmail Pub/Sub watch state (historyId, expiry) |
| **SyncState** | `sync_states` | Incremental sync cursor (lastHistoryId, lastSyncAt) |
| **Email** | `emails` | Synced emails with scores, deadlines, lifecycle state |
| **SenderRule** | `sender_rules` | Domain-based scoring rules (global + per-user) |
| **KeywordRule** | `keyword_rules` | Keyword-based scoring rules (global + per-user) |
| **TelegramLink** | `telegram_links` | Telegram account linking (chatId, code, expiry) |

### Key Indexes

- Email: `(userId, messageId)` UNIQUE, `(userId, receivedAt)`, `(userId, isUnread)`, `(userId, priorityScore)`, `(userId, deadlineAt)`, `(notifiedAt, acknowledgedAt, reminderCount, priorityLabel)`
- SenderRule: `(userId)`, `(domain)`
- KeywordRule: `(userId)`, `(keyword)`
- WatchRegistration: `(expiration)`

---

## 9. Authentication Flow

### OAuth2 (Google → Dashboard)

```
1. User clicks "Connect" on dashboard
2. → GET /auth/google → redirects to Google consent screen
   Scopes: gmail.readonly, userinfo.email, userinfo.profile
   Options: access_type=offline, prompt=consent
3. User approves
4. → GET /auth/google/callback?code=...
5. Server:
   a. Exchange code for access + refresh tokens
   b. Fetch user info (email, name)
   c. Validate email domain against ALLOWED_SENDER_DOMAIN
   d. Encrypt refresh token with AES-256-GCM
   e. Upsert User + GmailToken in DB
   f. Register Gmail watch (if Pub/Sub configured)
   g. Sign JWT (sub=userId, 24h expiry)
6. Returns HTML: redirect to {WEB_ORIGIN}?token={jwt}
7. Dashboard captures token → localStorage → cleans URL
```

### JWT (Dashboard → API)

```
1. Stored in localStorage (key: jecrc_auth_token)
2. API requests: Authorization: Bearer {token}
3. SSE connections: ?token={token} (EventSource can't set headers)
4. Middleware: extract → verify → set req.userId → continue or 401
```

---

## 10. Real-Time Updates (SSE)

### Architecture

```
┌──────────┐     ┌───────────────┐     ┌──────────────┐
│ Worker   │────>│ eventBroad-   │────>│ SSE Stream   │
│ (BullMQ) │     │ caster        │     │ (per user)   │
│          │     │ (EventEmitter)│     │              │
└──────────┘     └───────────────┘     └──────┬───────┘
                                               │
                                        ┌──────▼───────┐
                                        │ Dashboard    │
                                        │ (EventSource)│
                                        └──────────────┘
```

### Event Types

| Event | Trigger | Dashboard Action |
|-------|---------|------------------|
| `connected` | SSE connection established | Initial handshake |
| `email_received` | New email stored + scored | Refetch email list + stats |
| `sync_completed` | Manual sync / test email clear | Refetch email list + stats |

### Implementation

- **Broadcaster**: In-process `EventEmitter`, emits to `user:{userId}` channel
- **Heartbeat**: 30s keepalive comments (`: keepalive\n\n`) to detect dead connections
- **Cleanup**: On client disconnect, clears interval, removes listener, closes response

---

## 11. Priority Scoring Engine

### Score Thresholds

| Label | Score Range |
|-------|-------------|
| HIGH | ≥ 20 |
| MEDIUM | ≥ 10 |
| LOW | < 10 |

### Scoring Components

| Component | Score | Condition |
|-----------|-------|-----------|
| University domain | +10 | Sender domain matches `ALLOWED_SENDER_DOMAIN` |
| Sender rule | +10/20/30 | From header matches rule domain |
| Keyword rule | +10/20/30 | Subject/snippet matches keyword |

### Custom Rule Impact Presets

| Impact Level | Weight | Effect |
|-------------|--------|--------|
| `high` | +30 | A single match exceeds HIGH threshold |
| `medium` | +20 | A single match reaches HIGH threshold |
| `low` | +10 | A single match reaches MEDIUM threshold |

### Seed Rules (Pre-loaded)

**Sender Rules (5):**
- `placement@jecrcu.edu.in` (+30)
- `exam@jecrcu.edu.in` (+25)
- `academics@jecrcu.edu.in` (+20)
- `hod@jecrcu.edu.in` (+25)
- `faculty@jecrcu.edu.in` (+15)

**Keyword Rules (22):** placement, campus drive, job offer, interview, recruitment, exam, midterm, results, deadline, registration, fee payment, scholarship, urgent, important, action required, notice, circular, and more.

---

## 12. External Integrations

### Google Gmail API

- **Scope**: `gmail.readonly` only
- **Operations**: `history.list`, `messages.list`, `messages.get`, `watch`, `stop`, `getProfile`
- **Rate limiting**: `withRetry()` — exponential backoff on 429/5xx (3 retries, 500ms initial)
- **Body parsing**: Recursive MIME traversal (max depth 10), prefers `text/plain`, falls back to HTML strip

### Google OAuth2

- **Scopes**: `gmail.readonly`, `userinfo.email`, `userinfo.profile`
- **Token storage**: AES-256-GCM encrypted, IV + auth tag stored separately
- **Refresh**: Automatic on every sync

### Google Cloud Pub/Sub (optional)

- Gmail push → `POST /webhooks/gmail`
- Message: base64-encoded `{ emailAddress, historyId }`
- Falls back to 5-min polling if not configured

### Telegram Bot API

- **Library**: Telegraf (long-polling mode)
- **Push**: Direct HTTPS POST with IPv4 forced
- **Buttons**: Inline keyboards for acknowledge/snooze/dismiss/calendar

---

## 13. Deployment

### Docker Compose

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `postgres` | postgres:17-alpine | 5433 | Database |
| `redis` | redis:7.4-alpine | 6379 | Queue + cache |
| `api` | apps/api/Dockerfile | 3000 | API server + Telegram bot |
| `worker` | apps/api/Dockerfile | — | Queue workers |
| `web` | apps/web/Dockerfile | 5173 | Dashboard (nginx) |

### Free Tier Production Stack

| Component | Service |
|-----------|---------|
| Web CDN | Vercel |
| Database | Neon.tech (Managed PostgreSQL) |
| Cache/Queue | Upstash (Managed Redis) |
| API + Worker | Koyeb / OCI (Docker containers) |
| Keep-alive | Self-pinger every 10 min |

### Embedded Worker Mode

Set `ENABLE_EMBEDDED_WORKER=false` to disable. When enabled, the API server lazily loads the worker process after starting to accept connections — single container deployment for free tiers.

---

## 14. Key File Reference

| Component | Path |
|-----------|------|
| API Entry | `apps/api/src/index.ts` |
| Express App | `apps/api/src/app.ts` |
| Auth Routes | `apps/api/src/routes/auth.ts` |
| Sync Routes | `apps/api/src/routes/sync.ts` |
| Webhook Routes | `apps/api/src/routes/webhooks.ts` |
| Telegram Routes | `apps/api/src/routes/telegram.ts` |
| Emails Routes | `apps/api/src/routes/emails.ts` |
| Rules Routes | `apps/api/src/routes/rules.ts` |
| Metrics Routes | `apps/api/src/routes/metrics.ts` |
| Auth Middleware | `apps/api/src/middleware/require-auth.ts` |
| SSE Events | `apps/api/src/events.ts` |
| Worker Entry | `apps/worker/src/index.ts` |
| Email Sync | `apps/worker/src/processors/email-sync.ts` |
| Email Rescan | `apps/worker/src/processors/email-rescan.ts` |
| Reminder Check | `apps/worker/src/processors/reminder-check.ts` |
| Gmail History | `packages/gmail/src/history.ts` |
| Gmail Watch | `packages/gmail/src/watch.ts` |
| Scoring Engine | `packages/scoring/src/scoring-engine.ts` |
| Domain Filter | `packages/scoring/src/domain-filter.ts` |
| Deadline Extractor | `packages/scoring/src/deadline.ts` |
| Seed Rules | `packages/scoring/src/seed-rules.ts` |
| Telegram Bot | `packages/telegram/src/bot.ts` |
| Telegram Push | `packages/telegram/src/push.ts` |
| Telegram Linking | `packages/telegram/src/linking.ts` |
| JWT Auth | `packages/auth/src/jwt.ts` |
| Google OAuth | `packages/auth/src/google-oauth.ts` |
| Encryption | `packages/auth/src/encryption.ts` |
| User Service | `packages/auth/src/user-service.ts` |
| Config | `packages/config/src/index.ts` |
| Queue Jobs | `packages/queue/src/jobs.ts` |
| Queue Redis | `packages/queue/src/index.ts` |
| Prisma Schema | `packages/database/prisma/schema.prisma` |
| Web Dashboard | `apps/web/src/main.tsx` |
| API Client | `apps/web/src/lib/api.ts` |
| Docker Compose | `docker-compose.yml` |
