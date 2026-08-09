/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { createTestToken, makeTestDeps } from './helpers.js';

const mockPrisma = {
  keywordRule: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  senderRule: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
} as any;

describe('rules endpoints', () => {
  it('rejects requests without a valid token', async () => {
    const app = createApp(makeTestDeps({ prisma: mockPrisma }));

    const response = await request(app).get('/rules');

    expect(response.status).toBe(401);
  });

  it('lists user and global rules', async () => {
    mockPrisma.keywordRule.findMany
      .mockResolvedValueOnce([{ id: 'k1', userId: 'user-1', keyword: 'Superset', weight: 30 }]) // user keywords
      .mockResolvedValueOnce([{ id: 'gk1', userId: null, keyword: 'placement', weight: 25 }]); // global keywords
    mockPrisma.senderRule.findMany
      .mockResolvedValueOnce([
        { id: 's1', userId: 'user-1', domain: 'hod@jecrcu.edu.in', weight: 25 },
      ])
      .mockResolvedValueOnce([
        { id: 'gs1', userId: null, domain: 'placement@jecrcu.edu.in', weight: 30 },
      ]);

    const app = createApp(makeTestDeps({ prisma: mockPrisma }));
    const token = createTestToken('user-1');

    const response = await request(app).get('/rules').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.userKeywords).toHaveLength(1);
    expect(response.body.globalKeywords).toHaveLength(1);
    expect(response.body.userSenders).toHaveLength(1);
    expect(response.body.globalSenders).toHaveLength(1);
  });

  it('creates a user keyword rule with impact weight', async () => {
    mockPrisma.keywordRule.create.mockResolvedValue({
      id: 'k-new',
      userId: 'user-1',
      keyword: 'Superset',
      weight: 30,
      matchField: 'any',
    });

    const app = createApp(makeTestDeps({ prisma: mockPrisma }));
    const token = createTestToken('user-1');

    const response = await request(app)
      .post('/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'keyword', value: 'Superset', impact: 'high' });

    expect(response.status).toBe(201);
    expect(response.body.rule.weight).toBe(30);
    expect(mockPrisma.keywordRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', keyword: 'Superset' }),
      }),
    );
  });

  it('maps medium impact to weight 20', async () => {
    mockPrisma.keywordRule.create.mockResolvedValue({ id: 'k2', weight: 20 });

    const app = createApp(makeTestDeps({ prisma: mockPrisma }));
    const token = createTestToken('user-1');

    const response = await request(app)
      .post('/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'keyword', value: 'internship', impact: 'medium' });

    expect(response.status).toBe(201);
    expect(response.body.rule.weight).toBe(20);
  });

  it('rejects invalid impact value', async () => {
    const app = createApp(makeTestDeps({ prisma: mockPrisma }));
    const token = createTestToken('user-1');

    const response = await request(app)
      .post('/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'keyword', value: 'Superset', impact: 'critical' });

    expect(response.status).toBe(400);
  });

  it('deletes only the authenticated user&apos;s own rule', async () => {
    mockPrisma.keywordRule.findUnique.mockResolvedValue({
      id: 'k1',
      userId: 'user-1',
    });
    mockPrisma.keywordRule.delete.mockResolvedValue({});

    const app = createApp(makeTestDeps({ prisma: mockPrisma }));
    const token = createTestToken('user-1');

    const response = await request(app).delete('/rules/k1').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
  });

  it('forbids deleting a global rule', async () => {
    mockPrisma.keywordRule.findUnique.mockResolvedValue({
      id: 'gk1',
      userId: null,
    });

    const app = createApp(makeTestDeps({ prisma: mockPrisma }));
    const token = createTestToken('user-1');

    const response = await request(app)
      .delete('/rules/gk1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('forbids deleting another user&apos;s rule', async () => {
    mockPrisma.keywordRule.findUnique.mockResolvedValue({
      id: 'other',
      userId: 'user-2',
    });

    const app = createApp(makeTestDeps({ prisma: mockPrisma }));
    const token = createTestToken('user-1');

    const response = await request(app)
      .delete('/rules/other')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('queues a re-scan job', async () => {
    const deps = makeTestDeps({ prisma: mockPrisma });
    deps.emailRescanQueue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }) } as any;
    const app = createApp(deps);
    const token = createTestToken('user-1');

    const response = await request(app)
      .post('/rules/re-scan')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(202);
    expect(response.body.jobId).toBe('job-1');
    expect((deps.emailRescanQueue as any).add).toHaveBeenCalledWith(
      'rescan-user-emails',
      { userId: 'user-1' },
      expect.any(Object),
    );
  });

  it('auto-queues a re-scan when a keyword rule is created', async () => {
    const rescanQueue = { add: vi.fn().mockResolvedValue({ id: 'job-auto' }) } as any;
    mockPrisma.keywordRule.create.mockResolvedValue({
      id: 'k-new',
      userId: 'user-1',
      keyword: 'Superset',
      weight: 30,
      matchField: 'any',
    });

    const app = createApp(makeTestDeps({ prisma: mockPrisma, emailRescanQueue: rescanQueue }));
    const token = createTestToken('user-1');

    const response = await request(app)
      .post('/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'keyword', value: 'Superset', impact: 'high' });

    expect(response.status).toBe(201);
    expect(response.body.rescan.queued).toBe(true);
    expect(rescanQueue.add).toHaveBeenCalledWith(
      'rescan-user-emails',
      { userId: 'user-1' },
      expect.any(Object),
    );
  });

  it('auto-queues a re-scan when a rule is deleted', async () => {
    const rescanQueue = { add: vi.fn().mockResolvedValue({ id: 'job-auto' }) } as any;
    mockPrisma.keywordRule.findUnique.mockResolvedValue({
      id: 'k1',
      userId: 'user-1',
    });
    mockPrisma.keywordRule.delete.mockResolvedValue({});

    const app = createApp(makeTestDeps({ prisma: mockPrisma, emailRescanQueue: rescanQueue }));
    const token = createTestToken('user-1');

    const response = await request(app).delete('/rules/k1').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.rescan.queued).toBe(true);
    expect(rescanQueue.add).toHaveBeenCalledWith(
      'rescan-user-emails',
      { userId: 'user-1' },
      expect.any(Object),
    );
  });

  it('still succeeds if the auto re-scan queue fails', async () => {
    const rescanQueue = { add: vi.fn().mockRejectedValue(new Error('redis down')) } as any;
    mockPrisma.keywordRule.create.mockResolvedValue({
      id: 'k-new',
      userId: 'user-1',
      keyword: 'Superset',
      weight: 30,
      matchField: 'any',
    });

    const app = createApp(makeTestDeps({ prisma: mockPrisma, emailRescanQueue: rescanQueue }));
    const token = createTestToken('user-1');

    const response = await request(app)
      .post('/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'keyword', value: 'Superset', impact: 'high' });

    expect(response.status).toBe(201);
    expect(response.body.rescan.queued).toBe(false);
  });
});
