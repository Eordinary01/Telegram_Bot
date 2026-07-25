import type { PrismaClient } from '@jecrc/database';
import { getLogger } from '@jecrc/observability';
import { validateAndLink } from './linking.js';

import type { Context } from 'telegraf';

const logger = getLogger('telegram-bot');

/**
 * Creates and configures a Telegram bot with the /start command
 * for linking Telegram accounts to email accounts.
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

    // Expect format: /start <CODE>
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

    // Validate and link
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
          `_Need help? Send /help_`,
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
        '`/start <CODE>` — Link your Gmail account using a code from the dashboard\n' +
        '`/help` — Show this help message\n' +
        '`/status` — Check your connection status\n',
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

  // Handle any other messages
  bot.on('text', async (ctx: Context) => {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';

    // Ignore commands
    if (text.startsWith('/')) return;

    await ctx.reply(
      '👋 Welcome! Use `/start <CODE>` to link your JECRC Mail account, or `/help` for more info.',
      { parse_mode: 'Markdown' },
    );
  });

  logger.info('Telegram bot commands configured');
}

/**
 * Starts the Telegram bot with long-polling.
 * Returns the bot instance so it can be stopped later.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function startBot(bot: any): Promise<void> {
  try {
    // Use launch() with polling mode
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
