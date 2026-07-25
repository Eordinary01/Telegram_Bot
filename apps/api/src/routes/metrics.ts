import { Router } from 'express';
import type { Request, Response } from 'express';
import type { PrismaClient } from '@jecrc/database';
import type { Queue } from 'bullmq';
import { getLogger } from '@jecrc/observability';
import type { SyncUserEmailsJob } from '@jecrc/queue';

const logger = getLogger('metrics-routes');

interface MetricsDependencies {
  prisma: PrismaClient;
  emailSyncQueue: Queue<SyncUserEmailsJob>;
}

export function createMetricsRouter(dependencies: MetricsDependencies): Router {
  const router = Router();
  const { prisma, emailSyncQueue } = dependencies;

  /**
   * GET /health/metrics
   * Returns system health metrics including BullMQ queue state, DB counts, and memory usage.
   */
  router.get('/metrics', async (_req: Request, res: Response) => {
    try {
      const [queueCounts, userCount, emailCount, watchCount] = await Promise.all([
        emailSyncQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
        prisma.user.count(),
        prisma.email.count(),
        prisma.watchRegistration.count(),
      ]);

      const memory = process.memoryUsage();

      return res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        process: {
          pid: process.pid,
          memoryMb: {
            rss: Math.round(memory.rss / (1024 * 1024)),
            heapTotal: Math.round(memory.heapTotal / (1024 * 1024)),
            heapUsed: Math.round(memory.heapUsed / (1024 * 1024)),
          },
          nodeVersion: process.version,
        },
        queue: {
          name: emailSyncQueue.name,
          waiting: queueCounts.waiting ?? 0,
          active: queueCounts.active ?? 0,
          completed: queueCounts.completed ?? 0,
          failed: queueCounts.failed ?? 0,
          delayed: queueCounts.delayed ?? 0,
        },
        database: {
          users: userCount,
          emails: emailCount,
          activeWatches: watchCount,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to collect metrics');
      return res.status(500).json({ error: 'Failed to collect metrics' });
    }
  });

  return router;
}
