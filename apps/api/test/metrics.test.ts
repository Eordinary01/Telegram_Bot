/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';

import { createApp } from '../src/app.js';

const mockPrisma = {
  user: { count: vi.fn().mockResolvedValue(5) },
  email: { count: vi.fn().mockResolvedValue(42) },
  watchRegistration: { count: vi.fn().mockResolvedValue(2) },
} as any;

const mockConfig = {
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
  ENCRYPTION_KEY: Buffer.from('a'.repeat(32)).toString('base64'),
} as any;

const mockQueue = {
  name: 'email-sync-queue',
  getJobCounts: vi.fn().mockResolvedValue({
    waiting: 0,
    active: 1,
    completed: 10,
    failed: 0,
    delayed: 0,
  }),
  close: vi.fn(),
} as any;

describe('metrics endpoints', () => {
  it('returns JSON system metrics', async () => {
    const app = createApp({
      prisma: mockPrisma,
      config: mockConfig,
      checkPostgres: vi.fn(),
      checkRedis: vi.fn(),
      webOrigin: 'http://localhost:5173',
      emailSyncQueue: mockQueue as Queue,
    });

    const response = await request(app).get('/health/metrics');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
    expect(response.body.queue).toEqual({
      name: 'email-sync-queue',
      waiting: 0,
      active: 1,
      completed: 10,
      failed: 0,
      delayed: 0,
    });
    expect(response.body.database).toEqual({
      users: 5,
      emails: 42,
      activeWatches: 2,
    });
    expect(response.body.process).toBeDefined();
  });
});
