/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { makeTestDeps } from './helpers.js';

const mockPrisma = {} as any;

describe('health endpoints', () => {
  it('reports that the process is alive', async () => {
    const app = createApp(makeTestDeps({ prisma: mockPrisma }));

    const response = await request(app).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('reports readiness when dependencies respond', async () => {
    const app = createApp(
      makeTestDeps({
        prisma: mockPrisma,
        checkPostgres: vi.fn().mockResolvedValue(undefined),
        checkRedis: vi.fn().mockResolvedValue(undefined),
      }),
    );

    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready' });
  });

  it('reports not ready when a dependency fails', async () => {
    const app = createApp(
      makeTestDeps({
        prisma: mockPrisma,
        checkPostgres: vi.fn().mockRejectedValue(new Error('offline')),
        checkRedis: vi.fn().mockResolvedValue(undefined),
      }),
    );

    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'not_ready' });
  });
});
