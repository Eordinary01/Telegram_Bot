import dns from 'node:dns';
import { getConfig } from '@jecrc/config';
import { checkPostgresConnection, disconnectPostgres, getPrismaClient } from '@jecrc/database';
import { createLogger } from '@jecrc/observability';
import { checkRedisConnection, disconnectRedis, QueueNames } from '@jecrc/queue';

// Force IPv4 first to prevent Windows IPv6 DNS connection timeouts to api.telegram.org
dns.setDefaultResultOrder('ipv4first');
import { Worker } from 'bullmq';
import type { SyncUserEmailsJob } from '@jecrc/queue';

import { processEmailSync } from './processors/email-sync.js';

const config = getConfig();
const logger = createLogger(config.LOG_LEVEL);
const prisma = getPrismaClient();

// Check dependencies
await Promise.all([checkPostgresConnection(), checkRedisConnection(config.REDIS_URL)]);
logger.info('Worker dependencies are ready');

// Create BullMQ worker for email sync
const emailSyncWorker = new Worker<SyncUserEmailsJob>(
  QueueNames.EMAIL_SYNC,
  async (job) => {
    return processEmailSync(job, prisma, config);
  },
  {
    connection: {
      host: new URL(config.REDIS_URL).hostname,
      port: parseInt(new URL(config.REDIS_URL).port || '6379', 10),
    },
    concurrency: 5, // Process up to 5 jobs concurrently
  },
);

emailSyncWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Job completed');
});

emailSyncWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err }, 'Job failed');
});

logger.info('Worker is running and waiting for jobs...');

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Worker is shutting down');
  await emailSyncWorker.close();
  await Promise.all([disconnectPostgres(), disconnectRedis()]);
  process.exit();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

