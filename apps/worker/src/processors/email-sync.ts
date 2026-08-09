import type { Job } from 'bullmq';
import type { PrismaClient } from '@jecrc/database';
import type { AppConfig } from '@jecrc/config';
import { getLogger } from '@jecrc/observability';
import { getAccessTokenForUser, createOAuth2Client } from '@jecrc/auth';
import {
  fetchHistoryChanges,
  fetchRecentMessages,
  fetchMessage,
  storeMessage,
  updateSyncState,
} from '@jecrc/gmail';
import {
  scoreEmail,
  loadSenderRules,
  loadKeywordRules,
} from '@jecrc/scoring';
import { pushScoredEmail } from '@jecrc/telegram';
import type { SyncUserEmailsJob } from '@jecrc/queue';

const logger = getLogger('email-sync-processor');

interface EmailSyncResult {
  synced: number;
  scored: number;
  filtered: number;
}

export async function processEmailSync(
  job: Job<SyncUserEmailsJob>,
  prisma: PrismaClient,
  config: AppConfig,
): Promise<EmailSyncResult> {
  const { userId, triggerSource } = job.data;

  logger.info({ userId, triggerSource, jobId: job.id }, 'Processing email sync');

  try {
    // Get user and sync state
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        syncState: true,
        gmailTokens: true,
      },
    });

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    if (user.gmailTokens.length === 0) {
      throw new Error(`User ${userId} has no Gmail token`);
    }

    if (!user.syncState) {
      throw new Error(`User ${userId} has no sync state - watch not registered`);
    }

    // Get fresh access token
    const accessToken = await getAccessTokenForUser(prisma, config, userId);

    // Create OAuth client
    const oauth2Client = createOAuth2Client(config);
    oauth2Client.setCredentials({ access_token: accessToken });

    // Fetch history changes or fallback to recent messages
    let messageIds: string[] = [];
    try {
      messageIds = await fetchHistoryChanges(oauth2Client, user.syncState.lastHistoryId);
    } catch {
      logger.warn({ userId }, 'History sync failed or expired, falling back to recent inbox messages');
    }

    if (messageIds.length === 0) {
      logger.info({ userId }, 'No history delta found, fetching recent inbox messages');
      messageIds = await fetchRecentMessages(oauth2Client, 10);
    }

    logger.info({ userId, messageCount: messageIds.length }, 'Fetched messages to process');

    if (messageIds.length === 0) {
      return { synced: 0, scored: 0, filtered: 0 };
    }

    // Pre-load scoring rules once for this batch to avoid per-email DB queries
    const [preloadedSenderRules, preloadedKeywordRules] = await Promise.all([
      loadSenderRules(prisma, userId),
      loadKeywordRules(prisma, userId),
    ]);

    // Fetch and process each message
    let syncedCount = 0;
    let scoredCount = 0;
    let filteredCount = 0;
    let latestHistoryId = user.syncState.lastHistoryId;

    for (const messageId of messageIds) {
      try {
        const message = await fetchMessage(oauth2Client, messageId);

        // Update latest historyId
        if (message.historyId > latestHistoryId) {
          latestHistoryId = message.historyId;
        }

        // Step 1: Store the raw message in DB
        await storeMessage(prisma, userId, message);
        syncedCount++;

        // Step 2: Apply domain filter and priority scoring (using pre-loaded rules)
        const scoringResult = await scoreEmail(
          prisma,
          userId,
          message.from,
          message.subject,
          message.snippet,
          config.ALLOWED_SENDER_DOMAIN,
          preloadedSenderRules,
          preloadedKeywordRules,
        );

        // Step 3: Update the email record with scoring results
        await prisma.email.update({
          where: {
            userId_messageId: {
              userId,
              messageId: message.messageId,
            },
          },
          data: {
            senderDomain: scoringResult.senderDomain,
            priorityScore: scoringResult.priorityScore,
            priorityLabel: scoringResult.priorityLabel,
            priorityReasons: scoringResult.priorityReasons,
          },
        });

        scoredCount++;

        // Push Telegram notification for scored emails (High/Medium priority)
        pushScoredEmail(
          prisma,
          config.TELEGRAM_BOT_TOKEN,
          userId,
          {
            from: message.from,
            subject: message.subject,
            snippet: message.snippet,
            messageId: message.messageId,
            priorityScore: scoringResult.priorityScore,
            priorityLabel: scoringResult.priorityLabel,
            priorityReasons: scoringResult.priorityReasons,
            receivedAt: message.receivedAt instanceof Date ? message.receivedAt : new Date(message.receivedAt),
          },
        ).catch((pushError) => {
          // Non-blocking: don't fail the sync if Telegram push fails
          logger.error(
            { error: pushError, messageId: message.messageId, userId },
            'Failed to push Telegram notification',
          );
        });

        logger.debug(
          {
            messageId: message.messageId,
            score: scoringResult.priorityScore,
            label: scoringResult.priorityLabel,
          },
          'Email scored',
        );

        // Update progress
        await job.updateProgress((syncedCount / messageIds.length) * 100);
      } catch (error) {
        logger.error({ error, messageId, userId }, 'Failed to process message');
        // Continue with next message
      }
    }

    // Update sync state
    await updateSyncState(prisma, userId, latestHistoryId);

    logger.info(
      { userId, syncedCount, scoredCount, filteredCount },
      'Email sync completed',
    );

    return { synced: syncedCount, scored: scoredCount, filtered: filteredCount };
  } catch (error) {
    logger.error({ error, userId }, 'Email sync failed');
    throw error;
  }
}
