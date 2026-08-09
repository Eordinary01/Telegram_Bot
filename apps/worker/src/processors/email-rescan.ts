import type { Job } from 'bullmq';
import type { PrismaClient } from '@jecrc/database';
import type { AppConfig } from '@jecrc/config';
import { getLogger } from '@jecrc/observability';
import { scoreEmail, loadSenderRules, loadKeywordRules } from '@jecrc/scoring';
import type { RescanEmailsJob } from '@jecrc/queue';

const logger = getLogger('email-rescan-processor');

interface RescanResult {
  total: number;
  scored: number;
  updated: number;
}

/**
 * Re-scores all of a user's existing emails using the latest rule set.
 * Triggered when the user adds/changes their custom priority rules.
 *
 * Emails that were not previously in the allowed domain remain excluded;
 * they are not re-scored because the domain gate only applies to newly
 * ingested messages at sync time.
 */
export async function processEmailRescan(
  job: Job<RescanEmailsJob>,
  prisma: PrismaClient,
  config: AppConfig,
): Promise<RescanResult> {
  const { userId } = job.data;

  logger.info({ userId, jobId: job.id }, 'Processing email re-score');

  const emails = await prisma.email.findMany({
    where: { userId, senderDomain: { not: null } },
    select: { id: true, from: true, subject: true, snippet: true, senderDomain: true },
  });

  logger.info({ userId, emailCount: emails.length }, 'Fetched emails to re-score');

  const [preloadedSenderRules, preloadedKeywordRules] = await Promise.all([
    loadSenderRules(prisma, userId),
    loadKeywordRules(prisma, userId),
  ]);

  let updated = 0;

  for (const email of emails) {
    try {
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
        },
      });
      updated++;
    } catch (error) {
      logger.error({ error, emailId: email.id, userId }, 'Failed to re-score email');
      continue;
    }
  }

  logger.info({ userId, total: emails.length, updated }, 'Email re-score completed');

  return { total: emails.length, scored: emails.length, updated };
}
