 
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { createTestToken, makeTestDeps } from './helpers.js';

const mockPrisma = {
  user: { count: vi.fn().mockResolvedValue(5) },
  email: { count: vi.fn().mockResolvedValue(42) },
  watchRegistration: { count: vi.fn().mockResolvedValue(2) },
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
  it('returns 401 without a token', async () => {
    const app = createApp(makeTestDeps({ prisma: mockPrisma }));

    const response = await request(app).get('/health/metrics');

    expect(response.status).toBe(401);
  });

  it('returns JSON system metrics with a valid token', async () => {
    const deps = makeTestDeps({ prisma: mockPrisma });
    deps.emailSyncQueue = mockQueue as any;
    const app = createApp(deps);
    const token = createTestToken('admin');

    const response = await request(app)
      .get('/health/metrics')
      .set('Authorization', `Bearer ${token}`);

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
