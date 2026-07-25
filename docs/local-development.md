# Local development

## Environment

Copy `.env.example` to `.env`. The committed example contains local-development placeholders only. Never commit a populated `.env` file.

`DATABASE_URL` must use `postgresql://`. `REDIS_URL` must use `redis://` or `rediss://`. Startup fails with a concise validation error if required configuration is missing or malformed.

## Infrastructure

Start PostgreSQL and Redis:

```bash
pnpm infra:up
```

Inspect their health:

```bash
docker compose ps
```

Stop the containers without deleting persisted volumes:

```bash
pnpm infra:down
```

To intentionally remove local data, run `docker compose down --volumes` manually after confirming the volumes are disposable.

## Connection checks

Generate the Prisma client after the first dependency installation or any Prisma schema change:

```bash
pnpm prisma:generate
```

Verify both dependencies:

```bash
pnpm check:connections
```

The API readiness endpoint runs equivalent checks and returns HTTP 503 if either dependency is unavailable.

## Processes

- `pnpm dev:api` starts Express on `API_HOST:API_PORT`.
- `pnpm dev:worker` verifies dependencies and waits for termination. BullMQ consumers are introduced in Phase 2.
- `pnpm dev:web` starts the Vite development server.

All processes handle Ctrl+C. The API and worker close PostgreSQL and Redis clients during shutdown.
