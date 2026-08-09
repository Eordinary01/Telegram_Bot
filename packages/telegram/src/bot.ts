import type { PrismaClient } from '@jecrc/database';
import { getLogger } from '@jecrc/observability';
import { extractDeadline } from '@jecrc/scoring';
import { validateAndLink } from './linking.js';

import type { Context } from 'telegraf';

const logger = getLogger('telegram-bot');

/**
 * Creates and configures a Telegram bot with commands:
 * - /start <code> : Link Telegram account
 * - /help         : Help instructions
 * - /status       : Link status
 * - /recent       : Top recent emails
 * - /deadlines    : Extracted email deadlines
 * - /digest       : Daily email digest summary
 * - callback_query: Handles inline actions like "mark_read:<messageId>"
 *
 * @param bot - Telegraf bot instance
 * @param prisma - Prisma client for DB access
 */
export function configureBot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bot: any,
  prisma: PrismaClient,
): void {
  // /start <code> - Link Telegram account to email account
  bot.command('start', async (ctx: Context) => {
    const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const chatId = ctx.chat?.id;

    if (!chatId) {
      logger.warn('No chat ID in /start command');
      return;
    }

    const parts = messageText.split(/\s+/);
    const code = parts[1];

    if (!code) {
      await ctx.reply(
        '👋 *Welcome to JECRC Mail Priority!*\n\n' +
          'To link your Gmail account, please use the linking code from the JECRC Mail dashboard.\n\n' +
          'Send: `/start YOUR_CODE`\n\n' +
          '_Example: `/start ABC123XYZ`_',
        { parse_mode: 'Markdown' },
      );
      return;
    }

    logger.info({ chatId, code: code.substring(0, 3) + '…' }, 'Linking code received');

    try {
      const result = await validateAndLink(prisma, code, chatId);

      if (!result) {
        await ctx.reply(
          '❌ *Invalid or expired linking code.*\n\n' +
            'Please generate a new code from the JECRC Mail dashboard and try again.\n\n' +
            'Make sure to use the code within 15 minutes.',
          { parse_mode: 'Markdown' },
        );
        return;
      }

      const displayName = result.name || result.email;

      await ctx.reply(
        `✅ *Telegram Linked Successfully!*\n\n` +
          `Welcome, *${displayName}*!\n\n` +
          `Your JECRC Mail account is now linked to Telegram.\n` +
          `You'll receive real-time notifications for important emails.\n\n` +
          `_Commands available: /recent, /deadlines, /digest, /help_`,
        { parse_mode: 'Markdown' },
      );

      logger.info({ chatId, userId: result.userId }, 'Telegram link completed via bot');
    } catch (error) {
      logger.error({ error, chatId }, 'Error processing linking code');
      await ctx.reply(
        '❌ *Something went wrong.*\n\nPlease try again or contact support.',
        { parse_mode: 'Markdown' },
      );
    }
  });

  // /help command
  bot.command('help', async (ctx: Context) => {
    await ctx.reply(
      '🤖 *JECRC Mail Bot Commands*\n\n' +
        '`/start <CODE>` — Link your Gmail account using a code from dashboard\n' +
        '`/recent` — View your top 5 recent high-priority emails\n' +
        '`/deadlines` — List upcoming exam & submission deadlines\n' +
        '`/digest` — Get an instant summary digest of recent mail\n' +
        '`/status` — Check your connection status\n' +
        '`/help` — Show this help message\n',
      { parse_mode: 'Markdown' },
    );
  });

  // /status command
  bot.command('status', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    try {
      const link = await prisma.telegramLink.findUnique({
        where: { chatId: String(chatId) },
        include: { user: { select: { email: true } } },
      });

      if (link) {
        await ctx.reply(
          `✅ *Connected*\n\n📧 Email: \`${link.user.email}\`\n💬 Chat ID: \`${link.chatId}\`\n\n` +
            `You're all set to receive email notifications!`,
          { parse_mode: 'Markdown' },
        );
      } else {
        await ctx.reply(
          '❌ *Not connected*\n\n' +
            'Your Telegram is not linked to any JECRC Mail account.\n' +
            'Please visit the JECRC Mail dashboard to get a linking code.',
          { parse_mode: 'Markdown' },
        );
      }
    } catch (error) {
      logger.error({ error, chatId }, 'Error checking status');
      await ctx.reply('❌ *Error checking status.* Please try again.');
    }
  });

  // /recent command — fetch top 5 recent emails
  bot.command('recent', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    try {
      const link = await prisma.telegramLink.findUnique({
        where: { chatId: String(chatId) },
      });

      if (!link) {
        await ctx.reply('❌ Please link your account first using `/start <CODE>`.', { parse_mode: 'Markdown' });
        return;
      }

      const recentEmails = await prisma.email.findMany({
        where: { userId: link.userId },
        orderBy: { receivedAt: 'desc' },
        take: 5,
      });

      if (recentEmails.length === 0) {
        await ctx.reply('📭 No emails synced yet.');
        return;
      }

      const lines = recentEmails.map((e, idx) => {
        const icon = e.priorityLabel === 'high' ? '🔴' : e.priorityLabel === 'medium' ? '🟡' : '⚪';
        const dateStr = e.receivedAt.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
        const fromName = e.from.split('<')[0] ?? e.from;
        return `${idx + 1}. ${icon} <b>${escapeHtml(e.subject)}</b>\n   👤 <i>${escapeHtml(fromName)}</i> • ${dateStr}`;
      });

      await ctx.reply(
        `📬 <b>Your Recent JECRC Emails:</b>\n━━━━━━━━━━━━━━━━━━━━━━\n${lines.join('\n\n')}`,
        { parse_mode: 'HTML' },
      );
    } catch (error) {
      logger.error({ error, chatId }, 'Error fetching recent emails');
      await ctx.reply('❌ Error fetching recent emails.');
    }
  });

  // /deadlines command — list upcoming extracted deadlines
  bot.command('deadlines', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    try {
      const link = await prisma.telegramLink.findUnique({
        where: { chatId: String(chatId) },
      });

      if (!link) {
        await ctx.reply('❌ Please link your account first using `/start <CODE>`.', { parse_mode: 'Markdown' });
        return;
      }

      const emails = await prisma.email.findMany({
        where: { userId: link.userId },
        orderBy: { receivedAt: 'desc' },
        take: 30,
      });

      const deadlineList = emails
        .map((e) => {
          const dl = extractDeadline(e.subject, e.snippet);
          return dl.deadlineText ? { subject: e.subject, deadline: dl.deadlineText, calUrl: dl.googleCalendarUrl } : null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (deadlineList.length === 0) {
        await ctx.reply('🎉 No upcoming deadlines detected in your recent emails!');
        return;
      }

      const lines = deadlineList.slice(0, 5).map((item, idx) => {
        const calLink = item.calUrl ? ` • <a href="${item.calUrl}">[Add to Cal]</a>` : '';
        return `${idx + 1}. ⏰ <b>${escapeHtml(item.subject)}</b>\n   🗓️ <u>${escapeHtml(item.deadline)}</u>${calLink}`;
      });

      await ctx.reply(
        `⏰ <b>Upcoming Extracted Deadlines:</b>\n━━━━━━━━━━━━━━━━━━━━━━\n${lines.join('\n\n')}`,
        { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
      );
    } catch (error) {
      logger.error({ error, chatId }, 'Error fetching deadlines');
      await ctx.reply('❌ Error fetching deadlines.');
    }
  });

  // /digest command — generate summary digest
  bot.command('digest', async (ctx: Context) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    try {
      const link = await prisma.telegramLink.findUnique({
        where: { chatId: String(chatId) },
      });

      if (!link) {
        await ctx.reply('❌ Please link your account first using `/start <CODE>`.', { parse_mode: 'Markdown' });
        return;
      }

      const highPriority = await prisma.email.findMany({
        where: { userId: link.userId, priorityLabel: 'high' },
        orderBy: { receivedAt: 'desc' },
        take: 5,
      });

      const unreadCount = await prisma.email.count({
        where: { userId: link.userId, isUnread: true },
      });

      const lines = highPriority.map((e) => `• 🔴 <b>${escapeHtml(e.subject)}</b>`);

      const digestMessage = [
        `📊 <b>JECRC Mail Summary Digest</b>`,
        `━━━━━━━━━━━━━━━━━━━━━━`,
        `📫 <b>Unread Emails:</b> ${unreadCount}`,
        `🔴 <b>High Priority Items:</b> ${highPriority.length}`,
        ``,
        lines.length > 0 ? `<b>Top Urgent Notices:</b>\n${lines.join('\n')}` : `<i>No high priority alerts currently.</i>`,
        ``,
        `💡 <i>Tip: Use /recent or /deadlines for detailed lists.</i>`,
      ].join('\n');

      await ctx.reply(digestMessage, { parse_mode: 'HTML' });
    } catch (error) {
      logger.error({ error, chatId }, 'Error generating digest');
      await ctx.reply('❌ Error generating digest.');
    }
  });

  // Handle Telegram callback queries (inline button actions)
  // Supports: acknowledge:<messageId>, snooze_menu:<messageId>,
  //           snooze:<messageId>:<duration>, dismiss:<messageId>,
  //           mark_read:<messageId> (legacy)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bot.on('callback_query', async (ctx: any) => {
    const data: string = ctx.callbackQuery?.data ?? '';

    // ✅ Acknowledge — stop all reminders
    if (data.startsWith('acknowledge:')) {
      const messageId = data.replace('acknowledge:', '');
      try {
        await prisma.email.updateMany({
          where: { messageId },
          data: { acknowledgedAt: new Date(), isUnread: false },
        });
        await ctx.answerCbQuery('✅ Email acknowledged!');
        if (ctx.callbackQuery.message?.text) {
          const originalText = ctx.callbackQuery.message.text;
          await ctx.editMessageText(
            `${originalText}\n\n✅ <i>Acknowledged — no more reminders</i>`,
            { parse_mode: 'HTML' },
          ).catch(() => {});
        }
      } catch (error) {
        logger.error({ error, messageId }, 'Error acknowledging email');
        await ctx.answerCbQuery('❌ Failed to acknowledge');
      }
      return;
    }

    // ⏰ Snooze menu — show snooze duration options
    if (data.startsWith('snooze_menu:')) {
      const messageId = data.replace('snooze_menu:', '');
      try {
        await ctx.answerCbQuery('Choose snooze duration:');
        await ctx.reply(
          `⏰ <b>Snooze Reminders</b>\n\nHow long would you like to snooze this email?`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🕐 1 Hour', callback_data: `snooze:${messageId}:1h` },
                  { text: '🕒 3 Hours', callback_data: `snooze:${messageId}:3h` },
                  { text: '🌅 Tomorrow 9 AM', callback_data: `snooze:${messageId}:tomorrow` },
                ],
              ],
            },
          },
        );
      } catch (error) {
        logger.error({ error, messageId }, 'Error showing snooze menu');
        await ctx.answerCbQuery('❌ Failed to show snooze options');
      }
      return;
    }

    // ⏰ Snooze — set snoozedUntil based on duration
    if (data.startsWith('snooze:')) {
      const parts = data.split(':');
      const messageId = parts[1] ?? '';
      const duration = parts[2] ?? '1h';

      try {
        let snoozedUntil: Date;
        let displayLabel: string;

        if (duration === '3h') {
          snoozedUntil = new Date(Date.now() + 3 * 60 * 60 * 1000);
          displayLabel = '3 hours';
        } else if (duration === 'tomorrow') {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(9, 0, 0, 0);
          snoozedUntil = tomorrow;
          displayLabel = 'tomorrow at 9 AM';
        } else {
          snoozedUntil = new Date(Date.now() + 1 * 60 * 60 * 1000);
          displayLabel = '1 hour';
        }

        await prisma.email.updateMany({
          where: { messageId },
          data: { snoozedUntil },
        });

        await ctx.answerCbQuery(`⏰ Snoozed for ${displayLabel}`);

        // Update the snooze menu message
        if (ctx.callbackQuery.message) {
          await ctx.editMessageText(
            `⏰ <b>Snoozed</b>\n\nReminders paused until <b>${displayLabel}</b>.`,
            { parse_mode: 'HTML' },
          ).catch(() => {});
        }
      } catch (error) {
        logger.error({ error, messageId }, 'Error snoozing email');
        await ctx.answerCbQuery('❌ Failed to snooze');
      }
      return;
    }

    // 🚫 Dismiss / Not Interested — stop all reminders for this email
    if (data.startsWith('dismiss:') || data.startsWith('not_interested:')) {
      const messageId = data.replace(/^(dismiss|not_interested):/, '');
      try {
        await prisma.email.updateMany({
          where: { messageId },
          data: { acknowledgedAt: new Date(), isUnread: false },
        });
        await ctx.answerCbQuery('🚫 Marked as Not Interested');
        if (ctx.callbackQuery.message?.text) {
          const originalText = ctx.callbackQuery.message.text;
          await ctx.editMessageText(
            `${originalText}\n\n🚫 <i>Marked as Not Interested — reminders turned off</i>`,
            { parse_mode: 'HTML' },
          ).catch(() => {});
        }
      } catch (error) {
        logger.error({ error, messageId }, 'Error marking email as not interested');
        await ctx.answerCbQuery('❌ Failed to update status');
      }
      return;
    }


    // 👁️ Mark as Read (legacy backward compatibility)
    if (data.startsWith('mark_read:')) {
      const messageId = data.replace('mark_read:', '');

      try {
        await prisma.email.updateMany({
          where: { messageId },
          data: { isUnread: false },
        });

        await ctx.answerCbQuery('✅ Email marked as read!');

        // Update inline text if text message
        if (ctx.callbackQuery.message?.text) {
          const originalText = ctx.callbackQuery.message.text;
          await ctx.editMessageText(`${originalText}\n\n✅ <i>Marked as read</i>`, {
            parse_mode: 'HTML',
          }).catch(() => {}); // Ignore edit errors if message too old
        }
      } catch (error) {
        logger.error({ error, messageId }, 'Error marking email as read via callback');
        await ctx.answerCbQuery('❌ Failed to mark email as read');
      }
    }
  });

  // Handle any other text messages
  bot.on('text', async (ctx: Context) => {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';

    if (text.startsWith('/')) return;

    await ctx.reply(
      '👋 Welcome! Use `/start <CODE>` to link your JECRC Mail account, or `/help` for commands.',
      { parse_mode: 'Markdown' },
    );
  });

  logger.info('Telegram bot commands configured');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Starts the Telegram bot with long-polling.
 * Registers the command menu so users see suggestions when typing "/".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function startBot(bot: any): Promise<void> {
  try {
    // Register command menu with Telegram (shown when user types "/")
    await bot.telegram.setMyCommands([
      { command: 'recent', description: '📬 View your top 5 recent emails' },
      { command: 'deadlines', description: '⏰ List upcoming exam & submission deadlines' },
      { command: 'digest', description: '📊 Get an instant summary digest' },
      { command: 'status', description: '🔗 Check your connection status' },
      { command: 'help', description: '❓ Show all available commands' },
    ]);
    logger.info('Telegram bot command menu registered');

    await bot.launch();
    logger.info('Telegram bot started (long-polling)');
  } catch (error) {
    logger.error({ error }, 'Failed to start Telegram bot');
    throw error;
  }
}

/**
 * Gracefully stops the Telegram bot.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function stopBot(bot: any): Promise<void> {
  try {
    bot.stop();
    logger.info('Telegram bot stopped');
  } catch (error) {
    logger.error({ error }, 'Error stopping Telegram bot');
  }
}
