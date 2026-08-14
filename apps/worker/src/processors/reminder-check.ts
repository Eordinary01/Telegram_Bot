import type { Job } from 'bullmq';
import type { PrismaClient } from '@jecrc/database';
import type { AppConfig } from '@jecrc/config';
import { getLogger } from '@jecrc/observability';
import { pushReminder } from '@jecrc/telegram';
import type { ReminderCheckJob } from '@jecrc/queue';

const logger = getLogger('reminder-check-processor');

/**
 * Escalation intervals (Production):
 * - reminderCount 0 → first reminder after 2 hours
 * - reminderCount 1 → second reminder after 4 hours
 * - reminderCount 2 → final reminder after 18 hours
 */
const ESCALATION_INTERVALS_MS: Record<number, number> = {
  0: 2 * 60 * 60 * 1000,    // 2 hours
  1: 4 * 60 * 60 * 1000,    // 4 hours
  2: 18 * 60 * 60 * 1000,   // 18 hours
};

const MAX_REMINDERS = 3;

interface ReminderCheckResult {
  checked: number;
  reminded: number;
  skippedSnoozed: number;
}

/**
 * Processes reminder checks: finds all notified-but-unacknowledged emails
 * and sends escalating reminders based on timing thresholds.
 *
 * Runs as a repeatable BullMQ job every 60 minutes.
 */
export async function processReminderCheck(
  job: Job<ReminderCheckJob>,
  prisma: PrismaClient,
  config: AppConfig,
): Promise<ReminderCheckResult> {
  const { triggeredBy } = job.data;
  logger.info({ triggeredBy, jobId: job.id }, 'Processing reminder check');

  const now = new Date();
  let reminded = 0;
  let skippedSnoozed = 0;

  try {
    // Find all emails that:
    // 1. Have been notified (notifiedAt is set)
    // 2. Haven't been acknowledged
    // 3. Are HIGH or MEDIUM priority
    // 4. Haven't exceeded max reminders
    const candidateEmails = await prisma.email.findMany({
      where: {
        notifiedAt: { not: null },
        acknowledgedAt: null,
        reminderCount: { lt: MAX_REMINDERS },
        priorityLabel: { in: ['HIGH', 'high', 'MEDIUM', 'medium'] },
      },
      orderBy: { receivedAt: 'desc' },
    });

    logger.info(
      { candidateCount: candidateEmails.length },
      'Found candidate emails for reminders',
    );

    for (const email of candidateEmails) {
      // Skip if snoozed and snooze hasn't expired
      if (email.snoozedUntil && email.snoozedUntil > now) {
        skippedSnoozed++;
        continue;
      }

      // Clear expired snooze
      if (email.snoozedUntil && email.snoozedUntil <= now) {
        await prisma.email.update({
          where: { id: email.id },
          data: { snoozedUntil: null },
        });
      }

      // Check if enough time has passed since last notification
      const intervalMs = ESCALATION_INTERVALS_MS[email.reminderCount] ?? ESCALATION_INTERVALS_MS[2]!;
      const notifiedAt = email.notifiedAt!;
      const timeSinceNotification = now.getTime() - notifiedAt.getTime();

      if (timeSinceNotification < intervalMs) {
        // Not enough time has passed for this escalation level
        continue;
      }

      // Send the reminder
      try {
        const sent = await pushReminder(
          prisma,
          config.TELEGRAM_BOT_TOKEN,
          email.userId,
          {
            from: email.from,
            subject: email.subject,
            snippet: email.snippet,
            messageId: email.messageId,
            priorityScore: email.priorityScore,
            priorityLabel: email.priorityLabel ?? 'HIGH',
            receivedAt: email.receivedAt,
            reminderCount: email.reminderCount,
          },
        );

        if (sent) {
          reminded++;
          logger.info(
            {
              emailId: email.id,
              messageId: email.messageId,
              reminderNumber: email.reminderCount + 1,
              userId: email.userId,
            },
            'Escalating reminder sent successfully',
          );
        }
      } catch (error) {
        logger.error(
          { error, emailId: email.id, messageId: email.messageId },
          'Failed to send reminder for email',
        );
      }
    }

    logger.info(
      { checked: candidateEmails.length, reminded, skippedSnoozed },
      'Reminder check completed',
    );

    return {
      checked: candidateEmails.length,
      reminded,
      skippedSnoozed,
    };
  } catch (error) {
    logger.error({ error }, 'Reminder check failed');
    throw error;
  }
}
