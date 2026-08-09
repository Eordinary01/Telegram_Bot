import https from 'node:https';
import type { PrismaClient } from '@jecrc/database';
import { getLogger } from '@jecrc/observability';
import { extractDeadline } from '@jecrc/scoring';
import { getTelegramLink } from './linking.js';

const logger = getLogger('telegram-push');

const agent = new https.Agent({ family: 4, keepAlive: true });

/** Priority label to emoji mapping for richer notifications. */
const PRIORITY_EMOJI: Record<string, string> = {
  high: '🔴',
  medium: '🟡',
  low: '⚪',
};

/**
 * Formats a scored email into a Telegram-friendly message.
 * Max message length is 4096 characters (Telegram limit).
 */
export function formatEmailMessage(email: {
  from: string;
  subject: string;
  snippet: string | null;
  priorityScore: number;
  priorityLabel: string;
  priorityReasons: string[];
  receivedAt: Date;
  messageId: string;
}): { message: string; googleCalendarUrl: string | null } {
  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const cleanFrom = escapeHtml(email.from);
  const cleanSubject = escapeHtml(email.subject);
  const cleanSnippet = escapeHtml((email.snippet ?? '').substring(0, 300));

  const priorityEmoji = PRIORITY_EMOJI[email.priorityLabel.toLowerCase()] ?? '⚪';
  const priorityBadge = `${priorityEmoji} ${email.priorityLabel.toUpperCase()} (Score: ${email.priorityScore})`;

  const deadline = extractDeadline(email.subject, email.snippet);
  const deadlineBadge = deadline.deadlineText
    ? `⏰ <b>Deadline:</b> <u>${escapeHtml(deadline.deadlineText)}</u>`
    : '';

  const reasons =
    email.priorityReasons.length > 0
      ? `\n<b>📊 Reasons:</b>\n${email.priorityReasons.map((r) => `‣ ${escapeHtml(r)}`).join('\n')}`
      : '';

  const time = email.receivedAt.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  });

  const messageLines = [
    `📧 <b>New Email from JECRC</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 <b>From:</b> ${cleanFrom}`,
    `📌 <b>Subject:</b> ${cleanSubject}`,
    `🏷️ <b>Priority:</b> ${priorityBadge}`,
    deadlineBadge,
    `🕐 <b>Time:</b> ${time} IST`,
    reasons,
    ``,
    cleanSnippet ? `💬 <i>${cleanSnippet}${cleanSnippet.length >= 300 ? '…' : ''}</i>` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    message: messageLines.substring(0, 4096),
    googleCalendarUrl: deadline.googleCalendarUrl,
  };
}

/**
 * Sends a Telegram message to a specific chat with optional inline keyboard.
 * Uses node:https with family: 4 to force IPv4 and prevent Windows IPv6 DNS timeouts.
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string | number,
  text: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  replyMarkup?: any,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const postData = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });

    const options: https.RequestOptions = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      agent,
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          logger.error(
            { chatId, status: res.statusCode, body },
            'Failed to send Telegram message',
          );
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      logger.error({ error, chatId }, 'Error sending Telegram message');
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      logger.error({ chatId }, 'Timeout sending Telegram message');
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Pushes a scored email notification to a user's linked Telegram account.
 * Sets `notifiedAt` on the email record after a successful push.
 *
 * @returns true if notification was sent, false if user has no Telegram link or send failed
 */
export async function pushScoredEmail(
  prisma: PrismaClient,
  botToken: string,
  userId: string,
  email: {
    from: string;
    subject: string;
    snippet: string | null;
    messageId: string;
    priorityScore: number;
    priorityLabel: string;
    priorityReasons: string[];
    receivedAt: Date;
  },
): Promise<boolean> {
  // Check if user has a linked Telegram account
  const link = await getTelegramLink(prisma, userId);

  if (!link) {
    return false;
  }

  // Deduplication check: skip if email was already notified or acknowledged (e.g. during manual web sync)
  const existingEmail = await prisma.email.findUnique({
    where: {
      userId_messageId: {
        userId,
        messageId: email.messageId,
      },
    },
    select: { acknowledgedAt: true, notifiedAt: true },
  });

  if (existingEmail?.acknowledgedAt || existingEmail?.notifiedAt) {
    logger.info(
      { userId, messageId: email.messageId, acknowledged: Boolean(existingEmail.acknowledgedAt) },
      'Skipping Telegram notification: email already notified or acknowledged',
    );
    return false;
  }

  const { message: formattedMessage, googleCalendarUrl } = formatEmailMessage(email);

  // Build smart inline action buttons (2 rows)
  const inlineKeyboard = buildSmartButtons(email.messageId, googleCalendarUrl);

  const sent = await sendTelegramMessage(botToken, link.chatId, formattedMessage, {
    inline_keyboard: inlineKeyboard,
  });

  if (sent) {
    // Record that we notified the user about this email
    await prisma.email.updateMany({
      where: { messageId: email.messageId, userId },
      data: { notifiedAt: new Date() },
    }).catch((err) => {
      logger.warn({ error: err, messageId: email.messageId }, 'Failed to set notifiedAt');
    });

    logger.info(
      { userId, messageId: email.messageId, priority: email.priorityLabel },
      'Telegram notification sent with smart action buttons',
    );
  }

  return sent;
}

