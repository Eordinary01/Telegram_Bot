/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';

import { createApp } from '../src/app.js';

const mockPrisma = {} as any;
const mockConfig = {
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
  ENCRYPTION_KEY: Buffer.from('a'.repeat(32)).toString('base64'),
} as any;

const mockQueue = {
  add: vi.fn(),
  close: vi.fn(),
} as any;

describe('health endpoints', () => {
  it('reports that the process is alive', async () => {
    const app = createApp({
      prisma: mockPrisma,
      config: mockConfig,
      checkPostgres: vi.fn(),
      checkRedis: vi.fn(),
      webOrigin: 'http://localhost:5173',
      emailSyncQueue: mockQueue as Queue,
    });

    const response = await request(app).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('reports readiness when dependencies respond', async () => {
    const app = createApp({
      prisma: mockPrisma,
      config: mockConfig,
      checkPostgres: vi.fn().mockResolvedValue(undefined),
      checkRedis: vi.fn().mockResolvedValue(undefined),
      webOrigin: 'http://localhost:5173',
      emailSyncQueue: mockQueue as Queue,
    });

    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready' });
  });

  it('reports not ready when a dependency fails', async () => {
    const app = createApp({
      prisma: mockPrisma,
      config: mockConfig,
      checkPostgres: vi.fn().mockRejectedValue(new Error('offline')),
      checkRedis: vi.fn().mockResolvedValue(undefined),
      webOrigin: 'http://localhost:5173',
      emailSyncQueue: mockQueue as Queue,
    });

    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'not_ready' });
  });
});
