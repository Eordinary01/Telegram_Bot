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


// Shared worker options — blockingConnection uses BRPOPLPUSH instead of polling,
// cutting idle Redis commands from ~1.5M/month to near zero.
const workerOpts = {
  connection: redisConnection,
  blockingConnection: true,
  stalledInterval: 600_000, // Check stalled every 10 min (was 2 min) — saves ~18K cmds/day
};

// Create BullMQ worker for email sync
const emailSyncWorker = new Worker<SyncUserEmailsJob>(
  QueueNames.EMAIL_SYNC,
  async (job) => {
    return processEmailSync(job, prisma, config);
  },
  { ...workerOpts, concurrency: 5 },
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
  { ...workerOpts, concurrency: 1 },
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
  { ...workerOpts, concurrency: 2 },
);

emailRescanWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'Email rescan completed');
});

emailRescanWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err }, 'Email rescan failed');
});

// Set up repeatable cron for reminder checks (every 30 minutes — production interval)
const reminderQueue = new Queue<ReminderCheckJob>(QueueNames.REMINDER_CHECK, {
  connection: redisConnection,
});

// Remove any stale repeatable jobs from previous deploys (e.g. old 1-min cron)
const existingJobs = await reminderQueue.getJobSchedulers();
for (const scheduler of existingJobs) {
  await reminderQueue.removeJobScheduler(scheduler.key);
  logger.info({ key: scheduler.key }, 'Removed stale reminder scheduler');
}

await reminderQueue.add(
  'reminder-cron',
  { triggeredBy: 'cron' },
  {
    repeat: { pattern: '*/60 * * * *' }, // Every 60 minutes (production)
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 20 },
  },
);
logger.info('Reminder check cron scheduled (every 60 minutes)');

// Queue instance to enqueue periodic auto email sync jobs
const emailSyncQueue = new Queue<SyncUserEmailsJob>(QueueNames.EMAIL_SYNC, {
  connection: redisConnection,
});

// Periodic automatic background email sync (runs every 2 minutes)
async function triggerAutoEmailSync(): Promise<void> {
  try {
    // Only enqueue users who have at least 1 active rule — skip users with 0 rules
    const usersWithTokens = await prisma.user.findMany({
      where: {
        gmailTokens: { some: {} },
        OR: [
          { senderRules: { some: { isActive: true } } },
          { keywordRules: { some: { isActive: true } } },
        ],
      },
      select: { id: true },
    });

    for (const user of usersWithTokens) {
      await emailSyncQueue.add(
        `auto-sync-${user.id}`,
        { userId: user.id, triggerSource: 'cron' },
        {
          jobId: `auto-sync-${user.id}-${Math.floor(Date.now() / (30 * 60 * 1000))}`,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    }
    logger.debug({ userCount: usersWithTokens.length }, 'Triggered background auto email sync');
  } catch (error) {
    logger.error({ error }, 'Failed to trigger background auto email sync');
  }
}

// Run auto-sync once immediately on worker start, then every 30 minutes
void triggerAutoEmailSync();
const autoSyncInterval = setInterval(() => {
  void triggerAutoEmailSync();
}, 30 * 60 * 1000); // Every 30 minutes
logger.info('Periodic background email sync scheduled (every 30 minutes)');

logger.info('Worker is running and waiting for jobs...');

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Worker is shutting down');
  clearInterval(autoSyncInterval);
  await emailSyncWorker.close();
  await reminderCheckWorker.close();
  await reminderQueue.close();
  await emailSyncQueue.close();
  await emailRescanWorker.close();
  await Promise.all([disconnectPostgres(), disconnectRedis()]);
  process.exit();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
