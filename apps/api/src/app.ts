import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { PrismaClient } from '@jecrc/database';
import type { AppConfig } from '@jecrc/config';
import type { Queue } from 'bullmq';
import type { SyncUserEmailsJob } from '@jecrc/queue';

import { createAuthRouter } from './routes/auth.js';
import { createSyncRouter } from './routes/sync.js';
import { createWebhookRouter } from './routes/webhooks.js';
import { createTelegramRouter } from './routes/telegram.js';
import { createEmailsRouter } from './routes/emails.js';
import { createMetricsRouter } from './routes/metrics.js';

export type DependencyCheck = () => Promise<void>;

interface AppDependencies {
  prisma: PrismaClient;
  config: AppConfig;
  checkPostgres: DependencyCheck;
  checkRedis: DependencyCheck;
  webOrigin: string;
  emailSyncQueue: Queue<SyncUserEmailsJob>;
}

export function createApp(dependencies: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: dependencies.webOrigin, credentials: true }));
  app.use(express.json({ limit: '256kb' }));

  app.get('/health/live', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.get('/health/ready', async (_request, response) => {
    try {
      await Promise.all([dependencies.checkPostgres(), dependencies.checkRedis()]);
      response.status(200).json({ status: 'ready' });
    } catch {
      response.status(503).json({ status: 'not_ready' });
    }
  });

  // Health & metrics routes
  app.use('/health', createMetricsRouter({ prisma: dependencies.prisma, emailSyncQueue: dependencies.emailSyncQueue }));

  // Auth routes
  app.use('/auth', createAuthRouter({ prisma: dependencies.prisma, config: dependencies.config }));

  // Sync routes (manual trigger for development)
  app.use(
    '/sync',
    createSyncRouter({
      prisma: dependencies.prisma,
      config: dependencies.config,
      emailSyncQueue: dependencies.emailSyncQueue,
    }),
  );

  // Webhook routes (for Pub/Sub push notifications)
  app.use('/webhooks', createWebhookRouter({ emailSyncQueue: dependencies.emailSyncQueue }));

  // Telegram routes (linking flow for dashboard)
  app.use('/telegram', createTelegramRouter({ prisma: dependencies.prisma, config: dependencies.config }));

  // Email routes (dashboard feed & SSE stream)
  app.use('/emails', createEmailsRouter({ prisma: dependencies.prisma, config: dependencies.config }));

  return app;
}
