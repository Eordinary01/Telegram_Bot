/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';

import { processEmailRescan } from '../src/processors/email-rescan.js';

const mockPrisma = {
  email: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  senderRule: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  keywordRule: {
    findMany: vi
      .fn()
      .mockResolvedValue([{ keyword: 'placement', weight: 30, category: null, matchField: 'any' }]),
  },
  user: {
    findUnique: vi.fn().mockResolvedValue({ allowedDomains: '' }),
  },
} as any;

const config = {
  ALLOWED_SENDER_DOMAIN: 'jecrcu.edu.in',
} as any;

const mockJob = {
  id: 'job-1',
  data: { userId: 'user-1' },
  updateProgress: vi.fn(),
} as unknown as Job;

describe('processEmailRescan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-scores existing allowed-domain emails and updates their priority', async () => {
    mockPrisma.email.findMany.mockResolvedValue([
      {
        id: 'e1',
        messageId: 'm1',
        from: 'placement@jecrcu.edu.in',
        subject: 'Campus Placement Drive by Deloitte',
        snippet: 'Mandatory registration for placement drive.',
        bodyText: 'Register before 15/08/2026.',
        senderDomain: 'jecrcu.edu.in',
      },
    ]);
    mockPrisma.email.update.mockResolvedValue({});

    const result = await processEmailRescan(mockJob, mockPrisma, config);

    expect(result.total).toBe(1);
    expect(result.updated).toBe(1);
    expect(mockPrisma.email.update).toHaveBeenCalledTimes(1);
    const updateArgs = mockPrisma.email.update.mock.calls[0]?.[0];
    expect(updateArgs?.where?.id).toBe('e1');
    expect(updateArgs?.data?.priorityScore).toBeGreaterThanOrEqual(20);
    expect(updateArgs?.data?.priorityLabel).toBe('high');
  });

  it('persists an extracted deadline during re-score', async () => {
    mockPrisma.email.findMany.mockResolvedValue([
      {
        id: 'e2',
        messageId: 'm2',
        from: 'placement@jecrcu.edu.in',
        subject: 'NPTEL: Intro to Machine Learning - Week 4',
        snippet: 'Intro to ML week 4 assignment',
        bodyText: 'the assignment has to be submitted on or before wednesday 19-08-2026',
        senderDomain: 'jecrcu.edu.in',
      },
    ]);
    mockPrisma.email.update.mockResolvedValue({});

    const result = await processEmailRescan(mockJob, mockPrisma, config);

    expect(result.total).toBe(1);
    const updateArgs = mockPrisma.email.update.mock.calls[0]?.[0];
    expect(updateArgs?.data?.deadlineText).toContain('19-08-2026');
    expect(updateArgs?.data?.deadlineAt).toBeInstanceOf(Date);
  });

  it('persists a deadline for non-gated emails without re-scoring', async () => {
    mockPrisma.email.findMany.mockResolvedValue([
      {
        id: 'e3',
        messageId: 'm3',
        from: 'noreply@nptel.iitm.ac.in',
        subject: 'NPTEL: Intro to Machine Learning - Week 4',
        snippet: 'Week 4 assignment',
        bodyText: 'the assignment has to be submitted on or before wednesday 19-08-2026',
        senderDomain: null,
      },
    ]);
    mockPrisma.email.update.mockResolvedValue({});

    const result = await processEmailRescan(mockJob, mockPrisma, config);

    expect(result.total).toBe(1);
    expect(result.updated).toBe(1);
    const updateArgs = mockPrisma.email.update.mock.calls[0]?.[0];
    expect(updateArgs?.data?.priorityScore).toBeUndefined();
    expect(updateArgs?.data?.deadlineText).toContain('19-08-2026');
    expect(updateArgs?.data?.deadlineAt).toBeInstanceOf(Date);
  });
});
