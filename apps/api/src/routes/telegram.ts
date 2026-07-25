import { Router } from 'express';
import type { Request, Response } from 'express';
import type { PrismaClient } from '@jecrc/database';
import type { AppConfig } from '@jecrc/config';
import { getLogger } from '@jecrc/observability';
import { generateLinkingCode, getTelegramLink, removeTelegramLink } from '@jecrc/telegram';

const logger = getLogger('telegram-routes');

interface TelegramDependencies {
  prisma: PrismaClient;
  config: AppConfig;
}

export function createTelegramRouter(dependencies: TelegramDependencies): Router {
  const router = Router();
  const { prisma } = dependencies;

  /**
   * POST /telegram/link
   * Generates a one-time linking code for a user to connect their Telegram account.
   * Body: { userId: string }
   * Response: { code: string, expiresAt: string } or { error: string }
   */
  router.post('/link', async (req: Request, res: Response) => {
    try {
      const { userId } = req.body as { userId?: string };

      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'Invalid or missing userId' });
      }

      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const result = await generateLinkingCode(prisma, userId);

      if (!result) {
        return res.status(409).json({
          error: 'Telegram account already linked',
          message: 'This user already has a linked Telegram account. Unlink first to generate a new code.',
        });
      }

      logger.info({ userId }, 'Telegram linking code generated via API');

      res.status(200).json({
        code: result.code,
        expiresAt: result.expiresAt.toISOString(),
        instructions:
          'Open Telegram, find the JECRC Mail Bot, and send: /start ' + result.code,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to generate linking code');
      res.status(500).json({ error: 'Failed to generate linking code' });
    }
  });

  /**
   * GET /telegram/link/:userId
   * Gets the current linking status for a user.
   */
  router.get('/link/:userId', async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;

      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'Invalid userId' });
      }

      const link = await getTelegramLink(prisma, userId);

      if (link) {
        return res.status(200).json({
          linked: true,
          chatId: link.chatId,
        });
      }

      // Check if there's an active (unused) linking code
      const pendingLink = await prisma.telegramLink.findUnique({
        where: { userId },
        select: { linkingCode: true, linkingCodeExpiresAt: true },
      });

      if (pendingLink?.linkingCode && pendingLink.linkingCodeExpiresAt) {
        const isExpired = pendingLink.linkingCodeExpiresAt < new Date();
        return res.status(200).json({
          linked: false,
          pendingCode: !isExpired,
          expiresAt: pendingLink.linkingCodeExpiresAt.toISOString(),
        });
      }

      res.status(200).json({
        linked: false,
        pendingCode: false,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get linking status');
      res.status(500).json({ error: 'Failed to get linking status' });
    }
  });

  /**
   * DELETE /telegram/link/:userId
   * Unlinks Telegram from a user account.
   */
  router.delete('/link/:userId', async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;

      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'Invalid userId' });
      }

      await removeTelegramLink(prisma, userId);

      logger.info({ userId }, 'Telegram link removed via API');

      res.status(200).json({ message: 'Telegram unlinked successfully' });
    } catch (error) {
      logger.error({ error }, 'Failed to unlink Telegram');
      res.status(500).json({ error: 'Failed to unlink Telegram' });
    }
  });

  return router;
}
