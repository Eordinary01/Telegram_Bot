import https from 'node:https';
import type { PrismaClient } from '@jecrc/database';
import { getLogger } from '@jecrc/observability';
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
}): string {
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

  const message = [
    `📧 <b>New Email from JECRC</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 <b>From:</b> ${cleanFrom}`,
    `📌 <b>Subject:</b> ${cleanSubject}`,
    `🏷️ <b>Priority:</b> ${priorityBadge}`,
    `🕐 <b>Time:</b> ${time} IST`,
    reasons,
    ``,
    cleanSnippet ? `💬 <i>${cleanSnippet}${cleanSnippet.length >= 300 ? '…' : ''}</i>` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return message.substring(0, 4096);
}



/**
 * Sends a Telegram message to a specific chat.
 * Uses node:https with family: 4 to force IPv4 and prevent Windows IPv6 DNS timeouts.
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string | number,
  text: string,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const postData = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
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

  const formattedMessage = formatEmailMessage(email);

  const sent = await sendTelegramMessage(botToken, link.chatId, formattedMessage);

  if (sent) {
    logger.info(
      { userId, messageId: email.messageId, priority: email.priorityLabel },
      'Telegram notification sent',
    );
  }

  return sent;
}
