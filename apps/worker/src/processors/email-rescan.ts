import type { Job } from 'bullmq';
import type { PrismaClient } from '@jecrc/database';
import type { AppConfig } from '@jecrc/config';
import { getLogger } from '@jecrc/observability';
import {
  scoreEmail,
  loadSenderRules,
  loadKeywordRules,
  extractDeadline,
} from '@jecrc/scoring';
import { getAccessTokenForUser, createOAuth2Client } from '@jecrc/auth';
import { fetchMessage, storeMessage } from '@jecrc/gmail';
import type { RescanEmailsJob } from '@jecrc/queue';

const logger = getLogger('email-rescan-processor');

const BATCH_SIZE = 10;

interface RescanResult {
  total: number;
  scored: number;
  updated: number;
}

/**
 * Process items in batches with a concurrency limit.
 */
async function processBatch<T>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(fn));
  }
}

/**
 * Re-scores all of a user's existing emails using the latest rule set, and
 * backfills full body text + deadlines for emails that predate body storage.
 * Triggered when the user adds/changes their custom priority rules.
 *
 * Emails that were not previously in the allowed domain remain excluded from
 * re-scoring; they are not re-scored because the domain gate only applies to
 * newly ingested messages at sync time.
 */
export async function processEmailRescan(
  job: Job<RescanEmailsJob>,
  prisma: PrismaClient,
  config: AppConfig,
): Promise<RescanResult> {
  const { userId } = job.data;

  logger.info({ userId, jobId: job.id }, 'Processing email re-score');

  const emails = await prisma.email.findMany({
    where: { userId },
    select: {
      id: true,
      messageId: true,
      from: true,
      subject: true,
      snippet: true,
      bodyText: true,
      senderDomain: true,
    },
  });

  logger.info({ userId, emailCount: emails.length }, 'Fetched emails to re-score');

  const [preloadedSenderRules, preloadedKeywordRules] = await Promise.all([
    loadSenderRules(prisma, userId),
    loadKeywordRules(prisma, userId),
  ]);

  // Backfill full body text for emails stored before body extraction existed
  const emailsNeedingBody = emails.filter((e) => !e.bodyText);
  if (emailsNeedingBody.length > 0) {
    let accessToken: string | null = null;
    let oauth2Client: ReturnType<typeof createOAuth2Client> | null = null;
    try {
      accessToken = await getAccessTokenForUser(prisma, config, userId);
      oauth2Client = createOAuth2Client(config);
      oauth2Client.setCredentials({ access_token: accessToken });
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get Gmail access token for body backfill');
    }

    if (oauth2Client) {
      let backfilled = 0;
      await processBatch(emailsNeedingBody, BATCH_SIZE, async (email) => {
        try {
          const message = await fetchMessage(oauth2Client, email.messageId);
          await storeMessage(prisma, userId, message);
          email.bodyText = message.bodyText;
          backfilled++;
        } catch (error) {
          logger.error({ error, emailId: email.id, userId }, 'Failed to backfill email body');
        }
      });
      logger.info({ userId, backfilled, total: emailsNeedingBody.length }, 'Body backfill completed');
    }
  }

  let updated = 0;

  await processBatch(emails, BATCH_SIZE, async (email) => {
    try {
      const deadline = extractDeadline(email.subject, email.snippet, email.bodyText ?? null);

      if (email.senderDomain) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { allowedDomains: true },
        });
        const effectiveAllowedDomain: string | null =
          user?.allowedDomains && user.allowedDomains.trim().length > 0
            ? user.allowedDomains
            : config.ALLOWED_SENDER_DOMAIN || null;

        const scoringResult = await scoreEmail(
          prisma,
          userId,
          email.from,
          email.subject,
          email.snippet,
          effectiveAllowedDomain,
          preloadedSenderRules,
          preloadedKeywordRules,
        );

        await prisma.email.update({
          where: { id: email.id },
          data: {
            senderDomain: scoringResult.senderDomain,
            priorityScore: scoringResult.priorityScore,
            priorityLabel: scoringResult.priorityLabel,
            priorityReasons: scoringResult.priorityReasons,
            deadlineAt: deadline.date,
            deadlineText: deadline.deadlineText,
          },
        });
        updated++;
      } else {
        // Still extract + persist deadline for non-gated emails (e.g. NPTEL notices)
        if (deadline.date || deadline.deadlineText) {
          await prisma.email.update({
            where: { id: email.id },
            data: {
              deadlineAt: deadline.date,
              deadlineText: deadline.deadlineText,
            },
          });
          updated++;
        }
      }
    } catch (error) {
      logger.error({ error, emailId: email.id, userId }, 'Failed to re-score email');
    }
  });

  logger.info({ userId, total: emails.length, updated }, 'Email re-score completed');

  return { total: emails.length, scored: emails.length, updated };
}
