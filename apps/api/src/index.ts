import dns from 'node:dns';
import https from 'node:https';
import { Telegraf } from 'telegraf';
import { getConfig } from '@jecrc/config';
import { checkPostgresConnection, disconnectPostgres, getPrismaClient } from '@jecrc/database';
import { createLogger } from '@jecrc/observability';
import { checkRedisConnection, disconnectRedis, QueueNames, parseRedisConnection } from '@jecrc/queue';
import { Queue } from 'bullmq';
import type { SyncUserEmailsJob, RescanEmailsJob } from '@jecrc/queue';
import { configureBot, startBot, stopBot } from '@jecrc/telegram';

import { createApp } from './app.js';

// Force IPv4 first to prevent Windows IPv6 DNS connection timeouts to api.telegram.org
dns.setDefaultResultOrder('ipv4first');

const config = getConfig();
const logger = createLogger(config.LOG_LEVEL);
const prisma = getPrismaClient();

const redisConnection = parseRedisConnection(config.REDIS_URL);

// Create BullMQ queue for email sync
const emailSyncQueue = new Queue<SyncUserEmailsJob>(QueueNames.EMAIL_SYNC, {
  connection: redisConnection,
});

// Create BullMQ queue for re-scoring existing emails after rule changes
const emailRescanQueue = new Queue<RescanEmailsJob>(QueueNames.EMAIL_RESCAN, {
  connection: redisConnection,
});


const app = createApp({
  prisma,
  config,
  checkPostgres: checkPostgresConnection,
  checkRedis: () => checkRedisConnection(config.REDIS_URL),
  webOrigin: config.WEB_ORIGIN,
  emailSyncQueue,
  emailRescanQueue,
});

// --- Telegram Bot Setup ---
let telegrafBot: Telegraf | undefined;

async function startTelegramBot(): Promise<void> {
  if (!config.TELEGRAM_BOT_TOKEN) {
    logger.warn('TELEGRAM_BOT_TOKEN not configured - Telegram bot not started');
    return;
  }

  try {
    // Configure HTTPS agent with family: 4 to force IPv4 connection
    const agent = new https.Agent({ family: 4, keepAlive: true });
    const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN, {
      telegram: { agent },
    });
    telegrafBot = bot;

    configureBot(bot, prisma);
    await startBot(bot);
  } catch (error) {
    logger.warn({ error }, 'Telegram bot failed to start - continuing without bot');
    telegrafBot = undefined;
  }
}

// Start the bot (non-blocking)
void startTelegramBot();

// --- Embedded Worker Setup (allows running API + Worker in 1 Free Web Service) ---
// Lazy-load worker after API server starts accepting connections
if (process.env['ENABLE_EMBEDDED_WORKER'] !== 'false') {
  server.on('listening', () => {
    void (async () => {
      try {
        logger.info('Initializing embedded BullMQ queue worker...');
        await import('../../worker/src/index.js');
      } catch (workerErr) {
        const errDetails = workerErr instanceof Error ? { message: workerErr.message, stack: workerErr.stack } : { err: String(workerErr) };
        logger.warn({ error: errDetails }, 'Failed to initialize embedded worker');
      }
    })();
  });
}


// --- Express Server ---


const server = app.listen(config.API_PORT, config.API_HOST, () => {
  logger.info({ host: config.API_HOST, port: config.API_PORT }, 'API server is listening');
});

// --- Self-Keep-Alive pinger (prevents Render free-tier spin-down) ---
const publicUrl =
  process.env['RENDER_EXTERNAL_URL'] ||
  process.env['SELF_PING_URL'] ||
  process.env['PUBLIC_API_URL'];

let keepAliveTimer: NodeJS.Timeout | undefined;

if (publicUrl) {
  const healthUrl = `${publicUrl.replace(/\/+$/, '')}/health/live`;
  logger.info({ healthUrl }, 'Self keep-alive pinger activated (runs every 10 mins)');

  keepAliveTimer = setInterval(() => {
    fetch(healthUrl)
      .then((res) => {
        logger.debug({ status: res.status }, 'Self keep-alive ping successful');
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ error: msg, healthUrl }, 'Self keep-alive ping failed');
      });
  }, 10 * 60 * 1000); // Ping every 10 minutes
}

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, 'API server is shutting down');

  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
  }

  server.close(async (error) => {
    try {
      // Stop Telegram bot if running
      if (telegrafBot) {
        await stopBot(telegrafBot);
      }

      await Promise.all([
        disconnectPostgres(),
        disconnectRedis(),
        emailSyncQueue.close(),
        emailRescanQueue.close(),
      ]);
      if (error) {
        logger.error({ err: error }, 'API server shutdown failed');
        process.exitCode = 1;
      }
    } finally {
      process.exit();
    }
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
