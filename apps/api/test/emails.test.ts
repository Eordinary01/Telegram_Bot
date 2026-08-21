 
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { createTestToken, makeTestDeps } from './helpers.js';

const mockPrisma = {
  email: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  syncState: {
    findUnique: vi.fn(),
  },
} as any;

describe('emails endpoints', () => {
  it('rejects request without a valid token', async () => {
    const app = createApp(makeTestDeps({ prisma: mockPrisma }));

    const response = await request(app).get('/emails');

    expect(response.status).toBe(401);
  });

  it('fetches email list for the authenticated user', async () => {
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

    const app = createApp(makeTestDeps({ prisma: mockPrisma }));
    const token = createTestToken('user-1');

    const response = await request(app)
      .get('/emails?priority=HIGH')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.emails).toHaveLength(1);
    expect(response.body.total).toBe(1);
    expect(response.body.emails[0].subject).toBe('Placement Drive Notice');
  });

  it('returns email stats counts', async () => {
    mockPrisma.email.count
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(3) // high
      .mockResolvedValueOnce(5) // medium
      .mockResolvedValueOnce(2) // low
      .mockResolvedValueOnce(4) // unread
      .mockResolvedValueOnce(1); // actionRequired

    mockPrisma.syncState.findUnique.mockResolvedValue({
      lastSyncAt: new Date('2026-07-25T12:00:00Z'),
    });

    const app = createApp(makeTestDeps({ prisma: mockPrisma }));
    const token = createTestToken('user-1');

    const response = await request(app)
      .get('/emails/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      total: 10,
      high: 3,
      medium: 5,
      low: 2,
      unread: 4,
      actionRequired: 1,
      lastSyncAt: '2026-07-25T12:00:00.000Z',
    });
  });

  it('sorts emails by priority tier first, then by score', async () => {
    const now = new Date();
    const mockEmails = [
      {
        id: '1',
        userId: 'user-1',
        messageId: 'msg-1',
        subject: 'Low score but labeled LOW',
        from: 'spam@example.com',
        priorityLabel: 'low',
        priorityScore: 5,
        receivedAt: new Date(now.getTime() - 1000).toISOString(),
      },
      {
        id: '2',
        userId: 'user-1',
        messageId: 'msg-2',
        subject: 'High score but forced LOW by domain gate',
        from: 'urgent@gmail.com',
        priorityLabel: 'low',
        priorityScore: 45,
        receivedAt: new Date(now.getTime() - 2000).toISOString(),
      },
      {
        id: '3',
        userId: 'user-1',
        messageId: 'msg-3',
        subject: 'Genuine HIGH priority',
        from: 'placement@jecrcu.edu.in',
        priorityLabel: 'high',
        priorityScore: 40,
        receivedAt: new Date(now.getTime() - 3000).toISOString(),
      },
      {
        id: '4',
        userId: 'user-1',
        messageId: 'msg-4',
        subject: 'MEDIUM priority',
        from: 'faculty@jecrcu.edu.in',
        priorityLabel: 'medium',
        priorityScore: 15,
        receivedAt: new Date(now.getTime() - 4000).toISOString(),
      },
    ];

    mockPrisma.email.findMany.mockResolvedValue(mockEmails);
    mockPrisma.email.count.mockResolvedValue(4);

    const app = createApp(makeTestDeps({ prisma: mockPrisma }));
    const token = createTestToken('user-1');

    const response = await request(app)
      .get('/emails?priority=ALL')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    const labels = response.body.emails.map((e: { priorityLabel: string }) => e.priorityLabel);
    expect(labels).toEqual(['high', 'medium', 'low', 'low']);
  });
});
