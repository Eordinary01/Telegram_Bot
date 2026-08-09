import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@jecrc/database';
import { getLogger } from '@jecrc/observability';

const logger = getLogger('telegram-linking');

/** How long a linking code is valid (in milliseconds). */
const LINKING_CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Length of the generated linking code. */
const CODE_LENGTH = 8;

/**
 * Generates a cryptographically random alphanumeric code.
 */
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude similar chars (0/O, 1/I)
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += chars[bytes[i]! % chars.length];
  }
  return code;
}

/**
 * Generates a linking code for a user and stores it in the database.
 * If a TelegramLink record already exists with a chat_id (already linked),
 * returns null with a message.
 *
 * @returns The linking code and expiry timestamp, or null if already linked.
 */
export async function generateLinkingCode(
  prisma: PrismaClient,
  userId: string,
): Promise<{ code: string; expiresAt: Date } | null> {
  // Check if user already has a linked Telegram account
  const existing = await prisma.telegramLink.findUnique({
    where: { userId },
  });

  if (existing?.chatId) {
    logger.warn({ userId }, 'User already has a linked Telegram account');
    return null;
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + LINKING_CODE_TTL_MS);

  await prisma.telegramLink.upsert({
    where: { userId },
    create: {
      userId,
      chatId: null as any,
      linkingCode: code,
      linkingCodeExpiresAt: expiresAt,
    },
    update: {
      linkingCode: code,
      linkingCodeExpiresAt: expiresAt,
    },
  });

  logger.info({ userId, expiresAt }, 'Linking code generated');

  return { code, expiresAt };
}

/**
 * Validates a linking code sent by a Telegram user and links their chat_id.
 *
 * @param prisma - Prisma client
 * @param code - The linking code sent by the user
 * @param chatId - The Telegram chat_id to link
 * @returns The linked user's info, or null if the code is invalid/expired
 */
export async function validateAndLink(
  prisma: PrismaClient,
  code: string,
  chatId: string | number,
): Promise<{ userId: string; email: string; name: string | null } | null> {
  const normalizedCode = code.trim().toUpperCase();

  const link = await prisma.telegramLink.findFirst({
    where: { linkingCode: normalizedCode },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  if (!link) {
    logger.warn({ code: normalizedCode }, 'Invalid linking code - not found');
    return null;
  }

  // Check if code is expired
  if (link.linkingCodeExpiresAt && link.linkingCodeExpiresAt < new Date()) {
    logger.warn({ userId: link.userId }, 'Linking code expired');
    return null;
  }

  // Check if this chat_id is already linked to another user
  const existingChat = await prisma.telegramLink.findUnique({
    where: { chatId: String(chatId) },
  });

  if (existingChat && existingChat.userId !== link.userId) {
    // Auto-unlink the old user and re-link to the new one
    logger.info(
      { chatId: String(chatId), oldUserId: existingChat.userId, newUserId: link.userId },
      'Chat ID was linked to another user — auto-unlinking old user',
    );
    await prisma.telegramLink.delete({
      where: { id: existingChat.id },
    });
  }

  // Link the Telegram account
  await prisma.telegramLink.update({
    where: { id: link.id },
    data: {
      chatId: String(chatId),
      linkingCode: null,
      linkingCodeExpiresAt: null,
    },
  });

  logger.info({ userId: link.userId, chatId: String(chatId) }, 'Telegram account linked');

  return {
    userId: link.user.id,
    email: link.user.email,
    name: link.user.name,
  };
}

/**
 * Gets the Telegram link for a user.
 */
export async function getTelegramLink(
  prisma: PrismaClient,
  userId: string,
): Promise<{ chatId: string } | null> {
  const link = await prisma.telegramLink.findUnique({
    where: { userId },
    select: { chatId: true },
  });

  return link?.chatId ? { chatId: link.chatId } : null;
}

/**
 * Removes a Telegram link for a user (unlink).
 */
export async function removeTelegramLink(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  await prisma.telegramLink.deleteMany({
    where: { userId },
  });

  logger.info({ userId }, 'Telegram link removed');
}
