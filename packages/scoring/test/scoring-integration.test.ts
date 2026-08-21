import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@jecrc/database';
import { scoreEmail } from '../src/scoring-engine.js';

// Mock database rules
 
function createMockPrisma(senderRules: any[] = [], keywordRules: any[] = []): PrismaClient {
  return {
    senderRule: {
      findMany: vi.fn().mockResolvedValue(senderRules),
    },
    keywordRule: {
      findMany: vi.fn().mockResolvedValue(keywordRules),
    },
  } as unknown as PrismaClient;
}

describe('scoreEmail (integration-style)', () => {
  const ALLOWED_DOMAIN = 'jecrcu.edu.in';
  const USER_ID = 'test-user-1';

  describe('Universal Mail Scoring', () => {
    it('processes and scores emails from external domains like NPTEL', async () => {
      const prisma = createMockPrisma(
        [{ domain: 'nptel.iitm.ac.in', weight: 25, label: 'NPTEL Course' }],
        [],
      );
      const result = await scoreEmail(
        prisma,
        USER_ID,
        'NPTEL <newsletter@nptel.iitm.ac.in>',
        'Important: Assignment Deadline',
        null,
        ALLOWED_DOMAIN,
      );

      expect(result.isAllowedDomain).toBe(false);
      expect(result.priorityScore).toBe(25);
      expect(result.priorityLabel).toBe('low');
      expect(result.priorityReasons).toContain('NPTEL Course');
    });

    it('adds base university domain weight for primary domain senders', async () => {
      const prisma = createMockPrisma();
      const result = await scoreEmail(
        prisma,
        USER_ID,
        'Test <test@jecrcu.edu.in>',
        'Hello',
        null,
        ALLOWED_DOMAIN,
      );

      expect(result.isAllowedDomain).toBe(true);
      expect(result.senderDomain).toBe('jecrcu.edu.in');
      expect(result.priorityScore).toBe(10);
      expect(result.priorityReasons).toContain('Allowed domain (jecrcu.edu.in)');
    });
  });

  describe('Sender rules scoring', () => {
    it('adds weight for matching sender rules', async () => {
      const prisma = createMockPrisma(
        [
          { domain: 'placement@jecrcu.edu.in', weight: 30, label: 'Placement cell email' },
        ],
        [],
      );

      const result = await scoreEmail(
        prisma,
        USER_ID,
        'Placement Cell <placement@jecrcu.edu.in>',
        'Campus Drive Notice',
        null,
        ALLOWED_DOMAIN,
      );

      expect(result.isAllowedDomain).toBe(true);
      // 10 base + 30 sender rule = 40
      expect(result.priorityScore).toBe(40);
      expect(result.priorityLabel).toBe('high');
      expect(result.priorityReasons).toContain('Placement cell email');
    });
  });

  describe('Keyword rules scoring', () => {
    it('adds weight for matching subject keywords', async () => {
      const prisma = createMockPrisma(
        [],
        [
          { keyword: 'placement', weight: 20, category: 'placement', matchField: 'subject' },
          { keyword: 'campus drive', weight: 25, category: 'placement', matchField: 'any' },
        ],
      );

      const result = await scoreEmail(
        prisma,
        USER_ID,
        'Test <test@jecrcu.edu.in>',
        'Campus Drive 2025 - Placement Opportunity',
        null,
        ALLOWED_DOMAIN,
      );

      expect(result.isAllowedDomain).toBe(true);
      // 10 base + 25 (campus drive) + 20 (placement) = 55
      expect(result.priorityScore).toBe(55);
      expect(result.priorityLabel).toBe('high');
    });
  });

  describe('Combined scoring', () => {
    it('combines sender rule + keyword rule weights for high priority', async () => {
      const prisma = createMockPrisma(
        [
          { domain: 'placement@jecrcu.edu.in', weight: 30, label: 'Placement cell email' },
        ],
        [
          { keyword: 'placement', weight: 20, category: 'placement', matchField: 'subject' },
          { keyword: 'interview', weight: 20, category: 'placement', matchField: 'subject' },
        ],
      );

      const result = await scoreEmail(
        prisma,
        USER_ID,
        'Placement Cell <placement@jecrcu.edu.in>',
        'Placement Interview Schedule - Final Round',
        null,
        ALLOWED_DOMAIN,
      );

      // 10 base + 30 (sender) + 20 (placement) + 20 (interview) = 80
      expect(result.isAllowedDomain).toBe(true);
      expect(result.priorityScore).toBe(80);
      expect(result.priorityLabel).toBe('high');
    });

    it('scores medium priority for moderate signals', async () => {
      const prisma = createMockPrisma(
        [],
        [
          { keyword: 'notice', weight: 15, category: 'circular', matchField: 'subject' },
        ],
      );

      const result = await scoreEmail(
        prisma,
        USER_ID,
        'Admin <admin@jecrcu.edu.in>',
        'Holiday Notice - Diwali Break',
        null,
        ALLOWED_DOMAIN,
      );

      expect(result.isAllowedDomain).toBe(true);
      // 10 base + 15 notice = 25 (>= 20 is high)
      expect(result.priorityScore).toBe(25);
      expect(result.priorityLabel).toBe('high');
    });

    it('scores low priority for external email with no matching rules', async () => {
      const prisma = createMockPrisma([], []);

      const result = await scoreEmail(
        prisma,
        USER_ID,
        'General <general@external.com>',
        'Weekly Newsletter',
        'This is a general newsletter',
        ALLOWED_DOMAIN,
      );

      expect(result.isAllowedDomain).toBe(false);
      expect(result.priorityScore).toBe(0);
      expect(result.priorityLabel).toBe('low');
    });
  });
});
