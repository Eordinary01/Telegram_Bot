import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Queue } from 'bullmq';
import type { PrismaClient } from '@jecrc/database';
import { getLogger } from '@jecrc/observability';
import type { SyncUserEmailsJob } from '@jecrc/queue';

const logger = getLogger('webhooks');

interface WebhookDependencies {
  prisma: PrismaClient;
  emailSyncQueue: Queue<SyncUserEmailsJob>;
}

export function createWebhookRouter(dependencies: WebhookDependencies): Router {
  const router = Router();
  const { prisma, emailSyncQueue } = dependencies;

  /**
   * POST /webhooks/gmail
   * Receives push notifications from Google Cloud Pub/Sub.
   *
   * Pub/Sub sends notifications in this format:
   * {
   *   "message": {
   *     "data": base64-encoded-string,
   *     "messageId": "...",
   *     "publishTime": "..."
   *   },
   *   "subscription": "..."
   * }
   */
  router.post('/gmail', async (req: Request, res: Response) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { message } = req.body;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!message || !message.data) {
        logger.warn('Received Pub/Sub notification without message data');
        return res.status(400).json({ error: 'Invalid Pub/Sub message format' });
      }

      // Decode the base64 message data
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      const decodedData = Buffer.from(message.data, 'base64').toString('utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const notification = JSON.parse(decodedData);

      // Gmail notification contains: { emailAddress: string, historyId: string }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { emailAddress, historyId } = notification;

      if (!emailAddress || !historyId) {
        logger.warn({ notification }, 'Invalid Gmail notification format');
        return res.status(400).json({ error: 'Invalid Gmail notification' });
      }

      logger.info({ emailAddress, historyId }, 'Received Gmail push notification');

      // Look up user by email address (Pub/Sub sends email, not UUID)
      const user = await prisma.user.findUnique({
        where: { email: emailAddress },
        select: { id: true },
      });

      if (!user) {
        logger.warn({ emailAddress }, 'No user found for email address, ignoring webhook');
        return res.status(200).json({ success: true, ignored: true });
      }

      // Queue sync job with the resolved user UUID
      const job = await emailSyncQueue.add(
        'sync-user-emails',
        {
          userId: user.id,
          triggerSource: 'webhook',
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );

      logger.info({ emailAddress, userId: user.id, jobId: job.id }, 'Queued email sync job');

      // Acknowledge receipt to Pub/Sub
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error({ error }, 'Failed to process Gmail webhook');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