/**
 * Builds the smart inline keyboard layout for email notifications.
 *
 * Row 1: [✅ Acknowledge]  [⏰ Snooze ▾]
 * Row 2: [🚫 Not Interested]  [📅 Add to Cal] (if deadline exists)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSmartButtons(messageId: string, googleCalendarUrl: string | null): any[][] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row1: any[] = [
    { text: '✅ Acknowledge', callback_data: `acknowledge:${messageId}` },
    { text: '⏰ Snooze ▾', callback_data: `snooze_menu:${messageId}` },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row2: any[] = [
    { text: '🚫 Not Interested', callback_data: `dismiss:${messageId}` },
  ];

  if (googleCalendarUrl) {
    row2.push({ text: '📅 Add to Calendar', url: googleCalendarUrl });
  }

  return [row1, row2];
}


/**
 * Formats an escalating reminder message based on the reminder count.
 *
 * - Count 0→1: Gentle reminder
 * - Count 1→2: Urgent reminder
 * - Count 2→3: Final reminder
 */
export function formatReminderMessage(email: {
  from: string;
  subject: string;
  snippet: string | null;
  priorityScore: number;
  priorityLabel: string;
  receivedAt: Date;
  messageId: string;
  reminderCount: number;
}): string {
  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const cleanSubject = escapeHtml(email.subject);
  const cleanFrom = escapeHtml(email.from.split('<')[0]?.trim() ?? email.from);
  const priorityEmoji = PRIORITY_EMOJI[email.priorityLabel.toLowerCase()] ?? '⚪';

  const ageMs = Date.now() - email.receivedAt.getTime();
  const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
  const ageDays = Math.floor(ageHours / 24);
  const ageStr = ageDays > 0 ? `${ageDays}d ${ageHours % 24}h ago` : `${ageHours}h ago`;

  let header: string;
  let urgencyNote: string;

  if (email.reminderCount === 0) {
    header = '⚡ <b>Gentle Reminder</b>';
    urgencyNote = `You haven't reviewed this email yet.`;
  } else if (email.reminderCount === 1) {
    header = '🚨 <b>URGENT Reminder</b>';
    urgencyNote = `This ${email.priorityLabel.toUpperCase()} priority email is still waiting for your attention!`;
  } else {
    header = '⛔ <b>FINAL Reminder</b>';
    urgencyNote = `This is the last nudge — please take action now!`;
  }

  const lines = [
    header,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `📌 <b>Subject:</b> ${cleanSubject}`,
    `👤 <b>From:</b> ${cleanFrom}`,
    `🏷️ <b>Priority:</b> ${priorityEmoji} ${email.priorityLabel.toUpperCase()} (Score: ${email.priorityScore})`,
    `🕐 <b>Received:</b> ${ageStr}`,
    `🔔 <b>Reminder:</b> #${email.reminderCount + 1} of 3`,
    ``,
    `💬 <i>${urgencyNote}</i>`,
  ].join('\n');

  return lines.substring(0, 4096);
}

/**
 * Sends an escalating reminder for a specific email to the user's Telegram.
 *
 * @returns true if reminder was sent successfully
 */
export async function pushReminder(
  prisma: PrismaClient,
  botToken: string,
  userId: string,
  email: {
    from: string;
    subject: string;
    snippet: string | null;
    messageId: string;
    priorityScore: number;
    priorityLabel: string;
    receivedAt: Date;
    reminderCount: number;
  },
): Promise<boolean> {
  const link = await getTelegramLink(prisma, userId);

  if (!link) {
    return false;
  }

  const message = formatReminderMessage(email);
  const buttons = buildSmartButtons(email.messageId, null);

  const sent = await sendTelegramMessage(botToken, link.chatId, message, {
    inline_keyboard: buttons,
  });

  if (sent) {
    // Increment reminder count and update notifiedAt for next interval calculation
    await prisma.email.updateMany({
      where: { messageId: email.messageId, userId },
      data: {
        reminderCount: email.reminderCount + 1,
        notifiedAt: new Date(),
      },
    }).catch((err) => {
      logger.warn({ error: err, messageId: email.messageId }, 'Failed to update reminder count');
    });

    logger.info(
      { userId, messageId: email.messageId, reminderNumber: email.reminderCount + 1 },
      'Escalating reminder sent',
    );
  }

  return sent;
}

