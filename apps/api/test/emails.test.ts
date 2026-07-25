/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';

import { createApp } from '../src/app.js';

const mockPrisma = {
  email: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  syncState: {
    findUnique: vi.fn(),
  },
} as any;

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

describe('emails endpoints', () => {
  it('rejects request without userId', async () => {
    const app = createApp({
      prisma: mockPrisma,
      config: mockConfig,
      checkPostgres: vi.fn(),
      checkRedis: vi.fn(),
      webOrigin: 'http://localhost:5173',
      emailSyncQueue: mockQueue as Queue,
    });

    const response = await request(app).get('/emails');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Missing or invalid userId parameter' });
  });

  it('fetches email list for a user', async () => {
    const mockEmails = [
      {
        id: '1',
        userId: 'user-1',
        messageId: 'msg-1',
        subject: 'Placement Drive Notice',
        from: 'placement@jecrcu.edu.in',
        priorityLabel: 'HIGH',
        priorityScore: 120,
        receivedAt: new Date().toISOString(),
      },
    ];

    mockPrisma.email.findMany.mockResolvedValue(mockEmails);
    mockPrisma.email.count.mockResolvedValue(1);

    const app = createApp({
      prisma: mockPrisma,
      config: mockConfig,
      checkPostgres: vi.fn(),
      checkRedis: vi.fn(),
      webOrigin: 'http://localhost:5173',
      emailSyncQueue: mockQueue as Queue,
    });

    const response = await request(app).get('/emails?userId=user-1&priority=HIGH');

    expect(response.status).toBe(200);
    expect(response.body.emails).toHaveLength(1);
    expect(response.body.total).toBe(1);
    expect(response.body.emails[0].subject).toBe('Placement Drive Notice');
  });

  it('returns email stats counts', async () => {
    mockPrisma.email.count
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(3)  // high
      .mockResolvedValueOnce(5)  // medium
      .mockResolvedValueOnce(2)  // low
      .mockResolvedValueOnce(4); // unread

    mockPrisma.syncState.findUnique.mockResolvedValue({
      lastSyncAt: new Date('2026-07-25T12:00:00Z'),
    });

    const app = createApp({
      prisma: mockPrisma,
      config: mockConfig,
      checkPostgres: vi.fn(),
      checkRedis: vi.fn(),
      webOrigin: 'http://localhost:5173',
      emailSyncQueue: mockQueue as Queue,
    });

    const response = await request(app).get('/emails/stats?userId=user-1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      total: 10,
      high: 3,
      medium: 5,
      low: 2,
      unread: 4,
      lastSyncAt: '2026-07-25T12:00:00.000Z',
    });
  });
});
