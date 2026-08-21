import { Router } from 'express';
import type { Request, Response } from 'express';
import type { PrismaClient } from '@jecrc/database';
import type { AppConfig } from '@jecrc/config';
import type { Queue } from 'bullmq';
import { getLogger } from '@jecrc/observability';
import type { SyncUserEmailsJob } from '@jecrc/queue';

const logger = getLogger('sync-routes');

interface SyncDependencies {
  prisma: PrismaClient;
  config: AppConfig;
  emailSyncQueue: Queue<SyncUserEmailsJob>;
}

export function createSyncRouter(dependencies: SyncDependencies): Router {
  const router = Router();
  const { prisma, emailSyncQueue } = dependencies;

  /**
   * POST /sync
   * Manually trigger email sync for the authenticated user (useful for development/testing)
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const userId = req.userId;

      if (!userId || typeof userId !== 'string') {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { gmailTokens: true },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!user.gmailTokens || user.gmailTokens.length === 0) {
        return res.status(400).json({ error: 'User has not connected Gmail' });
      }

      // Verify user has created at least 3 custom priority rules
      const [userKeywordsCount, userSendersCount] = await Promise.all([
        prisma.keywordRule.count({ where: { userId } }),
        prisma.senderRule.count({ where: { userId } }),
      ]);

      const userRulesCount = userKeywordsCount + userSendersCount;
      if (userRulesCount < 3) {
        return res.status(400).json({
          error: `You must add at least 3 custom priority rules before syncing emails (${userRulesCount}/3 added).`,
        });
      }

      // Queue sync job
      const job = await emailSyncQueue.add(
        'sync-user-emails',
        {
          userId: userId,
          triggerSource: 'manual',
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );

      logger.info({ userId, jobId: job.id }, 'Manual sync triggered');

      res.status(200).json({
        message: 'Sync queued successfully',
        jobId: job.id,
        userId,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to trigger manual sync');
      res.status(500).json({ error: 'Failed to trigger sync' });
    }
  });

  /**
   * GET /sync/status/:jobId
   * Check status of a sync job
   */
  router.get('/status/:jobId', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;

      if (!jobId || typeof jobId !== 'string') {
        return res.status(400).json({ error: 'Invalid jobId' });
      }

      const job = await emailSyncQueue.getJob(jobId);

      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const state = await job.getState();
      const progress = job.progress;
      const returnValue = job.returnvalue;
       
      const failedReason = job.failedReason;

      res.status(200).json({
        jobId: job.id,
        state,
        progress,
        result: returnValue,
        error: failedReason,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get job status');
      res.status(500).json({ error: 'Failed to get job status' });
    }
  });

  return router;
}
