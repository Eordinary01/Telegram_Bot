# CONTEXT.md — JECRC Mail Priority Sync System

> This file is the project's persistent memory across agent sessions. Read it fully at the start of every session. Update it at the end of every phase. Keep it lean — this is a working memory, not a changelog archive.

---

## Project Summary (never prune this section)

Multi-tenant system that syncs Gmail in real-time for JECRC University students, filters to only `jecrcu.edu.in` sender domain, scores emails by priority using a deterministic rule engine (no LLM in v1), and pushes high-priority mail to Telegram + a live dashboard. Built to solve: students missing important placement/exam/faculty mail buried in inbox noise.

**Current scope**: pilot limited to one college/class (<100 users) — deliberately under Google's OAuth verification threshold, so app stays in "test user" mode. Do not build for open public scope unless user explicitly changes this.

**Stack**: TypeScript monorepo, Node.js/Express API, React/Vite dashboard, PostgreSQL/Prisma, Redis + BullMQ, Google Pub/Sub, Telegram Bot API, SSE for dashboard.

---

## Hard Constraints (never prune this section)

- `gmail.readonly` scope only.
- Sender domain filter: exact suffix match on `jecrcu.edu.in`, no substring matching. Config-driven via `ALLOWED_SENDER_DOMAIN`, not hardcoded.
- Refresh tokens encrypted at rest, never logged.
- Multi-tenant: every user-data table has `user_id` FK.
- Priority scoring is rule-based, not LLM-based, for v1.
- Real-time via Pub/Sub push, not polling.
- Telegram for delivery, not WhatsApp, for v1.

---

## Architecture Decisions Log

_(One line per decision. Only log decisions that would be expensive to rediscover — not routine implementation choices.)_

- [x] Monorepo with separate API, worker, web, and shared packages.
- [x] Express API + React/Vite dashboard; SSE selected for initial server-to-client updates.
- [x] Google Cloud/Pub/Sub resources are not provisioned; project includes a provisioning guide to expand in Phases 1–2.
- [x] Sender gate requires normalized exact equality with `ALLOWED_SENDER_DOMAIN`; subdomains are rejected.
- [x] Prisma for PostgreSQL access/migrations and AES-256-GCM planned for token encryption.
- [x] Simplified OAuth flow: no JWT sessions, token-only authentication for background automation.
- [x] OAuth callback returns HTML success page instead of JSON tokens.
- [x] Pub/Sub push notifications made optional for development; manual sync endpoint provided for testing.
- [x] BullMQ used for async job processing with Redis as message broker.
- [x] Gmail watch registration automatic after OAuth, with 7-day expiry tracking.

---

## Phase Status

### Completed

- Phase 0 — Monorepo scaffolded, PostgreSQL/Redis connections verified.
- Phase 1 — Google OAuth2 authentication & AES-256-GCM encrypted tokens implemented.
- Phase 2 — Ingestion pipeline, Pub/Sub webhook, and BullMQ worker.
- Phase 3 — Domain filter gate and deterministic priority scoring engine.
- [x] Phase 4 — Telegram delivery implemented. Telegraf bot linking flow, push notifications for high-priority emails, account linking endpoints. 56 tests pass.
- [x] Phase 5 — Dashboard & real-time feed implemented. Server-Sent Events (SSE) `/emails/stream` endpoint, `/emails` list and `/emails/stats` endpoints, modern glassmorphism React/Vite web UI with priority filters, search bar, email card score breakdown drawer, manual sync trigger, and Telegram linking modal. 59 tests pass.
- [x] Phase 6 — Hardening & Production Readiness completed. Gmail API rate-limiting with exponential backoff (`withRetry`), Pino logger redaction for sensitive keys/tokens, system metrics endpoint (`GET /health/metrics`), and BullMQ job retry configurations. 60 tests pass across 9 test suites.

### In Progress

_(All phases completed!)_

### Not Started

_(None - project build complete!)_

---

## Known Issues / Open Questions

- Local Compose PostgreSQL maps host port 5433 to avoid collision with an existing PostgreSQL service on host port 5432.
- Corepack 0.29.4 cannot verify the pnpm signing key. Commands currently use `npx pnpm@10.13.1`; upgrading Corepack is recommended.

---

## Context Pruning Protocol

Run this whenever this file exceeds ~150 lines, or after every 2 completed phases, whichever comes first.

1. **Never prune**: "Project Summary" and "Hard Constraints" sections — these are load-bearing for every future phase.
2. **Compress "Completed" entries**: once a phase is marked complete and its summary is written, remove any sub-bullets, debug notes, or exploration detail under it — keep only the 3-5 line summary. If a completed phase's summary references a decision already captured in "Architecture Decisions Log," don't repeat it here.
3. **Drop resolved items** from "Known Issues / Open Questions" entirely — don't archive them, they're not needed once resolved. If a resolution matters architecturally, promote it to the Decisions Log instead.
4. **Collapse old completed phases**: if more than 3 phases are marked Completed, collapse the oldest ones into a single line each: `Phase N — [one-line outcome]`. Keep only the most recent 2 completed phases at full summary detail.
5. **After pruning**, print a one-line confirmation to the user: "Context pruned: removed X, compressed Y. File is now Z lines." Do not silently prune without telling the user.
6. If uncertain whether something is safe to prune, do not prune it — ask the user instead of guessing. Losing a real constraint is worse than a slightly longer file.
