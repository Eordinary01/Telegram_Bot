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

interface RescanResult {
  total: number;
  scored: number;
  updated: number;
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
  let accessToken: string | null = null;
  let oauth2Client: ReturnType<typeof createOAuth2Client> | null = null;
  for (const email of emails) {
    if (email.bodyText) continue;

    if (!oauth2Client) {
      try {
        accessToken = await getAccessTokenForUser(prisma, config, userId);
        oauth2Client = createOAuth2Client(config);
        oauth2Client.setCredentials({ access_token: accessToken });
      } catch (error) {
        logger.error({ error, userId }, 'Failed to get Gmail access token for body backfill');
        break;
      }
    }

    try {
      const message = await fetchMessage(oauth2Client, email.messageId);
      await storeMessage(prisma, userId, message);
      email.bodyText = message.bodyText;
    } catch (error) {
      logger.error({ error, emailId: email.id, userId }, 'Failed to backfill email body');
    }
  }

  let updated = 0;

  for (const email of emails) {
    try {
      const deadline = extractDeadline(email.subject, email.snippet, email.bodyText ?? null);

      if (email.senderDomain) {
        const scoringResult = await scoreEmail(
          prisma,
          userId,
          email.from,
          email.subject,
          email.snippet,
          config.ALLOWED_SENDER_DOMAIN,
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
      continue;
    }
  }

  logger.info({ userId, total: emails.length, updated }, 'Email re-score completed');

  return { total: emails.length, scored: emails.length, updated };
}
