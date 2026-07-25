import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { PrismaClient } from '@jecrc/database';
import type { AppConfig } from '@jecrc/config';
import { getLogger } from '@jecrc/observability';

const logger = getLogger('gmail-watch');

const WATCH_EXPIRATION_DAYS = 7;

export interface WatchResponse {
  historyId: string;
  expiration: Date;
}

/**
 * Registers a Gmail watch for push notifications via Pub/Sub.
 * Watch expires after 7 days and must be renewed.
 * If no Pub/Sub topic is configured, skips watch registration.
 */
export async function registerWatch(
  oauth2Client: OAuth2Client,
  config: AppConfig,
): Promise<WatchResponse | null> {
  // Skip watch registration if Pub/Sub not configured
  if (!config.PUBSUB_TOPIC) {
    logger.info('Pub/Sub not configured, skipping watch registration');
    
    // Get current historyId for manual sync
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    
    if (!profile.data.historyId) {
      throw new Error('No historyId returned from Gmail profile');
    }
    
    return {
      historyId: profile.data.historyId,
      expiration: new Date(Date.now() + WATCH_EXPIRATION_DAYS * 24 * 60 * 60 * 1000),
    };
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const response = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: config.PUBSUB_TOPIC,
      labelIds: ['INBOX'], // Only watch inbox
    },
  });

  if (!response.data.historyId) {
    throw new Error('No historyId returned from Gmail watch registration');
  }

  if (!response.data.expiration) {
    throw new Error('No expiration returned from Gmail watch registration');
  }

  const expiration = new Date(parseInt(response.data.expiration, 10));

  logger.info(
    { historyId: response.data.historyId, expiration },
    'Gmail watch registered successfully',
  );

  return {
    historyId: response.data.historyId,
    expiration,
  };
}

/**
 * Stores watch registration in database.
 */
export async function storeWatchRegistration(
  prisma: PrismaClient,
  userId: string,
  watchData: WatchResponse | null,
): Promise<void> {
  if (!watchData) {
    logger.info({ userId }, 'Skipping watch registration storage (manual sync mode)');
    return;
  }

  await prisma.watchRegistration.upsert({
    where: { userId },
    create: {
      userId,
      historyId: watchData.historyId,
      expiration: watchData.expiration,
    },
    update: {
      historyId: watchData.historyId,
      expiration: watchData.expiration,
    },
  });

  // Also initialize sync state if it doesn't exist
  await prisma.syncState.upsert({
    where: { userId },
    create: {
      userId,
      lastHistoryId: watchData.historyId,
      lastSyncAt: new Date(),
    },
    update: {},
  });

  logger.info({ userId, expiration: watchData.expiration }, 'Watch registration stored');
}

/**
 * Stops a Gmail watch.
 */
export async function stopWatch(oauth2Client: OAuth2Client): Promise<void> {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  await gmail.users.stop({
    userId: 'me',
  });

  logger.info('Gmail watch stopped');
}

/**
 * Gets all watch registrations expiring within the next N hours.
 */
export async function getExpiringWatches(
  prisma: PrismaClient,
  hoursBeforeExpiry: number = 24,
): Promise<Array<{ userId: string; expiration: Date }>> {
  const expiryThreshold = new Date();
  expiryThreshold.setHours(expiryThreshold.getHours() + hoursBeforeExpiry);

  const watches = await prisma.watchRegistration.findMany({
    where: {
      expiration: {
        lte: expiryThreshold,
      },
    },
    select: {
      userId: true,
      expiration: true,
    },
  });

  return watches;
}
