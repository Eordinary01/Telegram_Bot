import type { PrismaClient, User, GmailToken } from '@jecrc/database';
import type { AppConfig } from '@jecrc/config';
import { getLogger } from '@jecrc/observability';

import { encrypt, decrypt, type EncryptedData } from './encryption.js';
import {
  createOAuth2Client,
  exchangeCodeForTokens,
  refreshAccessToken,
  getUserInfo,
} from './google-oauth.js';

const logger = getLogger('user-service');

export interface AuthenticatedUser {
  user: User;
  accessToken: string;
}

/**
 * Creates or updates a user after successful OAuth flow.
 * Stores encrypted refresh token in the database.
 */
export async function createOrUpdateUserFromOAuth(
  prisma: PrismaClient,
  config: AppConfig,
  authorizationCode: string,
): Promise<AuthenticatedUser> {
  const oauth2Client = createOAuth2Client(config);

  // Exchange code for tokens
  const tokenResult = await exchangeCodeForTokens(oauth2Client, authorizationCode);

  if (!tokenResult.refreshToken) {
    throw new Error(
      'No refresh token received. User may need to revoke access and re-authenticate.',
    );
  }

  // Get user info from Google
  const userInfo = await getUserInfo(tokenResult.accessToken);

  // Validate user account domain against ALLOWED_SENDER_DOMAIN
  if (config.ALLOWED_SENDER_DOMAIN && config.ALLOWED_SENDER_DOMAIN.trim() !== '*') {
    const allowedList = config.ALLOWED_SENDER_DOMAIN
      .split(',')
      .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
      .filter((d) => d.length > 0);

    if (allowedList.length > 0) {
      const emailLower = userInfo.email.toLowerCase();
      const isAllowed = allowedList.some((domain) => emailLower.endsWith(`@${domain}`));
      if (!isAllowed) {
        logger.warn(
          { email: userInfo.email, allowedDomains: allowedList },
          'Google OAuth login rejected: user email domain not allowed',
        );
        const formattedDomains = allowedList.map((d) => `@${d}`).join(', ');
        throw new Error(
          `DOMAIN_RESTRICTED:Access Restricted: Only authorized email accounts (${formattedDomains}) are permitted to sign in for now.`,
        );
      }
    }
  }


  // Encrypt refresh token
  const encryptedData = encrypt(tokenResult.refreshToken, config.ENCRYPTION_KEY);

  // Upsert user and token in transaction
  const user = await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email: userInfo.email },
    });

    const upsertedUser = await tx.user.upsert({
      where: { email: userInfo.email },
      create: {
        email: userInfo.email,
        name: userInfo.name,
      },
      update: {
        name: userInfo.name,
      },
    });

    // Delete existing token if any (we only keep one per user)
    if (existingUser) {
      await tx.gmailToken.deleteMany({
        where: { userId: upsertedUser.id },
      });
    }

    // Create new token
    await tx.gmailToken.create({
      data: {
        userId: upsertedUser.id,
        encryptedRefreshToken: encryptedData.encrypted,
        encryptionIv: encryptedData.iv,
        encryptionAuthTag: encryptedData.authTag,
        scope: tokenResult.scope,
        expiresAt: tokenResult.expiresAt,
      },
    });

    return upsertedUser;
  });

  logger.info({ userId: user.id, email: user.email }, 'User authenticated successfully');

  return {
    user,
    accessToken: tokenResult.accessToken,
  };
}

/**
 * Retrieves a fresh access token for a user, refreshing if necessary.
 */
export async function getAccessTokenForUser(
  prisma: PrismaClient,
  config: AppConfig,
  userId: string,
): Promise<string> {
  const tokenRecord = await prisma.gmailToken.findUnique({
    where: { userId },
  });

  if (!tokenRecord) {
    throw new Error(`No Gmail token found for user ${userId}`);
  }

  // Decrypt refresh token
  const encryptedData: EncryptedData = {
    encrypted: tokenRecord.encryptedRefreshToken,
    iv: tokenRecord.encryptionIv,
    authTag: tokenRecord.encryptionAuthTag,
  };

  const refreshToken = decrypt(encryptedData, config.ENCRYPTION_KEY);

  // Refresh the access token
  const oauth2Client = createOAuth2Client(config);
  const { accessToken, expiresAt } = await refreshAccessToken(oauth2Client, refreshToken);

  // Update expiry in database
  await prisma.gmailToken.update({
    where: { userId },
    data: { expiresAt },
  });

  return accessToken;
}

/**
 * Retrieves a user by ID with their Gmail token.
 */
export async function getUserWithToken(
  prisma: PrismaClient,
  userId: string,
): Promise<(User & { gmailTokens: GmailToken[] }) | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    include: { gmailTokens: true },
  });
}

/**
 * Deletes a user and all associated data (cascade delete handles tokens).
 */
export async function deleteUser(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.user.delete({
    where: { id: userId },
  });

  logger.info({ userId }, 'User deleted');
}
