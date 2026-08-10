# JECRC Mail Priority Sync System

Real-time Gmail priority filtering for JECRC University students. Syncs inboxes, filters to
`jecrcu.edu.in` senders, scores emails with a deterministic rule engine, and pushes
high-priority placement, exam, and faculty notices straight to Telegram and a live dashboard.

## Features

- Google OAuth2 login with `gmail.readonly` scope only
- Real-time sync via Gmail Pub/Sub push notifications (with manual sync fallback)
- Sender gate: exact `jecrcu.edu.in` domain matching, config driven
- Deterministic priority scoring engine with deadline extraction (no LLM, fast and auditable)
- Telegram bot: account linking, recent emails, deadlines, daily digest, mark-as-read
- Live dashboard with SSE updates, rules panel, and theme picker
- Multi-tenant by design: every user data table has a `user_id` foreign key
- Refresh tokens encrypted at rest with AES-256-GCM, never logged

## Architecture

| Layer | Tech |
|---|---|
| API | Node.js, Express, Helmet, CORS |
| Web | React, Vite, TypeScript, SSE |
| Worker | BullMQ jobs on Redis |
| Database | PostgreSQL 17, Prisma ORM |
| Gmail | Google OAuth2, Pub/Sub push, History API |
| Telegram | Telegraf bot |
| Infra | Docker Compose, pnpm workspaces |

## Repository structure

apps/api, apps/web, apps/worker, packages/auth, packages/config, packages/database,
packages/gmail, packages/observability, packages/queue, packages/scoring, packages/shared,
packages/telegram

## Getting started

Requires Node.js 22+, Corepack, Docker Desktop.

corepack enable
corepack prepare pnpm@10.13.1 --activate
pnpm install
cp .env.example .env
pnpm infra:up
pnpm prisma:generate
pnpm check:connections

Start the API, worker, and web dev servers (separate terminals):

pnpm dev:api
pnpm dev:worker
pnpm dev:web

- API liveness: http://localhost:3000/health/live
- API readiness: http://localhost:3000/health/ready
- Dashboard: http://localhost:5173

## Telegram bot

After linking your Gmail from the dashboard, start the bot and send /start <CODE>.
Commands: /start, /help, /status, /recent, /deadlines, /digest

## Scripts

build, dev, lint, typecheck, test, format, infra:up, infra:down, prisma:generate

## Docs

docs/local-development.md, docs/oauth-setup.md, docs/google-cloud-setup.md,
docs/verification/phase-0.md, docs/verification/phase-1.md

## License

Private. Built for the JECRC University pilot.
