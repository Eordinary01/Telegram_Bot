import dns from 'node:dns';
import { getConfig } from '@jecrc/config';
import { checkPostgresConnection, disconnectPostgres, getPrismaClient } from '@jecrc/database';
import { createLogger } from '@jecrc/observability';
import { checkRedisConnection, disconnectRedis, QueueNames, parseRedisConnection } from '@jecrc/queue';

// Force IPv4 first to prevent Windows IPv6 DNS connection timeouts to api.telegram.org
dns.setDefaultResultOrder('ipv4first');
import { Queue, Worker } from 'bullmq';
import type { SyncUserEmailsJob, ReminderCheckJob, RescanEmailsJob } from '@jecrc/queue';

import { processEmailSync } from './processors/email-sync.js';
import { processReminderCheck } from './processors/reminder-check.js';
import { processEmailRescan } from './processors/email-rescan.js';

const config = getConfig();
const logger = createLogger(config.LOG_LEVEL);
const prisma = getPrismaClient();

// Check dependencies
await Promise.all([checkPostgresConnection(), checkRedisConnection(config.REDIS_URL)]);
logger.info('Worker dependencies are ready');

const redisConnection = parseRedisConnection(config.REDIS_URL);


// Create BullMQ worker for email sync
const emailSyncWorker = new Worker<SyncUserEmailsJob>(
  QueueNames.EMAIL_SYNC,
  async (job) => {
    return processEmailSync(job, prisma, config);
  },
  {
    connection: redisConnection,
    concurrency: 5, // Process up to 5 jobs concurrently
  },
);

emailSyncWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Job completed');
});

emailSyncWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err }, 'Job failed');
});

// Create BullMQ worker for reminder checks (escalating reminders)
const reminderCheckWorker = new Worker<ReminderCheckJob>(
  QueueNames.REMINDER_CHECK,
  async (job) => {
    return processReminderCheck(job, prisma, config);
  },
  {
    connection: redisConnection,
    concurrency: 1, // Only one reminder check at a time
  },
);

reminderCheckWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Reminder check completed');
});

reminderCheckWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err }, 'Reminder check failed');
});

// Create BullMQ worker for email re-scoring (custom keyword rule changes)
const emailRescanWorker = new Worker<RescanEmailsJob>(
  QueueNames.EMAIL_RESCAN,
  async (job) => {
    return processEmailRescan(job, prisma, config);
  },
  {
    connection: redisConnection,
    concurrency: 2,
  },
);

emailRescanWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Email rescan completed');
});

emailRescanWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err }, 'Email rescan failed');
});

// Set up repeatable cron for reminder checks (every 1 minute for testing)
const reminderQueue = new Queue<ReminderCheckJob>(QueueNames.REMINDER_CHECK, {
  connection: redisConnection,
});

await reminderQueue.add(
  'reminder-cron',
  { triggeredBy: 'cron' },
  {
    repeat: { pattern: '* * * * *' }, // Every 1 minute for testing
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 20 },
  },
);
logger.info('Reminder check cron scheduled (every 1 minute for testing)');

logger.info('Worker is running and waiting for jobs...');

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Worker is shutting down');
  await emailSyncWorker.close();
  await reminderCheckWorker.close();
  await reminderQueue.close();
  await emailRescanWorker.close();
  await Promise.all([disconnectPostgres(), disconnectRedis()]);
  process.exit();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
