# JECRC Mail Priority Sync System

A multi-tenant Gmail priority service for the JECRC University pilot. The project is being implemented in the strict phases defined in `ANTIGRAVITY_PROMPT.md`.

## Phase 0 scope

The current scaffold provides:

- Express API with liveness and dependency-readiness endpoints
- Separate worker process
- React/Vite dashboard shell
- Validated environment configuration
- Prisma/PostgreSQL and Redis connectivity helpers
- Docker Compose services for local PostgreSQL and Redis
- TypeScript, ESLint, Prettier, and Vitest tooling

No Gmail, OAuth, scoring, or Telegram business logic is included in Phase 0.

## Prerequisites

- Node.js 22 or newer
- Corepack
- Docker Desktop with Docker Compose

## Local setup

```bash
corepack enable
corepack prepare pnpm@10.13.1 --activate
pnpm install
cp .env.example .env
pnpm infra:up
pnpm prisma:generate
pnpm check:connections
```

Start services in separate terminals:

```bash
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

Endpoints:

- API liveness: `http://localhost:3000/health/live`
- API readiness: `http://localhost:3000/health/ready`
- Dashboard: `http://localhost:5173`

## Quality checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

See `docs/local-development.md` for troubleshooting and `docs/verification/phase-0.md` for the Phase 0 acceptance procedure.
