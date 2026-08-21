import { Router } from 'express';
import type { Request, Response } from 'express';
import type { PrismaClient } from '@jecrc/database';
import type { AppConfig } from '@jecrc/config';
import type { Queue } from 'bullmq';
import type { RescanEmailsJob } from '@jecrc/queue';
import { getLogger } from '@jecrc/observability';

const logger = getLogger('rules-routes');

interface RulesDependencies {
  prisma: PrismaClient;
  config: AppConfig;
  emailRescanQueue: Queue<RescanEmailsJob>;
}

/**
 * Maps user-facing impact presets to numeric rule weights.
 * Single "high" preset (30) exceeds the HIGH threshold (20) so a lone
 * matched keyword is enough to flag an email as high priority.
 */
export const IMPACT_WEIGHTS = {
  high: 30,
  medium: 20,
  low: 10,
} as const;

export type Impact = keyof typeof IMPACT_WEIGHTS;

const VALID_MATCH_FIELDS = ['subject', 'snippet', 'any'] as const;

/**
 * Enqueues a background re-score of the user's existing emails.
 * Non-blocking: a queue failure never fails the mutation response.
 */
export async function queueRescan(
  userId: string,
  emailRescanQueue: Queue<RescanEmailsJob>,
): Promise<{ queued: boolean; jobId: string | undefined }> {
  try {
    const job = await emailRescanQueue.add(
      'rescan-user-emails',
      { userId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
    logger.info({ userId, jobId: job.id }, 'Email re-scan queued after rule change');
    return { queued: true, jobId: job.id ?? undefined };
  } catch (error) {
    logger.error({ error, userId }, 'Failed to queue auto re-scan after rule change');
    return { queued: false, jobId: undefined };
  }
}

export function createRulesRouter(dependencies: RulesDependencies): Router {
  const router = Router();
  const { prisma, emailRescanQueue } = dependencies;

  /**
   * GET /rules
   * Returns the authenticated user's custom rules plus global rules.
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const [userKeywords, globalKeywords, userSenders, globalSenders] = await Promise.all([
        prisma.keywordRule.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
        prisma.keywordRule.findMany({ where: { userId: null }, orderBy: { keyword: 'asc' } }),
        prisma.senderRule.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
        prisma.senderRule.findMany({ where: { userId: null }, orderBy: { domain: 'asc' } }),
      ]);

      return res.status(200).json({
        userKeywords,
        globalKeywords,
        userSenders,
        globalSenders,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch rules');
      return res.status(500).json({ error: 'Failed to fetch rules' });
    }
  });

  /**
   * POST /rules
   * Creates a user-specific keyword or sender rule.
   * Body: { type: 'keyword'|'sender', value: string, impact: 'high'|'medium'|'low', matchField?: 'subject'|'snippet'|'any' }
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { type, value, impact, matchField } = req.body as {
        type?: string;
        value?: string;
        impact?: string;
        matchField?: string;
      };

      if (type !== 'keyword' && type !== 'sender') {
        return res.status(400).json({ error: "Invalid rule type (must be 'keyword' or 'sender')" });
      }

      if (!value || typeof value !== 'string' || value.trim().length === 0) {
        return res.status(400).json({ error: 'Missing or invalid rule value' });
      }

      if (!impact || !(impact in IMPACT_WEIGHTS)) {
        return res
          .status(400)
          .json({ error: "Invalid impact (must be 'high', 'medium', or 'low')" });
      }

      if (type === 'keyword' && matchField && !VALID_MATCH_FIELDS.includes(matchField as never)) {
        return res
          .status(400)
          .json({ error: "Invalid matchField (must be 'subject', 'snippet', or 'any')" });
      }

      const weight = IMPACT_WEIGHTS[impact as Impact];

      if (type === 'sender') {
        const created = await prisma.senderRule.create({
          data: {
            userId,
            domain: value.trim().toLowerCase(),
            label: value.trim(),
            weight,
          },
        });
        const rescan = await queueRescan(userId, emailRescanQueue);
        return res.status(201).json({ rule: created, rescan });
      }

      const created = await prisma.keywordRule.create({
        data: {
          userId,
          keyword: value.trim(),
          weight,
          matchField: matchField ?? 'any',
          category: 'user',
        },
      });
      const rescan = await queueRescan(userId, emailRescanQueue);
      return res.status(201).json({ rule: created, rescan });
    } catch (error) {
      logger.error({ error }, 'Failed to create rule');
      return res.status(500).json({ error: 'Failed to create rule' });
    }
  });

  /**
   * POST /rules/re-scan
   * Enqueues a background job to re-score the authenticated user's existing
   * emails using their current rule set. Use after adding/changing keywords.
   */
  router.post('/re-scan', async (req: Request, res: Response) => {
    try {
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const job = await emailRescanQueue.add(
        'rescan-user-emails',
        { userId },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );

      logger.info({ userId, jobId: job.id }, 'Email re-scan queued');

      return res.status(202).json({
        message: 'Re-scan queued successfully',
        jobId: job.id,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to queue re-scan');
      return res.status(500).json({ error: 'Failed to queue re-scan' });
    }
  });

  /**
   * PATCH /rules/:id
   * Updates impact (weight) or active state for a user's own rule.
   * Body: { impact?: 'high'|'medium'|'low', isActive?: boolean }
   */
  router.patch('/:id', async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      const id = req.params.id as string;

      if (!userId || !id) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { impact, isActive } = req.body as { impact?: string; isActive?: boolean };

      const keyword = await prisma.keywordRule.findUnique({ where: { id } });
      const sender = keyword ? null : await prisma.senderRule.findUnique({ where: { id } });

      if (!keyword && !sender) {
        return res.status(404).json({ error: 'Rule not found' });
      }

      const ownerId = keyword?.userId ?? sender?.userId;
      if (!ownerId || ownerId !== userId) {
        return res.status(403).json({ error: 'You cannot modify this rule' });
      }

      const data: { weight?: number; isActive?: boolean } = {};

      if (impact && impact in IMPACT_WEIGHTS) {
        data.weight = IMPACT_WEIGHTS[impact as Impact];
      }

      if (typeof isActive === 'boolean') {
        data.isActive = isActive;
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'No updatable fields provided' });
      }

      if (keyword) {
        const updated = await prisma.keywordRule.update({ where: { id }, data });
        const rescan = await queueRescan(userId, emailRescanQueue);
        return res.status(200).json({ rule: updated, rescan });
      }

      const updated = await prisma.senderRule.update({ where: { id }, data });
      const rescan = await queueRescan(userId, emailRescanQueue);
      return res.status(200).json({ rule: updated, rescan });
    } catch (error) {
      logger.error({ error }, 'Failed to update rule');
      return res.status(500).json({ error: 'Failed to update rule' });
    }
  });

  /**
   * DELETE /rules/:id
   * Deletes a user's own rule.
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const userId = req.userId;
      const id = req.params.id as string;

      if (!userId || !id) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const keyword = await prisma.keywordRule.findUnique({ where: { id } });
      const sender = keyword ? null : await prisma.senderRule.findUnique({ where: { id } });

      if (!keyword && !sender) {
        return res.status(404).json({ error: 'Rule not found' });
      }

      const ownerId = keyword?.userId ?? sender?.userId;
      if (!ownerId || ownerId !== userId) {
        return res.status(403).json({ error: 'You cannot delete this rule' });
      }

      if (keyword) {
        await prisma.keywordRule.delete({ where: { id } });
      } else {
        await prisma.senderRule.delete({ where: { id } });
      }

      const rescan = await queueRescan(userId, emailRescanQueue);
      return res.status(200).json({ message: 'Rule deleted', rescan });
    } catch (error) {
      logger.error({ error }, 'Failed to delete rule');
      return res.status(500).json({ error: 'Failed to delete rule' });
    }
  });

  return router;
}
