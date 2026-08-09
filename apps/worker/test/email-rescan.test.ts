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
        from: 'placement@jecrcu.edu.in',
        subject: 'Campus Placement Drive by Deloitte',
        snippet: 'Mandatory registration for placement drive.',
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

  it('only queries emails that passed the domain gate', async () => {
    mockPrisma.email.findMany.mockResolvedValue([]);

    const result = await processEmailRescan(mockJob, mockPrisma, config);

    expect(result.total).toBe(0);
    expect(mockPrisma.email.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          senderDomain: { not: null },
        }),
      }),
    );
    expect(mockPrisma.email.update).not.toHaveBeenCalled();
  });
});
