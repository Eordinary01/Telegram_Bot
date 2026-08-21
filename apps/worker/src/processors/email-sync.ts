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
import { scoreEmail, loadSenderRules, loadKeywordRules, extractDeadline } from '@jecrc/scoring';
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

    // Determine the domain gate for this user:
    //   - If user has allowedDomains set and non-empty, use that (personal restriction)
    //   - Otherwise fall back to system-level ALLOWED_SENDER_DOMAIN (community default)
    const effectiveAllowedDomain: string | null =
      user.allowedDomains && user.allowedDomains.trim().length > 0
        ? user.allowedDomains
        : config.ALLOWED_SENDER_DOMAIN || null;

    let syncState = user.syncState;
    if (!syncState) {
      syncState = await prisma.syncState.upsert({
        where: { userId },
        create: { userId, lastHistoryId: '0', lastSyncAt: new Date() },
        update: {},
      });
    }

    // Check if system default rules or user custom rules are available
    const [keywordsCount, sendersCount] = await Promise.all([
      prisma.keywordRule.count({ where: { isActive: true, OR: [{ userId: null }, { userId }] } }),
      prisma.senderRule.count({ where: { isActive: true, OR: [{ userId: null }, { userId }] } }),
    ]);

    const totalRulesCount = keywordsCount + sendersCount;
    if (totalRulesCount < 1) {
      logger.warn(
        { userId, totalRulesCount },
        'No priority rules configured. Skipping email sync.',
      );
      return { synced: 0, scored: 0, filtered: 0 };
    }

    // Get fresh access token
    const accessToken = await getAccessTokenForUser(prisma, config, userId);

    // Create OAuth client
    const oauth2Client = createOAuth2Client(config);
    oauth2Client.setCredentials({ access_token: accessToken });

    // Fetch history changes or fallback to recent messages
    let messageIds: string[] = [];
    try {
      messageIds = await fetchHistoryChanges(oauth2Client, syncState.lastHistoryId);
    } catch {
      logger.warn(
        { userId },
        'History sync failed or expired, falling back to recent inbox messages',
      );
    }

    if (messageIds.length === 0) {
      logger.info({ userId }, 'No history delta found, fetching recent inbox messages');
      messageIds = await fetchRecentMessages(oauth2Client, 10);
    }

    logger.info({ userId, messageCount: messageIds.length }, 'Fetched messages to process');

    if (messageIds.length === 0) {
      return { synced: 0, scored: 0, filtered: 0 };
    }

    // Batch-fetch existing emails to avoid N+1 per-message DB lookups
    const existingEmails = await prisma.email.findMany({
      where: { userId, messageId: { in: messageIds } },
      select: { messageId: true, priorityLabel: true },
    });
    const existingMap = new Map(existingEmails.map((e) => [e.messageId, e]));

    // Pre-load scoring rules once for this batch to avoid per-email DB queries
    const [preloadedSenderRules, preloadedKeywordRules, userDomainGate] = await Promise.all([
      loadSenderRules(prisma, userId),
      loadKeywordRules(prisma, userId),
      (async () => {
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { allowedDomains: true } });
        // User's personal allowed domains, or null (no restriction) if unset.
        // Falls back to system default (config.ALLOWED_SENDER_DOMAIN) only when user has no personal override.
        if (u?.allowedDomains && u.allowedDomains.trim() !== '') {
          return u.allowedDomains;
        }
        return config.ALLOWED_SENDER_DOMAIN || null;
      })(),
    ]);

    // Fetch and process each message
    let syncedCount = 0;
    let scoredCount = 0;
    let filteredCount = 0;
    let skippedCount = 0;
    let latestHistoryId = syncState.lastHistoryId;

    for (const messageId of messageIds) {
      try {
        // Skip messages that are already stored and scored — re-scoring produces the same result
        const existing = existingMap.get(messageId);
        if (existing) {
          skippedCount++;
          continue;
        }

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
          effectiveAllowedDomain,
          preloadedSenderRules,
          preloadedKeywordRules,
        );

        // Step 2.5: Extract deadline from subject + snippet + full body text
        const deadline = extractDeadline(message.subject, message.snippet, message.bodyText);

        // Step 3: Update the email record with scoring + deadline results
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
            deadlineAt: deadline.date,
            deadlineText: deadline.deadlineText,
          },
        });

        scoredCount++;

        // Push Telegram notification for scored emails (High/Medium priority)
        pushScoredEmail(prisma, config.TELEGRAM_BOT_TOKEN, userId, {
          from: message.from,
          subject: message.subject,
          snippet: message.snippet,
          bodyText: message.bodyText,
          messageId: message.messageId,
          priorityScore: scoringResult.priorityScore,
          priorityLabel: scoringResult.priorityLabel,
          priorityReasons: scoringResult.priorityReasons,
          receivedAt:
            message.receivedAt instanceof Date ? message.receivedAt : new Date(message.receivedAt),
        }).catch((pushError) => {
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

    logger.info({ userId, syncedCount, scoredCount, filteredCount, skippedCount }, 'Email sync completed');

    return { synced: syncedCount, scored: scoredCount, filtered: filteredCount };
  } catch (error) {
    logger.error({ error, userId }, 'Email sync failed');
    throw error;
  }
}
