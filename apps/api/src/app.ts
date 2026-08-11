import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { PrismaClient } from '@jecrc/database';
import type { AppConfig } from '@jecrc/config';
import type { Queue } from 'bullmq';
import type { SyncUserEmailsJob, RescanEmailsJob } from '@jecrc/queue';

import { createAuthRouter } from './routes/auth.js';
import { createSyncRouter } from './routes/sync.js';
import { createWebhookRouter } from './routes/webhooks.js';
import { createTelegramRouter } from './routes/telegram.js';
import { createEmailsRouter } from './routes/emails.js';
import { createMetricsRouter } from './routes/metrics.js';
import { createRulesRouter } from './routes/rules.js';
import { createRequireAuth } from './middleware/require-auth.js';

export type DependencyCheck = () => Promise<void>;

interface AppDependencies {
  prisma: PrismaClient;
  config: AppConfig;
  checkPostgres: DependencyCheck;
  checkRedis: DependencyCheck;
  webOrigin: string;
  emailSyncQueue: Queue<SyncUserEmailsJob>;
  emailRescanQueue: Queue<RescanEmailsJob>;
}
export function createApp(dependencies: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  // Normalize allowed origin (remove trailing slash)
  const configuredOrigin = dependencies.webOrigin ? dependencies.webOrigin.replace(/\/+$/, '') : '';

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. server-to-server, curl, mobile apps)
        if (!origin) return callback(null, true);
        const normalized = origin.replace(/\/+$/, '');
        if (
          !configuredOrigin ||
          normalized === configuredOrigin ||
          normalized.endsWith('.vercel.app') ||
          normalized.includes('localhost') ||
          normalized.includes('127.0.0.1')
        ) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '256kb' }));

  const requireAuth = createRequireAuth(dependencies.config);

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

  // Health metrics (auth-protected: exposes system internals)
  app.use(
    '/health',
    requireAuth,
    createMetricsRouter({
      prisma: dependencies.prisma,
      emailSyncQueue: dependencies.emailSyncQueue,
    }),
  );

  // Auth routes (OAuth public, /auth/me protected)
  app.use(
    '/auth',
    createAuthRouter({ prisma: dependencies.prisma, config: dependencies.config, requireAuth }),
  );

  // Sync routes (manual trigger - auth-protected)
  app.use(
    '/sync',
    requireAuth,
    createSyncRouter({
      prisma: dependencies.prisma,
      config: dependencies.config,
      emailSyncQueue: dependencies.emailSyncQueue,
    }),
  );

  // Webhook routes (for Pub/Sub push notifications - unauthenticated, validated by secret in Gmail webhook handler)
  app.use('/webhooks', createWebhookRouter({ prisma: dependencies.prisma, emailSyncQueue: dependencies.emailSyncQueue }));

  // Telegram routes (linking flow for dashboard - auth-protected)
  app.use(
    '/telegram',
    requireAuth,
    createTelegramRouter({ prisma: dependencies.prisma, config: dependencies.config }),
  );

  // Email routes (dashboard feed & SSE stream - auth-protected)
  app.use(
    '/emails',
    requireAuth,
    createEmailsRouter({ prisma: dependencies.prisma, config: dependencies.config }),
  );

  // Custom priority rules (auth-protected)
  app.use(
    '/rules',
    requireAuth,
    createRulesRouter({
      prisma: dependencies.prisma,
      config: dependencies.config,
      emailRescanQueue: dependencies.emailRescanQueue,
    }),
  );

  return app;
}
