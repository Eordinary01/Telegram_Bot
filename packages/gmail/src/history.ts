import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { PrismaClient } from '@jecrc/database';
import { getLogger } from '@jecrc/observability';

const logger = getLogger('gmail-history');

export interface GmailMessage {
  messageId: string;
  threadId: string;
  historyId: string;
  from: string;
  subject: string;
  snippet: string;
  bodyText: string;
  receivedAt: Date;
  isUnread: boolean;
  labels: string[];
}

/**
 * Helper to execute an async operation with exponential backoff on 429/5xx errors.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelayMs = 500,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      const status = error?.code || error?.status || error?.response?.status;
      const isRetryable =
        status === 429 || (typeof status === 'number' && status >= 500 && status < 600);

      if (!isRetryable || attempt > maxRetries) {
        throw error;
      }

      const delay = initialDelayMs * Math.pow(2, attempt - 1) + Math.random() * 100;
      logger.warn(
        { attempt, status, delayMs: Math.round(delay) },
        'Retrying Gmail API call after rate limit or server error',
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Fetches Gmail history changes since the last sync.
 * Returns list of new message IDs.
 */
export async function fetchHistoryChanges(
  oauth2Client: OAuth2Client,
  startHistoryId: string,
): Promise<string[]> {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  try {
    const response = await withRetry(() =>
      gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded'],
        labelId: 'INBOX',
      }),
    );

    if (!response.data.history) {
      return [];
    }

    const messageIds: string[] = [];

    for (const historyItem of response.data.history) {
      if (historyItem.messagesAdded) {
        for (const messageAdded of historyItem.messagesAdded) {
          if (messageAdded.message?.id) {
            messageIds.push(messageAdded.message.id);
          }
        }
      }
    }

    logger.info({ count: messageIds.length, startHistoryId }, 'Fetched history changes');

    return messageIds;
  } catch (error: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    if ((error as any)?.code === 404) {
      logger.warn({ startHistoryId }, 'History ID not found, full sync needed');
      throw new Error('HISTORY_ID_TOO_OLD');
    }
    throw error;
  }
}

/**
 * Fetches recent message IDs from user's inbox (fallback for manual sync).
 */
export async function fetchRecentMessages(
  oauth2Client: OAuth2Client,
  maxResults = 10,
): Promise<string[]> {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  try {
    const response = await withRetry(() =>
      gmail.users.messages.list({
        userId: 'me',
        maxResults,
        q: 'in:inbox',
      }),
    );

    if (!response.data.messages) {
      return [];
    }

    return response.data.messages.map((m) => m.id!).filter(Boolean);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch recent messages');
    return [];
  }
}

/**
 * Recursively extracts plain-text content from a Gmail message payload.
 * Prefers text/plain over text/html; falls back to stripping HTML tags.
 */
export function extractBodyText(payload: GmailMessagePart | undefined): string {
  if (!payload) return '';

  const data = payload.body?.data;
  if (data && payload.mimeType === 'text/plain') {
    try {
      return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    } catch {
      // Fall through to parts
    }
  }

  if (Array.isArray(payload.parts) && payload.parts.length > 0) {
    // For multipart/alternative, prefer the plain-text part if present
    const isAlternative = payload.mimeType === 'multipart/alternative';
    const candidates = isAlternative
      ? [...payload.parts].sort((a, b) => {
          const rank = (m: string | null | undefined) =>
            m === 'text/plain' ? 0 : m === 'text/html' ? 1 : 2;
          return rank(a.mimeType) - rank(b.mimeType);
        })
      : payload.parts;

    const results: string[] = [];
    for (const part of candidates) {
      const text = extractBodyText(part);
      if (text) {
        results.push(text);
        if (isAlternative) break;
      }
    }
    if (results.length > 0) return results.join('\n\n');
  }

  // Fallback: strip HTML if the body is HTML-encoded
  if (data && payload.mimeType === 'text/html') {
    try {
      const decoded = Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
        'utf-8',
      );
      return decoded
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s{2,}/g, ' ')
        .trim();
    } catch {
      return '';
    }
  }

  return '';
}

export interface GmailMessagePart {
  mimeType?: string | null;
  body?: { data?: string | null };
  parts?: GmailMessagePart[];
}

/**
 * Fetches full message details for a given message ID.
 */
export async function fetchMessage(
  oauth2Client: OAuth2Client,
  messageId: string,
): Promise<GmailMessage> {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const response = await withRetry(() =>
    gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    }),
  );

  const message = response.data;

  if (!message.id || !message.threadId || !message.historyId) {
    throw new Error('Incomplete message data received from Gmail API');
  }

  // Extract headers
  const headers = message.payload?.headers || [];
  const from = headers.find((h) => h.name === 'From')?.value || 'unknown';
  const subject = headers.find((h) => h.name === 'Subject')?.value || '(no subject)';
  const dateHeader = headers.find((h) => h.name === 'Date')?.value;

  const receivedAt = dateHeader ? new Date(dateHeader) : new Date();
  const isUnread = message.labelIds?.includes('UNREAD') || false;
  const labels = message.labelIds || [];
  const bodyText = extractBodyText(message.payload);

  return {
    messageId: message.id,
    threadId: message.threadId,
    historyId: message.historyId,
    from,
    subject,
    snippet: message.snippet || '',
    bodyText,
    receivedAt,
    isUnread,
    labels,
  };
}

/**
 * Stores a Gmail message in the database.
 */
export async function storeMessage(
  prisma: PrismaClient,
  userId: string,
  message: GmailMessage,
): Promise<void> {
  await prisma.email.upsert({
    where: {
      userId_messageId: {
        userId,
        messageId: message.messageId,
      },
    },
    create: {
      userId,
      messageId: message.messageId,
      threadId: message.threadId,
      historyId: message.historyId,
      from: message.from,
      subject: message.subject,
      snippet: message.snippet,
      bodyText: message.bodyText,
      receivedAt: message.receivedAt,
      isUnread: message.isUnread,
      labels: message.labels,
    },
    update: {
      isUnread: message.isUnread,
      labels: message.labels,
      subject: message.subject,
      snippet: message.snippet,
      bodyText: message.bodyText,
    },
  });

  logger.debug({ messageId: message.messageId, from: message.from }, 'Message stored');
}

/**
 * Updates sync state after successful sync.
 */
export async function updateSyncState(
  prisma: PrismaClient,
  userId: string,
  latestHistoryId: string,
): Promise<void> {
  await prisma.syncState.update({
    where: { userId },
    data: {
      lastHistoryId: latestHistoryId,
      lastSyncAt: new Date(),
    },
  });

  logger.info({ userId, latestHistoryId }, 'Sync state updated');
}
