# Phase 0 verification

Phase 0 is accepted only when PostgreSQL and Redis are both reachable and the repository quality checks pass.

## Automated checks

```bash
pnpm install
pnpm prisma:generate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Infrastructure checks

```bash
cp .env.example .env
pnpm infra:up
docker compose ps
pnpm check:connections
```

Expected output includes:

```text
PostgreSQL connection successful.
Redis connection successful.
```

## API checks

Start the API:

```bash
pnpm dev:api
```

Verify:

- `GET http://localhost:3000/health/live` returns HTTP 200 with `{"status":"ok"}`.
- `GET http://localhost:3000/health/ready` returns HTTP 200 with `{"status":"ready"}`.
- Stopping either PostgreSQL or Redis causes readiness to return HTTP 503 with `{"status":"not_ready"}` while liveness remains HTTP 200.

## Worker and dashboard checks

- `pnpm dev:worker` logs that worker dependencies are ready.
- `pnpm dev:web` serves the Phase 0 dashboard at `http://localhost:5173`.
